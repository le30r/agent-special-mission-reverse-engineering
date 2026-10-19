#!/usr/bin/env node
/**
 * Chromium E2E: collect the original Level1 crowbar and Level38 knife, combine
 * them through the inventory UI, and use item 39 on Lora's door.
 *
 * Only read-only debug handles are used for scene diagnostics/coordinates.
 * Inventory, SCC, selection, object interaction and scene changes all happen
 * through real canvas input and the original game resources.
 *
 * Usage:
 *   E2E_CDP=http://127.0.0.1:9222 E2E_URL='http://127.0.0.1:4173/?debug=scenes' \
 *     node scripts/e2e-browser-inventory-combination.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installE2EAudioPolicy } from './e2e-audio-policy.mjs';

const cdpEndpoint = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const startUrl = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=scenes';
const screenshotDir = process.env.E2E_SCREENSHOT_DIR ?? path.join('research', 'inventory', 'evidence', 'browser-combination');
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
async function objectWorld(name) {
  return await evaluate(`(() => {
    const view = window.__sccDebug?.view?.();
    const object = view?.objectDebug(${JSON.stringify(name)});
    return object ? { x: object.x, y: object.y, width: object.width, height: object.height } : null;
  })()`);
}
async function objectHitPoint(name) {
  return await evaluate(`(() => {
    const view = window.__sccDebug?.view?.();
    const object = view?.objects?.get(${JSON.stringify(name)});
    const pixels = object?.hitPixels;
    if (!object || !pixels) return null;
    const ordered = [...view.objects.values()].sort((a, b) => Math.abs(a.depth) - Math.abs(b.depth) || a.order - b.order);
    const targetIndex = ordered.indexOf(object);
    let best;
    let fallback;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let y = 2; y < object.height - 2; y++) for (let x = 2; x < object.width - 2; x++) {
      if (!pixels[(y * object.width + x) * 4 + 3]) continue;
      // Choose a stable interior point, not the animated silhouette edge.
      let solid = true;
      for (let dy = -2; dy <= 2 && solid; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!pixels[((y + dy) * object.width + x + dx) * 4 + 3]) { solid = false; break; }
      }
      // The browser maps coordinates through floor(), so use the pixel's
      // interior rather than its half-pixel boundary after coordinate scaling.
      const worldX = object.sprite.x - object.width / 2 + x + 1;
      const worldY = object.sprite.y - object.height / 2 + y + 1;
      const activeOccludes = [...view.definition.active.keys()].some((activeName) => {
        const rect = view.definition.active.get(activeName)?.rect;
        return rect && view.activeVisible(activeName) && worldX > rect.left && worldX < rect.right && worldY > rect.top && worldY < rect.bottom;
      });
      if (activeOccludes) continue;
      let occluded = false;
      for (let i = 0; i < targetIndex; i++) {
        const candidate = ordered[i];
        if (!candidate.sprite.visible || candidate.removed || Math.abs(candidate.depth) === 0 || !candidate.hitPixels) continue;
        const ix = Math.floor(worldX - (candidate.sprite.x - candidate.width / 2));
        const iy = Math.floor(worldY - (candidate.sprite.y - candidate.height / 2));
        if (ix >= 0 && iy >= 0 && ix < candidate.width && iy < candidate.height && candidate.hitPixels[(iy * candidate.width + ix) * 4 + 3]) {
          occluded = true;
          break;
        }
      }
      const distance = (x - object.width / 2) ** 2 + (y - object.height / 2) ** 2;
      if (!occluded) {
        fallback ??= { x: worldX, y: worldY };
        if (solid && distance < bestDistance) {
          best = { x: worldX, y: worldY };
          bestDistance = distance;
        }
      }
    }
    return best ?? fallback ?? null;
  })()`);
}
async function clickObject(name, scenePanelText) {
  const point = await objectHitPoint(name);
  assert(point, `${name} has a visible pixel hit target`);
  await logicalClick(point.x - scrollOf(scenePanelText), point.y);
}
function scrollOf(text) { return Number(/scroll=(\d+)/.exec(text)?.[1] ?? NaN); }
function assert(condition, message) { if (!condition) throw new Error(`Assertion failed: ${message}`); }

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

  // Level1: collect pistol (4), bottle (1), and crowbar (2) through SCC clicks.
  await logicalClick(506, 569);
  text = await waitForPanel('inventory=[4]');
  await logicalClick(108, 342);
  text = await waitForPanel('inventory=[4,1]');
  const car = await objectWorld('Car_click');
  assert(car && car.width > 0, 'Car_click is present in the original Level1 scene');
  for (let i = 0; i < 6 && (car.x - scrollOf(text) > 790 || car.x - scrollOf(text) < 5); i++) {
    await logicalClick(700, 480); // real click-to-walk camera adjustment on open ground
    await sleep(1600);
    text = await panel();
  }
  // Car and Car_click overlap; resolve a valid Car_click pixel, then use real input.
  const carHit = await objectHitPoint('Car_click');
  assert(carHit, 'Car_click has a visible pixel hit target');
  const carScreenX = carHit.x - scrollOf(text);
  const carScreenY = carHit.y;
  assert(carScreenX > 5 && carScreenX < 790, `Car_click is on screen at x=${carScreenX}`);
  await logicalClick(carScreenX, carScreenY);
  text = await waitForPanel('inventory=[4,1,2]', 90000);
  assert(text.includes('inventory=[4,1,2]'), `crowbar obtained from Car_click, got:\n${text}`);

  // Use bottle on hammock to enter Level38 naturally.
  for (let i = 0; i < 6 && scrollOf(text) > 280; i++) {
    await logicalClick(60, 470);
    await sleep(1600);
    text = await panel();
  }
  await logicalClick(740, 580);
  await logicalClick(577, 68);
  await logicalClick(450, 300); // close by clicking outside the left panel edge
  text = await waitForPanel('selected=1');
  const hammockScroll = scrollOf(text);
  const slipX = 303.18 - hammockScroll;
  assert(slipX > 5 && slipX < 790, `hammock is on screen at x=${slipX}`);
  await logicalClick(slipX, 365);
  text = await waitForPanel('Flag1.state=1', 90000);
  assert(text.includes('inventory=[4,2]'), `bottle consumed and crowbar retained, got:\n${text}`);
  await screenshot('01-level1-crowbar-hammock.png');
  const lecX = 340.84 - scrollOf(text);
  await logicalClick(lecX, 301);
  text = await waitForPanel('active=38', 90000);
  await waitForPanel('blocked=false', 90000);

  // Level38: pistol drives off the hooligans; talk to Lora; take the knife.
  await logicalClick(740, 580);
  await logicalClick(517, 68);
  await logicalClick(450, 300);
  text = await waitForPanel('selected=4');
  const pank = await objectWorld('Pank');
  assert(pank && pank.width > 0, 'Pank is rendered before the fight');
  await clickObject('Pank', text);
  text = await waitForPanel('Pank=2', 90000);
  text = await waitForPanel('Lora=1', 90000);
  const lora = await objectWorld('Lora');
  assert(lora && lora.width > 0, 'Lora is rendered before conversation');
  await clickObject('Lora', text);
  text = await waitForPanel('Lora=2', 90000);
  const knife = await objectWorld('Nozhik');
  assert(knife && knife.width > 0, 'Nozhik is rendered after Lora conversation');
  await clickObject('Nozhik', text);
  text = await waitForPanel('inventory=[4,2,5]', 90000);
  assert(text.includes('Nozhik=1'), `knife pickup completed, got:\n${text}`);
  await screenshot('02-level38-knife-collected.png');

  // The panel remains open across both selections; no test code writes game state.
  await logicalClick(740, 580);
  await logicalClick(637, 68); // knife is packed slot 2
  text = await panel();
  assert(text.includes('inventory=[4,2,5]') && text.includes('selected=0'), `first choice is pending in the open panel:\n${text}`);
  await screenshot('03-inventory-first-choice.png');
  await logicalClick(577, 68); // crowbar is packed slot 1, clicked + pending = 2*1000+5
  text = await waitForPanel('inventory=[4,39]');
  assert(text.includes('inventory=[4,39]'), `ingredients removed and item 39 added:\n${text}`);
  await screenshot('04-inventory-combined-item-39.png');

  // The original SCC route requires Lamp_t=1 before Door accepts item 39.
  // Establish that native prerequisite through normal clicks: use 39 on
  // Goto_3/Pank, visit Level44, take item 7, return, and use 7 on Lamp_t.
  // This follows original resources and never writes runtime state directly.
  await logicalClick(450, 300);
  text = await panel();
  for (let i = 0; i < 6 && scrollOf(text) > 5; i++) {
    await logicalClick(60, 470);
    await sleep(1600);
    text = await panel();
  }
  assert(scrollOf(text) <= 5, `Goto_3 camera position reached by normal walking, scroll=${scrollOf(text)}`);
  await logicalClick(740, 580);
  await logicalClick(577, 68);
  await logicalClick(450, 300);
  text = await waitForPanel('selected=39');
  await clickObject('Goto_3', text);
  text = await waitForPanel('Pank=3', 90000);
  assert(text.includes('inventory=[4,39]'), `native Goto_3/Pank step preserves item 39, got:\n${text}`);
  await screenshot('05-goto3-pank-opened.png');

  // Goto_44 is a native Active region (650..995, 45..200), not a debug control.
  const goto44X = Math.min(720, Math.max(20, 820 - scrollOf(text)));
  await logicalClick(goto44X, 120);
  text = await waitForPanel('active=44', 90000);
  text = await waitForPanel('Lampochka=1', 90000);
  // Arrival starts Level44's blocking Init animation; wait for its StartW owner
  // to release busy before issuing the real pickup click.
  text = await waitForPanel('scc.busy=false', 90000);
  await clickObject('Lampochka', text);
  text = await waitForPanel('inventory=[4,39,7]', 90000);
  await screenshot('06-level44-lamp-item-7.png');

  // Level1's real hammock interaction set Lstate To_38=1. Use that return link.
  const to38 = await evaluate(`(() => {
    const view = window.__sccDebug?.view?.();
    const active = view?.definition?.active?.get('To_38');
    return {
      state: view?.state?.objects?.get('To_38')?.state ?? null,
      visible: view?.activeVisible?.('To_38') ?? false,
      scroll: view?.status?.().scroll ?? null,
      rect: active?.rect ?? null,
    };
  })()`);
  await screenshot('07-level44-to38-state-1-hidden.png');
  assert(to38?.state === 1 && to38.visible && to38.rect, `original Level44 return link is ready from the earlier hammock route: ${JSON.stringify(to38)}`);
  await logicalClick((to38.rect.left + to38.rect.right) / 2 - to38.scroll, (to38.rect.top + to38.rect.bottom) / 2);
  text = await waitForPanel('active=38', 90000);
  assert(text.includes('Pank=3'), `Level38 puzzle state survived the original Level44 return:\n${text}`);
  await screenshot('07-level38-returned-with-lamp.png');

  // Returning to Level38 replays its entry StartW; wait for K_slip before the
  // later real item-on-Lamp_t click so the busy input gate does not swallow it.
  text = await waitForPanel('scc.busy=false', 90000);
  await logicalClick(740, 580);
  await logicalClick(637, 68); // item 7 is packed slot 2 after [4,39,7]
  await logicalClick(450, 300);
  text = await waitForPanel('selected=7');
  await clickObject('Lamp_t', text);
  text = await waitForPanel('Lamp_t=1', 90000);
  assert(text.includes('inventory=[4,39]'), `Lamp_t prerequisite used item 7 and retained item 39:\n${text}`);
  await screenshot('08-lamp-lit-with-item-7.png');

  // Select item 39 for Door only after establishing the original Lamp_t gate.
  await logicalClick(740, 580);
  await logicalClick(577, 68); // item 39 is packed slot 1 after item 7 is consumed
  await logicalClick(450, 300);
  text = await waitForPanel('selected=39');
  await screenshot('09-item-39-selected-for-door.png');

  // Apply the item to Door through the real hit-test and SCC handler.
  const door = await objectWorld('Door');
  assert(door && door.width > 0, 'Lora door is rendered');
  await clickObject('Door', text);
  await sleep(1000);
  const lampState = await evaluate("window.__sccDebug?.view?.()?.state?.objects?.get('Lamp_t')?.state ?? -1");
  const doorAnimation = await evaluate("(window.__sccDebug?.view?.()?.animationReport?.(1000) ?? '').includes('animationName=K_mont')");
  await screenshot(doorAnimation ? '10-door-k_mont.png' : '10-door-attempt.png');
  assert(doorAnimation, `Click 39 Door did not dispatch K_mont after native Lamp_t prerequisite; observed Lamp_t=${lampState}.`);
  text = await waitForPanel('active=3', 90000);
  assert(text.includes('inventory=[4,5]'), `Door handler consumed 39 and continued with Addtol 5:\n${text}`);
  assert(text.includes('transitions=[') && text.includes('38:0>3:-1:SCC'), `expected Level 3 transition, got:\n${text}`);
  await screenshot('11-level3-continuation.png');

  console.log('\nFINAL DEBUG PANEL\n' + text);
  console.log('\nE2E INVENTORY COMBINATION PASSED');
} finally {
  socket.close();
}
