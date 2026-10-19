import type { SccPortal } from '../scc/runtime';
import type { SceneDeclarationKind, SceneRect } from '../navigation/depth-sort';
import { findNamedObject } from './object-identity';

export type SceneImageReference = { file: string; frame: number; slot: number; child: number };
export type Transform = { x: number; y: number; scaleX: number; scaleY: number; anchorX: number; anchorY: number };
export type SavedImage = { kind: 'mult'; reference: SceneImageReference } | { kind: 'empty' } | { kind: 'unassigned' };
export type SavedMap =
  | { model: 'legacy-zone-v1'; zone: number }
  | { model: 'banked-v1'; bank: 0 | 1; unlocked: [boolean[], boolean[]] };
/**
 * Documented origin of the current painter depth. The original engine has no
 * provenance field; this is an analysis/debug annotation used by ?debug=depth.
 */
export type DepthProvenance =
  | { kind: 'declaration'; detail?: string }
  | { kind: 'objzet'; detail?: string }
  | { kind: 'fram'; detail?: string }
  | { kind: 'default'; detail?: string };
export type SceneObjectState = {
  name: string;
  state: number;
  depth: number;
  /** Where `depth` came from: SCC declaration, Objzet, Fram or a fallback. */
  depthProvenance?: DepthProvenance;
  /** Last applied MULT image. A base `Object` loses this reference on `Hide`. */
  mult?: SceneImageReference;
  /**
   * Original base `Object` "empty MULT name" state. It survives a scene transition
   * until a later MULT frame assigns an image again.
   */
  imageHidden?: boolean;
  /** Active/Light +0x297 visibility or effective base Object image visibility in the browser. */
  visible?: boolean;
  /** Hover cursor ID (+0x152), written by SCC `Cursor name value`. */
  cursorId?: number;
  /** Immutable `Active` world rectangle, copied from its declaration. */
  rect?: SceneRect;
  /** Last assigned live sprite transform; absent until an image was placed. */
  transform?: Transform;
  kind?: SceneDeclarationKind;
  placeholder?: boolean;
};
export type SceneState = { id: number; initialized: boolean; objects: Map<string, SceneObjectState>; portals: SccPortal[]; focus: [number, number, number]; savedPosition: [number, number]; savedDirection: number; declarations: string[] };
export type SceneRuntime = { id: number; handlers: unknown[]; animations: unknown[]; resources: Set<{ destroy?: () => void }>; disposed: boolean };
export type PersistentObjectState = {
  name: string; state: number; depth: number; cursorId?: number; image: SavedImage;
  transform?: Transform; visible?: boolean; rect?: SceneRect; kind?: SceneDeclarationKind; placeholder?: boolean;
};
export type PersistentSceneState = {
  id: number; initialized: boolean; savedPosition: [number, number]; savedDirection: number; objects: PersistentObjectState[];
};
export type PersistentHeroState = {
  position: [number, number]; direction: number; mode: 'navigation' | 'object' | 'hidden'; transform?: Transform;
};
export type PersistentWorldSnapshot = {
  currentSceneId: number | null; scenes: PersistentSceneState[]; inventory: number[]; map: SavedMap; hero: PersistentHeroState | null;
};

const cloneRect = (rect: SceneRect): SceneRect => ({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
const cloneTransform = (transform: Transform): Transform => ({ ...transform });
export function cloneSavedMap(map: SavedMap): SavedMap {
  return map.model === 'legacy-zone-v1'
    ? { model: map.model, zone: map.zone }
    : { model: map.model, bank: map.bank, unlocked: [map.unlocked[0].slice(), map.unlocked[1].slice()] };
}
export function createSceneState(id: number): SceneState {
  // savedDirection defaults to the verified initial pose (Level1 Init uses Stop6).
  return { id, initialized: false, objects: new Map(), portals: [], focus: [120,1,1], savedPosition: [0,0], savedDirection: 6, declarations: [] };
}
export function createSceneRuntime(id: number): SceneRuntime { return { id, handlers: [], animations: [], resources: new Set(), disposed: false }; }

/** Label used by ?debug=depth; keeps the native origin names visible. */
export function depthOriginLabel(provenance: DepthProvenance | undefined): string {
  if (!provenance) return 'unknown origin';
  const detail = provenance.detail ? ` (${provenance.detail})` : '';
  switch (provenance.kind) {
    case 'declaration': return `SCC declaration${detail}`;
    case 'objzet': return `SCC Objzet${detail}`;
    case 'fram': return `SCC Fram${detail}`;
    case 'default': return `default${detail}`;
  }
}

/**
 * Writes a depth and its provenance into the long-lived object list. Kept pure so
 * tests can verify the same mutation the renderer performs from Objzet/Fram.
 */
export function setStateDepth(state: SceneState, name: string, depth: number, provenance: DepthProvenance): SceneObjectState {
  const object = findNamedObject(state.objects.values(), name);
  if (object) {
    object.depth = depth;
    object.depthProvenance = provenance;
    return object;
  }
  const created: SceneObjectState = { name, state: 0, depth, kind: 'Object', depthProvenance: provenance };
  state.objects.set(name, created);
  return created;
}

/** Owns long-lived per-scene data separately from disposable browser/Pixi resources. */
export class SceneLoader {
  readonly states = new Map<number, SceneState>();
  readonly inventory: number[] = [];
  /** Game-session map. `zone` is retained only for the existing debug readout. */
  readonly game: { zone: number; map: SavedMap } = {
    zone: 0,
    map: { model: 'banked-v1', bank: 0, unlocked: [Array(7).fill(false), Array(7).fill(false)] },
  };
  active?: SceneState;
  runtime?: SceneRuntime;
  pending?: { scene: number; portal: number };
  constructor(readonly releaseProgram: () => void = () => {}) {}
  state(id: number): SceneState { let value = this.states.get(id); if (!value) { value = createSceneState(id); this.states.set(id,value); } return value; }
  /** Cross-scene Click reads never allocate a scene or a missing object placeholder. */
  readState(sceneId: number, name: string): number {
    const target = this.states.get(sceneId);
    return target ? findNamedObject(target.objects.values(), name)?.state ?? 0 : 0;
  }
  lstate(scene: number, name: string, value: number): void {
    const target = this.state(scene), old = findNamedObject(target.objects.values(), name);
    if (old) old.state = value; else if (!target.initialized) target.objects.set(name,{ name,state:value,depth:0,placeholder:true });
  }
  declareObject(scene: SceneState, object: SceneObjectState): void {
    const exact = scene.objects.get(object.name);
    // An Lstate-created placeholder can precede loading the target scene and use
    // different casing from its declaration. Merge only that alias; preserve
    // separate declared entries so corpus collisions remain observable.
    const alias = exact ? undefined : findNamedObject(scene.objects.values(), object.name);
    const old = exact ?? (alias?.placeholder ? alias : undefined);
    if (alias?.placeholder && !exact) scene.objects.delete(alias.name);
    // Re-parsing a scene must not recreate object state. A real object keeps its
    // State, Objzet depth, last rendered MULT reference and visibility; a placeholder
    // only carries State forward (theme of 0x407c14 / 0x407ffc: objects and State stay).
    if (old) {
      object.state = old.state;
      if (old.cursorId !== undefined) object.cursorId = old.cursorId;
      if (old.rect !== undefined) object.rect = cloneRect(old.rect);
      if (old.kind !== undefined) object.kind = old.kind;
      if (old.transform !== undefined) object.transform = cloneTransform(old.transform);
      if (!old.placeholder) {
        object.depth = old.depth;
        object.depthProvenance = old.depthProvenance;
        object.mult = old.mult;
        object.imageHidden = old.imageHidden;
        if (old.visible !== undefined) object.visible = old.visible;
      }
    }
    scene.objects.set(object.name,object);
    if (!scene.declarations.includes(object.name)) scene.declarations.push(object.name);
  }

  setMapBank(bank: number): void {
    if (bank !== 0 && bank !== 1) return;
    if (this.game.map.model === 'legacy-zone-v1') {
      this.game.map = { model: 'banked-v1', bank, unlocked: [Array(7).fill(false), Array(7).fill(false)] };
    } else this.game.map.bank = bank;
  }

  unlockMapZone(zone: number): void {
    if (!Number.isInteger(zone) || zone < 0 || zone > 6) return;
    if (this.game.map.model === 'legacy-zone-v1') {
      this.game.map = { model: 'banked-v1', bank: 0, unlocked: [Array(7).fill(false), Array(7).fill(false)] };
    }
    this.game.map.unlocked[this.game.map.bank][zone] = true;
    this.game.zone = zone;
  }

  /** Pure deep-copy export. Missing supported scenes get default records without being materialized in `states`. */
  exportPersistentState(sceneIds: readonly number[], currentSceneId: number | null, live?: {
    hero: PersistentHeroState; objects: ReadonlyMap<string, SceneObjectState>; savedPosition: [number, number]; savedDirection: number;
  }): PersistentWorldSnapshot {
    const ids = [...new Set([...sceneIds, ...this.states.keys()])].sort((a, b) => a - b);
    const scenes = ids.map((id): PersistentSceneState => {
      const state = this.states.get(id);
      const objectMap = new Map(state?.objects ?? []);
      if (id === currentSceneId && live) {
        for (const [name, object] of live.objects) objectMap.set(name, object);
      }
      const names = [...(state?.declarations ?? []), ...[...objectMap.keys()].filter((name) => !(state?.declarations ?? []).includes(name))];
      const objects = names.flatMap((name) => {
        const object = objectMap.get(name);
        if (!object) return [];
        const image: SavedImage = object.imageHidden
          ? { kind: 'empty' }
          : object.mult ? { kind: 'mult', reference: { ...object.mult } } : { kind: 'unassigned' };
        return [{
          name: object.name, state: object.state, depth: object.depth,
          ...(object.cursorId === undefined ? {} : { cursorId: object.cursorId }), image,
          ...(object.transform === undefined ? {} : { transform: cloneTransform(object.transform) }),
          ...(object.visible === undefined ? {} : { visible: object.visible }),
          ...(object.rect === undefined ? {} : { rect: cloneRect(object.rect) }),
          ...(object.kind === undefined ? {} : { kind: object.kind }),
          ...(object.placeholder === undefined ? {} : { placeholder: object.placeholder }),
        }];
      });
      const position = id === currentSceneId && live ? live.savedPosition : state?.savedPosition ?? [0, 0] as [number, number];
      const direction = id === currentSceneId && live ? live.savedDirection : state?.savedDirection ?? 6;
      return { id, initialized: state?.initialized ?? false, savedPosition: [position[0], position[1]], savedDirection: direction, objects };
    });
    return {
      currentSceneId, scenes, inventory: this.inventory.slice(), map: cloneSavedMap(this.game.map),
      hero: live ? { ...live.hero, position: [...live.hero.position] as [number, number], ...(live.hero.transform ? { transform: cloneTransform(live.hero.transform) } : {}) } : null,
    };
  }
  schedule(scene: number, portal: number): void { this.pending = { scene,portal }; }
  /**
   * Called only at the game-loop scene boundary; Level itself never switches synchronously.
   * Order matches the original loader: parse/preload -> Init (first entry) -> placement -> Start
   * -> mark the scene initialized. A yield inside Init is deliberately not awaited here.
   */
  enterPending(
    prepare: (state: SceneState, runtime: SceneRuntime, firstEntry: boolean) => void,
    position: (state: SceneState, portal?: SccPortal) => void,
    start: (state: SceneState) => void,
    init: (state: SceneState, runtime: SceneRuntime) => void = () => {},
  ): boolean {
    if (!this.pending) return false;
    const {scene:id,portal:index} = this.pending; this.pending = undefined;
    const target = this.state(id);
    this.releaseProgram(); this.disposeRuntime();
    const first = !target.initialized;
    const runtime = createSceneRuntime(id);
    // Resource parsing/Inc is performed by prepare in source order, before Init.
    prepare(target,runtime,first);
    this.active = target; this.runtime = runtime;
    // Init is a normal Click/Program: run synchronously until its first yield.
    if (first) init(target,runtime);
    position(target,index >= 0 ? target.portals[index] : undefined);
    start(target);
    // scene+4 becomes 1 only after the loader's Init/placement/Start sequence.
    if (first) target.initialized = true;
    return true;
  }
  disposeRuntime(): void {
    if (!this.runtime || this.runtime.disposed) return;
    for (const resource of this.runtime.resources) resource.destroy?.();
    this.runtime.handlers.length = 0; this.runtime.animations.length = 0; this.runtime.resources.clear(); this.runtime.disposed = true;
    this.runtime = undefined;
  }
}

export function parsePortals(source: string): SccPortal[] {
  const out: SccPortal[] = [];
  for (const line of source.split(/\r?\n/)) { const m = /^\s*Portal\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/i.exec(line); if (m) out.push({direction:Number(m[1]),x:Number(m[2]),y:Number(m[3])}); }
  return out;
}
