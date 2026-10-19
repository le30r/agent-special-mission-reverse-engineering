#!/usr/bin/env node
import { resources } from './lib/e2e-resources.mjs';
/**
 * Real Chromium E2E for the natural SCC scene transition.
 *
 * It connects to an already-running Chrome DevTools endpoint, maps logical
 * 800x600 scene coordinates onto the canvas, and sends real mouse input through
 * CDP. It never uses the debug scene buttons. Screenshots are written locally.
 *
 * Usage:
 *   E2E_CDP=http://127.0.0.1:9222 E2E_URL='http://127.0.0.1:4173/?debug=scenes' \
 *     node scripts/e2e-browser-transition.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installE2EAudioPolicy } from './e2e-audio-policy.mjs';

const cdpEndpoint = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const startUrl = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=scenes';
const screenshotDir = process.env.E2E_SCREENSHOT_DIR ?? resources.tempDir('artifacts');
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
async function waitFor(description, predicate, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}. Last value: ${String(last)}`);
}
async function panel() {
  return await evaluate("document.querySelector('.scene-debug')?.textContent ?? ''");
}
async function waitForPanel(fragment, timeoutMs) {
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
  console.log(`click logical (${x},${y}) -> client (${clientX.toFixed(1)},${clientY.toFixed(1)})`);
}
async function screenshot(name) {
  await mkdir(screenshotDir, { recursive: true });
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(screenshotDir, name);
  await writeFile(file, Buffer.from(result.data, 'base64'));
  console.log(`screenshot ${file}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
async function reload() {
  await send('Page.reload', { ignoreCache: true });
  await waitFor('debug panel after reload', async () => {
    const text = await panel();
    return text.includes('SCENE DEBUG · active=1') ? text : false;
  }, 30000);
  await sleep(500); // let the one-poll SclipW continuation complete
}
async function waitForGoto5Visible() {
  await waitForPanel('Goto_5.visible=true');
  await waitForPanel('init=[1:1]');
  await sleep(500);
}

try {
  await send('Page.enable');
  await installE2EAudioPolicy(send);
  await send('Runtime.enable');
  await send('Page.navigate', { url: startUrl });
  await waitFor('initial Level1 panel', async () => {
    const text = await panel();
    return text.includes('SCENE DEBUG · active=1') && text.includes('Goto_5.visible=true') ? text : false;
  }, 30000);
  await waitForPanel('init=[1:1]');
  await sleep(500);
  let text = await panel();
  assert(text.includes('zone=3'), `Level1 Init Setzon 3, got:\n${text}`);
  assert(text.includes('level1.Botl.state=0'), `fresh bottle state, got:\n${text}`);
  await screenshot('01-level1-init-goto5-visible.png');

  // Scenario A: exact requested route at the initial scrollX=599.
  assert(text.includes('scroll=599'), `initial scrollX=599, got:\n${text}`);
  await logicalClick(775, 220);
  text = await waitForPanel('active=39', 30000);
  assert(text.includes('Goto_11.visible=true'), `Level39 Init Show Goto_11, got:\n${text}`);
  assert(text.includes('zone=2'), `Level39 Init Setzon 2, got:\n${text}`);
  assert(text.includes('1->39:0[SCC]'), `Goto_5 -> Level 39 0 was an SCC Level, got:\n${text}`);
  assert(text.includes('scroll=352'), `Level39 entry scroll 352, got:\n${text}`);
  await screenshot('02-level39-after-goto5.png');

  // A scene-entry StartW owns the global busy flag until its continuation ends.
  text = await waitForPanel('scc.busy=false', 90000);
  await logicalClick(768, 400);
  text = await waitForPanel('active=1', 90000);
  assert(text.includes('39->1:1[SCC]'), `Goto_11 -> Level 1 1 was an SCC Level, got:\n${text}`);
  assert(text.includes('init=[1:1,39:1]'), `Init ran once per scene, got:\n${text}`);
  assert(text.includes('zone=2'), `Setzon value survived return to Level1, got:\n${text}`);
  assert(text.includes('Goto_5.visible=true'), `Active.visible survived re-entry, got:\n${text}`);
  assert(text.includes('1->39:0[SCC] 39->1:1[SCC]'), `natural two-way transition log, got:\n${text}`);
  await screenshot('03-level1-return-no-reinit.png');

  // Scenario B: collect the bottle through the real SCC, then the same two-way route.
  await reload();
  await waitForGoto5Visible();
  // The bottle neck is the uncovered part: Per_botl (depth 900) is in front of
  // Botl (depth 1000) at the old centre point. World (707,342) - scrollX 599.
  await logicalClick(108, 342);
  text = await waitForPanel('level1.Botl.state=1', 30000);
  assert(text.includes('inventory=[1]'), `bottle inventory item 1, got:\n${text}`);
  await screenshot('04-bottle-collected.png');

  // Walk right so the camera returns to the Goto_5 band. (775,400) would hit the
  // nearer Car_click Object in the original all-Object hit test; use open ground.
  await logicalClick(700, 250);
  await waitFor('camera scroll after walking right', async () => {
    const current = await panel();
    const match = /scroll=(\d+)/.exec(current);
    return match && Number(match[1]) >= 600 ? current : false;
  }, 30000);
  text = await panel();
  const scrollMatch = /scroll=(\d+)/.exec(text);
  const gotoX = Math.min(795, Math.max(5, 1400 - Number(scrollMatch?.[1] ?? 599)));
  await logicalClick(gotoX, 220);
  text = await waitForPanel('active=39', 30000);
  assert(text.includes('1->39:0[SCC]'), `second natural forward transition, got:\n${text}`);
  await screenshot('05-level39-after-bottle.png');

  await logicalClick(768, 400);
  text = await waitForPanel('active=1', 30000);
  assert(text.includes('39->1:1[SCC]'), `second natural return, got:\n${text}`);
  assert(text.includes('init=[1:1,39:1]'), `no repeated Init, got:\n${text}`);
  assert(text.includes('level1.Botl.state=1'), `bottle state preserved, got:\n${text}`);
  assert(text.includes('inventory=[1]'), `bottle inventory preserved, got:\n${text}`);
  await screenshot('06-level1-return-bottle-preserved.png');

  console.log('\nFINAL DEBUG PANEL\n' + text);
  console.log('\nE2E PASSED');
} finally {
  socket.close();
}
