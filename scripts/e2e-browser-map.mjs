#!/usr/bin/env node
import { resources } from './lib/e2e-resources.mjs';

const cdp = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const url = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=scenes';
const targets = await (await fetch(`${cdp}/json`)).json();
const page = targets.find((target) => target.type === 'page' && target.url.includes('127.0.0.1')) ?? targets.find((target) => target.type === 'page');
if (!page) throw new Error(`No page target at ${cdp}`);
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
  message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
});
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(message.params.type)) {
    console.error(`PAGE ${message.params.type}: ${message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')}`);
  }
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
async function waitFor(description, predicate, timeout = 30000) {
  const until = Date.now() + timeout;
  let last;
  while (Date.now() < until) { last = await predicate(); if (last) return last; await sleep(100); }
  throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(last)}`);
}
function assert(ok, message) { if (!ok) throw new Error(`Assertion failed: ${message}`); }
async function key(key, code, windowsVirtualKeyCode) {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode });
}
async function mouse(x, y, button = 'left') {
  const point = await pointerPoint(x, y);
  const buttons = button === 'left' ? 1 : 2;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button, buttons, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button, buttons: 0, clickCount: 1 });
}
async function pointerPoint(x, y) {
  const rect = await evaluate(`(() => { const r=document.querySelector('canvas').getBoundingClientRect(); return {left:r.left,top:r.top,width:r.width,height:r.height}; })()`);
  const clientX = rect.left + ((x + 0.5) * rect.width) / 800;
  const clientY = rect.top + ((y + 0.5) * rect.height) / 600;
  return { x: clientX, y: clientY };
}
async function movePointer(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...await pointerPoint(x, y) });
}
async function clickSelector(selector, text) {
  const point = await evaluate(`(() => {
    const target=[...document.querySelectorAll(${JSON.stringify(selector)})].find(item=>item.textContent.includes(${JSON.stringify(text)}));
    if(!target)return null;target.scrollIntoView({block:'center'});const r=target.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,disabled:target.disabled};
  })()`);
  assert(point && !point.disabled, `enabled save UI control exists: ${text}`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
}
async function mapState() { return evaluate('window.__mapDebug?.view()'); }
async function openMap() {
  await waitFor('map opening gates become idle', async () => (await mapState())?.canOpen);
  await key('F1', 'F1', 112);
  const until = Date.now() + 30000;
  let last;
  while (Date.now() < until) {
    const state = await mapState();
    if (state?.phase === 'open') return;
    last = await evaluate(`(() => {const s=window.__sccDebug.session,v=s.view;return {
      phase:window.__mapDebug.view().phase,canOpen:window.__mapDebug.view().canOpen,error:window.__mapDebug.view().error,
      canOpen:window.__mapDebug.view().canOpen,error:window.__mapDebug.view().error,
      busy:v.scc.busy,blocked:v.blocked,barrier:v.hasScenarioBarrier,
      loading:s.loading,pending:s.loader.pending,restoring:s.isRestoring,
      inventoryOpen:document.querySelector('.save-load-overlay')?.hidden===false,
      inventory:window.__inventoryDebug?.view(),moving:v.moving,
    }})()`);
    await sleep(100);
  }
  throw new Error(`Timed out waiting for map open: ${JSON.stringify(last)}`);
}
async function captureWorld() {
  return evaluate(`(() => { const s=window.__sccDebug.session, v=s.view; return {
    scene:v.definition.id, position:[...v.heroPosition], moving:v.moving,
    transitions:[...s.transitionLog], init:[...s.initRuns.entries()],
    map:JSON.parse(JSON.stringify(s.loader.game.map)), busy:v.scc.busy, blocked:v.blocked,
  }; })()`);
}

try {
  await send('Page.enable'); await send('Runtime.enable'); await send('Page.navigate', { url });
  await waitFor('idle starting scene and map diagnostics', async () => {
    const state = await mapState();
    return state && (await evaluate('window.__sccDebug?.view()?.definition?.id === 1 && !window.__sccDebug.view().scc.busy'));
  });
  const initial = await captureWorld();
  assert(initial.map.bank === 0 && initial.map.unlocked[0][3] === true && initial.map.unlocked.flat().filter((_, index) => index !== 3).every((flag) => flag === false), 'Level1 SCC Setzon 3 unlocks only direction 3 after New Game reset');
  await mouse(506, 569); // real Level1 Pistol click starts its SCC Program
  await waitFor('SCC busy gate from real scene input', async () => evaluate('window.__sccDebug.view().scc.busy === true'), 8000);
  await key('F1', 'F1', 112);
  assert((await mapState()).phase === 'closed', 'F1 cannot open the map during an active SCC Program');
  await waitFor('SCC pickup completes', async () => evaluate('window.__sccDebug.view().scc.busy === false'), 15000);

  await openMap();
  await mouse(258, 128); // zone 0; remains locked by the initial Level1 SCC
  assert((await mapState()).selected === -1, 'locked zone does not hover');
  await mouse(790, 590); // outside every hit rectangle
  await mouse(258, 128, 'right');
  assert((await mapState()).phase === 'open', 'outside and right clicks do not close the map');
  await key('F2', 'F2', 113); await key('F3', 'F3', 114);
  assert(await evaluate("document.querySelector('.save-load-overlay')?.hidden === true"), 'F2/F3 are consumed while the map is open');
  await key('Escape', 'Escape', 27);
  await waitFor('map closed with Escape', async () => (await mapState())?.phase === 'closed');
  const afterEscape = await captureWorld();
  assert(afterEscape.scene === initial.scene && JSON.stringify(afterEscape.map) === JSON.stringify(initial.map), 'Escape preserves scene and bank/unlock state');
  assert(JSON.stringify(afterEscape.transitions) === JSON.stringify(initial.transitions) && JSON.stringify(afterEscape.init) === JSON.stringify(initial.init), 'close does not transition or replay Init');
  await openMap(); await key('F1', 'F1', 112);
  await waitFor('map closed with F1', async () => (await mapState())?.phase === 'closed');

  // Exercise actual movement first, then prove the map suspends the existing SceneView tick.
  await mouse(700, 480);
  await waitFor('hero starts moving from real canvas input', async () => evaluate('window.__sccDebug.view().moving === true'), 8000);
  const movingPosition = await evaluate('window.__sccDebug.view().heroPosition.slice()');
  await openMap(); await sleep(500);
  const frozenPosition = await evaluate('window.__sccDebug.view().heroPosition.slice()');
  assert(JSON.stringify(frozenPosition) === JSON.stringify(movingPosition), 'hero movement is suspended while the map is open');
  await key('Escape', 'Escape', 27);
  await waitFor('hero resumes after map closes', async () => evaluate('window.__sccDebug.view().moving === false'), 10000);

  // Canonical setup mirrors Setmap/Setzon without calling any MapController method; all map input below is real CDP input.
  await evaluate('window.__sccDebug.session.loader.setMapBank(0); window.__sccDebug.session.loader.unlockMapZone(2)');
  await openMap();
  await movePointer(545, 96);
  const hovered = await mapState();
  assert(hovered.selected === 2, `hover selects the original zone-2 frame: ${JSON.stringify(hovered)}`);
  const beforeCommit = await captureWorld();
  await mouse(545, 96, 'right');
  assert((await mapState()).phase === 'open' && JSON.stringify((await captureWorld()).transitions) === JSON.stringify(beforeCommit.transitions), 'right click never initiates a transition');
  await mouse(545, 96);
  await waitFor('map transition through SceneSession to scene 39 portal 0', async () => evaluate(`(() => {
    const s=window.__sccDebug.session;
    return s.view?.definition.id===39 && s.lastTransition?.scene===39 && s.lastTransition?.portal===0 && s.transitionLog.some(x=>x.endsWith('[map]'));
  })()`), 90000);
  await waitFor('post-transition save boundary', async () => evaluate('window.__saveLoadDebug?.canSave().ok'));
  await key('F2', 'F2', 113);
  await waitFor('save modal opens after leaving map', async () => evaluate("document.querySelector('.save-load-overlay')?.hidden === false"));
  await clickSelector('.sl-slot button', 'Выбрать');
  await evaluate("(()=>{const input=document.querySelector('[aria-label=\"Название сохранения\"]');input.value='Original map roundtrip';input.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await clickSelector('button', 'Сохранить в выбранный слот');
  await waitFor('map state saved in banked-v1 slot', async () => evaluate(`(() => {
    const envelope=JSON.parse(localStorage.getItem('agent-revers.save.v1.slot.0')||'null');
    const save=envelope?.payload?JSON.parse(envelope.payload):null;
    return save?.world?.map?.model==='banked-v1' && save.world.map.bank===0 && save.world.map.unlocked[0][2];
  })()`));
  await key('Escape', 'Escape', 27);
  await waitFor('save modal closes', async () => evaluate("document.querySelector('.save-load-overlay')?.hidden === true"));
  await evaluate('window.__sccDebug.session.loader.setMapBank(1); window.__sccDebug.session.loader.unlockMapZone(6)');
  await key('F3', 'F3', 114);
  await waitFor('load modal opens', async () => evaluate("document.querySelector('.save-load-overlay')?.hidden === false"));
  await clickSelector('.sl-slot button', 'Загрузить');
  await waitFor('banked map save restored via F3 UI', async () => evaluate(`(() => {
    const map=window.__mapDebug?.view();
    return document.querySelector('.save-load-overlay')?.hidden===true && map?.bank===0 && map.unlocked[0][2]===true && map.unlocked[1][6]===false;
  })()`), 90000);
  await openMap(); await movePointer(545, 96);
  assert((await mapState()).selected === 2, 'reopened map reflects the restored unlock matrix');
  await key('Escape', 'Escape', 27);
  console.log('Original Map Chromium E2E passed: F1/Escape lifecycle, locked hitboxes, F2/F3 map gate, frozen world tick, real pointer/keyboard input, hover frame, SceneSession portal 0 transition and banked-v1 UI save/restore.');
} finally {
  socket.close();
  await resources.cleanup();
}
