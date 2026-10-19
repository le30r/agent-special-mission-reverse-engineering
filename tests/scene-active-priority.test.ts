import { Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { SceneView } from '../src/scene/scene-view';
import { createSceneState } from '../src/scene/scene-loader';
import { catalogDefinition, loadTestSceneCatalog } from './helpers/scene-catalog';

const catalog = loadTestSceneCatalog([29]);

async function makeView() {
  const definition = catalogDefinition(await catalog, 29);
  const state = createSceneState(29);
  for (const declaration of definition.active.values()) {
    state.objects.set(declaration.name, { ...declaration, state: 0, kind: 'Active', visible: true });
  }
  const view = new SceneView(definition, state, Texture.EMPTY, {
    level() {}, lstate() {}, setZone() {}, readState: () => 9,
  }, [5]);
  // Execute the real SCC Program without browser rendering or navigation time.
  view.scc.host.goto = vi.fn(() => true);
  view.scc.host.startAnimation = vi.fn();
  view.scc.host.setPosition = vi.fn();
  return view;
}

describe('overlapping Active priority', () => {
  it('cuts Level29 Slang2 through the enclosing None rectangle', async () => {
    const view = await makeView();
    try {
      view.selectItem(5);
      view.pointerDown(431, 330);
      view.scc.tick(); // Route completion enters StartW Janitor_K.
      view.scc.tick(); // Animation completion commits State/Remtol/Hide.
      expect(view.scc.host.startAnimation).toHaveBeenCalledWith('Janitor_K');
      expect(view.state.objects.get('Janitor')?.state).toBe(1);
      expect(view.activeVisible('Slang2')).toBe(false);
      expect(view.scc.inventory).not.toContain(5);
    } finally { view.dispose(); }
  });

  it.each(['hidden', 'behind'] as const)('keeps None blocking when Slang2 is %s', async mode => {
    const view = await makeView();
    try {
      const slang = view.state.objects.get('Slang2')!;
      if (mode === 'hidden') slang.visible = false;
      else slang.depth = 221;
      view.selectItem(5);
      view.pointerDown(431, 330);
      expect(view.scc.host.startAnimation).not.toHaveBeenCalled();
      expect(view.scc.inventory).toContain(5);
    } finally { view.dispose(); }
  });
});
