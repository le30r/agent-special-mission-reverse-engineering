#!/usr/bin/env node
/**
 * Loads every scene discovered by scripts/prepare-assets.mjs through the real
 * browser SceneAssetProvider and records whether the lazy loader can enter it.
 *
 * The debug catalog buttons are only a navigation affordance: every click goes
 * through SceneSession.request -> deferred boundary -> manifest fetch -> SCC/
 * mask/MULT/external image load -> SceneView creation. No scene definition or
 * state is fabricated by this script.
 *
 * Usage:
 *   E2E_CDP=http://127.0.0.1:9222 E2E_URL='http://127.0.0.1:4173/?debug=scenes' \
 *     node scripts/e2e-browser-catalog.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { installE2EAudioPolicy } from './e2e-audio-policy.mjs';

const cdpEndpoint = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const startUrl = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=scenes';
const outputDir = process.env.E2E_OUTPUT_DIR ?? path.join('research', 'transitions', 'evidence', 'scene-catalog');

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
async function panel() { return await evaluate("document.querySelector('.scene-debug')?.textContent ?? ''"); }
async function waitFor(description, predicate, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await sleep(80);
  }
  throw new Error(`Timed out waiting for ${description}. Last value: ${String(last)}`);
}
function assert(condition, message) { if (!condition) throw new Error(`Assertion failed: ${message}`); }
function positionOf(text) { return /pos=\((-?\d+),(-?\d+)\)/.exec(text)?.slice(1).map(Number); }
function scrollOf(text) { return Number(/scroll=(\d+)/.exec(text)?.[1] ?? NaN); }

try {
  await send('Page.enable');
  await installE2EAudioPolicy(send);
  await send('Runtime.enable');
  await send('Page.navigate', { url: startUrl });
  await waitFor('initial Level1 panel', async () => {
    const text = await panel();
    return text.includes('active=1') ? text : false;
  });

  const sceneIds = await evaluate(
    "Array.from(document.querySelectorAll('.scene-controls [data-scene]')).map((element) => Number(element.dataset.scene))",
  );
  assert(Array.isArray(sceneIds) && sceneIds.length > 0, `catalog buttons discovered, got ${JSON.stringify(sceneIds)}`);
  console.log(`Catalog buttons: ${sceneIds.join(',')}`);

  const results = [];
  for (const sceneId of sceneIds) {
    const started = Date.now();
    await evaluate(`document.getElementById('debug-scene-${sceneId}').click()`);
    let text = '';
    try {
      text = await waitFor(`scene ${sceneId}`, async () => {
        const current = await panel();
        if (new RegExp(`\\bactive=${sceneId}\\b`).test(current)) return current;
        if (current.includes(`loadError=${sceneId}:`)) return current;
        return false;
      }, 45000);
    } catch (error) {
      text = await panel();
      results.push({ id: sceneId, ok: false, elapsedMs: Date.now() - started, error: String(error), panel: text });
      console.log(`scene ${sceneId}: FAILED (${error.message})`);
      continue;
    }
    const failed = text.includes(`loadError=${sceneId}:`);
    const active = new RegExp(`\\bactive=${sceneId}\\b`).test(text);
    const entry = /entry=([^ ]+)/.exec(text)?.[1];
    const animations = Number(/animations=(\d+)/.exec(text)?.[1] ?? NaN);
    const layout = /layout=([^ ]+)/.exec(text)?.[1];
    const objects = Number(/objects=(\d+)/.exec(text)?.[1] ?? NaN);
    const loading = /loading=([^ ]+)/.exec(text)?.[1];
    const loadedResources = Number(/resources\.loadedScenes=(\d+)/.exec(text)?.[1] ?? NaN);
    const resourcesOk = Number.isNaN(loadedResources) || loadedResources <= 1;
    results.push({
      id: sceneId,
      ok: active && !failed && resourcesOk,
      elapsedMs: Date.now() - started,
      entry,
      position: positionOf(text),
      scroll: scrollOf(text),
      animations,
      layout,
      objects,
      loading,
      loadedResources,
      panel: text,
    });
    console.log(`scene ${sceneId}: ${active && !failed && resourcesOk ? 'ok' : 'FAILED'} · ${Date.now() - started} ms · entry=${entry} pos=${positionOf(text)} scroll=${scrollOf(text)} animations=${animations} layout=${layout} resources=${loadedResources}`);
    // Let the scene settle one tick so the next request starts from a stable view.
    await sleep(120);
  }

  const loaded = results.filter((result) => result.ok).map((result) => result.id);
  const failed = results.filter((result) => !result.ok).map((result) => ({ id: result.id, error: result.error, loading: result.loading }));
  await mkdir(outputDir, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    url: startUrl,
    total: sceneIds.length,
    loaded,
    failed,
    scenes: results,
  };
  const file = path.join(outputDir, 'browser-scene-catalog.json');
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nLoaded ${loaded.length}/${sceneIds.length} scenes. Report: ${file}`);
  if (failed.length) console.log(`Failed: ${JSON.stringify(failed)}`);
  assert(failed.length === 0, `all discovered scenes must load, failed ${JSON.stringify(failed)}`);
  console.log('\nE2E SCENE CATALOG PASSED');
} finally {
  socket.close();
}
