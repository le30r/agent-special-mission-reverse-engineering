import type { SceneRect } from '../navigation/depth-sort';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../config';

export type ActiveHitTarget = { visible: boolean; rect: SceneRect };
export type CanvasRect = { left: number; top: number; width: number; height: number };

/**
 * Maps raw browser client coordinates onto the original 800x600 scene viewport.
 * These are the coordinates WM_LBUTTONDOWN would deliver before any scroll.
 */
export function logicalScreenPoint(
  clientX: number,
  clientY: number,
  rect: CanvasRect,
  viewportWidth = VIEWPORT_WIDTH,
  viewportHeight = VIEWPORT_HEIGHT,
): [number, number] {
  return [
    Math.floor((clientX - rect.left) * viewportWidth / rect.width),
    Math.floor((clientY - rect.top) * viewportHeight / rect.height),
  ];
}

/** Navigation/pixel hit tests operate on world coordinates: screen + scroll, once. */
export function worldPointFromScreen(
  screenX: number,
  screenY: number,
  scrollX: number,
  scrollY = 0,
): [number, number] {
  return [screenX + scrollX, screenY + scrollY];
}

/**
 * Exact `Active` hit test from 0x404c50. The caller passes RAW window/screen
 * coordinates (the same values as WM_LBUTTONDOWN lParam); scroll is subtracted
 * here, exactly once. All four rectangle edges are strict (JLE/JGE), so a point
 * on an edge misses.
 */
export function activeHitTest(
  target: ActiveHitTarget | undefined,
  screenX: number,
  screenY: number,
  scrollX: number,
  scrollY = 0,
): boolean {
  if (!target || !target.visible) return false;
  const left = target.rect.left - scrollX;
  const right = target.rect.right - scrollX;
  const top = target.rect.top - scrollY;
  const bottom = target.rect.bottom - scrollY;
  return screenX > left && screenX < right && screenY > top && screenY < bottom;
}
