#!/usr/bin/env node
/** Real SCC State creation, strict restore, and optional unmodified user-save imports. */
import { resources } from './lib/e2e-resources.mjs';
import { skipStartupVideo } from './e2e-video-helpers.mjs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const cdp = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const url = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=scenes';
const saveFiles = JSON.parse(process.env.E2E_SAVE_FILES ?? '[]');
if (!Array.isArray(saveFiles) || saveFiles.some(file => typeof file !== 'string')) throw new Error('E2E_SAVE_FILES must be a JSON array of paths');
const targets = await (await fetch(`${cdp}/json`)).json();
const page = targets.find(target => target.type === 'page');
if (!page) throw new Error(`No page target at ${cdp}`);
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
});
function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(description, predicate, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(100);
  }
  const state = await evaluate(`({
    level: window.__sccDebug?.view()?.definition.id,
    restoring: window.__sccDebug?.session.isRestoring,
    status: document.querySelector('.sl-message,.sl-error')?.textContent,
    overlayHidden: document.querySelector('.save-load-overlay')?.hidden,
  })`);
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(state)}`);
}
function assert(ok, message) { if (!ok) throw new Error(message); }
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  await skipStartupVideo(send,evaluate);
  await waitFor('initial session', () => evaluate('window.__saveLoadDebug?.canSave().ok'));
  await evaluate("window.__sccDebug.session.request(24, -1, 'debug')");
  await waitFor('Level24 ready', () => evaluate('window.__sccDebug.view()?.definition.id === 24 && window.__saveLoadDebug.canSave().ok'));
  // Execute the original Ball Program, including Goto, StartW and State. No
  // injected state objects, patched SCC, skipped waits or mocked restore view.
  assert(await evaluate("window.__sccDebug.view().scc.click('Ball')"), 'original Ball handler must run');
  await waitFor('State-created object and safe export', () => evaluate("window.__sccDebug.session.loader.readState(24, 'Intarface') === 1 && window.__saveLoadDebug.canSave().ok"));
  const saved = await evaluate(`(async () => {
    const { SaveCodec } = await import('/src/scene/save-codec.ts');
    const exported = window.__saveLoadDebug.exportSave('State-created identity');
    if (!exported.ok) return exported;
    const encoded = SaveCodec.encode(exported.value);
    return encoded.ok ? SaveCodec.decode(encoded.value) : encoded;
  })()`);
  assert(saved.ok, `export/codec roundtrip failed: ${JSON.stringify(saved)}`);
  const imported = await evaluate(`window.__saveLoadDebug.importSave(${JSON.stringify(saved.value)})`);
  assert(imported.ok, `restore of real State-created object failed: ${JSON.stringify(imported)}`);
  assert(await evaluate("window.__sccDebug.session.loader.readState(24, 'Intarface') === 1"), 'dynamic State must survive restore');

  for (const kind of ['Object', 'Active', 'Light', undefined]) {
    const forged = structuredClone(saved.value);
    forged.world.scenes.find(scene => scene.id === 24).objects.push({
      name: 'ForeignSaveIdentity', ...(kind ? { kind } : {}), state: 1, depth: 0, image: { kind: 'unassigned' },
    });
    const result = await evaluate(`(async () => {
      const session = window.__sccDebug.session;
      const view = session.view, loader = session.loader;
      const result = await session.importSave(${JSON.stringify(forged)});
      return { result, unchanged: session.view === view && session.loader === loader };
    })()`);
    assert(!result.result.ok && result.result.error.code === 'IncompatibleSave' && result.unchanged,
      `foreign ${kind ?? 'default Object'} identity must be rejected atomically: ${JSON.stringify(result)}`);
  }
  console.log('State identity E2E: original SCC execution -> export -> codec -> real restore passed; foreign identities rejected.');

  // Caller-owned inputs: read and import in place; never copy, repair or rewrite.
  for (const file of saveFiles) {
    console.log(`Importing caller-owned save: ${file}`);
    const before = await readFile(file);
    const expected = JSON.parse(JSON.parse(before.toString('utf8')).payload);
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'F3', code: 'F3', windowsVirtualKeyCode: 114 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'F3', code: 'F3', windowsVirtualKeyCode: 114 });
    await waitFor('Load menu', () => evaluate("document.querySelector('.save-load-overlay')?.hidden === false"));
    const tree = await send('DOM.getDocument');
    const input = await send('DOM.querySelector', { nodeId: tree.root.nodeId, selector: 'input[type="file"]' });
    await send('DOM.setFileInputFiles', { files: [path.resolve(file)], nodeId: input.nodeId });
    await waitFor('file preview', () => evaluate("Boolean(document.querySelector('.sl-file-preview'))"));
    assert(await evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find(button => button.textContent === 'Загрузить этот файл');
      if (!button || button.disabled) return false;
      button.click(); return true;
    })()`), 'file import confirmation must be enabled');
    await waitFor('successful file restore', async () => {
      const status = await evaluate(`({
        error: document.querySelector('.sl-error')?.textContent,
        loaded: document.querySelector('.save-load-overlay').hidden && document.querySelector('.save-load-toast')?.textContent === 'Игра загружена',
      })`);
      if (status.error) throw new Error(`File restore failed: ${status.error}`);
      return status.loaded;
    }, 180000);
    const actual = await evaluate(`(() => {
      const session = window.__sccDebug.session;
      return { level: session.view.definition.id, inventory: [...session.loader.inventory], dynamic: session.loader.readState(24, 'Intarface') };
    })()`);
    assert(actual.level === expected.world.activeLevel && JSON.stringify(actual.inventory) === JSON.stringify(expected.world.inventory) && actual.dynamic === 1,
      `user save restored wrong state: ${JSON.stringify(actual)}`);
    assert(digest(await readFile(file)) === digest(before), 'source save bytes must be unchanged');
    console.log(`USER_SAVE_PASS ${JSON.stringify({ file, sha256: digest(before), ...actual })}`);
  }
} finally {
  await resources.cleanup();
}
