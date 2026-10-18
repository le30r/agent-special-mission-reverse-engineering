import { correctPosition, depthAt, scaleAt, updateScroll, type Point } from '../navigation/router';
import type { SccPortal } from '../scc/runtime';
import type { SceneDefinition } from './scene-definition';
import type { SceneState } from './scene-loader';
import { VIEWPORT_WIDTH } from '../config';

/** Verified initial pose for a scene entered without a portal (Level1 Init start is Stop6). */
export const INITIAL_DIRECTION = 6;

export type EntrySource = 'portal' | 'saved' | 'init' | 'fallback';

/**
 * Entry placement facts. A portal coordinate is passed through the original mask
 * correction 0x409874 before the pose, depth/scale and camera are derived, exactly
 * as 0x40868c does for the first entry into a scene.
 */
export type SceneEntry = {
  position: Point;
  direction: number;
  source: EntrySource;
  depth: number;
  scale: number;
  scroll: number;
  snapRadius: number;
  snapAngleIndex: number;
};

export function computeEntry(
  definition: SceneDefinition,
  state: SceneState,
  portal?: SccPortal,
  viewportWidth = VIEWPORT_WIDTH,
): SceneEntry {
  const { mask, focus } = definition;
  let position: Point;
  let direction: number;
  let source: EntrySource;
  let snapRadius = 0;
  let snapAngleIndex = 0;
  if (portal) {
    const requested: Point = [portal.x, portal.y];
    const corrected = correctPosition(mask, requested);
    position = corrected ? corrected.point : requested;
    snapRadius = corrected?.radius ?? 0;
    snapAngleIndex = corrected?.angle ?? 0;
    direction = portal.direction;
    source = 'portal';
  } else if (state.savedPosition[0] !== 0 || state.savedPosition[1] !== 0) {
    // Re-entering a visited scene without a portal keeps the last logical position.
    // On the first visit this position was written by the real Init `Setxy`.
    position = [state.savedPosition[0], state.savedPosition[1]];
    direction = state.savedDirection;
    source = state.initialized ? 'saved' : 'init';
  } else {
    const first = definition.portals[0];
    position = first ? [first.x, first.y] : [0, 0];
    direction = first?.direction ?? INITIAL_DIRECTION;
    source = 'fallback';
  }
  return {
    position,
    direction,
    source,
    depth: depthAt(mask, Math.round(position[0]), Math.round(position[1]), focus),
    scale: Math.max(0.01, scaleAt(mask, Math.round(position[0]), Math.round(position[1]), focus)),
    scroll: updateScroll(0, position[0], mask.width, viewportWidth),
    snapRadius,
    snapAngleIndex,
  };
}
