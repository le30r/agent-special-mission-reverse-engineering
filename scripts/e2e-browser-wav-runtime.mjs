#!/usr/bin/env node
import { resources } from './lib/e2e-resources.mjs';
import { skipStartupVideo } from './e2e-video-helpers.mjs';
/** Deterministic scheduler fixtures with actual corpus WAVs and real Chromium Web Audio.
 * Uses a disposable target; never installs the E2E mute hook or disables autoplay.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const endpoint = process.env.E2E_CDP ?? 'http://127.0.0.1:9222';
const url = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=scenes';
const output = process.env.E2E_OUTPUT_DIR ?? resources.tempDir('artifacts');
async function connect(address) {
  const socket = new WebSocket(address);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let next = 0;
  const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data), waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
  });
  return { socket, send(method, params = {}) { const id = ++next; socket.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); } };
}
const version = await (await fetch(`${endpoint}/json/version`)).json();
const browser = await connect(version.webSocketDebuggerUrl);
const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
let page;
try {
  const target = (await (await fetch(`${endpoint}/json`)).json()).find((t) => t.id === targetId);
  page = await connect(target.webSocketDebuggerUrl);
  const evaluate = async (expression) => {
    const result = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await page.send('Page.enable');
  await page.send('Page.navigate', { url });
  await skipStartupVideo(page.send, evaluate);
  const deadline = Date.now() + 30000;
  while (!(await evaluate('!!window.__audioDebug?.view()'))) {
    if (Date.now() > deadline) throw new Error('Scene boot timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // A real gesture, not --autoplay-policy or a stubbed resume().
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1 });
  const result = await evaluate(`(${browserRegressions.toString()})()`);
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'wav-runtime.json'), JSON.stringify({ browser: version.Browser, ...result }, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log('E2E WAV RUNTIME PASSED');
} finally {
  page?.socket.close();
  await browser.send('Target.closeTarget', { targetId });
  browser.socket.close();
}

async function browserRegressions() {
  const { BrowserAudioBackend } = await import('/src/audio/backend.ts');
  const { SccAudioRuntime, parseFrameSoundEvents, normalizeSoundPath } = await import('/src/audio/scc-audio.ts');
  const { SccRuntime } = await import('/src/scc/runtime.ts');
  const manifest = await (await fetch('/generated/scenes.json')).json();
  const assert = (condition, detail) => { if (!condition) throw new Error(detail); };
  const wait = async (predicate, label) => {
    const deadline = performance.now() + 15000;
    while (!predicate()) { if (performance.now() > deadline) throw new Error(`Timeout: ${label}`); await new Promise((r) => setTimeout(r, 10)); }
  };
  const view = window.__audioDebug.view();
  const tick = Object.getPrototypeOf(view).tick.bind(view);
  view.tick = () => {}; // manually drive the real SceneView, independent of RAF/catch-up timing
  view.audio.dispose();
  view.movement = undefined;
  for (const name of view.player.states.keys()) view.player.stop(name);
  view.activeBarriers.clear(); view.latchedSounds.clear();
  const event = view.definition.audioEvents.find((e) => e.animation === 'Takedr1' && e.end > 0);
  const key = normalizeSoundPath(event.value), resource = manifest.audioResources[key];
  assert(resource.toLowerCase().endsWith('/scn_01/konst/004.wav'), `wrong sync WAV: ${resource}`);
  const context = new AudioContext(); await context.suspend();
  const suspendedTime = context.currentTime;
  let releaseFetch, releaseDecode, decodeEntered = false;
  const fetchGate = new Promise((r) => { releaseFetch = r; });
  const decodeGate = new Promise((r) => { releaseDecode = r; });
  const decode = context.decodeAudioData.bind(context);
  context.decodeAudioData = async (bytes) => { decodeEntered = true; await decodeGate; return decode(bytes); };
  const nodes = [];
  const create = context.createBufferSource.bind(context);
  context.createBufferSource = () => { const source = create(); nodes.push(source); return source; };
  const backend = new BrowserAudioBackend({ context, fetcher: async (url, init) => { await fetchGate; return fetch(url, init); } });
  const audio = new SccAudioRuntime(backend, manifest.audioResources, 1, false, manifest.audioDurations, manifest.audioStorageModes);
  view.audio = audio;
  // Actual SCC StartW continuation, not just a direct isReady assertion.
  view.scc = new SccRuntime('Click 0 Probe Probe\n{\nCase 0\nStartW Takedr1\nState Done 1\nBreak\n}', {
    pathActive: () => false,
    animationActive: (name) => view.player.isActive(name),
    startAnimation: (name) => view.startAnimation(name, 'SCC'),
    stopAnimation: (name) => view.stopAnimation(name),
    setPosition() {}, setDepth() {},
  });
  assert(view.scc.dispatch('Probe'), 'fixture SCC did not dispatch');
  tick(0, 1000, 1);
  const assertBlocked = (label) => {
    assert(view.player.isActive('Takedr1') && view.activeBarriers.get('Takedr1') === event.id, `${label}: barrier disappeared`);
    assert(view.scc.states.get('Done') !== 1 && view.scc.busy, `${label}: StartW continued early`);
    assert(!audio.isReady(event.id, 1000000), `${label}: false EOF`);
  };
  tick(5000, 1000000, 2); assertBlocked('pending fetch');
  releaseFetch(); await wait(() => decodeEntered, 'decode request');
  tick(5000, 1005000, 3); assertBlocked('pending decode');
  releaseDecode(); await wait(() => nodes.length === 1 && audio.snapshot()[0].state === 'waiting-context', 'suspended scheduled source');
  tick(5000, 1010000, 4); assertBlocked('suspended context');
  assert(context.currentTime === suspendedTime, `suspended audio clock advanced: ${suspendedTime} → ${context.currentTime}`);
  await audio.unlock();
  assert(nodes.length === 1, 'unlock replayed a scheduled source');
  await context.suspend(); tick(5000, 1015000, 5); assertBlocked('suspended after start');
  await audio.unlock();
  await wait(() => audio.isReady(event.id, 1020000), 'actual WAV EOF');
  const trace = audio.diagnostics();
  assert(trace.some((e) => e.event === 'source.onended' && e.url === resource), 'no actual EOF for target WAV');
  assert(!trace.some((e) => e.event === 'source.stop'), 'sound stopped before EOF');
  tick(5000, 1020000, 6); tick(0, 1020001, 7);
  assert(view.scc.states.get('Done') === 1, 'StartW failed to finish after EOF');
  assert(context.currentTime > 0, 'real audio clock never ran');
  const sync = { resource, contextTime: context.currentTime, state: audio.snapshot()[0].state, trace };

  // G: active Voice replacement and old callbacks on actual Web Audio nodes.
  await wait(() => audio.snapshot().every((v) => v.state !== 'pending'), 'remaining animation effects');
  for (const voice of audio.snapshot()) if (voice.id !== event.id) audio.stop(voice.id);
  const baseline = nodes.length;
  const first = audio.play(event, 1020002);
  await wait(() => nodes.length === baseline + 1, 'first replay');
  const voiceId = audio.snapshot()[0].voiceId;
  const stale = nodes.at(-1).onended;
  const second = audio.play(event, 1020003);
  await wait(() => nodes.length === baseline + 2, 'replacement');
  stale?.(); await Promise.resolve();
  assert(first.state === 'replaced' && second.state === 'playing', 'stale generation changed replacement');
  assert(backend.activePlaybackCount === 1 && audio.snapshot()[0].voiceId === voiceId, 'Voice multiplied');
  audio.stop(event.id);
  assert(second.state === 'stopped' && backend.activePlaybackCount === 0, 'Stop left source alive');

  // F: every real inline declaration, with actual Sea loop, Stop, immediate restart.
  let repeatCount = 0, sea;
  const repeatDeclarations = [];
  for (const scene of [3, 27, 28, 29, 31, 36]) {
    const source = await (await fetch(`/resources/Level${scene}.scc`)).text();
    const events = parseFrameSoundEvents(source).filter((e) => e.repeat);
    repeatCount += events.length;
    repeatDeclarations.push(...events.map((event) => ({ scene, event })));
    if (scene === 28) sea = events[0];
  }
  assert(repeatCount === 8, `Repeat corpus count=${repeatCount}`);
  const repeatResults = [];
  for (const { scene, event: loopEvent } of repeatDeclarations) {
    const loopAudio = new SccAudioRuntime(backend, manifest.audioResources, scene, false, manifest.audioDurations, manifest.audioStorageModes);
    const resource = manifest.audioResources[normalizeSoundPath(loopEvent.value)];
    const loop = loopAudio.play(loopEvent, 0);
    await wait(() => loop.state === 'playing', `loop ${resource}`);
    assert(nodes.at(-1).loop, `source not looping: ${resource}`);
    assert(loopAudio.play(loopEvent, 1000000) === loop && !loopAudio.isReady(loopEvent.id, 1000000), `Repeat restarted or timed out: ${resource}`);
    loopAudio.stop(loopEvent.id);
    const loop2 = loopAudio.play(loopEvent, 1000001);
    await wait(() => loop2.state === 'playing', `restart ${resource}`);
    assert(loop.state === 'stopped' && nodes.at(-1).loop && backend.activePlaybackCount === 1, `Repeat Stop/Start ownership: ${resource}`);
    loopAudio.dispose();
    assert(backend.activePlaybackCount === 0, `scene disposal retained loop: ${resource}`);
    repeatResults.push({ scene, resource, looping: true, stopRestart: true });
  }
  const seaResource = manifest.audioResources[normalizeSoundPath(sea.value)];

  // Actual output PCM, no gain/mute hook. Render >2 source durations to prove looping.
  const bytes = await (await fetch(seaResource)).arrayBuffer();
  const buffer = await decode(bytes);
  const sampleRate = 22050, frames = Math.ceil((buffer.duration * 2 + 0.1) * sampleRate);
  const offline = new OfflineAudioContext(1, frames, sampleRate);
  const offlineBackend = new BrowserAudioBackend({ context: offline });
  const offlinePlayback = await offlineBackend.play(seaResource, { loop: true });
  const rendered = await offline.startRendering();
  const channel = rendered.getChannelData(0);
  const tail = channel.subarray(Math.ceil(buffer.duration * 1.5 * sampleRate));
  const rms = Math.sqrt(tail.reduce((sum, x) => sum + x * x, 0) / tail.length);
  offlinePlayback.stop(); offlineBackend.clearCache();
  assert(rms > 0.0001, `loop output PCM is silent: RMS=${rms}`);
  assert(window.__e2eAudioMuted !== true, 'fresh regression target contaminated by E2E mute');
  audio.dispose(); await backend.dispose();
  return { sync, repeatCount, repeatResults, seaResource, loopTailRms: rms, voiceReplacement: 'passed', isolatedUnmutedTarget: true };
}
