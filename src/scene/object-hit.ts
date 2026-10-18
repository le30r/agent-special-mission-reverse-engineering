/**
 * Base `Object` hit-test geometry recovered from 0x40445c and 0x40a238.
 *
 * The original scene array is painter-sorted (larger abs(depth) first) and the
 * click loop walks it from the end, so the front-most object (smallest
 * abs(depth), drawn last) is tested first. A hit additionally requires a
 * non-zero depth (`+0x108`), independent of `State` (`+0x4`).
 */
export type HitTarget = {
  x: number; y: number; width: number; height: number;
  visible: boolean; removed: boolean; hitPixels?: Uint8ClampedArray;
};

/**
 * Original hit test: the sprite is drawn with anchor 0.5 and the click is accepted
 * only where the prepared pixel alpha is non-zero (RGB 0xB5B5B5 is the color key).
 */
export function hitTest(target: HitTarget | undefined, x: number, y: number): boolean {
  if (!target || !target.visible || target.removed || !target.hitPixels) return false;
  const ix = Math.floor(x - (target.x - target.width / 2));
  const iy = Math.floor(y - (target.y - target.height / 2));
  if (ix < 0 || iy < 0 || ix >= target.width || iy >= target.height) return false;
  return target.hitPixels[(iy * target.width + ix) * 4 + 3] !== 0;
}

export type DepthHitTarget = HitTarget & { name: string; depth: number; order: number };

/**
 * Returns the front-most hit target. Absent evidence for the native tie order of
 * equal abs(depth), insertion order is kept as a deterministic approximation.
 */
export function firstHitTarget(targets: readonly DepthHitTarget[], x: number, y: number): DepthHitTarget | undefined {
  const ordered = [...targets].sort((a, b) => Math.abs(a.depth) - Math.abs(b.depth) || a.order - b.order);
  for (const target of ordered) {
    if (Math.abs(target.depth) === 0) continue;
    if (hitTest(target, x, y)) return target;
  }
  return undefined;
}
