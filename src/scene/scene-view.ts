import { Container, Sprite, Texture } from 'pixi.js';
import type { MultFile, MultObject } from '../mult/decoder';
import { buildRoute, correctPosition, depthAt, scaleAt, updateScroll, type Point, type Route } from '../navigation/router';
import { applyFrameDepthEvents, pixiDepthIndex, skipsImageFrameUpdate } from '../navigation/depth-sort';
import { AnimationPlayer } from '../animation/player';
import { SccRuntime } from '../scc/runtime';
import type { SceneDefinition } from './scene-definition';
import { normalizeExternalPath } from './scene-definition';
import { depthOriginLabel, setStateDepth, type DepthProvenance, type SceneState } from './scene-loader';
import type { SceneEntry } from './scene-entry';
import { cachedExternalTexture, resolvedTexture, type ExternalTexture } from './textures';
import { activeHitTest, worldPointFromScreen } from './active-hit';
import { applyObjectVisibility, assignImageReference } from './object-visibility';
import { firstHitTarget } from './object-hit';
import { findFrameTarget } from './mult-target';
import { multHitPixels } from '../mult/hit-pixels';
import { VIEWPORT_WIDTH } from '../config';
import { SccAudioRuntime, stepSyncRange, type FrameSoundEvent } from '../audio/scc-audio';
import type { BrowserAudioBackend } from '../audio/backend';

export { hitTest, type HitTarget } from './object-hit';

export type SceneObject = { name: string; sprite: Sprite; depth: number; width: number; height: number; hitPixels?: Uint8ClampedArray; removed: boolean; order: number };
export type UpdateSource = 'initialization' | 'SCC' | 'animation-update' | 'navigation-update';
type VisualStamp = { animationName: string; frame: number };
type ActiveRoute = Extract<Route, { status: 'route' }>;
type Movement = { route: ActiveRoute; remaining: number; first: boolean; lastTime: number; candidate: number; candidateCount: number };

export type SceneViewHooks = {
  /** SCC `Level` schedules a transition; the switch still happens at the game-loop boundary. */
  level(scene: number, portal: number): void;
  /** SCC `Lstate` writes long-lived state of another (possibly unvisited) scene. */
  lstate(scene: number, name: string, value: number): void;
  /** SCC `Setzon` stores its int in game-session state. */
  setZone(zone: number): void;
};

/**
 * One live visit of a scene: disposable Pixi resources plus a fresh SCC runtime and
 * animation clock. Long-lived data lives in SceneState and SceneDefinition.
 */
export class SceneView {
  readonly root = new Container();
  readonly world = new Container();
  readonly hero: Sprite;
  readonly backdrop: Sprite;
  readonly objects = new Map<string, SceneObject>();
  readonly player: AnimationPlayer;
  readonly scc: SccRuntime;
  readonly animationLog: string[] = [];
  heroPosition: Point;
  heroDirection: number;
  scrollX = 0;
  heroDepth = -1;
  private readonly visualStamps = new Map<string, VisualStamp>();
  /** Original `scene+5`: inventory item chosen for the next scene click (0 = none). */
  selectedItem = 0;
  /** MULT record names seen without an SCC/runtime object identity (0x405064 skips them). */
  private readonly skippedMultRecords = new Set<string>();
  /** External image paths without a prepared manifest entry. */
  private readonly missingExternalRecords = new Set<string>();
  private objectOrder = 0;
  private movement?: Movement;
  private heroIsObjectSpace = false;
  private tickNumber = 0;
  private readonly audio: SccAudioRuntime;
  private readonly latchedSounds = new Set<number>();
  private readonly soundEventsById = new Map<number, FrameSoundEvent>();
  private readonly activeBarriers = new Map<string, number>();

  constructor(
    readonly definition: SceneDefinition,
    readonly state: SceneState,
    background: Texture,
    hooks: SceneViewHooks,
    inventory: number[],
    audioBackend?: BrowserAudioBackend,
  ) {
    this.heroPosition = [0, 0];
    this.heroDirection = state.savedDirection;
    this.backdrop = new Sprite(background);
    this.backdrop.width = definition.mask.width;
    this.backdrop.height = definition.mask.height;
    this.root.addChild(this.backdrop);
    this.world.sortableChildren = true;
    this.root.addChild(this.world);
    this.hero = new Sprite(Texture.EMPTY);
    this.hero.anchor.set(0.5, 1);
    this.world.addChild(this.hero);
    this.player = new AnimationPlayer([...definition.animations.values()].map((animation) => ({
      name: animation.name,
      rate: animation.rate,
      frameCount: animation.file.frameCount,
      loop: animation.loop,
      locomotion: animation.locomotion,
    })));
    this.audio = new SccAudioRuntime(audioBackend, definition.audioResources, definition.id, !audioBackend, definition.audioDurations, definition.audioStorageModes);
    for (const event of definition.audioEvents) this.soundEventsById.set(event.id, event);
    this.scc = new SccRuntime(definition.scc, {
      pathActive: () => Boolean(this.movement && this.movement.remaining > 0),
      animationActive: (name) => this.player.isActive(name),
      startAnimation: (name) => this.startAnimation(name, 'SCC'),
      stopAnimation: (name) => this.stopAnimation(name),
      setPosition: (x, y) => this.setLogicalPosition(x, y),
      setDepth: (name, depth) => this.setObjectDepth(name, depth, { kind: 'objzet' }),
      setCursor: (name, id) => this.setObjectCursor(name, id),
      showObject: (name) => this.setObjectVisible(name, true),
      hideObject: (name) => this.setObjectVisible(name, false),
      setZone: (zone) => hooks.setZone(zone),
      goto: (x, y) => this.goto(x, y),
      goport: (portal) => this.goport(portal),
      level: (scene, portal) => hooks.level(scene, portal),
      lstate: (scene, name, value) => hooks.lstate(scene, name, value),
      readState: (name) => this.state.objects.get(name)?.state ?? 0,
      writeState: (name, value) => {
        const object = this.state.objects.get(name);
        if (object) object.state = value;
        else this.state.objects.set(name, {
          name, state: value, depth: 0, kind: 'Object',
          depthProvenance: { kind: 'default', detail: 'State-created object' },
        });
      },
    }, inventory);
    this.createLayoutObjects();
    this.applyStoredObjectVisuals();
  }

  private get mask() { return this.definition.mask; }
  private get focus() { return this.definition.focus; }
  private get layoutFile(): MultFile | undefined {
    const name = this.definition.layoutAnimation;
    return name ? this.definition.animations.get(name)?.file : undefined;
  }

  private objectDepth(name: string): number {
    return this.state.objects.get(name)?.depth ?? 0;
  }

  private external(texturePath: string): ExternalTexture | undefined {
    const url = this.definition.externalImages.get(normalizeExternalPath(texturePath));
    const cached = url ? cachedExternalTexture(url) : undefined;
    if (!cached) {
      // Optional resource: the original loader would not obtain this image, and
      // the remaining scene objects still render. Keep it visible in diagnostics.
      this.missingExternalRecords.add(texturePath);
      return undefined;
    }
    return cached;
  }

  private createLayoutObjects(): void {
    const file = this.layoutFile;
    if (!file) return;
    for (const record of this.definition.layout) {
      const stored = findFrameTarget(this.state.objects, record.name);
      if (!stored) {
        // Original 0x405064 -> 0x40a8dc: when a MULT record name has no object
        // identity in the scene list, no image is assigned and no sprite exists.
        // Such names must not fall back to depth 0 (which would draw them on top).
        this.skippedMultRecords.add(record.name);
        continue;
      }
      const resolved = file.resolve(record.slot, record.child);
      if (resolved.width === 0 || resolved.height === 0) continue;
      let texture: Texture, hitPixels: Uint8ClampedArray | undefined, width: number, height: number;
      if (resolved.externalPath) {
        const ext = this.external(resolved.externalPath);
        if (!ext) continue;
        texture = ext.texture; hitPixels = ext.hitPixels; width = ext.width; height = ext.height;
      } else if (resolved.bgra) {
        texture = resolvedTexture(file, 1, record, resolved); width = resolved.width; height = resolved.height;
      } else continue;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.x = this.mask.width / 2 + record.x;
      sprite.y = this.mask.height / 2 - record.y;
      // `Hide <Object>` empties the MULT name. The layout frame is our first image
      // event on entry, but a retained empty name must still suppress the draw.
      if (stored.imageHidden) sprite.visible = false;
      const depth = stored.depth;
      sprite.zIndex = pixiDepthIndex(depth);
      this.world.addChild(sprite);
      this.objects.set(record.name, { name: record.name, sprite, depth, width, height, hitPixels, removed: false, order: this.objectOrder++ });
    }
  }

  /** Reapplies the last MULT reference of every object that already existed in this scene. */
  private applyStoredObjectVisuals(): void {
    for (const stored of this.state.objects.values()) {
      const reference = stored.mult;
      if (!reference || stored.placeholder || stored.imageHidden) continue;
      const animation = this.definition.animations.get(reference.file);
      if (!animation) continue;
      const record = animation.file.frames[reference.frame - 1]?.find((item) => item.slot === reference.slot && item.child === reference.child);
      if (!record || record.name === 'Mainhero') continue;
      this.applyRecord(record, animation.file, reference.file, reference.frame, 'initialization');
    }
  }

  placeHero(entry: SceneEntry): void {
    this.heroPosition = [entry.position[0], entry.position[1]];
    this.heroDirection = entry.direction;
    this.scrollX = entry.scroll;
    this.root.x = -this.scrollX;
    this.heroIsObjectSpace = false;
    this.hero.anchor.set(0.5, 1);
    this.hero.x = this.heroPosition[0];
    this.hero.y = this.heroPosition[1];
    this.hero.scale.set(entry.scale);
  }

  /** Applies the entry pose (Stop<direction>) and re-applies the logical hero placement. */
  startPose(): void {
    this.startAnimation(`Stop${this.heroDirection}`, 'initialization');
    if (!this.heroIsObjectSpace) {
      this.hero.anchor.set(0.5, 1);
      this.hero.x = this.heroPosition[0];
      this.hero.y = this.heroPosition[1];
      this.hero.scale.set(this.scaleHere());
    }
  }

  private scaleHere(): number {
    return Math.max(0.01, scaleAt(this.mask, Math.round(this.heroPosition[0]), Math.round(this.heroPosition[1]), this.focus));
  }

  private setLogicalPosition(x: number, y: number): void {
    this.stopLocomotion('SCC');
    // 0x409708 checks/corrects the logical position (same 0x409874 ring search as
    // navigation targets) before recomputing scale and the hero sprite. `Setxy
    // 345 470` is not walkable itself and must land on the nearby walkable point.
    const corrected = x >= 0 ? correctPosition(this.mask, [x, y]) : undefined;
    const [px, py] = corrected ? corrected.point : [x, y];
    this.heroPosition = [px, py];
    // The loader reads the logical position written by Init `Setxy` before the
    // Portal/saved-position placement step runs.
    this.state.savedPosition = [px, py];
    this.heroIsObjectSpace = false;
    const name = `Stop${this.heroDirection}`;
    this.startAnimation(name, 'SCC');
    this.hero.anchor.set(0.5, 1);
    this.hero.x = px; this.hero.y = py;
    this.hero.scale.set(this.scaleHere());
    this.traceVisual('Mainhero', this.hero, name, this.player.state(name)?.frame ?? 1, 'SCC');
  }

  private goto(x: number, y: number): boolean {
    const route = buildRoute(this.mask, this.heroPosition, [x, y]);
    if (route.status !== 'route' || route.length === 0) {
      this.movement = undefined;
      this.stopLocomotion('SCC');
      return false;
    }
    this.movement = { route, remaining: route.length, first: true, lastTime: 0, candidate: this.heroDirection, candidateCount: 0 };
    this.startAnimation(`Walk${this.heroDirection}`, 'navigation-update');
    return true;
  }

  /** SCC `Goport`: walks to a portal of the current scene and reports whether a path exists. */
  goport(portalIndex: number): boolean {
    const portal = this.definition.portals[portalIndex];
    if (!portal) return false;
    return this.goto(portal.x, portal.y);
  }

  /** Loader step (7): a real SCC `Init` dispatch, only on the first entry. */
  dispatchInit(): boolean { return this.scc.dispatch('Init'); }
  /** Loader step (9): a real SCC `Start` dispatch that must not cancel a suspended Init. */
  dispatchStart(): boolean { return this.scc.dispatch('Start'); }

  private setObjectVisible(name: string, visible: boolean): void {
    const result = applyObjectVisibility(this.definition, this.state, name, visible);
    if (!result.found || !result.clearImage) return;
    if (name === 'Mainhero') { this.hero.visible = false; return; }
    const object = this.objects.get(name);
    if (object) { object.sprite.visible = false; object.removed = false; }
  }

  /** Current `+0x297` visibility of an `Active`/`Light` name (debug/tests). */
  activeVisible(name: string): boolean { return this.state.objects.get(name)?.visible ?? false; }

  /** Current sprite/raster state of a rendered Object, for diagnostics and E2E. */
  objectDebug(name: string): { sprite: 'missing' | 'visible' | 'removed' | 'hidden'; width: number; height: number; depth: number; x: number; y: number } | undefined {
    const object = this.objects.get(name);
    if (!object) return undefined;
    const sprite = object.removed ? 'removed' : object.sprite.visible ? 'visible' : 'hidden';
    return { sprite, width: object.width, height: object.height, depth: object.depth, x: object.sprite.x, y: object.sprite.y };
  }

  private traceVisual(objectName: string, sprite: Sprite | undefined, animationName: string, frame: number, source: UpdateSource): void {
    const previous = this.visualStamps.get(objectName) ?? { animationName: 'none', frame: 0 };
    const state = this.player.state(animationName);
    const objectPosition = sprite ? `${sprite.x.toFixed(2)},${sprite.y.toFixed(2)}` : 'unplaced';
    const scale = sprite ? `${sprite.scale.x.toFixed(3)},${sprite.scale.y.toFixed(3)}` : 'n/a';
    const rate = this.player.definition(animationName)?.rate ?? 0;
    this.animationLog.push(`tick=${this.tickNumber} animationName=${animationName} frame=${previous.frame}→${frame} animation=${previous.animationName}→${animationName} active=${state?.active ?? false} rate=${rate} object=${objectName} source=${source} world=(${this.heroPosition[0]},${this.heroPosition[1]}) objectPos=(${objectPosition}) scale=(${scale})`);
    if (this.animationLog.length > 1000) this.animationLog.splice(0, this.animationLog.length - 1000);
    this.visualStamps.set(objectName, { animationName, frame });
  }

  private rememberMult(name: string, animationName: string, frame: number, record: MultObject): void {
    const reference = { file: animationName, frame, slot: record.slot, child: record.child };
    const stored = this.state.objects.get(name);
    if (!stored) {
      this.state.objects.set(name, { name, state: 0, depth: this.objectDepth(name), mult: reference });
      return;
    }
    assignImageReference(stored, reference);
  }

  private applyRecord(record: MultObject, file: MultFile, animationName: string, frame: number, source: UpdateSource): void {
    const resolved = file.resolve(record.slot, record.child);
    if (record.name === 'Mainhero') {
      // A frame event re-assigns the image name, which also restores a hidden hero.
      this.rememberMult('Mainhero', animationName, frame, record);
      if (!resolved.width || !resolved.height || !resolved.bgra) { this.hero.visible = false; this.traceVisual('Mainhero', this.hero, animationName, frame, source); return; }
      this.hero.texture = resolvedTexture(file, frame, record, resolved);
      this.hero.visible = true;
      this.heroIsObjectSpace = record.x !== 0 || record.y !== 0;
      if (this.heroIsObjectSpace) {
        this.hero.anchor.set(0.5);
        this.hero.x = this.mask.width / 2 + record.x;
        this.hero.y = this.mask.height / 2 - record.y;
        this.hero.scale.set(1);
      } else this.hero.anchor.set(0.5, 1);
      this.traceVisual('Mainhero', this.hero, animationName, frame, source);
      return;
    }
    const target = findFrameTarget(this.state.objects, record.name);
    if (!target) {
      // 0x405064 skips a MULT record whose name is not in the scene object list;
      // this is the general rule that keeps e.g. Level39 `Goto`/`Ygol` from
      // becoming invented depth-0 columns in front of the hero.
      this.skippedMultRecords.add(record.name);
      return;
    }
    let object = this.objects.get(record.name);
    const alreadyCreated = Boolean(object);
    if (!object) {
      const sprite = new Sprite(Texture.EMPTY);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      sprite.zIndex = pixiDepthIndex(target.depth);
      this.world.addChild(sprite);
      object = { name: record.name, sprite, depth: target.depth, width: 0, height: 0, removed: false, order: this.objectOrder++ };
      this.objects.set(record.name, object);
    }
    // >=10000 is an original-engine control value: it bypasses subsequent
    // image-frame updates. It is not a depth coordinate for a far plane.
    if (alreadyCreated && skipsImageFrameUpdate(object.depth)) return;
    this.rememberMult(record.name, animationName, frame, record);
    // Original external images (-14) are valid frame assignments too; they are
    // preloaded as PNG + hit pixels and must not be mistaken for an empty raster.
    if (resolved.externalPath) {
      const ext = this.external(resolved.externalPath);
      if (!ext) {
        object.removed = true; object.sprite.visible = false;
        object.width = 0; object.height = 0; object.hitPixels = undefined;
        this.traceVisual(record.name, object.sprite, animationName, frame, source);
        return;
      }
      object.removed = false;
      object.sprite.visible = true;
      object.sprite.texture = ext.texture;
      object.width = ext.width; object.height = ext.height;
      object.hitPixels = ext.hitPixels;
      if (record.x !== 0 || record.y !== 0) {
        object.sprite.x = this.mask.width / 2 + record.x;
        object.sprite.y = this.mask.height / 2 - record.y;
        object.sprite.scale.set(1);
      }
      this.traceVisual(record.name, object.sprite, animationName, frame, source);
      return;
    }
    if (!resolved.width || !resolved.height || !resolved.bgra) {
      object.removed = true; object.sprite.visible = false;
      object.width = 0; object.height = 0; object.hitPixels = undefined;
      this.traceVisual(record.name, object.sprite, animationName, frame, source);
      return;
    }
    object.removed = false;
    object.sprite.visible = true;
    object.sprite.texture = resolvedTexture(file, frame, record, resolved);
    object.width = resolved.width; object.height = resolved.height;
    object.hitPixels = multHitPixels(resolved);
    if (record.x !== 0 || record.y !== 0) {
      object.sprite.x = this.mask.width / 2 + record.x;
      object.sprite.y = this.mask.height / 2 - record.y;
      object.sprite.scale.set(1);
    }
    this.traceVisual(record.name, object.sprite, animationName, frame, source);
  }

  private applyAnimationFrame(name: string, frame: number, source: UpdateSource, objectFilter?: readonly string[]): void {
    const allowed = objectFilter ? new Set(objectFilter) : undefined;
    applyFrameDepthEvents(this.definition.frameDepthEvents, name, frame, (objectName, depth) => {
      if (!allowed || allowed.has(objectName)) this.setObjectDepth(objectName, depth, { kind: 'fram', detail: `${name} frame ${frame}` });
    });
    const animation = this.definition.animations.get(name);
    if (!animation) return;
    for (const record of animation.file.frames[frame - 1] ?? []) {
      if (allowed && !allowed.has(record.name)) continue;
      this.applyRecord(record, animation.file, name, frame, source);
    }
  }

  setObjectDepth(name: string, depth: number, provenance: DepthProvenance = { kind: 'default', detail: 'unspecified' }): void {
    const stored = setStateDepth(this.state, name, depth, provenance);
    const object = this.objects.get(name);
    if (object) { object.depth = stored.depth; object.sprite.zIndex = pixiDepthIndex(stored.depth); }
  }

  private startAnimation(name: string, source: UpdateSource): void {
    if (name.startsWith('Walk')) {
      const previous = this.player.currentLocomotion;
      if (!this.player.selectLocomotion(name)) return;
      if (previous && previous !== name) this.traceVisual('Mainhero', this.hero, previous, this.player.state(previous)?.frame ?? 1, source);
    } else if (!this.player.start(name)) return;
    this.activeBarriers.delete(name);
    this.applyAnimationFrame(name, this.player.state(name)?.frame ?? 1, source);
  }

  /** SCC `Stop name` (opcode 0x15): deactivate and reset the animation to frame 1. */
  private stopAnimation(name: string): void {
    const latched = this.definition.audioEvents.find((event) => event.animation === name && this.latchedSounds.has(event.id));
    if (latched) {
      this.audio.stop(latched.id);
      this.latchedSounds.delete(latched.id);
      if (this.activeBarriers.get(name) === latched.id) this.activeBarriers.delete(name);
    }
    this.activeBarriers.delete(name);
    this.player.stop(name, true);
    if (/^(Walk|Stop|Mstop)/i.test(name)) {
      this.traceVisual('Mainhero', this.hero, name, this.player.state(name)?.frame ?? 1, 'SCC');
    }
  }

  /** SCC `Cursor name value` (opcode 0x1f, 0x406593): write the hover cursor ID. */
  private setObjectCursor(name: string, id: number): void {
    const stored = this.state.objects.get(name);
    if (stored) stored.cursorId = id;
    else this.state.objects.set(name, { name, state: 0, depth: 0, cursorId: id });
  }

  private stopLocomotion(source: UpdateSource): void {
    const previous = this.player.stopLocomotion();
    if (previous) this.traceVisual('Mainhero', this.hero, previous, this.player.state(previous)?.frame ?? 1, source);
  }

  /** One game tick for the active scene; ordering mirrors the current engine loop. */
  tick(deltaMS: number, elapsedNow: number, tickNumber: number): void {
    this.tickNumber = tickNumber;
    this.scc.tick();
    this.updateSoundEvents(Math.trunc(elapsedNow));
    this.player.advance(Math.max(0, deltaMS), (event) => {
      // Poll immediately on EACH cursor transition. A range can rewind this very step.
      this.updateSoundEvents(Math.trunc(elapsedNow), event.name, !event.active);
      const state = this.player.state(event.name)!;
      const barrier = this.activeBarriers.get(event.name);
      const sound = barrier === undefined ? undefined : this.soundEventsById.get(barrier);
      if (event.frameChanged || state.active) {
        this.applyAnimationFrame(event.name, state.frame, 'animation-update', sound?.objects);
      } else this.traceVisual('Mainhero', this.hero, event.name, state.frame, 'animation-update');
    });
    if (this.movement) this.advanceMovement(elapsedNow);
    if (!this.heroIsObjectSpace) {
      this.hero.x = this.heroPosition[0];
      this.hero.y = this.heroPosition[1];
      if (this.movement) this.hero.scale.set(this.scaleHere());
    }
    this.scrollX = updateScroll(this.scrollX, this.heroPosition[0], this.mask.width, VIEWPORT_WIDTH);
    this.root.x = -this.scrollX;
    // Mask+Focus depth follows the logical position and is refreshed every tick.
    this.heroDepth = depthAt(this.mask, Math.round(this.heroPosition[0]), Math.round(this.heroPosition[1]), this.focus);
    this.hero.zIndex = pixiDepthIndex(this.heroDepth);
    // Pixi renders children in the sorted array order, ascending zIndex.
    this.world.sortChildren();
  }

  /** Poll frame hooks before frame advancement, preserving source-order handoff in one update. */
  private updateSoundEvents(logicalTick: number, onlyName?: string, naturalEnd = false): void {
    for (const [name, state] of this.player.states) {
      if (onlyName && onlyName !== name) continue;
      if (!state.active && !naturalEnd) continue;
      const events = this.definition.audioEvents.filter((event) => event.animation === name);
      let index = 0;
      while (index < events.length) {
        const event = events[index++];
        if (event.end === -1) continue; // Depth mutation is parsed/applied by the existing depth-event path.
        if (event.end === 0) {
          if (state.active && state.frame === event.start && this.audio.isReady(event.id, logicalTick)) {
            this.audio.play(event, logicalTick);
            if (event.repeat) this.latchedSounds.add(event.id);
          }
          continue;
        }
        const wasLatched = this.latchedSounds.has(event.id);
        const cursor = naturalEnd && wasLatched ? event.end + 1 : state.frame;
        const step = stepSyncRange(event, cursor, wasLatched, wasLatched && this.audio.isReady(event.id, logicalTick));
        if (step.started) {
          this.audio.play(event, logicalTick);
          this.latchedSounds.add(event.id);
          this.activeBarriers.set(name, event.id);
          // Native sets apply-all on first entry; following range updates are object-filtered.
          this.applyAnimationFrame(name, state.frame, 'animation-update');
        }
        if (step.repeated) {
          this.player.setActive(name, true);
          this.player.setFrame(name, step.frame);
          this.activeBarriers.set(name, event.id);
        }
        if (step.completed) {
          this.latchedSounds.delete(event.id);
          this.activeBarriers.delete(name);
          this.player.setCursor(name, step.frame);
        } else if (step.latched && cursor >= event.start && cursor <= event.end + 1) {
          this.activeBarriers.set(name, event.id);
        }
        // Continue to the next event: adjacent ranges hand off in this same update.
      }
    }
  }

  private advanceMovement(elapsedNow: number): void {
    const movement = this.movement!;
    if (movement.first) { movement.first = false; movement.lastTime = elapsedNow; return; }
    const elapsed = elapsedNow - movement.lastTime;
    if (elapsed < 15) return;
    const speedScale = this.scaleHere();
    const factor = this.heroDirection % 2 ? 0.7 : 1;
    const advance = Math.max(1, Math.floor(elapsed * 0.25 * Math.fround(speedScale) * factor + 0.5));
    movement.remaining -= advance;
    if (movement.remaining <= 0) {
      this.movement = undefined;
      this.heroIsObjectSpace = false;
      this.stopLocomotion('navigation-update');
      this.startAnimation(`Stop${this.heroDirection}`, 'navigation-update');
      this.hero.anchor.set(0.5, 1);
      this.hero.x = this.heroPosition[0];
      this.hero.y = this.heroPosition[1];
      this.hero.scale.set(this.scaleHere());
      this.traceVisual('Mainhero', this.hero, `Stop${this.heroDirection}`, 1, 'navigation-update');
      return;
    }
    const previous: Point = this.heroPosition;
    const next = movement.route.path[movement.remaining];
    this.heroPosition = [next[0], next[1]];
    const angle = Math.atan2(previous[1] - next[1], next[0] - previous[0]);
    const normalized = angle < 0 ? Math.fround(angle + Math.PI * 2) : angle;
    const candidate = Math.floor(Math.fround(normalized) * (4 / Math.PI) + 0.5) % 8;
    if (movement.candidate === candidate) movement.candidateCount++;
    else { movement.candidate = candidate; movement.candidateCount = 1; }
    if (movement.candidateCount >= 3 && candidate !== this.heroDirection) {
      this.heroDirection = candidate;
      this.startAnimation(`Walk${this.heroDirection}`, 'navigation-update');
    }
    this.heroIsObjectSpace = false;
    this.hero.anchor.set(0.5, 1);
    this.hero.x = this.heroPosition[0];
    this.hero.y = this.heroPosition[1];
    this.hero.scale.set(this.scaleHere());
    const current = this.player.currentLocomotion ?? `Walk${this.heroDirection}`;
    this.traceVisual('Mainhero', this.hero, current, this.player.state(current)?.frame ?? 1, 'navigation-update');
    movement.lastTime = elapsedNow;
  }

  /**
   * Original scene click path: `Active` hit-test first with RAW screen coordinates
   * (scroll is subtracted inside `activeHitTest` exactly once), then the pixel
   * hit-test of every base Object in reverse painter order, then click-to-walk.
   * `Active` and base Objects are still tested in two phases rather than one merged
   * depth list; this is a documented approximation.
   */
  pointerDown(screenX: number, screenY: number): void {
    if (this.scc.busy) return;
    const selectedItem = this.selectedItem;
    for (const [name, declaration] of this.definition.active) {
      if (!declaration.rect) continue;
      const target = { visible: this.activeVisible(name), rect: declaration.rect };
      if (!activeHitTest(target, screenX, screenY, this.scrollX, 0)) continue;
      if (this.scc.click(name, selectedItem) && selectedItem !== 0) this.selectedItem = 0;
      return;
    }
    const [worldX, worldY] = worldPointFromScreen(screenX, screenY, this.scrollX, 0);
    // Every declared/runtime base Object participates, exactly like the original
    // reverse painter-order loop. There is no per-object interaction whitelist.
    const target = firstHitTarget([...this.objects.values()].map((object) => ({
      name: object.name,
      x: object.sprite.x, y: object.sprite.y, width: object.width, height: object.height,
      visible: object.sprite.visible, removed: object.removed, hitPixels: object.hitPixels,
      depth: object.depth, order: object.order,
    })), worldX, worldY);
    if (target) {
      const handled = this.scc.click(target.name, selectedItem);
      // Using an item consumes `scene+5` only when a Program matched (0x40a31c).
      if (selectedItem !== 0) {
        if (handled) this.selectedItem = 0;
        return;
      }
      // A handled object click never falls through to click-to-walk (0x40a31c).
      if (handled) return;
    }
    // The original clears active Programs even when no object was hit (0x40a1bc).
    this.scc.cancelActive();
    // `scene+5 != 0` suppresses click-to-walk; the selected item is only consumed
    // by a handled object event.
    if (selectedItem !== 0) return;
    const route = buildRoute(this.mask, this.heroPosition, [worldX, worldY]);
    if (route.status === 'route' && route.length) {
      this.movement = { route, remaining: route.length, first: true, lastTime: 0, candidate: this.heroDirection, candidateCount: 0 };
      this.startAnimation(`Walk${this.heroDirection}`, 'navigation-update');
    } else {
      this.stopLocomotion('navigation-update');
      this.startAnimation(`Stop${this.heroDirection}`, 'navigation-update');
    }
  }

  /** Selects an inventory item for the next scene click (`scene+5`). */
  selectItem(id: number): void { this.selectedItem = id; }

  status(): { scene: number; position: Point; direction: number; depth: number; scale: number; scroll: number; objects: number; inventory: number[]; selectedItem: number; active: Record<string, boolean> } {
    return {
      scene: this.definition.id,
      position: this.heroPosition,
      direction: this.heroDirection,
      depth: this.heroDepth,
      scale: this.hero.scale.x,
      scroll: this.scrollX,
      objects: this.objects.size,
      inventory: [...this.scc.inventory],
      selectedItem: this.selectedItem,
      active: Object.fromEntries([...this.definition.active.keys()].map((name) => [name, this.activeVisible(name)])),
    };
  }

  audioReport(): string {
    const voices = this.audio.snapshot().map((voice) => {
      const event = this.soundEventsById.get(voice.id);
      return `#${voice.id}:${event?.animation}[${event?.start}..${event?.end}]:${voice.state}/${voice.finished ? 'finished' : 'unfinished'}/${voice.duration}ms@${voice.lastPlay}/try${voice.attempts}/repl${voice.replacements}${voice.attempting ? '/loading' : ''}${voice.repeat ? '/repeat' : ''}${voice.error ? `(${voice.error})` : ''}`;
    }).join(' ');
    const active = [...this.player.states].filter(([, state]) => state.active).map(([name, state]) => `${name}@${state.frame}`).join(',');
    const barriers = [...this.activeBarriers].map(([name, id]) => `${name}#${id}`).join(',');
    return `context=${this.audio.contextState}/sources${this.audio.activePlaybackCount}/${this.audio.backendCounts} active=${active} barriers=${barriers} ${voices}`;
  }
  unlockAudio(): Promise<void> { return this.audio.unlock(); }

  /**
   * Structured form of the `?debug=depth` readout. `origin` is an analysis
   * annotation, not an original engine field: declaration / Objzet / Fram /
   * default (runtime fallback). MULT-only names have no entry because the
   * original frame updater skips them.
   */
  depthSnapshot(): {
    scene: number;
    scroll: number;
    hero: { x: number; y: number; depth: number; absDepth: number; zIndex: number; drawIndex: number; origin: string };
    objects: Array<{
      name: string; depth: number; absDepth: number; zIndex: number; drawIndex: number;
      relation: 'behind hero' | 'in front of hero'; origin: string; visible: boolean; x: number; y: number;
    }>;
    skippedMultOnly: string[];
    missingExternalImages: string[];
  } {
    const heroIndex = this.world.getChildIndex(this.hero);
    const objects = [...this.objects.values()]
      .map((object) => {
        const provenance = this.state.objects.get(object.name)?.depthProvenance;
        return {
          name: object.name,
          depth: object.depth,
          absDepth: Math.abs(object.depth),
          zIndex: object.sprite.zIndex,
          drawIndex: this.world.getChildIndex(object.sprite),
          relation: this.world.getChildIndex(object.sprite) < heroIndex ? 'behind hero' as const : 'in front of hero' as const,
          origin: depthOriginLabel(provenance),
          visible: object.sprite.visible && !object.removed,
          x: object.sprite.x,
          y: object.sprite.y,
        };
      })
      .sort((a, b) => a.drawIndex - b.drawIndex);
    return {
      scene: this.definition.id,
      scroll: this.scrollX,
      hero: {
        x: this.heroPosition[0], y: this.heroPosition[1], depth: this.heroDepth,
        absDepth: Math.abs(this.heroDepth), zIndex: this.hero.zIndex, drawIndex: heroIndex,
        origin: 'mask(x,y)+Focus',
      },
      objects,
      skippedMultOnly: [...this.skippedMultRecords].sort(),
      missingExternalImages: [...this.missingExternalRecords].sort(),
    };
  }

  /** Copies of the depth debug panel lines for `?debug=depth`. */
  depthReport(): string {
    const snapshot = this.depthSnapshot();
    const hero = snapshot.hero;
    return [
      `DEPTH DEBUG · scene=${snapshot.scene} · scroll=${snapshot.scroll} · world.sortableChildren=${this.world.sortableChildren}`,
      `Hero: depth=${hero.depth} abs=${hero.absDepth} zIndex=${hero.zIndex} draw#${hero.drawIndex} logical=(${hero.x},${hero.y}) Focus=${this.focus.join(' ')} · ${hero.origin}`,
      'Actual draw order (earlier-to-later):',
      ...snapshot.objects.map((item) => `${String(item.drawIndex).padStart(3)} ${item.name.padEnd(14)} depth=${String(item.depth).padStart(7)} abs=${String(item.absDepth).padStart(7)} z=${String(item.zIndex).padStart(8)} ${item.relation} · ${item.origin}`),
      ...(snapshot.skippedMultOnly.length
        ? [`Skipped MULT-only records (0x405064 -> 0x40a8dc=NULL): ${snapshot.skippedMultOnly.join(', ')}`]
        : []),
      ...(snapshot.missingExternalImages.length
        ? [`Missing external images (optional): ${snapshot.missingExternalImages.join(', ')}`]
        : []),
      ...(this.definition.warnings.length
        ? [`Scene load warnings: ${this.definition.warnings.join('; ')}`]
        : []),
      'Equal abs(depth): comparator returns 0; stable insertion order used (native tie order UNKNOWN).',
    ].join('\n');
  }

  /** Latest animation trace lines for `?debug=depth`. */
  animationReport(limit = 120): string {
    return this.animationLog.slice(-limit).join('\n');
  }

  /**
   * Releases every disposable resource of this visit. Long-lived state, scene
   * definitions and shared textures stay alive; the hero position is remembered.
   */
  dispose(): void {
    this.scc.cancelActive();
    this.audio.dispose();
    for (const name of this.player.states.keys()) this.player.stop(name);
    this.movement = undefined;
    this.state.savedPosition = [this.heroPosition[0], this.heroPosition[1]];
    this.state.savedDirection = this.heroDirection;
    this.objects.clear();
    this.root.removeFromParent();
    this.root.destroy({ children: true, texture: false, textureSource: false });
  }
}
