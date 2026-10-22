#!/usr/bin/env node
import { resources } from './lib/e2e-resources.mjs';
import { skipStartupVideo } from './e2e-video-helpers.mjs';
/** Level3 StartW concurrency, real pickups, old-save restore, and portal re-entry. */
import { installE2EAudioPolicy } from './e2e-audio-policy.mjs';
const cdp=(process.env.E2E_CDP??'http://127.0.0.1:9222').replace(/\/$/,'');
const url=process.env.E2E_URL??'http://127.0.0.1:5197/?debug=scenes';
const targets=await(await fetch(`${cdp}/json`)).json();
const page=targets.find(t=>t.type==='page'&&t.url.includes('127.0.0.1'))??targets.find(t=>t.type==='page');
if(!page)throw new Error(`No page target at ${cdp}`);
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let id=1;const pending=new Map();
socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(!m.id)return;const waiter=pending.get(m.id);if(!waiter)return;pending.delete(m.id);m.error?waiter.reject(new Error(m.error.message)):waiter.resolve(m.result);});
function send(method,params={}){const callId=id++;socket.send(JSON.stringify({id:callId,method,params}));return new Promise((resolve,reject)=>pending.set(callId,{resolve,reject}));}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text??'evaluate failed');return result.result.value;}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(description,predicate,timeout=90000){const end=Date.now()+timeout;let last;while(Date.now()<end){last=await predicate();if(last)return last;await sleep(100);}throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(last)}`);}
function assert(ok,message){if(!ok)throw new Error(`Assertion failed: ${message}`);}
async function canvasClick(screenX,screenY){const p=await evaluate(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+(${screenX})*r.width/800,y:r.top+(${screenY})*r.height/600}})()`);for(const[type,buttons]of[['mouseMoved',0],['mousePressed',1],['mouseReleased',0]])await send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',buttons,clickCount:1});}
async function worldClick(worldX,worldY){const p=await evaluate(`(()=>{const v=window.__sccDebug.view(),r=document.querySelector('canvas').getBoundingClientRect();return{x:r.left+(${worldX}-v.scrollX+.5)*r.width/800,y:r.top+(${worldY}+.5)*r.height/600}})()`);for(const[type,buttons]of[['mouseMoved',0],['mousePressed',1],['mouseReleased',0]])await send('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',buttons,clickCount:1});}
async function activeClick(name){const p=await evaluate(`(()=>{const v=window.__sccDebug.view(),d=v.definition.active.get(${JSON.stringify(name)});if(!d?.rect)return null;const r=d.rect;for(let y=Math.floor(r.top)+1;y<Math.ceil(r.bottom);y+=2)for(let x=Math.floor(r.left-v.scrollX)+1;x<Math.ceil(r.right-v.scrollX);x+=2)if(v.hitboxSnapshot(x,y).selectedTarget?.name===${JSON.stringify(name)})return[x+v.scrollX,y];return null})()`);assert(p,`Active ${name} has a point selected by the unified picker`);await worldClick(...p);}
const view=`(()=>{const v=window.__sccDebug.view();return{scene:v.definition.id,scrollX:v.scrollX,initialized:v.state.initialized,interface:v.state.objects.get('Interface')?.state,busy:v.scc.busy,moving:v.moving,inventory:[...v.scc.inventory],kSlip:v.player.state('K_slip'),programs:v.scc.programs.map(p=>({active:p.active,waiting:p.waiting,waitName:p.waitName,pc:p.pc,commands:p.program.commands}))}})()`;
const state=`(()=>{const v=window.__sccDebug.view();return{scene:v.definition.id,initialized:v.state.initialized,interface:v.state.objects.get('Interface')?.state,inventory:[...v.scc.inventory],objects:[...v.state.objects.values()]}})()`;
try {
  await send('Page.enable');await send('Page.bringToFront');await installE2EAudioPolicy(send);await send('Runtime.enable');await send('Page.navigate',{url});await skipStartupVideo(send,evaluate);
  await waitFor('initial scene debug API',async()=>await evaluate('Boolean(window.__sccDebug?.view())'));
  await evaluate("window.__sccDebug.session.request(3,-1,'debug')");
  await waitFor('Level3 StartW K_slip',async()=>{const v=await evaluate(view);return v.scene===3&&v.programs.some(p=>p.active&&p.waiting&&p.waitName==='K_slip')?v:false});
  const before=await evaluate(view);
  assert(before.interface===0&&before.busy,'new Level3 entry starts Interface=0 with busy asserted by K_slip');
  await worldClick(1090,580);
  const during=await evaluate(view);
  assert(during.scene===3&&during.interface===0&&during.busy,'real canvas click during K_slip leaves Interface and busy unchanged');
  assert(during.programs.some(p=>p.active&&p.waiting&&p.waitName==='K_slip'),'K_slip continuation survives the click');
  assert(!during.moving,'busy click does not start a user route');
  let introProgress;
  try {
    await waitFor('K_slip continuation and Interface=1',async()=>{const v=await evaluate(view);introProgress=v;return v.interface===1&&!v.programs.some(p=>p.active)?v:false},120000);
  } catch(error) {
    console.error('Level3 intro state at timeout:',JSON.stringify(introProgress));
    throw error;
  }
  const healthy=await evaluate(state);
  assert(healthy.initialized&&healthy.interface===1,'StartW continuation executed State Interface 1');

  const overlap=await evaluate(`(()=>{const v=window.__sccDebug.view(),saved=v.scrollX;v.scrollX=500;v.root.x=-500;const report=v.hitboxSnapshot(45,502);v.scrollX=saved;v.root.x=-saved;return{target:report.selectedTarget,world:report.world,interface:v.state.objects.get('Interface')?.state,scroll:report.scrollX}})()`);
  assert(overlap.scroll===500&&overlap.world[0]===545,'Level3 overlap probe uses screen (45,502), world (545,502), scroll=500');
  assert(overlap.target?.name==='Iach_click','unified picker chooses Iach_click ahead of overlapping Forma at scroll=500');
  assert(overlap.interface===1,'Level3 pickup Case precondition remains Interface.state=1');

  const pickupPoints=[['Plocat',870,321,8,13],['Iach_click',544,516,9,34],['Stool',977,479,10,9]];
  for(const[name,x,y,item]of pickupPoints){
    await worldClick(x,y);
    await waitFor(`${name} real SCC pickup item ${item}`,async()=>await evaluate(`window.__sccDebug.view().scc.inventory.filter(x=>x===${item}).length===1&&(()=>{const p=window.__sccDebug.view().scc.programs;return !p.some(x=>x.active)})()`));
    const count=await evaluate(`window.__sccDebug.view().scc.inventory.filter(x=>x===${item}).length`);
    assert(count===1,`${name} adds item ${item} once`);
    await worldClick(x,y);await sleep(350);
    assert(await evaluate(`window.__sccDebug.view().scc.inventory.filter(x=>x===${item}).length===1`),`${name} cannot be collected twice`);
  }
  await waitFor('Save/Load safe boundary',async()=>await evaluate('window.__saveLoadDebug.canSave().ok'));
  const healthySave=await evaluate("window.__saveLoadDebug.exportSave('Level3 busy E2E')");
  assert(healthySave?.ok,'healthy Level3 state exports through real SaveLoad runtime');
  const save=healthySave.value;
  const savedScene=save.world.scenes.find(s=>s.id===3);
  assert(savedScene,'export includes persistent Level3 state');
  const savedInterface=savedScene.objects.find(o=>o.name==='Interface');
  assert(savedInterface&&savedInterface.state===1,'healthy save stores Interface=1');
  for(const[name,,,,frame]of pickupPoints){const obj=savedScene.objects.find(o=>o.name===name);assert(obj?.image?.kind==='mult'&&obj.image.reference.frame===frame&&obj.visible===false,`${name} persists at its empty MULT frame ${frame} and hidden`);}
  for(const[, , ,item]of pickupPoints)assert(save.world.inventory.filter(x=>x===item).length===1,`saved inventory contains item ${item} exactly once`);

  // Emulate a valid legacy save captured while the introduction was interrupted.
  const oldSave=structuredClone(save);oldSave.label='Legacy Level3 Interface=0';oldSave.world.scenes.find(s=>s.id===3).objects.find(o=>o.name==='Interface').state=0;
  const restored=await evaluate(`window.__saveLoadDebug.importSave(${JSON.stringify(oldSave)})`);
  assert(restored?.ok,`old Interface=0 save loads: ${JSON.stringify(restored)}`);
  await waitFor('restored Level3 starts K_slip',async()=>{const v=await evaluate(view);return v.scene===3&&v.interface===0&&v.programs.some(p=>p.active&&p.waiting&&p.waitName==='K_slip')?v:false});
  await worldClick(1090,580);
  const oldDuring=await evaluate(view);
  assert(oldDuring.busy&&oldDuring.interface===0&&!oldDuring.moving&&oldDuring.programs.some(p=>p.active&&p.waitName==='K_slip'),'legacy-save intro cannot be interrupted by a real click');
  await waitFor('legacy-save Start continuation',async()=>{const v=await evaluate(view);return v.interface===1&&!v.programs.some(p=>p.active)?v:false},120000);
  await waitFor('post-restore save eligibility',async()=>await evaluate('window.__saveLoadDebug.canSave().ok'));
  const afterOldLoad=await evaluate(state);
  assert(afterOldLoad.inventory.filter(x=>[8,9,10].includes(x)).length===3,'legacy restore retains each collected pickup once');

  // As in the Level3 research control, choose the predecessor through the debug
  // selector, then use the real Level4 To3 Active to re-enter Level3.
  await evaluate("window.__sccDebug.session.request(4,-1,'debug')");
  await waitFor('Level4 predecessor scene',async()=>await evaluate('window.__sccDebug.view().definition.id===4'),45000);
  await activeClick('To3');
  await waitFor('real portal Level4 -> Level3',async()=>await evaluate('window.__sccDebug.view().definition.id===3'),45000);
  await waitFor('re-entry Start Programs complete',async()=>{const v=await evaluate(view);return v.scene===3&&!v.programs.some(p=>p.active)?v:false},60000);
  const reentered=await evaluate(state);
  assert(reentered.interface===1,'ordinary Level3 re-entry keeps Interface=1 and does not replay K_slip');
  assert([8,9,10].every(item=>reentered.inventory.filter(x=>x===item).length===1),'portal re-entry preserves all pickups exactly once');
  await waitFor('re-entry Save/Load safe boundary',async()=>await evaluate('window.__saveLoadDebug.canSave().ok'));
  const roundtrip=await evaluate("window.__saveLoadDebug.exportSave('Level3 re-entry roundtrip')");
  assert(roundtrip.ok,`post-re-entry save succeeds: ${JSON.stringify(roundtrip)}`);
  assert((await evaluate(`window.__saveLoadDebug.importSave(${JSON.stringify(roundtrip.value)})`))?.ok,'post-re-entry Save/Load import succeeds');
  await waitFor('post-roundtrip scene ready',async()=>await evaluate('window.__saveLoadDebug.canSave().ok'));
  const final=await evaluate(state);
  assert(final.interface===1&&[8,9,10].every(item=>final.inventory.filter(x=>x===item).length===1),'Save/Load roundtrip preserves Level3 Interface and pickups');
  console.log('Level3 busy E2E passed: K_slip click protection, unified Iach_click/Forma overlap at scroll=500, real item 8/9/10 pickups and repeats, Interface=0 legacy restore, portal re-entry, and Save/Load.');
} finally {socket.close();}
