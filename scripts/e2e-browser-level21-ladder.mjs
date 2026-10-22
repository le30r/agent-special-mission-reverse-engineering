#!/usr/bin/env node
import { resources } from './lib/e2e-resources.mjs';
import { skipStartupVideo } from './e2e-video-helpers.mjs';
/** Real-browser Level21 ladder rendering, pickup, and scene re-entry regression. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cdpEndpoint = (process.env.E2E_CDP ?? 'http://127.0.0.1:9222').replace(/\/$/, '');
const startUrl = process.env.E2E_URL ?? 'http://127.0.0.1:5177/?debug=scenes&audio=silent';
const outputDir = process.env.E2E_OUTPUT_DIR ?? resources.tempDir('artifacts');
const targets = await (await fetch(`${cdpEndpoint}/json`)).json();
const page = targets.find((target) => target.type === 'page' && target.url.includes('127.0.0.1'))
  ?? targets.find((target) => target.type === 'page');
if (!page) throw new Error(`No page target at ${cdpEndpoint}`);
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
let nextId = 1;
const pending = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(`${message.error.message}: ${JSON.stringify(message.error.data ?? null)}`));
  else waiter.resolve(message.result);
});
function send(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Runtime.evaluate failed');
  return result.result.value;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function panel() { return await evaluate("document.querySelector('.scene-debug')?.textContent ?? ''"); }
async function waitFor(description, predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await predicate();
    if (last) return last;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${description}. Last value: ${String(last)}`);
}
function assert(condition, message) { if (!condition) throw new Error(`Assertion failed: ${message}`); }

async function clickCss(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}
async function pressKey(key, code, windowsVirtualKeyCode) {
  await send('Input.dispatchKeyEvent', { type:'rawKeyDown', key, code, windowsVirtualKeyCode });
  await send('Input.dispatchKeyEvent', { type:'keyUp', key, code, windowsVirtualKeyCode });
}
async function clickButton(text, selector='button') {
  const point = await evaluate(`(() => { const item=[...document.querySelectorAll(${JSON.stringify(selector)})].find(button=>button.textContent.includes(${JSON.stringify(text)}));
    if(!item)return null;item.scrollIntoView({block:'center'});const r=item.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,disabled:item.disabled}; })()`);
  assert(point && !point.disabled, `button ${text} is visible and enabled: ${JSON.stringify(point)}`);
  await clickCss(point.x, point.y);
}
async function objectPoint(name) {
  return await evaluate(`(() => {
    const view = window.__sccDebug.view();
    const target = view.objects.get(${JSON.stringify(name)});
    if (!target) return null;
    const ordered = [...view.objects.values()].sort((a,b) => Math.abs(a.depth)-Math.abs(b.depth) || a.order-b.order);
    const hit = (object, wx, wy) => {
      if (!object.sprite.visible || object.removed || !object.hitPixels) return false;
      const px = Math.floor(wx - (object.sprite.x-object.width/2));
      const py = Math.floor(wy - (object.sprite.y-object.height/2));
      return px >= 0 && py >= 0 && px < object.width && py < object.height
        && object.hitPixels[(py*object.width+px)*4+3] !== 0;
    };
    let point;
    const candidates=[];
    for (let py=0; py<target.height; py++) for (let px=0; px<target.width; px++) {
      // CDP coordinates are mapped through floor() to integer logical screen
      // coordinates. Probe those exact integers, including the sprite's
      // fractional placement, so the candidate remains a real hit after mapping.
      const wx=Math.ceil(target.sprite.x-target.width/2)+px, wy=Math.ceil(target.sprite.y-target.height/2)+py;
      if (ordered.find((object) => Math.abs(object.depth)>0 && hit(object,wx,wy))?.name === ${JSON.stringify(name)}) candidates.push([wx,wy,px,py]);
    }
    candidates.sort((a,b)=>Math.hypot(a[2]-target.width/2,a[3]-target.height/2)-Math.hypot(b[2]-target.width/2,b[3]-target.height/2));
    if(candidates.length) point=candidates[0].slice(0,2);
    if (!point) return null;
    const canvas=document.querySelector('#game canvas'), rect=canvas.getBoundingClientRect();
    const scaleX=rect.width/800, scaleY=rect.height/600;
    return { world:point, scroll:view.scrollX, depth:target.depth, width:target.width, height:target.height,
      x:rect.left+(point[0]-view.scrollX)*scaleX, y:rect.top+point[1]*scaleY,
      sprite:target.sprite.visible, inWorld:target.sprite.parent===view.world };
  })()`);
}
async function activePoint(name) {
  return await evaluate(`(() => {
    const view=window.__sccDebug.view(), declaration=view.definition.active.get(${JSON.stringify(name)});
    if (!declaration || !view.activeVisible(${JSON.stringify(name)})) return null;
    const rect=document.querySelector('#game canvas').getBoundingClientRect(), area=declaration.rect;
    const wx=(area.left+area.right)/2, wy=(area.top+area.bottom)/2;
    return {x:rect.left+(wx-view.scrollX)*rect.width/800,y:rect.top+wy*rect.height/600,world:[wx,wy],scroll:view.scrollX};
  })()`);
}
async function screenshot(file) {
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path.join(outputDir, file), Buffer.from(data, 'base64'));
}

try {
  await mkdir(outputDir, { recursive: true });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: startUrl });
  await skipStartupVideo(send,evaluate);
  await waitFor('initial Level1', async () => (await panel()).includes('active=1'));

  // Enter a neighboring scene through its normal scene loader, then use the real
  // To_21 scene object and its canvas hit target. The debug catalog only selects
  // the setup neighbor; it does not fabricate Level21 runtime state.
  await evaluate("document.getElementById('debug-scene-20').click()");
  await waitFor('neighbor Level20', async () => (await panel()).includes('active=20'));
  const to21 = await waitFor('Level20 To_21 active hit target', async () => await activePoint('To_21'));
  await clickCss(to21.x, to21.y);
  await waitFor('Level21 via Level20 portal', async () => {
    const text = await panel();
    return text.includes('active=21') && text.includes('entry=portal[0]') ? text : false;
  });

  const initial = await evaluate(`(() => {
    const session=window.__sccDebug.session, view=window.__sccDebug.view(), obj=view.objects.get('Lest');
    return { initRuns:[...session.initRuns.entries()], background:view.definition.background,
      scc:view.definition.sccUrl, initHasStartlevel:view.animationLog.some((line)=>line.includes('animationName=Startlevel')),
      initHasStartlevel1:view.animationLog.some((line)=>line.includes('animationName=Startlevel1')),
      ladder:view.objectDebug('Lest'), shadow:view.objectDebug('Lest_ten'),
      inRenderTree:!!obj && obj.sprite.parent===view.world,
      sccObject:view.state.objects.get('Lest'), inventory:view.scc.inventory };
  })()`);
  assert(initial.background.toLowerCase().includes('scn_21'), `Level21 background path: ${initial.background}`);
  assert(initial.initRuns.some(([id,count])=>id===21 && count===1), `Init dispatch count: ${JSON.stringify(initial.initRuns)}`);
  assert(initial.initHasStartlevel && initial.initHasStartlevel1, 'both Init animations must have been dispatched');
  assert(initial.ladder?.sprite==='visible' && initial.ladder.depth===500, `Lest must render at declared depth 500: ${JSON.stringify(initial.ladder)}`);
  assert(initial.shadow?.sprite==='visible' && initial.shadow.depth===505, `Lest_ten shadow: ${JSON.stringify(initial.shadow)}`);
  assert(initial.inRenderTree, 'Lest Pixi sprite is not in SceneView world render tree');
  assert(initial.sccObject?.mult?.file==='Startlevel' && initial.sccObject.mult.frame===1, `MULT assignment: ${JSON.stringify(initial.sccObject)}`);
  const ladderPoint = await objectPoint('Lest');
  assert(ladderPoint?.sprite && ladderPoint.inWorld, `ladder hit test target: ${JSON.stringify(ladderPoint)}`);
  console.log(`Level21 initial: ${JSON.stringify(initial)}`);
  console.log(`Lest click coordinate: ${JSON.stringify(ladderPoint)}`);
  await evaluate("document.querySelector('.scene-debug').style.opacity='0'");
  await screenshot('01-level21-ladder-visible.png');

  // This is an explicit debug-UI fixture for the success branch. The actual
  // ladder pickup below is still an ordinary browser canvas click.
  await evaluate(`(() => {
    const panel=document.querySelector('.debug-panel');
    if (panel.classList.contains('collapsed')) panel.querySelector('header').click();
    const selects=panel.querySelectorAll('select'); selects[2].value='21'; selects[2].dispatchEvent(new Event('change',{bubbles:true}));
    const search=panel.querySelector('input[placeholder="Фильтр переменных"]');
    search.value='Grandmother'; search.dispatchEvent(new Event('input',{bubbles:true}));
    const row=[...panel.querySelectorAll('.debug-state-row')].find((item)=>item.textContent.includes('Grandmother'));
    if (!row) throw new Error('Grandmother state row not found in debug UI');
    const input=row.querySelector('input'); input.value='1'; input.dispatchEvent(new Event('change',{bubbles:true}));
    if (!panel.classList.contains('collapsed')) panel.querySelector('header').click();
  })()`);
  const prepared = await evaluate("window.__sccDebug.view().state.objects.get('Grandmother')?.state");
  assert(prepared===1, `Debug UI did not prepare Grandmother=1: ${prepared}`);
  await evaluate(`(() => {
    const view=window.__sccDebug.view(); window.__ladderClickTrace=[];
    const pointerDown=view.pointerDown.bind(view);
    view.pointerDown=(...args)=>{window.__ladderClickTrace.push({kind:'pointerDown',args});return pointerDown(...args)};
    const click=view.scc.click.bind(view.scc);
    view.scc.click=(...args)=>{window.__ladderClickTrace.push({kind:'scc.click',args});return click(...args)};
  })()`);

  await clickCss(ladderPoint.x, ladderPoint.y);
  await sleep(1000);
  const dispatched = await evaluate(`(() => { const view=window.__sccDebug.view(); return {
      busy:view.scc.busy, active:view.scc.programs.some((program)=>program.active),
      inventory:view.scc.inventory, grandmother:view.state.objects.get('Grandmother')?.state,
      ladder:view.objectDebug('Lest'), hidden:view.state.objects.get('Lest')?.imageHidden,
      trace:window.__ladderClickTrace, rect:document.querySelector('#game canvas').getBoundingClientRect().toJSON(),
      eventTarget:document.elementFromPoint(${ladderPoint.x},${ladderPoint.y})?.tagName } })()`);
  console.log(`After click dispatch: ${JSON.stringify(dispatched)}`);
  assert(dispatched.busy || dispatched.active || dispatched.hidden || dispatched.inventory.includes(29), `canvas click did not dispatch to SCC: ${JSON.stringify(dispatched)}`);
  await waitFor('ladder pickup/item 29', async () => {
    const value = await evaluate(`(() => { const view=window.__sccDebug.view(); return {
      inventory:view.scc.inventory, ladder:view.objectDebug('Lest'), hidden:view.state.objects.get('Lest')?.imageHidden,
      busy:view.scc.busy, state:view.state.objects.get('Grandmother')?.state } })()`);
    return value.inventory.includes(29) && value.hidden && value.ladder?.sprite==='hidden' ? value : false;
  });
  const afterPickup = await evaluate(`(() => { const view=window.__sccDebug.view(); return {
    inventory:view.scc.inventory, ladder:view.objectDebug('Lest'),
    shadow:view.objectDebug('Lest_ten'), hidden:view.state.objects.get('Lest')?.imageHidden,
    state:view.state.objects.get('Grandmother')?.state,
    snapshot:(() => { const save=window.__sccDebug.session.capturePersistentState(); const scene=save.scenes.find((item)=>item.id===21);
      return {hero:save.hero, initialized:scene?.initialized, ladder:scene?.objects.find((item)=>item.name==='Lest'),
        shadow:scene?.objects.find((item)=>item.name==='Lest_ten'), inventory:save.inventory}; })() } })()`);
  assert(afterPickup.inventory.filter((item)=>item===29).length===1, `item 29 count: ${JSON.stringify(afterPickup.inventory)}`);
  assert(afterPickup.snapshot.inventory.filter((item)=>item===29).length===1, `snapshot item 29 count: ${JSON.stringify(afterPickup.snapshot)}`);
  assert(afterPickup.snapshot.ladder?.image.kind==='empty' && afterPickup.snapshot.ladder.visible===false,
    `snapshot must preserve hidden Lest independently of State: ${JSON.stringify(afterPickup.snapshot.ladder)}`);
  assert(afterPickup.snapshot.shadow?.image.kind==='mult'
    && afterPickup.snapshot.shadow.image.reference.file==='K_lest'
    && afterPickup.snapshot.shadow.image.reference.frame===12
    && afterPickup.snapshot.shadow.visible===false,
    `snapshot must retain the actual hidden Lest_ten frame and visibility: ${JSON.stringify(afterPickup.snapshot.shadow)}`);
  await screenshot('02-level21-ladder-picked-up.png');

  await clickCss(ladderPoint.x, ladderPoint.y);
  await sleep(250);
  const afterRepeat = await evaluate("window.__sccDebug.view().scc.inventory.filter((item)=>item===29).length");
  assert(afterRepeat===1, `second click duplicated item 29: count=${afterRepeat}`);
  await waitFor('pickup SCC program idle', async () => {
    return await evaluate("!window.__sccDebug.view().scc.busy && !window.__sccDebug.view().scc.programs.some((program)=>program.active)");
  });

  // Full UI persistence check from the real Level21 ladder pickup.
  await waitFor('safe Level21 save point', async () => await evaluate('window.__saveLoadDebug?.canSave().ok'));
  await pressKey('F2','F2',113);
  await waitFor('Level21 Save UI', async () => await evaluate("Boolean(document.querySelector('.save-load-overlay')&&!document.querySelector('.save-load-overlay').hidden)"));
  await clickButton('Выбрать');
  await evaluate("(()=>{const input=document.querySelector('[aria-label=\"Название сохранения\"]');input.value='Level21 ladder';input.dispatchEvent(new Event('input',{bubbles:true}))})()");
  await clickButton('Сохранить в выбранный слот');
  await waitFor('Level21 slot saved', async () => await evaluate("document.querySelector('.save-load-dialog')?.textContent.includes('Игра сохранена')"));
  const slotEnvelope = await evaluate("localStorage.getItem('agent-revers.save.v1.slot.0')");
  const savedPayload = slotEnvelope ? JSON.parse(slotEnvelope) : null;
  assert(savedPayload?.integrity?.algorithm==='sha256-utf8','Level21 UI writes a SaveCodec envelope');
  assert(JSON.parse(savedPayload.payload).world.activeLevel===21,'saved slot payload is Level21');
  await send('Page.reload',{ignoreCache:true});
  await skipStartupVideo(send,evaluate);
  await waitFor('fresh page boot before Level21 restore', async () => await evaluate("Boolean(window.__saveLoadDebug&&window.__sccDebug?.view()?.definition.id===1)"));
  await pressKey('F3','F3',114);
  await waitFor('Level21 Load UI after reload', async () => await evaluate("Boolean(document.querySelector('.save-load-overlay')&&!document.querySelector('.save-load-overlay').hidden)"));
  await clickButton('Загрузить','.sl-slot button');
  await waitFor('Level21 restored through F3 UI', async () => await evaluate("document.querySelector('.save-load-overlay').hidden&&window.__sccDebug?.view()?.definition.id===21"));
  const restored = await evaluate(`(() => { const session=window.__sccDebug.session, view=session.view, snapshot=session.capturePersistentState(), scene=snapshot.scenes.find(item=>item.id===21);
    return { level:view.definition.id, inventory:snapshot.inventory, hero:snapshot.hero, initRuns:[...session.initRuns], grandmother:scene?.objects.find(item=>item.name==='Grandmother')?.state,
      ladder:scene?.objects.find(item=>item.name==='Lest'), shadow:scene?.objects.find(item=>item.name==='Lest_ten') } })()`);
  assert(restored.level===21 && restored.inventory.filter(item=>item===29).length===1,'F3 restores Level21 and item 29 after full reload');
  assert(restored.grandmother===1,'Grandmother state restored from the slot');
  assert(!restored.initRuns.some(([id])=>id===21),'Level21 Init did not run again after the page reload and transactional restore');
  assert(restored.ladder?.image.kind==='empty'&&restored.ladder.visible===false,'restored ladder remains hidden');
  assert(restored.shadow?.visible===false,'restored ladder shadow remains hidden');
  assert(restored.hero?.position?.length===2,'restored hero position is present');

  // Navigate through the real To_20/To_21 pair and make sure SCC Object hidden
  // state survives scene disposal/recreation rather than only the current sprite.
  const to20 = await activePoint('To_20');
  assert(to20, 'Level21 To_20 active target is not visible');
  console.log(`To_20 click coordinate: ${JSON.stringify(to20)}`);
  await clickCss(to20.x, to20.y);
  await waitFor('return to Level20 through To_20', async () => (await panel()).includes('active=20'));
  const to21Again = await waitFor('second Level20 To_21 hit target', async () => await activePoint('To_21'));
  await clickCss(to21Again.x, to21Again.y);
  await waitFor('Level21 re-entry', async () => {
    const text = await panel();
    if (!text.includes('active=21')) return false;
    const state = await evaluate("window.__sccDebug.view().objectDebug('Lest')?.sprite");
    return state==='hidden' ? text : false;
  });
  const reentry = await evaluate("({ladder:window.__sccDebug.view().objectDebug('Lest'),inventory:window.__sccDebug.view().scc.inventory})");
  assert(reentry.ladder?.sprite==='hidden' && reentry.inventory.filter((item)=>item===29).length===1, `re-entry restored ladder or lost item: ${JSON.stringify(reentry)}`);
  console.log(JSON.stringify({ initial, ladderPoint, debugPreparation: 'Grandmother=1 set through SCC State Inspector UI', afterPickup, afterRepeat, restored, reentry }, null, 2));
  console.log(`Screenshots: ${path.join(outputDir,'01-level21-ladder-visible.png')} · ${path.join(outputDir,'02-level21-ladder-picked-up.png')}`);
  console.log('LEVEL21 LADDER E2E PASSED');
} finally {
  socket.close();
}
