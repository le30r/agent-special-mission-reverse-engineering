import { describe, expect, it, vi } from 'vitest';
import {
  AudioAbortedError,
  AudioLoadError,
  AudioResourceScope,
  BrowserAudioBackend,
  type AudioBufferPort,
  type AudioBufferSourcePort,
  type AudioContextPort,
  type AudioFetcher,
} from '../src/audio/backend.ts';

class FakeSource implements AudioBufferSourcePort {
  buffer: AudioBufferPort | null = null;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  connect = vi.fn();
  disconnect = vi.fn();
  start(): void { this.started = true; }
  stop(): void { this.stopped = true; this.onended?.(); }
  end(): void { this.onended?.(); }
}

class FakeContext implements AudioContextPort {
  state = 'suspended';
  destination = {};
  sources: FakeSource[] = [];
  decodeAudioData = vi.fn(async () => ({ duration: 1, length: 100, numberOfChannels: 1 }));
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
}

function okResponse(): Awaited<ReturnType<AudioFetcher>> {
  return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
}

function setup(fetcher: AudioFetcher = async () => okResponse(), maxCacheBytes = 4096) {
  const context = new FakeContext();
  const backend = new BrowserAudioBackend({ context, fetcher, maxCacheBytes });
  return { backend, context };
}

describe('BrowserAudioBackend', () => {
  it('loads, decodes and plays, and resumes a suspended context', async () => {
    const { backend, context } = setup();
    await backend.resume();
    const playback = await backend.play('/sound.wav');
    expect(context.resume).toHaveBeenCalledOnce();
    expect(context.sources[0].started).toBe(true);
    expect(playback.stopped).toBe(false);
    await backend.dispose();
  });

  it('supports independent simultaneous playbacks', async () => {
    const { backend } = setup();
    const [first, second] = await Promise.all([backend.play('/a.wav'), backend.play('/b.wav')]);
    expect(backend.activePlaybackCount).toBe(2);
    first.stop();
    expect(first.stopped).toBe(true);
    expect(second.stopped).toBe(false);
    expect(backend.activePlaybackCount).toBe(1);
    await backend.dispose();
  });

  it('tracks natural completion and removes the ended source', async () => {
    const { backend, context } = setup();
    const playback = await backend.play('/sound.wav');
    context.sources[0].end();
    await expect(playback.finished).resolves.toBeUndefined();
    expect(playback.stopped).toBe(true);
    expect(backend.activePlaybackCount).toBe(0);
    await backend.dispose();
  });

  it('stops playback and resolves finished when stopped mid-play', async () => {
    const { backend, context } = setup();
    const playback = await backend.play('/sound.wav');
    playback.stop();
    await expect(playback.finished).resolves.toBeUndefined();
    expect(context.sources[0].stopped).toBe(true);
    expect(backend.activePlaybackCount).toBe(0);
    await backend.dispose();
  });

  it('stops active sources and clears decoded resources on dispose', async () => {
    const { backend, context } = setup();
    await backend.play('/sound.wav');
    expect(backend.cachedBytes).toBe(400);
    await backend.dispose();
    expect(context.sources[0].stopped).toBe(true);
    expect(backend.activePlaybackCount).toBe(0);
    expect(backend.cachedBytes).toBe(0);
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('reports missing URL resources with status and does not cache them', async () => {
    const { backend } = setup(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }));
    await expect(backend.play('/missing.wav')).rejects.toMatchObject({
      name: 'AudioLoadError',
      message: expect.stringContaining('404'),
    });
    expect(backend.cachedBytes).toBe(0);
    await backend.dispose();
  });

  it('caches decoded buffers and reloads after explicit release', async () => {
    const fetcher = vi.fn(async () => okResponse());
    const { backend, context } = setup(fetcher);
    const first = await backend.play('/repeat.wav');
    first.stop();
    const second = await backend.play('/repeat.wav');
    second.stop();
    expect(fetcher).toHaveBeenCalledOnce();
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
    backend.release('/repeat.wav');
    const third = await backend.play('/repeat.wav');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2);
    third.stop();
    await backend.dispose();
  });

  it('evicts least-recently-used decoded buffers to respect the memory budget', async () => {
    const fetcher = vi.fn(async () => okResponse());
    const { backend } = setup(fetcher, 400);
    (await backend.play('/a.wav')).stop();
    (await backend.play('/b.wav')).stop();
    (await backend.play('/a.wav')).stop();
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(backend.cachedBytes).toBe(400);
    await backend.dispose();
  });

  it('turns decode errors into AudioLoadError', async () => {
    const context = new FakeContext();
    context.decodeAudioData.mockRejectedValue(new Error('unsupported codec'));
    const backend = new BrowserAudioBackend({ context });
    await expect(backend.play('/adpcm.wav')).rejects.toBeInstanceOf(AudioLoadError);
    expect(backend.activePlaybackCount).toBe(0);
    await backend.dispose();
  });

  it('cancels pending fetches when a resource scope is disposed', async () => {
    let receivedSignal: AbortSignal | undefined;
    const fetcher: AudioFetcher = (_url, { signal }) => new Promise((_resolve, reject) => {
      receivedSignal = signal;
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
    const { backend } = setup(fetcher);
    const scope = new AudioResourceScope(backend);
    const pending = scope.play('/scene.wav');
    await Promise.resolve();
    scope.dispose();
    await expect(pending).rejects.toBeInstanceOf(AudioAbortedError);
    expect(receivedSignal?.aborted).toBe(true);
    await backend.dispose();
  });

  it('stops scene-owned playback and releases its cached buffer on scope disposal', async () => {
    const { backend, context } = setup();
    const scope = new AudioResourceScope(backend);
    const playback = await scope.play('/scene.wav');
    expect(backend.cachedBytes).toBe(400);
    scope.dispose();
    await expect(playback.finished).resolves.toBeUndefined();
    expect(context.sources[0].stopped).toBe(true);
    expect(backend.cachedBytes).toBe(0);
    await backend.dispose();
  });
});
