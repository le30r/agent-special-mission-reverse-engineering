#!/usr/bin/env node
import { resources } from './lib/e2e-resources.mjs';
import { skipStartupVideo } from './e2e-video-helpers.mjs';
/**
 * Chromium E2E: Level1 -> (pistol + bottle) -> hammock -> Level38 -> hooligan
 * fight -> Lora conversation.
 *
 * This reproduces the reported blocker: after meeting the hooligans (Pank /
 * Gungster) and driving them off with the pistol, Gromov must talk to Lora.
 *
 * The conversation is `Click 0 Lora Lora` Case 1 (`StartW K_talke`, Level38.scc:
 * 395-421). Before the parser fix this handler is swallowed by the malformed
 * `{  Case 1` line (Level38.scc:382), so clicking Lora falls through to
 * click-to-walk and the script FAILS at the final step. After the fix it passes.
 *
 * No debug scene button is used for the transition. Input is dispatched as real
 * CDP mouse events at logical 800x600 coordinates.
 *
 * Usage:
 *   E2E_CDP=http://127.0.0.1:9222 E2E_URL='http://127.0.0.1:4173/?debug=scenes' \
 *     node scripts/e2e-browser-lora.mjs
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

/** World position of a rendered object through the `?debug=scenes` handle. */
async function objectWorld(name) {
  return await evaluate(`(() => {
    const view = window.__sccDebug?.view?.();
    const object = view?.objectDebug(${JSON.stringify(name)});
    return object ? { x: object.x, y: object.y, width: object.width, height: object.height } : null;
  })()`);
}

try {
  await send('Page.enable');
  await installE2EAudioPolicy(send);
  await send('Runtime.enable');
  await send('Page.navigate', { url: startUrl });
  await skipStartupVideo(send,evaluate);
  let text = await waitFor('initial Level1 panel', async () => {
    const current = await panel();
    return current.includes('active=1') && current.includes('Goto_5.visible=true') ? current : false;
  });
  await waitForPanel('init=[1:1]');
  await sleep(700);

  // 1) Pistol (item 4). World (1104.67,569.1); start scroll 599 -> screen (506,569).
  await logicalClick(506, 569);
  text = await waitForPanel('inventory=[4]');
  assert(text.includes('inventory=[4]'), `pistol in inventory, got:\n${text}`);

  // 2) Bottle (item 1). Bottle neck world (707,342); screen = world - 599 = 108.
  await logicalClick(108, 342);
  text = await waitForPanel('level1.Botl.state=1');
  assert(text.includes('inventory=[4,1]'), `pistol + bottle in inventory, got:\n${text}`);

  // 3) Camera left by ordinary click-to-walk so the hammock is on screen.
  for (let i = 0; i < 5; i++) {
    text = await panel();
    if (scrollOf(text) <= 280) break;
    await logicalClick(60, 470);
    await sleep(1600);
  }
  text = await panel();
  assert(scrollOf(text) <= 280, `camera moved left, got:\n${text}`);

  // 4) Inventory: select the bottle (packed slot 1: 487+60+30 = 577, y 68).
  await logicalClick(740, 580);
  await sleep(300);
  await logicalClick(577, 68);
  await sleep(300);
  await logicalClick(450, 300); // close outside the panel and commit scene selection
  text = await waitForPanel('selected=1');
  assert(text.includes('selected=1'), `bottle selected from inventory, got:\n${text}`);

  // 5) Cut the hammock with the selected bottle.
  const scroll = scrollOf(text);
  const slipScreenX = 303.18 - scroll;
  assert(slipScreenX > 5 && slipScreenX < 790, `Slip clickable, scroll=${scroll}, x=${slipScreenX}`);
  await logicalClick(slipScreenX, 365);
  text = await waitForPanel('Flag1.state=1');
  assert(text.includes('Slip.state=3'), `Slip.state=3, got:\n${text}`);
  assert(text.includes('Lec_v.state=1'), `Lec_v.state=1, got:\n${text}`);
  assert(text.includes('inventory=[4]'), `bottle consumed, pistol remains, got:\n${text}`);
  await screenshot('01-level1-cut.png');

  // 6) Click Lec_v -> Level 38 0.
  const afterCutScroll = scrollOf(text);
  const lecScreenX = 340.84 - afterCutScroll;
  assert(lecScreenX > 5 && lecScreenX < 790, `Lec_v clickable, scroll=${afterCutScroll}, x=${lecScreenX}`);
  await logicalClick(lecScreenX, 301);

  text = await waitForPanel('active=38', 90000);
  assert(text.includes('entry=portal[0]'), `Level38 entered, got:\n${text}`);
  assert(text.includes('inventory=[4]'), `pistol carried into Level38, got:\n${text}`);
  // Hooligan cutscene must finish: Bandit2_Lora Fclick Bandit -> Ublock + State Pank 1.
  text = await waitForPanel('blocked=false', 90000);
  assert(text.includes('Pank=1'), `hooligan cutscene completed, got:\n${text}`);
  await screenshot('02-level38-hooligans.png');

  // 7) Select the pistol (packed slot 0: 487+30 = 517, y 68).
  await logicalClick(740, 580);
  await sleep(300);
  await logicalClick(517, 68);
  await sleep(300);
  await logicalClick(450, 300); // close outside the panel and commit scene selection
  text = await waitForPanel('selected=4');
  assert(text.includes('selected=4'), `pistol selected, got:\n${text}`);

  // 8) Click Pank with the pistol -> Victoti fight -> State Pank 2 / State Lora 1.
  const pank = await objectWorld('Pank');
  assert(pank && pank.width > 0, `Pank rendered before the fight`);
  const pankScroll = scrollOf(text);
  // The animated sprite's geometric center is transparent; use a stable opaque
  // torso pixel within its real hit mask.
  await logicalClick(pank.x - pankScroll + 20, pank.y - 20);
  text = await waitForPanel('Pank=2', 90000);
  assert(text.includes('Lora=1'), `State Lora 1 after the fight, got:\n${text}`);
  assert(text.includes('selected=0'), `selected item cleared after use, got:\n${text}`);
  await screenshot('03-hooligans-fled.png');

  // 9) Click Lora (no item) -> conversation K_talke -> State Lora 2.
  //    This is the assertion that fails before the parser fix.
  const lora = await objectWorld('Lora');
  assert(lora && lora.width > 0, `Lora rendered before the conversation`);
  const loraScroll = scrollOf(text);
  await logicalClick(lora.x - loraScroll, lora.y);
  text = await waitForPanel('Lora=2', 90000);
  assert(text.includes('Lora=2'), `Lora conversation started (State Lora 2), got:\n${text}`);
  const persistentState = await evaluate(`(() => { const save=window.__sccDebug.session.capturePersistentState();
    const scene=save.scenes.find((item)=>item.id===38);
    return {inventory:save.inventory, scene:{initialized:scene?.initialized,
      lora:scene?.objects.find((item)=>item.name==='Lora'), pank:scene?.objects.find((item)=>item.name==='Pank')}}; })()`);
  assert(persistentState.scene.initialized, `Level38 initialized in snapshot: ${JSON.stringify(persistentState)}`);
  assert(persistentState.scene.lora?.state===2 && persistentState.scene.lora.cursorId===7,
    `Lora State/cursor persisted: ${JSON.stringify(persistentState.scene.lora)}`);
  assert(persistentState.inventory.includes(4), `inventory persisted through Lora conversation: ${JSON.stringify(persistentState.inventory)}`);
  await screenshot('04-lora-conversation.png');

  console.log('\nFINAL DEBUG PANEL\n' + text);
  console.log('\nPERSISTENT SNAPSHOT\n' + JSON.stringify(persistentState));
  console.log('\nE2E LORA CONVERSATION PASSED');
} finally {
  socket.close();
}
