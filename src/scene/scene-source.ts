import { Texture } from 'pixi.js';
import { decodeMult } from '../mult/decoder';
import {
  buildSceneDefinition,
  normalizeExternalPath,
  type SceneDefinition,
} from './scene-definition';
import { decodeMask } from './mask';
import {
  acquireBackground,
  preloadExternalTextures,
  releaseBackground,
  releaseExternalTextures,
  releaseMultTextures,
} from './textures';
import type { LoadedScene, SceneProvider } from './scene-session';

export { decodeMask };

export type MissingDependency = {
  kind: string;
  originalPath: string;
  sourcePath?: string | null;
  required: boolean;
  message: string;
};

/** Entry of the prepared scene manifest written by scripts/prepare-assets.mjs. */
export type SceneManifestEntry = {
  id: number;
  scc: string;
  includes: string[];
  background: string | null;
  mask: string | null;
  /** Animation name -> prepared MULT URL. Missing optional animations are omitted. */
  animations: Record<string, string>;
  /** Normalized original external image path -> prepared PNG URL. */
  externalImages: Record<string, string>;
  layoutAnimation: string | null;
  requiredAnimations: string[];
  missing: { required: MissingDependency[]; optional: MissingDependency[] };
  loadable: boolean;
  sources: {
    scc: string;
    includes: string[];
    background: string | null;
    mask: string | null;
  };
};

export type SceneManifest = {
  version: number;
  generator?: string;
  summary: {
    total: number;
    loadable: number[];
    incomplete: Array<{ id: number; reasons: string[] }>;
    missingOptional: number;
  };
  scenes: SceneManifestEntry[];
  /** Normalized full SCC WAV resource name -> immutable prepared URL. */
  audioResources?: Record<string, string>;
  audioDurations?: Record<string, number>;
  audioStorageModes?: Record<string, 'sharedPcm' | 'privateDecoded'>;
  diagnostics: Array<{ level: 'warning' | 'error'; scene?: number; kind: string; path?: string; message: string }>;
};

export type InterfaceAssets = { frame: ReturnType<typeof decodeMult>; icons: ReturnType<typeof decodeMult> };
export type SceneCatalog = { manifest: SceneManifest; interface: InterfaceAssets; resources: string };

export type SceneResourceReader = {
  text(url: string): Promise<string>;
  bytes(url: string): Promise<ArrayBuffer>;
};

export class SceneLoadError extends Error {
  readonly scene: number;
  readonly reasons: readonly string[];
  constructor(scene: number, reasons: readonly string[]) {
    super(`Scene ${scene} cannot be loaded: ${reasons.join('; ')}`);
    this.name = 'SceneLoadError';
    this.scene = scene;
    this.reasons = reasons;
  }
}

async function loadBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${url}: ${response.status}`);
  return response.arrayBuffer();
}

async function loadText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${url}: ${response.status}`);
  return response.text();
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Cannot load ${url}: ${response.status}`);
  return await response.json() as T;
}

/** Default browser reader. Tests inject a filesystem reader instead. */
export const fetchSceneReader: SceneResourceReader = { text: loadText, bytes: loadBytes };

/** Every original external image path assigned by any animation frame. */
export function collectAnimationExternalPaths(definition: SceneDefinition): string[] {
  const paths = new Set<string>();
  for (const animation of definition.animations.values()) {
    for (const frame of animation.file.frames) {
      for (const record of frame) {
        const resolved = animation.file.resolve(record.slot, record.child);
        if (resolved.externalPath) paths.add(resolved.externalPath);
      }
    }
  }
  return [...paths];
}

/**
 * Resolves external image paths to prepared URLs declared by the manifest. A path
 * without a converted image stays a warning: the original loader would simply not
 * obtain that image, and the scene can still run with the remaining objects.
 */
export function collectAnimationExternalImages(definition: SceneDefinition): {
  originalPaths: string[];
  urls: string[];
  missing: string[];
} {
  const originalPaths = collectAnimationExternalPaths(definition);
  const urls = new Set<string>();
  const missing: string[] = [];
  for (const originalPath of originalPaths) {
    const url = definition.externalImages.get(normalizeExternalPath(originalPath));
    if (url) urls.add(url);
    else missing.push(originalPath);
  }
  return { originalPaths, urls: [...urls], missing };
}

/** Loads the generated manifest only; no scene data is fetched here. */
export async function loadSceneManifest(url = '/generated/scenes.json'): Promise<SceneManifest> {
  return await loadJson<SceneManifest>(url);
}

/**
 * Loads one scene's SCC, recursively included SCCs, mask and every declared MULT.
 * Mandatory resource failures throw `SceneLoadError`; optional MULT failures are
 * collected as warnings and the animation is omitted.
 */
export async function loadSceneDefinition(
  entry: SceneManifestEntry,
  reader: SceneResourceReader = fetchSceneReader,
  audioResources: Readonly<Record<string, string>> = {},
  audioDurations: Readonly<Record<string, number>> = {},
  audioStorageModes: Readonly<Record<string, 'sharedPcm' | 'privateDecoded'>> = {},
): Promise<SceneDefinition> {
  const requiredReasons = entry.missing.required.map((missing) => missing.message);
  if (!entry.loadable || requiredReasons.length) throw new SceneLoadError(entry.id, requiredReasons);
  if (!entry.mask) throw new SceneLoadError(entry.id, ['mask is not prepared']);
  const required = new Set(entry.requiredAnimations);
  const [scc, includeSources, maskBytes] = await Promise.all([
    reader.text(entry.scc),
    Promise.all(entry.includes.map((url) => reader.text(url))),
    reader.bytes(entry.mask),
  ]);
  const mults = new Map<string, ReturnType<typeof decodeMult>>();
  const warnings: string[] = [];
  for (const [name, url] of Object.entries(entry.animations)) {
    try {
      mults.set(name, decodeMult(await reader.bytes(url)));
    } catch (error) {
      const message = `Animation ${name} (${url}) is unavailable: ${String(error)}`;
      if (required.has(name)) throw new SceneLoadError(entry.id, [message]);
      warnings.push(message);
    }
  }
  for (const name of required) {
    if (!mults.has(name)) throw new SceneLoadError(entry.id, [`Required animation ${name} is not prepared`]);
  }
  const definition = buildSceneDefinition({
    id: entry.id,
    sccUrl: entry.scc,
    scc,
    includeSources,
    background: entry.background ?? '',
    mask: decodeMask(maskBytes),
    mults,
    externalImages: entry.externalImages,
    layoutAnimation: entry.layoutAnimation ?? undefined,
    audioResources,
    audioDurations,
    audioStorageModes,
  });
  definition.warnings.push(...warnings);
  return definition;
}

/** Decodes the prepared PNG through a fresh Image element so it can be released later. */
export async function loadSceneBackground(url: string): Promise<Texture> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return Texture.from(image);
}

/**
 * Lazily loads exactly one scene's resources. The manifest may describe the whole
 * corpus, but this provider fetches and uploads only the requested scene and
 * releases its background/external/MULT textures when the scene is left.
 */
export class SceneAssetProvider implements SceneProvider {
  readonly manifest: SceneManifest;
  readonly reader: SceneResourceReader;
  readonly ids: number[];
  private readonly byId: Map<number, SceneManifestEntry>;
  private readonly loaded = new Map<number, { definition: SceneDefinition; background: Texture; externalUrls: string[]; backgroundUrl: string }>();

  constructor(manifest: SceneManifest, reader: SceneResourceReader = fetchSceneReader) {
    this.manifest = manifest;
    this.reader = reader;
    this.byId = new Map(manifest.scenes.map((scene) => [scene.id, scene]));
    this.ids = [...this.byId.keys()].sort((a, b) => a - b);
  }

  has(id: number): boolean { return this.byId.has(id); }
  /** Number of scene resource sets currently retained (should be 0 or 1). */
  get loadedCount(): number { return this.loaded.size; }

  async load(id: number): Promise<LoadedScene> {
    const entry = this.byId.get(id);
    if (!entry) throw new SceneLoadError(id, ['scene is not present in the prepared manifest']);
    if (this.loaded.has(id)) return this.loaded.get(id)!;
    const definition = await loadSceneDefinition(entry, this.reader, this.manifest.audioResources, this.manifest.audioDurations, this.manifest.audioStorageModes);
    const external = collectAnimationExternalImages(definition);
    if (external.missing.length) definition.warnings.push(`External images missing from the manifest: ${external.missing.join(', ')}`);
    const failedExternal = await preloadExternalTextures(external.urls);
    if (failedExternal.length) definition.warnings.push(`External images failed to load: ${failedExternal.join(', ')}`);
    const backgroundUrl = entry.background;
    if (!backgroundUrl) {
      releaseExternalTextures(external.urls);
      throw new SceneLoadError(id, ['background is not prepared']);
    }
    try {
      const background = await acquireBackground(backgroundUrl, loadSceneBackground);
      const record = { definition, background, externalUrls: external.urls, backgroundUrl };
      this.loaded.set(id, record);
      return record;
    } catch (error) {
      releaseExternalTextures(external.urls);
      throw error;
    }
  }

  release(id: number): void {
    const record = this.loaded.get(id);
    if (!record) return;
    this.loaded.delete(id);
    releaseBackground(record.backgroundUrl);
    releaseExternalTextures(record.externalUrls);
    for (const animation of record.definition.animations.values()) releaseMultTextures(animation.file);
  }
}

/** Loads the manifest and the original inventory UI; scene data stays lazy. */
export async function loadSceneCatalog(resources = '/resources'): Promise<SceneCatalog> {
  const manifest = await loadSceneManifest();
  // The original inventory UI: 340x600 frame and 59 item icons.
  const interfaceAssets: InterfaceAssets = {
    frame: decodeMult(await loadBytes(`${resources}/block0/XSH/Interface/Frame.MULT`)),
    icons: decodeMult(await loadBytes(`${resources}/block0/XSH/Interface/large.MULT`)),
  };
  return { manifest, interface: interfaceAssets, resources };
}
