import type { SceneDeclarationKind } from '../navigation/depth-sort';
import type { SceneImageReference, SceneObjectState, SceneState } from './scene-loader';

export type VisibilityDefinition = {
  objects: ReadonlyMap<string, unknown>;
  active: ReadonlyMap<string, unknown>;
  lights: ReadonlyMap<string, unknown>;
};

export type VisibilityResult = { found: boolean; changed: boolean; clearImage: boolean; kind?: SceneDeclarationKind };

/**
 * Resolves the native object type of a name. A placeholder created by `Lstate`
 * has no declaration yet and behaves like the base `Object` class.
 */
export function declarationKind(definition: VisibilityDefinition, name: string): SceneDeclarationKind | undefined {
  if (definition.active.has(name)) return 'Active';
  if (definition.lights.has(name)) return 'Light';
  if (definition.objects.has(name)) return 'Object';
  return undefined;
}

/**
 * Applies SCC `Show`/`Hide` with the exact per-type asymmetry:
 * - `Active`/`Light`: write the +0x297 visibility byte;
 * - base `Object`: `Show` is a no-op, `Hide` empties the MULT name. The frame and
 *   record are retained by the next MULT frame event, which restores the image.
 * Unknown names are skipped silently (0x406508/0x40653b).
 */
export function applyObjectVisibility(
  definition: VisibilityDefinition,
  state: SceneState,
  name: string,
  visible: boolean,
): VisibilityResult {
  const kind = declarationKind(definition, name);
  let stored = state.objects.get(name);
  if (!stored) {
    if (!kind) return { found: false, changed: false, clearImage: false };
    stored = { name, state: 0, depth: 0, kind, visible: kind === 'Object' ? undefined : false };
    state.objects.set(name, stored);
  }
  if (kind === 'Active' || kind === 'Light') {
    const changed = stored.visible !== visible;
    stored.visible = visible;
    stored.kind = kind;
    return { found: true, changed, clearImage: false, kind };
  }
  // Base Object (and a declaration-less placeholder): Show does nothing.
  if (visible) return { found: true, changed: false, clearImage: false, kind: 'Object' };
  const changed = stored.mult !== undefined || stored.imageHidden !== true;
  stored.mult = undefined;
  stored.imageHidden = true;
  return { found: true, changed, clearImage: true, kind: 'Object' };
}

/** A MULT frame event re-assigns the image name and makes a hidden object drawable again. */
export function assignImageReference(stored: SceneObjectState, reference: SceneImageReference): void {
  stored.mult = reference;
  stored.imageHidden = false;
}
