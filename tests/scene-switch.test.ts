import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Container } from 'pixi.js';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { resolveOriginalResource, type SceneDefinition } from '../src/scene/scene-definition';
import { computeEntry } from '../src/scene/scene-entry';
import { SceneLoader, type SceneRuntime, type SceneState } from '../src/scene/scene-loader';
import { declareSceneObjects, SceneSession } from '../src/scene/scene-session';
import { hitTest, type HitTarget } from '../src/scene/scene-view';
import { SccRuntime } from '../src/scc/runtime';
import { catalogDefinition, catalogEntry, loadTestSceneCatalog, type TestSceneCatalog } from './helpers/scene-catalog';

vi.setConfig({ testTimeout: 60000 });

const publicDir = path.join(process.cwd(), 'public');
/** Every original Level<n>.scc in the corpus; Level9 does not exist. */
const ALL_SCENE_IDS = Array.from({ length: 48 }, (_, index) => index + 1).filter((id) => id !== 9);

let catalog: TestSceneCatalog;
beforeAll(async () => { catalog = await loadTestSceneCatalog([1, 39]); });

function definition(id: number): SceneDefinition { return catalogDefinition(catalog, id); }

describe('prepared scene catalog', () => {
  it('discovers every original scene, not a hand-written Level1/Level39 list', async () => {
    expect(catalog.manifest.scenes.map((scene) => scene.id)).toEqual(ALL_SCENE_IDS);
    expect(catalog.manifest.summary.total).toBe(ALL_SCENE_IDS.length);
    expect(catalog.manifest.summary.loadable).toEqual(ALL_SCENE_IDS);
    for (const entry of catalog.manifest.scenes) {
      expect(entry.loadable).toBe(true);
      expect(entry.missing.required).toEqual([]);
      for (const url of [entry.scc, entry.background, entry.mask]) {
        expect(url).toEqual(expect.any(String));
        const file = path.join(publicDir, url!);
        await expect(readFile(file)).resolves.toBeInstanceOf(Buffer);
      }
      for (const url of Object.values(entry.animations)) {
        await expect(readFile(path.join(publicDir, url))).resolves.toBeInstanceOf(Buffer);
      }
      for (const url of Object.values(entry.externalImages)) {
        await expect(readFile(path.join(publicDir, url))).resolves.toBeInstanceOf(Buffer);
      }
    }
    const index = catalog.index;
    expect(resolveOriginalResource(index, 'XSH\\SCN_37\\start.mult')).toBe('block9/Xsh/Scn_37/start.MULT');
    expect(resolveOriginalResource(index, 'XSH\\SCN_39\\start.mult')).toBe('block9/Xsh/Scn_39/Start.MULT');
    expect(resolveOriginalResource(index, 'XSH\\Base\\walk3.mult')).toBe('block1/Xsh/Base/walk3.MULT');
    expect(resolveOriginalResource(index, 'Masks\\scn_39.tif')).toBe('block0/Masks/Scn_39.TIF');
    expect(() => resolveOriginalResource(index, 'XSH\\SCN_99\\missing.mult')).toThrow(/not in the prepared index/);
  });

  it('records recursive Inc and every dependency source for Level1', () => {
    const entry = catalogEntry(catalog, 1);
    expect(entry.includes).toEqual(['/resources/Cursor.scc', '/resources/Mainhero.scc', '/resources/Ylisa.scc']);
    expect(entry.sources.background).toBe('block1/Backgrd/Scn_37.TIF');
    expect(entry.sources.mask).toBe('block0/Masks/Scn_01_1.TIF');
    expect(entry.externalImages['tzu/scn_37/botl/s0/botl.tif']).toMatch(/Botl\/S0\/botl\.png$/);
    expect(entry.requiredAnimations).toEqual(expect.arrayContaining(['Startlevel', 'Stop0', 'Stop7']));
  });

  it('derives Level1 and Level39 entirely from their original SCC text', () => {
    const level1 = definition(1);
    expect(level1.portals).toEqual([
      { direction: 5, x: 250, y: 450 },
      { direction: 6, x: 1400, y: 280 },
      { direction: 6, x: 110, y: 330 },
      { direction: 4, x: 1677, y: 560 },
      { direction: 6, x: 118, y: 340 },
    ]);
    expect(level1.focus).toEqual([120, 1, 1]);
    expect(level1.layoutAnimation).toBe('Startlevel');
    expect(level1.layout).toHaveLength(19);
    expect(level1.objects.get('Botl')).toEqual({ name: 'Botl', cursorId: 6, depth: 1000 });
    expect(level1.active.get('Goto_5')).toEqual({
      name: 'Goto_5', cursorId: 3, depth: 230,
      rect: { left: 1350, top: 180, right: 1450, bottom: 280 },
    });
    expect(level1.lights.get('Light0')).toEqual({ name: 'Light0', cursorId: 15, depth: 1000 });
    // Cursor.scc is recursively included, so its eight interface animations are
    // part of the scene exactly like Mainhero's Walk/Stop set.
    expect(level1.objects.get('Interface')).toMatchObject({ depth: 0 });
    expect(level1.mask.width).toBe(1736);
    expect(level1.animations.size).toBe(47);
    expect(level1.animations.get('Arrow')).toMatchObject({ rate: 20, loop: true });
    expect(level1.animations.get('Takedr1')).toMatchObject({ rate: 12, loop: false, locomotion: false });
    expect(level1.animations.get('Walk6')).toMatchObject({ rate: 32, loop: true, locomotion: true });

    const level39 = definition(39);
    expect(level39.portals).toEqual([
      { direction: 4, x: 1100, y: 570 },
      { direction: 5, x: 475, y: 395 },
      { direction: 0, x: 100, y: 403 },
    ]);
    expect(level39.focus).toEqual([140, 1, 1.45]);
    expect(level39.layout).toHaveLength(8);
    expect(level39.objects.get('Vaza')).toMatchObject({ depth: 128 });
    expect(level39.active.get('Goto_11')).toMatchObject({
      depth: 1000,
      rect: { left: 1090, top: 270, right: 1150, bottom: 590 },
    });
    expect(level39.mask.width).toBe(1152);
    expect(level39.animations.size).toBe(38);
    expect(level39.animations.get('Fly_c')).toMatchObject({ rate: 16, loop: true });
    expect(level39.frameDepthEvents.filter((event) => event.animation === 'Verx')).toEqual([
      { animation: 'Verx', frame: 5, objectName: 'Col_vaz', depth: 6 },
    ]);
  });
});

describe('scene entry placement', () => {
  it('uses the logical position written by the real SCC Init Setxy on first entry', () => {
    const loader = new SceneLoader();
    const state = loader.state(1);
    const level1 = definition(1);
    declareSceneObjects(loader, state, level1);
    const runtime = new SccRuntime(level1.scc, {
      pathActive: () => false,
      animationActive: () => false,
      startAnimation: () => {},
      setPosition: (x, y) => { state.savedPosition = [x, y]; },
      setDepth: () => {},
      showObject: () => {},
      hideObject: () => {},
      setZone: () => {},
      readState: (name) => state.objects.get(name)?.state ?? 0,
      writeState: (name, value) => {
        const object = state.objects.get(name);
        if (object) object.state = value;
        else state.objects.set(name, { name, state: value, depth: 0 });
      },
    });
    // The actual program runs synchronously to SclipW and writes Setxy 1199 524.
    expect(runtime.dispatch('Init')).toBe(true);
    expect(runtime.programs[0]).toMatchObject({ active: true, waiting: true });
    const entry = computeEntry(level1, state);
    expect(entry).toMatchObject({ source: 'init', position: [1199, 524], direction: 6, depth: 12, scroll: 599, snapRadius: 0 });
    expect(entry.scale).toBeCloseTo(120 / 132, 12);
  });

  it('places the hero on Level39 Portal[0] with its mask, Focus depth/scale and camera', () => {
    const entry = computeEntry(definition(39), new SceneLoader().state(39), definition(39).portals[0]);
    expect(entry).toMatchObject({ source: 'portal', position: [1100, 570], direction: 4, depth: 81, scroll: 352, snapRadius: 0 });
    expect(entry.scale).toBeCloseTo(140 / 221 * 1.45, 12);
  });

  it('applies the original 0x409874 mask correction to Level1 Portal[1]', () => {
    const entry = computeEntry(definition(1), new SceneLoader().state(1), definition(1).portals[1]);
    // Portal (1400,280) is not walkable; the same routine used for navigation targets
    // corrects it to (1396,269) at radius 11 / angle index 14.
    expect(entry).toMatchObject({ source: 'portal', position: [1396, 269], direction: 6, depth: 255, scroll: 796, snapRadius: 11, snapAngleIndex: 14 });
    expect(entry.scale).toBeCloseTo(0.32, 12);
  });

  it('reuses the saved position and direction when a scene is re-entered without a portal', () => {
    const state = new SceneLoader().state(1);
    state.initialized = true;
    state.savedPosition = [670, 477];
    state.savedDirection = 3;
    expect(computeEntry(definition(1), state)).toMatchObject({ source: 'saved', position: [670, 477], direction: 3 });
  });
});

describe('scene transition integration', () => {
  it('recreates runtime resources and keeps long-lived object state across Level1 -> Level39 -> Level1', () => {
    const events: string[] = [];
    let releases = 0;
    const loader = new SceneLoader(() => { releases++; events.push('release'); });
    const enter = (scene: number, portal: number) => {
      const def = definition(scene);
      let entry = undefined as ReturnType<typeof computeEntry> | undefined;
      loader.schedule(scene, portal);
      const switched = loader.enterPending(
        (state: SceneState, runtime: SceneRuntime) => {
          state.portals = def.portals;
          state.focus = [def.focus[0], def.focus[1], def.focus[2]];
          declareSceneObjects(loader, state, def);
          events.push(`create:${state.id}`);
          runtime.resources.add({ destroy: () => events.push(`dispose:${state.id}`) });
        },
        (state, resolvedPortal) => {
          entry = computeEntry(def, state, resolvedPortal);
          events.push(`position:${state.id}:${entry.position.join(',')}`);
        },
        (state) => events.push(`start:${state.id}`),
        (state) => {
          // Stands in for the real SCC Init: on the first Level1 entry it writes
          // Setxy 1199 524 before the placement step.
          events.push(`init:${state.id}`);
          if (state.id === 1) state.savedPosition = [1199, 524];
        },
      );
      expect(switched).toBe(true);
      return entry!;
    };

    const first = enter(1, -1);
    expect(first.source).toBe('init');
    const firstRuntime = loader.runtime;
    const level1 = loader.state(1);
    expect(level1.objects.get('Botl')).toMatchObject({ state: 0, depth: 1000 });
    expect(level1.objects.get('Goto_5')).toMatchObject({ depth: 230 });

    // Completed bottle pickup and a runtime Objzet depth change are long-lived data.
    const bottle = level1.objects.get('Botl')!;
    bottle.state = 1;
    bottle.mult = { file: 'Takedr1', frame: 10, slot: 1, child: 0 };
    level1.objects.get('Lect')!.depth = 3;
    loader.inventory.push(1);

    const toLevel39 = enter(39, 0);
    expect(toLevel39).toMatchObject({ position: [1100, 570], direction: 4, scroll: 352 });
    expect(loader.runtime?.id).toBe(39);
    expect(loader.inventory).toEqual([1]);
    expect(loader.state(39).objects.get('Arca_d')).toMatchObject({ depth: 10 });
    expect(loader.state(39).objects.get('Goto_11')).toMatchObject({ depth: 1000 });

    const backToLevel1 = enter(1, 1);
    expect(backToLevel1).toMatchObject({ position: [1396, 269], direction: 6, scroll: 796, snapRadius: 11 });
    expect(loader.runtime?.id).toBe(1);
    expect(loader.runtime).not.toBe(firstRuntime);
    expect(loader.state(1).initialized).toBe(true);
    expect(loader.state(39).initialized).toBe(true);
    expect(level1.objects.get('Botl')).toMatchObject({ state: 1, depth: 1000, mult: { file: 'Takedr1', frame: 10, slot: 1, child: 0 } });
    expect(level1.objects.get('Lect')!.depth).toBe(3);
    expect(loader.inventory).toEqual([1]);
    expect(level1.portals).toHaveLength(5);

    expect(events).toEqual([
      'release', 'create:1', 'init:1', 'position:1:1199,524', 'start:1',
      'release', 'dispose:1', 'create:39', 'init:39', 'position:39:1100,570', 'start:39',
      'release', 'dispose:39', 'create:1', 'position:1:1396,269', 'start:1',
    ]);
    expect(releases).toBe(3);
  });

  it('schedules a Level transition only for the next game-loop boundary', () => {
    const unsupported: number[] = [];
    const session = new SceneSession(new Container(), new Map(), new Map(), { onUnsupported: (scene) => unsupported.push(scene) });
    session.request(39, 0);
    expect(session.loader.pending).toEqual({ scene: 39, portal: 0 });
    expect(session.view).toBeUndefined();
    expect(session.flush()).toBe(false);
    expect(session.view).toBeUndefined();
    expect(unsupported).toEqual([39]);
    expect(session.loader.pending).toBeUndefined();
  });
});


describe('pixel hit test', () => {
  it('accepts only non-transparent pixels inside a visible, not removed sprite', () => {
    const pixels = new Uint8ClampedArray(4 * 4 * 4);
    pixels[(3 * 4 + 3) * 4 + 3] = 255;
    const target: HitTarget = { x: 100, y: 200, width: 4, height: 4, visible: true, removed: false, hitPixels: pixels };
    // Sprite is centered on (100,200) with anchor 0.5, so its box is x 98..101, y 198..201.
    expect(hitTest(target, 98, 198)).toBe(false);
    expect(hitTest(target, 101, 201)).toBe(true);
    expect(hitTest(target, 97, 200)).toBe(false);
    expect(hitTest(target, 102, 200)).toBe(false);
    expect(hitTest({ ...target, visible: false }, 101, 201)).toBe(false);
    expect(hitTest({ ...target, removed: true }, 101, 201)).toBe(false);
    expect(hitTest({ ...target, hitPixels: undefined }, 101, 201)).toBe(false);
    expect(hitTest(undefined, 101, 201)).toBe(false);
  });
});
