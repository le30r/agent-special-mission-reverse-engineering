import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeMult } from '../src/mult/decoder';
import { multHitPixels } from '../src/mult/hit-pixels';
import { parseScc, SccRuntime, type SccCommand, type SccHost } from '../src/scc/runtime';
import type { SceneDefinition } from '../src/scene/scene-definition';
import { SceneLoader, type SceneState } from '../src/scene/scene-loader';
import { declareSceneObjects } from '../src/scene/scene-session';
import { applyObjectVisibility } from '../src/scene/object-visibility';
import { hitTest, firstHitTarget, type HitTarget } from '../src/scene/object-hit';
import { inventorySlotOrdinal, itemAtInventoryPosition } from '../src/scene/inventory-layout';
import { catalogDefinition, loadTestSceneCatalog, type TestSceneCatalog } from './helpers/scene-catalog';

let catalog: TestSceneCatalog;
beforeAll(async () => { catalog = await loadTestSceneCatalog([1]); });

function definition(): SceneDefinition { return catalogDefinition(catalog, 1); }

function programOf(source: string, itemId: number, event: string): SccCommand[] {
  const handler = parseScc(source).find((entry) => entry.itemId === itemId && entry.event === event);
  if (!handler) throw new Error(`No Click ${itemId} ${event}`);
  const program = handler.programs.get(0);
  if (!program) throw new Error(`No Case 0 for Click ${itemId} ${event}`);
  return program.commands;
}

type Harness = {
  loader: SceneLoader;
  state: SceneState;
  events: string[];
  runtime: SccRuntime;
  pathActive: boolean;
  animationActive: Map<string, boolean>;
};

/** Real Level1 state plus a host that records every SCC side effect. */
function harness(inventory: number[] = []): Harness {
  const loader = new SceneLoader();
  const state = loader.state(1);
  declareSceneObjects(loader, state, definition());
  const events: string[] = [];
  const animationActive = new Map<string, boolean>();
  const visibility = { objects: definition().objects, active: definition().active, lights: definition().lights };
  const result: Harness = { loader, state, events, pathActive: false, animationActive, runtime: undefined as unknown as SccRuntime };
  const host: SccHost = {
    pathActive: () => result.pathActive,
    animationActive: (name) => animationActive.get(name) ?? false,
    startAnimation: (name) => { animationActive.set(name, true); events.push(`start:${name}`); },
    stopAnimation: (name) => { animationActive.set(name, false); events.push(`stop:${name}`); },
    setPosition: (x, y) => { state.savedPosition = [x, y]; events.push(`setxy:${x},${y}`); },
    setDepth: (name, depth) => {
      const old = state.objects.get(name);
      if (old) old.depth = depth; else state.objects.set(name, { name, state: 0, depth });
      events.push(`depth:${name}:${depth}`);
    },
    setCursor: (name, value) => {
      const old = state.objects.get(name);
      if (old) old.cursorId = value; else state.objects.set(name, { name, state: 0, depth: 0, cursorId: value });
      events.push(`cursor:${name}:${value}`);
    },
    goto: (x, y) => { events.push(`goto:${x},${y}`); result.pathActive = true; return true; },
    showObject: (name) => { applyObjectVisibility(visibility, state, name, true); events.push(`show:${name}`); },
    hideObject: (name) => { applyObjectVisibility(visibility, state, name, false); events.push(`hide:${name}`); },
    setZone: (zone) => events.push(`zone:${zone}`),
    level: (scene, portal) => events.push(`level:${scene}:${portal}`),
    goport: (portal) => { events.push(`goport:${portal}`); return false; },
    lstate: (scene, name, value) => { loader.lstate(scene, name, value); events.push(`lstate:${scene}:${name}:${value}`); },
    readState: (name) => state.objects.get(name)?.state ?? 0,
    writeState: (name, value) => {
      const object = state.objects.get(name);
      if (object) object.state = value; else state.objects.set(name, { name, state: value, depth: 0 });
      events.push(`state:${name}:${value}`);
    },
  };
  result.runtime = new SccRuntime(definition().scc, host, loader.inventory);
  if (inventory.length) loader.inventory.push(...inventory);
  return result;
}

function finishPath(test: Harness): void {
  test.pathActive = false;
  test.runtime.tick();
}

function finishAnimation(test: Harness, name: string): void {
  test.animationActive.set(name, false);
  test.runtime.tick();
}

describe('original Level1 pistol interaction', () => {
  it('parses the exact Click 0 Pistol Pistol program', () => {
    expect(programOf(definition().scc, 0, 'Pistol')).toEqual([
      { op: 'Hide', name: 'Nar' },
      { op: 'Goto', x: 1060, y: 590 },
      { op: 'StartW', name: 'K_pistol' },
      { op: 'Setxy', x: 1050, y: 590 },
      { op: 'Addtol', id: 4 },
    ]);
  });

  it('is a declared base Object with a real start.MULT image, not a Click whitelist special case', () => {
    const pistol = definition().layout.find((record) => record.name === 'Pistol');
    expect(pistol).toBeDefined();
    const resolved = definition().animations.get('Startlevel')!.file.resolve(pistol!.slot, pistol!.child);
    expect(resolved.externalPath?.toLowerCase()).toContain('pistolet.tif');
    expect([resolved.width, resolved.height]).toEqual([33, 24]);
    expect(definition().objects.get('Pistol')).toMatchObject({ depth: 1000 });
  });

  it('executes Hide/Goto/StartW/Setxy/Addtol after the pixel hit', () => {
    const test = harness();
    expect(test.runtime.click('Pistol')).toBe(true);
    expect(test.events).toEqual(['hide:Nar', 'goto:1060,590']);
    expect(test.state.objects.get('Nar')?.visible).toBe(false);
    finishPath(test);
    expect(test.events).toEqual(['hide:Nar', 'goto:1060,590', 'start:K_pistol']);
    expect(test.runtime.busy).toBe(true);
    finishAnimation(test, 'K_pistol');
    expect(test.events).toEqual([
      'hide:Nar', 'goto:1060,590', 'start:K_pistol', 'setxy:1050,590',
    ]);
    expect(test.runtime.inventory).toEqual([4]);
    expect(test.runtime.programs[0].active).toBe(false);
  });

  it('removes the pistol image on K_pistol frame 20, before Addtol', async () => {
    const file = decodeMult(await readFile(path.join('agent-original/game-resources/block9/Xsh/Scn_37/Step_07.MULT')));
    const pistol = file.frames[19]?.find((record) => record.name === 'Pistol');
    expect(pistol).toBeDefined();
    const resolved = file.resolve(pistol!.slot, pistol!.child);
    expect([resolved.width, resolved.height]).toEqual([0, 0]);
    expect(file.frameCount).toBe(37);
  });
});

describe('original Level1 hammock (Slip) interaction', () => {
  it('parses the exact Click 1 Slip Flag1 program with Stop/Remtol/Cursor', () => {
    expect(programOf(definition().scc, 1, 'Slip')).toEqual([
      { op: 'Goto', x: 350, y: 470 },
      { op: 'Stop', name: 'Slip' },
      { op: 'StartW', name: 'Razres' },
      { op: 'Setxy', x: 345, y: 470 },
      { op: 'Remtol', id: 1 },
      { op: 'State', name: 'Lec_v', value: 1 },
      { op: 'Lstate', scene: 38, name: 'Goto_1', value: 1 },
      { op: 'Lstate', scene: 44, name: 'To_38', value: 1 },
      { op: 'Lstate', scene: 44, name: 'Interface', value: 1 },
      { op: 'Cursor', name: 'Lec_v', value: 2 },
      { op: 'Cursor', name: 'Slip', value: 5 },
      { op: 'State', name: 'Slip', value: 3 },
      { op: 'State', name: 'Flag1', value: 1 },
    ]);
  });

  it('does not cut without item 1; a normal click selects the talk Case 1', () => {
    const test = harness([1]);
    test.state.objects.get('Slip')!.state = 1;
    expect(test.runtime.click('Slip', 0)).toBe(true);
    expect(test.events).toEqual(['goto:253,470']);
    finishPath(test);
    expect(test.events).toEqual(['goto:253,470', 'start:Speakslip']);
    finishAnimation(test, 'Speakslip');
    expect(test.events).toEqual(['goto:253,470', 'start:Speakslip', 'setxy:253,470']);
    expect(test.state.objects.get('Flag1')?.state).toBe(0);
    expect(test.runtime.inventory).toEqual([1]);
  });

  it('cuts only with item 1 while Flag1.state is 0 and performs the whole chain', () => {
    const test = harness([1]);
    test.state.objects.get('Slip')!.state = 1;
    expect(test.state.objects.get('Flag1')?.state).toBe(0);
    expect(test.runtime.click('Slip', 1)).toBe(true);
    expect(test.events).toEqual(['goto:350,470']);
    finishPath(test);
    expect(test.events).toEqual(['goto:350,470', 'stop:Slip', 'start:Razres']);
    expect(test.runtime.busy).toBe(true);
    finishAnimation(test, 'Razres');
    expect(test.events).toEqual([
      'goto:350,470',
      'stop:Slip',
      'start:Razres',
      'setxy:345,470',
      'state:Lec_v:1',
      'lstate:38:Goto_1:1',
      'lstate:44:To_38:1',
      'lstate:44:Interface:1',
      'cursor:Lec_v:2',
      'cursor:Slip:5',
      'state:Slip:3',
      'state:Flag1:1',
    ]);
    expect(test.runtime.inventory).toEqual([]);
    expect(test.state.objects.get('Lec_v')?.state).toBe(1);
    expect(test.state.objects.get('Slip')?.state).toBe(3);
    expect(test.state.objects.get('Flag1')?.state).toBe(1);
    expect(test.state.objects.get('Lec_v')?.cursorId).toBe(2);
    expect(test.state.objects.get('Slip')?.cursorId).toBe(5);
    expect(test.loader.state(38).objects.get('Goto_1')).toMatchObject({ state: 1, placeholder: true });
    expect(test.loader.state(44).objects.get('To_38')).toMatchObject({ state: 1, placeholder: true });
    expect(test.loader.state(44).objects.get('Interface')).toMatchObject({ state: 1, placeholder: true });
    // Once Flag1 is 1 there is no matching Case for the item-1 handler any more.
    expect(test.runtime.click('Slip', 1)).toBe(false);
    expect(test.state.objects.get('Flag1')?.state).toBe(1);
  });

  it('uses an internal MULT raster for Slip hit-testing and changes image on Razres', async () => {
    const base = path.join('agent-original/game-resources/block9/Xsh/Scn_37');
    const slipLoop = decodeMult(await readFile(path.join(base, 'Step_01.MULT')));
    const razres = decodeMult(await readFile(path.join(base, 'Step_03.MULT')));
    const record = slipLoop.frames[0].find((entry) => entry.name === 'Slip')!;
    const resolved = slipLoop.resolve(record.slot, record.child);
    expect([resolved.width, resolved.height]).toEqual([224, 147]);
    const pixels = multHitPixels(resolved);
    const worldX = 1736 / 2 + record.x;
    const worldY = 300 - record.y;
    const target: HitTarget = {
      x: worldX, y: worldY, width: resolved.width, height: resolved.height,
      visible: true, removed: false, hitPixels: pixels,
    };
    // Solid body pixel (112,120), transparent centre (112,73) in the decoded raster.
    expect(hitTest(target, worldX - resolved.width / 2 + 112, worldY - resolved.height / 2 + 120)).toBe(true);
    expect(hitTest(target, worldX - resolved.width / 2 + 112, worldY - resolved.height / 2 + 73)).toBe(false);
    const first = razres.frames[0].find((entry) => entry.name === 'Slip')!;
    expect([razres.resolve(first.slot, first.child).width, razres.resolve(first.slot, first.child).height]).toEqual([367, 214]);
    const last = razres.frames[16].find((entry) => entry.name === 'Slip')!;
    expect([razres.resolve(last.slot, last.child).width, razres.resolve(last.slot, last.child).height]).toEqual([474, 341]);
  });
});

describe('handcuffs positive control', () => {
  it('still executes the original Naruchniki Active program and inventory add', () => {
    expect(programOf(definition().scc, 0, 'Naruchniki')).toEqual([
      { op: 'Goto', x: 1560, y: 580 },
      { op: 'StartW', name: 'K_nar' },
      { op: 'Setxy', x: 1560, y: 585 },
      { op: 'Addtol', id: 3 },
      { op: 'Hide', name: 'Naruchniki' },
      { op: 'Lstate', name: 'Naruch', value: 1, scene: 37 },
    ]);
    const test = harness();
    expect(test.runtime.click('Naruchniki')).toBe(true);
    expect(test.events).toEqual(['goto:1560,580']);
    finishPath(test);
    finishAnimation(test, 'K_nar');
    expect(test.runtime.inventory).toEqual([3]);
    expect(test.state.objects.get('Naruchniki')?.visible).toBe(false);
    expect(test.loader.state(37).objects.get('Naruch')).toMatchObject({ state: 1, placeholder: true });
  });
});

describe('generic base-Object hit order and inventory semantics', () => {
  it('tests objects from the reverse painter order and skips zero depth', () => {
    const solid = new Uint8ClampedArray(8 * 8 * 4);
    for (let i = 3; i < solid.length; i += 4) solid[i] = 255;
    const target = (name: string, depth: number, order: number): HitTarget & { name: string; depth: number; order: number } =>
      ({ name, x: 10, y: 10, width: 8, height: 8, visible: true, removed: false, hitPixels: solid, depth, order });
    // Larger abs(depth) is behind; equal depth keeps insertion order.
    expect(firstHitTarget([target('far', 1000, 0), target('near', 17, 1)], 10, 10)?.name).toBe('near');
    expect(firstHitTarget([target('a', 5, 0), target('b', 5, 1)], 10, 10)?.name).toBe('a');
    expect(firstHitTarget([target('zero', 0, 0), target('far', 1000, 1)], 10, 10)?.name).toBe('far');
    expect(firstHitTarget([target('near', 17, 1)], 50, 50)).toBeUndefined();
  });

  it('documents that Per_botl (depth 900) is in front of Botl (depth 1000)', () => {
    // The old single-object whitelist allowed a click at the overlapped bottle
    // centre to reach Botl. The original reverse painter-order hit test reaches the
    // nearer Per_botl there, so the bottle must be clicked on its uncovered neck.
    expect(definition().objects.get('Per_botl')?.depth).toBe(900);
    expect(definition().objects.get('Botl')?.depth).toBe(1000);
  });

  it('matches the recovered 4x5 inventory slot grid and packed item selection', () => {
    expect(inventorySlotOrdinal(487, 18)).toBeUndefined();
    expect(inventorySlotOrdinal(488, 19)).toBe(0);
    expect(inventorySlotOrdinal(547, 19)).toBe(1);
    expect(inventorySlotOrdinal(488, 119)).toBe(4);
    expect(inventorySlotOrdinal(726, 517)).toBe(19);
    expect(inventorySlotOrdinal(727, 300)).toBeUndefined();
    expect(itemAtInventoryPosition([4, 1], 548, 20)).toBe(1);
    expect(itemAtInventoryPosition([4, 1], 488, 20)).toBe(4);
    expect(itemAtInventoryPosition([4, 1], 488, 120)).toBe(-1);
  });

  it('Remtol clears every matching slot and keeps the other items', () => {
    const source = 'Click 0 Demo Demo\n{\n Case 0\n  Remtol 1\n Break\n}';
    const host: SccHost = { pathActive: () => false, animationActive: () => false, startAnimation: () => {}, setPosition: () => {}, setDepth: () => {} };
    const runtime = new SccRuntime(source, host, [1, 4, 1, 3]);
    runtime.click('Demo');
    expect(runtime.inventory).toEqual([4, 3]);
  });
});
