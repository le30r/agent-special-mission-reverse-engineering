/** Research-only Chromium probe; no original Windows process execution. */
import { resources } from '../../scripts/lib/e2e-resources.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const output=process.env.E2E_OUTPUT_DIR ?? resources.tempDir('artifacts');
const root=process.cwd(), delay=ms=>new Promise(r=>setTimeout(r,ms));
let sock, id=0; const pending=new Map(), evidence={method:'Chromium reconstruction only',steps:[]};
async function wait(fn, timeout=45000){const until=Date.now()+timeout;while(Date.now()<until){const v=await fn();if(v)return v;await delay(100);}throw Error('timeout');}
try {
 await mkdir(output,{recursive:true});
 const vite=resources.spawn(process.execPath,['--input-type=module','-e',`import {createServer} from 'vite'; const s=await createServer({server:{host:'127.0.0.1',port:0}}); await s.listen(); console.log('PORT='+s.httpServer.address().port);`],{cwd:root,stdio:['ignore','pipe','inherit']});
 const port=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('vite timeout')),30000);vite.stdout.on('data',d=>{text+=d;const m=text.match(/PORT=(\d+)/);if(m){clearTimeout(timer);resolve(+m[1]);}});vite.once('error',reject);});
 const profile=resources.tempDir('chromium');
 resources.spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--no-sandbox','--disable-gpu','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
 const cdp=await wait(async()=>{try{return +(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];}catch{return false;}});
 const tabs=await (await fetch(`http://127.0.0.1:${cdp}/json`)).json();sock=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{sock.addEventListener('open',r,{once:true});sock.addEventListener('error',j,{once:true});});
 sock.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}});
 function send(method,params={}){return new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});sock.send(JSON.stringify({id:n,method,params}));});}
 async function ev(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
 async function capture(label){const data=await ev(`(()=>{const d=window.__sccDebug,v=d.view();return {status:v.status(),objects:[...v.state.objects.values()],clickTrace:v.hitboxSnapshot(0,0).clickTrace,programs:v.scc.programs.filter(p=>p.active),animations:v.animationLog.slice(-25),transition:d.session.lastTransition,external:[19,25,35].map(id=>({id,objects:[...d.session.loader.state(id).objects.values()].map(o=>({name:o.name,state:o.state}))})),log:d.session.transitionLog};})()`);evidence.steps.push({label,...data});await writeFile(path.join(output,'trace.json'),JSON.stringify(evidence,null,2));console.log(label,JSON.stringify(data.status));return data;}
 async function ready(scene){await wait(()=>ev(`window.__sccDebug?.view()?.definition.id===${scene} && !window.__sccDebug.session.loading && !window.__sccDebug.view().scc.busy && !window.__sccDebug.view().scc.programs.some(p=>p.active)`));await delay(250);}
 async function setup(scene){await send('Page.navigate',{url:`http://127.0.0.1:${port}/?debug=hitbox&audio=silent`});await wait(()=>ev('!!window.__sccDebug?.view()'));await ev(`window.__sccDebug.session.request(${scene},0,'debug')`);await ready(scene);}
 async function click(name){const p=await ev(`(()=>{const v=window.__sccDebug.view(),r=document.querySelector('#game canvas').getBoundingClientRect();for(let y=15;y<590;y+=4)for(let x=3;x<797;x+=4){const h=v.hitboxSnapshot(x,y);if(h.selectedTarget?.name===${JSON.stringify(name)})return {x:r.left+(x+0.5)*r.width/800,y:r.top+(y+0.5)*r.height/600,logical:[x,y],hit:h};}return null;})()`);evidence.steps.push({label:'click '+name,point:p});await writeFile(path.join(output,'trace.json'),JSON.stringify(evidence,null,2));if(!p)throw Error('no selectable pixel: '+name);for(const type of ['mouseMoved','mousePressed','mouseReleased'])await send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:type==='mouseMoved'?'none':'left',clickCount:1});await delay(250);}
 await send('Page.enable');
 await setup(34);await capture('fresh34');await click('To_35');await ready(35);await capture('34-to35');
 await click('To_34');await ready(34);await capture('35-to34-natural-entry');await click('To_35');await ready(35);await capture('natural34-to35');
 await setup(34);await click('Rub_off');await wait(()=>ev("window.__sccDebug.view().state.objects.get('To_8').state===1"));await ready(34);await capture('rub-off-opened');await click('To_8');await ready(8);await capture('34-to8');
 await setup(34);await click('Per_plat');await wait(()=>ev("window.__sccDebug.view().state.objects.get('Per_plat').state===1"));await ready(34);await capture('platform-cover-removed');
 await click('Knopka');await wait(()=>ev("window.__sccDebug.view().state.objects.get('Per_plat').state===2"));await ready(34);await capture('platform-video-stub-resumed');await click('To_35');await ready(35);await capture('platform34-to35');
 console.log('LEVEL34_EXIT_PROBE_PASS');
} catch(error){if(sock?.readyState===1){try{const n=++id;const response=new Promise((resolve,reject)=>pending.set(n,{resolve,reject}));sock.send(JSON.stringify({id:n,method:'Runtime.evaluate',params:{expression:'JSON.stringify({status:window.__sccDebug?.view()?.status(),programs:window.__sccDebug?.view()?.scc.programs.filter(p=>p.active)})',returnByValue:true}}));evidence.failureState=(await response).result.value;}catch(e){evidence.captureError=String(e);}}evidence.error=String(error);await writeFile(path.join(output,'trace.json'),JSON.stringify(evidence,null,2));throw error;}
finally {await resources.cleanup();}
