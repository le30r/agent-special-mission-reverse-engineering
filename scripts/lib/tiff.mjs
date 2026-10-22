import UTIF from 'utif';

/** Original JPEG-in-TIFF backgrounds omit RowsPerStrip, which FFmpeg rejects.
 * Reassemble the single JPEG strip with its TIFF JPEG tables and color metadata,
 * without recompressing it. These originals store RGB, not implicit JPEG YCbCr.
 * Other TIFFs pass through unchanged for FFmpeg's normal TIFF decoder.
 */
export function tiffImageInput(bytes) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const ifd = UTIF.decode(buffer)[0];
  if (!ifd) throw new Error('TIFF contains no image');
  if (ifd.t259?.[0] !== 7 || ifd.t273?.length !== 1) return bytes;
  const offset = ifd.t273[0], size = ifd.t279?.[0];
  if (!Number.isInteger(size) || size < 4 || offset < 0 || offset + size > bytes.length) throw new Error('Invalid TIFF JPEG strip range');
  const jpeg = bytes.subarray(offset, offset + size);
  if (jpeg.readUInt16BE(0) !== 0xffd8 || jpeg.readUInt16BE(jpeg.length - 2) !== 0xffd9) throw new Error('TIFF JPEG strip is not a complete JPEG stream');
  const tables = Buffer.from(ifd.t347 ?? []);
  if (tables.length && (tables.length < 4 || tables.readUInt16BE(0) !== 0xffd8 || tables.readUInt16BE(tables.length - 2) !== 0xffd9)) throw new Error('Invalid TIFF JPEG tables');
  const rgbMarker = ifd.t262?.[0] === 2
    ? Buffer.from('ffee000e41646f626500640000000000', 'hex') // Adobe APP14, transform=0 (RGB).
    : Buffer.alloc(0);
  return Buffer.concat([jpeg.subarray(0, 2), rgbMarker, tables.subarray(2, -2), jpeg.subarray(2)]);
}
