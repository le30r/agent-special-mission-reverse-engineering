#!/usr/bin/env node
/** Chromium core roundtrip: real pickup, same-scene transactional rollback, real pickup again. */
const cdp=(process.env.E2E_CDP??'http://127.0.0.1:9222').replace(/\/$/,'');
const url=process.env.E2E_URL??'http://127.0.0.1:4173/?debug=save';
const targets=await(await fetch(`${cdp}/json`)).json();
const page=targets.find(t=>t.type==='page'&&t.url.includes('127.0.0.1'))??targets.find(t=>t.type==='page');
if(!page) throw new Error(`No page target at ${cdp}`);
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let id=1;const pending=new Map();
socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(!m.id)return;const waiter=pending.get(m.id);if(!waiter)return;pending.delete(m.id);m.error?waiter.reject(new Error(m.error.message)):waiter.resolve(m.result);});
function send(method,params={}){const callId=id++;socket.send(JSON.stringify({id:callId,method,params}));return new Promise((resolve,reject)=>pending.set(callId,{resolve,reject}));}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text??'evaluate failed');return result.result.value;}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(description,predicate,timeout=90000){const end=Date.now()+timeout;let last;while(Date.now()<end){last=await predicate();if(last)return last;await sleep(100);}throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(last)}`);}
async function click(x,y){const rect=await evaluate(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return{left:r.left,top:r.top,width:r.width,height:r.height}})()`);const cx=rect.left+x*rect.width/800,cy=rect.top+y*rect.height/600;await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:cx,y:cy});await send('Input.dispatchMouseEvent',{type:'mousePressed',x:cx,y:cy,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:cx,y:cy,button:'left',buttons:0,clickCount:1});}
function assert(ok,message){if(!ok)throw new Error(`Assertion failed: ${message}`);}
try {
  await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url});
  await waitFor('eligible Level1 post-tick boundary',async()=>{const v=await evaluate('window.__saveLoadDebug?.canSave()');return v?.ok?v:false;});
  const saved=await evaluate("window.__saveLoadDebug.exportSave('same-scene baseline')");
  assert(saved?.ok&&saved.value.world.activeLevel===1,'export produced Level1 GameSaveV1');
  await click(506,569);
  await waitFor('real SCC pistol pickup',async()=>await evaluate('window.__sccDebug?.view()?.scc.inventory.includes(4)'));
  const incompatible=structuredClone(saved.value);incompatible.contentId='different-content';
  const rejected=await evaluate(`window.__saveLoadDebug.importSave(${JSON.stringify(incompatible)})`);
  assert(!rejected?.ok,`incompatible save rejected: ${JSON.stringify(rejected)}`);
  assert(await evaluate('window.__sccDebug?.view()?.scc.inventory.includes(4)'),'validation failure leaves the current game playable and unchanged');
  const loaded=await evaluate(`window.__saveLoadDebug.importSave(${JSON.stringify(saved.value)})`);
  assert(loaded?.ok,`same-scene import succeeds: ${JSON.stringify(loaded)}`);
  const rolledBack=await evaluate(`(()=>{const s=window.__sccDebug.session.capturePersistentState();return{level:s.currentSceneId,inventory:s.inventory,hidden:s.scenes.find(x=>x.id===1)?.objects.find(x=>x.name==='Pistol')?.imageHidden}})()`);
  assert(rolledBack.level===1&&rolledBack.inventory.length===0,'same-scene import rolled back canonical inventory');
  await click(506,569);
  await waitFor('post-load gameplay pickup',async()=>await evaluate('window.__sccDebug?.view()?.scc.inventory.includes(4)'));
  console.log('Save/Load Core E2E passed: same-scene rollback and subsequent SCC pickup work without page reload.');
} finally { socket.close(); }
