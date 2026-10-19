import { Container, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { applyObjectVisibility } from '../src/scene/object-visibility';
import { SceneLoader } from '../src/scene/scene-loader';
import { SceneSession } from '../src/scene/scene-session';
import { parseSceneDeclarations } from '../src/navigation/depth-sort';
import { SccRuntime } from '../src/scc/runtime';
import { catalogDefinition, loadTestSceneCatalog } from './helpers/scene-catalog';

describe('persistent world snapshots', () => {
  it('retains SCC declaration order across Object, Active and Light identities', () => {
    const declarations = parseSceneDeclarations('Object A 1 10\nActive B 2 20 0 0 30 40\nLight C 3 30\nObject D 4 40');
    expect(declarations.order).toEqual([
      { kind: 'Object', name: 'A' }, { kind: 'Active', name: 'B' },
      { kind: 'Light', name: 'C' }, { kind: 'Object', name: 'D' },
    ]);
  });

  it('captures a detached world without touching the running session or losing valid (0,0)', async () => {
    const catalog = await loadTestSceneCatalog([21]);
    const definition = catalogDefinition(catalog, 21);
    const provider = {
      ids: catalog.manifest.scenes.map((scene) => scene.id),
      has: (id: number) => id === 21,
      load: () => ({ definition, background: Texture.EMPTY }),
    };
    const session = new SceneSession(new Container(), provider, {
      createView: (sceneDefinition, state) => {
        const view = {
          root: new Container(), definition: sceneDefinition, state,
          heroPosition: [600, 400] as [number, number], heroDirection: 6, selectedItem: 0, animationLog: [],
          scc: { programs: [] as unknown[], cancelActive() {} },
          placeHero() {}, startPose() {}, dispatchInit() { return true; }, dispatchStart() { return true; },
          dispose() {},
          capturePersistentState() {
            return {
              hero: { position: [...view.heroPosition] as [number, number], direction: view.heroDirection, mode: 'navigation' as const },
              objects: new Map(state.objects), savedPosition: [...view.heroPosition] as [number, number], savedDirection: view.heroDirection,
            };
          },
        };
        return view as never;
      },
    });
    session.request(21, -1, 'boot');
    session.flush();
    session.flush();
    const view = session.view!;
    view.heroPosition = [0, 0];
    view.heroDirection = 4;
    session.loader.state(39).savedPosition = [123, 456];
    session.loader.state(39).savedDirection = 7;
    session.loader.inventory.push(5, 2, 5);
    session.loader.state(21).objects.set('Lest', {
      name: 'Lest', state: 0, depth: 500, cursorId: 6,
      mult: { file: 'K_lest', frame: 12, slot: 1, child: 8 },
      transform: { x: 219.91, y: 268.95, scaleX: 1, scaleY: 1, anchorX: 0.5, anchorY: 0.5 },
    });
    session.loader.state(21).objects.set('Lest_ten', {
      name: 'Lest_ten', state: 0, depth: 505, mult: { file: 'Startlevel', frame: 1, slot: 1, child: 7 },
    });
    applyObjectVisibility(definition, session.loader.state(21), 'Lest', false);
    const beforePrograms = view.scc.programs.length;
    const beforeHero = [...view.heroPosition];
    const snapshot = session.capturePersistentState();

    expect(snapshot).toMatchObject({ currentSceneId: 21, hero: { position: [0, 0], direction: 4, mode: 'navigation' } });
    expect(snapshot.scenes.find((scene) => scene.id === 21)?.savedPosition).toEqual([0, 0]);
    expect(snapshot.scenes.find((scene) => scene.id === 39)).toMatchObject({ initialized: false, savedPosition: [123, 456], savedDirection: 7 });
    expect(snapshot.scenes.find((scene) => scene.id === 21)?.objects.find((object) => object.name === 'Lest'))
      .toMatchObject({ state: 0, depth: 500, cursorId: 6, visible: false, image: { kind: 'empty' } });
    expect(snapshot.scenes.find((scene) => scene.id === 21)?.objects.find((object) => object.name === 'Lest_ten')?.image)
      .toEqual({ kind: 'mult', reference: { file: 'Startlevel', frame: 1, slot: 1, child: 7 } });
    expect(beforePrograms).toBe(view.scc.programs.length);
    expect(beforeHero).toEqual(view.heroPosition);

    session.loader.inventory.push(9);
    snapshot.inventory.push(11);
    snapshot.hero!.position[0] = 77;
    snapshot.map.model === 'banked-v1' && (snapshot.map.unlocked[0][3] = true);
    const savedScene39 = snapshot.scenes.find((scene) => scene.id === 39)!;
    savedScene39.savedPosition[0] = -1;
    const lest = snapshot.scenes.find((scene) => scene.id === 21)!.objects.find((object) => object.name === 'Lest')!;
    if (lest.transform) lest.transform.x = -100;
    expect(session.loader.inventory).toEqual([5, 2, 5, 9]);
    expect(session.loader.game.map.model === 'banked-v1' && session.loader.game.map.unlocked[0][3]).toBe(false);
    expect(session.loader.state(39).savedPosition).toEqual([123, 456]);
    expect(view.heroPosition).toEqual([0, 0]);
    expect(session.loader.state(21).objects.get('Lest')?.transform?.x).not.toBe(-100);
    expect(snapshot.scenes).toHaveLength(47);
  });

  it('merges SCC declarations without dropping cursor, rectangle, transform, depth or MULT identity', () => {
    const loader = new SceneLoader();
    const state = loader.state(1);
    state.objects.set('Door', {
      name: 'Door', state: 1, depth: 920, cursorId: 8, kind: 'Active', visible: true,
      rect: { left: 1, top: 2, right: 30, bottom: 40 },
      transform: { x: 12, y: 34, scaleX: 1.2, scaleY: 0.8, anchorX: 0.25, anchorY: 0.75 },
      mult: { file: 'Doors', frame: 3, slot: 4, child: 5 },
    });
    loader.declareObject(state, { name: 'Door', state: 0, depth: 10, cursorId: 0, kind: 'Active', visible: false, rect: { left: 0, top: 0, right: 1, bottom: 1 } });
    expect(state.objects.get('Door')).toEqual({
      name: 'Door', state: 1, depth: 920, cursorId: 8, kind: 'Active', visible: true,
      rect: { left: 1, top: 2, right: 30, bottom: 40 },
      transform: { x: 12, y: 34, scaleX: 1.2, scaleY: 0.8, anchorX: 0.25, anchorY: 0.75 },
      mult: { file: 'Doors', frame: 3, slot: 4, child: 5 },
    });
  });

  it('keeps unvisited Lstate placeholders distinct from declarations and retains item order/duplicates', () => {
    const loader = new SceneLoader();
    loader.lstate(44, 'To_38', 1);
    loader.inventory.push(5, 2, 5);
    const snapshot = loader.exportPersistentState([1, 44, 48], null);
    expect(snapshot.inventory).toEqual([5, 2, 5]);
    expect(snapshot.scenes.find((scene) => scene.id === 44)?.objects).toContainEqual(expect.objectContaining({ name: 'To_38', state: 1, placeholder: true }));
    expect(snapshot.scenes.find((scene) => scene.id === 44)?.initialized).toBe(false);
    expect(loader.states.has(1)).toBe(false);
    expect(loader.states.get(44)?.objects.get('To_38')?.placeholder).toBe(true);
  });

  it('tracks map bank and unlocks independently, and preserves explicit legacy zone profiles', () => {
    const loader = new SceneLoader();
    loader.unlockMapZone(2);
    loader.setMapBank(1);
    loader.unlockMapZone(2);
    loader.unlockMapZone(4);
    loader.setMapBank(0);
    expect(loader.game.map).toEqual({ model: 'banked-v1', bank: 0, unlocked: [[false, false, true, false, false, false, false], [false, false, true, false, true, false, false]] });
    loader.game.map = { model: 'legacy-zone-v1', zone: 3 };
    const snapshot = loader.exportPersistentState([], null);
    expect(snapshot.map).toEqual({ model: 'legacy-zone-v1', zone: 3 });
    expect(loader.game.map).toEqual({ model: 'legacy-zone-v1', zone: 3 });
  });

  it('executes Setmap and Setzon into the long-lived loader map without losing either bank', () => {
    const loader = new SceneLoader();
    const runtime = new SccRuntime('Click 0 Init Interface\n{\nCase 0\nSetzon 3\nSetmap 1\nSetzon 2\nBreak\n}', {
      pathActive: () => false, animationActive: () => false, startAnimation: () => {}, setPosition: () => {}, setDepth: () => {},
      setZone: (zone) => loader.unlockMapZone(zone), setMap: (bank) => loader.setMapBank(bank),
    });
    expect(runtime.dispatch('Init')).toBe(true);
    expect(loader.game.map).toEqual({ model: 'banked-v1', bank: 1, unlocked: [[false, false, false, true, false, false, false], [false, false, true, false, false, false, false]] });
  });
});
