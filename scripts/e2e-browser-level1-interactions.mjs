#!/usr/bin/env node
/**
 * Real Chromium E2E for the Level1 pistol and hammock (Slip) interactions.
 * Connects to an already-running CDP endpoint, sends real mouse input, reads the
 * debug observations, and writes screenshots. No debug scene buttons or direct
 * state mutation are used.
 *
 * Usage:
 *   E2E_CDP=http://127.0.0.1:9222 E2E_URL='http://127.0.0.1:4173/?debug=scenes' \
 *     node scripts/e2e-browser-level1-interactions.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installE2EAudioPolicy } from './e2e-audio-policy.mjs';

const cdpEndpoint = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const startUrl = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=scenes';
const screenshotDir = process.env.E2E_SCREENSHOT_DIR ?? path.join('research', 'transitions', 'evidence', 'level1-interactions');
const logicalWidth = 800;
const logicalHeight = 600;

const targets = await (await fetch(`${cdpEndpoint}/json`)).json();
const page = targets.find((target) => target.type === 'page' && target.url.includes('127.0.0.1'))
  ?? targets.find((target) => target.type === 'page');
if (!page) throw new Error(`No page target at ${cdpEndpoint}`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(`${message.error.message}: ${JSON.stringify(message.error.data ?? null)}`));
  else waiter.resolve(message.result);
});
function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Runtime.evaluate failed');
  return result.result.value;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(description, predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}. Last value: ${String(last)}`);
}
async function panel() { return await evaluate("document.querySelector('.scene-debug')?.textContent ?? ''"); }
async function waitForPanel(fragment, timeoutMs = 30000) {
  return await waitFor(`panel to contain ${JSON.stringify(fragment)}`, async () => {
    const text = await panel();
    return text.includes(fragment) ? text : false;
  }, timeoutMs);
}
async function canvasRect() {
  return await evaluate(`(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  })()`);
}
async function logicalClick(x, y) {
  const rect = await waitFor('canvas rect', canvasRect);
  const clientX = rect.left + (x * rect.width) / logicalWidth;
  const clientY = rect.top + (y * rect.height) / logicalHeight;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: clientX, y: clientY });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clientX, y: clientY, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clientX, y: clientY, button: 'left', buttons: 0, clickCount: 1 });
  console.log(`click logical (${Math.round(x)},${Math.round(y)})`);
}
async function observationOverlays(hidden) {
  await evaluate(`(() => {
    for (const selector of ['.scene-debug', '.scene-controls']) {
      const element = document.querySelector(selector);
      if (element) element.style.visibility = '${hidden ? 'hidden' : ''}';
    }
  })()`);
}
async function screenshot(name) {
  await mkdir(screenshotDir, { recursive: true });
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(screenshotDir, name);
  await writeFile(file, Buffer.from(result.data, 'base64'));
  console.log(`screenshot ${file}`);
}
function assert(condition, message) { if (!condition) throw new Error(`Assertion failed: ${message}`); }
function scrollOf(text) { return Number(/scroll=(\d+)/.exec(text)?.[1] ?? NaN); }
function positionOf(text) { return /pos=\((-?\d+),(-?\d+)\)/.exec(text)?.slice(1).map(Number); }

try {
  await send('Page.enable');
  await installE2EAudioPolicy(send);
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const trace = window.__audioTrace = [];
    const record = (event, detail = {}) => trace.push({ time: performance.now(), event, ...detail });
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const url = String(args[0]?.url ?? args[0]);
      if (!/\\.wav(?:$|\\?)/i.test(url)) return originalFetch(...args);
      record('fetch.start', { url });
      if (${Number(process.env.E2E_WAV_DELAY_MS ?? 0)} > 0) await new Promise((resolve) => setTimeout(resolve, ${Number(process.env.E2E_WAV_DELAY_MS ?? 0)}));
      const response = await originalFetch(...args);
      record('fetch.complete', { url, status: response.status });
      return response;
    };
    const decode = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function(data, ...args) {
      record('decode.start', { contextState: this.state });
      const result = decode.call(this, data, ...args);
      return result.then((buffer) => { record('decode.complete', { duration: buffer.duration }); return buffer; }, (error) => { record('decode.error', { error: String(error) }); throw error; });
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args) {
      const detail = { contextState: this.context.state, duration: this.buffer?.duration };
      try { const result = start.apply(this, args); record('source.start.ok', detail); this.addEventListener('ended', () => record('source.onended', detail), { once: true }); return result; }
      catch (error) { record('source.start.error', { ...detail, error: String(error) }); throw error; }
    };
    const stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function(...args) { record('source.stop', { contextState: this.context.state }); return stop.apply(this, args); };
  })();` });
  await send('Page.navigate', { url: startUrl });
  let text = await waitFor('initial Level1 panel', async () => {
    const current = await panel();
    return current.includes('SCENE DEBUG · active=1') && current.includes('Goto_5.visible=true') ? current : false;
  });
  await waitForPanel('init=[1:1]');
  await sleep(Number(process.env.E2E_AUDIO_WARM_MS ?? 700));
  text = await panel();
  assert(text.includes('zone=3'), `Setzon 3, got:\n${text}`);
  assert(text.includes('scroll=599'), `initial scroll 599, got:\n${text}`);
  assert(text.includes('inventory=[] selected=0'), `empty fresh inventory, got:\n${text}`);
  assert(text.includes('level1.Botl.state=0'), `fresh bottle state, got:\n${text}`);
  assert(text.includes('Slip.state=1'), `Init State Slip 1, got:\n${text}`);
  assert(text.includes('Flag1.state=0'), `fresh hammock flag, got:\n${text}`);
  assert(text.includes('Pistol=visible/33x24/d1000'), `pistol start image, got:\n${text}`);
  assert(/Slip=visible\/\d+x\d+\/d17/.test(text), `Slip looping hammock image, got:\n${text}`);
  await screenshot('01-level1-fresh-pistol-slip.png');

  // 1) Pistol: ordinary scene click on the declared Object's external image.
  //    World center (1104.67,569.1) - start scroll 599 = screen (505.7,569.1).
  const startsBeforePistol = await evaluate("(window.__audioTrace ?? []).filter((event) => event.event === 'source.start.ok').length");
  await logicalClick(506, 569);
  text = await waitForPanel('inventory=[4]', 30000);
  await waitFor('successful pistol AudioBufferSourceNode.start()', async () => (await evaluate("(window.__audioTrace ?? []).filter((event) => event.event === 'source.start.ok').length")) > startsBeforePistol, 10000);
  assert(text.includes('Nar.visible=false'), `Hide Nar after pistol pickup, got:\n${text}`);
  assert(text.includes('Pistol=removed/0x0/d1000'), `K_pistol frame 20 removes the pistol image, got:\n${text}`);
  assert(text.includes('level1.Botl.state=0'), `pistol must not touch bottle state, got:\n${text}`);
  await screenshot('02-pistol-collected.png');

  // 2) Bottle positive control through the original Goto/StartW/Addtol/State block.
  //    The bottle neck at world (707,342) is the part not overlapped by the
  //    nearer Per_botl object (depth 900 vs Botl depth 1000); screen = world - 599.
  const startsBeforeBottle = await evaluate("(window.__audioTrace ?? []).filter((event) => event.event === 'source.start.ok').length");
  await logicalClick(108, 342);
  text = await waitForPanel('level1.Botl.state=1', 30000);
  await waitFor('successful bottle AudioBufferSourceNode.start()', async () => (await evaluate("(window.__audioTrace ?? []).filter((event) => event.event === 'source.start.ok').length")) > startsBeforeBottle, 10000);
  assert(text.includes('inventory=[4,1]'), `pistol then bottle in inventory, got:\n${text}`);
  assert(text.includes('Botl=removed/0x0/d1000'), `bottle empty Takedr1 frame, got:\n${text}`);
  await screenshot('03-bottle-collected.png');

  // 3) Move the camera left so the Slip hammock is on screen. These are normal
  //    click-to-walk clicks, not debug calls.
  for (let i = 0; i < 5; i++) {
    text = await panel();
    if (scrollOf(text) <= 280) break;
    await logicalClick(60, 470);
    await sleep(1600);
  }
  text = await panel();
  assert(scrollOf(text) <= 280, `camera moved left, got:\n${text}`);
  assert(/Slip=visible\/\d+x\d+\/d17/.test(text), `Slip still on its looping animation, got:\n${text}`);
  await screenshot('04-camera-left-slip-visible.png');

  // 4) Inventory use: open the toolbar, select the bottle (second packed slot,
  //    original grid origin 487+60,18), then click the hammock.
  await logicalClick(740, 580);
  await sleep(300);
  text = await panel();
  assert(text.includes('inventory=[4,1]'), `inventory panel open state, got:\n${text}`);
  await observationOverlays(true);
  await screenshot('05-inventory-open.png');
  await observationOverlays(false);
  await logicalClick(577, 68); // slot 1 because pistol is slot 0
  await sleep(300);
  text = await panel();
  assert(text.includes('selected=1'), `bottle selected from inventory, got:\n${text}`);
  const scroll = scrollOf(text);
  const slipScreenX = 303.18 - scroll;
  assert(slipScreenX > 5 && slipScreenX < 790, `Slip clickable on screen, scroll=${scroll}, x=${slipScreenX}`);
  await screenshot('06-bottle-selected.png');

  // 5) Click a solid Slip pixel. World (303.18,365.36); screen = world - scroll.
  await logicalClick(slipScreenX, 365);
  text = await waitForPanel('Flag1.state=1', 30000);
  assert(text.includes('Slip.state=3'), `State Slip 3 after the cut, got:\n${text}`);
  assert(text.includes('Lec_v.state=1'), `State Lec_v 1, got:\n${text}`);
  assert(text.includes('inventory=[4]'), `Remtol 1 removed the bottle, pistol remains, got:\n${text}`);
  assert(text.includes('selected=0'), `selected item cleared after use, got:\n${text}`);
  assert(text.includes('Slip=visible/474x341/d17'), `Razres final Slip image, got:\n${text}`);
  await screenshot('07-hammock-cut.png');

  const after = await panel();
  console.log('\nFINAL DEBUG PANEL\n' + after);
  const trace = await evaluate('window.__audioTrace ?? []');
  const starts = trace.filter((event) => event.event === 'source.start.ok');
  assert(starts.length >= 2, `expected successful AudioBufferSourceNode starts for pistol and bottle, got ${JSON.stringify(trace)}`);
  const muteState = await evaluate('({ muted: window.__e2eAudioMuted === true, connections: window.__e2eAudioMuteCount ?? 0 })');
  if (process.env.E2E_MUTE_AUDIO === '0') assert(!muteState.muted && muteState.connections === 0, `E2E_MUTE_AUDIO=0 should preserve the audible Web Audio graph: ${JSON.stringify(muteState)}`);
  else assert(muteState.muted && muteState.connections >= starts.length, `E2E should mute only output while preserving source.start(): ${JSON.stringify(muteState)}`);
  console.log(`\nWEB AUDIO TRACE: ${JSON.stringify(trace)}`);
  console.log(`\nE2E AUDIO OUTPUT: ${JSON.stringify(muteState)} (muted=${process.env.E2E_MUTE_AUDIO !== '0'})`);
  const runtimeTrace = await evaluate('window.__audioDebug?.view()?.audio?.diagnostics?.() ?? []');
  console.log(`\nVOICE/BACKEND TRACE: ${JSON.stringify(runtimeTrace)}`);
  console.log('\nE2E LEVEL1 INTERACTIONS PASSED');
} finally {
  socket.close();
}
