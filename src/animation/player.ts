export type AnimationDefinition = {
  name: string;
  rate: number;
  frameCount: number;
  loop: boolean;
  locomotion?: boolean;
};

export type AnimationState = { frame: number; elapsed: number; active: boolean };
export type AnimationAdvance = { name: string; previousFrame: number; frame: number; active: boolean; frameChanged: boolean };

/** Parse the original Anim/Animc declarations; Animc is the looping form. */
export function parseAnimationDeclarations(...sources: string[]): Map<string, { rate: number; loop: boolean }> {
  const definitions = new Map<string, { rate: number; loop: boolean }>();
  for (const source of sources) {
    for (const line of source.split(/\r?\n/)) {
      const match = /^\s*(Animc?)\s+(\d+)\s+(\S+)\s+/i.exec(line);
      if (!match) continue;
      definitions.set(match[3], { rate: Number(match[2]), loop: match[1].toLowerCase() === 'animc' });
    }
  }
  return definitions;
}

/**
 * Cooperative MULT animation clock. Frame numbers are original 1-based values;
 * file.frames is indexed with frame-1 only at the renderer boundary.
 */
export class AnimationPlayer {
  readonly states = new Map<string, AnimationState>();
  private readonly definitions = new Map<string, AnimationDefinition>();
  private locomotionName?: string;

  constructor(definitions: readonly AnimationDefinition[]) {
    for (const definition of definitions) {
      this.definitions.set(definition.name, definition);
      this.states.set(definition.name, { frame: 1, elapsed: 0, active: false });
    }
  }

  definition(name: string): AnimationDefinition | undefined { return this.definitions.get(name); }
  state(name: string): AnimationState | undefined { return this.states.get(name); }
  isActive(name: string): boolean { return this.states.get(name)?.active ?? false; }

  /** Starting an SCC animation resets it, even if that same animation is active. */
  start(name: string): boolean {
    const state = this.states.get(name);
    if (!state) return false;
    state.frame = 1;
    state.elapsed = 0;
    state.active = true;
    return true;
  }

  /**
   * `reset` mirrors `0x404fb4(animation, 0)` used by SCC `Stop`: the animation is
   * deactivated and its current frame is reset to 1. The last assigned object
   * image is intentionally not rewritten; a following `StartW` reassigns frames.
   */
  stop(name: string, reset = false): void {
    const state = this.states.get(name);
    if (state) {
      state.active = false;
      if (reset) { state.frame = 1; state.elapsed = 0; }
    }
    if (this.locomotionName === name) this.locomotionName = undefined;
  }

  /** Walk directions share the engine's single current-walk slot. */
  selectLocomotion(name: string): boolean {
    const definition = this.definitions.get(name);
    if (!definition?.locomotion) return false;
    if (this.locomotionName === name && this.isActive(name)) return false;
    if (this.locomotionName) this.stop(this.locomotionName);
    this.locomotionName = name;
    return this.start(name);
  }

  stopLocomotion(): string | undefined {
    const previous = this.locomotionName;
    if (previous) this.stop(previous);
    this.locomotionName = undefined;
    return previous;
  }

  get currentLocomotion(): string | undefined { return this.locomotionName; }

  /** One source tick; callbacks happen only when the 1-based MULT frame changes. */
  advance(deltaMs: number): AnimationAdvance[] {
    const changed: AnimationAdvance[] = [];
    for (const definition of this.definitions.values()) {
      const state = this.states.get(definition.name)!;
      if (!state.active) continue;
      state.elapsed += Math.max(0, deltaMs);
      const period = Math.max(1, Math.floor(1000 / definition.rate));
      while (state.active && state.elapsed >= period) {
        state.elapsed -= period;
        const previousFrame = state.frame;
        if (state.frame >= definition.frameCount) {
          if (definition.loop) state.frame = 1;
          else {
            state.active = false;
            changed.push({ name: definition.name, previousFrame: state.frame, frame: state.frame, active: false, frameChanged: false });
            break;
          }
        } else state.frame++;
        changed.push({ name: definition.name, previousFrame, frame: state.frame, active: state.active, frameChanged: true });
      }
    }
    return changed;
  }
}
