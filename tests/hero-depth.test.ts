import { Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { depthAt } from '../src/navigation/router';
import { createSceneState, SceneLoader } from '../src/scene/scene-loader';
import { declareSceneObjects } from '../src/scene/scene-session';
import { SceneView } from '../src/scene/scene-view';
import { catalogDefinition, loadTestSceneCatalog } from './helpers/scene-catalog';

vi.mock('../src/scene/textures', async (original) => ({
  ...await original<typeof import('../src/scene/textures')>(),
  resolvedTexture: () => Texture.EMPTY,
  cachedExternalTexture: () => ({ texture: Texture.EMPTY, width: 1, height: 1, hitPixels: new Uint8ClampedArray([255, 255, 255, 255]) }),
}));

const catalog = loadTestSceneCatalog([1, 2]);

async function setup(id = 1) {
  const definition = catalogDefinition(await catalog, id);
  const state = createSceneState(id);
  declareSceneObjects(new SceneLoader(), state, definition);
  const view = new SceneView(definition, state, Texture.EMPTY, { level() {}, lstate() {}, setZone() {} }, []);
  view.scc.host.setPosition(670, 477);
  return view;
}

describe('scripted Mainhero depth', () => {
  it.each([
    [1, 'Goto2', 8, 20],
    [1, 'Vniz', 1, 20],
    [1, 'Vniz', 65, 14],
    [2, 'Gotoiz18', 1, 1000],
  ] as const)('preserves Level%s %s frame%s depth %s through idle ticks', async (id, animation, frame, depth) => {
    const view = await setup(id);
    try {
      (view as unknown as { applyAnimationFrame(name: string, frame: number, source: string): void }).applyAnimationFrame(animation, frame, 'animation-update');
      for (let tick = 1; tick <= 3; tick++) view.tick(16, tick * 16, tick);
      expect(view.heroDepth).toBe(depth);
      expect(view.hero.zIndex).toBe(-depth);
      expect(view.state.objects.get('Mainhero')?.depth).toBe(depth);
      expect(view.depthSnapshot().hero.origin).toContain(`${animation} frame ${frame}`);
    } finally { view.dispose(); }
  });

  it('moves the hero behind Level1 Pedistal during the exit animation, then restores mask depth on Setxy', async () => {
    const view = await setup();
    try {
      view.tick(0, 0, 0);
      expect(view.heroDepth).toBe(14);
      expect(view.depthSnapshot().objects.find(object => object.name === 'Pedistal')?.relation).toBe('behind hero');
      view.scc.host.startAnimation('Goto2');
      for (let tick = 1; tick <= 20; tick++) view.tick(16, tick * 16, tick);
      expect(view.heroDepth).toBe(20);
      expect(view.depthSnapshot().objects.find(object => object.name === 'Pedistal')?.relation).toBe('in front of hero');
      view.scc.host.setPosition(670, 477);
      view.tick(0, 320, 21);
      expect(view.heroDepth).toBe(14);
      expect(view.depthSnapshot().objects.find(object => object.name === 'Pedistal')?.relation).toBe('behind hero');
    } finally { view.dispose(); }
  });

  it('applies Objzet to the dedicated hero sprite and refreshes depth when walking resumes', async () => {
    const view = await setup();
    try {
      view.scc.host.setDepth('mainhero', 1000);
      view.tick(16, 16, 1);
      expect(view.heroDepth).toBe(1000);
      expect(view.hero.zIndex).toBe(-1000);
      view.scc.host.goto!(700, 477);
      view.tick(16, 32, 2);
      view.tick(16, 48, 3);
      const [x, y] = view.status().position;
      expect(view.heroDepth).toBe(depthAt(view.definition.mask, x, y, view.definition.focus));
      expect(view.heroDepth).not.toBe(1000);
      expect(view.state.objects.get('Mainhero')?.depth).toBe(view.heroDepth);
    } finally { view.dispose(); }
  });

  it('restores saved object-space depth without replacing it with the navigation mask', async () => {
    const view = await setup();
    try {
      view.setObjectDepth('Mainhero', 1000, { kind: 'fram', detail: 'saved transition' });
      view.restoreHero('object', [670, 477]);
      view.tick(16, 16, 1);
      expect(view.heroDepth).toBe(1000);
      expect(view.hero.zIndex).toBe(-1000);
      view.restoreHero('navigation', [670, 477]);
      expect(view.heroDepth).toBe(14);
    } finally { view.dispose(); }
  });
});
