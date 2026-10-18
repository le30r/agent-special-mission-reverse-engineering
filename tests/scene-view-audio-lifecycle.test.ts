import { Texture } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { BrowserAudioBackend, type AudioBufferPort, type AudioBufferSourcePort, type AudioContextPort, type AudioFetcher } from '../src/audio/backend';
import type { FrameSoundEvent, SccAudioRuntime } from '../src/audio/scc-audio';
import { SceneView } from '../src/scene/scene-view';
import { createSceneState } from '../src/scene/scene-loader';
import { catalogDefinition, loadTestSceneCatalog } from './helpers/scene-catalog';

class Source implements AudioBufferSourcePort {
  buffer: AudioBufferPort | null = null;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  connect = vi.fn();
  start() { this.started = true; }
  stop() { this.stopped = true; this.onended?.(); }
  disconnect = vi.fn();
}

class Context implements AudioContextPort {
  readonly state = 'running';
  readonly destination = {};
  readonly sources: Source[] = [];
  createBufferSource() { const source = new Source(); this.sources.push(source); return source; }
  decodeAudioData = vi.fn(async () => ({ duration: 10, length: 441, numberOfChannels: 1 }));
  resume = vi.fn(async () => {});
  close = vi.fn(async () => {});
}

const event = (id: number, value: string): FrameSoundEvent => ({ id, animation: 'Test', start: 1, end: 1, objects: ['Mainhero'], value, repeat: false });
const hooks = { level() {}, lstate() {}, setZone() {} };
const catalogPromise = loadTestSceneCatalog([1]);

async function makeView(context: Context, fetcher?: AudioFetcher) {
  const catalog = await catalogPromise;
  const definition = { ...catalogDefinition(catalog, 1), audioResources: { 'test/one.wav': '/one.wav', 'test/two.wav': '/two.wav', 'test/pending.wav': '/pending.wav' } };
  const backend = new BrowserAudioBackend({ context, fetcher: fetcher ?? (async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) })) });
  const view = new SceneView(definition, createSceneState(1), Texture.EMPTY, hooks, [], backend);
  view.placeHero({ position: [1199, 524], direction: 6, source: 'init', depth: 0, scale: 1, scroll: 599, snapRadius: 0, snapAngleIndex: 0 });
  return { view, backend, audio: (view as unknown as { audio: SccAudioRuntime }).audio };
}

describe('SceneView WAV ownership', () => {
  it('keeps the scene audio scope live across walk → sound → walk → sound', async () => {
    const context = new Context();
    const { view, backend, audio } = await makeView(context);
    const sequence = [event(1, 'test/one.wav'), event(2, 'test/two.wav')];
    // Keep the test focused on pointerDown's click-to-walk ownership boundary;
    // Pixi's browser-only canvas texture path is not part of this lifecycle.
    (view as unknown as { startAnimation: () => void }).startAnimation = () => {};

    view.pointerDown(60, 470);
    const first = audio.play(sequence[0], 1);
    await vi.waitFor(() => expect(context.sources[0]?.started).toBe(true));
    view.pointerDown(80, 470);
    const second = audio.play(sequence[1], 2);
    await vi.waitFor(() => expect(context.sources[1]?.started).toBe(true));

    expect(audio.diagnostics().filter((item) => item.event === 'voice.playing').map((item) => item.url)).toEqual(['/one.wav', '/two.wav']);
    expect(first.state).toBe('playing');
    expect(second.state).toBe('playing');
    view.dispose();
    await backend.dispose();
  });

  it('stops active WAVs and aborts pending WAVs when the scene is disposed', async () => {
    const context = new Context();
    let pendingSignal: AbortSignal | undefined;
    const fetcher = async (url: string, { signal }: { signal: AbortSignal }) => {
      if (url === '/pending.wav') {
        pendingSignal = signal;
        return await new Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
        });
      }
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) };
    };
    const { view, backend, audio } = await makeView(context, fetcher);
    const active = audio.play(event(1, 'test/one.wav'), 1);
    await vi.waitFor(() => expect(context.sources[0]?.started).toBe(true));
    const pending = audio.play(event(2, 'test/pending.wav'), 2);
    await vi.waitFor(() => expect(pendingSignal).toBeDefined());

    view.dispose();
    await Promise.resolve();
    expect(context.sources[0].stopped).toBe(true);
    expect(pendingSignal?.aborted).toBe(true);
    expect(active.state).toBe('disposed');
    expect(pending.state).toBe('disposed');
    expect(context.sources).toHaveLength(1);
    await backend.dispose();
  });
});
