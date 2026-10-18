import type { SccPortal } from '../scc/runtime';
import type { SceneDeclarationKind, SceneRect } from '../navigation/depth-sort';

export type SceneImageReference = { file: string; frame: number; slot: number; child: number };
/**
 * Documented origin of the current painter depth. The original engine has no
 * provenance field; this is an analysis/debug annotation used by ?debug=depth.
 */
export type DepthProvenance =
  | { kind: 'declaration'; detail?: string }
  | { kind: 'objzet'; detail?: string }
  | { kind: 'fram'; detail?: string }
  | { kind: 'default'; detail?: string };
export type SceneObjectState = {
  name: string;
  state: number;
  depth: number;
  /** Where `depth` came from: SCC declaration, Objzet, Fram or a fallback. */
  depthProvenance?: DepthProvenance;
  /** Last applied MULT image. A base `Object` loses this reference on `Hide`. */
  mult?: SceneImageReference;
  /**
   * Original base `Object` "empty MULT name" state. It survives a scene transition
   * until a later MULT frame assigns an image again.
   */
  imageHidden?: boolean;
  /** `Active`/`Light` visibility byte (+0x297); Active starts hidden. */
  visible?: boolean;
  /** Hover cursor ID (+0x152), written by SCC `Cursor name value`. */
  cursorId?: number;
  /** Immutable `Active` world rectangle, copied from its declaration. */
  rect?: SceneRect;
  kind?: SceneDeclarationKind;
  placeholder?: boolean;
};
export type SceneState = { id: number; initialized: boolean; objects: Map<string, SceneObjectState>; portals: SccPortal[]; focus: [number, number, number]; savedPosition: [number, number]; savedDirection: number; declarations: string[] };
export type SceneRuntime = { id: number; handlers: unknown[]; animations: unknown[]; resources: Set<{ destroy?: () => void }>; disposed: boolean };
export function createSceneState(id: number): SceneState {
  // savedDirection defaults to the verified initial pose (Level1 Init uses Stop6).
  return { id, initialized: false, objects: new Map(), portals: [], focus: [120,1,1], savedPosition: [0,0], savedDirection: 6, declarations: [] };
}
export function createSceneRuntime(id: number): SceneRuntime { return { id, handlers: [], animations: [], resources: new Set(), disposed: false }; }

/** Label used by ?debug=depth; keeps the native origin names visible. */
export function depthOriginLabel(provenance: DepthProvenance | undefined): string {
  if (!provenance) return 'unknown origin';
  const detail = provenance.detail ? ` (${provenance.detail})` : '';
  switch (provenance.kind) {
    case 'declaration': return `SCC declaration${detail}`;
    case 'objzet': return `SCC Objzet${detail}`;
    case 'fram': return `SCC Fram${detail}`;
    case 'default': return `default${detail}`;
  }
}

/**
 * Writes a depth and its provenance into the long-lived object list. Kept pure so
 * tests can verify the same mutation the renderer performs from Objzet/Fram.
 */
export function setStateDepth(state: SceneState, name: string, depth: number, provenance: DepthProvenance): SceneObjectState {
  const object = state.objects.get(name);
  if (object) {
    object.depth = depth;
    object.depthProvenance = provenance;
    return object;
  }
  const created: SceneObjectState = { name, state: 0, depth, kind: 'Object', depthProvenance: provenance };
  state.objects.set(name, created);
  return created;
}

/** Owns long-lived per-scene data separately from disposable browser/Pixi resources. */
export class SceneLoader {
  readonly states = new Map<number, SceneState>();
  readonly inventory: number[] = [];
  /** Game-session state shared by every scene; SCC `Setzon` writes `zone`. */
  readonly game = { zone: 0 };
  active?: SceneState;
  runtime?: SceneRuntime;
  pending?: { scene: number; portal: number };
  constructor(readonly releaseProgram: () => void = () => {}) {}
  state(id: number): SceneState { let value = this.states.get(id); if (!value) { value = createSceneState(id); this.states.set(id,value); } return value; }
  lstate(scene: number, name: string, value: number): void {
    const target = this.state(scene), old = target.objects.get(name);
    if (old) old.state = value; else if (!target.initialized) target.objects.set(name,{ name,state:value,depth:0,placeholder:true });
  }
  declareObject(scene: SceneState, object: SceneObjectState): void {
    const old = scene.objects.get(object.name);
    // Re-parsing a scene must not recreate object state. A real object keeps its
    // State, Objzet depth, last rendered MULT reference and visibility; a placeholder
    // only carries State forward (theme of 0x407c14 / 0x407ffc: objects and State stay).
    if (old) {
      object.state = old.state;
      if (!old.placeholder) {
        object.depth = old.depth;
        object.depthProvenance = old.depthProvenance;
        object.mult = old.mult;
        object.imageHidden = old.imageHidden;
        if (old.visible !== undefined) object.visible = old.visible;
      }
    }
    scene.objects.set(object.name,object);
  }
  schedule(scene: number, portal: number): void { this.pending = { scene,portal }; }
  /**
   * Called only at the game-loop scene boundary; Level itself never switches synchronously.
   * Order matches the original loader: parse/preload -> Init (first entry) -> placement -> Start
   * -> mark the scene initialized. A yield inside Init is deliberately not awaited here.
   */
  enterPending(
    prepare: (state: SceneState, runtime: SceneRuntime, firstEntry: boolean) => void,
    position: (state: SceneState, portal?: SccPortal) => void,
    start: (state: SceneState) => void,
    init: (state: SceneState, runtime: SceneRuntime) => void = () => {},
  ): boolean {
    if (!this.pending) return false;
    const {scene:id,portal:index} = this.pending; this.pending = undefined;
    const target = this.state(id);
    this.releaseProgram(); this.disposeRuntime();
    const first = !target.initialized;
    const runtime = createSceneRuntime(id);
    // Resource parsing/Inc is performed by prepare in source order, before Init.
    prepare(target,runtime,first);
    this.active = target; this.runtime = runtime;
    // Init is a normal Click/Program: run synchronously until its first yield.
    if (first) init(target,runtime);
    position(target,index >= 0 ? target.portals[index] : undefined);
    start(target);
    // scene+4 becomes 1 only after the loader's Init/placement/Start sequence.
    if (first) target.initialized = true;
    return true;
  }
  disposeRuntime(): void {
    if (!this.runtime || this.runtime.disposed) return;
    for (const resource of this.runtime.resources) resource.destroy?.();
    this.runtime.handlers.length = 0; this.runtime.animations.length = 0; this.runtime.resources.clear(); this.runtime.disposed = true;
    this.runtime = undefined;
  }
}

export function parsePortals(source: string): SccPortal[] {
  const out: SccPortal[] = [];
  for (const line of source.split(/\r?\n/)) { const m = /^\s*Portal\s+(-?\d+)\s+(-?\d+)\s+(-?\d+)/i.exec(line); if (m) out.push({direction:Number(m[1]),x:Number(m[2]),y:Number(m[3])}); }
  return out;
}
