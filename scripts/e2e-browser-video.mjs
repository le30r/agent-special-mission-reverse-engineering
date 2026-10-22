#!/usr/bin/env node
import { resources } from './lib/e2e-resources.mjs';

const cdp = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const startUrl = process.env.E2E_URL ?? 'http://127.0.0.1:4173/?debug=scenes';
const targets = await (await fetch(`${cdp}/json`)).json();
const page = targets.find((target) => target.type === 'page' && target.url.includes('127.0.0.1')) ?? targets.find((target) => target.type === 'page');
if (!page) throw new Error('Chromium page is unavailable');
const socket = new WebSocket(page.webSocketDebuggerUrl);
resources.sockets.add(socket);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let id = 0;
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
  const callId = ++id;
  socket.send(JSON.stringify({ id: callId, method, params }));
  return new Promise((resolve, reject) => pending.set(callId, { resolve, reject }));
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? 'browser evaluation failed');
  return response.result.value;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(label, predicate, timeout = 30_000) {
  const until = Date.now() + timeout;
  let latest;
  while (Date.now() < until) {
    latest = await predicate();
    if (latest) return latest;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}; last=${JSON.stringify(latest)}`);
}
async function key(key, code) {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: key === 'F1' ? 112 : undefined });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: key === 'F1' ? 112 : undefined });
}
async function logicalClick(x, y) {
  const rect = await evaluate(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return{left:r.left,top:r.top,width:r.width,height:r.height}})()`);
  const clientX = rect.left + (x + 0.5) * rect.width / 800;
  const clientY = rect.top + (y + 0.5) * rect.height / 600;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: clientX, y: clientY });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: clientX, y: clientY, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: clientX, y: clientY, button: 'left', buttons: 0, clickCount: 1 });
}
async function pickerPoint(name, targetKind) {
  return evaluate(`(()=>{
    const v=window.__sccDebug.view();
    ${targetKind === 'active'
      ? `const r=v.definition.active.get(${JSON.stringify(name)})?.rect; if(!r)return null; const box={left:r.left-v.scrollX,top:r.top,right:r.right-v.scrollX,bottom:r.bottom};`
      : `const o=v.objectDebug(${JSON.stringify(name)}); if(!o)return null; const box={left:o.x-o.width/2-v.scrollX,top:o.y-o.height/2,right:o.x+o.width/2-v.scrollX,bottom:o.y+o.height/2};`}
    for(let y=Math.max(1,Math.floor(box.top));y<Math.min(599,Math.ceil(box.bottom));y+=2)
      for(let x=Math.max(1,Math.floor(box.left));x<Math.min(799,Math.ceil(box.right));x+=2)
        if(v.hitboxSnapshot(x,y).selectedTarget?.name===${JSON.stringify(name)})return[x,y];
    return null;
  })()`);
}
async function clickTarget(name, kind) {
  const point = await waitFor(`${name} pick point`, () => pickerPoint(name, kind));
  await logicalClick(point[0], point[1]);
  console.log(`real input ${name} at (${point.join(',')})`);
}
async function startLevel34() {
  await evaluate("window.__sccDebug.session.request(34,0,'debug')");
  await waitFor('Level34 scene', () => evaluate('window.__sccDebug.view()?.definition.id===34'));
  await waitFor('Level34 settled', () => evaluate('window.__saveLoadDebug?.canSave().ok'));
  await clickTarget('Per_plat', 'object');
  await waitFor('Per_plat state 1', () => evaluate("window.__sccDebug.view().state.objects.get('Per_plat')?.state===1"));
  await clickTarget('Knopka', 'active');
  await waitFor('real Rolik2 video barrier', () => evaluate("window.__videoDebug.controller.active && window.__videoDebug.controller.element?.src.includes('Rolik2.mp4')"));
}
try {
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: startUrl });
  await waitFor('debug runtime', () => evaluate('Boolean(window.__videoDebug && window.__sccDebug)'));

  // Boot Init is itself a real original SCC caller (Rolik1); F1 must consume+skip it.
  const boot = await waitFor('original boot Rolik1', () => evaluate("window.__videoDebug.controller.active && window.__videoDebug.controller.element?.src.includes('Rolik1.mp4')"));
  const firstFrame = await evaluate(`new Promise(resolve=>{const v=window.__videoDebug.controller.element; if(!v)return resolve(null); v.requestVideoFrameCallback((now,meta)=>resolve({width:v.videoWidth,height:v.videoHeight,time:v.currentTime,mediaTime:meta.mediaTime})); setTimeout(()=>resolve(null),8000)})`);
  if (!firstFrame || firstFrame.width !== 400 || firstFrame.height !== 300) throw new Error(`Rolik1 did not decode a 400x300 frame: ${JSON.stringify(firstFrame)}`);
  console.log(`Rolik1 actual decoded frame ${JSON.stringify(firstFrame)}`);
  await key('F1', 'F1');
  await waitFor('Rolik1 F1 skip completion', () => evaluate("!window.__videoDebug.controller.active && window.__videoDebug.controller.result?.result==='skipped'"));
  await waitFor('Level1 post-video Init', () => evaluate("window.__sccDebug.view()?.state.objects.get('Slip')?.state===1"));

  await startLevel34();
  const gates = await evaluate('({save:window.__saveLoadDebug.canSave(),map:window.__mapDebug.view().canOpen,barrier:window.__videoDebug.session.videoBarrierActive})');
  if (gates.save.ok || gates.map || !gates.barrier) throw new Error(`video did not gate save/map/input lifecycle: ${JSON.stringify(gates)}`);
  const clip = await evaluate(`(()=>{const c=window.__videoDebug.controller,v=c.element;return{phase:c.phase,src:v.currentSrc,duration:v.duration,width:v.videoWidth,height:v.videoHeight,time:v.currentTime,audioBytes:v.webkitAudioDecodedByteCount??null,gameTime:window.__videoDebug.gameTime,tick:window.__videoDebug.tickNumber}})()`);
  const frame = await evaluate(`new Promise(resolve=>{const v=window.__videoDebug.controller.element; v.requestVideoFrameCallback((_,m)=>resolve({time:v.currentTime,mediaTime:m.mediaTime,decoded:v.getVideoPlaybackQuality?.().totalVideoFrames??null}));setTimeout(()=>resolve(null),8000)})`);
  if (!frame || clip.width !== 400 || clip.height !== 300 || !(clip.duration > 50) || !clip.src.endsWith('/Rolik2.mp4')) throw new Error(`Rolik2 failed real media metadata/decode: ${JSON.stringify({clip,frame})}`);
  await sleep(700);
  const progressed = await evaluate(`(()=>{const c=window.__videoDebug.controller,v=c.element;return{mediaTime:v.currentTime,gameTime:window.__videoDebug.gameTime,tick:window.__videoDebug.tickNumber,audioBytes:v.webkitAudioDecodedByteCount??null}})()`);
  if (!(progressed.mediaTime > frame.time) || progressed.gameTime !== clip.gameTime || progressed.tick !== clip.tick) throw new Error(`media clock/game tick barrier mismatch: ${JSON.stringify({clip,frame,progressed})}`);
  if (clip.audioBytes !== null && progressed.audioBytes !== null && !(progressed.audioBytes > clip.audioBytes)) throw new Error(`Chromium did not decode the embedded audio track: ${JSON.stringify({clip,progressed})}`);
  console.log(`Rolik2 real playback, decoded frame and embedded audio bytes ${JSON.stringify({clip,frame,progressed})}`);

  const videoObjectId = await send('Runtime.evaluate', { expression: 'window.__videoDebug.controller.element', returnByValue: false });
  await evaluate(`window.__videoDebug.controller.element.currentTime=window.__videoDebug.controller.element.duration-0.15`);
  await waitFor('native video ended event and SCC tail', () => evaluate(`(()=>{const v=window.__sccDebug.view(),c=window.__videoDebug.controller;return !c.active&&c.result?.result==='ended'&&v.state.objects.get('Per_plat')?.state===2&&v.state.objects.get('Knopka')?.state===2})()`), 12_000);
  const tail = await evaluate(`(()=>{const s=window.__sccDebug.session;return{scene:window.__sccDebug.view().definition.id,manecen19:s.loader.readState(19,'Manecen'),bomsh19:s.loader.readState(19,'Bomsh'),bomsh25:s.loader.readState(25,'Bomsh'),baby35:s.loader.readState(35,'Baby'),transition:s.transitionLog.slice(-2)}})()`);
  if (tail.scene !== 34 || tail.manecen19 !== 1 || tail.bomsh19 !== 4 || tail.bomsh25 !== 1 || tail.baby35 !== 1) throw new Error(`Rolik2 tail progression incorrect: ${JSON.stringify(tail)}`);
  await send('Runtime.callFunctionOn', { objectId: videoObjectId.result.objectId, functionDeclaration: "function(){this.dispatchEvent(new Event('ended'))}", returnByValue: true });
  await evaluate('window.__videoDebug.controller.skip();window.__videoDebug.controller.skip()');
  const afterDuplicate = await evaluate("({result:window.__videoDebug.controller.result?.result,scene:window.__sccDebug.view().definition.id,manecen19:window.__sccDebug.session.loader.readState(19,'Manecen')})");
  if (afterDuplicate.result !== 'ended' || afterDuplicate.manecen19 !== 1 || afterDuplicate.scene !== 34) throw new Error(`duplicate completion changed progression: ${JSON.stringify(afterDuplicate)}`);
  console.log(`Level34 Rolik2 completed before tail; no artificial scene transition: ${JSON.stringify(tail)}`);

  // Start again from its SCC state and verify F1 is consumed as a skip, never as map UI.
  await evaluate("(()=>{const v=window.__sccDebug.view();v.state.objects.get('Per_plat').state=1;v.state.objects.get('Knopka').state=1})()");
  await clickTarget('Knopka', 'active');
  await waitFor('Rolik2 replay active', () => evaluate('window.__videoDebug.controller.active'));
  await key('F1', 'F1');
  await waitFor('F1 skip and Level34 tail', () => evaluate(`(()=>{const v=window.__sccDebug.view(),c=window.__videoDebug.controller;return !c.active&&c.result?.result==='skipped'&&v.state.objects.get('Per_plat')?.state===2})()`));
  const mapPhase = await evaluate('window.__mapDebug?.view().phase');
  if (mapPhase !== 'closed') throw new Error(`F1 opened map over/after a video: phase=${mapPhase}`);
  console.log('F1 skip consumed correctly; map stayed closed; Level34 SCC resumed.');

  // Exercise the other original SCC-backed cutscenes, with only the puzzle Case
  // state set up; the click, animations, barrier and real media are browser-driven.
  await evaluate("window.__sccDebug.session.request(25,0,'debug')");
  await waitFor('Level25 scene', () => evaluate('window.__sccDebug.view()?.definition.id===25'));
  await waitFor('Level25 settled', () => evaluate('window.__saveLoadDebug?.canSave().ok'));
  await evaluate("window.__sccDebug.view().state.objects.get('Bomsh').state=4");
  // Laz_an is the original SCC click handler; that Object is not exposed by the
  // current rendered layout in the debug picker, so dispatch its real Case 4.
  await evaluate("window.__sccDebug.view().scc.click('Laz_an')");
  await waitFor('real Rolik5 video barrier', () => evaluate("window.__videoDebug.controller.active && window.__videoDebug.controller.element?.src.includes('Rolik5.mp4')"), 60_000);
  const rolik5Frame = await evaluate(`new Promise(resolve=>{const v=window.__videoDebug.controller.element;v.requestVideoFrameCallback((_,m)=>resolve({time:v.currentTime,width:v.videoWidth,height:v.videoHeight,mediaTime:m.mediaTime}));setTimeout(()=>resolve(null),8000)})`);
  if (!rolik5Frame || rolik5Frame.width !== 400 || rolik5Frame.height !== 300) throw new Error(`Rolik5 failed real decoded frame: ${JSON.stringify(rolik5Frame)}`);
  await key('F1', 'F1');
  await waitFor('Rolik5 SCC tail and original Level19 request', () => evaluate("!window.__videoDebug.controller.active && window.__videoDebug.controller.result?.result==='skipped' && window.__sccDebug.view()?.definition.id===19 && window.__sccDebug.session.loader.readState(25,'Bomsh')===5"), 30_000);
  console.log(`Rolik5 original Level25 SCC playback and skip passed: ${JSON.stringify(rolik5Frame)}`);

  await evaluate("window.__sccDebug.session.request(28,0,'debug')");
  await waitFor('Level28 scene', () => evaluate('window.__sccDebug.view()?.definition.id===28'));
  await waitFor('Level28 settled', () => evaluate('window.__saveLoadDebug?.canSave().ok'));
  await evaluate("window.__sccDebug.view().state.objects.get('Door_a').state=3");
  await evaluate("window.__sccDebug.view().scc.click('Door_a')");
  await waitFor('real Final video barrier', () => evaluate("window.__videoDebug.controller.active && window.__videoDebug.controller.element?.src.includes('Final.mp4')"), 60_000);
  const finalFrame = await evaluate(`new Promise(resolve=>{const v=window.__videoDebug.controller.element;v.requestVideoFrameCallback((_,m)=>resolve({time:v.currentTime,width:v.videoWidth,height:v.videoHeight,mediaTime:m.mediaTime}));setTimeout(()=>resolve(null),8000)})`);
  if (!finalFrame || finalFrame.width !== 400 || finalFrame.height !== 300) throw new Error(`Final failed real decoded frame: ${JSON.stringify(finalFrame)}`);
  await key('F1', 'F1');
  await waitFor('Final SCC tail', () => evaluate("!window.__videoDebug.controller.active && window.__videoDebug.controller.result?.result==='skipped' && window.__sccDebug.view()?.definition.id===28"), 30_000);
  console.log(`Final original Level28 SCC playback and skip passed: ${JSON.stringify(finalFrame)}; Egame remains a separate runtime gap.`);

  // Title/Titres have native startup/menu callers outside the browser runtime's
  // current gameplay shell. Still verify their prepared originals through the
  // same real HTML media decoder, without inventing a game transition.
  for (const name of ['Title.avi', 'Titres.avi']) {
    await evaluate(`window.__videoDebug.controller.begin({originalName:${JSON.stringify(name)},ignoredSccArg:0})`);
    await waitFor(`${name} playback`, () => evaluate(`window.__videoDebug.controller.active && window.__videoDebug.controller.element?.src.includes(${JSON.stringify(name.replace('.avi', '.mp4'))})`));
    const decoded = await evaluate(`new Promise(resolve=>{const v=window.__videoDebug.controller.element;v.requestVideoFrameCallback((_,m)=>resolve({width:v.videoWidth,height:v.videoHeight,time:v.currentTime,mediaTime:m.mediaTime}));setTimeout(()=>resolve(null),8000)})`);
    if (!decoded || decoded.width !== 400 || decoded.height !== 300) throw new Error(`${name} failed Chromium decode: ${JSON.stringify(decoded)}`);
    await evaluate('window.__videoDebug.controller.skip()');
    await waitFor(`${name} cleanup`, () => evaluate("!window.__videoDebug.controller.active && window.__videoDebug.controller.result?.result==='skipped'"));
    console.log(`${name} actual Chromium frame decode passed: ${JSON.stringify(decoded)}`);
  }

  await evaluate("window.__videoDebug.controller.begin({originalName:'Missing.avi',ignoredSccArg:0})");
  await waitFor('missing original diagnostic', () => evaluate("!window.__videoDebug.controller.active && window.__videoDebug.controller.result?.result==='error' && window.__videoDebug.controller.result?.error?.includes('Missing.avi')"));
  await evaluate(`(()=>{window.__videoFetchOriginal=window.fetch.bind(window);const original=window.__videoFetchOriginal;window.fetch=(input,...rest)=>String(input).includes('/generated/video/manifest.json')?original(input,...rest).then(async r=>{const m=await r.json();m.clips['Rolik2.avi'].url='/generated/video/manifest.json';return new Response(JSON.stringify(m),{status:200,headers:{'Content-Type':'application/json'}})}):original(input,...rest)})()`);
  await evaluate("window.__videoDebug.controller.begin({originalName:'Rolik2.avi',ignoredSccArg:0})");
  await waitFor('corrupt media decode diagnostic', () => evaluate("!window.__videoDebug.controller.active && window.__videoDebug.controller.result?.result==='error'"));
  await evaluate('window.fetch=window.__videoFetchOriginal;delete window.__videoFetchOriginal');
  console.log('Missing manifest entry and corrupt media both terminated with explicit diagnostics; barrier did not remain active.');

  // A committed scene transition may interrupt an in-flight clip; stale media
  // callbacks must not retain or unlock the new visit.
  await evaluate("window.__sccDebug.session.request(28,0,'debug')");
  await waitFor('Level28 re-entry', () => evaluate('window.__sccDebug.view()?.definition.id===28'));
  await waitFor('Level28 re-entry settled', () => evaluate('window.__saveLoadDebug?.canSave().ok'));
  await evaluate("window.__sccDebug.view().state.objects.get('Door_a').state=3;window.__sccDebug.view().scc.click('Door_a')");
  await waitFor('Final re-entry active', () => evaluate("window.__videoDebug.controller.active && window.__videoDebug.controller.element?.src.includes('Final.mp4')"), 30_000);
  await evaluate("window.__sccDebug.session.request(24,0,'debug')");
  await waitFor('scene switch interrupts owned video', () => evaluate("window.__sccDebug.view()?.definition.id===24 && !window.__videoDebug.controller.active"), 30_000);
  console.log('Final playback disposed cleanly on an allowed debug scene transition; new scene stayed active.');

  console.log('VIDEO CHROMIUM E2E PASSED');
} finally {
  socket.close();
  resources.sockets.delete(socket);
}
