#!/usr/bin/env node
import { resources } from './lib/e2e-resources.mjs';
import { readFile } from 'node:fs/promises';

const cdp=(process.env.E2E_CDP??'http://127.0.0.1:9222').replace(/\/$/,'');
const url=process.env.E2E_URL??'http://127.0.0.1:4173/?debug=scenes';
const files=process.env.SAVE_FILES?.split(',')??['/Users/le30r/Downloads/agent-save-level24-2026-10-19.json','/Users/le30r/Downloads/agent-save-level29-2026-10-19.json'];
const iterations=Number(process.env.SAVE_ITERATIONS??3);
const saves=await Promise.all(files.map(async path=>{const readStart=performance.now();const serialized=await readFile(path,'utf8');return{path,serialized,fileReadMs:performance.now()-readStart};}));
const targets=await(await fetch(`${cdp}/json`)).json();
const page=targets.find(t=>t.type==='page'&&t.url.includes('127.0.0.1'))??targets.find(t=>t.type==='page');
if(!page)throw new Error(`No page target at ${cdp}`);
const socket=new WebSocket(page.webSocketDebuggerUrl);
resources.sockets.add(socket); socket.addEventListener('close',()=>resources.sockets.delete(socket),{once:true});
await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
let id=1;const pending=new Map();
socket.addEventListener('message',event=>{const m=JSON.parse(event.data);if(!m.id)return;const waiter=pending.get(m.id);if(!waiter)return;pending.delete(m.id);m.error?waiter.reject(new Error(m.error.message)):waiter.resolve(m.result);});
function send(method,params={}){const callId=id++;socket.send(JSON.stringify({id:callId,method,params}));return new Promise((resolve,reject)=>pending.set(callId,{resolve,reject}));}
async function evaluate(expression){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text??'evaluate failed');return result.result.value;}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(description,predicate,timeout=120000){const end=Date.now()+timeout;let last;while(Date.now()<end){last=await predicate();if(last)return last;await sleep(50);}throw new Error(`Timed out waiting for ${description}: ${JSON.stringify(last)}`);}
function median(values){const sorted=[...values].sort((a,b)=>a-b);return sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;}
try {
 await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url});
 await waitFor('save-load debug API',()=>evaluate('Boolean(window.__saveLoadDebug?.importSave)'));
 await evaluate(`(()=>{window.__saveLoadFetchFailures=[];const native=window.fetch.bind(window);window.fetch=async(...args)=>{try{return await native(...args)}catch(error){window.__saveLoadFetchFailures.push({url:String(args[0]),error:String(error)});throw error}}})()`);
 const records=[];
 for(const {path,serialized,fileReadMs} of saves){
   const decodeStart=performance.now();
   const decoded=await evaluate(`window.__saveLoadDebug.decodeSave(${JSON.stringify(serialized)})`);
   const validationMs=performance.now()-decodeStart;
   if(!decoded?.result?.ok)throw new Error(`Input validation failed ${path}: ${JSON.stringify(decoded)}`);
   const save=decoded.result.value;
   for(let iteration=0;iteration<iterations;iteration++){
     const t0=performance.now();
     const result=await evaluate(`window.__saveLoadDebug.importSave(${JSON.stringify(save)})`);
     const returned=performance.now()-t0;
     if(!result?.ok)throw new Error(`Import failed ${path}: ${JSON.stringify(result)}; fetchFailures=${JSON.stringify(await evaluate('window.__saveLoadFetchFailures'))}`);
     const diagnostics=await evaluate('window.__saveLoadDebug.restoreDiagnostics()');
     const texturesAtImport=await evaluate('window.__saveLoadDebug.textureDiagnostics()');
     const frameStart=performance.now();
     await evaluate('new Promise(resolve=>requestAnimationFrame(()=>resolve(true)))');
     const firstFrame=performance.now()-t0;
     const texturesAfterFirstFrame=await evaluate('window.__saveLoadDebug.textureDiagnostics()');
     const controlStart=performance.now();
     await waitFor('player input availability',()=>evaluate('(()=>{const v=window.__sccDebug?.view();return v&&!v.status().busy&&!v.status().blocked})()'));
     const control=performance.now()-t0;
     records.push({scene:save.world.activeLevel,iteration,fileReadMs,validationMs,decodePhases:decoded.phases,importReturnedMs:returned,firstFrameMs:firstFrame,controlMs:control,texturesAtImport,texturesAfterFirstFrame,phases:diagnostics?.phases,totalMs:diagnostics?.totalMs});
     await sleep(50);
   }
 }
 await waitFor('save eligibility for roundtrip',()=>evaluate('window.__saveLoadDebug.canSave()?.ok'));
 const roundtrip=await evaluate("window.__saveLoadDebug.exportSave('save-load performance roundtrip')");
 if(!roundtrip?.ok)throw new Error(`Roundtrip export failed: ${JSON.stringify(roundtrip)}`);
 const identityFailure=await evaluate(`(async()=>{const session=window.__sccDebug.session;window.__saveLoadPreviousView=session.view;const bad=structuredClone(${JSON.stringify(roundtrip.value)});const scene=bad.world.scenes.find(x=>x.initialized&&x.id!==bad.world.activeLevel);scene.objects.find(x=>!x.placeholder).name='INVALID_SAVE_IDENTITY';const result=await window.__saveLoadDebug.importSave(bad);return{result,unchanged:session.view===window.__saveLoadPreviousView,active:session.view?.definition.id}})()`);
 if(identityFailure.result?.ok||identityFailure.result?.error?.code!=='IncompatibleSave'||!identityFailure.unchanged)throw new Error(`Restore error was not transactional: ${JSON.stringify(identityFailure)}`);
 const restored=await evaluate(`window.__saveLoadDebug.importSave(${JSON.stringify(roundtrip.value)})`);
 if(!restored?.ok)throw new Error(`Save/Load roundtrip import failed: ${JSON.stringify(restored)}`);
 const ownership=await evaluate('window.__sccDebug.session.provider.resourceCacheStats');
 if(ownership.providerLeases!==1||ownership.sharedScenes!==1||ownership.sharedLeaseRefs!==1||ownership.validationIndexes>32)throw new Error(`Restore resource ownership leaked: ${JSON.stringify(ownership)}`);
 const summary=[...new Set(records.map(record=>record.scene))].map(scene=>{
   const values=records.filter(record=>record.scene===scene);
   const cold=values.filter(record=>record.iteration===0),warm=values.filter(record=>record.iteration>0);
   const sample=group=>({
     runs:group.length,
     validationMs:median(group.map(record=>record.validationMs)),
     sha256Ms:median(group.map(record=>record.decodePhases.sha256Ms)),
     jsonParseMs:median(group.map(record=>record.decodePhases.envelopeJsonMs+record.decodePhases.payloadJsonMs)),
     resourcePreparationMs:median(group.map(record=>record.phases.activeSceneResources+record.phases.visitedSceneValidationResources)),
     sceneRestoreMs:median(group.map(record=>record.phases.visitedStateRestore+record.phases.sceneViewCreation+record.phases.objectAndHeroRestore+record.phases.startDispatch)),
     importMs:median(group.map(record=>record.totalMs)),
     firstFrameMs:median(group.map(record=>record.firstFrameMs)),
     controlAvailableMs:median(group.map(record=>record.controlMs)),
   });
   return{scene,cold:sample(cold),warm:sample(warm)};
 });
 console.log(JSON.stringify({records,summary,checks:{saveLoadRoundtrip:true,invalidRestoreTransactional:true,resourceOwnership:ownership}},null,2));
} finally { socket.close(); }
