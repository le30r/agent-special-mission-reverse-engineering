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
  if (!latched && frame === event.start) return { frame, latched: true, started: true, repeated: false, completed: false };
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
        last = { id: events.length, animation, start, end, objects: args.slice(0, count), value, repeat: false };
        events.push(last);
        continue;
      }
      if (/^\s*Repeat\s*$/i.test(line) && last) last.repeat = true;
    }
  }
  return events;
}

export type AudioEventHandle = { readonly state: 'pending' | 'playing' | 'ended' | 'stopped' | 'failed' | 'disposed'; stop(): void };
type Voice = { instanceId: number; handle: RuntimeHandle; duration: number; lastPlay: number; started: boolean; finished: boolean; awaitingUnlock: boolean; repeat: boolean; abort?: AbortController; event: FrameSoundEvent; url?: string; attempting: boolean; attempts: number; replacements: number; lastError?: string };

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
  state: AudioEventHandle['state'] = 'pending';
  playback?: PlaybackHandle;
  stop(): void { if (this.state === 'ended' || this.state === 'failed' || this.state === 'disposed') return; this.state = 'stopped'; this.playback?.stop(); }
}

/** WAV Voice ownership and deterministic no-device ready clock, scoped to one scene visit. */
export class SccAudioRuntime {
  private readonly voices = new Map<number, Voice>();
  private readonly allVoices = new Set<Voice>();
  private readonly handles = new Set<RuntimeHandle>();
  private readonly scope?: AudioResourceScope;
  private readonly backend?: BrowserAudioBackend;
  private generation = 0;
  private disposed = false;
  private nextVoiceId = 1;
  private readonly diagnosticEvents: Array<{ time: number; event: string; voiceId?: number; url?: string; detail?: string }> = [];
  constructor(
    backend: BrowserAudioBackend | undefined,
    private readonly resources: Readonly<Record<string, string>>,
    readonly sceneId: number,
    private readonly silent = !backend,
    private readonly durations: Readonly<Record<string, number>> = {},
  ) { this.backend = backend; if (backend) this.scope = new AudioResourceScope(backend); }

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

  /** Native silent fallback oracle; before the first play, browser policy is deterministic-ready. */
  isReady(eventId: number, logicalTick: number): boolean {
    const voice = this.voices.get(eventId);
    if (!voice || !voice.started) return true;
    if (voice.handle.state === 'ended' || voice.handle.state === 'stopped' || voice.handle.state === 'failed' || voice.handle.state === 'disposed') return true;
    if (voice.awaitingUnlock) return false;
    if (voice.finished) return true;
    // The browser playback Promise is only a loading/start notification, not
    // the game's Voice.finished signal. A stalled fetch/decode (or a late
    // callback) must not pin a one-frame Fram barrier forever. Native Voice
    // completion is polled against its duration, with the strict > predicate.
    if (voice.duration >= 0 && ((logicalTick - voice.lastPlay) | 0) > voice.duration) {
      voice.finished = true;
      this.record('voice.logical-finished', voice, `elapsed=${(logicalTick - voice.lastPlay) | 0} duration=${voice.duration}`);
      // This is only the SCC barrier clock. Fetch/decode can still be in flight,
      // and a started source owns its own actual lifetime through onended.
      return true;
    }
    return voice.finished;
  }

  play(event: FrameSoundEvent, logicalTick: number): AudioEventHandle {
    const old = this.voices.get(event.id);
    if (old && (old.handle.state === 'pending' || old.handle.state === 'playing') && event.repeat) return old.handle;
    // Event ids identify SCC declarations, not individual animation passes.
    // Each non-repeat invocation is an earned occurrence and must have its own
    // playback lifetime, even while a previous occurrence is loading/playing.
    if (old) this.record('voice.superseded', old, `new occurrence at tick=${logicalTick}; playback retained`);
    const handle = new RuntimeHandle();
    this.handles.add(handle);
    const key = normalizeSoundPath(event.value);
    const knownDuration = this.durations[key];
    const voice: Voice = { instanceId: this.nextVoiceId++, handle, duration: knownDuration ?? -1, lastPlay: logicalTick, started: true, finished: false, awaitingUnlock: false, repeat: event.repeat, abort: new AbortController(), event, attempting: false, attempts: 0, replacements: (old?.replacements ?? 0) + (old ? 1 : 0) };
    this.voices.set(event.id, voice);
    this.allVoices.add(voice);
    this.record('voice.created', voice, `animation=${event.animation} range=${event.start}..${event.end} tick=${logicalTick}`);
    this.record('voice.state.pending', voice);
    const generation = this.generation;
    const url = this.resources[key] ?? this.resources[key.toLowerCase()];
    if (!url) { handle.state = 'failed'; this.record('voice.failed', voice, 'resource URL not found'); return handle; }
    voice.url = url;
    if (this.silent) {
      if (knownDuration !== undefined) { handle.state = 'playing'; return handle; }
      void fetch(url, { signal: voice.abort!.signal }).then(async (response) => {
        if (!response.ok) throw new Error(`WAV request failed (${response.status}): ${url}`);
        return response.arrayBuffer();
      }).then((bytes) => {
        if (this.disposed || generation !== this.generation || this.voices.get(event.id) !== voice) return;
        voice.duration = SccAudioRuntime.durationFromWav(bytes);
        handle.state = 'playing';
        this.record('voice.resource-ready', voice, `duration=${voice.duration}`);
      }, (error) => { if (!this.disposed && generation === this.generation) { handle.state = 'failed'; this.record('voice.failed', voice, String(error)); } });
      return handle;
    }
    this.startBrowserPlayback(voice, generation);
    return handle;
  }

  async unlock(): Promise<void> {
    if (!this.backend || this.disposed) return;
    await this.backend.resume();
    for (const voice of this.allVoices) {
      if (voice.handle.state === 'pending' && !voice.attempting && voice.url) this.startBrowserPlayback(voice, this.generation);
    }
  }
  get contextState(): string { return this.backend?.contextState ?? 'silent'; }
  get activePlaybackCount(): number { return this.backend?.activePlaybackCount ?? 0; }
  get backendCounts(): string { return this.backend?.debugCounts ?? 'n/a'; }
  diagnostics(): readonly { time: number; event: string; voiceId?: number; url?: string; detail?: string }[] {
    return [...this.diagnosticEvents, ...(this.backend?.diagnostics() ?? []).map(({ time, event, url, playbackId, detail }) => ({ time, event, voiceId: playbackId, url, detail }))].sort((a, b) => a.time - b.time);
  }

  private startBrowserPlayback(voice: Voice, generation: number): void {
    if (!voice.url || !this.scope || voice.abort?.signal.aborted || voice.handle.state === 'stopped' || voice.handle.state === 'disposed') return;
    voice.awaitingUnlock = false;
    voice.attempting = true;
    voice.attempts++;
    this.record('voice.playback-request', voice, `attempt=${voice.attempts} context=${this.contextState}`);
    void this.scope.play(voice.url, { loop: voice.repeat, signal: voice.abort?.signal }).then((playback) => {
      voice.attempting = false;
      if (this.disposed || generation !== this.generation) { voice.lastError = `stale callback disposed=${this.disposed} generation=${generation}/${this.generation}`; this.record('voice.stale-playback-canceled', voice, voice.lastError); playback.stop(); return; }
      // The logical duration may have released the SCC barrier while fetch or
      // decode was pending. Never discard the now-ready source for that reason.
      voice.lastError = 'source started';
      voice.handle.playback = playback;
      voice.handle.state = 'playing';
      this.record('voice.state.playing', voice, `playback=${playback.id}`);
      this.record('voice.playing', voice, `playback=${playback.id} logicallyFinished=${voice.finished}`);
      void playback.finished.then(() => {
        if (!this.disposed && generation === this.generation) {
          voice.finished = true;
          if (voice.handle.state === 'playing') voice.handle.state = 'ended';
          this.record('voice.state.ended', voice, `playback=${playback.id}`);
          this.record('voice.playback-finished', voice, `playback=${playback.id}`);
        }
      });
    }, (error: unknown) => {
      voice.attempting = false;
      if (this.disposed || generation !== this.generation) return;
      if (voice.abort?.signal.aborted || voice.handle.state === 'stopped' || voice.handle.state === 'disposed') {
        this.record('voice.load-canceled', voice, String(error));
        return;
      }
      // Autoplay is a browser gate, not EOF. Other load/decode/start failures are terminal policy.
      const cause = error instanceof Error ? error.cause : undefined;
      voice.lastError = `${error instanceof Error ? error.name : typeof error}:${String(error)}${cause ? ` cause=${String(cause)}` : ''}`;
      const gestureRequired = (error instanceof DOMException && error.name === 'NotAllowedError')
        || (cause instanceof DOMException && cause.name === 'NotAllowedError');
      voice.awaitingUnlock = gestureRequired;
      voice.handle.state = gestureRequired ? 'pending' : 'failed';
      this.record(gestureRequired ? 'voice.state.awaitingUnlock' : 'voice.state.failed', voice);
      this.record(gestureRequired ? 'voice.awaiting-unlock' : 'voice.failed', voice, voice.lastError);
    });
  }

  stop(eventId: number): void {
    const voice = this.voices.get(eventId);
    voice?.abort?.abort();
    voice?.handle.stop();
    if (voice) this.record('voice.state.stopped', voice, 'explicit Stop event');
    if (voice) this.record('voice.stopped', voice, 'explicit Stop event');
  }
  snapshot(): Array<{ id: number; voiceId: number; state: AudioEventHandle['state']; finished: boolean; duration: number; lastPlay: number; repeat: boolean; attempting: boolean; attempts: number; replacements: number; error?: string }> {
    return [...this.voices.entries()].map(([id, voice]) => ({ id, voiceId: voice.instanceId, state: voice.handle.state, finished: voice.finished, duration: voice.duration, lastPlay: voice.lastPlay, repeat: voice.repeat, attempting: voice.attempting, attempts: voice.attempts, replacements: voice.replacements, error: voice.lastError }));
  }
  stopFirst(predicate: (eventId: number) => boolean): number | undefined {
    for (const [id, voice] of this.voices) if (predicate(id) && voice.handle.state === 'playing') { voice.handle.stop(); return id; }
    return undefined;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.generation++;
    for (const voice of this.allVoices) { voice.abort?.abort(); this.record('voice.state.disposed', voice, 'scene disposal'); this.record('voice.disposed', voice, 'scene disposal'); }
    this.scope?.dispose();
    for (const handle of this.handles) { handle.state = 'disposed'; handle.playback?.stop(); }
    this.handles.clear(); this.voices.clear(); this.allVoices.clear();
  }
  private record(event: string, voice?: Voice, detail?: string): void {
    const diagnosticDetail = voice ? `eventId=${voice.event.id}${detail ? ` ${detail}` : ''}` : detail;
    this.diagnosticEvents.push({ time: globalThis.performance?.now?.() ?? Date.now(), event, voiceId: voice?.instanceId, url: voice?.url, detail: diagnosticDetail });
    if (this.diagnosticEvents.length > 2000) this.diagnosticEvents.splice(0, this.diagnosticEvents.length - 2000);
  }
}

