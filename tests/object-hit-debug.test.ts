import { describe, expect, it } from 'vitest';
import { hitRejectionReason, orderedHitTargets } from '../src/scene/object-hit';

const pixels = (alpha: number[]) => Uint8ClampedArray.from(alpha.flatMap((value) => [255, 255, 255, value]));

describe('hitbox diagnostics use the SceneView base-Object hit ordering and alpha rule', () => {
  it('reports transparent/outside pixels and preserves front-to-back overlap ordering', () => {
    const behind = { name: 'Stool', x: 10, y: 10, width: 2, height: 2, visible: true, removed: false, hitPixels: pixels([255, 0, 0, 255]), depth: 40, order: 0 };
    const front = { ...behind, name: 'Overlay', depth: 10, order: 1 };
    expect(orderedHitTargets([behind, front]).map(({ name }) => name)).toEqual(['Overlay', 'Stool']);
    expect(hitRejectionReason(behind, 10, 10)).toBeUndefined();
    expect(hitRejectionReason(front, 10, 10)).toBeUndefined();
    expect(hitRejectionReason(behind, 9, 10)).toBe('transparent pixel');
    expect(hitRejectionReason(behind, 8, 10)).toBe('outside image bounds');
  });

  it('diagnoses invisible and image-less targets without changing hit behavior', () => {
    const noImage = { x: 5, y: 5, width: 4, height: 4, visible: true, removed: false };
    expect(hitRejectionReason(noImage, 5, 5)).toBe('no hit image');
    expect(hitRejectionReason({ ...noImage, visible: false }, 5, 5)).toBe('hidden');
  });
});
