#!/usr/bin/env node
import { resources } from './lib/e2e-resources.mjs';
/**
 * Real-Chromium regression for the Level39 column painter order.
 *
 * Before the fix, MULT-only `Goto`/`Ygol` records received an invented depth 0
 * and were drawn over the hero near the left column. The original frame updater
 * (0x405064 -> 0x40a8dc) skips records without an SCC object identity.
 *
 * Usage:
 *   E2E_CDP=http://127.0.0.1:9222 E2E_URL='http://127.0.0.1:4173/?debug=depth' \
 *     node scripts/e2e-level39-columns.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installE2EAudioPolicy } from './e2e-audio-policy.mjs';

const cdpEndpoint = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const startUrl = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=depth';
const evidenceDir = process.env.E2E_EVIDENCE_DIR ?? resources.tempDir('artifacts');
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
async function panel() { return await evaluate("document.querySelector('.depth-debug')?.textContent ?? ''"); }
async function canvasRect() {
  return await evaluate(`(() => { const canvas = document.querySelector('canvas'); if (!canvas) return null; const r = canvas.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; })()`);
}
async function clickLogical(x, y) {
  const rect = await waitFor('canvas rect', canvasRect);
  const clientX = rect.left + (x * rect.width) / logicalWidth;
  const clientY = rect.top + (y * rect.height) / logicalHeight;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: clientX, y: clientY });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clientX, y: clientY, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clientX, y: clientY, button: 'left', buttons: 0, clickCount: 1 });
}
async function screenshot(name) {
  await mkdir(evidenceDir, { recursive: true });
  const result = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(evidenceDir, name);
  await writeFile(file, Buffer.from(result.data, 'base64'));
  console.log(`screenshot ${file}`);
}
function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}
function parsePanel(text) {
  const header = /DEPTH DEBUG · scene=(\d+) · scroll=(-?\d+)/.exec(text);
  const hero = /Hero: depth=(-?\d+) abs=(-?\d+) zIndex=(-?\d+) draw#(\d+) logical=\((\d+),(\d+)\).*? · (.+)$/m.exec(text);
  const objects = [];
  for (const line of text.split('\n')) {
    const item = /^\s*(\d+)\s+(\S+)\s+depth=\s*(-?\d+)\s+abs=\s*(-?\d+)\s+z=\s*(-?\d+)\s+(behind hero|in front of hero)\s+·\s+(.+)$/.exec(line);
    if (item) objects.push({
      drawIndex: Number(item[1]), name: item[2], depth: Number(item[3]), absDepth: Number(item[4]),
      zIndex: Number(item[5]), relation: item[6], origin: item[7],
    });
  }
  const skipped = /Skipped MULT-only records[^:]*:\s*(.+)$/m.exec(text)?.[1]?.split(',').map((name) => name.trim()) ?? [];
  return {
    scene: header ? Number(header[1]) : undefined,
    scroll: header ? Number(header[2]) : undefined,
    hero: hero ? {
      depth: Number(hero[1]), absDepth: Number(hero[2]), zIndex: Number(hero[3]),
      drawIndex: Number(hero[4]), x: Number(hero[5]), y: Number(hero[6]), origin: hero[7],
    } : undefined,
    objects,
    skipped,
  };
}
async function stablePanel() {
  let previous = '';
  let stable = 0;
  await waitFor('renderer to settle', async () => {
    const text = await panel();
    stable = text === previous ? stable + 1 : 0;
    previous = text;
    return stable >= 8 ? text : false;
  }, 30000);
  return previous;
}
async function walkTo(worldX, worldY, tolerance = 14) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const snapshot = parsePanel(await panel());
    if (!snapshot.hero) throw new Error('No hero line in depth panel');
    if (Math.hypot(snapshot.hero.x - worldX, snapshot.hero.y - worldY) <= tolerance) return;
    const screenX = worldX - snapshot.scroll;
    if (screenX < 8 || screenX > 792) {
      await clickLogical(Math.max(8, Math.min(792, screenX)), Math.max(60, Math.min(560, worldY)));
    } else {
      await clickLogical(screenX, worldY);
    }
    await sleep(500);
    await stablePanel();
  }
  const snapshot = parsePanel(await panel());
  if (!snapshot.hero || Math.hypot(snapshot.hero.x - worldX, snapshot.hero.y - worldY) > tolerance) {
    throw new Error(`Could not reach world (${worldX},${worldY}); hero=(` +
      `${snapshot.hero?.x},${snapshot.hero?.y})`);
  }
}

try {
  await send('Page.enable');
  await installE2EAudioPolicy(send);
  await send('Runtime.enable');
  await send('Page.navigate', { url: startUrl });
  await waitFor('Level1 depth panel', async () => (await panel()).includes('scene=1') ? await panel() : false);
  await evaluate("document.getElementById('debug-scene-39').click()");
  const entryPanel = await waitFor('Level39 depth panel', async () => (await panel()).includes('scene=39') ? await panel() : false);
  const entry = parsePanel(entryPanel);
  assert(entry.scene === 39, `Level39 active, got ${entry.scene}`);
  assert(entry.hero?.depth === 81, `entry hero depth 81, got ${entry.hero?.depth}`);
  assert(entry.scroll === 352, `entry scroll 352, got ${entry.scroll}`);
  await screenshot('level39-entry-fixed.png');

  // Walk to the exact world position reproduced in the defect: (505,485),
  // in front of the left column of the central monument (`Goto`).
  await walkTo(500, 480);
  const panelText = await stablePanel();
  const snapshot = parsePanel(panelText);
  console.log('\nFINAL DEPTH PANEL\n' + panelText + '\n');
  assert(snapshot.scene === 39, `still in Level39, got ${snapshot.scene}`);
  assert(snapshot.hero && Math.hypot(snapshot.hero.x - 505, snapshot.hero.y - 485) <= 16,
    `hero at the left column, got (${snapshot.hero?.x},${snapshot.hero?.y})`);
  // The native-compatible movement stops before assigning the requested target;
  // the final accepted point varies by a few mask pixels with real ticker cadence.
  assert(snapshot.hero.depth >= 148 && snapshot.hero.depth <= 156, `mask depth near the reproduced position is ~152, got ${snapshot.hero.depth}`);
  assert(snapshot.hero.origin === 'mask(x,y)+Focus', `hero depth origin, got ${snapshot.hero.origin}`);

  const names = snapshot.objects.map((object) => object.name);
  assert(!names.includes('Goto'), `MULT-only Goto must not be drawn, draw order: ${names.join(',')}`);
  assert(!names.includes('Ygol'), `MULT-only Ygol must not be drawn, draw order: ${names.join(',')}`);
  assert(snapshot.skipped.includes('Goto') && snapshot.skipped.includes('Ygol'),
    `skipped list must contain Goto and Ygol, got ${snapshot.skipped.join(',')}`);

  for (const name of ['Col_all', 'Col_vaz', 'Arca_d', 'Cust_go47', 'Vaza', 'Goto_1']) {
    assert(names.includes(name), `declared column ${name} must still be drawn`);
  }
  const byName = Object.fromEntries(snapshot.objects.map((object) => [object.name, object]));
  assert(byName.Col_all.depth === 1000 && byName.Col_all.origin === 'SCC declaration (Level39.scc Object)',
    `Col_all depth/origin, got ${byName.Col_all.depth} ${byName.Col_all.origin}`);
  assert(byName.Col_vaz.depth === 226 && byName.Col_vaz.origin === 'SCC declaration (Level39.scc Object)',
    `Col_vaz depth/origin, got ${byName.Col_vaz.depth} ${byName.Col_vaz.origin}`);
  assert(byName.Arca_d.depth === 10 && byName.Arca_d.origin === 'SCC declaration (Level39.scc Object)',
    `Arca_d depth/origin, got ${byName.Arca_d.depth} ${byName.Arca_d.origin}`);
  assert(byName.Vaza.depth === 128 && byName.Vaza.origin === 'SCC declaration (Level39.scc Object)',
    `Vaza depth/origin, got ${byName.Vaza.depth} ${byName.Vaza.origin}`);
  assert(byName.Mainhero === undefined, 'hero is reported separately, not as an object');
  assert(snapshot.hero.drawIndex > byName.Col_all.drawIndex, 'hero draws after (in front of) Col_all');
  assert(snapshot.hero.drawIndex > byName.Col_vaz.drawIndex, 'hero draws after (in front of) Col_vaz');
  assert(snapshot.hero.drawIndex < byName.Arca_d.drawIndex, 'Arca_d keeps its declared front plane (depth 10)');

  // Clean screenshot: hide the diagnostics overlay but not the game canvas.
  await evaluate("document.querySelectorAll('.depth-debug,.animation-debug,.scene-controls,.hud').forEach((element) => { element.dataset.hiddenByProbe = '1'; element.style.display = 'none'; })");
  await screenshot('level39-left-column-fixed.png');
  const rect = await canvasRect();
  const cropped = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: rect.left, y: rect.top, width: rect.width, height: rect.height, scale: 1 },
  });
  await writeFile(path.join(evidenceDir, 'level39-left-column-fixed-canvas.png'), Buffer.from(cropped.data, 'base64'));
  await evaluate("document.querySelectorAll('[data-hidden-by-probe]').forEach((element) => { element.style.display = ''; delete element.dataset.hiddenByProbe; })");

  const evidence = {
    url: startUrl,
    browser: await (await fetch(`${cdpEndpoint}/json/version`)).json(),
    entry,
    leftColumn: snapshot,
    panelText,
    assertions: {
      multOnlyGotoYgolSkipped: true,
      declaredColumnsStillDrawn: true,
      provenanceDeclaration: true,
      heroDepthFromMask: '148..154 (mask 255-pixel at the reproduced point)',
      heroInFrontOfColAllAndColVaz: true,
      arcaDStillFrontDepth10: true,
    },
  };
  await mkdir(evidenceDir, { recursive: true });
  const evidencePath = path.join(evidenceDir, 'level39-column-depth.json');
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  console.log(`evidence ${evidencePath}`);
  console.log('\nE2E PASSED');
} finally {
  socket.close();
}
