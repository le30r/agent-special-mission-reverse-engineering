import { decodeMult, type MultFile, type MultObject } from '../mult/decoder';
import { parseAnimationDeclarations, AnimationPlayer } from '../animation/player';
import { parseSceneDeclarations, parseFrameDepthEvents, type FrameDepthEvent, type SceneObjectDeclaration } from '../navigation/depth-sort';
import type { NavigationMask } from '../navigation/router';
import type { SccPortal } from '../scc/runtime';
import { parsePortals } from './scene-loader';
import { SCENE_HEIGHT } from '../config';

export type SceneAnimation = { name: string; rate: number; loop: boolean; locomotion: boolean; file: MultFile };

/**
 * A fully parsed original scene: geometry from the SCC, mask and MULT resources.
 * Long-lived object state (SceneState) is deliberately NOT part of this structure:
 * a definition is immutable and may be cached across re-entries.
 */
export type SceneDefinition = {
  id: number;
  /** Prepared URL of the original SCC, for diagnostics. */
  sccUrl: string;
  /** Original SCC text that the runtime parses. */
  scc: string;
  background: string;
  mask: NavigationMask;
  focus: readonly [number, number, number];
  portals: SccPortal[];
  objects: Map<string, SceneObjectDeclaration>;
  active: Map<string, SceneObjectDeclaration>;
  lights: Map<string, SceneObjectDeclaration>;
  frameDepthEvents: FrameDepthEvent[];
  animations: Map<string, SceneAnimation>;
  player: AnimationPlayer;
  layoutAnimation: string;
  layout: readonly MultObject[];
};

export type SceneDefinitionInput = {
  id: number;
  sccUrl: string;
  scc: string;
  mainheroScc: string;
  background: string;
  mask: NavigationMask;
  mults: ReadonlyMap<string, Uint8Array | ArrayBuffer>;
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
  const { id, sccUrl, scc, mainheroScc, background, mask, mults } = input;
  if (mask.height !== SCENE_HEIGHT) throw new Error(`Scene ${id} mask height ${mask.height} is not ${SCENE_HEIGHT}`);
  const declarations = parseSceneDeclarations(scc);
  const rates = parseAnimationDeclarations(scc, mainheroScc);
  const animations = new Map<string, SceneAnimation>();
  for (const [name, bytes] of mults) {
    const declaration = rates.get(name);
    if (!declaration) continue;
    animations.set(name, {
      name,
      rate: declaration.rate,
      loop: declaration.loop,
      locomotion: /^Walk/i.test(name),
      file: decodeMult(bytes),
    });
  }
  let layoutAnimation: string | undefined;
  for (const name of animations.keys()) if (name.toLowerCase() === 'startlevel') layoutAnimation = name;
  if (!layoutAnimation) throw new Error(`Scene ${id} has no Startlevel animation to supply scene object layout`);
  const layout = animations.get(layoutAnimation)!.file.frames[0] ?? [];
  if (layout.length === 0) throw new Error(`Scene ${id} Startlevel frame 1 is empty`);
  const player = new AnimationPlayer([...animations.values()].map((animation) => ({
    name: animation.name,
    rate: animation.rate,
    frameCount: animation.file.frameCount,
    loop: animation.loop,
    locomotion: animation.locomotion,
  })));
  return {
    id,
    sccUrl,
    scc,
    background,
    mask,
    focus: parseFocus(scc),
    portals: parsePortals(scc),
    objects: declarations.objects,
    active: declarations.active,
    lights: declarations.lights,
    frameDepthEvents: parseFrameDepthEvents(scc),
    animations,
    player,
    layoutAnimation,
    layout,
  };
}
