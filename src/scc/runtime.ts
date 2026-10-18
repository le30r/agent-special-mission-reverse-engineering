export type SccCommand =
  | { op: 'Goto'; x: number; y: number }
  | { op: 'Start' | 'StartW'; name: string }
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
  | { op: 'Setzon'; value: number }
  | { op: 'SclipW'; value: number; file: string }
  | { op: 'Smusic'; value: number; file: string };
  // Portal is parsed into scene metadata, never executed as an object command.
  // Level/Goport/Lstate are implemented with callbacks supplied by SceneLoader.
export type SccProgram = { caseIndex: number; commands: SccCommand[] };
export type SccHandler = { itemId: number; event: string; stateObject: string; programs: Map<number, SccProgram> };
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
  /** Optional navigation request used by SCC `Goto`/`Goport`. */
  goto?(x: number, y: number): boolean;
  level?(scene: number, portal: number): void;
  goport?(portal: number): boolean;
  lstate?(scene: number, name: string, value: number): void;
  /** Optional long-lived state store. Without them the interpreter keeps its own map. */
  readState?(name: string): number;
  writeState?(name: string, value: number): void;
};
type ProgramState = { program: SccProgram; active: boolean; waiting: boolean; pc: number; waitName?: string };

const int = (value: string) => Number.parseInt(value, 10);

/** Parses the implemented SCC subset. Break is a load-time program separator, not an opcode. */
export function parseScc(source: string): SccHandler[] {
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const handlers: SccHandler[] = [];
  for (let i = 0; i < lines.length; i++) {
    const click = lines[i].match(/^Click\s+(-?\d+)\s+(\S+)\s+(\S+)/i);
    if (!click) continue;
    const handler: SccHandler = { itemId: int(click[1]), event: click[2], stateObject: click[3], programs: new Map() };
    while (i + 1 < lines.length && lines[i + 1] !== '{') i++;
    i++;
    let current: SccProgram | undefined;
    for (; i < lines.length && lines[i] !== '}'; i++) {
      const tokens = lines[i].split(/\s+/);
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
      else if (word === 'start' || word === 'startw') commands.push({ op: word === 'start' ? 'Start' : 'StartW', name: tokens[1] });
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
  readonly programs: ProgramState[] = [];
  /** Game-session zone written by `Setzon`; owned by SceneLoader when a host provides it. */
  zone = 0;
  busy = false;
  constructor(source: string, readonly host: SccHost, inventory: number[] = []) {
    this.handlers = parseScc(source);
    this.inventory = inventory;
  }

  private readState(name: string): number {
    return this.host.readState?.(name) ?? this.states.get(name) ?? 0;
  }

  /** A pointer/object interaction cancels every currently active Program. */
  click(event: string, selectedItem = 0): boolean {
    this.cancelActive();
    return this.dispatch(event, selectedItem);
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
      const state = this.readState(handler.stateObject);
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
      if (!command) { state.active = false; state.waiting = false; this.busy = false; return; }
      if (command.op === 'Goto') {
        if (!state.waiting) {
          const hasPath = this.goto(command.x, command.y);
          if (hasPath) { state.waiting = true; return; }
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
      // Opcode 0x15: findAnimation, then 0x404fb4(anim, 0) — deactivate and frame=1.
      if (command.op === 'Stop') { this.host.stopAnimation?.(command.name); state.pc++; continue; }
      if (command.op === 'Setxy') { this.host.setPosition(command.x, command.y); state.pc++; continue; }
      if (command.op === 'Addtol') { this.addInventory(command.id); state.pc++; continue; }
      // Opcode 0x11 -> 0x40c4dc -> 0x40ec50: clear every one of the 100 slots equal to the ID.
      if (command.op === 'Remtol') { this.removeInventory(command.id); state.pc++; continue; }
      if (command.op === 'Cursor') { this.host.setCursor?.(command.name, command.value); state.pc++; continue; }
      if (command.op === 'State') { this.states.set(command.name, command.value); this.host.writeState?.(command.name, command.value); state.pc++; continue; }
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
