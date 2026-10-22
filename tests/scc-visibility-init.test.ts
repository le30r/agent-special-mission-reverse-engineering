import { beforeAll, describe, expect, it } from 'vitest';
import type { SceneDefinition } from '../src/scene/scene-definition';
import { computeEntry, type SceneEntry } from '../src/scene/scene-entry';
import { SceneLoader, type SceneState } from '../src/scene/scene-loader';
import { declareSceneObjects } from '../src/scene/scene-session';
import { applyObjectVisibility, assignImageReference } from '../src/scene/object-visibility';
import { activeHitTest, logicalScreenPoint, worldPointFromScreen } from '../src/scene/active-hit';
import { SccRuntime, parseScc, type SccHost } from '../src/scc/runtime';
import { SceneView } from '../src/scene/scene-view';
import { Texture } from 'pixi.js';
import { collectAnimationExternalPaths } from '../src/scene/scene-source';
import { catalogDefinition, loadTestSceneCatalog, type TestSceneCatalog } from './helpers/scene-catalog';

let catalog: TestSceneCatalog;
beforeAll(async () => { catalog = await loadTestSceneCatalog([1, 39]); });
const definition = (id: number): SceneDefinition => catalogDefinition(catalog, id);

function testHost(state: SceneState, events: string[] = []): SccHost {
  return {
    pathActive: () => false,
    animationActive: () => false,
    startAnimation: (name) => events.push(`anim:${name}`),
    setPosition: (x, y) => { state.savedPosition = [x, y]; events.push(`xy:${x},${y}`); },
    setDepth: (name, depth) => {
      const old = state.objects.get(name);
      if (old) old.depth = depth;
      else state.objects.set(name, { name, state: 0, depth });
    },
    showObject: (name) => events.push(`show:${name}`),
    hideObject: (name) => events.push(`hide:${name}`),
    setZone: (zone) => events.push(`zone:${zone}`),
    readState: (name) => state.objects.get(name)?.state ?? 0,
    writeState: (name, value) => {
      const object = state.objects.get(name);
      if (object) object.state = value;
      else state.objects.set(name, { name, state: value, depth: 0 });
    },
  };
}

describe('SCC Show/Hide/Setzon/SclipW parsing and execution', () => {
  it('parses the original Level1 Init as the confirmed synchronous prefix and commands', () => {
    const init = parseScc(definition(1).scc).find((handler) => handler.event === 'Init');
    const commands = init?.programs.get(0)?.commands ?? [];
    expect(commands.map((command) => command.op)).toEqual([
      'Setzon', 'Start',
      'Show', 'Show', 'Show', 'Show', 'Show', 'Show', 'Show', 'Show',
      'Setxy', 'SclipW', 'Start', 'Smusic', 'State', 'State',
    ]);
    expect(commands[0]).toEqual({ op: 'Setzon', value: 3 });
    expect(commands.filter((command) => command.op === 'Show').map((command) => 'name' in command ? command.name : '')).toEqual([
      'Goto_5', 'Goto_10', 'Goto_29', 'Nar', 'Naruchniki', 'Light0', 'Morda', 'Flag1',
    ]);
    expect(commands.find((command) => command.op === 'SclipW')).toEqual({ op: 'SclipW', value: 0, file: 'Rolik1.avi' });
    expect(commands.find((command) => command.op === 'Smusic')).toEqual({ op: 'Smusic', value: 1, file: '1.mp3' });
  });

  it('preloads external images from every animation frame, including non-layout ones', () => {
    const level1 = collectAnimationExternalPaths(definition(1));
    expect(level1).toContain('Tzu\\Scn_37\\Botl\\S0\\botl.tif');
    const level39 = collectAnimationExternalPaths(definition(39));
    // Fly_c is started by Level39 Init's Start dispatch, but is not in Startlevel.
    expect(level39).toContain('Tzu\\Scn_39\\Fly\\BigLamp\\l_.0001.tif');
    expect(level39).toContain('Tzu\\Scn_39\\Fly\\BigLamp\\l_.0018.tif');
  });

  it('yields on SclipW and resumes only on a later tick, after the initial Start dispatch', () => {
    const source = [
      'Click 0 Init Interface', '{', ' Case 0',
      '  Setzon 3', '  Show Goto_5', '  Setxy 1199 524', '  SclipW 0 Rolik1.avi',
      '  State Slip 1', '  Start Slip', '  Smusic 1 1.mp3', ' Break', '}',
      'Click 0 Start Slip', '{', ' Case 1', '  Start Slip', ' Break', '}',
    ].join('\n');
    const state = new SceneLoader().state(1);
    declareSceneObjects(new SceneLoader(), state, definition(1));
    const events: string[] = [];
    const runtime = new SccRuntime(source, testHost(state, events));
    expect(runtime.dispatch('Init')).toBe(true);
    expect(events).toEqual(['zone:3', 'show:Goto_5', 'xy:1199,524']);
    expect(runtime.programs[0]).toMatchObject({ active: true, waiting: true });
    expect(runtime.states.get('Slip')).toBeUndefined();
    // The initial Start dispatch sees Slip.state===0, so it must not start anything.
    expect(runtime.dispatch('Start')).toBe(false);
    expect(events).toEqual(['zone:3', 'show:Goto_5', 'xy:1199,524']);
    // The next game tick continues the suspended Init automatically.
    runtime.tick();
    expect(runtime.states.get('Slip')).toBe(1);
    expect(events).toEqual(['zone:3', 'show:Goto_5', 'xy:1199,524', 'anim:Slip']);
    expect(runtime.programs[0].active).toBe(false);
    // A later Start event now sees State Slip 1 and runs its Case 1.
    expect(runtime.dispatch('Start')).toBe(true);
  });

  it('holds the whole SceneView tick behind the session-global video barrier and resumes exactly once', () => {
    let videoActive = false;
    const begins: Array<[string, number]> = [];
    const state = new SceneLoader().state(1);
    const minimalDefinition = { ...definition(1), layout: [], objects: new Map(), active: new Map(), lights: new Map(), animations: new Map() } as SceneDefinition;
    const view = new SceneView(minimalDefinition, state, Texture.EMPTY, {
      level: () => {}, lstate: () => {}, setZone: () => {},
      beginVideo: (file, ignoredSccArg) => { begins.push([file, ignoredSccArg]); videoActive = true; },
      videoActive: () => videoActive,
    }, []);
    try {
      expect(view.dispatchInit()).toBe(true);
      expect(begins).toEqual([['Rolik1.avi', 0]]);
      expect(view.scc.programs.find((program) => program.active)).toBeTruthy();
      view.tick(2_000, 2_000, 1);
      expect(view.scc.states.get('Slip')).toBeUndefined();
      expect(view.state.objects.has('Slip')).toBe(false);
      videoActive = false;
      view.tick(1, 1, 2);
      expect(view.state.objects.get('Slip')?.state).toBe(1);
      view.tick(1, 2, 3);
      expect(view.state.objects.get('Slip')?.state).toBe(1);
    } finally { view.dispose(); }
  });

  it('preserves the mandatory first yield when a missing-video result is synchronous', () => {
    const source = 'Click 0 Demo Demo\n{\n Case 0\n  SclipW 7 absent.avi\n  State Tail 1\n Break\n}';
    const state = new SceneLoader().state(1);
    const events: string[] = [];
    const host: SccHost = {
      ...testHost(state, events),
      beginVideo: (file, arg) => events.push(`begin:${file}:${arg}`),
      videoActive: () => false,
    };
    const runtime = new SccRuntime(source, host);
    runtime.click('Demo');
    expect(events).toEqual(['begin:absent.avi:7']);
    expect(runtime.states.get('Tail')).toBeUndefined();
    runtime.tick();
    expect(runtime.states.get('Tail')).toBe(1);
    runtime.tick();
    expect(runtime.states.get('Tail')).toBe(1);
  });

  it('dispatches Show/Hide to object names and skips missing names silently', () => {
    const source = 'Click 0 Demo Demo\n{\n Case 0\n  Show Goto_5\n  Hide Goto_5\n  Show Missing\n  Hide Missing\n Break\n}';
    const state = new SceneLoader().state(1);
    const loader = new SceneLoader();
    declareSceneObjects(loader, state, definition(1));
    const visibility = { objects: definition(1).objects, active: definition(1).active, lights: definition(1).lights };
    const events: string[] = [];
    const host: SccHost = {
      ...testHost(state, events),
      showObject: (name) => { events.push(`show:${name}`); applyObjectVisibility(visibility, state, name, true); },
      hideObject: (name) => { events.push(`hide:${name}`); applyObjectVisibility(visibility, state, name, false); },
    };
    const runtime = new SccRuntime(source, host);
    runtime.click('Demo');
    expect(events).toEqual(['show:Goto_5', 'hide:Goto_5', 'show:Missing', 'hide:Missing']);
    expect(state.objects.get('Goto_5')?.visible).toBe(false);
    expect(state.objects.has('Missing')).toBe(false);
  });
});

describe('Active visibility and hit test', () => {
  it('starts hidden, toggles through Show/Hide and keeps the flag across a scene re-declaration', () => {
    const loader = new SceneLoader();
    const state = loader.state(1);
    declareSceneObjects(loader, state, definition(1));
    expect(state.objects.get('Goto_5')).toMatchObject({
      visible: false, kind: 'Active', depth: 230,
      rect: { left: 1350, top: 180, right: 1450, bottom: 280 },
    });
    // A base Object has no +0x297 visibility field; it uses the MULT-name mechanism.
    expect(state.objects.get('Botl')?.visible).toBeUndefined();
    expect(state.objects.get('Light0')).toMatchObject({ visible: false, kind: 'Light' });
    const visibility = { objects: definition(1).objects, active: definition(1).active, lights: definition(1).lights };
    expect(applyObjectVisibility(visibility, state, 'Light0', true)).toMatchObject({ found: true, changed: true, kind: 'Light' });
    expect(state.objects.get('Light0')?.visible).toBe(true);
    expect(applyObjectVisibility(visibility, state, 'Light0', false)).toMatchObject({ found: true, changed: true, kind: 'Light' });
    expect(state.objects.get('Light0')?.visible).toBe(false);
    expect(applyObjectVisibility(visibility, state, 'Goto_5', true)).toMatchObject({ found: true, changed: true });
    expect(state.objects.get('Goto_5')?.visible).toBe(true);
    // Re-entry re-declares the immutable Active but must merge the old visibility.
    declareSceneObjects(loader, state, definition(1));
    expect(state.objects.get('Goto_5')?.visible).toBe(true);
    applyObjectVisibility(visibility, state, 'Goto_5', false);
    expect(state.objects.get('Goto_5')?.visible).toBe(false);
  });

  it('uses raw screen coordinates, subtracts scroll once and rejects every rectangle boundary', () => {
    const target = { visible: true, rect: { left: 1350, top: 180, right: 1450, bottom: 280 } };
    // Start scrollX=599, so the raw screen span is 751..851 x 180..280.
    expect(activeHitTest(target, 775, 220, 599)).toBe(true);
    expect(activeHitTest(target, 752, 181, 599)).toBe(true);
    expect(activeHitTest(target, 850, 279, 599)).toBe(true);
    expect(activeHitTest(target, 751, 220, 599)).toBe(false);
    expect(activeHitTest(target, 851, 220, 599)).toBe(false);
    expect(activeHitTest(target, 775, 180, 599)).toBe(false);
    expect(activeHitTest(target, 775, 280, 599)).toBe(false);
    expect(activeHitTest(target, 750, 220, 599)).toBe(false);
    // World-space coordinates are not special-cased: the same raw value would be
    // outside the scrolled rectangle if scroll had already been applied by a caller.
    expect(activeHitTest(target, 1374, 220, 599)).toBe(false);
    expect(activeHitTest({ ...target, visible: false }, 775, 220, 599)).toBe(false);
    expect(activeHitTest(undefined, 775, 220, 599)).toBe(false);
  });

  it('maps a 1280x720 browser canvas onto the original 800x600 viewport and adds scroll once for navigation', () => {
    // The canvas is 960x720 and centered: client origin x=160, y=0.
    const rect = { left: 160, top: 0, width: 960, height: 720 };
    expect(logicalScreenPoint(160 + 775 * 1.2, 220 * 1.2, rect)).toEqual([775, 220]);
    expect(logicalScreenPoint(160, 0, rect)).toEqual([0, 0]);
    expect(worldPointFromScreen(775, 220, 599)).toEqual([1374, 220]);
    expect(worldPointFromScreen(117, 362, 599)).toEqual([716, 362]);
  });
});

describe('base Object Show/Hide asymmetry', () => {
  it('shows as a no-op, hides by clearing the MULT reference, and restores on the next frame event', () => {
    const loader = new SceneLoader();
    const state = loader.state(1);
    declareSceneObjects(loader, state, definition(1));
    const visibility = { objects: definition(1).objects, active: definition(1).active, lights: definition(1).lights };
    const bottle = state.objects.get('Botl')!;
    assignImageReference(bottle, { file: 'Takedr1', frame: 9, slot: 1, child: 17 });
    expect(applyObjectVisibility(visibility, state, 'Botl', true)).toMatchObject({ found: true, changed: false, clearImage: false });
    expect(bottle.mult).toEqual({ file: 'Takedr1', frame: 9, slot: 1, child: 17 });
    expect(applyObjectVisibility(visibility, state, 'Botl', false)).toMatchObject({ found: true, clearImage: true });
    expect(bottle.mult).toBeUndefined();
    expect(bottle.imageHidden).toBe(true);
    // Hide is idempotent.
    expect(applyObjectVisibility(visibility, state, 'Botl', false)).toMatchObject({ changed: false, clearImage: true });
    // The next MULT frame assigns the image name again; frame/record are supplied by that event.
    assignImageReference(bottle, { file: 'Takedr1', frame: 10, slot: 1, child: 0 });
    expect(bottle.imageHidden).toBe(false);
    expect(bottle.mult).toEqual({ file: 'Takedr1', frame: 10, slot: 1, child: 0 });
    // Show after Hide is still a no-op for a base Object.
    applyObjectVisibility(visibility, state, 'Botl', false);
    expect(applyObjectVisibility(visibility, state, 'Botl', true).changed).toBe(false);
    expect(bottle.imageHidden).toBe(true);
    // Base Object visibility is effective image visibility, separate from the Active/Light native byte.
    expect(bottle.visible).toBe(false);
  });
});

describe('loader Init lifecycle', () => {
  it('runs Init between prepare and placement only on the first entry', () => {
    const events: string[] = [];
    const loader = new SceneLoader();
    const enter = (scene: number, portal: number) => {
      loader.schedule(scene, portal);
      expect(loader.enterPending(
        (state) => events.push(`prepare:${state.id}`),
        (state) => events.push(`position:${state.id}`),
        (state) => events.push(`start:${state.id}`),
        (state) => events.push(`init:${state.id}`),
      )).toBe(true);
    };
    enter(1, -1);
    expect(events).toEqual(['prepare:1', 'init:1', 'position:1', 'start:1']);
    expect(loader.state(1).initialized).toBe(true);
    enter(1, 1);
    expect(events).toEqual(['prepare:1', 'init:1', 'position:1', 'start:1', 'prepare:1', 'position:1', 'start:1']);
  });
});

describe('natural Level1 -> Level39 -> Level1 SCC transition', () => {
  type Harness = {
    loader: SceneLoader;
    events: string[];
    animationActive: Map<string, boolean>;
    initRuns: Map<number, number>;
    runtime?: SccRuntime;
    entry?: SceneEntry;
    pathActive: boolean;
    lastGoto?: [number, number];
    enter(scene: number, portal: number): void;
  };
  function createHarness(): Harness {
    const events: string[] = [];
    const loader = new SceneLoader();
    const animationActive = new Map<string, boolean>();
    const initRuns = new Map<number, number>();
    const harness: Harness = {
      loader, events, animationActive, initRuns, pathActive: false,
      enter: () => {},
    };
    const hostFor = (definition: SceneDefinition, state: SceneState): SccHost => {
      const visibility = { objects: definition.objects, active: definition.active, lights: definition.lights };
      return {
        pathActive: () => harness.pathActive,
        animationActive: (name) => animationActive.get(name) ?? false,
        startAnimation: (name) => { animationActive.set(name, true); events.push(`anim:${name}`); },
        setPosition: (x, y) => { state.savedPosition = [x, y]; events.push(`xy:${x},${y}`); },
        setDepth: (name, depth) => {
          const old = state.objects.get(name);
          if (old) old.depth = depth;
          else state.objects.set(name, { name, state: 0, depth });
        },
        showObject: (name) => { applyObjectVisibility(visibility, state, name, true); },
        hideObject: (name) => { applyObjectVisibility(visibility, state, name, false); },
        setZone: (zone) => { loader.game.zone = zone; events.push(`zone:${zone}`); },
        goto: (x, y) => { harness.lastGoto = [x, y]; harness.pathActive = true; events.push(`goto:${x},${y}`); return true; },
        goport: (index) => {
          const portal = definition.portals[index];
          if (!portal) return false;
          harness.lastGoto = [portal.x, portal.y];
          harness.pathActive = true;
          events.push(`goport:${index}`);
          return true;
        },
        level: (scene, portal) => { loader.schedule(scene, portal); events.push(`level:${scene}:${portal}`); },
        lstate: (scene, name, value) => loader.lstate(scene, name, value),
        readState: (name) => state.objects.get(name)?.state ?? 0,
        writeState: (name, value) => {
          const object = state.objects.get(name);
          if (object) object.state = value;
          else state.objects.set(name, { name, state: value, depth: 0 });
        },
      };
    };
    harness.enter = (scene: number, portal: number) => {
      const definition = catalogDefinition(catalog, scene);
      let entering: SccRuntime | undefined;
      loader.schedule(scene, portal);
      expect(loader.enterPending(
        (state) => {
          state.portals = definition.portals;
          state.focus = [definition.focus[0], definition.focus[1], definition.focus[2]];
          declareSceneObjects(loader, state, definition);
          entering = new SccRuntime(definition.scc, hostFor(definition, state), loader.inventory);
          harness.runtime = entering;
          events.push(`prepare:${scene}`);
        },
        (state, resolvedPortal) => {
          harness.entry = computeEntry(definition, state, resolvedPortal);
          state.savedPosition = [harness.entry.position[0], harness.entry.position[1]];
          state.savedDirection = harness.entry.direction;
          events.push(`position:${scene}:${harness.entry.position.join(',')}`);
        },
        () => { entering!.dispatch('Start'); events.push(`start:${scene}`); },
        () => {
          initRuns.set(scene, (initRuns.get(scene) ?? 0) + 1);
          events.push(`init:${scene}`);
          entering!.dispatch('Init');
        },
      )).toBe(true);
    };
    return harness;
  }

  it('opens Goto_5 only through Init, follows Goto/Level, returns through Goto_11 and preserves the bottle', () => {
    const harness = createHarness();
    const { loader } = harness;
    harness.enter(1, -1);
    const level1 = loader.state(1);
    const initIndex = harness.events.indexOf('init:1');
    const positionIndex = harness.events.indexOf('position:1:1199,524');
    const startIndex = harness.events.indexOf('start:1');
    expect(harness.events[0]).toBe('prepare:1');
    expect(initIndex).toBeGreaterThan(0);
    expect(positionIndex).toBeGreaterThan(initIndex);
    expect(startIndex).toBeGreaterThan(positionIndex);
    expect(loader.game.zone).toBe(3);
    expect(land(level1, 'Goto_5').visible).toBe(true);
    expect(land(level1, 'Light0').visible).toBe(true);
    expect(harness.entry).toMatchObject({ source: 'init', position: [1199, 524], direction: 6, scroll: 599 });
    expect(harness.runtime!.programs[0]).toMatchObject({ active: true, waiting: true });
    // The initial Start dispatch ran while State Slip/Stat_v were still 0.
    expect(harness.events).not.toContain('anim:Slip');
    harness.runtime!.tick();
    expect(level1.objects.get('Slip')?.state).toBe(1);
    expect(harness.events).toContain('anim:Slip');

    // Start scrollX=599 gives the raw screen rectangle 751..851 x 180..280.
    expect(activeHitTest({ visible: true, rect: activeRect(definition(1), 'Goto_5') }, 775, 220, 599)).toBe(true);

    // Complete the real bottle program before leaving: Goto -> StartW -> Setxy/Addtol/State.
    harness.runtime!.click('Botl');
    expect(harness.lastGoto).toEqual([660, 480]);
    harness.pathActive = false;
    harness.runtime!.tick();
    expect(harness.animationActive.get('Takedr1')).toBe(true);
    harness.animationActive.set('Takedr1', false);
    harness.runtime!.tick();
    expect(level1.objects.get('Botl')?.state).toBe(1);
    expect(loader.inventory).toEqual([1]);
    // The last MULT frame reference of the bottle and a runtime depth change are long-lived.
    assignImageReference(level1.objects.get('Botl')!, { file: 'Takedr1', frame: 10, slot: 1, child: 0 });
    level1.objects.get('Lect')!.depth = 3;

    harness.runtime!.click('Goto_5');
    expect(harness.lastGoto).toEqual([1250, 150]);
    harness.pathActive = false;
    harness.runtime!.tick();
    expect(loader.pending).toEqual({ scene: 39, portal: 0 });

    harness.enter(39, 0);
    const level39 = loader.state(39);
    expect(loader.game.zone).toBe(2);
    expect(land(level39, 'Goto_11').visible).toBe(true);
    expect(harness.entry).toMatchObject({ source: 'portal', position: [1100, 570], direction: 4, scroll: 352 });
    expect(harness.initRuns.get(39)).toBe(1);
    expect(activeHitTest({ visible: true, rect: activeRect(definition(39), 'Goto_11') }, 768, 400, 352)).toBe(true);

    harness.runtime!.click('Goto_11');
    expect(harness.events).toContain('goport:0');
    harness.pathActive = false;
    harness.runtime!.tick();
    expect(loader.pending).toEqual({ scene: 1, portal: 1 });

    harness.enter(1, 1);
    expect(harness.entry).toMatchObject({ source: 'portal', position: [1396, 269], direction: 6, scroll: 796 });
    // No second Init: zone stays at Level39's Setzon value and the saved Setxy is not replayed.
    expect(loader.game.zone).toBe(2);
    expect(harness.initRuns.get(1)).toBe(1);
    expect(harness.events.filter((event) => event === 'init:1')).toHaveLength(1);
    expect(level1.objects.get('Goto_5')?.visible).toBe(true);
    expect(level1.objects.get('Light0')?.visible).toBe(true);
    expect(level1.objects.get('Goto_5')?.depth).toBe(230);
    expect(level1.objects.get('Lect')?.depth).toBe(3);
    expect(level1.objects.get('Botl')).toMatchObject({
      state: 1, mult: { file: 'Takedr1', frame: 10, slot: 1, child: 0 },
    });
    expect(loader.inventory).toEqual([1]);
    // Init ran once, but Start is dispatched on every entry.
    expect(harness.events.filter((event) => event === 'start:1')).toHaveLength(2);
  });
});

function activeRect(definition: SceneDefinition, name: string) {
  const rect = definition.active.get(name)?.rect;
  if (!rect) throw new Error(`${name} has no Active rect`);
  return rect;
}

function land(state: SceneState, name: string) {
  const object = state.objects.get(name);
  if (!object) throw new Error(`${name} is not declared in scene ${state.id}`);
  return object;
}
