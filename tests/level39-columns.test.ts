import { beforeAll, describe, expect, it } from 'vitest';
import { applyFrameDepthEvents, pixiDepthIndex, stableDepthOrder } from '../src/navigation/depth-sort';
import { depthAt, sample } from '../src/navigation/router';
import { SccRuntime, type SccHost } from '../src/scc/runtime';
import { computeEntry } from '../src/scene/scene-entry';
import { SceneLoader, depthOriginLabel, setStateDepth, type SceneState } from '../src/scene/scene-loader';
import { declareSceneObjects } from '../src/scene/scene-session';
import { findFrameTarget } from '../src/scene/mult-target';
import { catalogDefinition, loadTestSceneCatalog, type TestSceneCatalog } from './helpers/scene-catalog';
import type { SceneDefinition } from '../src/scene/scene-definition';

let catalog: TestSceneCatalog;
let level39: SceneDefinition;

beforeAll(async () => {
  catalog = await loadTestSceneCatalog();
  level39 = catalogDefinition(catalog, 39);
});

function declaredLevel39(): { loader: SceneLoader; state: SceneState } {
  const loader = new SceneLoader();
  const state = loader.state(39);
  declareSceneObjects(loader, state, level39);
  return { loader, state };
}

describe('Level39 column painter order', () => {
  it('does not invent sprites for MULT-only column pieces (Goto, Ygol)', () => {
    const { state } = declaredLevel39();
    const layoutNames = level39.layout.map((record) => record.name);
    expect(layoutNames).toEqual(['Goto', 'Goto_1', 'Vaza', 'Ygol', 'Arca_d', 'Col_vaz', 'Col_all', 'Cust_go47']);

    // Original 0x405064 calls 0x40a8dc(findObject) and skips a record when it is NULL.
    const renderable = layoutNames.filter((name) => findFrameTarget(state.objects, name));
    expect(renderable).toEqual(['Goto_1', 'Vaza', 'Arca_d', 'Col_vaz', 'Col_all', 'Cust_go47']);
    expect(renderable).not.toContain('Goto');
    expect(renderable).not.toContain('Ygol');
    expect(state.objects.has('Goto')).toBe(false);
    expect(state.objects.has('Ygol')).toBe(false);
  });

  it('keeps the declared column depths and their original painter order', () => {
    const { state } = declaredLevel39();
    const depths = Object.fromEntries(['Goto_1', 'Vaza', 'Arca_d', 'Col_vaz', 'Col_all', 'Cust_go47']
      .map((name) => [name, state.objects.get(name)!.depth]));
    expect(depths).toEqual({ Goto_1: 1000, Vaza: 128, Arca_d: 10, Col_vaz: 226, Col_all: 1000, Cust_go47: 225 });

    const order = stableDepthOrder(Object.entries(depths).map(([name, depth], insertionOrder) => ({ name, depth, insertionOrder })));
    expect(order.map((item) => item.name)).toEqual(['Goto_1', 'Col_all', 'Col_vaz', 'Cust_go47', 'Vaza', 'Arca_d']);
    // Larger |depth| is earlier/behind; the two missing pieces would have been zIndex 0.
    expect(pixiDepthIndex(depths.Col_all)).toBe(-1000);
    expect(pixiDepthIndex(depths.Col_vaz)).toBe(-226);
    expect(pixiDepthIndex(depths.Arca_d)).toBe(-10);
  });

  it('records SCC declaration provenance for every declared column object', () => {
    const { state } = declaredLevel39();
    for (const name of ['Col_all', 'Col_vaz', 'Arca_d', 'Cust_go47', 'Goto_1', 'Vaza']) {
      expect(state.objects.get(name)?.depthProvenance).toEqual({
        kind: 'declaration',
        detail: 'Level39.scc Object',
      });
    }
    expect(depthOriginLabel(state.objects.get('Col_all')?.depthProvenance)).toBe('SCC declaration (Level39.scc Object)');
  });

  it('tracks real Level39 Objzet and Fram depth changes with their origin', () => {
    const { state } = declaredLevel39();
    const host: SccHost = {
      pathActive: () => false,
      // StartW Vniz suspends the real Start program until the animation ends.
      animationActive: (name) => name === 'Vniz',
      startAnimation: () => {},
      setPosition: () => {},
      setDepth: (name, depth) => setStateDepth(state, name, depth, { kind: 'objzet' }),
      showObject: () => {},
      hideObject: () => {},
    };
    const runtime = new SccRuntime(level39.scc, host);
    runtime.states.set('Goto_40', 1);
    expect(runtime.click('Start')).toBe(true);
    expect(state.objects.get('Col_all')).toMatchObject({ depth: 5, depthProvenance: { kind: 'objzet' } });
    expect(state.objects.get('Col_vaz')).toMatchObject({ depth: 6, depthProvenance: { kind: 'objzet' } });

    // Real `Fram 5 -1 1 Col_vaz 6` inside Sound Verx.
    applyFrameDepthEvents(level39.frameDepthEvents, 'Verx', 5, (name, depth) =>
      setStateDepth(state, name, depth, { kind: 'fram', detail: 'Verx frame 5' }));
    expect(state.objects.get('Col_vaz')).toMatchObject({
      depth: 6,
      depthProvenance: { kind: 'fram', detail: 'Verx frame 5' },
    });
    expect(depthOriginLabel(state.objects.get('Col_vaz')?.depthProvenance)).toBe('SCC Fram (Verx frame 5)');

    // Real `Fram 144 -1 1 Col_all 1010` / `Col_vaz 1000` inside Sound Vniz.
    applyFrameDepthEvents(level39.frameDepthEvents, 'Vniz', 144, (name, depth) =>
      setStateDepth(state, name, depth, { kind: 'fram', detail: 'Vniz frame 144' }));
    expect(state.objects.get('Col_all')).toMatchObject({ depth: 1010, depthProvenance: { kind: 'fram', detail: 'Vniz frame 144' } });
    expect(state.objects.get('Col_vaz')).toMatchObject({ depth: 1000, depthProvenance: { kind: 'fram', detail: 'Vniz frame 144' } });
  });

  it('keeps every Level1 Startlevel record, so the frame-target filter is not over-broad', () => {
    const level1 = catalogDefinition(catalog, 1);
    const loader = new SceneLoader();
    const state = loader.state(1);
    declareSceneObjects(loader, state, level1);
    const names = level1.layout.map((record) => record.name);
    expect(names).toHaveLength(19);
    const renderable = names.filter((name) => findFrameTarget(state.objects, name));
    expect(renderable).toEqual(names);
  });

  it('does not blame the walkable mask: the hero stands on a valid pixel in front of the column base', () => {
    const { state } = declaredLevel39();
    const entry = computeEntry(level39, state, level39.portals[0]);
    expect(entry).toMatchObject({ source: 'portal', position: [1100, 570], direction: 4, depth: 81, scroll: 352 });

    // Reproduced visual position: world (505,485), where only the hero's legs were
    // visible behind the MULT-only `Goto` piece before this fix.
    expect(sample(level39.mask, 505, 485)).toBe(152);
    expect(depthAt(level39.mask, 505, 485, level39.focus)).toBe(152);
    expect(sample(level39.mask, 505, 485)).toBeGreaterThan(0);

    const goto = level39.layout.find((record) => record.name === 'Goto')!;
    const gotoX = level39.mask.width / 2 + goto.x;
    const gotoY = level39.mask.height / 2 - goto.y;
    expect(gotoX).toBeCloseTo(475.95, 2);
    expect(gotoY).toBeCloseTo(326.22, 2);
    // Hero feet (y=485) are below the piece base (~431), i.e. in front of it.
    expect(485).toBeGreaterThan(gotoY + 209 / 2);
  });
});
