import type { MultObject, ResolvedMultObject } from './decoder';

/**
 * Click mask for an internal MULT raster. The original base-Object hit test reads
 * image pixels and rejects the transparent/color-key sample; MULT palette index 5
 * is the 0xB5B5B5 key and carries alpha 0, so source alpha reproduces the test
 * without the PNG conversion used for external TIFF images.
 */
const cache = new WeakMap<MultObject, Uint8ClampedArray>();

export function multHitPixels(resolved: ResolvedMultObject): Uint8ClampedArray {
  const image = resolved.image;
  const cached = cache.get(image);
  if (cached) return cached;
  const pixels = resolved.width * resolved.height;
  const rgba = new Uint8ClampedArray(pixels * 4);
  const bgra = image.bgra;
  if (bgra) {
    for (let i = 0; i < pixels; i++) rgba[i * 4 + 3] = bgra[i * 4 + 3];
  }
  cache.set(image, rgba);
  return rgba;
}
