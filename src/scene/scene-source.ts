import { Texture } from 'pixi.js';
import { decodeMult, decodeMultIdentityIndex } from '../mult/decoder';
import {
  buildSceneDefinition,
  normalizeExternalPath,
  type SceneDefinition,
  type SceneValidationIndex,
} from './scene-definition';
import { createSceneValidationIndex } from './scene-definition';
import { parseFrameDepthEvents, parseSceneDeclarations } from '../navigation/depth-sort';
import type { PersistentObjectState } from './scene-loader';
import { decodeMask } from './mask';
import {
  acquireBackground,
  createPixiTexture,
  preloadExternalTextures,
  releaseBackground,
  releaseExternalTextures,
  releaseMultTextures,
} from './textures';
import type { LoadedScene, SceneProvider } from './scene-session';
import { saveContentHash } from './save-codec';

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
  /** Normalized original Setmsk path -> prepared raw TIFF URL. */
  masks?: Record<string, string>;
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
  /** SHA-256 of normalized original SCC and persistent-state-relevant resource bytes. */
  contentId?: string;
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
export type SceneLoadTimings = { sceneFetchMs: number; alternateMaskDecodeMs: number; multFetchDecodeMs: number; maskDecodeMs: number; definitionBuildMs: number; externalTextureMs: number; backgroundTextureMs: number };

type AssetLease = { scene: { definition: SceneDefinition; background: Texture; externalUrls: string[]; backgroundUrl: string } };
type SharedAssetCache = Map<number, { promise: Promise<AssetLease>; refs: number }>;
type SharedProviderState = { assets: SharedAssetCache; validationIndices: Map<number, SceneValidationIndex> };

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
  onTimings?: (timings: SceneLoadTimings) => void,
): Promise<SceneDefinition> {
  const timings: SceneLoadTimings = zeroLoadTimings();
  const requiredReasons = entry.missing.required.map((missing) => missing.message);
  if (!entry.loadable || requiredReasons.length) throw new SceneLoadError(entry.id, requiredReasons);
  if (!entry.mask) throw new SceneLoadError(entry.id, ['mask is not prepared']);
  const required = new Set(entry.requiredAnimations);
  const maskEntries = Object.entries(entry.masks ?? {});
  let phaseStart = performance.now();
  const [scc, includeSources, maskBytes, alternateMaskBytes] = await Promise.all([
    reader.text(entry.scc),
    Promise.all(entry.includes.map((url) => reader.text(url))),
    reader.bytes(entry.mask),
    Promise.all(maskEntries.map(([, url]) => reader.bytes(url))),
  ]);
  timings.sceneFetchMs = performance.now() - phaseStart;
  phaseStart = performance.now();
  const masks = new Map(maskEntries.map(([path], index) => [path, decodeMask(alternateMaskBytes[index])]));
  timings.alternateMaskDecodeMs = performance.now() - phaseStart;
  const mults = new Map<string, ReturnType<typeof decodeMult>>();
  const warnings: string[] = [];
  const animationEntries = Object.entries(entry.animations);
  const animationResults: Array<{ decoded?: ReturnType<typeof decodeMult>; error?: unknown } | undefined> = new Array(animationEntries.length);
  let nextAnimation = 0;
  phaseStart = performance.now();
  await Promise.all(Array.from({ length: Math.min(4, animationEntries.length) }, async () => {
    for (;;) {
      const index = nextAnimation++;
      if (index >= animationEntries.length) return;
      const [, url] = animationEntries[index];
      try { animationResults[index] = { decoded: decodeMult(await reader.bytes(url)) }; }
      catch (error) { animationResults[index] = { error }; }
    }
  }));
  timings.multFetchDecodeMs = performance.now() - phaseStart;
  for (let index = 0; index < animationEntries.length; index++) {
    const [name, url] = animationEntries[index];
    const result = animationResults[index]!;
    if (result.decoded) mults.set(name, result.decoded);
    else {
      const message = `Animation ${name} (${url}) is unavailable: ${String(result.error)}`;
      if (required.has(name)) throw new SceneLoadError(entry.id, [message]);
      warnings.push(message);
    }
  }
  for (const name of required) {
    if (!mults.has(name)) throw new SceneLoadError(entry.id, [`Required animation ${name} is not prepared`]);
  }
  phaseStart = performance.now();
  const decodedMask = decodeMask(maskBytes);
  timings.maskDecodeMs = performance.now() - phaseStart;
  phaseStart = performance.now();
  const definition = buildSceneDefinition({
    id: entry.id,
    sccUrl: entry.scc,
    scc,
    includeSources,
    background: entry.background ?? '',
    mask: decodedMask,
    masks,
    mults,
    externalImages: entry.externalImages,
    layoutAnimation: entry.layoutAnimation ?? undefined,
    audioResources,
    audioDurations,
    audioStorageModes,
  });
  timings.definitionBuildMs = performance.now() - phaseStart;
  definition.warnings.push(...warnings);
  onTimings?.(timings);
  return definition;
}

/** Decodes the prepared PNG through a fresh Image element so it can be released later. */
export async function loadSceneBackground(url: string): Promise<Texture> {
  const image = new Image();
  image.src = url;
  await image.decode();
  return createPixiTexture(image);
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
  readonly contentId: string;
  private readonly byId: Map<number, SceneManifestEntry>;
  private readonly loaded = new Map<number, { promise: Promise<AssetLease>; refs: number }>();
  private readonly shared: SharedProviderState;
  lastLoadResourceTimings: SceneLoadTimings = zeroLoadTimings();
  lastValidationResourceTimings: SceneLoadTimings = zeroLoadTimings();

  constructor(manifest: SceneManifest, reader: SceneResourceReader = fetchSceneReader, shared?: SharedProviderState) {
    this.manifest = manifest;
    this.reader = reader;
    this.byId = new Map(manifest.scenes.map((scene) => [scene.id, scene]));
    this.ids = [...this.byId.keys()].sort((a, b) => a - b);
    this.contentId = manifest.contentId ?? saveContentHash(JSON.stringify({ version:manifest.version, scenes:manifest.scenes }));
    this.shared = shared ?? { assets: new Map(), validationIndices: new Map() };
  }

  /** Candidate visits lease immutable assets while the active visit remains their owner. */
  fork(): SceneProvider { return new SceneAssetProvider(this.manifest, this.reader, this.shared); }

  has(id: number): boolean { return this.byId.has(id); }
  /** Number of scene resource sets currently retained (should be 0 or 1). */
  get loadedCount(): number { return this.loaded.size; }
  get resourceCacheStats(): { providerLeases: number; sharedScenes: number; sharedLeaseRefs: number; validationIndexes: number } {
    return {
      providerLeases: this.loaded.size,
      sharedScenes: this.shared.assets.size,
      sharedLeaseRefs: [...this.shared.assets.values()].reduce((sum, entry) => sum + entry.refs, 0),
      validationIndexes: this.shared.validationIndices.size,
    };
  }

  async load(id: number): Promise<LoadedScene> {
    const entry = this.byId.get(id);
    if (!entry) throw new SceneLoadError(id, ['scene is not present in the prepared manifest']);
    const own = this.loaded.get(id);
    if (own) return (await own.promise).scene;
    let lease = this.shared.assets.get(id);
    if (lease) { lease.refs++; this.lastLoadResourceTimings = zeroLoadTimings(); }
    else {
      const promise = (async (): Promise<AssetLease> => {
        let externalUrls: string[] = [];
        try {
          const definition = await loadSceneDefinition(entry, this.reader, this.manifest.audioResources, this.manifest.audioDurations, this.manifest.audioStorageModes, timings => { this.lastLoadResourceTimings = timings; });
          const external = collectAnimationExternalImages(definition);
          externalUrls = external.urls;
          if (external.missing.length) definition.warnings.push(`External images missing from the manifest: ${external.missing.join(', ')}`);
          let resourceStart = performance.now();
          const failedExternal = await preloadExternalTextures(external.urls);
          this.lastLoadResourceTimings.externalTextureMs = performance.now() - resourceStart;
          if (failedExternal.length) definition.warnings.push(`External images failed to load: ${failedExternal.join(', ')}`);
          const backgroundUrl = entry.background;
          if (!backgroundUrl) throw new SceneLoadError(id, ['background is not prepared']);
          resourceStart = performance.now();
          const background = await acquireBackground(backgroundUrl, loadSceneBackground);
          this.lastLoadResourceTimings.backgroundTextureMs = performance.now() - resourceStart;
          return { scene: { definition, background, externalUrls, backgroundUrl } };
        } catch (error) {
          if (externalUrls.length) releaseExternalTextures(externalUrls);
          throw error;
        }
      })();
      lease = { promise, refs: 1 };
      this.shared.assets.set(id, lease);
      void promise.catch(() => { if (this.shared.assets.get(id) === lease) this.shared.assets.delete(id); });
    }
    this.loaded.set(id, lease);
    try { return (await lease.promise).scene; }
    catch (error) {
      if (this.loaded.get(id) === lease) this.loaded.delete(id);
      lease.refs--;
      if (lease.refs <= 0 && this.shared.assets.get(id) === lease) this.shared.assets.delete(id);
      throw error;
    }
  }

  /** Save identity checks use compact SCC/MULT metadata, never render resources. */
  async loadDefinitionForValidation(id: number, objects: readonly PersistentObjectState[]): Promise<SceneValidationIndex> {
    const start = performance.now();
    this.lastValidationResourceTimings = zeroLoadTimings();
    let index = this.shared.validationIndices.get(id);
    const active = this.loaded.get(id);
    if (!index && active) index = createSceneValidationIndex((await active.promise).scene.definition);
    const entry = this.byId.get(id);
    if (!entry) throw new SceneLoadError(id, ['scene is not present in the prepared manifest']);
    if (!index) {
      const requiredReasons = entry.missing.required.map(missing => missing.message);
      if (!entry.loadable || requiredReasons.length) throw new SceneLoadError(id, requiredReasons);
      if (!entry.mask) throw new SceneLoadError(id, ['mask is not prepared']);
      const [scc, includes] = await Promise.all([this.reader.text(entry.scc), Promise.all(entry.includes.map(url => this.reader.text(url)))]);
      const declarationSource = [...includes, scc].join('\n');
      const declarations = parseSceneDeclarations(declarationSource);
      index = {
        id, scc,
        objectNames: new Set([...declarations.objects.keys()].map(name => name.toUpperCase())),
        activeNames: new Set([...declarations.active.keys()].map(name => name.toUpperCase())),
        lightNames: new Set([...declarations.lights.keys()].map(name => name.toUpperCase())),
        frameDepthEvents: parseFrameDepthEvents(declarationSource).map(({ animation, frame, objectName }) => ({ animation, frame, objectName })),
        animations: new Map(),
      };
    }
    this.lastValidationResourceTimings.sceneFetchMs += performance.now() - start;
    const animationData = new Map(index.animations);
    const recordsNeeded = new Set(objects.filter(item => !item.placeholder && item.image.kind === 'mult').map(item => item.image.kind === 'mult' ? item.image.reference.file : ''));
    const frameCountsNeeded = new Set(index.frameDepthEvents.map(event => event.animation));
    const animationNames = new Set([...recordsNeeded, ...frameCountsNeeded]);
    for (const name of animationNames) {
      const existing = animationData.get(name);
      const needsRecords = recordsNeeded.has(name);
      if (existing && (!needsRecords || existing.frames)) continue;
      const url = entry.animations[name];
      if (!url) continue;
      const phaseStart = performance.now();
      try {
        const bytes = await this.reader.bytes(url);
        const decoded = decodeMultIdentityIndex(bytes, needsRecords);
        animationData.set(name, { frameCount: decoded.frameCount, ...(needsRecords ? { frames: decoded.frames } : {}) });
      } catch (error) {
        if (entry.requiredAnimations.includes(name)) throw new SceneLoadError(id, [`Animation ${name} (${url}) is unavailable: ${String(error)}`]);
      }
      this.lastValidationResourceTimings.multFetchDecodeMs += performance.now() - phaseStart;
    }
    index = { ...index, animations: animationData };
    this.cacheValidationIndex(id, index);
    return index;
  }

  private cacheValidationIndex(id: number, index: SceneValidationIndex): void {
    this.shared.validationIndices.delete(id);
    this.shared.validationIndices.set(id, index);
    while (this.shared.validationIndices.size > 32) {
      const oldest = this.shared.validationIndices.keys().next().value;
      if (oldest === undefined) break;
      this.shared.validationIndices.delete(oldest);
    }
  }

  release(id: number): void {
    const record = this.loaded.get(id);
    if (!record) return;
    this.loaded.delete(id);
    record.refs--;
    if (record.refs > 0) return;
    if (this.shared.assets.get(id) === record) this.shared.assets.delete(id);
    void record.promise.then(({ scene }) => {
      releaseBackground(scene.backgroundUrl);
      releaseExternalTextures(scene.externalUrls);
      for (const animation of scene.definition.animations.values()) releaseMultTextures(animation.file);
    });
  }
}

function zeroLoadTimings(): SceneLoadTimings { return { sceneFetchMs: 0, alternateMaskDecodeMs: 0, multFetchDecodeMs: 0, maskDecodeMs: 0, definitionBuildMs: 0, externalTextureMs: 0, backgroundTextureMs: 0 }; }

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
