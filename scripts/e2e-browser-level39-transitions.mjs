#!/usr/bin/env node
/**
 * Real Chromium E2E for Level39 -> Level40 and Level39 -> Level47.
 *
 * Level39 is entered through the generated debug catalog button (the same lazy
 * loader path), then every transition is driven by clicking the original Active
 * regions / Object images:
 *   Goto_40 -> Level 40 0
 *   Goto_39 (Level40) -> Goport 0 + Level 39 1
 *   Goto_1  -> Goport 2 + Level 47 2
 *
 * Usage:
 *   E2E_CDP=http://127.0.0.1:9222 E2E_URL='http://127.0.0.1:4173/?debug=scenes' \
 *     node scripts/e2e-browser-level39-transitions.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cdpEndpoint = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const startUrl = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=scenes';
const screenshotDir = process.env.E2E_SCREENSHOT_DIR ?? path.join('research', 'transitions', 'evidence', 'level39-transitions');
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
async function waitFor(description, predicate, timeoutMs = 60000) {
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
async function waitForPanel(fragment, timeoutMs = 60000) {
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
function spriteOf(text, name) {
  const match = new RegExp(`${name}=(visible|hidden|removed|missing)/(\\d+)x(\\d+)/d(-?\\d+)@(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)`).exec(text);
  if (!match) return undefined;
  return { state: match[1], width: Number(match[2]), height: Number(match[3]), depth: Number(match[4]), x: Number(match[5]), y: Number(match[6]) };
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: startUrl });
  await waitForPanel('active=1');
  await waitForPanel('init=[1:1]');
  await evaluate("document.getElementById('debug-scene-39').click()");
  let text = await waitForPanel('active=39');
  await waitForPanel('init=[1:1,39:1]');
  assert(text.includes('entry=portal[0]'), `Level39 debug entry uses Portal[0], got:\n${text}`);
  assert(text.includes('scene=1152x600'), `Level39 width, got:\n${text}`);

  // Level39 Goto_40 Active: rect 445..520 x 230..430. At scroll 352 click (130,350).
  await logicalClick(130, 350);
  text = await waitForPanel('active=40', 90000);
  assert(text.includes('entry=portal[0]'), `Level 40 0 -> Portal[0], got:\n${text}`);
  assert(text.includes('init=[1:1,39:1,40:1]'), `Level40 Init ran once, got:\n${text}`);
  assert(text.includes('6:Goto_5=1'), `Lstate Goto_5 1 6 from the Goto_40 handler, got:\n${text}`);
  console.log(`Level40 entry pos=${positionOf(text)} scroll=${scrollOf(text)}`);
  await screenshot('01-level40-entered.png');
  // Level40 Start runs `StartW Verx`; wait for that one blocking animation before
  // clicking the exit Active (SceneView ignores clicks while an SCC program is busy).
  await sleep(2500);

  // Level40 Goto_39 Active: rect 0..80 x 150..450. It runs Goport 0 then Level 39 1.
  text = await panel();
  let returnScroll = scrollOf(text);
  await logicalClick(Math.max(8, Math.min(790, 40 - returnScroll)), 300);
  text = await waitForPanel('active=39', 90000);
  assert(text.includes('entry=portal[1]'), `Level 39 1 -> Portal[1], got:\n${text}`);
  assert(text.includes('init=[1:1,39:1,40:1]'), `no second Level39 Init, got:\n${text}`);
  await screenshot('02-level39-returned.png');

  // Level39 Goto_1 Object: world center (164.76, 293.79), size 91x196. The Vaza
  // object is in front of its lower part, so try a few upper pixels.
  text = await panel();
  const goto1 = spriteOf(text, 'Goto_1');
  assert(goto1, `Goto_1 sprite in debug panel, got:\n${text}`);
  let reached47 = false;
  for (const [dx, dy] of [[0, -85], [-22, -70], [22, -70], [0, -55], [0, 0]]) {
    text = await panel();
    const scroll = scrollOf(text);
    const worldX = goto1.x + dx;
    const worldY = goto1.y + dy;
    const screenX = worldX - scroll;
    const screenY = worldY;
    if (screenX < 8 || screenX > 792 || screenY < 8 || screenY > 592) continue;
    await logicalClick(screenX, screenY);
    try {
      text = await waitForPanel('active=47', 8000);
      reached47 = true;
      break;
    } catch {
      // A miss falls back to click-to-walk; ignore it and try another pixel.
      text = await panel();
    }
  }
  assert(reached47, `Goto_1 -> Goport 2 -> Level 47 2, got:\n${text}`);
  text = await waitForPanel('active=47');
  assert(text.includes('entry=portal[2]'), `Level 47 2 -> Portal[2], got:\n${text}`);
  assert(text.includes('init=[1:1,39:1,40:1,47:1]'), `Level47 Init ran once, got:\n${text}`);
  console.log(`Level47 entry pos=${positionOf(text)} scroll=${scrollOf(text)}`);
  await screenshot('03-level47-entered.png');

  console.log('\nFINAL DEBUG PANEL\n' + text);
  console.log('\nE2E LEVEL39 -> LEVEL40 / LEVEL47 PASSED');
} finally {
  socket.close();
}
