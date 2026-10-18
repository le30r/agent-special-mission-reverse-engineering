import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { SceneDefinition } from '../../src/scene/scene-definition';
import {
  loadSceneDefinition,
  type SceneManifest,
  type SceneManifestEntry,
  type SceneResourceReader,
} from '../../src/scene/scene-source';

export type TestSceneCatalog = {
  manifest: SceneManifest;
  index: Record<string, string>;
  definitions: Map<number, SceneDefinition>;
};

const publicDir = path.join(process.cwd(), 'public');

/** Reads prepared manifest URLs from the filesystem instead of the browser fetch. */
export const fileSceneReader: SceneResourceReader = {
  async text(url) { return await readFile(path.join(publicDir, url.replace(/^\//, '')), 'utf8'); },
  async bytes(url) {
    const bytes = await readFile(path.join(publicDir, url.replace(/^\//, '')));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  },
};

/**
 * Loads only the requested scene definitions through the same lazy loader the
 * browser uses. Omit `sceneIds` to build the entire corpus (slow: 108 MB MULT).
 */
export async function loadTestSceneCatalog(sceneIds?: readonly number[]): Promise<TestSceneCatalog> {
  const manifest = JSON.parse(await readFile(path.join(publicDir, 'generated/scenes.json'), 'utf8')) as SceneManifest;
  const index = JSON.parse(await readFile(path.join(publicDir, 'resources/resource-index.json'), 'utf8')) as Record<string, string>;
  const wanted = sceneIds ? new Set(sceneIds) : undefined;
  const definitions = new Map<number, SceneDefinition>();
  for (const entry of manifest.scenes) {
    if (wanted && !wanted.has(entry.id)) continue;
    definitions.set(entry.id, await loadSceneDefinition(entry, fileSceneReader));
  }
  return { manifest, index, definitions };
}

export function catalogDefinition(catalog: TestSceneCatalog, id: number): SceneDefinition {
  const definition = catalog.definitions.get(id);
  if (!definition) throw new Error(`Scene ${id} was not prepared in this test catalog`);
  return definition;
}

export function catalogEntry(catalog: TestSceneCatalog, id: number): SceneManifestEntry {
  const entry = catalog.manifest.scenes.find((scene) => scene.id === id);
  if (!entry) throw new Error(`Scene ${id} is not in the manifest`);
  return entry;
}
