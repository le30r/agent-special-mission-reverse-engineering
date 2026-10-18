/** Research-only diagnostic harness. Use a dedicated Chromium CDP endpoint on 9333.
 * Run: node research/audio/browser-wav-audit/probe.mjs <init|lifecycle|graph|runtime|scheduler|repeat> fresh
 * Requires current Vite on 4173. Results are written to /private/tmp/wav-audit.
 * Not imported by the application or the test suite.
 */
import { writeFile } from 'node:fs/promises';
import { installE2EAudioPolicy } from '../../../scripts/e2e-audio-policy.mjs';
const endpoint='http://127.0.0.1:9333';
const version = await (await fetch(`${endpoint}/json/version`)).json();
let seq=0; const pending=new Map();
async function client(url) {
 const ws=new WebSocket(url); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
 return {ws,send(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}};
}
let pages=await (await fetch(`${endpoint}/json`)).json();
if(process.argv[3]==='fresh') {const b=await client(version.webSocketDebuggerUrl);const {targetId}=await b.send('Target.createTarget',{url:'http://127.0.0.1:4173/?debug=scenes'});b.ws.close();await new Promise(r=>setTimeout(r,2000));pages=await (await fetch(`${endpoint}/json`)).json();pages=pages.filter(p=>p.id===targetId);}
if(!pages.some(p=>p.type==='page')) {const b=await client(version.webSocketDebuggerUrl);await b.send('Target.createTarget',{url:'about:blank'});b.ws.close();pages=await (await fetch(`${endpoint}/json`)).json();}
const pageSocket=pages.find(p=>p.type==='page').webSocketDebuggerUrl;let c=await client(pageSocket);let send=c.send;
async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await send('Page.enable'); await send('Runtime.enable');
const mode=process.argv[2]??'init';
if(mode==='init'){await send('Page.navigate',{url:'http://127.0.0.1:4173/?debug=scenes'});await wait(2500);console.log(await ev(`({url:location.href,panel:document.querySelector('.scene-debug')?.textContent,muted:window.__e2eAudioMuted,connect:String(AudioBufferSourceNode.prototype.connect)})`));}
if(mode==='graph') {
 const results=[];
 const measure=()=>ev(`(async()=>{
 const {BrowserAudioBackend}=await import('/src/audio/backend.ts');
 const context=new OfflineAudioContext(1,44100,44100);
 const gains=[];const createGain=context.createGain.bind(context);context.createGain=()=>{const n=createGain();const record={node:n,destination:false};gains.push(record);const connect=n.connect.bind(n);n.connect=(to,...rest)=>{record.destination=to===context.destination;return connect(to,...rest);};return n;};
 const buffer=context.createBuffer(1,44100,44100);buffer.getChannelData(0).fill(0.25);
 const backend=new BrowserAudioBackend({context,fetcher:async()=>({ok:true,status:200,arrayBuffer:async()=>new ArrayBuffer(1)})});
 context.decodeAudioData=async()=>buffer;
 const playback=await backend.play('/probe.wav');
 const rendered=await context.startRendering(); const a=rendered.getChannelData(0);
 return {muted:window.__e2eAudioMuted===true,muteCount:window.__e2eAudioMuteCount??0,gains:gains.map(g=>({gain:g.node.gain.value,connectedToDestination:g.destination})),rms:Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length),starts:backend.diagnostics().filter(x=>x.event==='source.start.ok').length};})()`);
 results.push({phase:'before-policy',...(await measure())});
 await installE2EAudioPolicy(send); // Identical to the repository E2E default.
 await send('Page.reload');await wait(1500);
 results.push({phase:'after-e2e-policy',...(await measure())});
 await send('Page.navigate',{url:'http://127.0.0.1:4173/?debug=scenes&manual=1'});await wait(1500);
 results.push({phase:'ordinary-game-navigation',...(await measure())});
 process.env.E2E_MUTE_AUDIO='0';await installE2EAudioPolicy(send);
 await send('Page.reload');await wait(1500);
 results.push({phase:'mute-disabled-after-previous-run',...(await measure())});
 c.ws.close();await wait(100);c=await client(pageSocket);send=c.send;
 results.push({phase:'after-e2e-disconnect-current-document',...(await measure())});
 await send('Page.reload');await wait(1500);
 results.push({phase:'after-e2e-disconnect-reload',...(await measure())});
 await writeFile('/private/tmp/wav-audit/graph.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
}
if(mode==='runtime') {
 const result=await ev(`(async()=>{
 const {BrowserAudioBackend}=await import('/src/audio/backend.ts'); const {SccAudioRuntime}=await import('/src/audio/scc-audio.ts');
 const context=new AudioContext(); await context.suspend();
 const buf=context.createBuffer(1,44100,44100);buf.getChannelData(0).fill(.25);
 const originalDecode=context.decodeAudioData.bind(context);context.decodeAudioData=async()=>buf;
 const backend=new BrowserAudioBackend({context,fetcher:async()=>({ok:true,status:200,arrayBuffer:async()=>new ArrayBuffer(1)})});
 const hook={id:1,animation:'Test',start:1,end:1,objects:[],value:'sound/test.wav',repeat:false};
 const audio=new SccAudioRuntime(backend,{'sound/test.wav':'/test.wav'},1,false,{'sound/test.wav':1000});
 const h=audio.play(hook,100);await new Promise(r=>setTimeout(r,30));
 const locked={context:context.state,time:context.currentTime,state:h.state,ready:audio.isReady(1,1101),trace:audio.diagnostics()};
 audio.dispose();await backend.dispose();
 let release;const context2=new AudioContext();await context2.suspend();context2.decodeAudioData=async()=>buf;
 const backend2=new BrowserAudioBackend({context:context2,fetcher:()=>new Promise(r=>release=r)});
 const audio2=new SccAudioRuntime(backend2,{'sound/test.wav':'/test.wav'},1,false,{'sound/test.wav':1000});
 const coldHandle=audio2.play(hook,100);const cold={ready:audio2.isReady(1,1101),state:coldHandle.state};
 audio2.dispose();release({ok:true,status:200,arrayBuffer:async()=>new ArrayBuffer(1)});await new Promise(r=>setTimeout(r,30));cold.afterDispose={state:coldHandle.state,active:backend2.activePlaybackCount,trace:backend2.diagnostics()};await backend2.dispose();
 return {locked,cold};})()`);await writeFile('/private/tmp/wav-audit/runtime.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
if(mode==='lifecycle') {
 await send('Page.navigate',{url:'http://127.0.0.1:4173/?debug=scenes'});await wait(2000);
 const results=[];
 const snapshot=()=>ev(`(()=>{const v=window.__audioDebug.view();return {scene:v.definition.id,muted:window.__e2eAudioMuted===true,context:v.audio.contextState,disposed:v.audio.disposed,active:window.__audioDebug.backend.activePlaybackCount,panel:document.querySelector('.scene-debug').textContent,voices:v.audio.snapshot(),trace:v.audio.diagnostics()};})()`);
 results.push({phase:'fresh',...(await snapshot())});
 const rect=await ev(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()`);
 async function click(x,y){const px=rect.x+x*rect.width/800,py=rect.y+y*rect.height/600;await send('Input.dispatchMouseEvent',{type:'mousePressed',x:px,y:py,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:px,y:py,button:'left',buttons:0,clickCount:1});}
 await click(60,470);await wait(100);results.push({phase:'after-walk-click',...(await snapshot())});
 // Explicitly replay a real positive Fram through the live view for a deterministic post-click control.
 await ev(`window.__audioDebug.view().startAnimation('Takedr1','SCC')`);await wait(200);results.push({phase:'next-real-Fram-after-walk',...(await snapshot())});
 await send('Page.reload');await wait(2000);
 await ev(`window.__oldAudio=window.__audioDebug.view().audio`);
 results.push({phase:'before-scene-switch',...(await snapshot())});
 await ev(`document.querySelector('#debug-scene-38').click()`);await wait(2000);
 results.push({phase:'after-scene-switch',...(await snapshot()),oldAudio:await ev(`({disposed:window.__oldAudio.disposed,voices:window.__oldAudio.snapshot()})`)});
 await writeFile('/private/tmp/wav-audit/lifecycle.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({trace,panel,voices,...r})=>({...r,voices})),null,2));
}
if(mode==='inspect')console.log(JSON.stringify(await ev(`({url:location.href,muted:window.__e2eAudioMuted,count:window.__e2eAudioMuteCount,connect:String(AudioBufferSourceNode.prototype.connect),panel:document.querySelector('.scene-debug')?.textContent,trace:window.__audioDebug?.view()?.audio?.diagnostics()})`),null,2));
if(mode==='scheduler') {
 const result=await ev(`(async()=>{
 const {SceneView}=await import('/src/scene/scene-view.ts');const {SccAudioRuntime}=await import('/src/audio/scc-audio.ts');const {BrowserAudioBackend}=await import('/src/audio/backend.ts');
 const live=window.__audioDebug.view();const hooks={level(){},lstate(){},setZone(){}};
 function view(){return new SceneView(live.definition,structuredClone(live.state),live.backdrop.texture,hooks,[]);}
 const stepped=view(),jumped=view(); const name='Walk1';const frames=[];
 for(const v of [stepped,jumped]){v.startAnimation(name,'SCC');v.updateSoundEvents(0);}
 for(let i=1;i<=3;i++){stepped.player.advance(27);frames.push(stepped.player.state(name).frame);stepped.updateSoundEvents(i*27);}
 const changes=jumped.player.advance(81);jumped.updateSoundEvents(81);
 const skipped={events:live.definition.audioEvents.filter(e=>e.animation===name),stepped:{frames,voices:stepped.audio.snapshot()},jumped:{frames:changes.map(e=>e.frame),voices:jumped.audio.snapshot()}};
 stepped.audio.dispose();jumped.audio.dispose();stepped.dispose();jumped.dispose();
 const c=new OfflineAudioContext(1,44100,44100);const buffer=c.createBuffer(1,44100,44100);c.decodeAudioData=async()=>buffer;
 const backend=new BrowserAudioBackend({context:c,fetcher:async()=>({ok:true,status:200,arrayBuffer:async()=>new ArrayBuffer(1)})});
 const audio=new SccAudioRuntime(backend,{'sound/test.wav':'/test.wav'},1,false,{'sound/test.wav':1000});
 const event={id:1,animation:'Test',start:1,end:1,objects:[],value:'sound/test.wav',repeat:false};
 const first=audio.play(event,0);const second=audio.play(event,1);await new Promise(r=>setTimeout(r,10));
 const replay={activeBefore:backend.activePlaybackCount,first:first.state,second:second.state};audio.stop(1);replay.activeAfter=backend.activePlaybackCount;replay.firstAfter=first.state;replay.secondAfter=second.state;
 audio.dispose();
 return {skipped,replay};})()`);await writeFile('/private/tmp/wav-audit/scheduler.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
if(mode==='repeat') {
 const result=await ev(`(async()=>{
 const {parseFrameSoundEvents}=await import('/src/audio/scc-audio.ts');const files=['Level3','Level28','Level31','Level36'];const corpus=[];
 for(const name of files){const text=await(await fetch('/resources/'+name+'.scc')).text();const events=parseFrameSoundEvents(text);corpus.push({name,inlineDeclarations:text.split(/\\r?\\n/).filter(l=>/\\bRepeat\\b/i.test(l)),parsedRepeats:events.filter(e=>e.repeat),relevantEvents:events.filter(e=>['Ventc','Watc','More_c','Dog1_c','Dog2_c','Fire_Start'].includes(e.animation))});}
 return {corpus,inline:parseFrameSoundEvents('Sound Test\\nFram 1 0 1 Object sound/test.wav Repeat'),separate:parseFrameSoundEvents('Sound Test\\nFram 1 0 1 Object sound/test.wav\\nRepeat')};})()`);await writeFile('/private/tmp/wav-audit/repeat.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
c.ws.close();
