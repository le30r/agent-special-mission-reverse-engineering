import * as UTIF from 'utif';
import type { NavigationMask } from '../navigation/router';
import { SCENE_HEIGHT } from '../config';

/** The original masks are 8-bit grayscale TIFFs; UTIF decodes them in the browser and in tests. */
export function decodeMask(bytes: ArrayBuffer | Uint8Array): NavigationMask {
  const buffer = bytes instanceof Uint8Array
    ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    : bytes;
  const ifd = UTIF.decode(buffer)[0];
  if (!ifd) throw new Error('Mask TIFF has no IFD');
  UTIF.decodeImage(buffer, ifd);
  const decoded = ifd as unknown as { width: number; height: number; data: Uint8Array; t258?: number[]; t277?: number[] };
  const width = Number(decoded.width), height = Number(decoded.height);
  const raw = decoded.data;
  if (height !== SCENE_HEIGHT || raw.length !== width * height) throw new Error(`Mask is not a ${width}x${SCENE_HEIGHT} single-channel image`);
  if (decoded.t258 && Number(decoded.t258[0]) !== 8) throw new Error('Mask is not 8-bit');
  if (decoded.t277 && Number(decoded.t277[0]) !== 1) throw new Error('Mask is not single-channel');
  return { width, height, pixels: raw.slice() };
}
