/**
 * Build-time discovery of the original scene corpus.
 *
 * The browser prototype must not assume that a numeric scene has an SCC file, nor
 * that a scene's background/mask/MULT names follow the scene number. Everything is
 * read from `Scripts\Level<n>.scc`, its recursive `Inc` graph and the original
 * resource tree. This module is Node-only; the browser consumes the generated
 * manifest (`public/generated/scenes.json`) instead.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

export type MissingDependency = {
  kind: 'include' | 'background' | 'mask' | 'mult' | 'external-image';
  originalPath: string;
  sourcePath?: string;
  required: boolean;
  message: string;
};

export type SourcePath = { originalPath: string; sourcePath: string };

export type SceneAnimationDependency = {
  name: string;
  originalPath: string;
  sourcePath?: string;
  required: boolean;
};

export type SceneDependencyRecord = {
  id: number;
  /** Actual SCC file name in the original Scripts directory, e.g. `Level1.scc`. */
  sccFileName: string;
  includes: SourcePath[];
  background?: SourcePath;
  backgrounds: SourcePath[];
  mask?: SourcePath;
  masks: SourcePath[];
  animations: SceneAnimationDependency[];
  externalImages: SourcePath[];
  layoutAnimation?: string;
  requiredAnimations: string[];
  missing: MissingDependency[];
};

export type SceneDiagnostic = {
  level: 'warning' | 'error';
  scene?: number;
  kind: string;
  path?: string;
  message: string;
};

export type SceneDiscovery = {
  sourceRoot: string;
  scriptsRoot: string;
  scenes: SceneDependencyRecord[];
  diagnostics: SceneDiagnostic[];
};

export type DiscoveryOptions = {
  sourceRoot: string;
  scriptsRoot: string;
  readText?: (file: string) => Promise<string>;
};

const decoder1251 = new TextDecoder('windows-1251');
const LEVEL_SCC = /^level(\d+)\.scc$/i;

export function normalizeOriginalPath(value: string): string {
  return value
    .replaceAll('\\', '/')
    .replace(/\/+/g, '/')
    .replace(/^\.?\//, '')
    .toLowerCase();
}

export async function listRelativeFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '.DS_Store') continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) found.push(path.relative(root, full).split(path.sep).join('/'));
    }
  }
  await walk(root);
  return found.sort();
}

/**
 * The canonical original resource tree lives under `block<n>/`. A stray top-level
 * `Backgrd/Scn_01.TIF` duplicates block1 and must not make the suffix lookup
 * ambiguous, so only block directories participate.
 */
function buildSourceIndex(files: readonly string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const file of files) {
    if (!/^block\d+\//i.test(file)) continue;
    index.set(file.toLowerCase(), file);
  }
  return index;
}

export type SourceResolution =
  | { status: 'found'; sourcePath: string }
  | { status: 'missing'; candidates: string[] }
  | { status: 'ambiguous'; candidates: string[] };

/** Resolves an original SCC path (`XSH\SCN_37\start.mult`) by case-insensitive suffix. */
export function resolveSourcePath(index: ReadonlyMap<string, string>, originalPath: string): SourceResolution {
  const wanted = normalizeOriginalPath(originalPath);
  const candidates: string[] = [];
  for (const [key, value] of index) {
    if (key === wanted || key.endsWith(`/${wanted}`)) candidates.push(value);
  }
  candidates.sort();
  if (candidates.length === 1) return { status: 'found', sourcePath: candidates[0] };
  if (candidates.length === 0) return { status: 'missing', candidates };
  return { status: 'ambiguous', candidates };
}

export function parseIncludes(source: string): string[] {
  const includes: string[] = [];
  for (const match of source.matchAll(/^\s*Inc\s+(\S+)/gim)) includes.push(match[1]);
  return includes;
}

export function parseSceneHeader(source: string): { background?: string; mask?: string } {
  const background = /^\s*Back\s+(\S+)/im.exec(source)?.[1];
  const mask = /^\s*Mask\s+(\S+)/im.exec(source)?.[1];
  return { background, mask };
}

export type ParsedAnimation = { name: string; originalPath: string; rate: number; loop: boolean };

/** `Anim`/`Animc <rate> <name> <token> <path>` declarations for one scene. */
export function parseAnimationDeclarations(source: string): ParsedAnimation[] {
  const animations: ParsedAnimation[] = [];
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*(Animc?)\s+(\d+)\s+(\S+)\s+\S+\s+(\S+)/i.exec(line);
    if (!match) continue;
    animations.push({
      name: match[3],
      originalPath: match[4],
      rate: Number(match[2]),
      loop: match[1].toLowerCase() === 'animc',
    });
  }
  return animations;
}

/** First `Startlevel` declaration, if the scene uses a layout MULT at all. */
export function findLayoutAnimation(animations: readonly ParsedAnimation[]): string | undefined {
  return animations.find((animation) => animation.name.toLowerCase() === 'startlevel')?.name;
}

/**
 * Minimal scan for external-image MULT records (-14). The runtime decoder remains
 * the single format authority; this build-time scan only discovers dependencies.
 */
export function scanMultExternalPaths(bytes: Uint8Array): { paths: string[]; error?: string } {
  if (bytes.length < 0x4000) return { paths: [], error: `MULT header is truncated (${bytes.length} bytes)` };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const frameCount = view.getUint32(0, true);
  if (frameCount === 0 || frameCount > 100_000) return { paths: [], error: `invalid MULT frame count ${frameCount}` };
  const paths = new Set<string>();
  let offset = 0x4000;
  for (let slot = 1; slot <= frameCount; slot++) {
    if (offset + 4 > bytes.length) return { paths: [...paths], error: `missing record count for frame ${slot}` };
    const count = view.getUint32(offset, true);
    offset += 4;
    for (let child = 0; child < count; child++) {
      if (offset + 0x42 > bytes.length) return { paths: [...paths], error: `truncated object header at 0x${offset.toString(16)}` };
      const type = view.getInt32(offset + 0x32, true);
      const recordSize = view.getUint32(offset + 0x36, true);
      if (recordSize < 0x4a || offset + recordSize > bytes.length) {
        return { paths: [...paths], error: `invalid record size ${recordSize} at 0x${offset.toString(16)}` };
      }
      if (type !== -16 && type !== -13 && type !== -14) return { paths: [...paths], error: `unsupported MULT record type ${type}` };
      if (type === -14) {
        const raw = bytes.subarray(offset + 0x42, Math.min(offset + 0x142, bytes.length));
        const end = raw.indexOf(0);
        paths.add(decoder1251.decode(raw.subarray(0, end < 0 ? raw.length : end)));
      }
      offset += recordSize;
    }
  }
  return { paths: [...paths] };
}

export type ExpandedIncludes = {
  source: string;
  includes: SourcePath[];
  missing: MissingDependency[];
  diagnostics: SceneDiagnostic[];
};

/**
 * Recursive `Inc` expansion at the point of appearance, matching the original
 * parser. Includes are deduplicated for resource preparation, while the expanded
 * text keeps their original position for Anim/Animc rate lookup.
 */
async function expandIncludes(
  sceneId: number,
  sceneSource: string,
  scriptsIndex: ReadonlyMap<string, string>,
  readScript: (relativePath: string) => Promise<string>,
  stack: readonly string[],
): Promise<ExpandedIncludes> {
  const includes: SourcePath[] = [];
  const missing: MissingDependency[] = [];
  const diagnostics: SceneDiagnostic[] = [];
  const seen = new Set<string>();
  const lines = sceneSource.split(/\r?\n/);
  const expanded: string[] = [];
  for (const line of lines) {
    const match = /^\s*Inc\s+(\S+)/i.exec(line);
    if (!match) { expanded.push(line); continue; }
    const originalPath = match[1];
    const base = normalizeOriginalPath(originalPath).split('/').pop()!;
    const sourcePath = scriptsIndex.get(base);
    if (!sourcePath) {
      missing.push({ kind: 'include', originalPath, required: true, message: `Included SCC is missing: ${originalPath}` });
      diagnostics.push({ level: 'error', scene: sceneId, kind: 'include', path: originalPath, message: `Included SCC is missing: ${originalPath}` });
      continue;
    }
    if (stack.includes(sourcePath)) {
      diagnostics.push({ level: 'error', scene: sceneId, kind: 'include-cycle', path: sourcePath, message: `Cyclic Inc ${sourcePath}` });
      continue;
    }
    if (!seen.has(sourcePath)) {
      seen.add(sourcePath);
      includes.push({ originalPath, sourcePath });
    }
    const text = await readScript(sourcePath);
    const nested = await expandIncludes(sceneId, text, scriptsIndex, readScript, [...stack, sourcePath]);
    expanded.push(...nested.source.split(/\r?\n/));
    for (const nestedPath of nested.includes) if (!seen.has(nestedPath.sourcePath)) { seen.add(nestedPath.sourcePath); includes.push(nestedPath); }
    missing.push(...nested.missing);
    diagnostics.push(...nested.diagnostics);
  }
  return { source: expanded.join('\n'), includes, missing, diagnostics };
}

/**
 * Discovers every scene that actually has an SCC and resolves all resource
 * dependencies reachable through Back/Mask/Anim/Animc plus MULT external records.
 */
export async function discoverSceneDependencies(options: DiscoveryOptions): Promise<SceneDiscovery> {
  const { sourceRoot, scriptsRoot } = options;
  const readText = options.readText ?? ((file: string) => readFile(file, 'utf8'));
  const rawScriptsFiles = await listRelativeFiles(scriptsRoot);
  const scriptsIndex = new Map<string, string>();
  const duplicateScripts = new Set<string>();
  for (const file of rawScriptsFiles) {
    if (!/\.scc$/i.test(file)) continue;
    const key = path.basename(file).toLowerCase();
    if (scriptsIndex.has(key)) duplicateScripts.add(key);
    scriptsIndex.set(key, file);
  }
  const sourceFiles = await listRelativeFiles(sourceRoot);
  const sourceIndex = buildSourceIndex(sourceFiles);
  const diagnostics: SceneDiagnostic[] = [];
  for (const duplicate of duplicateScripts) {
    diagnostics.push({ level: 'error', kind: 'duplicate-scc', path: duplicate, message: `Several SCC files share the case-insensitive name ${duplicate}` });
  }

  const sceneFiles = rawScriptsFiles
    .map((file) => ({ file, match: LEVEL_SCC.exec(path.basename(file)) }))
    .filter((entry): entry is { file: string; match: RegExpExecArray } => Boolean(entry.match))
    .map(({ file, match }) => ({ id: Number(match[1]), file }))
    .sort((a, b) => a.id - b.id);
  const seenIds = new Set<number>();
  for (const scene of sceneFiles) {
    if (seenIds.has(scene.id)) diagnostics.push({ level: 'error', scene: scene.id, kind: 'duplicate-scene', path: scene.file, message: `Duplicate Level${scene.id}.scc` });
    seenIds.add(scene.id);
  }

  const scenes: SceneDependencyRecord[] = [];
  const readScript = (relativePath: string) => readText(path.join(scriptsRoot, relativePath));
  for (const sceneFile of sceneFiles) {
    const id = sceneFile.id;
    const sceneSource = await readScript(sceneFile.file);
    const expanded = await expandIncludes(id, sceneSource, scriptsIndex, readScript, [sceneFile.file]);
    diagnostics.push(...expanded.diagnostics);
    const header = parseSceneHeader(sceneSource);
    const missing: MissingDependency[] = [...expanded.missing];

    const resolve = (originalPath: string | undefined, kind: 'background' | 'mask'): SourcePath | undefined => {
      if (!originalPath) {
        missing.push({ kind, originalPath: '', required: true, message: `Level${id}.scc has no ${kind === 'background' ? 'Back' : 'Mask'} declaration` });
        return undefined;
      }
      const resolution = resolveSourcePath(sourceIndex, originalPath);
      if (resolution.status === 'found') return { originalPath, sourcePath: resolution.sourcePath };
      missing.push({
        kind, originalPath, required: true,
        message: resolution.status === 'missing'
          ? `${kind} is missing: ${originalPath}`
          : `${kind} is ambiguous: ${originalPath} -> ${resolution.candidates.join(', ')}`,
      });
      if (resolution.status === 'ambiguous') {
        diagnostics.push({ level: 'error', scene: id, kind: `${kind}-ambiguous`, path: originalPath, message: `Ambiguous ${kind}: ${resolution.candidates.join(', ')}` });
      }
      return undefined;
    };

    const background = resolve(header.background, 'background');
    const backgroundPaths = new Set<string>([...(header.background ? [header.background] : []), ...[...expanded.source.matchAll(/^\s*Setbck\s+(\S+)/gim)].map((match) => match[1])]);
    const backgrounds = [...backgroundPaths].map((backgroundPath) => resolve(backgroundPath, 'background')).filter((resource): resource is SourcePath => Boolean(resource));
    const mask = resolve(header.mask, 'mask');
    const maskPaths = new Set<string>([...(header.mask ? [header.mask] : []), ...[...expanded.source.matchAll(/^\s*Setmsk\s+(\S+)/gim)].map((match) => match[1])]);
    const masks = [...maskPaths].map((maskPath) => resolve(maskPath, 'mask')).filter((resource): resource is SourcePath => Boolean(resource));

    const parsedAnimations = parseAnimationDeclarations(expanded.source);
    const layoutAnimation = findLayoutAnimation(parsedAnimations);
    const requiredAnimations = new Set<string>();
    if (layoutAnimation) requiredAnimations.add(layoutAnimation);
    // The loader applies Stop<Portal.direction> on every entry; these are shared
    // Mainhero poses and are required for a visible hero.
    for (let direction = 0; direction < 8; direction++) requiredAnimations.add(`Stop${direction}`);
    const declaredNames = new Set(parsedAnimations.map((animation) => animation.name));
    const animations: SceneAnimationDependency[] = [];
    const externalImages = new Map<string, SourcePath>();
    for (const animation of parsedAnimations) {
      const required = requiredAnimations.has(animation.name) && declaredNames.has(animation.name);
      const resolution = resolveSourcePath(sourceIndex, animation.originalPath);
      if (resolution.status !== 'found') {
        missing.push({
          kind: 'mult', originalPath: animation.originalPath, required,
          message: resolution.status === 'missing'
            ? `MULT for ${animation.name} is missing: ${animation.originalPath}`
            : `MULT for ${animation.name} is ambiguous: ${animation.originalPath} -> ${resolution.candidates.join(', ')}`,
        });
        animations.push({ name: animation.name, originalPath: animation.originalPath, required });
        continue;
      }
      animations.push({ name: animation.name, originalPath: animation.originalPath, sourcePath: resolution.sourcePath, required });
      let bytes: Uint8Array;
      try {
        bytes = await readFile(path.join(sourceRoot, resolution.sourcePath));
      } catch (error) {
        missing.push({
          kind: 'mult', originalPath: animation.originalPath, sourcePath: resolution.sourcePath, required,
          message: `Cannot read MULT for ${animation.name}: ${String(error)}`,
        });
        continue;
      }
      const scanned = scanMultExternalPaths(bytes);
      if (scanned.error) {
        missing.push({
          kind: 'mult', originalPath: animation.originalPath, sourcePath: resolution.sourcePath, required,
          message: `Cannot scan MULT for ${animation.name}: ${scanned.error}`,
        });
        diagnostics.push({ level: required ? 'error' : 'warning', scene: id, kind: 'mult-invalid', path: resolution.sourcePath, message: scanned.error });
        continue;
      }
      for (const externalPath of scanned.paths) {
        const key = normalizeOriginalPath(externalPath);
        if (externalImages.has(key)) continue;
        const externalResolution = resolveSourcePath(sourceIndex, externalPath);
        if (externalResolution.status === 'found') {
          externalImages.set(key, { originalPath: externalPath, sourcePath: externalResolution.sourcePath });
        } else {
          missing.push({
            kind: 'external-image', originalPath: externalPath, required: false,
            message: externalResolution.status === 'missing'
              ? `External animation image is missing: ${externalPath}`
              : `External animation image is ambiguous: ${externalPath} -> ${externalResolution.candidates.join(', ')}`,
          });
          diagnostics.push({
            level: 'warning', scene: id, kind: 'external-image', path: externalPath,
            message: externalResolution.status === 'missing' ? 'external image is missing' : 'external image is ambiguous',
          });
        }
      }
    }

    const requiredMissing = missing.filter((entry) => entry.required);
    if (requiredMissing.length) diagnostics.push({ level: 'error', scene: id, kind: 'scene-incomplete', message: `Level${id} is not loadable: ${requiredMissing.map((entry) => entry.message).join('; ')}` });

    for (const animation of animations) {
      if (!animation.sourcePath && !animation.required) {
        diagnostics.push({ level: 'warning', scene: id, kind: 'optional-mult', path: animation.originalPath, message: `Optional animation ${animation.name} is unavailable` });
      }
    }

    scenes.push({
      id,
      sccFileName: sceneFile.file,
      includes: expanded.includes,
      background,
      backgrounds,
      mask,
      masks,
      animations,
      externalImages: [...externalImages.values()],
      layoutAnimation,
      requiredAnimations: [...requiredAnimations].filter((name) => declaredNames.has(name)),
      missing,
    });
  }

  return { sourceRoot, scriptsRoot, scenes, diagnostics };
}
