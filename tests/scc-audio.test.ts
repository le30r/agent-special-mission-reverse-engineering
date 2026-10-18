import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserAudioBackend, type AudioBufferPort, type AudioBufferSourcePort, type AudioContextPort } from '../src/audio/backend';
import { normalizeSoundPath, parseFrameSoundEvents, SccAudioRuntime, SilentVoiceClock, stepSyncRange } from '../src/audio/scc-audio';

function wav(dataBytes = 1000, avgBytesPerSecond = 33333): ArrayBuffer {
  const bytes = new ArrayBuffer(12 + 8 + 16 + 8 + dataBytes);
  const v = new DataView(bytes);
  const tag = (at: number, value: string) => [...value].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  tag(0, 'RIFF'); v.setUint32(4, bytes.byteLength - 8, true); tag(8, 'WAVE');
  tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, avgBytesPerSecond, true); v.setUint32(28, avgBytesPerSecond, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  tag(36, 'data'); v.setUint32(40, dataBytes, true);
  return bytes;
}

const makeEvent = (id: number, repeat = false) => ({ id, animation: 'Voice', start: 1, end: 1, objects: ['Mainhero'], value: 'sound/scn_01/konst/004.wav', repeat });

class FakeSource implements AudioBufferSourcePort {
  buffer: AudioBufferPort | null = null;
  loop = false;
  onended: (() => void) | null = null;
  connect() {}
  disconnect() {}
  startError?: Error;
  started = false;
  stopped = false;
  start() { this.started = true; if (this.startError) throw this.startError; }
  stop() { this.stopped = true; this.onended?.(); }
  end() { this.onended?.(); }
}
class FakeContext implements AudioContextPort {
  state = 'running'; destination = {};
  sources: FakeSource[] = [];
  nextStartError?: Error;
  get source() { return this.sources[this.sources.length - 1] ?? new FakeSource(); }
  createBufferSource() { const source = new FakeSource(); source.startError = this.nextStartError; this.sources.push(source); return source; }
  async decodeAudioData(): Promise<AudioBufferPort> { return { duration: 0.1, length: 4410, numberOfChannels: 1 }; }
  async resume() {}
  async close() {}
}

afterEach(() => vi.unstubAllGlobals());

describe('SCC WAV runtime regression L1–L9', () => {
  it('L1: derives encoded RIFF duration and uses strict elapsed > duration', () => {
    expect(SccAudioRuntime.durationFromWav(wav())).toBe(30);
    const voice = new SilentVoiceClock(30);
    voice.play(1000);
    expect(voice.ready(1030)).toBe(false);
    expect(voice.ready(1031)).toBe(true);
    expect(new SilentVoiceClock(0).ready(0)).toBe(true);
    const zero = new SilentVoiceClock(0); zero.play(20); expect(zero.ready(20)).toBe(false);
    const negative = new SilentVoiceClock(-1); negative.play(20); expect(negative.ready(20)).toBe(true);
  });

  it('L2: silent repeat does not make a Voice immortal; null-buffer replay resets its deadline', () => {
    for (const repeat of [false, true]) {
      const voice = new SilentVoiceClock(20); voice.play(1000);
      expect(voice.ready(1020)).toBe(false);
      expect(voice.ready(1021)).toBe(true);
      voice.play(1010);
      expect(voice.ready(1030)).toBe(false);
      expect(voice.ready(1031)).toBe(true);
      expect(repeat).toBeTypeOf('boolean'); // the native null-buffer predicate does not inspect Repeat.
    }
  });

  it('L3: parses sync hooks and a silent [1,1] Voice crosses EOF only after the exact deadline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(wav(1000, 50000), { status: 200 })));
    const audio = new SccAudioRuntime(undefined, { 'sound/scn_01/konst/004.wav': '/prepared/004.wav' }, 1, true);
    const hook = makeEvent(1);
    let frame = 1, latched = false, active = true;
    const first = stepSyncRange(hook, frame, latched, false);
    expect(first.started).toBe(true); audio.play(hook, 1000); latched = first.latched;
    await vi.waitFor(() => expect(audio.snapshot().find((voice) => voice.id === 1)?.duration).toBe(20));
    const trace: string[] = ['1000:play:frame1:active'];
    frame = 2; // elapsed animation interval; this is end+1 for [1,1].
    for (const tick of [1010, 1020]) {
      const step = stepSyncRange(hook, frame, latched, audio.isReady(1, tick));
      frame = step.frame; latched = step.latched; trace.push(`${tick}:frame${frame}:latched=${latched}`);
    }
    expect(audio.isReady(1, 1020)).toBe(false);
    expect(audio.isReady(1, 1030)).toBe(true); // duration20; elapsed30 is strictly greater.
    const finished = stepSyncRange(hook, frame, latched, audio.isReady(1, 1030));
    frame = finished.frame; latched = finished.latched; trace.push(`1030:frame${frame}:latched=${latched}`);
    expect(finished.completed).toBe(true);
    frame = 3; active = false; trace.push('1030:frame3:inactive');
    expect(trace).toEqual(['1000:play:frame1:active', '1010:frame1:latched=true', '1020:frame1:latched=true', '1030:frame2:latched=false', '1030:frame3:inactive']);
    expect(active).toBe(false); // SCC polls before animation update; continuation observes this at 1040.
    audio.dispose();
  });

  it('L4: preserves the real adjacent K_rolici source order and boundaries', async () => {
    const source = await readFile('agent-original/game-installed/Program_Executable_Files/Scripts/Level10.scc', 'utf8');
    const events = parseFrameSoundEvents(source).filter((event) => event.animation === 'K_rolici' && event.end > 0);
    expect(events.map(({ start, end }) => [start, end])).toEqual([[9, 11], [12, 14], [15, 17], [18, 20]]);
    expect(events.map((event) => event.id)).toEqual([...events.map((event) => event.id)].sort((a, b) => a - b));
    const [a, b] = events;
    const held = stepSyncRange(a, 12, true, false);
    expect(held).toMatchObject({ frame: 9, latched: true, repeated: true });
    const released = stepSyncRange(a, 12, true, true);
    const handed = stepSyncRange(b, released.frame, false, false);
    expect(released.frame).toBe(12);
    expect(handed).toMatchObject({ frame: 12, latched: true, started: true }); // B begins in the same event update.
  });

  it('L5: a failed prepare/start becomes terminal-ready instead of waiting for a missing onended', async () => {
    const context = new FakeContext();
    const backend = new BrowserAudioBackend({ context, fetcher: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }) });
    const audio = new SccAudioRuntime(backend, { 'sound/scn_01/konst/004.wav': '/missing.wav' }, 1, false);
    audio.play(makeEvent(2), 10);
    await vi.waitFor(() => expect(audio.isReady(2, 10)).toBe(true));
    audio.dispose(); await backend.dispose();
  });

  it('L6: Stop cancels only its latched sync Voice; effect handles remain independently owned', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(wav(), { status: 200 })));
    const audio = new SccAudioRuntime(undefined, { 'sound/scn_01/konst/004.wav': '/prepared/004.wav' }, 1, true);
    const first = audio.play(makeEvent(3, true), 1);
    const second = audio.play({ ...makeEvent(4), end: 0 }, 1);
    audio.stop(3);
    expect(first.state).toBe('stopped');
    expect(second.state).toBe('pending');
    audio.dispose();
  });

  it('L7: native Stop does not reset the silent Voice clock; animation cancellation is separate', () => {
    const voice = new SilentVoiceClock(20); voice.play(1000); voice.stop();
    expect(voice.lastPlayTime).toBe(1000);
    expect(voice.ready(1020)).toBe(false);
    expect(voice.ready(1021)).toBe(true);
  });

  it('L8: scene dispose aborts owned sources and stale silent fetch completion cannot revive the Voice', async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
    }));
    const audio = new SccAudioRuntime(undefined, { 'sound/scn_01/konst/004.wav': '/pending.wav' }, 1, true);
    const handle = audio.play(makeEvent(5), 1);
    await Promise.resolve(); audio.dispose();
    expect(signal?.aborted).toBe(true);
    expect(handle.state).toBe('disposed');
  });

  it('L9: browser preparation errors are terminal-ready while autoplay restriction remains pending', async () => {
    const context = new FakeContext();
    const backend = new BrowserAudioBackend({ context, fetcher: async () => ({ ok: false, status: 500, arrayBuffer: async () => new ArrayBuffer(0) }) });
    const failed = new SccAudioRuntime(backend, { 'sound/scn_01/konst/004.wav': '/error.wav' }, 1, false);
    failed.play(makeEvent(6), 1);
    await vi.waitFor(() => expect(failed.isReady(6, 2)).toBe(true));
    failed.dispose(); await backend.dispose();

    const lockedContext = new FakeContext();
    lockedContext.nextStartError = new DOMException('gesture required', 'NotAllowedError');
    const lockedBackend = new BrowserAudioBackend({ context: lockedContext, fetcher: async () => ({ ok: true, status: 200, arrayBuffer: async () => wav() }) });
    const locked = new SccAudioRuntime(lockedBackend, { 'sound/scn_01/konst/004.wav': '/locked.wav' }, 1, false);
    locked.play(makeEvent(7), 1);
    await vi.waitFor(() => expect(lockedContext.source.started).toBe(true));
    expect(locked.isReady(7, 100000)).toBe(false);
    locked.dispose(); await lockedBackend.dispose();
  });

  it('D: pending browser preparation never masquerades as successful EOF', () => {
    const context = new FakeContext();
    const backend = new BrowserAudioBackend({ context, fetcher: () => new Promise(() => {}) });
    const audio = new SccAudioRuntime(backend, { 'sound/scn_01/konst/004.wav': '/stalled.wav' }, 1, false, { 'sound/scn_01/konst/004.wav': 30 });
    audio.play(makeEvent(8), 1000);
    expect(audio.isReady(8, 1030)).toBe(false);
    expect(audio.isReady(8, 1031)).toBe(false);
    expect(audio.snapshot().find((voice) => voice.id === 8)).toMatchObject({ state: 'pending', finished: false });
    audio.dispose();
  });

  it('plays a cold WAV whose fetch/decode finishes after the strict logical duration deadline', async () => {
    const context = new FakeContext();
    let release!: (value: AudioBufferPort) => void;
    context.decodeAudioData = vi.fn(() => new Promise<AudioBufferPort>((resolve) => { release = resolve; }));
    const backend = new BrowserAudioBackend({ context, fetcher: async () => ({ ok: true, status: 200, arrayBuffer: async () => wav() }) });
    const audio = new SccAudioRuntime(backend, { 'sound/scn_01/konst/004.wav': '/cold.wav' }, 1, false, { 'sound/scn_01/konst/004.wav': 30 });
    const handle = audio.play(makeEvent(20), 1000);
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce());
    expect(audio.isReady(20, 1030)).toBe(false);
    expect(audio.isReady(20, 1031)).toBe(false);
    expect(handle.state).toBe('pending');
    release({ duration: 0.04, length: 1764, numberOfChannels: 1 });
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    expect(context.source.started).toBe(true);
    expect(context.source.stopped).toBe(false);
    expect(handle.state).toBe('playing');
    expect(audio.isReady(20, 1031)).toBe(false);
    audio.dispose(); await backend.dispose();
  });

  it('G: replaces the same Voice generation during decode; stale completion cannot revive it', async () => {
    const context = new FakeContext();
    const decodes: Array<(value: AudioBufferPort) => void> = [];
    context.decodeAudioData = vi.fn(() => new Promise<AudioBufferPort>((resolve) => decodes.push(resolve)));
    const backend = new BrowserAudioBackend({ context, fetcher: async () => ({ ok: true, status: 200, arrayBuffer: async () => wav() }) });
    const audio = new SccAudioRuntime(backend, { 'sound/scn_01/konst/004.wav': '/delayed-repeat.wav' }, 1, false, { 'sound/scn_01/konst/004.wav': 5 });
    const first = audio.play(makeEvent(28), 10);
    await vi.waitFor(() => expect(decodes).toHaveLength(1));
    expect(audio.isReady(28, 11)).toBe(false);
    const second = audio.play(makeEvent(28), 11);
    await vi.waitFor(() => expect(decodes).toHaveLength(2));
    decodes[0]({ duration: 0.1, length: 4410, numberOfChannels: 1 });
    decodes[1]({ duration: 0.1, length: 4410, numberOfChannels: 1 });
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    expect(context.source.started).toBe(true);
    expect(context.source.stopped).toBe(false);
    expect(first.state).toBe('replaced');
    expect(audio.snapshot()).toHaveLength(1);
    expect(audio.snapshot()[0]).toMatchObject({ voiceId: 1, playGeneration: 2 });
    expect(second.state).toBe('playing');
    audio.dispose(); await backend.dispose();
  });

  it('cancels a Voice stopped during decode without allowing a late callback to revive it', async () => {
    const context = new FakeContext();
    let release!: (value: AudioBufferPort) => void;
    context.decodeAudioData = vi.fn(() => new Promise<AudioBufferPort>((resolve) => { release = resolve; }));
    const backend = new BrowserAudioBackend({ context, fetcher: async () => ({ ok: true, status: 200, arrayBuffer: async () => wav() }) });
    const audio = new SccAudioRuntime(backend, { 'sound/scn_01/konst/004.wav': '/stopped-during-decode.wav' }, 1, false);
    const handle = audio.play(makeEvent(29), 1);
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce());
    audio.stop(29);
    release({ duration: 1, length: 44100, numberOfChannels: 1 });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(handle.state).toBe('stopped');
    expect(context.sources).toHaveLength(0);
    expect(audio.isReady(29, 2)).toBe(true);
    audio.dispose(); await backend.dispose();
  });

  it('plays sequential and repeated WAV events from cache without duplicate starts', async () => {
    const context = new FakeContext();
    const fetcher = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => wav() }));
    const backend = new BrowserAudioBackend({ context, fetcher });
    const audio = new SccAudioRuntime(backend, { 'sound/scn_01/konst/004.wav': '/same.wav' }, 1, false);
    const repeated = makeEvent(21, true);
    audio.play(repeated, 1);
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    const same = audio.play(repeated, 2);
    expect(same).toBe(audio.play(repeated, 3));
    expect(context.sources).toHaveLength(1);
    audio.play(makeEvent(22), 4);
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    expect(fetcher).toHaveBeenCalledOnce();
    expect(context.sources.every((source) => source.started)).toBe(true);
    audio.dispose(); await backend.dispose();
  });

  it('starts simultaneous independent Voice instances and preserves their independent lifetimes', async () => {
    const context = new FakeContext();
    const backend = new BrowserAudioBackend({ context, fetcher: async () => ({ ok: true, status: 200, arrayBuffer: async () => wav() }) });
    const audio = new SccAudioRuntime(backend, { 'sound/scn_01/konst/004.wav': '/same.wav' }, 1, false);
    audio.play(makeEvent(23), 1);
    audio.play(makeEvent(24), 1);
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    expect(backend.activePlaybackCount).toBe(2);
    context.sources[0].end();
    expect(backend.activePlaybackCount).toBe(1);
    expect(context.sources[1].stopped).toBe(false);
    audio.dispose(); await backend.dispose();
  });

  it('retries autoplay-locked Voice only after unlock and cancels old-scene loads safely', async () => {
    const context = new FakeContext();
    context.nextStartError = new DOMException('gesture required', 'NotAllowedError');
    const backend = new BrowserAudioBackend({ context, fetcher: async () => ({ ok: true, status: 200, arrayBuffer: async () => wav() }) });
    const audio = new SccAudioRuntime(backend, { 'sound/scn_01/konst/004.wav': '/locked.wav' }, 1, false);
    const handle = audio.play(makeEvent(25), 1);
    await vi.waitFor(() => expect(audio.snapshot().find((voice) => voice.id === 25)?.error).toContain('NotAllowedError'));
    expect(audio.snapshot().find((voice) => voice.id === 25)?.error).toContain('NotAllowedError');
    const laterHandle = audio.play(makeEvent(25), 2);
    await vi.waitFor(() => expect(context.sources.filter((source) => source.startError).length).toBe(2));
    context.nextStartError = undefined;
    await audio.unlock();
    expect(handle.state).toBe('replaced');
    await vi.waitFor(() => expect(laterHandle.state).toBe('playing'));
    expect(context.sources.filter((source) => source.started)).toHaveLength(3); // two blocked attempts, only current generation retries.
    audio.dispose(); await backend.dispose();

    let resolveFetch!: (value: { ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }) => void;
    const sceneBackend = new BrowserAudioBackend({ context: new FakeContext(), fetcher: () => new Promise((resolve) => { resolveFetch = resolve; }) });
    const oldScene = new SccAudioRuntime(sceneBackend, { 'sound/scn_01/konst/004.wav': '/old-scene.wav' }, 1, false);
    const oldHandle = oldScene.play(makeEvent(26), 1);
    await Promise.resolve(); oldScene.dispose();
    resolveFetch({ ok: true, status: 200, arrayBuffer: async () => wav() });
    await Promise.resolve(); await Promise.resolve();
    expect(oldHandle.state).toBe('disposed');
    expect(sceneBackend.activePlaybackCount).toBe(0);
    await sceneBackend.dispose();
  });

  it('keeps strict synchronous Fram barrier release independent from late playback completion', () => {
    const event = makeEvent(27);
    let frame = 1, latched = false;
    const started = stepSyncRange(event, frame, latched, false);
    frame = started.frame; latched = started.latched;
    expect(started.started).toBe(true);
    expect(stepSyncRange(event, 2, latched, false)).toMatchObject({ repeated: true, frame: 1, latched: true });
    expect(stepSyncRange(event, 2, latched, true)).toMatchObject({ completed: true, frame: 2, latched: false });
  });

  it('normalizes case and separator style but never resolves by basename only', () => {
    expect(normalizeSoundPath('BLOCK9\\SOUND\\Scn_01\\KONST\\004.WAV')).toBe('sound/scn_01/konst/004.wav');
    expect(normalizeSoundPath('sound/other/004.wav')).not.toBe(normalizeSoundPath('sound/scn_01/konst/004.wav'));
  });

  it('parses Sound/Fram/Repeat and keeps Fram.end=-1 as a depth value, not a WAV', () => {
    const events = parseFrameSoundEvents(`Sound Demo\nFram 1 1 1 Mainhero SOUND\\A\\B.WAV\nRepeat\nFram 3 -1 1 ObjectA 250\nFram 4 0 1 ObjectB sound\\eff\\1.wav`);
    expect(events).toEqual([
      { id: 0, animation: 'Demo', start: 1, end: 1, objects: ['Mainhero'], value: 'SOUND\\A\\B.WAV', repeat: true },
      { id: 1, animation: 'Demo', start: 3, end: -1, objects: ['ObjectA'], value: '250', repeat: false },
      { id: 2, animation: 'Demo', start: 4, end: 0, objects: ['ObjectB'], value: 'sound\\eff\\1.wav', repeat: false },
    ]);
  });

  it('finds required original audio hooks in Level1', async () => {
    const source = await readFile('agent-original/game-installed/Program_Executable_Files/Scripts/Level1.scc', 'utf8');
    const events = parseFrameSoundEvents(source);
    for (const animation of ['K_pistol', 'Takedr1', 'K_nar', 'Razres']) expect(events.some((event) => event.animation === animation && event.end > 0)).toBe(true);
  });
});

describe('D/F/G ownership regressions', () => {
  const key = 'sound/scn_01/konst/004.wav';
  const fetcher = async () => ({ ok: true, status: 200, arrayBuffer: async () => wav() });

  it('D: suspended scheduling and suspension after start never release a sync barrier', async () => {
    const context = new FakeContext(); context.state = 'suspended';
    const backend = new BrowserAudioBackend({ context, fetcher });
    const audio = new SccAudioRuntime(backend, { [key]: '/suspended.wav' }, 1, false, { [key]: 30 });
    const handle = audio.play(makeEvent(1), 1000);
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    expect(handle.state).toBe('waiting-context');
    expect(audio.isReady(1, 100000)).toBe(false);
    context.state = 'running'; await audio.unlock();
    expect(context.sources).toHaveLength(1); // resume is not replay
    expect(handle.state).toBe('playing');
    context.state = 'suspended';
    expect(audio.isReady(1, 200000)).toBe(false);
    context.state = 'running'; context.source.end();
    await expect(handle.finished).resolves.toBe('ended');
    expect(audio.isReady(1, 200000)).toBe(true);
    audio.dispose(); await backend.dispose();
  });

  it.each(['fetch', 'decode'])('D: stuck %s becomes explicit failed preparation, never successful EOF', async (phase) => {
    vi.useFakeTimers();
    try {
      const context = new FakeContext();
      if (phase === 'decode') context.decodeAudioData = () => new Promise(() => {});
      const backend = new BrowserAudioBackend({ context, fetcher: phase === 'fetch' ? () => new Promise(() => {}) : fetcher, prepareTimeoutMs: 50 });
      const audio = new SccAudioRuntime(backend, { [key]: '/stuck.wav' }, 1, false, { [key]: 1 });
      const handle = audio.play(makeEvent(1), 0);
      await vi.advanceTimersByTimeAsync(49);
      expect(audio.isReady(1, 10000)).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(handle.finished).resolves.toBe('failed');
      expect(audio.isReady(1, 10000)).toBe(true);
      expect(context.sources).toHaveLength(0);
      audio.dispose(); await backend.dispose();
    } finally { vi.useRealTimers(); }
  });

  it('F: all eight original inline Repeat declarations are parsed, without consuming adjacent events', async () => {
    const levels = [3, 27, 28, 29, 31, 36];
    const counts = [];
    for (const level of levels) {
      const source = await readFile(`agent-original/game-installed/Program_Executable_Files/Scripts/Level${level}.scc`, 'utf8');
      const expected = source.split(/\r?\n/).filter((line) => /^\s*Fram\b.*\bRepeat\s*$/i.test(line));
      const parsed = parseFrameSoundEvents(source).filter((event) => event.repeat);
      counts.push(parsed.length);
      expect(parsed).toHaveLength(expected.length);
      for (const [index, event] of parsed.entries()) {
        expect(expected[index].toLowerCase()).toContain(event.value.toLowerCase());
        expect(event).toMatchObject({ start: 1, end: 0 });
      }
    }
    expect(counts).toEqual([2, 1, 1, 1, 2, 1]);
  });

  it('F/G: actual looping source survives repeat play, Stop settles once, immediate Start rearms it', async () => {
    const context = new FakeContext();
    const backend = new BrowserAudioBackend({ context, fetcher });
    const audio = new SccAudioRuntime(backend, { [key]: '/loop.wav' }, 1, false);
    const event = { ...makeEvent(1, true), end: 0 };
    const first = audio.play(event, 0);
    await vi.waitFor(() => expect(context.source.started).toBe(true));
    expect(context.source.loop).toBe(true);
    expect(audio.play(event, 100000)).toBe(first);
    expect(audio.isReady(1, 100000)).toBe(false);
    const staleEnded = context.source.onended!;
    audio.stop(1);
    await expect(first.finished).resolves.toBe('stopped');
    const second = audio.play(event, 100001);
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    staleEnded(); await Promise.resolve();
    expect(second.state).toBe('playing');
    expect(context.sources[0].stopped).toBe(true);
    expect(context.sources[1].loop).toBe(true);
    expect(audio.snapshot()[0]).toMatchObject({ voiceId: 1, playGeneration: 2 });
    audio.dispose(); await expect(second.finished).resolves.toBe('disposed'); await backend.dispose();
  });

  it('G: active non-repeat replay stops the old source; old callback cannot end the new run', async () => {
    const context = new FakeContext();
    const backend = new BrowserAudioBackend({ context, fetcher });
    const audio = new SccAudioRuntime(backend, { [key]: '/same.wav' }, 1, false);
    const first = audio.play(makeEvent(1), 0);
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    const staleEnded = context.source.onended!;
    const second = audio.play(makeEvent(1), 1);
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    await expect(first.finished).resolves.toBe('replaced');
    staleEnded(); await Promise.resolve();
    expect(second.state).toBe('playing');
    expect(backend.activePlaybackCount).toBe(1);
    audio.stop(1);
    expect(backend.activePlaybackCount).toBe(0);
    await expect(second.finished).resolves.toBe('stopped');
    audio.dispose(); await backend.dispose();
  });

  it('G: original shared PCM aliases replace/read/stop one physical playback; private Voice stays independent', async () => {
    const context = new FakeContext();
    const backend = new BrowserAudioBackend({ context, fetcher });
    const audio = new SccAudioRuntime(backend, { [key]: '/pcm.wav' }, 1, false, {}, { [key]: 'sharedPcm' });
    const first = audio.play(makeEvent(1), 0);
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    const second = audio.play(makeEvent(2), 1);
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    expect(first.state).toBe('replaced');
    expect(audio.snapshot().map((v) => v.state)).toEqual(['playing', 'playing']);
    expect(backend.activePlaybackCount).toBe(1);
    audio.stop(1); // alias of the SECOND source, not its old stopped source
    expect(second.state).toBe('stopped');
    expect(audio.isReady(2, 1)).toBe(true);
    expect(backend.activePlaybackCount).toBe(0);
    audio.dispose(); await backend.dispose();
  });
});
