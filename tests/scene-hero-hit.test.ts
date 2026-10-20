import { Sprite, Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { SceneView } from '../src/scene/scene-view';
import { createSceneState } from '../src/scene/scene-loader';
import { catalogDefinition, loadTestSceneCatalog } from './helpers/scene-catalog';

vi.mock('../src/scene/textures', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/scene/textures')>(),
  resolvedTexture: () => Texture.EMPTY,
}));

const catalog = loadTestSceneCatalog([30]);

async function setup(scale = 0.65, pm = 3) {
  const definition = catalogDefinition(await catalog, 30);
  const state = createSceneState(30);
  state.objects.set('Pm', { name: 'Pm', state: pm, depth: 1000 });
  const view = new SceneView(definition, state, Texture.EMPTY, {
    level() {}, lstate() {}, setZone() {},
  }, [21]);
  view.placeHero({ position: [720, 500], direction: 0, source: 'init', depth: 100, scale, scroll: 200, snapRadius: 0, snapAngleIndex: 0 });
  view.startPose();
  view.hero.scale.set(scale);
  view.heroDepth = 100;
  view.selectItem(21);
  view.scc.host.goto = vi.fn(() => true);
  view.scc.host.startAnimation = vi.fn();
  view.scc.host.setPosition = vi.fn();
  const file = definition.animations.get('Stop0')!.file;
  const record = file.frames[0].find(record => record.name === 'Mainhero')!;
  const image = file.resolve(record.slot, record.child);
  function point(opaque: boolean): [number, number] {
    const alpha = image.bgra!;
    let pixel = -1;
    for (let i = 0; i < image.width * image.height; i++) {
      if ((alpha[i * 4 + 3] !== 0) === opaque) { pixel = i; break; }
    }
    if (pixel === -1) throw new Error('Missing test pixel');
    return [
      view.hero.x - view.scrollX + (pixel % image.width + 0.5 - image.width / 2) * scale,
      view.hero.y + (Math.floor(pixel / image.width) + 0.5 - image.height) * scale,
    ];
  }
  return { view, point };
}

describe('Mainhero item hit testing', () => {
  it.each([0.65, 1.3])('uses item 21 on the scaled hero with scroll (scale %s)', async scale => {
    const { view, point } = await setup(scale);
    try {
      const [x, y] = point(true);
      expect(view.hitboxSnapshot(x, y).objects.find(o => o.name === 'Mainhero')?.hit).toBe(true);
      view.pointerDown(x, y);
      view.scc.tick();
      view.scc.tick();
      expect(view.scc.host.startAnimation).toHaveBeenCalledWith('K_protivogaz');
      expect(view.state.objects.get('Pm')?.state).toBe(4);
      expect(view.scc.inventory).not.toContain(21);
      expect(view.selectedItem).toBe(0);
    } finally { view.dispose(); }
  });

  it.each(['transparent', 'hidden', 'wrong-state'] as const)('does not use item 21 on %s', async mode => {
    const { view, point } = await setup(0.65, mode === 'wrong-state' ? 2 : 3);
    try {
      if (mode === 'hidden') view.hero.visible = false;
      view.pointerDown(...point(mode !== 'transparent'));
      view.scc.tick();
      expect(view.scc.host.goto).not.toHaveBeenCalled();
      expect(view.scc.inventory).toContain(21);
      expect(view.selectedItem).toBe(21);
    } finally { view.dispose(); }
  });

  it.each([50, 200])('orders hero against an overlapping base Object at depth %s', async depth => {
    const { view, point } = await setup();
    try {
      const [x, y] = point(true);
      const sprite = new Sprite(Texture.EMPTY);
      sprite.position.set(x + view.scrollX, y);
      view.objects.set('Overlay', {
        name: 'Overlay', sprite, depth, width: 10, height: 10,
        hitPixels: new Uint8ClampedArray(10 * 10 * 4).fill(255), removed: false, order: 0,
      });
      const click = vi.spyOn(view.scc, 'click');
      view.pointerDown(x, y);
      expect(click).toHaveBeenCalledWith(depth < 100 ? 'Overlay' : 'Mainhero', 21);
      sprite.destroy();
    } finally { view.dispose(); }
  });
});
