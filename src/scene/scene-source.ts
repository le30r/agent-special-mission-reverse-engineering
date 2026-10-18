import { Assets, Texture } from 'pixi.js';
import { decodeMult, type MultFile } from '../mult/decoder';
import { buildSceneDefinition, parseAnimationPaths, resolveOriginalResource, type SceneDefinition } from './scene-definition';
import { decodeMask } from './mask';
import { preloadExternalTextures } from './textures';

export { decodeMask };

/** Entry of the prepared scene manifest written by scripts/prepare-assets.mjs. */
export type SceneManifestEntry = { id: number; scc: string; background: string; mask: string };
export type InterfaceAssets = { frame: MultFile; icons: MultFile };
export type SceneCatalog = { definitions: Map<number, SceneDefinition>; backgrounds: Map<number, Texture>; interface: InterfaceAssets };

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

/** Every external image assigned by any animation frame, not only by Startlevel. */
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
 * Loads every scene listed in the prepared manifest through one code path:
 * SCC behaviour, mask geometry, MULT animations and the converted background.
 * All scenes are prepared up front so a transition needs no asynchronous work at
 * the game-loop boundary.
 */
export async function loadSceneCatalog(resources = '/resources'): Promise<SceneCatalog> {
  const manifest = await loadJson<{ scenes: SceneManifestEntry[] }>('/generated/scenes.json');
  const index = await loadJson<Record<string, string>>(`${resources}/resource-index.json`);
  const mainheroScc = await loadText(`${resources}/Mainhero.scc`);
  // The original inventory UI: 340x600 frame and 59 item icons.
  const interfaceAssets: InterfaceAssets = {
    frame: decodeMult(await loadBytes(`${resources}/block0/XSH/Interface/Frame.MULT`)),
    icons: decodeMult(await loadBytes(`${resources}/block0/XSH/Interface/large.MULT`)),
  };
  const definitions = new Map<number, SceneDefinition>();
  const backgrounds = new Map<number, Texture>();
  const files = new Map<string, Promise<ArrayBuffer>>();
  const bytes = (url: string) => {
    let pending = files.get(url);
    if (!pending) { pending = loadBytes(url); files.set(url, pending); }
    return pending;
  };
  for (const entry of manifest.scenes) {
    const scc = await loadText(entry.scc);
    const paths = new Map([...parseAnimationPaths(scc), ...parseAnimationPaths(mainheroScc)]);
    const mults = new Map<string, ArrayBuffer>();
    for (const [name, originalPath] of paths) {
      mults.set(name, await bytes(`${resources}/${resolveOriginalResource(index, originalPath)}`));
    }
    const mask = decodeMask(await bytes(entry.mask));
    const definition = buildSceneDefinition({ id: entry.id, sccUrl: entry.scc, scc, mainheroScc, background: entry.background, mask, mults });
    definitions.set(entry.id, definition);
    backgrounds.set(entry.id, await Assets.load<Texture>(entry.background));
    // Every animation can assign an external image, not only the Startlevel layout.
    // Preload all of them so a scene boundary and an SCC Start never need async work.
    await preloadExternalTextures(collectAnimationExternalPaths(definition), resources);
  }
  return { definitions, backgrounds, interface: interfaceAssets };
}
