import { Container, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import type { SceneDefinition } from '../src/scene/scene-definition';
import { SceneSession, type LoadedScene, type SceneProvider } from '../src/scene/scene-session';
import type { SceneView } from '../src/scene/scene-view';
import { catalogDefinition, loadTestSceneCatalog, type TestSceneCatalog } from './helpers/scene-catalog';

vi.setConfig({ testTimeout: 60000 });

type Deferred = { promise: Promise<LoadedScene>; resolve: (scene: LoadedScene) => void; reject: (error: Error) => void };
type TestProvider = SceneProvider & {
  pending: Map<number, Deferred>;
  released: Array<{ id: number; scene: LoadedScene }>;
};

function deferredProvider(ids: number[]): TestProvider {
  const pending = new Map<number, Deferred>();
  const released: Array<{ id: number; scene: LoadedScene }> = [];
  return {
    ids,
    pending,
    released,
    has: (id) => ids.includes(id),
    load(id) {
      let resolve!: (scene: LoadedScene) => void;
      let reject!: (error: Error) => void;
      const promise = new Promise<LoadedScene>((res, rej) => { resolve = res; reject = rej; });
      pending.set(id, { promise, resolve, reject });
      return promise;
    },
    release(id, scene) { released.push({ id, scene }); },
  };
}

function fakeViewFactory(order: string[]) {
  return (definition: SceneDefinition): SceneView => {
    const view = {
      root: new Container(),
      definition,
      state: { savedDirection: 6 },
      scc: { inventory: [] as number[], cancelActive: () => {} },
      selectedItem: 0,
      animationLog: [] as string[],
      disposed: false,
      blockReason: undefined as string | undefined,
      initRuns: 0,
      startRuns: 0,
      id: definition.id,
      placeHero: () => order.push(`place:${definition.id}`),
      startPose: () => order.push(`pose:${definition.id}`),
      dispatchInit: () => { view.initRuns++; order.push(`init:${definition.id}`); return true; },
      dispatchStart: () => { view.startRuns++; order.push(`start:${definition.id}`); return true; },
      selectItem: () => {},
      pointerDown: () => {},
      tick: () => {},
      inTick: false,
      saveBlockReason: () => view.blockReason,
      status: () => ({ scene: definition.id, position: [0, 0], direction: 6, depth: 0, scale: 1, scroll: 0, objects: 0, inventory: [], selectedItem: 0, active: {} }),
      objectDebug: () => undefined,
      depthReport: () => '',
      animationReport: () => '',
      dispose: () => { view.disposed = true; order.push(`dispose:${definition.id}`); view.root.destroy({ children: true }); },
    };
    return view as unknown as SceneView;
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

let sharedCatalog: Promise<TestSceneCatalog> | undefined;

async function setup() {
  sharedCatalog ??= loadTestSceneCatalog([1, 39, 40]);
  const catalog = await sharedCatalog;
  const provider = deferredProvider([1, 39, 40]);
  const order: string[] = [];
  const errors: Array<{ scene: number; message: string }> = [];
  const session = new SceneSession(new Container(), provider, {
    createView: (definition, _state, _background, _hooks, _inventory) => fakeViewFactory(order)(definition),
    onLoadError: (scene, error) => errors.push({ scene, message: error.message }),
  });
  return {
    session,
    provider,
    order,
    errors,
    scene1: { definition: catalogDefinition(catalog, 1), background: Texture.EMPTY },
    scene39: { definition: catalogDefinition(catalog, 39), background: Texture.EMPTY },
    scene40: { definition: catalogDefinition(catalog, 40), background: Texture.EMPTY },
  };
}

describe('lazy scene loading and release', () => {
  it('offers Save only at a post-tick boundary and denies pending transitions or unsafe views', async () => {
    const {session,provider,scene1}=await setup();
    session.request(1,-1,'boot'); session.flush();
    provider.pending.get(1)!.resolve(scene1); await tick(); session.flush();
    expect(session.canSave()).toMatchObject({ok:false,code:'Busy'});
    session.markPostTick();
    expect(session.canSave()).toEqual({ok:true});
    (session.view as unknown as {blockReason?:string}).blockReason='hero is moving';
    expect(session.canSave()).toMatchObject({ok:false,code:'Busy',reason:'hero is moving'});
    (session.view as unknown as {blockReason?:string}).blockReason=undefined;
    session.request(39,0);
    expect(session.canSave()).toMatchObject({ok:false,code:'TransitionInProgress'});
  });

  it('keeps the old scene until the requested scene resources have loaded', async () => {
    const { session, provider, order, scene1, scene39 } = await setup();
    session.request(1, -1, 'boot');
    expect(session.flush()).toBe(false);
    expect(session.view).toBeUndefined();
    expect(session.loading).toBe(1);
    provider.pending.get(1)!.resolve(scene1);
    await tick();
    expect(session.flush()).toBe(true);
    expect(session.view?.definition.id).toBe(1);
    expect(order).toEqual(['init:1', 'place:1', 'pose:1', 'start:1']);

    session.request(39, 0);
    expect(session.flush()).toBe(false);
    expect(session.view?.definition.id).toBe(1);
    expect(session.loader.pending).toEqual({ scene: 39, portal: 0 });
    provider.pending.get(39)!.resolve(scene39);
    await tick();
    expect(session.flush()).toBe(true);
    expect(session.view?.definition.id).toBe(39);
    // Old view was disposed before the provider released the old resources.
    expect(order).toEqual(['init:1', 'place:1', 'pose:1', 'start:1', 'dispose:1', 'init:39', 'place:39', 'pose:39', 'start:39']);
    expect(provider.released.map((entry) => entry.id)).toEqual([1]);
  });

  it('re-enters without a second Init and releases the previous scene definition', async () => {
    const { session, provider, scene1, scene39 } = await setup();
    session.request(1, -1);
    session.flush();
    provider.pending.get(1)!.resolve(scene1);
    await tick();
    session.flush();

    session.request(39, 0);
    session.flush();
    provider.pending.get(39)!.resolve(scene39);
    await tick();
    session.flush();

    session.request(1, 1);
    session.flush();
    provider.pending.get(1)!.resolve(scene1);
    await tick();
    expect(session.flush()).toBe(true);
    expect(session.view?.definition.id).toBe(1);
    expect(session.initRuns.get(1)).toBe(1);
    expect(session.initRuns.get(39)).toBe(1);
    expect(provider.released.map((entry) => entry.id)).toEqual([1, 39]);
  });

  it('reports a load failure and keeps the current scene active', async () => {
    const { session, provider, errors, scene1 } = await setup();
    session.request(1, -1);
    session.flush();
    provider.pending.get(1)!.resolve(scene1);
    await tick();
    session.flush();

    session.request(39, 0);
    expect(session.flush()).toBe(false);
    provider.pending.get(39)!.reject(new Error('missing MULT'));
    await tick();
    expect(session.flush()).toBe(false);
    expect(session.view?.definition.id).toBe(1);
    expect(session.loadError).toMatchObject({ scene: 39, message: 'missing MULT' });
    expect(errors).toEqual([{ scene: 39, message: 'missing MULT' }]);
  });

  it('ignores a superseded load instead of switching to it', async () => {
    const { session, provider, scene1, scene39, scene40 } = await setup();
    session.request(1, -1);
    session.flush();
    provider.pending.get(1)!.resolve(scene1);
    await tick();
    session.flush();

    session.request(39, 0);
    session.flush();
    session.request(40, 0);
    expect(session.flush()).toBe(false);
    // The first request's resources arrive late: they must not become active.
    provider.pending.get(39)!.resolve(scene39);
    await tick();
    expect(session.view?.definition.id).toBe(1);
    expect(provider.released.some((entry) => entry.id === 39)).toBe(true);
    provider.pending.get(40)!.resolve(scene40);
    await tick();
    expect(session.flush()).toBe(true);
    expect(session.view?.definition.id).toBe(40);
  });
});
