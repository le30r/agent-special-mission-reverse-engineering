#!/usr/bin/env node
/**
 * Chromium E2E: inventory item-on-item combination (knife + crowbar).
 *
 * Reproduces the reported blocker: the browser inventory closes as soon as the
 * first item is selected, so a second item can never be applied to it. The
 * original engine keeps the panel open and combines two items through the
 * native recipe table (`0x40cb84` mode 2 -> `0x40ec74` -> `FUN_0040eacc`).
 *
 * Test setup (not the mechanism under test) injects knife (item 5) and crowbar
 * (item 2) into the long-lived inventory via `__sccDebug.session.loader.inventory`.
 * The interaction itself is real UI: open the inventory tab, click the knife
 * slot, then click the crowbar slot, and assert the recipe result (item 39).
 *
 * Current behaviour (blocker): clicking the knife sets `selected=5` and closes
 * the panel; the following crowbar click lands on the scene, inventory stays
 * `[5,2]`, and the final `inventory=[39]` assertion fails.
 *
 * Post-fix expectation: the panel stays open after the first selection, the
 * crowbar click combines 5+2 -> 39, and the final assertions pass.
 *
 * Usage:
 *   E2E_CDP=http://127.0.0.1:9222 E2E_URL='http://127.0.0.1:4173/?debug=scenes' \
 *     node scripts/e2e-browser-inventory-combination.mjs
 */
import path from 'node:path';
import { installE2EAudioPolicy } from './e2e-audio-policy.mjs';

const cdpEndpoint = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const startUrl = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=scenes';
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
function assert(condition, message) { if (!condition) throw new Error(`Assertion failed: ${message}`); }

try {
  await send('Page.enable');
  await installE2EAudioPolicy(send);
  await send('Runtime.enable');
  await send('Page.navigate', { url: startUrl });
  await waitFor('initial Level1 panel', async () => {
    const current = await panel();
    return current.includes('active=1') ? current : false;
  });
  await waitForPanel('init=[1:1]');
  await sleep(700);

  // Setup only: place knife (5) and crowbar (2) into the long-lived inventory.
  await evaluate(`(() => {
    const inventory = window.__sccDebug?.session?.loader?.inventory;
    if (!inventory) return 'missing inventory handle';
    inventory.length = 0;
    inventory.push(5, 2);
    return 'ok';
  })()`);
  let text = await waitForPanel('inventory=[5,2]');
  assert(text.includes('inventory=[5,2]'), `knife + crowbar seeded, got:\n${text}`);

  // 1) Open the inventory (bottom tab; original mode 0 -> 2).
  await logicalClick(740, 580);
  await sleep(300);

  // 2) Click the knife (packed slot 0: 487+30, 18+50). Original: SELECT only,
  //    panel stays open. Blocker: panel closes and the knife becomes scene+5.
  await logicalClick(517, 68);
  await sleep(300);
  text = await panel();
  console.log('after knife click:\n' + text);

  // 3) Click the crowbar (packed slot 1: 487+60+30, 18+50). Original: combine
  //    5+2 -> 39, remove both, add result. Blocker: panel already closed, this
  //    click lands on the scene, inventory stays [5,2].
  await logicalClick(577, 68);
  await sleep(300);
  text = await panel();

  // Post-fix expectation (currently fails => reproduces the blocker).
  assert(text.includes('inventory=[39]'), `knife + crowbar combined to item 39, got:\n${text}`);
  assert(text.includes('selected=0'), `no pending scene selection after combine, got:\n${text}`);
  assert(!text.includes('inventory=[5,2]'), `ingredients consumed, got:\n${text}`);

  console.log('\nFINAL DEBUG PANEL\n' + text);
  console.log('\nE2E INVENTORY COMBINATION PASSED');
} finally {
  socket.close();
}
