#!/usr/bin/env node
import { resources } from './lib/e2e-resources.mjs';
/** Hitbox inspector: real Level3 stool, hover purity, overlap ordering and scroll mapping. */
const cdp = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const url = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=hitbox';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(ok, message) { if (!ok) throw new Error(`Assertion failed: ${message}`); }
async function connect(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let id = 0; const pending = new Map();
  socket.addEventListener('message', ({ data }) => { const m = JSON.parse(data); if (!m.id) return; const p = pending.get(m.id); if (!p) return; pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); });
  return { socket, send(method, params = {}) { const next = ++id; socket.send(JSON.stringify({ id: next, method, params })); return new Promise((resolve, reject) => pending.set(next, { resolve, reject })); } };
}
const browser = await connect((await (await fetch(`${cdp}/json/version`)).json()).webSocketDebuggerUrl);
const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
let target;
for (let i = 0; i < 100; i++) { target = (await (await fetch(`${cdp}/json`)).json()).find((item) => item.id === targetId); if (target?.webSocketDebuggerUrl) break; await sleep(50); }
if (!target?.webSocketDebuggerUrl) throw new Error('Could not create isolated Chromium target');
const page = await connect(target.webSocketDebuggerUrl);
async function evaluate(expression) { const r = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text ?? 'evaluation failed'); return r.result.value; }
async function waitFor(label, predicate, timeout = 45000) { const end = Date.now() + timeout; let last; while (Date.now() < end) { last = await predicate(); if (last) return last; await sleep(100); } throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`); }
async function move(x, y) {
  const r = await evaluate(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.left+(${x}+.5)*r.width/800,y:r.top+(${y}+.5)*r.height/600}})()`);
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
}
try {
  await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Page.navigate', { url });
  await waitFor('hitbox panel and debug API', () => evaluate("Boolean(document.querySelector('.hitbox-debug') && window.__sccDebug && window.__hitboxDebug)"));
  await evaluate("window.__sccDebug.session.request(3, 0, 'debug')");
  await waitFor('Level3', () => evaluate('window.__sccDebug.view()?.definition.id === 3'));
  await waitFor('Level3 StartW continuation', () => evaluate("(()=>{const v=window.__sccDebug.view();return v.state.objects.get('Interface')?.state===1&&!v.scc.programs.some(p=>p.active)})()"), 120000);
  const initial = await evaluate(`(()=>{const v=window.__sccDebug.view();return {state:[...v.state.objects.values()].map(o=>[o.name,o.state,o.visible]),programs:v.scc.programs.length,scroll:v.scrollX,stool:v.objectDebug('Stool'),debug:v.hitboxDebugEnabled}})()`);
  assert(initial.debug, 'debug=hitbox enables observer');
  assert(initial.stool?.width > 0 && initial.stool.height > 0, `Level3 Stool geometry is available: ${JSON.stringify(initial.stool)}`);
  const point = await evaluate(`(()=>{const v=window.__sccDebug.view(),o=v.objects.get('Stool');if(!o?.hitPixels)return null;for(let py=0;py<o.height;py++)for(let px=0;px<o.width;px++){if(!o.hitPixels[(py*o.width+px)*4+3])continue;const sx=Math.floor(o.sprite.x-o.width/2+px+.5-v.scrollX),sy=Math.floor(o.sprite.y-o.height/2+py+.5),r=v.hitboxSnapshot(sx,sy),stool=r.objects.findIndex(x=>x.name==='Stool');if(stool>=0&&r.objects[stool].hit&&!r.actives.some(a=>a.hit)&&!r.objects.slice(0,stool).some(x=>x.hit))return [sx,sy,r.scrollX,r.world];}return null})()`);
  assert(point, 'found a scroll-correct opaque Stool point selected by the hit pipeline, not intercepted by Active/Object');
  await move(point[0], point[1]); await sleep(120);
  const hovered = await evaluate(`(()=>{const v=window.__sccDebug.view(),r=v.hitboxSnapshot(${point[0]},${point[1]}),o=r.objects.find(x=>x.name==='Stool'),hits=r.objects.filter(x=>x.hit);return {o,hits:hits.map(x=>x.name),world:r.world,scroll:r.scrollX,activeCount:r.actives.length,panel:document.querySelector('.hitbox-debug').textContent,style:getComputedStyle(document.querySelector('.hitbox-debug')).pointerEvents,graphicsMode:window.__hitboxDebug.graphics.eventMode,graphicsCommands:window.__hitboxDebug.graphics.context.instructions.length,state:[...v.state.objects.values()].map(o=>[o.name,o.state,o.visible]),programs:v.scc.programs.length}})()`);
  assert(hovered.o?.hit && hovered.o.hasClickHandlers, `hover identifies clickable Stool candidate: ${JSON.stringify(hovered.o)}`);
  assert(hovered.world[0] === point[0] + hovered.scroll, 'world X equals screen X plus scene scroll exactly once');
  assert(hovered.style === 'none', 'debug panel/overlay do not intercept mouse events');
  assert(hovered.graphicsMode === 'none' && hovered.graphicsCommands > 0 && hovered.activeCount > 0, `Pixi Object/Active overlay is drawn as a non-interactive layer: ${JSON.stringify({mode:hovered.graphicsMode,commands:hovered.graphicsCommands,actives:hovered.activeCount})}`);
  assert(hovered.o.name === 'Stool' && hovered.hits.includes('Stool'), `diagnostic exposes shared picker target and overlapping geometry: ${JSON.stringify({target:hovered.o.name,hits:hovered.hits})}`);
  assert(hovered.state.length === initial.state.length && hovered.programs === initial.programs, 'hover observation does not mutate SCC state or program count');
  assert(hovered.panel.includes('Stool') && hovered.panel.includes('Case 1'), 'Level3 inspector reports stool and its selected Case');
  await move(point[0], point[1]);
  const canvas = await evaluate("(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.left+(" + point[0] + "+.5)*r.width/800,y:r.top+(" + point[1] + "+.5)*r.height/600}})()");
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: canvas.x, y: canvas.y, button: 'left', buttons: 1, clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: canvas.x, y: canvas.y, button: 'left', buttons: 0, clickCount: 1 });
  const trace = await waitFor('click chain', () => evaluate("(()=>{const t=window.__sccDebug.view().hitboxSnapshot(" + point[0] + "," + point[1] + ").clickTrace;return t.includes('Pointer screen=')?t:false})()"));
  assert(trace.includes('Actual selected target: Stool'), `click chain records the actual selected target (not merely visual overlap): ${trace}`);
  assert(trace.includes('SCC handler lookup') && trace.includes('Program dispatched: yes'), `click chain confirms SCC Case dispatch: ${trace}`);
  assert(trace.includes('Hit candidates (unified front-to-back):'), 'click chain lists every ordered unified candidate');
  assert(trace.includes('Case 1: match'), 'Level3 stool click dispatches its valid Interface Case 1');
  console.log(JSON.stringify({ level: 3, hovered: Object.fromEntries(Object.entries(hovered.o).filter(([key]) => key !== 'hitPixels')), scroll: hovered.scroll, world: hovered.world, clickTrace: trace }, null, 2));
  console.log('CHROMIUM HITBOX E2E PASSED');
  page.socket.close();
} finally {
  if (page.socket.readyState === WebSocket.OPEN) page.socket.close();
  if (browser.socket.readyState === WebSocket.OPEN) browser.socket.close();
}
