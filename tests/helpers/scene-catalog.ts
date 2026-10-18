import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildSceneDefinition, parseAnimationPaths, resolveOriginalResource, type SceneDefinition } from '../../src/scene/scene-definition';
import type { SceneManifestEntry } from '../../src/scene/scene-source';
import { decodeMask } from '../../src/scene/mask';

export type TestSceneCatalog = {
  manifest: { scenes: SceneManifestEntry[] };
  index: Record<string, string>;
  definitions: Map<number, SceneDefinition>;
};

/** Loads the prepared Level1/Level39 catalog from the original assets copied by prepare:assets. */
export async function loadTestSceneCatalog(): Promise<TestSceneCatalog> {
  const publicDir = path.join(process.cwd(), 'public');
  const manifest = JSON.parse(await readFile(path.join(publicDir, 'generated/scenes.json'), 'utf8')) as { scenes: SceneManifestEntry[] };
  const index = JSON.parse(await readFile(path.join(publicDir, 'resources/resource-index.json'), 'utf8')) as Record<string, string>;
  const mainheroScc = await readFile(path.join(publicDir, 'resources/Mainhero.scc'), 'utf8');
  const definitions = new Map<number, SceneDefinition>();
  for (const entry of manifest.scenes) {
    const scc = await readFile(path.join(publicDir, entry.scc), 'utf8');
    const mults = new Map<string, Uint8Array>();
    for (const [name, originalPath] of new Map([...parseAnimationPaths(scc), ...parseAnimationPaths(mainheroScc)])) {
      mults.set(name, await readFile(path.join(publicDir, 'resources', resolveOriginalResource(index, originalPath))));
    }
    const mask = decodeMask(await readFile(path.join(publicDir, entry.mask)));
    definitions.set(entry.id, buildSceneDefinition({ id: entry.id, sccUrl: entry.scc, scc, mainheroScc, background: entry.background, mask, mults }));
  }
  return { manifest, index, definitions };
}

export function catalogDefinition(catalog: TestSceneCatalog, id: number): SceneDefinition {
  const definition = catalog.definitions.get(id);
  if (!definition) throw new Error(`Scene ${id} was not prepared`);
  return definition;
}
