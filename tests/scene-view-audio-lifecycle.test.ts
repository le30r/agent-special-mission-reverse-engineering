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

describe('SCC Block input routing', () => {
  it('dispatches Plane without falling through to click-to-walk', async () => {
    const catalog = await catalogPromise;
    const source = `Click 0 Lock Interface\n{\n Case 0\n  Block\n Break\n}\nClick 0 Plane Interface\n{\n Case 0\n  Addtol 99\n Break\n}`;
    const definition = { ...catalogDefinition(catalog, 1), scc: source };
    const view = new SceneView(definition, createSceneState(1), Texture.EMPTY, hooks, []);
    view.placeHero({ position: [1199, 524], direction: 6, source: 'init', depth: 0, scale: 1, scroll: 599, snapRadius: 0, snapAngleIndex: 0 });
    view.scc.dispatch('Lock');
    expect(view.blocked).toBe(true);
    expect(view.status().position).toEqual([1199, 524]);

    view.pointerDown(790, 590); // Empty scene point; normal handling would start a route.

    expect(view.scc.inventory).toEqual([99]);
    expect(view.blocked).toBe(true);
    expect(view.status().position).toEqual([1199, 524]);
    view.dispose();
  });
});

// Use the actual SceneView scheduler and real corpus declarations. Only rendering
// and the audio device are replaced; cursor/latch/Stop behavior is production code.
type SchedulerView = {
  player: import('../src/animation/player').AnimationPlayer;
  audio: SccAudioRuntime;
  activeBarriers: Map<string, number>;
  latchedSounds: Set<number>;
  applyAnimationFrame: (...args: unknown[]) => void;
  startAnimation(name: string, source: string): void;
  stopAnimation(name: string): void;
};
async function schedulerView(scene: number) {
  const catalog = await loadTestSceneCatalog([scene]);
  const definition = catalogDefinition(catalog, scene);
  const resources = Object.fromEntries(definition.audioEvents.filter((e) => e.end >= 0).map((e) => [e.value.replaceAll('\\', '/').toLowerCase(), '/fixture.wav']));
  const context = new Context();
  const backend = new BrowserAudioBackend({ context, fetcher: async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) }) });
  const view = new SceneView({ ...definition, layout: [], audioResources: resources }, createSceneState(scene), Texture.EMPTY, hooks, [], backend);
  const internals = view as unknown as SchedulerView;
  internals.applyAnimationFrame = vi.fn();
  vi.spyOn(view.scc, 'tick').mockImplementation(() => {});
  return { view, internals, backend, context, definition };
}

describe('E/F: sequential SceneView frame hooks', () => {
  it('E: real Level1 Walk1 frame2 fires identically at 3×27ms and catch-up 81ms', async () => {
    const results = [];
    for (const deltas of [[27, 27, 27], [81]]) {
      const { view, internals: s, backend, definition } = await schedulerView(1);
      const play = vi.spyOn(s.audio, 'play');
      s.startAnimation('Walk1', 'SCC');
      let elapsed = 0;
      for (const delta of deltas) { elapsed += delta; view.tick(delta, elapsed, 1); }
      const hook = definition.audioEvents.find((event) => event.animation === 'Walk1' && event.start === 2)!;
      expect(play.mock.calls.map(([event]) => event.id)).toContain(hook.id);
      results.push({ frame: s.player.state('Walk1')?.frame, ids: play.mock.calls.map(([event]) => event.id) });
      view.dispose(); await backend.dispose();
    }
    expect(results[0]).toEqual(results[1]);
    expect(results[0].frame).toBe(4);
  });

  it('E: real K_rolici catch-up cannot pass A; ready hands off to adjacent B in source order', async () => {
    const { view, internals: s, backend, definition } = await schedulerView(10);
    const [a, b] = definition.audioEvents.filter((event) => event.animation === 'K_rolici' && event.end > 0);
    const ready = new Set<number>();
    vi.spyOn(s.audio, 'isReady').mockImplementation((id) => ready.has(id));
    const play = vi.spyOn(s.audio, 'play');
    s.startAnimation('K_rolici', 'SCC');
    s.player.setFrame('K_rolici', a.start - 1);
    const period = Math.floor(1000 / s.player.definition('K_rolici')!.rate);
    view.tick(4 * period, 1000, 1); // 9,10,11,12 → rewinds to 9, NOT B
    expect(s.player.state('K_rolici')?.frame).toBe(a.start);
    expect(play.mock.calls.map(([e]) => e.id)).toEqual([a.id]);
    expect(s.activeBarriers.get('K_rolici')).toBe(a.id);
    ready.add(a.id);
    view.tick(0, 1001, 2);
    expect(play.mock.calls.map(([e]) => e.id)).toEqual([a.id, b.id]);
    expect(s.player.state('K_rolici')?.frame).toBe(b.start);
    expect(s.activeBarriers.get('K_rolici')).toBe(b.id);
    expect(s.latchedSounds.has(a.id)).toBe(false);
    expect(s.latchedSounds.has(b.id)).toBe(true);
    view.dispose(); await backend.dispose();
  });

  it('F: real Sea Repeat Stop/Start without an intervening frame rearms source and latch', async () => {
    const { view, internals: s, backend, definition, context } = await schedulerView(28);
    const event = definition.audioEvents.find((e) => e.repeat)!;
    expect(event).toBeDefined();
    const play = vi.spyOn(s.audio, 'play');
    s.startAnimation(event.animation, 'SCC'); view.tick(0, 1, 1);
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    expect(s.latchedSounds.has(event.id)).toBe(true);
    s.stopAnimation(event.animation);
    expect(context.sources[0].stopped).toBe(true);
    s.startAnimation(event.animation, 'SCC'); view.tick(0, 2, 2);
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    expect(play).toHaveBeenCalledTimes(2);
    expect(s.latchedSounds.has(event.id)).toBe(true);
    expect(s.activeBarriers.has(event.animation)).toBe(false);
    view.dispose(); await backend.dispose();
  });

  it('D/E: a last-frame sync range keeps animation active until actual EOF; explicit Stop cancels it', async () => {
    const { view, internals: s, backend, definition, context } = await schedulerView(1);
    const event = definition.audioEvents.find((e) => e.animation === 'Takedr1' && e.end > 0)!;
    s.startAnimation(event.animation, 'SCC'); view.tick(0, 1000, 1);
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    view.tick(5000, 6000, 2);
    expect(s.player.isActive(event.animation)).toBe(true);
    expect(s.activeBarriers.get(event.animation)).toBe(event.id);
    s.stopAnimation(event.animation);
    expect(s.player.isActive(event.animation)).toBe(false);
    expect(s.activeBarriers.has(event.animation)).toBe(false);
    expect(context.sources[0].stopped).toBe(true);
    view.dispose(); await backend.dispose();
  });
});

describe('§12: terminal failure and narrow Stop integration', () => {
  it('failed decode releases only through scheduler inactive and the following SCC poll', async () => {
    const { SccRuntime } = await import('../src/scc/runtime');
    const { view, internals: s, backend, context } = await schedulerView(1);
    context.decodeAudioData.mockRejectedValue(new Error('bad WAV'));
    const runtime = new SccRuntime('Click 0 Probe Probe\n{\nCase 0\nStartW Takedr1\nState Done 1\nBreak\n}', {
      pathActive: () => false, animationActive: (name) => s.player.isActive(name),
      startAnimation: (name) => s.startAnimation(name, 'SCC'), setPosition() {}, setDepth() {},
    });
    Object.assign(view, { scc: runtime });
    expect(runtime.dispatch('Probe')).toBe(true);
    view.tick(0, 1, 1);
    await vi.waitFor(() => expect(s.audio.snapshot()[0].state).toBe('failed'));
    expect(runtime.states.get('Done')).toBeUndefined();
    expect(s.player.isActive('Takedr1')).toBe(true);
    view.tick(5000, 5001, 2);
    expect(s.player.isActive('Takedr1')).toBe(false);
    expect(runtime.states.get('Done')).toBeUndefined(); // catch never resumes SCC
    view.tick(0, 5002, 3);
    expect(runtime.states.get('Done')).toBe(1);
    view.dispose(); await backend.dispose();
  });

  it('Stop takes the first latched declaration only; later sync and unlatched effect remain scene-owned', async () => {
    const { view, internals: s, backend, definition, context } = await schedulerView(1);
    const [repeat, effect, sync] = definition.audioEvents.filter((e) => e.animation === 'Razres' && e.end >= 0);
    repeat.repeat = true; // §12 source-order fixture: a Repeat preceding a latched sync
    const handles = [repeat, effect, sync].map((e) => s.audio.play(e, 1));
    s.latchedSounds.add(repeat.id); s.latchedSounds.add(sync.id);
    s.activeBarriers.set('Razres', sync.id); s.player.start('Razres');
    await vi.waitFor(() => expect(context.sources).toHaveLength(3));
    s.stopAnimation('Razres');
    expect(handles.map((h) => h.state)).toEqual(['stopped', 'playing', 'playing']);
    expect(s.latchedSounds.has(repeat.id)).toBe(false);
    expect(s.latchedSounds.has(sync.id)).toBe(true);
    expect(s.activeBarriers.has('Razres')).toBe(false);
    expect(s.player.isActive('Razres')).toBe(false);
    view.dispose();
    expect(backend.activePlaybackCount).toBe(0);
    await backend.dispose();
  });
});
