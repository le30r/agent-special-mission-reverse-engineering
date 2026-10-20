import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { TestResources } from '../scripts/lib/test-resources.mjs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  discoverSceneDependencies,
  normalizeOriginalPath,
  scanMultExternalPaths,
} from '../src/scene/scene-discovery';
import { collectAnimationExternalImages, loadSceneDefinition } from '../src/scene/scene-source';
import { buildRoute, correctPosition, sample } from '../src/navigation/router';
import { catalogDefinition, catalogEntry, fileSceneReader, loadTestSceneCatalog } from './helpers/scene-catalog';

vi.setConfig({ testTimeout: 60000 });

const sourceRoot = path.join(process.cwd(), 'agent-original/game-resources');
const scriptsRoot = path.join(process.cwd(), 'agent-original/game-installed/Program_Executable_Files/Scripts');
const ALL_SCENE_IDS = Array.from({ length: 48 }, (_, index) => index + 1).filter((id) => id !== 9);

function syntheticExternalMult(externalPath: string): Uint8Array {
  const recordSize = 330;
  const bytes = new Uint8Array(0x4000 + 4 + recordSize);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 1, true); // frame count
  view.setUint32(0x4000, 1, true); // one record in frame 1
  const record = 0x4004;
  view.setInt32(record + 0x32, -14, true);
  view.setUint32(record + 0x36, recordSize, true);
  view.setUint32(record + 0x3a, 10, true);
  view.setUint32(record + 0x3e, 10, true);
  const encoded = new TextEncoder().encode(externalPath);
  bytes.set(encoded.subarray(0, 0xff), record + 0x42);
  view.setFloat32(record + recordSize - 8, 0, true);
  view.setFloat32(record + recordSize - 4, 0, true);
  return bytes;
}

async function writeFixture(root: string, files: Record<string, string | Uint8Array>): Promise<void> {
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
}

describe('automatic scene discovery', () => {
  it('derives the scene list from Level*.scc rather than a fixed supportedScenes array', async () => {
    const discovery = await discoverSceneDependencies({ sourceRoot, scriptsRoot });
    expect(discovery.scenes.map((scene) => scene.id)).toEqual(ALL_SCENE_IDS);
    expect(discovery.scenes.some((scene) => scene.id === 9)).toBe(false);
  });

  it('resolves recursive Inc, background/mask, MULT and external image dependencies', async () => {
    const discovery = await discoverSceneDependencies({ sourceRoot, scriptsRoot });
    const level1 = discovery.scenes.find((scene) => scene.id === 1)!;
    expect(level1.includes.map((include) => include.sourcePath)).toEqual(['Cursor.scc', 'Mainhero.scc', 'Ylisa.scc']);
    expect(level1.background?.sourcePath).toBe('block1/Backgrd/Scn_37.TIF');
    expect(level1.mask?.sourcePath).toBe('block0/Masks/Scn_01_1.TIF');
    expect(level1.layoutAnimation).toBe('Startlevel');
    expect(level1.animations.find((animation) => animation.name === 'Startlevel')?.sourcePath).toBe('block9/Xsh/Scn_37/start.MULT');
    expect(level1.animations.find((animation) => animation.name === 'Walk6')?.sourcePath).toBe('block1/Xsh/Base/walk6.MULT');
    expect(level1.externalImages.map((image) => normalizeOriginalPath(image.originalPath))).toContain('tzu/scn_37/botl/s0/botl.tif');
    expect(level1.missing.filter((missing) => missing.required)).toEqual([]);
    const level23 = discovery.scenes.find((scene) => scene.id === 23)!;
    expect(level23.backgrounds.map(resource => normalizeOriginalPath(resource.originalPath))).toEqual([
      'backgrd/scn_23.tif', 'backgrd/scn_23_1.tif',
    ]);
    expect(level23.missing.filter(missing => missing.required)).toEqual([]);
  });

  it('prepares Level16 Setmsk TIFFs and routes against the selected raw mask', async () => {
    const discovery = await discoverSceneDependencies({ sourceRoot, scriptsRoot });
    const level16 = discovery.scenes.find((scene) => scene.id === 16)!;
    expect(level16.masks.map((mask) => normalizeOriginalPath(mask.originalPath))).toEqual([
      'masks/scn_16.tif', 'masks/scn_16_m.tif',
    ]);
    const catalog = await loadTestSceneCatalog([16]);
    const definition = catalogDefinition(catalog, 16);
    const regular = definition.masks.get('masks/scn_16.tif')!;
    const alternate = definition.masks.get('masks/scn_16_m.tif')!;
    expect(sample(regular, 581, 554)).toBe(72);
    expect(sample(alternate, 581, 554)).toBe(0);
    expect(correctPosition(regular, [581, 554])?.point).toEqual([581, 554]);
    expect(correctPosition(alternate, [581, 554])?.point).toEqual([580, 555]);
    const normalRoute = buildRoute(regular, [580, 565], [581, 554]);
    const alternateRoute = buildRoute(alternate, [580, 565], [581, 554]);
    expect(normalRoute.status).toBe('route');
    expect(alternateRoute.status).toBe('route');
    expect(normalRoute.target).not.toEqual(alternateRoute.target);
    expect(normalRoute.path).not.toEqual(alternateRoute.path);
  }, 30000);

  it('marks scenes without Startlevel as valid empty-layout scenes', async () => {
    const discovery = await discoverSceneDependencies({ sourceRoot, scriptsRoot });
    const level45 = discovery.scenes.find((scene) => scene.id === 45)!;
    expect(level45.layoutAnimation).toBeUndefined();
    expect(level45.missing.filter((missing) => missing.required)).toEqual([]);
    const catalog = await loadTestSceneCatalog([45, 48]);
    for (const id of [45, 48]) {
      const definition = await loadSceneDefinition(catalogEntry(catalog, id), fileSceneReader);
      expect(definition.layoutAnimation).toBeUndefined();
      expect(definition.layout).toEqual([]);
      expect(definition.animations.has('Stop6')).toBe(true);
    }
  }, 30000);

  it('classifies missing mandatory and optional resources explicitly', async () => {
    const resources = new TestResources();
    const root = resources.tempDir('scene-missing');
    try {
      await writeFixture(root, {
        'game-resources/block1/Backgrd/Present.TIF': 'present',
        'game-resources/block0/Masks/Present.TIF': 'present',
        'scripts/Level1.scc': [
          'Back BACKGRD\\Present.tif',
          'Mask Masks\\Present.tif',
          'Anim 8 Startlevel Casm XSH\\SCN_99\\start.mult',
          'Anim 10 Optional Casm XSH\\SCN_99\\optional.mult',
          'Object Botl 0 10',
        ].join('\n'),
      });
      const discovery = await discoverSceneDependencies({
        sourceRoot: path.join(root, 'game-resources'),
        scriptsRoot: path.join(root, 'scripts'),
      });
      const scene = discovery.scenes[0];
      const required = scene.missing.filter((missing) => missing.required).map((missing) => missing.kind);
      const optional = scene.missing.filter((missing) => !missing.required).map((missing) => missing.kind);
      expect(required).toEqual(expect.arrayContaining(['mult']));
      expect(optional).toEqual(expect.arrayContaining(['mult']));
      expect(discovery.diagnostics.some((diagnostic) => diagnostic.level === 'error')).toBe(true);
    } finally {
      await resources.cleanup();
    }
  });

  it('keeps a missing external MULT image optional and reports it', async () => {
    const resources = new TestResources();
    const root = resources.tempDir('scene-external');
    try {
      await writeFixture(root, {
        'game-resources/block1/Backgrd/Scn_99.TIF': 'present',
        'game-resources/block0/Masks/Scn_99.TIF': 'present',
        'game-resources/block9/Xsh/Scn_99/start.MULT': syntheticExternalMult('Tzu\\Scn_99\\Missing\\S0\\gone.tif'),
        'scripts/Level1.scc': [
          'Back BACKGRD\\Scn_99.tif',
          'Mask Masks\\Scn_99.tif',
          'Anim 8 Startlevel Casm XSH\\SCN_99\\start.mult',
          'Object Botl 0 10',
        ].join('\n'),
      });
      const discovery = await discoverSceneDependencies({
        sourceRoot: path.join(root, 'game-resources'),
        scriptsRoot: path.join(root, 'scripts'),
      });
      const scene = discovery.scenes[0];
      expect(scene.missing.some((missing) => missing.kind === 'external-image' && !missing.required)).toBe(true);
      expect(scene.missing.some((missing) => missing.required)).toBe(false);
      expect(scanMultExternalPaths(await readFile(path.join(root, 'game-resources/block9/Xsh/Scn_99/start.MULT')))).toMatchObject({
        paths: ['Tzu\\Scn_99\\Missing\\S0\\gone.tif'],
      });
    } finally {
      await resources.cleanup();
    }
  });

  it('loads only the requested scene, not the whole prepared corpus', async () => {
    const catalog = await loadTestSceneCatalog([1]);
    const entry = catalogEntry(catalog, 1);
    const requestedText: string[] = [];
    const requestedBytes: string[] = [];
    const reader = {
      text: async (url: string) => { requestedText.push(url); return await fileSceneReader.text(url); },
      bytes: async (url: string) => { requestedBytes.push(url); return await fileSceneReader.bytes(url); },
    };
    const definition = await loadSceneDefinition(entry, reader);
    expect(definition.id).toBe(1);
    expect(requestedText.sort()).toEqual([entry.scc, ...entry.includes].sort());
    expect(new Set(requestedBytes)).toEqual(new Set([entry.mask!, ...Object.values(entry.masks ?? {}), ...Object.values(entry.animations)]));
    expect(requestedText).not.toContain('/resources/Level39.scc');
    expect(requestedBytes).not.toContain('/resources/Level39.scc');
  }, 30000);

  it('maps every animation external path to a prepared URL for Level1', async () => {
    const catalog = await loadTestSceneCatalog([1]);
    const definition = await loadSceneDefinition(catalogEntry(catalog, 1), fileSceneReader);
    const images = collectAnimationExternalImages(definition);
    expect(images.missing).toEqual([]);
    expect(images.urls).toEqual(expect.arrayContaining([
      expect.stringMatching(/Botl\/S0\/botl\.png$/),
      expect.stringMatching(/Pistol\/S0\/PISTOLET\.png$/),
    ]));
    // Dropping one manifest entry must degrade to an optional diagnostic, not a crash.
    const entry = { ...catalogEntry(catalog, 1), externalImages: { ...catalogEntry(catalog, 1).externalImages } };
    delete entry.externalImages['tzu/scn_37/botl/s0/botl.tif'];
    const withoutBottle = await loadSceneDefinition(entry, fileSceneReader);
    expect(collectAnimationExternalImages(withoutBottle).missing).toContain('Tzu\\Scn_37\\Botl\\S0\\botl.tif');
  }, 30000);
});
