import { decodeMult, type MultFile, type MultObject } from '../mult/decoder';
import { parseAnimationDeclarations, AnimationPlayer } from '../animation/player';
import { parseFaultLists, parseFclickBindings, type FaultList } from '../scc/runtime';
import { parseSceneDeclarations, parseFrameDepthEvents, type FrameDepthEvent, type SceneDeclarationIdentity, type SceneObjectDeclaration } from '../navigation/depth-sort';
import type { NavigationMask } from '../navigation/router';
import type { SccPortal } from '../scc/runtime';
import { parsePortals } from './scene-loader';
import { SCENE_HEIGHT } from '../config';
import { parseFrameSoundEvents, type FrameSoundEvent } from '../audio/scc-audio';

export type SceneAnimation = { name: string; rate: number; loop: boolean; locomotion: boolean; file: MultFile };

/**
 * A fully parsed original scene: geometry from the SCC, mask and MULT resources.
 * Long-lived object state (SceneState) is deliberately NOT part of this structure:
 * a definition is immutable and may be cached for the duration of one visit.
 */
export type SceneDefinition = {
  id: number;
  /** Prepared URL of the original SCC, for diagnostics. */
  sccUrl: string;
  /** Original SCC text that the runtime parses. */
  scc: string;
  background: string;
  mask: NavigationMask;
  /** All Setmsk targets referenced by this scene, indexed by normalized SCC path. */
  masks: Map<string, NavigationMask>;
  initialMaskPath: string;
  completionEvents?: Map<string, string>;
  /** Visit-scoped Fault declarations in source order; names are intentionally not coalesced. */
  faultLists: FaultList[];
  focus: readonly [number, number, number];
  portals: SccPortal[];
  objects: Map<string, SceneObjectDeclaration>;
  active: Map<string, SceneObjectDeclaration>;
  lights: Map<string, SceneObjectDeclaration>;
  declarationOrder?: SceneDeclarationIdentity[];
  frameDepthEvents: FrameDepthEvent[];
  animations: Map<string, SceneAnimation>;
  player: AnimationPlayer;
  /** Absent for original scenes that have no `Startlevel` layout (e.g. Level45). */
  layoutAnimation?: string;
  layout: readonly MultObject[];
  /** Normalized original external path (`tzu/scn_37/...`) -> prepared PNG URL. */
  externalImages: ReadonlyMap<string, string>;
  /** Non-fatal resource problems discovered while loading this visit. */
  warnings: string[];
  audioEvents: FrameSoundEvent[];
  audioResources: Readonly<Record<string, string>>;
  audioDurations: Readonly<Record<string, number>>;
  audioStorageModes?: Readonly<Record<string, 'sharedPcm' | 'privateDecoded'>>;
};

/** Compact, texture-free identity metadata used to validate persistent saves. */
export type SceneValidationIndex = {
  id: number;
  scc: string;
  objectNames: ReadonlySet<string>;
  activeNames: ReadonlySet<string>;
  lightNames: ReadonlySet<string>;
  frameDepthEvents: readonly Pick<FrameDepthEvent, 'animation' | 'frame' | 'objectName'>[];
  animations: ReadonlyMap<string, { frameCount: number; frames?: readonly (readonly string[])[] }>;
};

export function createSceneValidationIndex(definition: SceneDefinition): SceneValidationIndex {
  const animations = new Map<string, { frameCount: number; frames: string[][] }>();
  for (const [name, animation] of definition.animations) {
    animations.set(name, { frameCount: animation.file.frameCount, frames: animation.file.frames.map(frame => frame.map(record => record.name)) });
  }
  return {
    id: definition.id, scc: definition.scc,
    objectNames: new Set([...definition.objects.keys()].map(name => name.toUpperCase())),
    activeNames: new Set([...definition.active.keys()].map(name => name.toUpperCase())),
    lightNames: new Set([...definition.lights.keys()].map(name => name.toUpperCase())),
    frameDepthEvents: definition.frameDepthEvents.map(({ animation, frame, objectName }) => ({ animation, frame, objectName })),
    animations,
  };
}

export type SceneDefinitionInput = {
  id: number;
  sccUrl: string;
  scc: string;
  /** Texts of recursively included SCCs, in encounter order (before scene declarations). */
  includeSources?: readonly string[];
  /** Legacy direct Mainhero text; equivalent to including it in `includeSources`. */
  mainheroScc?: string;
  background: string;
  mask: NavigationMask;
  masks?: ReadonlyMap<string, NavigationMask>;
  mults: ReadonlyMap<string, Uint8Array | ArrayBuffer | MultFile>;
  externalImages?: Readonly<Record<string, string>>;
  layoutAnimation?: string;
  audioResources?: Readonly<Record<string, string>>;
  audioDurations?: Readonly<Record<string, number>>;
  audioStorageModes?: Readonly<Record<string, 'sharedPcm' | 'privateDecoded'>>;
};

/** Focus <A> <B> <C> feeds depth/scale: depth = q*B, scale = A/(A+depth)*C. */
export function parseFocus(scc: string, fallback: readonly [number, number, number] = [120, 1, 1]): [number, number, number] {
  const match = /^\s*Focus\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)/im.exec(scc);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [...fallback];
}

/** Anim/Animc <rate> <name> Casm <original path> - the resource path of every animation. */
export function parseAnimationPaths(scc: string): Map<string, string> {
  const paths = new Map<string, string>();
  for (const line of scc.split(/\r?\n/)) {
    const match = /^\s*Animc?\s+\d+\s+(\S+)\s+\S+\s+(\S+)/i.exec(line);
    if (match) paths.set(match[1], match[2]);
  }
  return paths;
}

/** All Anim/Animc paths from a scene plus its recursively included SCCs. */
export function parseAnimationPathsFromSources(...sources: readonly string[]): Map<string, string> {
  const paths = new Map<string, string>();
  for (const source of sources) for (const [name, path] of parseAnimationPaths(source)) paths.set(name, path);
  return paths;
}

/** Must match the build-time key used in the manifest's `externalImages`. */
export function normalizeExternalPath(value: string): string {
  return value
    .replaceAll('\\', '/')
    .replace(/\/+/g, '/')
    .replace(/^\.?\//, '')
    .toLowerCase();
}

function isMultFile(value: Uint8Array | ArrayBuffer | MultFile): value is MultFile {
  return typeof value === 'object' && 'frameCount' in value && 'resolve' in value;
}

function normalizeOriginalPath(originalPath: string): string {
  return originalPath.replaceAll('\\', '/').toLowerCase().replace(/^\.?\//, '');
}

/**
 * Resolves an original SCC resource path (e.g. `XSH\SCN_39\start.mult`) against the
 * prepared asset index. Ambiguous suffixes fail instead of silently picking a file.
 */
export function resolveOriginalResource(index: Readonly<Record<string, string>>, originalPath: string): string {
  const wanted = normalizeOriginalPath(originalPath);
  const candidates: string[] = [];
  for (const [key, value] of Object.entries(index)) {
    if (key === wanted || key.endsWith(`/${wanted}`)) candidates.push(value);
  }
  if (candidates.length === 0) throw new Error(`Original SCC resource is not in the prepared index: ${originalPath}`);
  if (candidates.length > 1) throw new Error(`Original SCC resource is ambiguous in the prepared index: ${originalPath} -> ${candidates.join(', ')}`);
  return candidates[0];
}

/**
 * Builds an immutable scene definition from original SCC text and already decoded
 * MULT bytes. Names in `mults` are SCC animation names, so the same function works
 * for every supported level and for the shared Mainhero animations.
 */
export function buildSceneDefinition(input: SceneDefinitionInput): SceneDefinition {
  const { id, sccUrl, scc, includeSources = [], mainheroScc, background, mask, mults } = input;
  if (mask.height !== SCENE_HEIGHT) throw new Error(`Scene ${id} mask height ${mask.height} is not ${SCENE_HEIGHT}`);
  // The original parser expands `Inc` in place. Every corpus Level SCC puts its
  // includes at the top, so parsing included declarations before the scene text is
  // equivalent and keeps scene-local declarations authoritative.
  const rateSources = [...includeSources, ...(mainheroScc ? [mainheroScc] : []), scc];
  const declarationSource = [...includeSources, scc].join('\n');
  const initialMaskPath = /^\s*Mask\s+(\S+)/im.exec(scc)?.[1] ?? '';
  const declarations = parseSceneDeclarations(declarationSource);
  const faultParse = parseFaultLists(scc, id);
  const rates = parseAnimationDeclarations(...rateSources);
  const warnings: string[] = [];
  const animations = new Map<string, SceneAnimation>();
  for (const [name, bytes] of mults) {
    const declaration = rates.get(name);
    if (!declaration) {
      warnings.push(`Animation ${name} has no Anim/Animc declaration`);
      continue;
    }
    animations.set(name, {
      name,
      rate: declaration.rate,
      loop: declaration.loop,
      locomotion: /^Walk/i.test(name),
      file: isMultFile(bytes) ? bytes : decodeMult(bytes),
    });
  }
  let layoutAnimation = input.layoutAnimation
    ?? [...animations.keys()].find((name) => name.toLowerCase() === 'startlevel');
  if (layoutAnimation && !animations.has(layoutAnimation)) {
    warnings.push(`Layout animation ${layoutAnimation} is unavailable`);
    layoutAnimation = undefined;
  }
  const layout = layoutAnimation ? (animations.get(layoutAnimation)!.file.frames[0] ?? []) : [];
  if (layoutAnimation && layout.length === 0) warnings.push(`Layout animation ${layoutAnimation} frame 1 is empty`);
  const player = new AnimationPlayer([...animations.values()].map((animation) => ({
    name: animation.name,
    rate: animation.rate,
    frameCount: animation.file.frameCount,
    loop: animation.loop,
    locomotion: animation.locomotion,
  })));
  const externalImages = new Map<string, string>();
  for (const [originalPath, url] of Object.entries(input.externalImages ?? {})) {
    externalImages.set(normalizeExternalPath(originalPath), url);
  }
  return {
    id,
    sccUrl,
    scc,
    background,
    mask,
    masks: new Map([...(input.masks ?? new Map()).entries()].map(([path, value]) => [normalizeExternalPath(path), value])),
    initialMaskPath: normalizeExternalPath(initialMaskPath),
    completionEvents: parseFclickBindings(declarationSource),
    faultLists: faultParse.lists,
    focus: parseFocus(scc),
    portals: parsePortals(scc),
    objects: declarations.objects,
    active: declarations.active,
    lights: declarations.lights,
    declarationOrder: declarations.order,
    frameDepthEvents: parseFrameDepthEvents(declarationSource),
    animations,
    player,
    layoutAnimation,
    layout,
    externalImages,
    warnings: [...warnings, ...faultParse.diagnostics],
    audioEvents: parseFrameSoundEvents(declarationSource),
    audioResources: input.audioResources ?? {},
    audioDurations: input.audioDurations ?? {},
    audioStorageModes: input.audioStorageModes ?? {},
  };
}
