import { describe, expect, it } from 'vitest';
import { Container, Sprite, Texture } from 'pixi.js';
import { applyFrameDepthEvents, compareDepth, parseFrameDepthEvents, parseSceneDeclarations, parseSceneObjectDepths, pixiDepthIndex, skipsImageFrameUpdate, stableDepthOrder } from '../src/navigation/depth-sort';

describe('original painter depth order', () => {
  it('sorts descending by absolute depth, including negative and zero values', () => {
    const items = [
      { name: 'zero', depth: 0, insertionOrder: 0 },
      { name: 'neg20', depth: -20, insertionOrder: 1 },
      { name: 'pos10', depth: 10, insertionOrder: 2 },
      { name: 'neg1', depth: -1, insertionOrder: 3 },
    ];
    expect(stableDepthOrder(items).map(x => x.name)).toEqual(['neg20', 'pos10', 'neg1', 'zero']);
    expect(pixiDepthIndex(-20)).toBe(-20);
    expect(pixiDepthIndex(0)).toBe(0);
  });

  it('has no original tie-break for equal absolute depths and preserves insertion order as approximation', () => {
    const first = { name: '+12', depth: 12, insertionOrder: 0 };
    const second = { name: '-12', depth: -12, insertionOrder: 1 };
    expect(compareDepth(first, second)).toBe(0);
    expect(stableDepthOrder([first, second]).map(x => x.name)).toEqual(['+12', '-12']);
  });

  it('Pixi Container.sortChildren draws larger absolute depths first and preserves stable ties', () => {
    const container = new Container();
    container.sortableChildren = true;
    const front = new Sprite(Texture.EMPTY); front.label = 'front'; front.zIndex = pixiDepthIndex(2);
    const tiedA = new Sprite(Texture.EMPTY); tiedA.label = 'tie-a'; tiedA.zIndex = pixiDepthIndex(-12);
    const tiedB = new Sprite(Texture.EMPTY); tiedB.label = 'tie-b'; tiedB.zIndex = pixiDepthIndex(12);
    const back = new Sprite(Texture.EMPTY); back.label = 'back'; back.zIndex = pixiDepthIndex(-30);
    container.addChild(tiedA, front, tiedB, back);
    container.sortChildren();
    expect(container.children.map(child => child.label)).toEqual(['back', 'tie-a', 'tie-b', 'front']);
    // A runtime depth change reorders the same display objects on the next scene sort.
    front.zIndex = pixiDepthIndex(40);
    container.sortChildren();
    expect(container.children.map(child => child.label)).toEqual(['front', 'back', 'tie-a', 'tie-b']);
  });

  it('reads confirmed Object and distinct Active argument semantics from original Level1', async () => {
    const scc = await (await import('node:fs/promises')).readFile('agent-original/game-installed/Program_Executable_Files/Scripts/Level1.scc', 'utf8');
    const depths = parseSceneObjectDepths(scc);
    expect(depths.get('Botl')).toBe(1000);
    expect(depths.get('Pedistal')).toBe(18);
    const declarations = parseSceneDeclarations(scc);
    expect(declarations.objects.get('Lect')).toEqual({ name: 'Lect', cursorId: 5, depth: 14 });
    expect(declarations.active.get('Goto_5')).toEqual({
      name: 'Goto_5', cursorId: 3, depth: 230,
      rect: { left: 1350, top: 180, right: 1450, bottom: 280 },
    });
    expect(declarations.objects.has('Goto_5')).toBe(false);
  });

  it('applies only original end=-1 depth Fram events for Level1 and Level14 animation frames', async () => {
    const base = 'agent-original/game-installed/Program_Executable_Files/Scripts/';
    const fs = await import('node:fs/promises');
    const [level1, level14] = await Promise.all(['Level1.scc', 'Level14.scc'].map(file => fs.readFile(base + file, 'utf8')));
    const changes: string[] = [];
    applyFrameDepthEvents(parseFrameDepthEvents(level1), 'Razres', 3, (name, depth) => changes.push(`${name}:${depth}`));
    applyFrameDepthEvents(parseFrameDepthEvents(level14), 'K_stand', 1, (name, depth) => changes.push(`${name}:${depth}`));
    applyFrameDepthEvents(parseFrameDepthEvents(level14), 'K_stand', 23, (name, depth) => changes.push(`${name}:${depth}`));
    expect(changes).toEqual(['Y_lec_r:14', 'Pocruv:165', 'Pocruv:160']);
    expect(parseFrameDepthEvents(level14).some(event => event.animation === 'K_stand' && event.frame === 23)).toBe(true);
  });

  it('preserves the original >=10000 special image-update threshold', () => {
    expect(skipsImageFrameUpdate(9999)).toBe(false);
    expect(skipsImageFrameUpdate(10000)).toBe(true);
    expect(skipsImageFrameUpdate(100000)).toBe(true);
    // The special threshold does not replace the engine's absolute-depth sort key.
    expect(pixiDepthIndex(100000)).toBe(-100000);
  });
});
