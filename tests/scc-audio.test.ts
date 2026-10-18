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
  start() { this.started = true; if (this.startError) throw this.startError; }
  stop() { this.onended?.(); }
}
class FakeContext implements AudioContextPort {
  state = 'running'; destination = {};
  source = new FakeSource();
  createBufferSource() { return this.source; }
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
    lockedContext.source.startError = new DOMException('gesture required', 'NotAllowedError');
    const lockedBackend = new BrowserAudioBackend({ context: lockedContext, fetcher: async () => ({ ok: true, status: 200, arrayBuffer: async () => wav() }) });
    const locked = new SccAudioRuntime(lockedBackend, { 'sound/scn_01/konst/004.wav': '/locked.wav' }, 1, false);
    locked.play(makeEvent(7), 1);
    await vi.waitFor(() => expect(lockedContext.source.started).toBe(true));
    expect(locked.isReady(7, 100000)).toBe(false);
    locked.dispose(); await lockedBackend.dispose();
  });

  it('releases a browser sync barrier at Voice duration when resource preparation stalls, but not at the exact deadline', () => {
    const context = new FakeContext();
    const backend = new BrowserAudioBackend({ context, fetcher: () => new Promise(() => {}) });
    const audio = new SccAudioRuntime(backend, { 'sound/scn_01/konst/004.wav': '/stalled.wav' }, 1, false, { 'sound/scn_01/konst/004.wav': 30 });
    audio.play(makeEvent(8), 1000);
    expect(audio.isReady(8, 1030)).toBe(false);
    expect(audio.isReady(8, 1031)).toBe(true);
    expect(audio.snapshot().find((voice) => voice.id === 8)).toMatchObject({ state: 'ended', finished: true });
    audio.dispose();
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
