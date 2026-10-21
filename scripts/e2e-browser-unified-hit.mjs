#!/usr/bin/env node
import { resources } from './lib/e2e-resources.mjs';

const cdp=(process.env.E2E_CDP??'http://127.0.0.1:9222').replace(/\/$/,'');
const url=process.env.E2E_URL??'http://127.0.0.1:4173/?debug=hitbox';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function assert(ok,message){if(!ok)throw new Error(`Assertion failed: ${message}`);}
async function connect(endpoint){const socket=new WebSocket(endpoint);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});let id=0;const pending=new Map();socket.addEventListener('message',({data})=>{const message=JSON.parse(data);if(!message.id)return;const waiter=pending.get(message.id);if(!waiter)return;pending.delete(message.id);message.error?waiter.reject(new Error(message.error.message)):waiter.resolve(message.result);});return{socket,send(method,params={}){const call=++id;socket.send(JSON.stringify({id:call,method,params}));return new Promise((resolve,reject)=>pending.set(call,{resolve,reject}));}};}
const browser=await connect((await(await fetch(`${cdp}/json/version`)).json()).webSocketDebuggerUrl);
let page;
try{
  const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'});
  let target;for(let i=0;i<100;i++){target=(await(await fetch(`${cdp}/json`)).json()).find(t=>t.id===targetId);if(target?.webSocketDebuggerUrl)break;await sleep(50);}
  if(!target?.webSocketDebuggerUrl)throw new Error('Could not create isolated browser page');
  page=await connect(target.webSocketDebuggerUrl);
  const evaluate=async expression=>{const r=await page.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text??'evaluate failed');return r.result.value;};
  const wait=async(label,predicate,timeout=120000)=>{const until=Date.now()+timeout;let value;while(Date.now()<until){value=await predicate();if(value)return value;await sleep(100);}throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(value)}`);};
  const click=async(x,y)=>{const p=await evaluate(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+(${x}+.5)*r.width/800,y:r.top+(${y}+.5)*r.height/600}})()`);for(const[type,buttons]of[['mouseMoved',0],['mousePressed',1],['mouseReleased',0]])await page.send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',buttons,clickCount:1});};
  await page.send('Page.enable');await page.send('Runtime.enable');await page.send('Page.navigate',{url});
  await wait('debug API',()=>evaluate('Boolean(window.__sccDebug?.session&&window.__hitboxDebug)'));
  await evaluate("window.__sccDebug.session.request(34,-1,'debug')");
  await wait('Level34 loaded',()=>evaluate('window.__sccDebug.view()?.definition.id===34'));
  await wait('Level34 idle',()=>evaluate('(()=>{const v=window.__sccDebug.view();return !v.scc.busy&&!v.scc.programs.some(p=>p.active)})()'));
  const ognet=await evaluate("(()=>{const v=window.__sccDebug.view();return v.hitboxSnapshot(416,329)})()");
  assert(ognet.selectedTarget?.name==='Ognet','Level34 screen (416,329) shared picker selects Ognet, not Chit');
  const geometryFallback=await evaluate("(()=>{const v=window.__sccDebug.view(),o=v.objects.get('Ognet'),pixels=o?.hitPixels;if(o)o.hitPixels=undefined;const selected=v.hitboxSnapshot(416,329).selectedTarget?.name;if(o)o.hitPixels=pixels;return selected})()");
  assert(geometryFallback!=='Ognet','Object with no current image mask cannot geometrically hit');
  await evaluate("window.__sccDebug.view().setObjectVisible('Chit',false)");
  assert(await evaluate("window.__sccDebug.view().hitboxSnapshot(330,270).selectedTarget?.name!=='Chit'"),'hidden Active object is excluded from geometry');
  await evaluate("window.__sccDebug.view().setObjectVisible('Chit',true)");
  const ognetStart=await evaluate('window.__sccDebug.view().animationLog.length');
  await click(416,329);
  await wait('K_ognet execution and item52',()=>evaluate(`(()=>{const v=window.__sccDebug.view();return v.scc.inventory.includes(52)&&v.animationLog.slice(${ognetStart}).some(line=>line.includes('→K_ognet'))})()`));
  await wait('Ognet sequence completion',()=>evaluate("(()=>{const v=window.__sccDebug.view();return v.scc.inventory.includes(52)&&!v.scc.busy&&!v.scc.programs.some(p=>p.active)})()"));
  const ognetDone=await evaluate("(()=>{const v=window.__sccDebug.view();return{inventory:[...v.scc.inventory],interface:v.state.objects.get('Interface')?.state,trace:v.hitboxSnapshot(416,329).clickTrace}})()");
  assert(ognetDone.inventory.filter(id=>id===52).length===1,'Level34 K_ognet path adds item52 exactly once');
  assert(ognetDone.trace.includes('Actual selected target: Ognet'),'click trace records Ognet as the dispatched geometric target');
  const chitPoint=await evaluate("(()=>{const v=window.__sccDebug.view(),p=[330-v.scrollX,270],r=v.hitboxSnapshot(...p);return r.selectedTarget?.name==='Chit'?[...p,r.world]:null})()");
  assert(chitPoint,'Level34 point (330,270) hits Chit outside the Ognet extinguisher image');
  await evaluate('window.__sccDebug.view().setFaultRand15(()=>0)');
  const before=await evaluate('window.__audioDebug.view().audio.diagnostics().length');
  await click(chitPoint[0],chitPoint[1]);
  const fault=await wait('Chit Fault voice',async()=>{const diagnostics=await evaluate('window.__audioDebug.view().audio.diagnostics()');return diagnostics.slice(before).find(e=>e.event==='voice.playing'&&(e.url??'').toLowerCase().endsWith('otd_001.wav'));},30000);
  assert(fault,'clicking Chit outside extinguisher image dispatches Chit Fault without click-through');
  const trace=await evaluate(`window.__sccDebug.view().hitboxSnapshot(${chitPoint[0]},${chitPoint[1]}).clickTrace`);
  assert(trace.includes('Actual selected target: Chit'),'unhandled Chit remains the selected target');
  await wait('Chit Fault completion',()=>evaluate('(()=>{const v=window.__sccDebug.view();return !v.scc.busy&&!v.scc.programs.some(p=>p.active)})()'),30000);
  console.log(JSON.stringify({level34:{ognetTarget:ognet.selectedTarget,ognetDone,chitPoint,fault:fault.url,chitTrace:trace}},null,2));
  console.log('CHROMIUM UNIFIED HIT E2E PASSED');
}finally{if(page?.socket.readyState===WebSocket.OPEN)page.socket.close();if(browser.socket.readyState===WebSocket.OPEN)browser.socket.close();}
