/** Painter ordering recovered from Agent.exe 0x40a4ac:
 * compare(a,b) = abs(b.depth) - abs(a.depth), so larger absolute depths draw first.
 */
export type DepthItem = { depth: number; insertionOrder: number };

export function compareDepth(a: DepthItem, b: DepthItem): number {
  return Math.abs(b.depth) - Math.abs(a.depth);
}

/** Pixi sorts ascending zIndex. Negating abs(depth) reproduces the original painter order. */
export function pixiDepthIndex(depth: number): number {
  return depth === 0 ? 0 : -Math.abs(depth);
}

/** Agent.exe skips ordinary image-frame updates when the signed depth is >= 10000. */
export function skipsImageFrameUpdate(depth: number): boolean {
  return depth >= 10000;
}

/**
 * The original comparator has no tie-break (returns 0 for equal abs-depth).
 * Exact native sort stability is UNKNOWN from current evidence. Keep input order
 * as a deterministic, stable approximation rather than inventing a name/Y rule.
 */
export function stableDepthOrder<T extends DepthItem>(items: readonly T[]): T[] {
  return items.map((item, index) => ({ item, index }))
    .sort((a, b) => compareDepth(a.item, b.item) || a.index - b.index)
    .map(({ item }) => item);
}

/**
 * Original world-space rectangle of an `Active` declaration:
 * `Active <name> <cursor> <depth> <left> <top> <right> <bottom>`.
 */
export type SceneRect = { left: number; top: number; right: number; bottom: number };
export type SceneObjectDeclaration = { name: string; cursorId: number; depth: number; rect?: SceneRect };
/** Object, Active and Light create different native vtable types with different Show/Hide slots. */
export type SceneDeclarationKind = 'Object' | 'Active' | 'Light';
export type SceneDeclarationIdentity = { kind: SceneDeclarationKind; name: string };
export type SceneDeclarations = {
  objects: Map<string, SceneObjectDeclaration>;
  active: Map<string, SceneObjectDeclaration>;
  lights: Map<string, SceneObjectDeclaration>;
  /** SCC declaration order across all vtable kinds. */
  order: SceneDeclarationIdentity[];
};

/**
 * Reads the confirmed first arguments of `Object`/`Active`/`Light`. `Active` keeps
 * its hit-test rectangle; `Light` uses a different constructor tail and gets no rect.
 */
export function parseSceneDeclarations(scc: string): SceneDeclarations {
  const objects = new Map<string, SceneObjectDeclaration>();
  const active = new Map<string, SceneObjectDeclaration>();
  const lights = new Map<string, SceneObjectDeclaration>();
  const order: SceneDeclarationIdentity[] = [];
  for (const line of scc.split(/\r?\n/)) {
    const tokens = line.trim().split(/\s+/);
    const kind = tokens[0]?.toLowerCase();
    if (tokens.length < 4) continue;
    if (kind === 'object') {
      objects.set(tokens[1], { name: tokens[1], cursorId: Number(tokens[2]), depth: Number(tokens[3]) });
      order.push({ kind: 'Object', name: tokens[1] });
    } else if (kind === 'active') {
      if (tokens.length < 8) continue;
      active.set(tokens[1], {
        name: tokens[1], cursorId: Number(tokens[2]), depth: Number(tokens[3]),
        rect: { left: Number(tokens[4]), top: Number(tokens[5]), right: Number(tokens[6]), bottom: Number(tokens[7]) },
      });
      order.push({ kind: 'Active', name: tokens[1] });
    } else if (kind === 'light') {
      lights.set(tokens[1], { name: tokens[1], cursorId: Number(tokens[2]), depth: Number(tokens[3]) });
      order.push({ kind: 'Light', name: tokens[1] });
    }
  }
  return { objects, active, lights, order };
}

export function parseSceneObjectDepths(scc: string): Map<string, number> {
  const depths = new Map<string, number>();
  for (const [name, declaration] of parseSceneDeclarations(scc).objects) depths.set(name, declaration.depth);
  return depths;
}

export type FrameDepthEvent = { animation: string; frame: number; objectName: string; depth: number };

/** Parse only the confirmed Fram end=-1 depth-switch records inside Sound blocks. */
export function parseFrameDepthEvents(scc: string): FrameDepthEvent[] {
  const events: FrameDepthEvent[] = [];
  let animation: string | undefined;
  for (const line of scc.split(/\r?\n/)) {
    const sound = /^\s*Sound\s+(\S+)/i.exec(line);
    if (sound) { animation = sound[1]; continue; }
    const nextSection = /^\s*(?:Object|Active|Mask|Portal|Focus|Animc?|Click|Sound)\b/i.test(line);
    if (nextSection && !/^\s*Sound\b/i.test(line)) animation = undefined;
    const fram = /^\s*Fram\s+(\d+)\s+-1\s+\d+\s+(\S+)\s+(-?\d+)\s*$/i.exec(line);
    if (animation && fram) events.push({ animation, frame: Number(fram[1]), objectName: fram[2], depth: Number(fram[3]) });
  }
  return events;
}

export function applyFrameDepthEvents(events: readonly FrameDepthEvent[], animation: string, frame: number, setDepth: (name: string, depth: number) => void): void {
  for (const event of events) if (event.animation === animation && event.frame === frame) setDepth(event.objectName, event.depth);
}
