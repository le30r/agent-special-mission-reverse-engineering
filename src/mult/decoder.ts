export type MultObject = {
  slot: number;
  child: number;
  offset: number;
  name: string;
  metadata: Uint8Array;
  type: -16 | -13 | -14;
  recordSize: number;
  a: number;
  b: number;
  x: number;
  y: number;
  indices?: Uint16Array;
  bgra?: Uint8Array;
  externalPath?: string;
  targetSlot?: number;
  targetChild?: number;
};

export type ResolvedMultObject = {
  source: MultObject;
  image: MultObject;
  width: number;
  height: number;
  externalPath?: string;
  indices?: Uint16Array;
  bgra?: Uint8Array;
};

export type MultFile = {
  frameCount: number;
  paletteField: number;
  paletteBGRA: Uint8Array;
  frames: MultObject[][];
  resolve(slot: number, child: number): ResolvedMultObject;
};

const decoder = new TextDecoder('windows-1251');
const readString = (bytes: Uint8Array) => decoder.decode(bytes.subarray(0, bytes.indexOf(0) < 0 ? bytes.length : bytes.indexOf(0)));

export function decodeMult(input: ArrayBuffer | Uint8Array): MultFile {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 0x4000) throw new Error('MULT header is truncated');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frameCount = view.getUint32(0, true);
  const paletteField = view.getUint32(4, true);
  const paletteBGRA = bytes.slice(8, 0x4000);
  const frames: MultObject[][] = [];
  let offset = 0x4000;

  for (let slot = 1; slot <= frameCount; slot++) {
    if (offset + 4 > bytes.length) throw new Error(`Missing record count for MULT frame ${slot}`);
    const count = view.getUint32(offset, true);
    offset += 4;
    const frame: MultObject[] = [];
    for (let child = 0; child < count; child++) {
      if (offset + 0x42 > bytes.length) throw new Error(`Truncated object header at 0x${offset.toString(16)}`);
      const metadata = bytes.slice(offset, offset + 50);
      const type = view.getInt32(offset + 0x32, true);
      const recordSize = view.getUint32(offset + 0x36, true);
      if (recordSize < 0x4a || offset + recordSize > bytes.length) throw new Error(`Invalid record size ${recordSize} at 0x${offset.toString(16)}`);
      if (type !== -16 && type !== -13 && type !== -14) throw new Error(`Unsupported MULT record type ${type}`);
      const a = view.getUint32(offset + 0x3a, true);
      const b = view.getUint32(offset + 0x3e, true);
      const x = view.getFloat32(offset + recordSize - 8, true);
      const y = view.getFloat32(offset + recordSize - 4, true);
      const record: MultObject = { slot, child, offset, name: readString(metadata), metadata, type, recordSize, a, b, x, y };
      if (type === -16) {
        const pixels = a * b;
        if (pixels > 100_000_000) throw new Error('MULT raster dimensions exceed safe limit');
        const indices = new Uint16Array(pixels);
        let cursor = offset + 0x42;
        const streamEnd = offset + recordSize - 8;
        let out = 0;
        for (let row = 0; row < b; row++) {
          let xPos = 0;
          while (xPos < a) {
            if (cursor + 2 > streamEnd) throw new Error(`Truncated RLE in ${record.name} frame ${slot}`);
            const token = view.getUint16(cursor, true);
            cursor += 2;
            const index = token & 0xfff;
            const run = (token >>> 12) + 1;
            if (index >= 4094) throw new Error(`Palette index ${index} outside 4094 entries`);
            if (xPos + run > a) throw new Error(`RLE run crosses row in ${record.name} frame ${slot}`);
            indices.fill(index, out, out + run);
            xPos += run;
            out += run;
          }
        }
        if (cursor !== streamEnd) throw new Error(`Unused RLE data in ${record.name} frame ${slot}`);
        const bgra = new Uint8Array(pixels * 4);
        for (let i = 0; i < pixels; i++) bgra.set(paletteBGRA.subarray(indices[i] * 4, indices[i] * 4 + 4), i * 4);
        record.indices = indices;
        record.bgra = bgra;
      } else if (type === -13) {
        if (recordSize !== 74) throw new Error('Reference record size must be 74 bytes');
        record.targetSlot = a;
        record.targetChild = b;
      } else {
        if (recordSize !== 330) throw new Error('External image record size must be 330 bytes');
        record.externalPath = readString(bytes.subarray(offset + 0x42, offset + 0x142));
      }
      frame.push(record);
      offset += recordSize;
    }
    frames.push(frame);
  }
  if (offset !== bytes.length) throw new Error(`MULT has ${bytes.length - offset} trailing bytes`);

  const resolve = (slot: number, child: number): ResolvedMultObject => {
    const source = frames[slot - 1]?.[child];
    if (!source) throw new Error(`Invalid MULT reference ${slot}:${child}`);
    let image = source;
    const seen = new Set<string>();
    while (image.type === -13) {
      const key = `${image.slot}:${image.child}`;
      if (seen.has(key)) throw new Error(`MULT reference cycle at ${key}`);
      seen.add(key);
      image = frames[(image.targetSlot ?? 0) - 1]?.[image.targetChild ?? -1] as MultObject;
      if (!image) throw new Error('MULT reference target is out of bounds');
    }
    return {
      source, image, width: image.type === -14 ? image.a : image.a,
      height: image.type === -14 ? image.b : image.b,
      externalPath: image.externalPath, indices: image.indices, bgra: image.bgra,
    };
  };
  return { frameCount, paletteField, paletteBGRA, frames, resolve };
}

/** Renderer-only approximation. Source BGRA remains byte-exact; DirectDraw blending is not reproduced. */
export function composeMultForCanvas(width: number, height: number, bgra: Uint8Array): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const b = bgra[i * 4], g = bgra[i * 4 + 1], r = bgra[i * 4 + 2], a = bgra[i * 4 + 3];
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return rgba;
}
