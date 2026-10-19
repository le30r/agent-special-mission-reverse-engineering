#!/usr/bin/env node
/** Starts an isolated Vite + headless Chromium pair, then runs every Chromium E2E. */
import { spawn } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = Number(process.env.E2E_DEV_PORT ?? 5197);
const cdpPort = Number(process.env.E2E_CDP_PORT ?? 9397);
const baseUrl = `http://127.0.0.1:${port}/?debug=scenes`;
const children = [];
let chromeChild;
function start(command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
  children.push(child);
  return child;
}
async function waitFor(url, name) {
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    try { const response = await fetch(url); if (response.ok) return await response.json().catch(() => true); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${name} did not become ready`);
}
function runE2e(script, pageUrl) {
  return new Promise((resolve, reject) => {
    const child = start(process.execPath, [path.join(root, 'scripts', script)], {
      env: { ...process.env, E2E_CDP: `http://127.0.0.1:${cdpPort}`, E2E_URL: pageUrl },
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)));
  });
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 5000))]);
}

try {
  const prepare = start('pnpm', ['prepare:assets']);
  const prepareCode = await new Promise((resolve, reject) => {
    prepare.once('error', reject);
    prepare.once('exit', resolve);
  });
  const prepareIndex = children.indexOf(prepare);
  if (prepareIndex >= 0) children.splice(prepareIndex, 1);
  if (prepareCode !== 0) throw new Error(`pnpm prepare:assets exited ${prepareCode}`);
  start(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', String(port), '--strictPort']);
  await waitFor(`${baseUrl}`, 'Vite');
  const suite = [
    'e2e-browser-transition.mjs',
    'e2e-browser-level1-interactions.mjs',
    'e2e-level39-columns.mjs',
    'e2e-browser-scene38.mjs',
    'e2e-browser-level39-transitions.mjs',
    'e2e-browser-catalog.mjs',
    'e2e-browser-wav-runtime.mjs',
    'e2e-browser-scc-restored.mjs',
    'e2e-browser-fault.mjs',
  ];
  const startAt = process.argv[2] ?? process.env.E2E_SUITE_FROM;
  const standalone = new Set(['e2e-browser-lora.mjs', 'e2e-browser-inventory-combination.mjs', 'e2e-browser-level21-ladder.mjs', 'e2e-browser-save-load.mjs', 'e2e-browser-save-load-ui.mjs']);
  const from = startAt ? suite.indexOf(startAt) : 0;
  if (startAt && from < 0 && !standalone.has(startAt)) throw new Error(`Unknown E2E suite start: ${startAt}`);
  const scripts = startAt && from < 0 ? [startAt] : suite.slice(from);
  for (const script of scripts) {
    console.log(`\n===== Chromium E2E: ${script} =====`);
    const profile = await mkdtemp(path.join(os.tmpdir(), 'agent-revers-chromium-'));
    chromeChild = start(chrome, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required',
      `--remote-debugging-port=${cdpPort}`, '--remote-allow-origins=*', `--user-data-dir=${profile}`, 'about:blank',
    ], { stdio: 'ignore' });
    await waitFor(`http://127.0.0.1:${cdpPort}/json/version`, 'Chromium CDP');
    const pageUrl = script === 'e2e-level39-columns.mjs' ? `http://127.0.0.1:${port}/?debug=depth` : baseUrl;
    await runE2e(script, pageUrl);
    const finishedChrome = chromeChild;
    await stop(finishedChrome);
    chromeChild = undefined;
    const chromeIndex = children.indexOf(finishedChrome);
    if (chromeIndex >= 0) children.splice(chromeIndex, 1);
  }
  console.log(`\nAll ${scripts.length} Chromium E2E scripts passed.`);
} finally {
  await stop(chromeChild);
  for (const child of children.reverse()) if (child.exitCode === null) child.kill('SIGTERM');
}
