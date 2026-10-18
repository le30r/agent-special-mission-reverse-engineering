import { AudioResourceScope, type BrowserAudioBackend, type PlaybackHandle } from './backend';

export type FrameSoundEvent = {
  id: number;
  animation: string;
  start: number;
  end: number;
  objects: string[];
  value: string;
  repeat: boolean;
};

export type SyncRangeStep = { frame: number; latched: boolean; started: boolean; repeated: boolean; completed: boolean };

/** One native event-order poll; callers may feed the returned cursor into the next event in the same update. */
export function stepSyncRange(event: Pick<FrameSoundEvent, 'start' | 'end'>, frame: number, latched: boolean, ready: boolean): SyncRangeStep {
  if (frame < event.start || frame > event.end + 1) return { frame, latched, started: false, repeated: false, completed: false };
  if (!latched && frame >= event.start && frame <= event.end) return { frame, latched: true, started: true, repeated: false, completed: false };
  if (!latched) return { frame, latched: false, started: false, repeated: false, completed: false };
  if (!ready && frame >= event.end + 1) return { frame: event.start, latched: true, started: false, repeated: true, completed: false };
  if (ready) return { frame: event.end + 1, latched: false, started: false, repeated: false, completed: true };
  return { frame, latched: true, started: false, repeated: false, completed: false };
}

/** Web path adaptation: keep the complete resource name; strip only an extracted blockN container. */
export function normalizeSoundPath(value: string): string {
  return value.replaceAll('\\', '/').replace(/\/+/g, '/').replace(/^\.?\//, '')
    .replace(/^block\d+\//i, '').toLowerCase();
}

/** Parse declarations in token order. Fram N counts affected objects, not audio variants. */
export function parseFrameSoundEvents(...sources: string[]): FrameSoundEvent[] {
  const events: FrameSoundEvent[] = [];
  let animation: string | undefined;
  let last: FrameSoundEvent | undefined;
  for (const source of sources) {
    animation = undefined;
    last = undefined;
    for (const line of source.split(/\r?\n/)) {
      const sound = /^\s*Sound\s+(\S+)/i.exec(line);
      if (sound) { animation = sound[1]; last = undefined; continue; }
      if (/^\s*(?:Object|Active|Light|Mask|Portal|Focus|Animc?|Click|Fault|Back|Inc|Startlevel)\b/i.test(line)) { animation = undefined; last = undefined; continue; }
      if (/^\s*Fram\b/i.test(line)) {
        const match = /^\s*Fram\s+(-?\d+)\s+(-?\d+)\s+(\d+)\s+(.+?)\s*$/i.exec(line);
        if (!animation || !match) { last = undefined; continue; }
        const args = match[4].split(/\s+/), count = Number(match[3]);
        const start = Number(match[1]), end = Number(match[2]);
        const value = args[count];
        if (count < 0 || count > 5 || args.length < count + 1 || (end > 0 && !/\.wav$/i.test(value))) { last = undefined; continue; }
        last = { id: events.length, animation, start, end, objects: args.slice(0, count), value, repeat: args.slice(count + 1).some((arg) => /^Repeat$/i.test(arg)) };
        events.push(last);
        continue;
      }
      if (/^\s*Repeat\s*$/i.test(line) && last) last.repeat = true;
    }
  }
  return events;
}

export type AudioEventState = 'pending' | 'waiting-context' | 'playing' | 'ended' | 'stopped' | 'replaced' | 'failed' | 'disposed';
export type AudioEventHandle = { readonly state: AudioEventState; readonly finished: Promise<AudioEventState>; stop(): void };
export type VoiceStorageMode = 'sharedPcm' | 'privateDecoded';
type Run = { handle: RuntimeHandle; generation: number; abort: AbortController; lastPlay: number; awaitingUnlock: boolean; attempting: boolean; attempts: number; error?: string };
type Voice = { instanceId: number; event: FrameSoundEvent; key: string; url?: string; duration: number; run?: Run; playGeneration: number; replacements: number };

/** Exact no-device timing predicate from 0x402f18/0x402fc8; stop deliberately leaves this clock untouched. */
export class SilentVoiceClock {
  duration: number;
  lastPlayTime = 0;
  started = false;
  constructor(duration: number) { this.duration = duration; }
  play(tick: number): void { this.lastPlayTime = tick | 0; this.started = true; }
  ready(tick: number): boolean { return !this.started || ((tick - this.lastPlayTime) | 0) > this.duration; }
  stop(): void { /* Native Voice stop does not reset duration or lastPlayTime. */ }
}
class RuntimeHandle implements AudioEventHandle {
  private status: AudioEventState = 'pending';
  private settle!: (state: AudioEventState) => void;
  readonly finished = new Promise<AudioEventState>((resolve) => { this.settle = resolve; });
  playback?: PlaybackHandle;
  constructor(private readonly contextState: () => string, private readonly cancel: () => void) {}
  get state(): AudioEventState { return this.status === 'playing' && this.contextState() !== 'running' && this.contextState() !== 'silent' ? 'waiting-context' : this.status; }
  get terminal(): boolean { return !['pending', 'playing'].includes(this.status); }
  playing(): void { if (!this.terminal) this.status = 'playing'; }
  finish(state: AudioEventState): void {
    if (this.terminal) return;
    this.status = state;
    this.settle(state);
  }
  stop(): void { if (!this.terminal) { this.finish('stopped'); this.cancel(); this.playback?.stop(); } }
}

/** Scene owns stable Voices; each Voice owns at most one generation of playback. */
export class SccAudioRuntime {
  private readonly voices = new Map<number, Voice>();
  /** Event slots are borrowed references; their owning Voice remains in `voices`. */
  private readonly borrowedVoices = new Map<number, number>();
  private readonly shared = new Map<string, Run>();
  private readonly scope?: AudioResourceScope;
  private generation = 0;
  private disposed = false;
  private nextVoiceId = 1;
  private readonly diagnosticEvents: Array<{ time: number; event: string; voiceId?: number; playbackId?: number; url?: string; contextState?: string; detail?: string }> = [];
  constructor(
    private readonly backend: BrowserAudioBackend | undefined,
    private readonly resources: Readonly<Record<string, string>>,
    readonly sceneId: number,
    private readonly silent = !backend,
    private readonly durations: Readonly<Record<string, number>> = {},
    private readonly storageModes: Readonly<Record<string, VoiceStorageMode>> = {},
  ) { if (backend) this.scope = new AudioResourceScope(backend); }

  static durationFromWav(bytes: ArrayBuffer): number {
    const view = new DataView(bytes);
    if (bytes.byteLength < 12 || view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) return -1;
    let offset = 12, dataBytes = 0, average = 0;
    while (offset + 8 <= bytes.byteLength) {
      const id = view.getUint32(offset, false), size = view.getUint32(offset + 4, true);
      const body = offset + 8;
      if (body + size > bytes.byteLength) break;
      if (id === 0x666d7420 && size >= 12) average = view.getUint32(body + 8, true);
      if (id === 0x64617461) dataBytes = size;
      offset = body + size + (size & 1);
    }
    return average > 0 ? Math.floor(dataBytes * 1000 / average) : -1;
  }

  private sharedPcm(voice: Voice): boolean { return !this.silent && this.storageModes[voice.key] === 'sharedPcm'; }
  private currentRun(voice: Voice): Run | undefined { return this.sharedPcm(voice) ? this.shared.get(voice.key) : voice.run; }

  private voiceFor(eventId: number): Voice | undefined {
    return this.voices.get(this.borrowedVoices.get(eventId) ?? eventId);
  }

  /** Allocate a scene-owned Voice without starting it (used by visit-owned FaultLists). */
  ownVoice(event: FrameSoundEvent): number {
    if (this.disposed) return event.id;
    let voice = this.voices.get(event.id);
    if (!voice) {
      const key = normalizeSoundPath(event.value);
      voice = { instanceId: this.nextVoiceId++, event, key, url: this.resources[key], duration: this.durations[key] ?? -1, playGeneration: 0, replacements: 0 };
      this.voices.set(event.id, voice);
      this.record('voice.created', voice, `owned=${event.value}`);
    }
    return event.id;
  }

  /** Make an animation Event temporarily reference a Fault-owned Voice. */
  bindBorrowedVoice(eventId: number, voiceId: number): void {
    if (!this.voices.has(voiceId)) return;
    const previous = this.voiceFor(eventId);
    if (previous && this.currentRun(previous) && !this.currentRun(previous)!.handle.terminal) this.cancel(this.currentRun(previous)!, 'replaced');
    this.borrowedVoices.set(eventId, voiceId);
  }

  /** Only native-no-device uses elapsed encoded duration. Browser readiness is terminal playback state. */
  isReady(eventId: number, logicalTick: number): boolean {
    const voice = this.voiceFor(eventId);
    const run = voice && this.currentRun(voice);
    if (!voice || !run || run.handle.terminal) return true;
    if (!this.silent) return false;
    // Unknown metadata is still preparing, not a negative-duration native Voice.
    if (run.handle.state === 'pending') return false;
    const ready = ((logicalTick - run.lastPlay) | 0) > voice.duration;
    if (ready) run.handle.finish('ended');
    return ready;
  }

  play(event: FrameSoundEvent, logicalTick: number): AudioEventHandle {
    if (this.disposed) {
      const handle = new RuntimeHandle(() => this.contextState, () => {});
      handle.finish('disposed');
      return handle;
    }
    const ownerId = this.borrowedVoices.get(event.id) ?? event.id;
    let voice = this.voices.get(ownerId);
    if (!voice) { this.ownVoice(event); voice = this.voices.get(ownerId); }
    if (!voice) throw new Error(`Could not allocate Voice ${event.id}`);
    const previous = this.currentRun(voice);
    if (!this.silent && event.repeat && previous && !previous.handle.terminal) return previous.handle;
    if (previous && !previous.handle.terminal) {
      this.cancel(previous, 'replaced');
      voice.replacements++;
    }
    const sceneGeneration = this.generation;
    const abort = new AbortController();
    const run: Run = { handle: new RuntimeHandle(() => this.contextState, () => abort.abort()), generation: ++voice.playGeneration, abort, lastPlay: logicalTick, awaitingUnlock: false, attempting: false, attempts: 0 };
    voice.run = run;
    if (this.sharedPcm(voice)) this.shared.set(voice.key, run);
    this.record('voice.state.pending', voice, `playGeneration=${run.generation} tick=${logicalTick}`);
    if (!voice.url) { run.handle.finish('failed'); this.record('voice.failed', voice, 'resource URL not found'); return run.handle; }
    if (this.silent) {
      if (this.durations[voice.key] !== undefined) run.handle.playing();
      else {
        // Explicit preparation failure policy; this is not a playback EOF timer.
        const timer = setTimeout(() => { if (this.live(voice!, run, sceneGeneration)) { run.handle.finish('failed'); abort.abort(); } }, 30000);
        abort.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
        void fetch(voice.url, { signal: abort.signal }).then(async (response) => {
          if (!response.ok) throw new Error(`WAV request failed (${response.status}): ${voice!.url}`);
          return response.arrayBuffer();
        }).then((bytes) => {
          if (!this.live(voice!, run, sceneGeneration)) return;
          voice!.duration = SccAudioRuntime.durationFromWav(bytes);
          run.handle.playing();
        }, (error) => {
          if (this.live(voice!, run, sceneGeneration)) { run.error = String(error); run.handle.finish('failed'); }
        }).finally(() => clearTimeout(timer));
      }
    } else this.startBrowserPlayback(voice, run, this.generation);
    return run.handle;
  }

  private live(voice: Voice, run: Run, sceneGeneration: number): boolean {
    return !this.disposed && sceneGeneration === this.generation && voice.run === run && !run.abort.signal.aborted && !run.handle.terminal;
  }
  private cancel(run: Run, reason: 'stopped' | 'replaced' | 'disposed'): void {
    run.handle.finish(reason);
    run.abort.abort();
    run.handle.playback?.stop();
  }

  async unlock(): Promise<void> {
    if (!this.backend || this.disposed) return;
    await this.backend.resume();
    for (const voice of this.voices.values()) {
      const run = voice.run;
      if (run && !run.handle.terminal && run.awaitingUnlock && !run.attempting) this.startBrowserPlayback(voice, run, this.generation);
    }
  }
  get contextState(): string { return this.backend?.contextState ?? 'silent'; }
  get activePlaybackCount(): number { return this.backend?.activePlaybackCount ?? 0; }
  get backendCounts(): string { return this.backend?.debugCounts ?? 'n/a'; }
  diagnostics() {
    return [...this.diagnosticEvents, ...(this.backend?.diagnostics() ?? []).map(({ time, event, url, playbackId, contextState, detail }) => ({ time, event, playbackId, contextState, url, detail }))].sort((a, b) => a.time - b.time);
  }

  private startBrowserPlayback(voice: Voice, run: Run, sceneGeneration: number): void {
    if (!voice.url || !this.scope || !this.live(voice, run, sceneGeneration)) return;
    run.awaitingUnlock = false;
    run.attempting = true;
    run.attempts++;
    this.record('voice.playback-request', voice, `playGeneration=${run.generation} attempt=${run.attempts} context=${this.contextState}`);
    void this.scope.play(voice.url, { loop: voice.event.repeat, signal: run.abort.signal }).then((playback) => {
      run.attempting = false;
      if (!this.live(voice, run, sceneGeneration)) { playback.stop(); return; }
      run.handle.playback = playback;
      run.handle.playing();
      this.record(run.handle.state === 'waiting-context' ? 'voice.scheduled' : 'voice.playing', voice, `playback=${playback.id} state=${run.handle.state}`);
      void playback.finished.then(() => {
        if (!this.live(voice, run, sceneGeneration)) return;
        run.handle.finish('ended');
        this.record('voice.playback-finished', voice, `playback=${playback.id}`);
      });
    }, (error: unknown) => {
      run.attempting = false;
      if (!this.live(voice, run, sceneGeneration)) return;
      const cause = error instanceof Error ? error.cause : undefined;
      run.error = `${String(error)}${cause ? ` cause=${String(cause)}` : ''}`;
      const gestureRequired = (error instanceof DOMException && error.name === 'NotAllowedError') || (cause instanceof DOMException && cause.name === 'NotAllowedError');
      run.awaitingUnlock = gestureRequired;
      if (!gestureRequired) run.handle.finish('failed');
      this.record(gestureRequired ? 'voice.awaiting-unlock' : 'voice.failed', voice, run.error);
    });
  }

  stop(eventId: number): void {
    const voice = this.voiceFor(eventId);
    const run = voice && this.currentRun(voice);
    if (run) this.cancel(run, 'stopped');
    if (voice) this.record('voice.stopped', voice, 'explicit Stop event');
  }
  snapshot() {
    return [...this.voices.entries()].flatMap(([id, voice]) => {
      const run = this.currentRun(voice);
      // Owned but never-played Fault Voices are resources, not playback snapshots.
      if (!run) return [];
      return { id, voiceId: voice.instanceId, playGeneration: voice.playGeneration, state: run?.handle.state ?? 'pending', finished: run?.handle.terminal ?? false, duration: voice.duration, lastPlay: run?.lastPlay ?? 0, repeat: voice.event.repeat, attempting: run?.attempting ?? false, attempts: run?.attempts ?? 0, replacements: voice.replacements, error: run?.error };
    });
  }
  stopFirst(predicate: (eventId: number) => boolean): number | undefined {
    for (const [id, voice] of this.voices) if (predicate(id) && !this.currentRun(voice)?.handle.terminal) { this.stop(id); return id; }
    return undefined;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.generation++;
    for (const voice of this.voices.values()) {
      if (voice.run) this.cancel(voice.run, 'disposed');
      this.record('voice.disposed', voice, 'scene disposal');
    }
    this.scope?.dispose();
    this.borrowedVoices.clear(); this.voices.clear(); this.shared.clear();
  }
  private record(event: string, voice?: Voice, detail?: string): void {
    this.diagnosticEvents.push({ time: globalThis.performance?.now?.() ?? Date.now(), event, voiceId: voice?.instanceId, url: voice?.url, contextState: this.contextState, detail: voice ? `eventId=${voice.event.id}${detail ? ` ${detail}` : ''}` : detail });
    if (this.diagnosticEvents.length > 2000) this.diagnosticEvents.splice(0, this.diagnosticEvents.length - 2000);
  }
}
