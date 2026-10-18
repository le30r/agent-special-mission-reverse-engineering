import { Texture } from 'pixi.js';
import { composeMultForCanvas, type MultFile, type MultObject, type ResolvedMultObject } from '../mult/decoder';

/**
 * MULT textures are shared by all scenes. The cache key therefore includes a
 * per-file identity: several original MULT files (stop0..stop7) have the same
 * frame count, slot, child and record offset but different pixels.
 */
const multTextures = new Map<string, Texture>();
const fileIds = new WeakMap<MultFile, number>();
let nextFileId = 1;

function multFileId(file: MultFile): number {
  let id = fileIds.get(file);
  if (!id) { id = nextFileId++; fileIds.set(file, id); }
  return id;
}

function createTexture(object: MultObject): Texture {
  if (!object.bgra || !object.a || !object.b) return Texture.EMPTY;
  const canvas = document.createElement('canvas'); canvas.width = object.a; canvas.height = object.b;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.putImageData(new ImageData(composeMultForCanvas(object.a, object.b, object.bgra), object.a, object.b), 0, 0);
  return Texture.from(canvas);
}

export function resolvedTexture(file: MultFile, frame: number, record: MultObject, resolved: ResolvedMultObject): Texture {
  const key = `${multFileId(file)}:${frame}:${record.slot}:${record.child}`;
  let texture = multTextures.get(key);
  if (!texture) {
    texture = resolved.bgra ? createTexture(resolved.image) : Texture.EMPTY;
    multTextures.set(key, texture);
  }
  return texture;
}

export type ExternalTexture = { texture: Texture; hitPixels: Uint8ClampedArray; width: number; height: number };
const externalTextures = new Map<string, ExternalTexture>();

function externalKey(externalPath: string): string {
  return externalPath.replaceAll('\\', '/').replace(/^Tzu\//i, 'block9/Tzu/').toLowerCase();
}

/** Synchronous lookup used while a scene view is built at the game-loop boundary. */
export function cachedExternalTexture(externalPath: string): ExternalTexture | undefined {
  return externalTextures.get(externalKey(externalPath));
}

/** Loads every external image a scene needs before its view is created. */
export async function preloadExternalTextures(paths: Iterable<string>, resources: string): Promise<void> {
  for (const externalPath of new Set(paths)) {
    if (!cachedExternalTexture(externalPath)) await externalTexture(externalPath, resources);
  }
}

/**
 * Serves an original external image through the PNG conversion prepared for it.
 * The original hit test uses the RGB color key 0xB5B5B5, so those pixels become
 * fully transparent for click geometry.
 */
export async function externalTexture(externalPath: string, resources: string): Promise<ExternalTexture> {
  const normalized = externalPath.replaceAll('\\', '/').replace(/^Tzu\//i, 'block9/Tzu/');
  const key = externalKey(externalPath);
  const cached = externalTextures.get(key);
  if (cached) return cached;
  const url = `${resources}/${normalized.replace(/\.tif{1,2}$/i, '.png')}`;
  const image = new Image(); image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(image, 0, 0);
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < id.data.length; i += 4) if (id.data[i] === 0xb5 && id.data[i+1] === 0xb5 && id.data[i+2] === 0xb5) id.data[i+3] = 0;
  ctx.putImageData(id, 0, 0);
  const entry: ExternalTexture = { texture: Texture.from(canvas), hitPixels: id.data, width: canvas.width, height: canvas.height };
  externalTextures.set(key, entry);
  return entry;
}
