import { Texture, TextureSource } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { acquireBackground, releaseBackground } from '../src/scene/textures';
import { SceneView } from '../src/scene/scene-view';
import { createSceneState } from '../src/scene/scene-loader';
import { catalogDefinition, loadTestSceneCatalog } from './helpers/scene-catalog';

// Exercise the real SCC, MULT scheduler and encoded WAV durations without a
// browser canvas or audio device. Rendering and navigation are separate seams.
type DialogueView = {
  applyAnimationFrame: (...args: unknown[]) => void;
  goto: (x: number, y: number) => boolean;
  setLogicalPosition: (x: number, y: number) => void;
};

describe('Level23 repeat visit dialogue', () => {
  it('ends the grief dialogue and waits for the mirror, then the photograph', async () => {
    const catalog = await loadTestSceneCatalog([23]);
    const definition = catalogDefinition(catalog, 23);
    const backgroundUrls = [...new Set(definition.backgrounds?.values())];
    for (const url of backgroundUrls) await acquireBackground(url, async () => new Texture({ source: new TextureSource({ width: 1, height: 1 }) }));
    const state = createSceneState(23);
    state.initialized = true;
    // Level21 writes this state before the return to Level23.
    state.objects.set('Babka', { name: 'Babka', state: 4, depth: 8 });
    const view = new SceneView({
      ...definition, layout: [],
      audioResources: catalog.manifest.audioResources!,
      audioDurations: catalog.manifest.audioDurations!,
    }, state, Texture.EMPTY, { level() {}, lstate() {}, setZone() {} }, [41, 38]);
    const internals = view as unknown as DialogueView;
    internals.applyAnimationFrame = vi.fn();
    internals.goto = () => false;
    internals.setLogicalPosition = vi.fn();
    let tick = 0;
    const finish = () => {
      for (let step = 0; step < 1200; step++) { tick++; view.tick(100, tick * 100, tick); }
      expect(view.scc.busy).toBe(false);
      expect(view.scc.programs.every(program => !program.active)).toBe(true);
    };
    try {
      view.dispatchStart();
      expect(view.scc.click('Babka')).toBe(true);
      finish();
      expect(state.objects.get('Babka')?.state).toBe(5);
      expect(view.scc.inventory).toEqual([41, 38]);

      // Another ordinary click only repeats grief; it does not advance the quest.
      expect(view.scc.click('Babka')).toBe(true);
      finish();
      expect(state.objects.get('Babka')?.state).toBe(5);

      expect(view.scc.click('Babka', 41)).toBe(true);
      finish();
      expect(state.objects.get('Babka')?.state).toBe(6);
      expect(view.scc.inventory).toEqual([38]);

      expect(view.scc.click('Babka', 38)).toBe(true);
      finish();
      expect(state.objects.get('Babka')?.state).toBe(7);
      expect(state.objects.get('Star')?.state).toBe(1);
      expect(view.scc.inventory).toEqual([]);
    } finally { view.dispose(); for (const url of backgroundUrls) releaseBackground(url); }
  }, 30000);
});
