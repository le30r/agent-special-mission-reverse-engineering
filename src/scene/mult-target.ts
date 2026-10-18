import type { SceneObjectState } from './scene-loader';

/**
 * Original frame update: `0x405064` resolves every MULT record name through
 * `0x40a8dc` (findObject over the scene object list) and performs the image /
 * metadata assignment only when the result is non-NULL. A record whose name has
 * no SCC `Object` (or runtime `State`) identity is therefore skipped: the engine
 * never invents an object or a depth for it.
 *
 * `Active` and `Light` are distinct vtables, not drawable base objects, so they
 * are not frame-image targets here either.
 */
export function findFrameTarget(
  objects: ReadonlyMap<string, SceneObjectState>,
  name: string,
): SceneObjectState | undefined {
  const object = objects.get(name);
  if (!object) return undefined;
  if (object.kind === 'Active' || object.kind === 'Light') return undefined;
  return object;
}
