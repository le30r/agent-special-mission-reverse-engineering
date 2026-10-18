import { Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { SceneView } from '../src/scene/scene-view';
import { createSceneState } from '../src/scene/scene-loader';
import { catalogDefinition, loadTestSceneCatalog } from './helpers/scene-catalog';

const hooks = { level() {}, lstate() {}, setZone() {} };
const catalogPromise = loadTestSceneCatalog([1]);
const faults = [
  { objectName: 'Morda', voices: ['SOUND\\scn_01\\otboy\\otd_001.wav'], line: 1 },
  { objectName: 'Morda', voices: ['wrong.wav'], line: 2 },
];

async function makeView(scc = '', faultLists = faults) {
  const catalog = await catalogPromise;
  const definition = { ...catalogDefinition(catalog, 1), scc, faultLists: faultLists.map((entry) => ({ ...entry, voices: [...entry.voices] })) };
  const state = createSceneState(1);
  state.objects.set('Morda', { name: 'Morda', state: 0, depth: 1000, kind: 'Active', visible: true, rect: definition.active.get('Morda')?.rect });
  const view = new SceneView(definition, state, Texture.EMPTY, hooks, []);
  (view as unknown as { startAnimation(name: string, source: string): void }).startAnimation = () => {};
  view.placeHero({ position: [1199, 524], direction: 6, source: 'init', depth: 0, scale: 1, scroll: 599, snapRadius: 0, snapAngleIndex: 0 });
  view.setFaultRand15(() => 0);
  return view;
}

describe('Fault click fallback conditions', () => {
  it('runs fallback when the hit object has no matching Click Case', async () => {
    const view = await makeView('Click 0 Morda Morda\n{\n Case 1\n  Addtol 9\n Break\n}');
    view.pointerDown(150, 280);
    expect(view.scc.inventory).toEqual([]);
    expect(view.scc.programs.at(-1)?.program.commands.map((command) => command.op)).toEqual(['Goto', 'Setxy', 'StartW', 'Setxy']);
    expect(view.scc.programs.at(-1)?.active).toBe(true);
    view.dispose();
  });

  it('does not run fallback when a matching Click executes', async () => {
    const view = await makeView('Click 0 Morda Morda\n{\n Case 0\n  Addtol 7\n Break\n}');
    view.pointerDown(150, 280);
    expect(view.scc.inventory).toEqual([7]);
    expect(view.scc.programs.at(-1)?.program.commands.map((command) => command.op)).toEqual(['Addtol']);
    view.dispose();
  });

  it('suppresses fallback for selected items, busy, Block, hidden targets and misses', async () => {
    const source = [
      'Click 0 Lock Interface', '{', 'Case 0', 'Block', 'Break', '}',
      'Click 0 Plane Interface', '{', 'Case 0', 'Addtol 99', 'Break', '}',
    ].join('\n');
    const view = await makeView(source);
    view.selectItem(1);
    view.pointerDown(150, 280);
    expect(view.scc.programs).toHaveLength(0);
    expect(view.selectedItem).toBe(1);

    view.selectItem(0);
    view.scc.busy = true;
    view.pointerDown(150, 280);
    expect(view.scc.programs).toHaveLength(0);
    view.scc.busy = false;

    view.scc.dispatch('Lock');
    expect(view.blocked).toBe(true);
    view.pointerDown(150, 280);
    expect(view.scc.inventory).toEqual([99]);
    expect(view.blocked).toBe(true);

    view.dispose();
    const hidden = await makeView();
    hidden.state.objects.get('Morda')!.visible = false;
    hidden.pointerDown(150, 280);
    expect(hidden.scc.programs).toHaveLength(0);
    hidden.dispose();
  });

  it('leaves duplicate FaultLists distinct and picks the first matching declaration', async () => {
    const view = await makeView();
    view.pointerDown(150, 280);
    const internals = view as unknown as { faultLists: Array<{ voices: string[] }>; speakEvent: { id: number }; audio: { borrowedVoices: Map<number, number>; voices: Map<number, { event: { value: string } }> } };
    expect(internals.faultLists.map((list) => list.voices)).toEqual([['SOUND\\scn_01\\otboy\\otd_001.wav'], ['wrong.wav']]);
    const ownerId = internals.audio.borrowedVoices.get(internals.speakEvent.id);
    expect(ownerId).toBeDefined();
    expect(internals.audio.voices.get(ownerId!)?.event.value).toBe('SOUND\\scn_01\\otboy\\otd_001.wav');
    view.dispose();
  });

  it('uses normal click-to-walk when no FaultList matches', async () => {
    const view = await makeView('', []);
    view.pointerDown(150, 280);
    expect(view.scc.programs).toHaveLength(0);
    view.dispose();
  });
});
