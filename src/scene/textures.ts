import { Texture } from 'pixi.js';
import { composeMultForCanvas, type MultFile, type MultObject, type ResolvedMultObject } from '../mult/decoder';

/**
 * MULT textures belong to one loaded scene definition. The cache key includes a
 * per-file identity: several original MULT files (stop0..stop7) have the same
 * frame count, slot, child and record offset but different pixels.
 */
const multTextures = new Map<string, Texture>();
const fileIds = new WeakMap<MultFile, number>();
let nextFileId = 1;
let pixiTextureCreateCount = 0;
let pixiTextureCreateMs = 0;

/** CPU-side Pixi Texture.from creation; GPU upload occurs on the next render. */
export function createPixiTexture(source: HTMLCanvasElement | HTMLImageElement): Texture {
  const start = performance.now();
  const texture = Texture.from(source);
  pixiTextureCreateMs += performance.now() - start;
  pixiTextureCreateCount++;
  return texture;
}

export function resetPixiTextureDiagnostics(): void { pixiTextureCreateCount = 0; pixiTextureCreateMs = 0; }
export function pixiTextureDiagnostics(): { count: number; createMs: number } { return { count: pixiTextureCreateCount, createMs: pixiTextureCreateMs }; }

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
    return createPixiTexture(canvas);
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

/** Destroys all GPU textures created from one scene's MULT file. */
export function releaseMultTextures(file: MultFile): void {
  const id = fileIds.get(file);
  if (!id) return;
  const prefix = `${id}:`;
  for (const [key, texture] of multTextures) {
    if (!key.startsWith(prefix)) continue;
    if (texture !== Texture.EMPTY) texture.destroy(true);
    multTextures.delete(key);
  }
  fileIds.delete(file);
}

export type ExternalTexture = { texture: Texture; hitPixels: Uint8ClampedArray; width: number; height: number };
type ExternalRecord = { entry: ExternalTexture; refs: number };
const externalTextures = new Map<string, ExternalRecord>();

/** Synchronous borrowed lookup used while a scene view is built. */
export function cachedExternalTexture(url: string): ExternalTexture | undefined {
  return externalTextures.get(url)?.entry;
}

async function loadExternalTexture(url: string): Promise<ExternalTexture> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(image, 0, 0);
  const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
  // The original hit test uses the RGB color key 0xB5B5B5; those pixels become
  // fully transparent for click geometry and are not composited.
  for (let i = 0; i < id.data.length; i += 4) if (id.data[i] === 0xb5 && id.data[i + 1] === 0xb5 && id.data[i + 2] === 0xb5) id.data[i + 3] = 0;
  ctx.putImageData(id, 0, 0);
  return { texture: createPixiTexture(canvas), hitPixels: id.data, width: canvas.width, height: canvas.height };
}

export async function acquireExternalTexture(url: string): Promise<ExternalTexture> {
  const existing = externalTextures.get(url);
  if (existing) { existing.refs++; return existing.entry; }
  const entry = await loadExternalTexture(url);
  externalTextures.set(url, { entry, refs: 1 });
  return entry;
}

export function releaseExternalTexture(url: string): void {
  const record = externalTextures.get(url);
  if (!record) return;
  record.refs--;
  if (record.refs > 0) return;
  externalTextures.delete(url);
  record.entry.texture.destroy(true);
}

export function releaseExternalTextures(urls: Iterable<string>): void {
  for (const url of urls) releaseExternalTexture(url);
}

/**
 * Loads every external image a scene needs before its view is created. A failed
 * image is returned to the caller as a warning instead of failing the whole scene.
 */
export async function preloadExternalTextures(urls: Iterable<string>): Promise<string[]> {
  const failed: string[] = [];
  for (const url of new Set(urls)) {
    try {
      await acquireExternalTexture(url);
    } catch {
      failed.push(url);
    }
  }
  return failed;
}

/** Background textures are reference-counted because two original scenes can share one TIF. */
const backgrounds = new Map<string, { texture: Texture; refs: number }>();

export async function acquireBackground(url: string, loader: (url: string) => Promise<Texture>): Promise<Texture> {
  const existing = backgrounds.get(url);
  if (existing) { existing.refs++; return existing.texture; }
  const texture = await loader(url);
  backgrounds.set(url, { texture, refs: 1 });
  return texture;
}

export function cachedBackground(url: string): Texture | undefined { return backgrounds.get(url)?.texture; }

export function releaseBackground(url: string): void {
  const record = backgrounds.get(url);
  if (!record) return;
  record.refs--;
  if (record.refs > 0) return;
  backgrounds.delete(url);
  record.texture.destroy(true);
}
