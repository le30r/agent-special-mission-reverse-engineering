#!/usr/bin/env node
import { resources } from './lib/e2e-resources.mjs';
/** Original-resource Fault integration: Level1 Morda plus both Level29 Janitor voices. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cdp = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const url = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=scenes';
const out = process.env.E2E_OUTPUT_DIR ?? resources.tempDir('artifacts');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function assert(ok, message) { if (!ok) throw new Error(`Assertion failed: ${message}`); }

async function connect(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let next = 1; const pending = new Map();
  socket.addEventListener('message', ({ data }) => { const message=JSON.parse(data); if(!message.id)return; const waiter=pending.get(message.id); if(!waiter)return; pending.delete(message.id); message.error?waiter.reject(new Error(message.error.message)):waiter.resolve(message.result); });
  return { socket, send(method, params = {}) { const id=next++; socket.send(JSON.stringify({id,method,params})); return new Promise((resolve,reject)=>pending.set(id,{resolve,reject})); } };
}
const browser = await connect((await (await fetch(`${cdp}/json/version`)).json()).webSocketDebuggerUrl);
const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
let pageTarget;
for (let i = 0; i < 50; i++) { pageTarget=(await (await fetch(`${cdp}/json`)).json()).find((target)=>target.id===targetId); if(pageTarget?.webSocketDebuggerUrl)break; await sleep(50); }
if (!pageTarget?.webSocketDebuggerUrl) throw new Error('Could not create isolated browser page');
const page = await connect(pageTarget.webSocketDebuggerUrl);
const send = page.send;
async function evaluate(expression) { const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true}); if(r.exceptionDetails)throw new Error(r.exceptionDetails.text??'evaluation failed'); return r.result.value; }
async function panel() { return evaluate("document.querySelector('.scene-debug')?.textContent ?? ''"); }
async function waitFor(what,predicate,timeout=45000) { const deadline=Date.now()+timeout; let last; while(Date.now()<deadline){last=await predicate();if(last)return last;await sleep(100);} throw new Error(`Timed out waiting for ${what}: ${JSON.stringify(last)}`); }
async function click(x,y) { const rect=await evaluate(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height};})()`);const cx=rect.left+x*rect.width/800,cy=rect.top+y*rect.height/600;await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:cx,y:cy});await send('Input.dispatchMouseEvent',{type:'mousePressed',x:cx,y:cy,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:cx,y:cy,button:'left',buttons:0,clickCount:1}); }

try {
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const log = window.__faultAudioTrace = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args) {
      const samples = this.buffer?.getChannelData(0);
      const pcmNonzero = Boolean(samples && samples.some((sample) => sample !== 0));
      const detail = { time: performance.now(), state: this.context.state, duration: this.buffer?.duration, pcmNonzero };
      const result = start.apply(this, args); log.push({ event: 'source.start', ...detail });
      this.addEventListener('ended', () => log.push({ event: 'source.ended', ...detail }), { once: true });
      return result;
    };
  })();` });
  await send('Page.enable'); await send('Runtime.enable'); await send('Page.navigate', { url });
  await waitFor('Level1 Init', async () => { const p = await panel(); return p.includes('active=1') ? p : false; });
  await waitFor('Morda visible', () => evaluate("window.__sccDebug.view().activeVisible('Morda')"));
  await evaluate('window.__sccDebug.view().setFaultRand15(() => 0)');
  const before = await evaluate(`(() => { const v=window.__sccDebug.view(); return {inventory:[...v.scc.inventory],state:v.state.objects.get('Morda')?.state}; })()`);
  let traces = await evaluate('window.__audioDebug.view().audio.diagnostics()');
  const diagStart = traces.length;
  await click(150, 280); // Active Morda, world (750,280), initial scroll 599.
  traces = await waitFor('Morda original WAV', async () => { const d=await evaluate('window.__audioDebug.view().audio.diagnostics()'); return d.slice(diagStart).some((e)=>e.event==='voice.playing'&&/otd_001\.wav$/i.test(e.url??'')) ? d : false; }, 30000);
  const mordaSound = traces.slice(diagStart).filter((e)=>/otd_001\.wav$/i.test(e.url??''));
  assert(mordaSound.some((e)=>e.event==='voice.playing'), `selected original Morda WAV: ${JSON.stringify(mordaSound)}`);
  const barrier = await waitFor('Speak frame barrier', async () => evaluate("window.__sccDebug.view().activeBarriers.has('Speak')"));
  assert(barrier, 'Speak waits on its positive frame range');
  const selectedSource = await waitFor('Morda WAV source.start', async () => {
    const d=await evaluate('window.__audioDebug.view().audio.diagnostics()');
    return d.find((e)=>String(e.event).startsWith('source.start.ok')&&/otd_001\.wav$/i.test(e.url??'')&&e.contextState==='running') ?? false;
  }, 10000);
  const pcmTrace = await evaluate('window.__faultAudioTrace');
  const pcmStart = pcmTrace.filter((e)=>e.event==='source.start'&&e.pcmNonzero&&e.state==='running')
    .sort((a,b)=>Math.abs(a.time-selectedSource.time)-Math.abs(b.time-selectedSource.time))[0];
  const started = { source:selectedSource, pcm:pcmStart ? { duration:pcmStart.duration, deltaMs:Math.abs(pcmStart.time-selectedSource.time), nonzero:true } : undefined };
  assert(started.pcm?.duration > 0 && started.pcm.deltaMs < 1000, `selected original WAV started unmuted with nonzero decoded PCM: ${JSON.stringify(started)}`);
  const ended = await waitFor('actual WAV EOF and SCC completion', async () => {
    const a=await evaluate('window.__faultAudioTrace');
    const d=await evaluate('window.__audioDebug.view().audio.diagnostics()');
    const v=await evaluate(`(() => { const v=window.__sccDebug.view(); const p=v.scc.programs.at(-1); return {active:p?.active,busy:v.scc.busy,speak:v.player.isActive('Speak')}; })()`);
    return d.some((e)=>e.event==='source.onended'&&/otd_001\.wav$/i.test(e.url??'')&&e.contextState==='running') && d.some((e)=>e.event==='voice.playback-finished'&&/otd_001\.wav$/i.test(e.url??'')) && !v.active && !v.busy && !v.speak ? {a,d,v} : false;
  }, 30000);
  const after = await evaluate(`(() => { const v=window.__sccDebug.view(); return {inventory:[...v.scc.inventory],state:v.state.objects.get('Morda')?.state}; })()`);
  assert(JSON.stringify(before)===JSON.stringify(after), `Fault leaves inventory and object state unchanged: ${JSON.stringify({before,after})}`);
  await mkdir(out, { recursive: true });
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(out, 'level1-morda.png'), Buffer.from(shot.data, 'base64'));

  // A nonzero selected item suppresses Fault even when the object still misses Click.
  const countBeforeWrongItem = (await evaluate('window.__audioDebug.view().audio.diagnostics()')).length;
  const programsBeforeWrongItem = await evaluate('window.__sccDebug.view().scc.programs.length');
  await evaluate('window.__sccDebug.view().selectItem(1)'); await click(150, 280); await sleep(300);
  const afterWrongItem = await evaluate('({diagnostics:window.__audioDebug.view().audio.diagnostics().length,programs:window.__sccDebug.view().scc.programs.length,selected:window.__sccDebug.view().selectedItem})');
  assert(afterWrongItem.diagnostics===countBeforeWrongItem&&afterWrongItem.programs===programsBeforeWrongItem&&afterWrongItem.selected===1, `item 1 suppresses Fault: ${JSON.stringify(afterWrongItem)}`);

  // Enter Level29 through the real lazy scene loader and exercise both native choices.
  await evaluate("document.getElementById('debug-scene-29').click()");
  await waitFor('Level29 loaded', async () => { const p=await panel(); return p.includes('active=29') ? p : false; });
  const janitor = await evaluate(`(() => {
    const v=window.__sccDebug.view(), object=v.objects.get('Janitor');
    if(!object)return {object:null};
    const targets=[...v.objects.values()].map((o)=>({name:o.name,x:o.sprite.x,y:o.sprite.y,width:o.width,height:o.height,visible:o.sprite.visible,removed:o.removed,hitPixels:o.hitPixels,depth:o.depth,order:o.order}));
    const ordered=[...targets].sort((a,b)=>Math.abs(a.depth)-Math.abs(b.depth)||a.order-b.order);
    const hit=(t,x,y)=>{if(!t.visible||t.removed||!t.hitPixels)return false;const ix=Math.floor(x-(t.x-t.width/2)),iy=Math.floor(y-(t.y-t.height/2));return ix>=0&&iy>=0&&ix<t.width&&iy<t.height&&t.hitPixels[(iy*t.width+ix)*4+3]!==0;};
    let point;
    for(let y=Math.ceil(object.sprite.y-object.height/2);y<object.sprite.y+object.height/2&&!point;y+=2)for(let x=Math.ceil(object.sprite.x-object.width/2);x<object.sprite.x+object.width/2;x+=2){const sx=x-v.scrollX;const activeHit=[...v.definition.active].some(([name,d])=>v.activeVisible(name)&&d.rect&&sx>d.rect.left-v.scrollX&&sx<d.rect.right-v.scrollX&&y>d.rect.top&&y<d.rect.bottom);if(activeHit)continue;const front=ordered.find((t)=>Math.abs(t.depth)!==0&&hit(t,x,y));if(front?.name==='Janitor'){point=[sx,y];break;}}
    return {object:v.objectDebug('Janitor'),scroll:v.scrollX,point,actives:[...v.definition.active].map(([name,d])=>({name,visible:v.activeVisible(name),rect:d.rect}))};
  })()`);
  assert(janitor.object && !janitor.object.removed && janitor.object.width>0, `Janitor has a hittable layout image: ${JSON.stringify(janitor)}`);
  assert(janitor.point, `Janitor has a topmost opaque hit pixel: ${JSON.stringify(janitor)}`);
  const [janitorX,janitorY] = janitor.point;
  const expectedPaths = ['002.wav', 'Sound065.wav'];
  for (const [rand, pathEnd] of [[0, expectedPaths[0]], [8192, expectedPaths[1]]]) {
    await evaluate(`window.__sccDebug.view().setFaultRand15(() => ${rand})`);
    const beforeCount=(await evaluate('window.__audioDebug.view().audio.diagnostics()')).length;
    await click(janitorX, janitorY);
    const chosen=await waitFor(`Janitor ${pathEnd}`,async()=>{const d=await evaluate('window.__audioDebug.view().audio.diagnostics()'),a=await evaluate('window.__faultAudioTrace');const voice=d.slice(beforeCount).find((e)=>e.event==='voice.playing'&&(e.url??'').toLowerCase().endsWith(pathEnd.toLowerCase()));const source=voice&&d.slice(beforeCount).find((e)=>String(e.event).startsWith('source.start.ok')&&e.url===voice.url&&e.contextState==='running');const pcm=source&&a.filter((e)=>e.event==='source.start'&&e.pcmNonzero&&e.state==='running').sort((x,y)=>Math.abs(x.time-source.time)-Math.abs(y.time-source.time))[0];return voice&&source&&pcm&&Math.abs(pcm.time-source.time)<1000?{voice,source,pcm:{duration:pcm.duration,nonzero:true}}:false;},30000);
    assert(chosen, `deterministic rand15=${rand} selected and played unmuted ${pathEnd} with nonzero PCM`);
    await waitFor(`Janitor ${pathEnd} completion`,async()=>{const d=await evaluate('window.__audioDebug.view().audio.diagnostics()');const v=await evaluate(`(()=>{const v=window.__sccDebug.view();return {active:v.scc.programs.at(-1)?.active,busy:v.scc.busy,speak:v.player.isActive('Speak')}})()`);return d.slice(beforeCount).some((e)=>e.event==='voice.playback-finished'&&(e.url??'').toLowerCase().endsWith(pathEnd.toLowerCase()))&&!v.active&&!v.busy&&!v.speak;},30000);
  }
  const pcm=await evaluate('window.__faultAudioTrace');
  console.log(JSON.stringify({ level1: { before, after, mordaSound, barrier, started, ended: ended.v }, level29: { selected: expectedPaths, nonzeroPCMStarts: pcm.filter((e)=>e.event==='source.start'&&e.pcmNonzero&&e.state==='running').length } }, null, 2));
  console.log('CHROMIUM FAULT E2E PASSED (unmuted)');
  page.socket.close();
} finally {
  if (page.socket.readyState === WebSocket.OPEN) page.socket.close();
  if (browser.socket.readyState === WebSocket.OPEN) browser.socket.close();
}
