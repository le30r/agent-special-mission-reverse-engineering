import { Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { SceneLoader } from '../src/scene/scene-loader';
import { Container } from 'pixi.js';
import { SaveCodec } from '../src/scene/save-codec';
import { SceneSession, declareSceneObjects } from '../src/scene/scene-session';
import { SceneView } from '../src/scene/scene-view';
import { firstHitTarget, type DepthHitTarget } from '../src/scene/object-hit';
import { findFrameTarget } from '../src/scene/mult-target';
import { loadTestSceneCatalog, catalogDefinition } from './helpers/scene-catalog';

vi.setConfig({ testTimeout: 30000 });
vi.mock('../src/scene/textures', async original => ({
  ...await original<typeof import('../src/scene/textures')>(),
  resolvedTexture: () => Texture.EMPTY,
}));
const catalogPromise = loadTestSceneCatalog([8]);
const hooks = { level() {}, lstate() {}, setZone() {} };

async function setup() {
  const definition = catalogDefinition(await catalogPromise, 8);
  const loader = new SceneLoader();
  const state = loader.state(8);
  declareSceneObjects(loader, state, definition);
  const view = new SceneView(definition, state, Texture.EMPTY, hooks, []);
  view.dispatchInit();
  view.dispatchStart();
  state.initialized = true;
  return { definition, loader, state, view };
}

describe('Level8 barmaid and same-name Active/Object', () => {
  it('accepts a pixel click on the frozen ladder and completes the upstairs SCC program', async () => {
    const { state, view } = await setup();
    try {
      const ladder = view.objects.get('Lec_v')!;
      expect(ladder.depth).toBe(20000);
      expect(ladder.hitPixels).toBeDefined();
      const targets = (view as unknown as { hitboxObjectTargets(): DepthHitTarget[] }).hitboxObjectTargets();
      let click: [number, number] | undefined;
      for (let pixel = 0; pixel < ladder.width * ladder.height; pixel++) {
        if (!ladder.hitPixels![pixel * 4 + 3]) continue;
        const x = ladder.sprite.x - ladder.width / 2 + pixel % ladder.width + 0.5;
        const y = ladder.sprite.y - ladder.height / 2 + Math.floor(pixel / ladder.width) + 0.5;
        if (firstHitTarget(targets, x, y)?.name === 'Lec_v') { click = [x - view.scrollX, y]; break; }
      }
      expect(click).toBeDefined();
      view.scc.host.goto = vi.fn(() => false);
      view.scc.host.setPosition = vi.fn();
      const dispatch = vi.spyOn(view.scc, 'click');
      view.pointerDown(...click!);
      expect(dispatch).toHaveBeenCalledWith('Lec_v', 0);
      for (let tick = 1; tick <= 400; tick++) view.tick(50, tick * 50, tick);
      expect(view.scc.host.setPosition).toHaveBeenCalledWith(310, 185);
      expect(state.objects.get('Lec_v')?.state).toBe(1);
      expect(view.activeVisible('Barm_click')).toBe(true);
      expect(view.activeVisible('Micro')).toBe(true);
      expect(view.scc.busy).toBe(false);

      view.pointerDown(...click!);
      expect(dispatch).toHaveBeenLastCalledWith('Lec_v', 0);
      for (let tick = 401; tick <= 800; tick++) view.tick(50, tick * 50, tick);
      expect(view.scc.host.setPosition).toHaveBeenCalledWith(205, 400);
      expect(state.objects.get('Lec_v')?.state).toBe(0);
      expect(view.activeVisible('Barm_click')).toBe(false);
      expect(view.activeVisible('Micro')).toBe(false);
      expect(view.scc.busy).toBe(false);
    } finally { view.dispose(); }
  });

  it('draws the barmaid immediately while her upstairs hotspot remains hidden', async () => {
    const { state, view } = await setup();
    try {
      const identities = [...state.objects.values()].filter(object => object.name === 'Barm_click');
      expect(identities.map(object => [object.kind, object.depth])).toEqual([['Active', 50], ['Object', 995]]);
      expect(view.objectDebug('Barm_click')).toMatchObject({ sprite: 'visible', width: 58, height: 87, depth: 995 });
      expect(view.activeVisible('Barm_click')).toBe(false);
      expect(findFrameTarget(state.objects, 'barm_CLICK')?.kind).toBe('Object');
      expect(findFrameTarget(state.objects, 'To71')).toBeUndefined();
      view.tick(125, 125, 1);
      expect(view.objectDebug('Barm_click')?.sprite).toBe('visible');
      expect(state.objects.get('Barm_click')).toMatchObject({ kind: 'Active', visible: false, depth: 50 });
      expect(findFrameTarget(state.objects, 'Barm_click')?.mult?.file).toBe('Barm_c');

      // Staircase Show/Hide affects the hotspot, not the independently animated image.
      view.scc.host.showObject!('Barm_click');
      expect(view.activeVisible('Barm_click')).toBe(true);
      view.scc.host.hideObject!('Barm_click');
      expect(view.activeVisible('Barm_click')).toBe(false);
      expect(view.objectDebug('Barm_click')?.sprite).toBe('visible');
      view.scc.host.setDepth('Barm_click', 60);
      expect(view.objectDebug('Barm_click')?.depth).toBe(995);
    } finally { view.dispose(); }
  });

  it('round-trips both identities through the codec and transactional session restore', async () => {
    const definition = catalogDefinition(await catalogPromise, 8);
    const session = new SceneSession(new Container(), new Map([[8, definition]]), new Map([[8, Texture.EMPTY]]));
    try {
      session.request(8, -1);
      session.flush();
      session.flush();
      session.view!.tick(2000, 2000, 1);
      session.view!.tick(2000, 4000, 2);
      session.markPostTick();
      const saved = session.exportSave('Level8 barmaid');
      expect(saved.ok).toBe(true);
      if (!saved.ok) throw new Error(saved.error.message);
      const encoded = SaveCodec.encode(saved.value);
      if (!encoded.ok) throw new Error(encoded.error.message);
      const decoded = SaveCodec.decode(encoded.value);
      if (!decoded.ok) throw new Error(decoded.error.message);
      expect(await session.importSave(decoded.value)).toEqual({ ok: true, value: undefined });
      expect(session.view!.objectDebug('Barm_click')?.sprite).toBe('visible');
      expect(session.view!.activeVisible('Barm_click')).toBe(false);
      expect([...session.loader.state(8).objects.values()].filter(object => object.name === 'Barm_click')).toHaveLength(2);
    } finally { session.loader.disposeRuntime(); }
  });

  it.each([false, true])('retains separate image/hotspot identities across snapshots and re-entry (legacy=%s)', async legacy => {
    const { definition, loader, state, view } = await setup();
    try {
      const snapshot = loader.exportPersistentState([8], 8, view.capturePersistentState());
      const identities = snapshot.scenes[0].objects.filter(object => object.name === 'Barm_click');
      expect(identities).toHaveLength(2);
      expect(identities.find(object => object.kind === 'Active')).toMatchObject({ visible: false, image: { kind: 'unassigned' } });
      expect(identities.find(object => object.kind === 'Object')).toMatchObject({ visible: true, image: { kind: 'mult' } });
      if (legacy) snapshot.scenes[0].objects = snapshot.scenes[0].objects.filter(object => object.name !== 'Barm_click' || object.kind === 'Active');
      const restored = new SceneLoader();
      restored.restorePersistentState(snapshot);
      const restoredState = restored.state(8);
      declareSceneObjects(restored, restoredState, definition);
      declareSceneObjects(restored, restoredState, definition);
      expect([...restoredState.objects.values()].filter(object => object.name === 'Barm_click')).toHaveLength(2);
      const returned = new SceneView(definition, restoredState, Texture.EMPTY, hooks, []);
      try {
        returned.dispatchStart();
        expect(returned.objectDebug('Barm_click')?.sprite).toBe('visible');
        expect(returned.activeVisible('Barm_click')).toBe(false);
        expect(restored.readState(8, 'Barm_click')).toBe(state.objects.get('Barm_click')?.state);
      } finally { returned.dispose(); }
    } finally { view.dispose(); }
  });
});
