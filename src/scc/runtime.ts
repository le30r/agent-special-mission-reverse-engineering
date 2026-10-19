export type SccCommand =
  | { op: 'Goto'; x: number; y: number }
  | { op: 'Start' | 'StartW'; name: string }
  | { op: 'Setmsk'; path: string }
  | { op: 'Block' | 'Ublock' }
  | { op: 'Stop'; name: string }
  | { op: 'Setxy'; x: number; y: number }
  | { op: 'Addtol'; id: number }
  | { op: 'Remtol'; id: number }
  | { op: 'Cursor'; name: string; value: number }
  | { op: 'State'; name: string; value: number }
  | { op: 'Objzet'; name: string; value: number }
  | { op: 'Level'; scene: number; portal: number }
  | { op: 'Goport'; portal: number }
  | { op: 'Lstate'; scene: number; name: string; value: number }
  | { op: 'Show' | 'Hide'; name: string }
  | { op: 'Setmap'; value: number }
  | { op: 'Setzon'; value: number }
  | { op: 'SclipW'; value: number; file: string }
  | { op: 'Smusic'; value: number; file: string };
  // Portal is parsed into scene metadata, never executed as an object command.
  // Level/Goport/Lstate are implemented with callbacks supplied by SceneLoader.
export type SccProgram = { caseIndex: number; commands: SccCommand[] };
export type SccHandler = { itemId: number; event: string; stateObject: string; stateScene: number; programs: Map<number, SccProgram> };
export type FaultList = { objectName: string; voices: string[]; line: number };
export type FaultParseResult = { lists: FaultList[]; diagnostics: string[] };
export type SccPortal = { direction: number; x: number; y: number };
export type SccHost = {
  pathActive(): boolean;
  animationActive(name: string): boolean;
  startAnimation(name: string): void;
  /** SCC `Stop name` (opcode 0x15): deactivate and reset the animation to frame 1. */
  stopAnimation?(name: string): void;
  setPosition(x: number, y: number): void;
  setDepth(name: string, depth: number): void;
  /** SCC `Cursor name value` (opcode 0x1f): object hover cursor ID (+0x152). */
  setCursor?(name: string, value: number): void;
  /** `Show`/`Hide`: the host resolves `Active`/`Light` visibility and base `Object` MULT semantics. */
  showObject?(name: string): void;
  hideObject?(name: string): void;
  /** `Setzon` writes one int into game-session state. */
  setZone?(zone: number): void;
  /** `Setmap` selects one of the two persistent map banks. */
  setMap?(bank: number): void;
  setMask?(path: string): void;
  setBlocked?(blocked: boolean): void;
  /** Optional navigation request used by SCC `Goto`/`Goport`. */
  goto?(x: number, y: number): boolean;
  level?(scene: number, portal: number): void;
  goport?(portal: number): boolean;
  lstate?(scene: number, name: string, value: number): void;
  /** Optional long-lived state store. Without them the interpreter keeps its own map. */
  readState?(name: string, scene?: number): number;
  writeState?(name: string, value: number): void;
};
type ProgramState = { program: SccProgram; active: boolean; waiting: boolean; pc: number; waitName?: string; suppressSetxy?: boolean };

const int = (value: string) => Number.parseInt(value, 10);

/** Original biased rand15 selection (0..32767), exposed for deterministic integration tests. */
export function selectFaultVoiceIndex(count: number, rand15: number): number | undefined {
  if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(rand15) || rand15 < 0 || rand15 > 0x7fff) return undefined;
  return Math.min(Math.floor((rand15 * count + 0x3fff) / 0x7fff), count - 1);
}

/** Parse top-level visit declarations; paths may continue on following physical lines. */
export function parseFaultLists(source: string, sceneId?: number): FaultParseResult {
  const lines = source.split(/\r?\n/);
  const lists: FaultList[] = [], diagnostics: string[] = [];
  let previousCount: number | undefined;
  const topLevel = /^(?:Click\s|Fault\s|Animc?\s|Object\s|Active\s|Light\s|Back\s|Mask\s|Portal\s|Focus\s|Inc\s|Startlevel\b|Sound\s|Fram\s|Repeat\b|State\s|Block\b|Ublock\b|Cursor\s|Setmsk\s|Setbck\s|Setbcr\b|Shift\s|Setmap\s|Setzon\s|Egame\b|SclipW\s|Smusic\s)/i;
  for (let i = 0; i < lines.length; i++) {
    const match = /^\s*Fault\s+(\S+)(?:\s+(\S+))?/i.exec(lines[i]);
    if (!match) continue;
    const declarationLine = i + 1;
    const name = match[1];
    let count: number, pathTokens: string[] = [];
    const countToken = match[2];
    const lineTokens = lines[i].trim().split(/\s+/);
    let remaining = lineTokens.slice(2);
    if (countToken && /^\d+$/.test(countToken)) {
      count = Number(countToken);
      remaining = lineTokens.slice(3);
      previousCount = count;
    } else if (sceneId === 17 && i + 1 === 127 && name === 'New_janitor1' && previousCount === 1 && countToken) {
      // DERIVED compatibility for the single corpus line whose failed %d scan
      // reuses the preceding local count in the original parser.
      count = previousCount;
      remaining = [countToken];
      diagnostics.push(`Level17.scc:127 Fault New_janitor1 uses derived scanner-state compatibility (count=${count})`);
    } else {
      diagnostics.push(`line ${i + 1}: Fault ${name} has invalid or missing count`);
      continue;
    }
    if (!Number.isSafeInteger(count) || count < 1 || count > 10) {
      diagnostics.push(`line ${i + 1}: Fault ${name} count ${count} is outside the safe supported range 1..10`);
      continue;
    }
    pathTokens.push(...remaining);
    while (pathTokens.length < count && i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (!next || topLevel.test(next)) break;
      i++;
      pathTokens.push(...next.split(/\s+/));
    }
    if (pathTokens.length < count) {
      diagnostics.push(`line ${i + 1}: Fault ${name} declares ${count} voices but only ${pathTokens.length} path(s) are present`);
      continue;
    }
    lists.push({ objectName: name, voices: pathTokens.slice(0, count), line: declarationLine });
  }
  return { lists, diagnostics };
}

/** `Start <anim> Fclick <event>` is a load-time property in the original parser. */
export function parseFclickBindings(source: string): Map<string, string> {
  const bindings = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    const match = /^\s*Start\s+(\S+)\s+Fclick\s+(\S+)\s*$/i.exec(line);
    if (match) bindings.set(match[1], match[2]);
  }
  return bindings;
}

/** Parses the implemented SCC subset. Break is a load-time program separator, not an opcode. */
export function parseScc(source: string): SccHandler[] {
  // Split braces into structural lines without losing the originating SCC line.
  // Keep this normalization local to parseScc: other readers (notably Fault
  // diagnostics) report physical source line numbers.
  const lines = source.split(/\r?\n/).flatMap((line, sourceLine) =>
    line.replace(/([{}])/g, '\n$1\n').split('\n')
      .map((text) => ({ text: text.trim(), sourceLine: sourceLine + 1 }))
      .filter((entry) => entry.text.length > 0),
  );
  const handlers: SccHandler[] = [];
  for (let i = 0; i < lines.length; i++) {
    const click = lines[i].text.match(/^Click\s+(-?\d+)\s+(\S+)\s+(\S+)(?:\s+(-?\d+))?/i);
    if (!click) continue;
    const handler: SccHandler = { itemId: int(click[1]), event: click[2], stateObject: click[3], stateScene: click[4] === undefined ? -1 : int(click[4]), programs: new Map() };
    while (i + 1 < lines.length && lines[i + 1].text !== '{') i++;
    i++;
    let current: SccProgram | undefined;
    for (; i < lines.length && lines[i].text !== '}'; i++) {
      const tokens = lines[i].text.split(/\s+/);
      const word = tokens[0].toLowerCase();
      if (word === 'case') {
        // Case binds the CURRENT program list. Adjacent `Case 0; Case 1` labels share
        // one list; only Break starts a fresh list (0x407266/0x407298).
        if (!current) current = { caseIndex: int(tokens[1]), commands: [] };
        handler.programs.set(int(tokens[1]), current);
        continue;
      }
      if (word === 'break') {
        // Break is a load-time separator, not a runtime opcode. The next Case gets a
        // new list; the list just closed stays registered under all of its labels.
        current = undefined;
        continue;
      }
      if (!current) continue;
      const commands = current.commands;
      if (word === 'goto' || word === 'setxy') commands.push({ op: word === 'goto' ? 'Goto' : 'Setxy', x: int(tokens[1]), y: int(tokens[2]) });
      else if (word === 'start' || word === 'startw' || word === 'statrw') commands.push({ op: word === 'start' ? 'Start' : 'StartW', name: tokens[1] });
      else if (word === 'setmsk') commands.push({ op: 'Setmsk', path: tokens[1] });
      else if (word === 'block' || word === 'ublock') commands.push({ op: word === 'block' ? 'Block' : 'Ublock' });
      else if (word === 'stop') commands.push({ op: 'Stop', name: tokens[1] });
      else if (word === 'addtol') commands.push({ op: 'Addtol', id: int(tokens[1]) });
      else if (word === 'remtol') commands.push({ op: 'Remtol', id: int(tokens[1]) });
      else if (word === 'cursor') commands.push({ op: 'Cursor', name: tokens[1], value: int(tokens[2]) });
      else if (word === 'state') commands.push({ op: 'State', name: tokens[1], value: int(tokens[2]) });
      else if (word === 'objzet') commands.push({ op: 'Objzet', name: tokens[1], value: int(tokens[2]) });
      else if (word === 'level') commands.push({ op: 'Level', scene: int(tokens[1]), portal: int(tokens[2]) });
      else if (word === 'goport') commands.push({ op: 'Goport', portal: int(tokens[1]) });
      // `Lstate <name> <value> <scene>`: executor opcode 10 uses arg B as the scene index.
      else if (word === 'lstate') commands.push({ op: 'Lstate', name: tokens[1], value: int(tokens[2]), scene: int(tokens[3]) });
      else if (word === 'show' || word === 'hide') commands.push({ op: word === 'show' ? 'Show' : 'Hide', name: tokens[1] });
      else if (word === 'setzon') commands.push({ op: 'Setzon', value: int(tokens[1]) });
      else if (word === 'setmap') commands.push({ op: 'Setmap', value: int(tokens[1]) });
      else if (word === 'sclipw') commands.push({ op: 'SclipW', value: int(tokens[1]), file: tokens[2] ?? '' });
      else if (word === 'smusic') commands.push({ op: 'Smusic', value: int(tokens[1]), file: tokens[2] ?? '' });
    }
    handlers.push(handler);
  }
  return handlers;
}

/** Cooperative SCC interpreter. It never hides waits inside promises/async functions. */
export class SccRuntime {
  readonly states = new Map<string, number>();
  /** Long-lived inventory may be supplied so it survives a scene runtime rebuild. */
  readonly inventory: number[];
  readonly handlers: SccHandler[];
  readonly fclickBindings: Map<string, string>;
  readonly programs: ProgramState[] = [];
  private readonly syntheticFaultProgram: SccProgram = { caseIndex: 0, commands: [
    { op: 'Goto', x: 0, y: 0 }, { op: 'Setxy', x: 0, y: 0 },
    { op: 'StartW', name: 'Speak' }, { op: 'Setxy', x: 0, y: 0 },
  ] };
  /** Original loader shape: all 50 Case slots share one synthetic Program. */
  private readonly syntheticFaultHandler: SccHandler = {
    itemId: 0, event: 'Fault', stateObject: 'Interface', stateScene: -1,
    programs: new Map(Array.from({ length: 50 }, (_, index) => [index, this.syntheticFaultProgram] as const)),
  };
  /** Game-session zone written by `Setzon`; owned by SceneLoader when a host provides it. */
  zone = 0;
  busy = false;
  constructor(source: string, readonly host: SccHost, inventory: number[] = []) {
    this.handlers = parseScc(source);
    this.fclickBindings = parseFclickBindings(source);
    this.inventory = inventory;
  }

  /** A pointer/object interaction cancels every currently active Program. */
  click(event: string, selectedItem = 0): boolean {
    this.cancelActive();
    return this.dispatch(event, selectedItem);
  }

  /** Dispatch the loader-created Click 0 Fault Interface Program through this executor. */
  dispatchFault(x: number, y: number): void {
    const commands = this.syntheticFaultProgram.commands;
    for (const index of [0, 1, 3]) {
      const command = commands[index];
      if (command?.op === 'Goto' || command?.op === 'Setxy') { command.x = x; command.y = y; }
    }
    const state: ProgramState = { program: this.syntheticFaultHandler.programs.get(0)!, active: true, waiting: false, pc: 0 };
    this.programs.push(state);
    this.run(state);
  }

  /**
   * Event dispatch without cancelling other Programs. The loader uses this for
   * `Init` and `Start`: a suspended Init is a separate Program and must survive
   * the initial `Start` dispatch (0x407ffc).
   */
  dispatch(event: string, selectedItem = 0): boolean {
    let found = false;
    for (const handler of this.handlers) {
      if (handler.event !== event || handler.itemId !== selectedItem) continue;
      const state = this.host.readState?.(handler.stateObject, handler.stateScene) ?? this.states.get(handler.stateObject) ?? 0;
      const program = handler.programs.get(state);
      if (!program) continue;
      found = true;
      const runtime: ProgramState = { program, active: true, waiting: false, pc: 0 };
      this.programs.push(runtime);
      this.run(runtime);
    }
    return found;
  }

  cancelActive(): void {
    for (const program of this.programs) {
      program.active = false;
      program.waiting = false;
    }
    this.busy = false;
  }

  tick(): void {
    // SCC continuations are polled before animation and movement updates, matching scene tick order.
    for (const program of this.programs) if (program.active) this.run(program);
  }

  private run(state: ProgramState): void {
    while (state.active) {
      const command = state.program.commands[state.pc];
      if (!command) { state.active = false; state.waiting = false; return; }
      if (command.op === 'Goto') {
        if (!state.waiting) {
          const hasPath = this.goto(command.x, command.y);
          if (hasPath) { state.waiting = true; return; }
          // Native executor special case: Goto; Setxy; StartW Speak skips the
          // first Setxy on route failure and suppresses the Setxy after Speak.
          const nextAfterSetxy = state.program.commands[state.pc + 2];
          if (nextAfterSetxy?.op === 'StartW' && nextAfterSetxy.name === 'Speak') {
            state.suppressSetxy = true;
            state.pc += 2;
            continue;
          }
          state.waiting = true;
          return;
        }
        if (this.host.pathActive()) return;
        state.waiting = false; state.pc++; continue;
      }
      if (command.op === 'StartW') {
        if (!state.waiting) {
          state.waiting = true; state.waitName = command.name; this.busy = true;
          this.host.startAnimation(command.name); return;
        }
        if (this.host.animationActive(state.waitName ?? command.name)) return;
        this.busy = false; state.waiting = false; state.waitName = undefined; state.pc++; continue;
      }
      if (command.op === 'Start') { this.host.startAnimation(command.name); state.pc++; continue; }
      if (command.op === 'Setmsk') { this.host.setMask?.(command.path); state.pc++; continue; }
      if (command.op === 'Block') { this.host.setBlocked?.(true); state.pc++; continue; }
      if (command.op === 'Ublock') { this.host.setBlocked?.(false); state.pc++; continue; }
      // Opcode 0x15: findAnimation, then 0x404fb4(anim, 0) — deactivate and frame=1.
      if (command.op === 'Stop') { this.host.stopAnimation?.(command.name); state.pc++; continue; }
      if (command.op === 'Setxy') {
        if (state.suppressSetxy) state.suppressSetxy = false;
        else this.host.setPosition(command.x, command.y);
        state.pc++; continue;
      }
      if (command.op === 'Addtol') { this.addInventory(command.id); state.pc++; continue; }
      // Opcode 0x11 -> 0x40c4dc -> 0x40ec50: clear every one of the 100 slots equal to the ID.
      if (command.op === 'Remtol') { this.removeInventory(command.id); state.pc++; continue; }
      if (command.op === 'Cursor') { this.host.setCursor?.(command.name, command.value); state.pc++; continue; }
      if (command.op === 'State') {
        // Keep the historical runtime lookup cache for hosts without a State
        // binding; production snapshots still export only the SceneLoader owner.
        this.states.set(command.name, command.value);
        this.host.writeState?.(command.name, command.value);
        state.pc++; continue;
      }
      if (command.op === 'Objzet') { this.host.setDepth(command.name, command.value); state.pc++; continue; }
      if (command.op === 'Level') { this.host.level?.(command.scene, command.portal); state.pc++; continue; }
      if (command.op === 'Goport') {
        if (!state.waiting) { const hasPath = this.host.goport?.(command.portal) ?? false; state.waiting = true; if (hasPath) return; }
        if (this.host.pathActive()) return;
        state.waiting = false; state.pc++; continue;
      }
      if (command.op === 'Lstate') { this.host.lstate?.(command.scene, command.name, command.value); state.pc++; continue; }
      if (command.op === 'Show') { this.host.showObject?.(command.name); state.pc++; continue; }
      if (command.op === 'Hide') { this.host.hideObject?.(command.name); state.pc++; continue; }
      if (command.op === 'Setzon') {
        this.zone = command.value;
        this.host.setZone?.(command.value);
        state.pc++;
        continue;
      }
      if (command.op === 'Setmap') { this.host.setMap?.(command.value); state.pc++; continue; }
      // Temporary faithful-enough video contract: suspend for exactly one poll so Init
      // cannot finish synchronously, then continue automatically. The loader's Start
      // dispatch happens before the next tick resumes this Program.
      if (command.op === 'SclipW') {
        if (!state.waiting) { state.waiting = true; return; }
        state.waiting = false; state.pc++; continue;
      }
      // Audio is intentionally not reproduced by the browser prototype.
      if (command.op === 'Smusic') { state.pc++; continue; }
    }
  }

  /** 0x40ec2c: write the first empty of 100 slots; no duplicate check and no rollback. */
  addInventory(id: number): void {
    this.inventory.push(id);
  }

  /** 0x40ec50: every slot holding `id` becomes empty (-1); the packed array is equivalent. */
  removeInventory(id: number): void {
    for (let i = this.inventory.length - 1; i >= 0; i--) if (this.inventory[i] === id) this.inventory.splice(i, 1);
  }

  private goto(x: number, y: number): boolean {
    return this.host.goto?.(x, y) ?? false;
  }
}
