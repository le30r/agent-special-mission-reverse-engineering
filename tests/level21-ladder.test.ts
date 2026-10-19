import { beforeAll, describe, expect, it } from 'vitest';
import { hitTest } from '../src/scene/object-hit';
import { findFrameTarget } from '../src/scene/mult-target';
import { SceneLoader, createSceneState, type SceneState } from '../src/scene/scene-loader';
import { declareSceneObjects } from '../src/scene/scene-session';
import { applyObjectVisibility } from '../src/scene/object-visibility';
import { SccRuntime, type SccHost } from '../src/scc/runtime';
import { multHitPixels } from '../src/mult/hit-pixels';
import { catalogDefinition, loadTestSceneCatalog, type TestSceneCatalog } from './helpers/scene-catalog';
import { findNamedObject } from '../src/scene/object-identity';

let catalog: TestSceneCatalog;
beforeAll(async () => { catalog = await loadTestSceneCatalog([21]); });

const definition = () => catalogDefinition(catalog, 21);

function scene() {
  const loader = new SceneLoader();
  const state = loader.state(21);
  declareSceneObjects(loader, state, definition());
  return { loader, state };
}

function declarationsByFold<T extends { name: string }>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.name.toUpperCase();
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return groups;
}

function interaction(state: SceneState) {
  let pathActive = false;
  const animations = new Map<string, boolean>();
  const visibility = { objects: definition().objects, active: definition().active, lights: definition().lights };
  const host: SccHost = {
    pathActive: () => pathActive,
    animationActive: (name) => animations.get(name) ?? false,
    startAnimation: (name) => { animations.set(name, true); },
    stopAnimation: (name) => { animations.set(name, false); },
    setPosition() {}, setDepth() {}, setCursor() {},
    goto: () => { pathActive = true; return true; }, goport: () => false,
    showObject: (name) => { applyObjectVisibility(visibility, state, name, true); },
    hideObject: (name) => { applyObjectVisibility(visibility, state, name, false); },
    setZone() {}, level() {}, lstate() {},
    readState: (name) => state.objects.get(name)?.state ?? 0,
    writeState: (name, value) => { const item = state.objects.get(name); if (item) item.state = value; },
  };
  const runtime = new SccRuntime(definition().scc, host, []);
  return {
    runtime,
    finishPath() { pathActive = false; runtime.tick(); },
    finishAnimation(name: string) { animations.set(name, false); runtime.tick(); },
  };
}

describe('Level21 ladder MULT/object identity', () => {
  it('resolves MULT names case-insensitively to the SCC object identity', () => {
    const state = createSceneState(21);
    state.objects.set('Lest', { name: 'Lest', state: 0, depth: 500, kind: 'Object' });
    state.objects.set('Grandmother', { name: 'Grandmother', state: 0, depth: 250, kind: 'Object' });
    expect(findFrameTarget(state.objects, 'LEST')?.name).toBe('Lest');
    expect(findFrameTarget(state.objects, 'lest')?.name).toBe('Lest');
    expect(findFrameTarget(state.objects, 'missing')).toBeUndefined();
  });

  it('audits case-only SCC Object/MULT mismatches and declaration collisions across all 47 scenes', async () => {
    const corpus = await loadTestSceneCatalog();
    const caseOnlyRecords: Array<{ scene: number; animation: string; frame: number; resourceName: string; canonicalName: string }> = [];
    const missedObjects = new Set<string>();
    const remainingAfterFix: string[] = [];
    let resolvedAfterFix = 0;
    const declarationCollisions: Array<{ scene: number; key: string; declarations: string[] }> = [];
    const multSpellingCollisions: Array<{ scene: number; key: string; names: string[] }> = [];

    for (const def of corpus.definitions.values()) {
      const allDeclarations = [
        ...[...def.objects.values()].map((item) => ({ name: item.name, kind: 'Object' })),
        ...[...def.active.values()].map((item) => ({ name: item.name, kind: 'Active' })),
        ...[...def.lights.values()].map((item) => ({ name: item.name, kind: 'Light' })),
      ];
      const declarationsByKey = new Map<string, string[]>();
      for (const item of allDeclarations) {
        const key = item.name.toUpperCase();
        const group = declarationsByKey.get(key) ?? [];
        group.push(`${item.kind}:${item.name}`);
        declarationsByKey.set(key, group);
      }
      for (const [key, declarations] of declarationsByKey) {
        if (new Set(declarations.map((item) => item.slice(item.indexOf(':') + 1))).size > 1) declarationCollisions.push({ scene: def.id, key, declarations });
      }

      const multNamesByKey = new Map<string, Set<string>>();
      for (const [animation, value] of def.animations) {
        for (const [frameIndex, records] of value.file.frames.entries()) {
          for (const record of records) {
            if (record.name === 'Mainhero') continue;
            const key = record.name.toUpperCase();
            const names = multNamesByKey.get(key) ?? new Set<string>();
            names.add(record.name);
            multNamesByKey.set(key, names);
            const candidate = findNamedObject(def.objects.values(), record.name);
            if (!def.objects.has(record.name) && candidate) {
              caseOnlyRecords.push({ scene: def.id, animation, frame: frameIndex + 1, resourceName: record.name, canonicalName: candidate.name });
              missedObjects.add(`${def.id}:${candidate.name}`);
              // The fixed resolver must return the declaration, not create a
              // second runtime identity under the MULT spelling.
              const target = findFrameTarget(new Map([[candidate.name, { name: candidate.name, state: 0, depth: 0, kind: 'Object' as const }]]), record.name);
              if (target?.name === candidate.name) resolvedAfterFix++;
              else remainingAfterFix.push(`${def.id}:${animation}:${frameIndex + 1}:${record.name}`);
            }
          }
        }
      }
      for (const [key, names] of multNamesByKey) if (names.size > 1) multSpellingCollisions.push({ scene: def.id, key, names: [...names].sort() });
    }

    const report = {
      scenes: corpus.definitions.size,
      caseOnlyUnlinkedRecordsBefore: caseOnlyRecords.length,
      uniqueSccObjectsUnlinkedBefore: missedObjects.size,
      scenesWithCaseOnlyLinks: new Set(caseOnlyRecords.map((item) => item.scene)).size,
      unresolvedObjectRecordsAfter: remainingAfterFix.length,
      resolvedCaseOnlyRecordsAfter: resolvedAfterFix,
      caseOnlyDeclarationCollisions: declarationCollisions,
      multCaseSpellingCollisions: multSpellingCollisions,
      exactCrossTypeNameCollisions: [...corpus.definitions.values()].flatMap((def) => {
        const all = [
          ...[...def.objects.values()].map((item) => ({ name: item.name, kind: 'Object' })),
          ...[...def.active.values()].map((item) => ({ name: item.name, kind: 'Active' })),
          ...[...def.lights.values()].map((item) => ({ name: item.name, kind: 'Light' })),
        ];
        return [...declarationsByFold(all)].filter(([, items]) => items.length > 1 && new Set(items.map((item) => item.name)).size === 1)
          .map(([key, items]) => ({ scene: def.id, key, declarations: items.map((item) => `${item.kind}:${item.name}`) }));
      }),
      caseOnlyRecordExamples: caseOnlyRecords,
    };
    console.info(`MULT object-name audit: ${JSON.stringify(report)}`);
    expect(report.scenes).toBe(47);
    expect(report.caseOnlyUnlinkedRecordsBefore).toBe(5);
    expect(report.uniqueSccObjectsUnlinkedBefore).toBe(4);
    expect(report.caseOnlyDeclarationCollisions).toEqual([]);
    expect(report.multCaseSpellingCollisions).toEqual([]);
    expect(report.unresolvedObjectRecordsAfter).toBe(0);
  }, 180000);

  it('loads the real Level21 background and creates the ladder and shadow from Startlevel MULT', () => {
    const def = definition();
    expect(def.background.toLowerCase()).toContain('scn_21');
    const ladderRecord = def.layout.find((record) => record.name === 'LEST')!;
    const shadowRecord = def.layout.find((record) => record.name === 'Lest_ten')!;
    expect(def.animations.has('Startlevel1')).toBe(true);
    const ladderAssignments = [...def.animations].flatMap(([animation, value]) => value.file.frames.flatMap((records, frame) =>
      records.filter((record) => record.name.toUpperCase() === 'LEST').map((record) => ({ animation, frame: frame + 1, record }))));
    expect(ladderAssignments.map(({ animation, frame }) => `${animation}:${frame}`)).toEqual(['Startlevel:1', 'K_lest:12']);
    const shadowAssignments = [...def.animations].flatMap(([animation, value]) => value.file.frames.flatMap((records, frame) =>
      records.filter((record) => record.name.toUpperCase() === 'LEST_TEN').map(() => `${animation}:${frame + 1}`)));
    expect(shadowAssignments).toEqual(['Startlevel:1', 'K_lest:12']);
    const ladderRaster = def.animations.get('Startlevel')!.file.resolve(ladderRecord.slot, ladderRecord.child);
    const shadowRaster = def.animations.get('Startlevel')!.file.resolve(shadowRecord.slot, shadowRecord.child);
    expect([ladderRaster.width, ladderRaster.height]).toEqual([85, 378]);
    expect([shadowRaster.width, shadowRaster.height]).toEqual([51, 236]);
    expect(def.objects.get('Lest')).toMatchObject({ cursorId: 6, depth: 500 });
    expect(def.objects.get('Lest_ten')).toMatchObject({ cursorId: 0, depth: 505 });

    const { state } = scene();
    expect(findFrameTarget(state.objects, 'LEST')?.name).toBe('Lest');
    expect(findFrameTarget(state.objects, 'Lest_ten')?.name).toBe('Lest_ten');
    const pixels = multHitPixels(ladderRaster);
    const x = 800 / 2 + ladderRecord.x;
    const y = 600 / 2 - ladderRecord.y;
    const opaque = pixels.findIndex((_, index) => index % 4 === 3 && pixels[index] !== 0);
    expect(opaque).toBeGreaterThanOrEqual(0);
    const pixelIndex = opaque / 4;
    expect(hitTest({ x, y, width: ladderRaster.width, height: ladderRaster.height, visible: true, removed: false, hitPixels: pixels },
      x - ladderRaster.width / 2 + pixelIndex % ladderRaster.width,
      y - ladderRaster.height / 2 + Math.floor(pixelIndex / ladderRaster.width))).toBe(true);
  });

  it('runs Grandmother=0 refusal through the original SCC handler and does not collect item 29', () => {
    const { state } = scene();
    const { runtime, finishPath, finishAnimation } = interaction(state);
    expect(runtime.click('Lest')).toBe(true);
    finishPath();
    finishPath();
    expect(runtime.busy).toBe(true);
    finishAnimation('Bab_no');
    expect(runtime.inventory).toEqual([]);
    expect(state.objects.get('Lest')?.imageHidden).not.toBe(true);
    expect(runtime.programs.some((program) => program.active)).toBe(false);
  });

  it('with Grandmother=1 hides Lest, adds item 29 once and preserves absence on scene re-entry', () => {
    const { loader, state } = scene();
    state.objects.get('Grandmother')!.state = 1; // Explicit test fixture; production click remains SCC-dispatched.
    const { runtime, finishPath, finishAnimation } = interaction(state);
    expect(runtime.click('Lest')).toBe(true);
    finishPath();
    finishAnimation('K_lest');
    expect(state.objects.get('Lest')).toMatchObject({ imageHidden: true, mult: undefined });
    expect(runtime.inventory).toEqual([29]);
    expect(runtime.programs.some((program) => program.active)).toBe(false);

    // Scene declaration on re-entry keeps the old base-Object MULT-empty state.
    declareSceneObjects(loader, state, definition());
    expect(state.objects.get('Lest')).toMatchObject({ imageHidden: true, mult: undefined });
  });
});
