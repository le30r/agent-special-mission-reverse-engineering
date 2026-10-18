/** Minimal Web Audio surface used by the backend and replaceable in tests. */
export interface AudioBufferPort {
  readonly duration: number;
  readonly length: number;
  readonly numberOfChannels: number;
}

export interface AudioBufferSourcePort {
  buffer: AudioBufferPort | null;
  loop?: boolean;
  onended: (() => void) | null;
  connect(destination: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
  disconnect?(): void;
}

export interface AudioContextPort {
  readonly state: string;
  readonly destination: unknown;
  createBufferSource(): AudioBufferSourcePort;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferPort>;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export type AudioFetcher = (url: string, init: { signal: AbortSignal }) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface PlaybackHandle {
  readonly id: number;
  readonly url: string;
  readonly finished: Promise<void>;
  readonly stopped: boolean;
  stop(): void;
}

export interface PlayOptions {
  /** Abort an in-flight fetch/decode or stop playback when aborted. */
  signal?: AbortSignal;
  /** Loop the single source (used by SCC Fram Repeat declarations). */
  loop?: boolean;
}

export interface AudioBackendOptions {
  context?: AudioContextPort;
  contextFactory?: () => AudioContextPort;
  fetcher?: AudioFetcher;
  /** Approximate decoded PCM memory budget. Defaults to 32 MiB. */
  maxCacheBytes?: number;
  /** Preparation error deadline, never a playback/EOF clock. */
  prepareTimeoutMs?: number;
}

export type AudioDiagnostic = { time: number; event: string; url?: string; playbackId?: number; contextState: string; detail?: string };

export class AudioBackendError extends Error {
  constructor(message: string, readonly url: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AudioBackendError';
  }
}

export class AudioLoadError extends AudioBackendError {
  constructor(url: string, message: string, options?: ErrorOptions) {
    super(message, url, options);
    this.name = 'AudioLoadError';
  }
}

export class AudioAbortedError extends AudioBackendError {
  constructor(url: string) {
    super(`Audio request was aborted: ${url}`, url);
    this.name = 'AudioAbortedError';
  }
}

interface CacheEntry {
  buffer: AudioBufferPort;
  bytes: number;
}

class Playback implements PlaybackHandle {
  readonly finished: Promise<void>;
  private finish!: () => void;
  private didStop = false;
  private didComplete = false;

  constructor(
    readonly id: number,
    readonly url: string,
    private readonly source: AudioBufferSourcePort,
    private readonly onFinish: (playback: Playback) => void,
    private readonly onStop: (playback: Playback, reason: string) => void,
    private readonly onEnded: () => void,
  ) {
    this.finished = new Promise((resolve) => { this.finish = resolve; });
    source.onended = () => { this.onEnded(); this.complete(); };
  }

  get stopped(): boolean { return this.didStop; }

  start(): void { this.source.start(); }

  stop(reason = 'explicit'): void {
    if (this.didStop) return;
    this.didStop = true;
    this.onStop(this, reason);
    this.source.onended = null;
    try { this.source.stop(); } catch { /* A source that already ended is already stopped. */ }
    this.complete();
  }

  private complete(): void {
    if (this.didComplete) return;
    this.didComplete = true;
    this.didStop = true;
    this.source.onended = null;
    this.source.disconnect?.();
    this.onFinish(this);
    this.finish();
  }
}

/**
 * Independent Web Audio backend. URLs are opaque resource keys; this module
 * intentionally assigns no game-specific meaning to them.
 */
export class BrowserAudioBackend {
  private readonly context: AudioContextPort;
  private readonly fetcher: AudioFetcher;
  private readonly maxCacheBytes: number;
  private readonly prepareTimeoutMs: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly active = new Map<number, Playback>();
  private cacheBytes = 0;
  private pendingLoads = 0;
  private pendingDecodes = 0;
  private nextPlaybackId = 1;
  private disposed = false;
  private readonly diagnosticEvents: AudioDiagnostic[] = [];

  constructor(options: AudioBackendOptions = {}) {
    const factory = options.contextFactory ?? (() => {
      const AudioContextConstructor = globalThis.AudioContext;
      if (!AudioContextConstructor) throw new Error('Web Audio API is unavailable');
      return new AudioContextConstructor() as unknown as AudioContextPort;
    });
    this.context = options.context ?? factory();
    this.fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
    this.prepareTimeoutMs = options.prepareTimeoutMs ?? 30000;
    this.maxCacheBytes = Math.max(0, options.maxCacheBytes ?? 32 * 1024 * 1024);
  }

  /** Call from a user gesture (for example, a click) to unlock suspended audio. */
  async resume(): Promise<void> {
    this.assertLive();
    if (this.context.state !== 'running') await this.context.resume();
  }

  async play(url: string, options: PlayOptions = {}): Promise<PlaybackHandle> {
    this.assertLive();
    if (options.signal?.aborted) throw new AudioAbortedError(url);
    const buffer = await this.prepare(url, options.signal);
    this.assertLive();
    if (options.signal?.aborted) throw new AudioAbortedError(url);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    source.connect(this.context.destination);
    const id = this.nextPlaybackId++;
    const playback = new Playback(id, url, source, (ended) => {
      this.record('source.finished', url, ended.id);
      this.active.delete(ended.id);
      options.signal?.removeEventListener('abort', abortPlayback);
    }, (stopped, reason) => this.record('source.stop', url, stopped.id, `reason=${reason}`), () => this.record('source.onended', url, id));
    const abortPlayback = () => playback.stop('abort-signal');
    options.signal?.addEventListener('abort', abortPlayback, { once: true });
    this.active.set(id, playback);
    try {
      this.record('source.start.call', url, id, `duration=${buffer.duration}`);
      playback.start();
      this.record('source.start.ok', url, id, `duration=${buffer.duration}`);
    } catch (error) {
      this.record('source.start.error', url, id, String(error));
      playback.stop('start-error');
      throw new AudioBackendError(`Unable to start audio playback: ${url}`, url, { cause: error });
    }
    return playback;
  }

  /** Drop one decoded asset from the LRU cache. Active playback keeps its buffer. */
  release(url: string): void {
    const entry = this.cache.get(url);
    if (!entry) return;
    this.cache.delete(url);
    this.cacheBytes -= entry.bytes;
  }

  clearCache(): void {
    this.cache.clear();
    this.cacheBytes = 0;
  }

  get cachedBytes(): number { return this.cacheBytes; }
  get activePlaybackCount(): number { return this.active.size; }
  get contextState(): string { return this.context.state; }
  get debugCounts(): string { return `load=${this.pendingLoads}/decode=${this.pendingDecodes}/cache=${this.cache.size}`; }
  diagnostics(): readonly AudioDiagnostic[] { return this.diagnosticEvents.slice(); }
  record(event: string, url?: string, playbackId?: number, detail?: string): void {
    this.diagnosticEvents.push({ time: globalThis.performance?.now?.() ?? Date.now(), event, url, playbackId, contextState: this.context.state, detail });
    if (this.diagnosticEvents.length > 2000) this.diagnosticEvents.splice(0, this.diagnosticEvents.length - 2000);
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const playback of this.active.values()) playback.stop('backend-dispose');
    this.clearCache();
    await this.context.close();
  }

  private async prepare(url: string, signal?: AbortSignal): Promise<AudioBufferPort> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: () => void = () => {};
    const canceled = new Promise<never>((_, reject) => {
      onAbort = () => { reject(new AudioAbortedError(url)); controller.abort(); };
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => {
        reject(new AudioLoadError(url, `Audio preparation timed out: ${url}`));
        controller.abort();
      }, this.prepareTimeoutMs);
      if (signal?.aborted) onAbort();
    });
    try { return await Promise.race([this.load(url, controller.signal), canceled]); }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
  }

  private async load(url: string, signal?: AbortSignal): Promise<AudioBufferPort> {
    const cached = this.cache.get(url);
    if (cached) {
      this.cache.delete(url);
      this.cache.set(url, cached);
      return cached.buffer;
    }

    const controller = new AbortController();
    this.pendingLoads++;
    this.record('load.start', url);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await this.fetcher(url, { signal: controller.signal });
      this.record('load.response', url, undefined, `status=${response.status} ok=${response.ok}`);
      if (signal?.aborted) throw new AudioAbortedError(url);
      if (!response.ok) throw new AudioLoadError(url, `Audio request failed (${response.status}): ${url}`);
      const bytes = await response.arrayBuffer();
      this.record('load.complete', url, undefined, `bytes=${bytes.byteLength}`);
      if (signal?.aborted) throw new AudioAbortedError(url);
      let buffer: AudioBufferPort;
      try {
        this.pendingDecodes++;
        this.record('decode.start', url);
        buffer = await this.context.decodeAudioData(bytes);
        this.record('decode.complete', url, undefined, `duration=${buffer.duration}`);
      } catch (error) {
        this.record('decode.error', url, undefined, String(error));
        throw new AudioLoadError(url, `Unable to decode audio resource: ${url}`, { cause: error });
      } finally {
        this.pendingDecodes--;
      }
      if (signal?.aborted) throw new AudioAbortedError(url);
      this.insertCache(url, buffer);
      this.record('buffer.ready', url, undefined, `duration=${buffer.duration}`);
      return buffer;
    } catch (error) {
      this.record(error instanceof AudioAbortedError ? 'load.aborted' : 'load.error', url, undefined, String(error));
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        throw new AudioAbortedError(url);
      }
      if (error instanceof AudioBackendError) throw error;
      throw new AudioLoadError(url, `Unable to load audio resource: ${url}`, { cause: error });
    } finally {
      signal?.removeEventListener('abort', abort);
      this.pendingLoads--;
    }
  }

  private insertCache(url: string, buffer: AudioBufferPort): void {
    const bytes = buffer.length * buffer.numberOfChannels * 4;
    if (bytes > this.maxCacheBytes || this.maxCacheBytes === 0) return;
    this.release(url);
    while (this.cacheBytes + bytes > this.maxCacheBytes) {
      const oldestUrl = this.cache.keys().next().value as string | undefined;
      if (oldestUrl === undefined) break;
      this.release(oldestUrl);
    }
    this.cache.set(url, { buffer, bytes });
    this.cacheBytes += bytes;
  }

  private assertLive(): void {
    if (this.disposed) throw new Error('Audio backend has been disposed');
  }
}

/** A scene/request lifetime that cancels pending loads and stops its playback. */
export class AudioResourceScope {
  private readonly controller = new AbortController();
  private readonly playbacks = new Set<PlaybackHandle>();
  private readonly urls = new Set<string>();
  private disposed = false;

  constructor(private readonly backend: BrowserAudioBackend) {}

  async play(url: string, options: PlayOptions = {}): Promise<PlaybackHandle> {
    if (this.disposed) throw new Error('Audio resource scope has been disposed');
    this.urls.add(url);
    const request = new AbortController();
    const abortRequest = () => request.abort();
    if (this.disposed || this.controller.signal.aborted || options.signal?.aborted) abortRequest();
    else {
      this.controller.signal.addEventListener('abort', abortRequest, { once: true });
      options.signal?.addEventListener('abort', abortRequest, { once: true });
    }
    const cleanup = () => {
      this.controller.signal.removeEventListener('abort', abortRequest);
      options.signal?.removeEventListener('abort', abortRequest);
    };
    let playback: PlaybackHandle;
    try { playback = await this.backend.play(url, { ...options, signal: request.signal }); }
    catch (error) { cleanup(); throw error; }
    if (this.disposed || request.signal.aborted) playback.stop();
    else this.playbacks.add(playback);
    void playback.finished.then(() => { this.playbacks.delete(playback); cleanup(); });
    return playback;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controller.abort();
    for (const playback of this.playbacks) playback.stop();
    this.playbacks.clear();
    for (const url of this.urls) this.backend.release(url);
    this.urls.clear();
  }
}
