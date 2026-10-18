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
}

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
  ) {
    this.finished = new Promise((resolve) => { this.finish = resolve; });
    source.onended = () => this.complete();
  }

  get stopped(): boolean { return this.didStop; }

  start(): void { this.source.start(); }

  stop(): void {
    if (this.didStop) return;
    this.didStop = true;
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
  private readonly cache = new Map<string, CacheEntry>();
  private readonly active = new Map<number, Playback>();
  private cacheBytes = 0;
  private pendingLoads = 0;
  private pendingDecodes = 0;
  private nextPlaybackId = 1;
  private disposed = false;

  constructor(options: AudioBackendOptions = {}) {
    const factory = options.contextFactory ?? (() => {
      const AudioContextConstructor = globalThis.AudioContext;
      if (!AudioContextConstructor) throw new Error('Web Audio API is unavailable');
      return new AudioContextConstructor() as unknown as AudioContextPort;
    });
    this.context = options.context ?? factory();
    this.fetcher = options.fetcher ?? ((url, init) => fetch(url, init));
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
    const buffer = await this.load(url, options.signal);
    this.assertLive();
    if (options.signal?.aborted) throw new AudioAbortedError(url);

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = options.loop ?? false;
    source.connect(this.context.destination);
    const id = this.nextPlaybackId++;
    const playback = new Playback(id, url, source, (ended) => {
      this.active.delete(ended.id);
      options.signal?.removeEventListener('abort', abortPlayback);
    });
    const abortPlayback = () => playback.stop();
    options.signal?.addEventListener('abort', abortPlayback, { once: true });
    this.active.set(id, playback);
    try {
      playback.start();
    } catch (error) {
      playback.stop();
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

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    for (const playback of this.active.values()) playback.stop();
    this.clearCache();
    await this.context.close();
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
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await this.fetcher(url, { signal: controller.signal });
      if (signal?.aborted) throw new AudioAbortedError(url);
      if (!response.ok) throw new AudioLoadError(url, `Audio request failed (${response.status}): ${url}`);
      const bytes = await response.arrayBuffer();
      if (signal?.aborted) throw new AudioAbortedError(url);
      let buffer: AudioBufferPort;
      try {
        this.pendingDecodes++;
        buffer = await this.context.decodeAudioData(bytes);
      } catch (error) {
        throw new AudioLoadError(url, `Unable to decode audio resource: ${url}`, { cause: error });
      } finally {
        this.pendingDecodes--;
      }
      if (signal?.aborted) throw new AudioAbortedError(url);
      this.insertCache(url, buffer);
      return buffer;
    } catch (error) {
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
    const playback = await this.backend.play(url, { ...options, signal: this.controller.signal });
    if (this.disposed) playback.stop();
    else this.playbacks.add(playback);
    void playback.finished.then(() => this.playbacks.delete(playback));
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
