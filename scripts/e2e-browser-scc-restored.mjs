#!/usr/bin/env node
import { resources } from './lib/e2e-resources.mjs';
/** Real Chromium integration checks for SCC stateScene, Fclick/Block and Setmsk. */
import { installE2EAudioPolicy } from './e2e-audio-policy.mjs';

const endpoint = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const url = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=scenes';
const targets = await (await fetch(`${endpoint}/json`)).json();
const page = targets.find((target) => target.type === 'page' && target.url.includes('127.0.0.1')) ?? targets.find((target) => target.type === 'page');
if (!page) throw new Error(`No page target at ${endpoint}`);
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
});
function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? 'Runtime.evaluate failed');
  return response.result.value;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function panel() { return await evaluate("document.querySelector('.scene-debug')?.textContent ?? ''"); }
async function waitFor(label, predicate, timeout = 45000) {
  const until = Date.now() + timeout;
  let latest;
  while (Date.now() < until) {
    latest = await predicate();
    if (latest) return latest;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}. Last value: ${String(latest)}`);
}
function assert(value, message) { if (!value) throw new Error(`Assertion failed: ${message}`); }
async function enter(scene) {
  await evaluate(`document.getElementById('debug-scene-${scene}').click()`);
  return await waitFor(`Level${scene}`, async () => {
    const text = await panel();
    return text.includes(`active=${scene}`) ? text : false;
  }, 60000);
}
async function rect() {
  return await evaluate(`(() => { const r=document.querySelector('canvas')?.getBoundingClientRect(); return r && {left:r.left,top:r.top,width:r.width,height:r.height}; })()`);
}
async function click(x, y) {
  const r = await rect();
  const px = r.left + x * r.width / 800, py = r.top + y * r.height / 600;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: px, y: py, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: px, y: py, button: 'left', buttons: 0, clickCount: 1 });
}

try {
  await send('Page.enable');
  await installE2EAudioPolicy(send); // Gain-zero output, live Web Audio sources and real `ended` events.
  await send('Runtime.enable');
  await send('Page.navigate', { url });
  await sleep(1500);
  console.log('Browser bootstrap:', await evaluate("location.href + ' · ' + document.body.innerText.slice(0,500)"));
  await waitFor('47-scene catalog', async () => {
    const text = await panel();
    return text.includes('active=1') && text.includes('catalog=47 loadable=47') ? text : false;
  });

  // Level10: real Start program installs Fclick, blocks, and leaves ordinary clicks
  // routed to Plane. Natural K_bandit completion runs Name and the receiver unblocks.
  let text = await enter(10);
  const initial10 = await evaluate(`(() => {
    const d=window.__sccDebug, s=d.session.loader.state(10), v=d.view();
    s.objects.get('Band_a').state=1;
    v.dispatchStart();
    return {blocked:v.blocked, active:v.player.isActive('K_bandit'), position:[...v.heroPosition]};
  })()`);
  assert(initial10.blocked && initial10.active, `Level10 starts K_bandit blocked: ${JSON.stringify(initial10)}`);
  await click(790, 590);
  const afterBlockedClick = await evaluate(`(() => {
    const v=window.__sccDebug.view();
    return {blocked:v.blocked, active:v.player.isActive('K_bandit'), position:[...v.heroPosition]};
  })()`);
  assert(afterBlockedClick.blocked && afterBlockedClick.active, 'blocked click must not walk, cancel K_bandit or clear Block');
  text = await waitFor('Level10 Name callback and downstream SCC completion', async () => {
    const state = await evaluate(`(() => { const v=window.__sccDebug.view(); return {blocked:v.blocked, band:v.state.objects.get('Band_a')?.state, active:v.player.isActive('K_band_talke'), busy:v.scc.busy}; })()`);
    return !state.blocked && state.band === 0 && !state.busy ? state : false;
  }, 45000);
  console.log('Level10 Fclick/Block:', JSON.stringify(text));

  // Level12: two real Click events select Goto branches from Level10's remote
  // Plocat_l_v state despite an intentionally contradictory local value.
  await enter(12);
  const remoteRoutes = await evaluate(`(() => {
    const d=window.__sccDebug, v=d.view(), remote=d.session.loader.state(10), local=d.session.loader.state(12);
    remote.objects.get('Plocat_l_v').state=0;
    v.scc.click('Smoker',0);
    const a=v.movement?.route.target;
    remote.objects.get('Plocat_l_v').state=1;
    v.scc.click('Smoker',0);
    const b=v.movement?.route.target;
    return {a,b,createdScene:d.session.loader.states.has(10),local:local.objects.get('Plocat_l_v')?.state,remote:remote.objects.get('Plocat_l_v')?.state};
  })()`);
  assert(remoteRoutes.a && remoteRoutes.b && String(remoteRoutes.a) !== String(remoteRoutes.b), `Level12 remote state changes the selected Case/route: ${JSON.stringify(remoteRoutes)}`);
  console.log('Level12 stateScene routes:', JSON.stringify(remoteRoutes));

  // Level16: switch to alternate mask, run both actual SCC Gotos, then restore
  // the entry mask without moving/teleporting on the swap itself.
  await enter(16);
  const level16Start = await evaluate(`(() => {
    const d=window.__sccDebug, v=d.view();
    d.session.loader.state(16).objects.get('Boy').state=1;
    const before=[...v.heroPosition];
    v.dispatchStart();
    return {before, mask:v.activeMaskPath, blocked:v.blocked, moved:[...v.heroPosition]};
  })()`);
  assert(level16Start.mask.endsWith('scn_16_m.tif') && level16Start.blocked, `Level16 selected alternate mask and Block: ${JSON.stringify(level16Start)}`);
  assert(String(level16Start.before) === String(level16Start.moved), 'Setmsk must not teleport the hero');
  const moved = await waitFor('Level16 movement under alternate mask', async () => {
    const value = await evaluate(`(() => { const v=window.__sccDebug.view(); return [...v.heroPosition]; })()`);
    return String(value) !== String(level16Start.before) ? value : false;
  }, 10000);
  text = await waitFor('Level16 restored mask and completed Boy program', async () => {
    const state = await evaluate(`(() => { const v=window.__sccDebug.view(); return {mask:v.activeMaskPath,blocked:v.blocked,boy:v.state.objects.get('Boy')?.state}; })()`);
    return state.mask.endsWith('scn_16.tif') && !state.blocked && state.boy === 0 ? state : false;
  }, 45000);
  console.log('Level16 real route:', JSON.stringify({ before: level16Start.before, moved, restored: text }));

  // Level38: genuine Web Audio WAV range is a barrier. Fclick must wait for the
  // actual source completion before dispatching Bandit and running its receiver.
  await enter(38);
  await evaluate(`(() => { const d=window.__sccDebug; d.session.loader.state(38).objects.get('Pank').state=0; d.view().dispatchStart(); })()`);
  const barrier = await waitFor('Bandit2_Lora WAV barrier', async () => await evaluate(`(() => {
    const v=window.__sccDebug.view();
    return v.activeBarriers.has('Bandit2_Lora') && v.blocked && v.state.objects.get('Pank')?.state===0;
  })()`), 30000);
  assert(barrier, 'Level38 remains blocked at the real Bandit2_Lora WAV range');
  text = await waitFor('Level38 Bandit completion event', async () => await evaluate(`(() => {
    const v=window.__sccDebug.view();
    return !v.blocked && v.state.objects.get('Pank')?.state===1 && v.player.isActive('Bandit2_c');
  })()`), 45000);
  assert(text, 'Bandit event must Ublock, set Pank=1 and start Bandit2_c');
  console.log('Level38 WAV-gated Fclick:', JSON.stringify(text));

  console.log('\nE2E RESTORED SCC GROUP PASSED');
} finally {
  socket.close();
}
