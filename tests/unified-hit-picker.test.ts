import { describe, expect, it } from 'vitest';
import { pickSceneTarget, type UnifiedHitCandidate } from '../src/scene/object-hit';

const point = { screenX: 10, screenY: 10, worldX: 10, worldY: 10, scrollX: 0 };
const opaque = new Uint8ClampedArray([0, 0, 0, 255]);
const object = (name: string, depth: number, order: number, hitPixels = opaque): UnifiedHitCandidate => ({
  identity: `Object:${name}`, name, kind: 'Object', depth, order,
  object: { x: 10, y: 10, width: 1, height: 1, visible: true, removed: false, hitPixels },
});

describe('unified scene hit picker', () => {
  it('uses one absolute-depth order across Object and Active, nearest first', () => {
    const objectTarget = object('Ognet', 1000, 0);
    const activeTarget: UnifiedHitCandidate = {
      identity: 'Active:Hotspot', name: 'Hotspot', kind: 'Active', depth: 1010, order: 1,
      active: { visible: true, rect: { left: 0, top: 0, right: 20, bottom: 20 } },
    };
    expect(pickSceneTarget([activeTarget, objectTarget], point)).toBe(objectTarget);
  });

  it('stops on an image hit even when the target has no SCC handler metadata', () => {
    const front = object('NoClick', 10, 0);
    const lower = object('HasClick', 20, 1);
    expect(pickSceneTarget([lower, front], point)?.name).toBe('NoClick');
  });

  it('treats Light, cursorId-like zero, missing images and depth zero as misses', () => {
    const light: UnifiedHitCandidate = { identity: 'Light:L', name: 'L', kind: 'Light', depth: 1, order: 0 };
    const noImage: UnifiedHitCandidate = { identity: 'Object:NoImage', name: 'NoImage', kind: 'Object', depth: 2, order: 1 };
    const zeroDepth = object('Zero', 0, 2);
    const intMinDepth = object('IntMin', -2147483648, 2);
    const valid = object('Valid', 3, 3);
    expect(pickSceneTarget([light, noImage, zeroDepth, intMinDepth, valid], point)?.name).toBe('Valid');
  });

  it('keeps current visibility and scroll-sensitive Active rectangle geometry', () => {
    const active: UnifiedHitCandidate = {
      identity: 'Active:A', name: 'A', kind: 'Active', depth: 1, order: 0,
      active: { visible: false, rect: { left: 500, top: 0, right: 600, bottom: 20 } },
    };
    const objectTarget = { ...object('O', 2, 1), object: { ...object('O', 2, 1).object!, x: 510 } };
    expect(pickSceneTarget([active, objectTarget], { ...point, screenX: 10, worldX: 510, scrollX: 500 })?.name).toBe('O');
    active.active!.visible = true;
    expect(pickSceneTarget([active, objectTarget], { ...point, screenX: 10, worldX: 510, scrollX: 500 })?.name).toBe('A');
  });
});
