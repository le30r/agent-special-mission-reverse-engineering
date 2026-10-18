#!/usr/bin/env node
/**
 * Real Chromium E2E for the primary generic-scene route:
 * Level1 -> bottle -> inventory -> cut the hammock -> natural `Level 38 0`
 * -> Level38 `Goto_1` (pre-seeded by `Lstate Goto_1 1 38`) -> Level1 portal[0].
 *
 * No debug scene button is used for the transition. Input is dispatched as real
 * CDP mouse events at logical 800x600 coordinates.
 *
 * Usage:
 *   E2E_CDP=http://127.0.0.1:9222 E2E_URL='http://127.0.0.1:4173/?debug=scenes' \
 *     node scripts/e2e-browser-scene38.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installE2EAudioPolicy } from './e2e-audio-policy.mjs';

const cdpEndpoint = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const startUrl = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=scenes';
const screenshotDir = process.env.E2E_SCREENSHOT_DIR ?? path.join('research', 'transitions', 'evidence', 'scene38');
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
async function waitFor(description, predicate, timeoutMs = 45000) {
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
async function waitForPanel(fragment, timeoutMs = 45000) {
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

try {
  await send('Page.enable');
  await installE2EAudioPolicy(send);
  await send('Runtime.enable');
  await send('Page.navigate', { url: startUrl });
  let text = await waitFor('initial Level1 panel', async () => {
    const current = await panel();
    return current.includes('active=1') && current.includes('Goto_5.visible=true') ? current : false;
  });
  await waitForPanel('init=[1:1]');
  await sleep(700);
  text = await panel();
  assert(text.includes('inventory=[] selected=0'), `fresh inventory, got:\n${text}`);
  assert(text.includes('Slip.state=1'), `Init State Slip 1, got:\n${text}`);

  // 1) Pick up the bottle through the original Goto/StartW/Addtol/State block.
  await logicalClick(108, 342);
  text = await waitForPanel('level1.Botl.state=1');
  assert(text.includes('inventory=[1]'), `bottle in inventory, got:\n${text}`);

  // 2) Camera left by ordinary click-to-walk.
  for (let i = 0; i < 5; i++) {
    text = await panel();
    if (scrollOf(text) <= 280) break;
    await logicalClick(60, 470);
    await sleep(1600);
  }
  text = await panel();
  assert(scrollOf(text) <= 280, `camera moved left, got:\n${text}`);

  // 3) Inventory use: the bottle is packed slot 0 (grid origin 487,18).
  await logicalClick(740, 580);
  await sleep(300);
  await logicalClick(517, 68);
  await sleep(300);
  text = await panel();
  assert(text.includes('selected=1'), `bottle selected from inventory, got:\n${text}`);

  // 4) Cut the hammock with the real selected item.
  const scroll = scrollOf(text);
  const slipScreenX = 303.18 - scroll;
  assert(slipScreenX > 5 && slipScreenX < 790, `Slip clickable, scroll=${scroll}, x=${slipScreenX}`);
  await logicalClick(slipScreenX, 365);
  text = await waitForPanel('Flag1.state=1');
  assert(text.includes('Slip.state=3'), `Slip.state=3, got:\n${text}`);
  assert(text.includes('Lec_v.state=1'), `Lec_v.state=1, got:\n${text}`);
  assert(text.includes('inventory=[]'), `Remtol 1 removed the bottle, got:\n${text}`);
  await screenshot('01-level1-hammock-cut.png');

  // 5) Click the now-visible Lec_v statue. Its Case 1 runs Goto/StartW Goto2/Level 38 0.
  const afterCutScroll = scrollOf(text);
  const lecScreenX = 340.84 - afterCutScroll;
  assert(lecScreenX > 5 && lecScreenX < 790, `Lec_v clickable, scroll=${afterCutScroll}, x=${lecScreenX}`);
  await logicalClick(lecScreenX, 301);

  text = await waitForPanel('active=38', 60000);
  assert(text.includes('entry=portal[0]'), `Level38 entered through Level 38 0 -> Portal[0], got:\n${text}`);
  assert(text.includes('init=[1:1,38:1]'), `Level38 Init ran exactly once, got:\n${text}`);
  assert(text.includes('inventory=[]'), `inventory stays empty after the cut, got:\n${text}`);
  assert(text.includes('Goto_1=1/v'), `Lstate Goto_1 1 38 seeded the Level38 Active, got:\n${text}`);
  const placeholders = /lstate\.placeholders=\[([^\]]*)\]/.exec(text)?.[1] ?? '';
  assert(placeholders.includes('44:') && placeholders.includes('To_38=1') && placeholders.includes('Interface=1'),
    `Lstate To_38 1 44 / Interface 1 44 placeholders, got:\n${text}`);
  assert(text.includes('level1.Slip.state=3') && text.includes('Flag1.state=1') && text.includes('Lec_v.state=1'),
    `Level1 state preserved, got:\n${text}`);
  const level38Position = positionOf(text);
  console.log(`Level38 entry pos=${level38Position} scroll=${scrollOf(text)}`);
  await screenshot('02-level38-entered.png');

  // 6) Return through the pre-seeded Level38 `Goto_1` Active (Case 1 is selected
  //    only because Lstate set its State to 1). This is a normal scene click.
  const level38Scroll = scrollOf(text);
  const returnScreenX = 875 - level38Scroll;
  assert(returnScreenX > 5 && returnScreenX < 790, `Level38 Goto_1 clickable, scroll=${level38Scroll}, x=${returnScreenX}`);
  await logicalClick(returnScreenX, 400);
  text = await waitForPanel('active=1', 60000);
  assert(text.includes('entry=portal[0]'), `Level1 re-entered via Portal[0], got:\n${text}`);
  assert(text.includes('init=[1:1,38:1]'), `no second Level1 Init, got:\n${text}`);
  assert(text.includes('Lec_v.state=2'), `Lstate Lec_v 2 1 applied on return, got:\n${text}`);
  assert(text.includes('level1.Slip.state=3') && text.includes('Flag1.state=1'),
    `cut state survives the whole route, got:\n${text}`);
  await screenshot('03-level1-return-lstate.png');

  console.log('\nFINAL DEBUG PANEL\n' + text);
  console.log('\nE2E LEVEL1 -> LEVEL38 -> LEVEL1 PASSED');
} finally {
  socket.close();
}
