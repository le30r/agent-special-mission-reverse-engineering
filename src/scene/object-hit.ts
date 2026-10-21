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
  scaleX?: number; scaleY?: number;
};

/**
 * Original hit test: the sprite is drawn with anchor 0.5 and the click is accepted
 * only where the prepared pixel alpha is non-zero (RGB 0xB5B5B5 is the color key).
 */
export function hitTest(target: HitTarget | undefined, x: number, y: number): boolean {
  return Boolean(target && hitRejectionReason(target, x, y) === undefined);
}

export function hitRejectionReason(target: HitTarget, x: number, y: number): string | undefined {
  if (!target.visible) return 'hidden';
  if (target.removed) return 'removed';
  if (!target.hitPixels) return 'no hit image';
  const scaleX = target.scaleX ?? 1, scaleY = target.scaleY ?? 1;
  if (scaleX === 0 || scaleY === 0) return 'outside image bounds';
  const ix = Math.floor((x - target.x) / scaleX + target.width / 2);
  const iy = Math.floor((y - target.y) / scaleY + target.height / 2);
  if (ix < 0 || iy < 0 || ix >= target.width || iy >= target.height) return 'outside image bounds';
  if (target.hitPixels[(iy * target.width + ix) * 4 + 3] === 0) return 'transparent pixel';
  return undefined;
}

export type DepthHitTarget = HitTarget & { name: string; depth: number; order: number };

export type UnifiedHitCandidate = {
  identity: string;
  name: string;
  kind: 'Object' | 'Active' | 'Light';
  depth: number;
  order: number;
  object?: HitTarget;
  active?: { visible: boolean; rect: { left: number; top: number; right: number; bottom: number } };
};

export type HitPoint = { screenX: number; screenY: number; worldX: number; worldY: number; scrollX: number };

/**
 * Shared scene picker for click input, hover and diagnostics. Geometry is the
 * browser runtime's existing geometry; equal-depth ordering remains an explicit
 * deterministic approximation pending native-sort emulation.
 */
export function pickSceneTarget<T extends UnifiedHitCandidate>(candidates: readonly T[], point: HitPoint): T | undefined {
  const ordered = [...candidates].sort((a, b) => Math.abs(a.depth) - Math.abs(b.depth) || a.order - b.order);
  for (const candidate of ordered) {
    if (!hasNativeHitDepth(candidate.depth)) continue;
    if (candidate.kind === 'Light') continue;
    if (candidate.kind === 'Active') {
      const rect = candidate.active;
      if (rect?.visible && point.screenX > rect.rect.left - point.scrollX && point.screenX < rect.rect.right - point.scrollX
        && point.screenY > rect.rect.top && point.screenY < rect.rect.bottom) return candidate;
      continue;
    }
    if (candidate.object && hitTest(candidate.object, point.worldX, point.worldY)) return candidate;
  }
  return undefined;
}

export function sceneHitRejection(candidate: UnifiedHitCandidate, point: HitPoint): string | undefined {
  if (!hasNativeHitDepth(candidate.depth)) return 'depth excluded by native hit pipeline';
  if (candidate.kind === 'Light') return 'Light always misses';
  if (candidate.kind === 'Active') {
    if (!candidate.active?.visible) return 'hidden';
    const rect = candidate.active.rect;
    return point.screenX > rect.left - point.scrollX && point.screenX < rect.right - point.scrollX
      && point.screenY > rect.top && point.screenY < rect.bottom ? undefined : 'outside Active rectangle';
  }
  return candidate.object ? hitRejectionReason(candidate.object, point.worldX, point.worldY) : 'no runtime image/geometry';
}

/** The EXE's signed abs32 followed by JG rejects both zero and INT_MIN. */
function hasNativeHitDepth(depth: number): boolean {
  const signed = depth | 0;
  const abs32 = (signed ^ (signed >> 31)) - (signed >> 31);
  return abs32 > 0;
}

/** Same order used by firstHitTarget and the SceneView input pipeline. */
export function orderedHitTargets<T extends DepthHitTarget>(targets: readonly T[]): T[] {
  return [...targets].sort((a, b) => Math.abs(a.depth) - Math.abs(b.depth) || a.order - b.order);
}

/**
 * Returns the front-most hit target. Absent evidence for the native tie order of
 * equal abs(depth), insertion order is kept as a deterministic approximation.
 */
export function firstHitTarget(targets: readonly DepthHitTarget[], x: number, y: number): DepthHitTarget | undefined {
  const ordered = orderedHitTargets(targets);
  for (const target of ordered) {
    if (Math.abs(target.depth) === 0) continue;
    if (hitTest(target, x, y)) return target;
  }
  return undefined;
}
