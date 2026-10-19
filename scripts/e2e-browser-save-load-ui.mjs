import { resources } from './lib/e2e-resources.mjs';
/** UI-only save/reload/load plus downloaded JSON import with a real canvas pickup. */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
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
async function clickSelector(selector, text) {
  const point=await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(x=>${text?`x.textContent.includes(${JSON.stringify(text)})`:'true'});if(!e)return null;e.scrollIntoView({block:'center',inline:'nearest'});const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,disabled:e.disabled}})()`);
  assert(point&&!point.disabled,`click target ${selector} ${text??''} exists/enabled`);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y});await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,clickCount:1});
}
async function fkey(key){await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code:key,windowsVirtualKeyCode:key==='F2'?113:114});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:key==='F2'?113:114});}
try {
  const downloadDir=resources.tempDir('downloads');
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloadDir});
  await send('Page.enable');await send('Runtime.enable');await send('Page.navigate',{url});
  await waitFor('active Level1',async()=>await evaluate('Boolean(window.__saveLoadDebug&&window.__sccDebug?.view())'));
  await waitFor('eligible save point',async()=>await evaluate('window.__saveLoadDebug.canSave().ok'));
  const rect=await evaluate(`(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return{left:r.left,top:r.top,width:r.width,height:r.height}})()`);
  const x=rect.left+506*rect.width/800,y=rect.top+569*rect.height/600;
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
  await waitFor('real pistol pickup',async()=>await evaluate('window.__sccDebug.view().scc.inventory.includes(4)'));
  await waitFor('post-pickup save eligibility',async()=>await evaluate('window.__saveLoadDebug.canSave().ok'));
  await fkey('F2');
  await waitFor('Save UI',async()=>await evaluate("!document.querySelector('.save-load-overlay').hidden"));
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await waitFor('Escape closes menu',async()=>await evaluate("document.querySelector('.save-load-overlay').hidden"));
  await fkey('F2');await waitFor('F2 reopens menu',async()=>await evaluate("!document.querySelector('.save-load-overlay').hidden"));
  await clickSelector('.sl-slot button','Выбрать');
  await evaluate("(()=>{const e=document.querySelector('[aria-label=\"Название сохранения\"]');e.value='UI roundtrip';e.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await clickSelector('button','Сохранить в выбранный слот');
  await waitFor('success message',async()=>await evaluate("document.querySelector('.save-load-dialog')?.textContent.includes('Игра сохранена')"));
  const stored=await evaluate("localStorage.getItem('agent-revers.save.v1.slot.0')");
  assert(stored&&JSON.parse(stored).integrity.algorithm==='sha256-utf8','slot stores SaveCodec envelope');
  await send('Page.reload',{ignoreCache:true});
  await waitFor('new page runtime',async()=>await evaluate('Boolean(window.__saveLoadDebug&&window.__sccDebug?.view())'));
  await waitFor('reloaded Level1 ready',async()=>await evaluate('window.__saveLoadDebug?.canSave().ok'));
  await fkey('F3');await waitFor('Load UI after reload',async()=>await evaluate("Boolean(document.querySelector('.save-load-overlay')&&!document.querySelector('.save-load-overlay').hidden)"));
  await clickSelector('.sl-slot button','Загрузить');
  await waitFor('restore closed UI',async()=>await evaluate("document.querySelector('.save-load-overlay').hidden&&document.querySelector('.save-load-toast')?.textContent==='Игра загружена'"));
  const world=await evaluate("(()=>{const s=window.__sccDebug.session.capturePersistentState();const botl=window.__sccDebug.session.loader.state(1).objects.get('Botl');return{inventory:s.inventory,botlState:botl?.state,botlHidden:botl?.imageHidden,level:window.__sccDebug.view().definition.id}})()");
  assert(world.level===1&&world.inventory.includes(4),'inventory and level restored via UI');
  assert(world.botlState===0&&!world.botlHidden,'unrelated bottle state remains intact');
  assert(await evaluate("document.querySelector('.save-load-toast')?.textContent==='Игра загружена'"),'user-visible success notification shown');
  await waitFor('post-restore export eligibility',async()=>await evaluate('window.__saveLoadDebug.canSave().ok'));
  await evaluate("(()=>{const click=HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click=function(){if(this.download?.endsWith('.json'))window.__saveDownloadFilename=this.download;return click.call(this)};const create=URL.createObjectURL.bind(URL);URL.createObjectURL=(blob)=>{if(blob.type==='application/json')window.__saveDownloadTextPromise=blob.text().then(text=>window.__saveDownloadText=text);return create(blob)}})()");
  await fkey('F2');await waitFor('Save UI for file export',async()=>await evaluate("Boolean(document.querySelector('.save-load-overlay')&&!document.querySelector('.save-load-overlay').hidden)"));
  await clickSelector('button','Экспортировать текущее состояние');
  const exportResult=await waitFor('export result message',async()=>await evaluate("document.querySelector('.sl-message,.sl-error')?.textContent||false"),10000);
  assert(exportResult==='Сохранение экспортировано',`UI export succeeded, got ${exportResult}`);
  const filename=await evaluate('window.__saveDownloadFilename'); assert(/^agent-save-level1-\d{4}-\d{2}-\d{2}\.json$/.test(filename),'UI export creates a safe level/date JSON filename');
  const exported=await waitFor('exported JSON Blob payload',async()=>await evaluate('window.__saveDownloadText||false'),10000);
  const exportedEnvelope=JSON.parse(exported);
  assert(exportedEnvelope.storageVersion===1&&exportedEnvelope.integrity?.algorithm==='sha256-utf8','download contains the full SaveCodec envelope and digest');
  const exportPath=path.join(downloadDir,filename); await writeFile(exportPath,exported,'utf8');
  await evaluate("(()=>{for(let i=0;i<6;i++)localStorage.removeItem(`agent-revers.save.v1.slot.${i}`)})()");
  await send('Page.reload',{ignoreCache:true});
  await waitFor('fresh runtime after clearing slots',async()=>await evaluate('Boolean(window.__saveLoadDebug?.canSave().ok)'));
  assert(await evaluate("Array.from({length:6},(_,i)=>localStorage.getItem(`agent-revers.save.v1.slot.${i}`)).every(x=>x===null)"),'test profile slots are empty before file import');
  await evaluate('document.activeElement instanceof HTMLElement && document.activeElement.blur()');
  await fkey('F3');await waitFor('Load UI for file import',async()=>await evaluate("Boolean(document.querySelector('.save-load-overlay')&&!document.querySelector('.save-load-overlay').hidden)"),10000);
  await clickSelector('button','Импортировать JSON');
  const documentTree=await send('DOM.getDocument');const fileNode=await send('DOM.querySelector',{nodeId:documentTree.root.nodeId,selector:'input[type="file"]'});
  await send('DOM.setFileInputFiles',{files:[exportPath],nodeId:fileNode.nodeId});
  await waitFor('file metadata preview',async()=>await evaluate("Boolean(document.querySelector('.sl-file-preview')?.textContent.includes('Текущее состояние'))"),10000);
  await clickSelector('button','Загрузить этот файл');
  await waitFor('file import restore',async()=>await evaluate("document.querySelector('.save-load-overlay').hidden&&document.querySelector('.save-load-toast')?.textContent==='Игра загружена'"));
  const imported=await evaluate("(()=>({inventory:window.__sccDebug.session.capturePersistentState().inventory,slots:Array.from({length:6},(_,i)=>localStorage.getItem(`agent-revers.save.v1.slot.${i}`))}))()");
  assert(imported.inventory.includes(4),'exported JSON restores through file picker and UI confirmation');
  assert(imported.slots.every(x=>x===null),'file import does not write any persistent slot');
  console.log('Save/Load UI E2E passed: real pickup, F2 slot save, hard reload, F3 load, current-state JSON download, clean-slot file import, restored live scene.');
} finally {
  try { await Promise.race([send('Browser.setDownloadBehavior',{behavior:'default'}),sleep(1000)]); } finally {
    await resources.cleanup();
  }
}
