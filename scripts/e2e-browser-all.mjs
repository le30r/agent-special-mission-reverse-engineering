#!/usr/bin/env node
/** Starts an isolated Vite + headless Chromium pair, then runs every Chromium E2E. */
import { resources } from './lib/e2e-resources.mjs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let port = Number(process.env.E2E_DEV_PORT ?? 0);
let cdpPort = Number(process.env.E2E_CDP_PORT ?? 0);
let baseUrl;
let chromeChild;
let activeProfile;
function start(command, args, options = {}) {
  const child = resources.spawn(command, args, { cwd: root, stdio: 'inherit', ...options });
  return child;
}
async function waitFor(url, name) {
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    try { const response = await fetch(url, { signal: AbortSignal.timeout(2000) }); if (response.ok) return await response.json().catch(() => true); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${name} did not become ready`);
}
function runE2e(script, pageUrl, artifacts) {
  return new Promise((resolve, reject) => {
    const child = start(process.execPath, [path.join(root, 'scripts', script)], {
      env: { ...process.env, E2E_CDP: `http://127.0.0.1:${cdpPort}`, E2E_URL: pageUrl, E2E_TEMP_PARENT: artifacts,
        ...(script === 'e2e-browser-save-load-performance.mjs' && process.argv.slice(3).includes('--level29') ? { SAVE_FILES: '/Users/le30r/Downloads/agent-save-level29-2026-10-19.json' } : {}),
        E2E_OUTPUT_DIR: process.env.E2E_OUTPUT_DIR ?? path.join(artifacts, 'output'),
        E2E_SCREENSHOT_DIR: process.env.E2E_SCREENSHOT_DIR ?? path.join(artifacts, 'screens'),
        E2E_EVIDENCE_DIR: process.env.E2E_EVIDENCE_DIR ?? path.join(artifacts, 'evidence') },
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${script} exited ${code}`)));
  });
}
const stop = child => child ? resources.stop(child) : Promise.resolve();

try {
  const prepare = start('pnpm', ['prepare:assets']);
  const prepareCode = await new Promise((resolve, reject) => {
    prepare.once('error', reject);
    prepare.once('exit', resolve);
  });
  if (prepareCode !== 0) throw new Error(`pnpm prepare:assets exited ${prepareCode}`);
  // Let the OS allocate Vite's port without a reserve/release race between runners.
  const vite = start(process.execPath, ['--input-type=module', '-e', `
    import { createServer } from 'vite';
    const server = await createServer({ server: { host: '127.0.0.1', port: ${port}, strictPort: true } });
    await new Promise((resolve, reject) => {
      server.httpServer.once('error', reject);
      server.httpServer.listen(${port}, '127.0.0.1', resolve);
    });
    console.log('E2E_VITE_PORT=' + server.httpServer.address().port);
  `], { stdio: ['ignore', 'pipe', 'inherit'] });
  port = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Vite startup timeout')), 90000);
    const fail = error => { clearTimeout(timer); reject(error); };
    vite.once('error', fail);
    vite.once('exit', code => fail(new Error(`Vite exited ${code}`)));
    vite.stdout.on('data', data => {
      process.stdout.write(data);
      output += data;
      const match = output.match(/E2E_VITE_PORT=(\d+)/);
      if (match) { clearTimeout(timer); resolve(Number(match[1])); }
    });
  });
  baseUrl = `http://127.0.0.1:${port}/?debug=scenes`;
  await waitFor(`${baseUrl}`, 'Vite');
  const suite = [
    'e2e-browser-transition.mjs',
    'e2e-browser-level3-busy.mjs',
    'e2e-browser-unified-hit.mjs',
    'e2e-browser-hitbox.mjs',
    'e2e-browser-save-load.mjs',
    'e2e-browser-save-load-ui.mjs',
    'e2e-browser-save-state-identities.mjs',
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
  const standalone = new Set(['e2e-browser-lora.mjs', 'e2e-browser-inventory-combination.mjs', 'e2e-browser-level21-ladder.mjs', 'e2e-browser-save-load.mjs', 'e2e-browser-save-load-ui.mjs', 'e2e-browser-save-state-identities.mjs', 'e2e-browser-unified-hit.mjs', 'e2e-browser-hitbox.mjs', 'e2e-browser-level3-busy.mjs', 'e2e-browser-save-load-performance.mjs']);
  const from = startAt ? suite.indexOf(startAt) : 0;
  if (startAt && from < 0 && !standalone.has(startAt)) throw new Error(`Unknown E2E suite start: ${startAt}`);
  const single = process.argv[2] && standalone.has(startAt);
  const scripts = startAt && (from < 0 || single) ? [startAt] : suite.slice(from);
  for (const script of scripts) {
    console.log(`\n===== Chromium E2E: ${script} =====`);
    activeProfile = resources.tempDir('chromium');
    const artifacts = resources.tempDir('artifacts');
    const browserPort = process.env.E2E_CDP_PORT ? cdpPort : 0;
    chromeChild = start(chrome, [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required',
      `--remote-debugging-port=${browserPort}`, '--remote-allow-origins=*', `--user-data-dir=${activeProfile}`, 'about:blank',
    ], { stdio: 'ignore' });
    if (!browserPort) {
      const until = Date.now() + 30000;
      while (true) {
        try { cdpPort = Number((await readFile(path.join(activeProfile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; }
        catch { if (Date.now() > until || chromeChild.exitCode !== null || !chromeChild.pid) throw new Error('Chromium did not start'); await new Promise(resolve => setTimeout(resolve, 100)); }
      }
    }
    await waitFor(`http://127.0.0.1:${cdpPort}/json/version`, 'Chromium CDP');
    const pageUrl = script === 'e2e-level39-columns.mjs' ? `http://127.0.0.1:${port}/?debug=depth` : ['e2e-browser-hitbox.mjs','e2e-browser-unified-hit.mjs'].includes(script) ? `http://127.0.0.1:${port}/?debug=hitbox` : baseUrl;
    await runE2e(script, pageUrl, artifacts);
    const finishedChrome = chromeChild;
    await stop(finishedChrome);
    chromeChild = undefined;
    await resources.remove(activeProfile);
    await resources.remove(artifacts);
    activeProfile = undefined;
  }
  console.log(`\nAll ${scripts.length} Chromium E2E scripts passed.`);
} finally {
  await resources.cleanup();
}
