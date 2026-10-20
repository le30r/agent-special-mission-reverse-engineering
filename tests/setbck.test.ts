import { Texture, TextureSource } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SccRuntime, parseScc } from '../src/scc/runtime';
import { SceneView } from '../src/scene/scene-view';
import { createSceneState } from '../src/scene/scene-loader';
import { SceneAssetProvider } from '../src/scene/scene-source';
import * as textures from '../src/scene/textures';
import { catalogDefinition, fileSceneReader, loadTestSceneCatalog } from './helpers/scene-catalog';

vi.setConfig({ testTimeout: 30000 });
vi.mock('../src/scene/textures', async (original) => ({
  ...await original<typeof import('../src/scene/textures')>(),
  resolvedTexture: () => Texture.EMPTY,
}));
afterEach(() => vi.restoreAllMocks());
const catalogPromise = loadTestSceneCatalog([23]);
const image = () => new Texture({ source: new TextureSource({ width: 800, height: 600 }) });

describe('Setbck', () => {
  it('parses and executes in source order without changing the resource name', () => {
    const source = 'Click 0 Start Interface\n{\nCase 0\nSetbck BACKGRD\\Scn_23_1.tif\nState Done 1\nBreak\n}';
    expect(parseScc(source)[0].programs.get(0)?.commands[0]).toEqual({ op: 'Setbck', path: 'BACKGRD\\Scn_23_1.tif' });
    const order: string[] = [];
    const runtime = new SccRuntime(source, {
      pathActive: () => false, animationActive: () => false,
      startAnimation() {}, setPosition() {}, setDepth() {},
      setBackground: path => order.push(path), writeState: name => order.push(name),
    });
    runtime.dispatch('Start');
    expect(order).toEqual(['BACKGRD\\Scn_23_1.tif', 'Done']);
    expect(runtime.programs.every(program => !program.active)).toBe(true);
  });

  it('switches the actual backdrop on entry/re-entry, and keeps the initial background in other states', async () => {
    const definition = catalogDefinition(await catalogPromise, 23);
    expect([...definition.backgrounds!.keys()]).toEqual(['backgrd/scn_23.tif', 'backgrd/scn_23_1.tif']);
    const loaded = new Map<string, Texture>();
    try {
      for (const url of new Set(definition.backgrounds!.values())) loaded.set(url, await textures.acquireBackground(url, async () => image()));
      const initial = loaded.get(definition.background)!;
      const broken = loaded.get(definition.backgrounds!.get('backgrd/scn_23_1.tif')!)!;
      for (const babka of [4, 5, 6, 7, 4]) {
        const state = createSceneState(23);
        state.initialized = true;
        state.objects.set('Babka', { name: 'Babka', state: babka, depth: 8 });
        const view = new SceneView({ ...definition, layout: [] }, state, initial, { level() {}, lstate() {}, setZone() {} }, []);
        try {
          view.dispatchStart();
          expect((view as unknown as { backdrop: { texture: Texture } }).backdrop.texture).toBe(babka < 7 ? broken : initial);
        } finally { view.dispose(); }
        // Views borrow the texture; leaving one must not destroy a shared asset.
        expect(broken.destroyed).toBe(false);
      }
    } finally { for (const url of loaded.keys()) textures.releaseBackground(url); }
    expect([...loaded.values()].every(texture => texture.destroyed)).toBe(true);
  });

  it.each([false, true])('preloads all scene backgrounds and releases acquired references (failure=%s)', async fail => {
    const { manifest } = await catalogPromise;
    const entry = manifest.scenes.find(scene => scene.id === 23)!;
    const urls = [...new Set([entry.background!, ...Object.values(entry.backgrounds!)])];
    const texture = image();
    const acquire = vi.spyOn(textures, 'acquireBackground').mockImplementation(async url => {
      if (fail && url === urls[1]) throw new Error('background failed');
      return texture;
    });
    const release = vi.spyOn(textures, 'releaseBackground').mockImplementation(() => {});
    vi.spyOn(textures, 'preloadExternalTextures').mockResolvedValue([]);
    vi.spyOn(textures, 'releaseExternalTextures').mockImplementation(() => {});
    const provider = new SceneAssetProvider(manifest, fileSceneReader);
    try {
      if (fail) {
        await expect(provider.load(23)).rejects.toThrow('background failed');
        expect(provider.loadedCount).toBe(0);
        expect(release.mock.calls.map(([url]) => url)).toEqual([urls[0]]);
      } else {
        await provider.load(23);
        expect(provider.loadedCount).toBe(1);
        provider.release(23);
        provider.release(23);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(provider.loadedCount).toBe(0);
        expect(release.mock.calls.map(([url]) => url)).toEqual(urls);
      }
      expect(acquire.mock.calls.map(([url]) => url)).toEqual(urls);
    } finally { provider.release(23); texture.destroy(true); }
  });

  it('shares all Setbck assets across transactional provider forks and reacquires after final release', async () => {
    const { manifest } = await catalogPromise;
    const entry = manifest.scenes.find(scene => scene.id === 23)!;
    const urls = [...new Set([entry.background!, ...Object.values(entry.backgrounds!)])];
    const provider = new SceneAssetProvider(manifest, fileSceneReader);
    const fork = provider.fork() as SceneAssetProvider;
    const created: Texture[] = [];
    const acquire = vi.spyOn(textures, 'acquireBackground').mockImplementation(async () => {
      const texture = image();
      created.push(texture);
      return texture;
    });
    const release = vi.spyOn(textures, 'releaseBackground').mockImplementation(() => {});
    vi.spyOn(textures, 'preloadExternalTextures').mockResolvedValue([]);
    vi.spyOn(textures, 'releaseExternalTextures').mockImplementation(() => {});

    try {
      const activeScene = await provider.load(23);
      expect(provider.lastLoadResourceTimings.backgroundTextureMs).toBeGreaterThanOrEqual(0);
      const candidateScene = await fork.load(23);
      expect(candidateScene).toBe(activeScene);
      expect(acquire.mock.calls.map(([url]) => url)).toEqual(urls);
      expect(fork.lastLoadResourceTimings.backgroundTextureMs).toEqual(0);

      // A failed candidate transaction releases only its lease; active scene remains valid.
      provider.release(23);
      expect(release).not.toHaveBeenCalled();
      expect(candidateScene.background.destroyed).toBe(false);
      fork.release(23);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(release.mock.calls.map(([url]) => url)).toEqual(urls);

      await provider.load(23);
      expect(acquire).toHaveBeenCalledTimes(urls.length * 2);
      provider.release(23);
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(release.mock.calls.map(([url]) => url)).toEqual([...urls, ...urls]);
    } finally {
      provider.release(23);
      fork.release(23);
      for (const texture of created) texture.destroy(true);
    }
  });
});
