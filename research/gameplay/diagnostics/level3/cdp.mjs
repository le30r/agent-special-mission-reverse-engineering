import { readFile, writeFile, mkdir } from 'node:fs/promises';
const targets = await (await fetch((process.env.E2E_CDP ?? 'http://127.0.0.1:9383') + '/json')).json();
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(m.error) : p.resolve(m.result);
} });
export function send(method, params = {}) { const id = ++seq; ws.send(JSON.stringify({ id, method, params })); return new Promise((resolve, reject) => pending.set(id, { resolve, reject })); }
export async function ev(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails)
    throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value; }
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function wait(expr, ms = 30000) { const end = Date.now() + ms; while (Date.now() < end) {
    const v = await ev(expr);
    if (v)
        return v;
    await sleep(100);
} throw Error('timeout ' + expr); }
export async function click(x, y) { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); }
export async function world(x, y) { const p = await ev(`(()=>{const v=window.__sccDebug.view(),r=document.querySelector('canvas').getBoundingClientRect();return [r.left+(${x}-v.scrollX+.25)*r.width/800,r.top+(${y}+.25)*r.height/600]})()`); await click(...p); }
export async function shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(file, Buffer.from(r.data, 'base64')); }
export const state = `(()=>{const v=window.__sccDebug.view();return {id:v.definition.id,status:v.status(),initialized:v.state.initialized,objects:[...v.state.objects.values()],programs:v.scc.programs.map(p=>({...p,program:p.program})),animations:[...v.player.states],animationLog:v.animationLog}})()`;
export async function boot() { await send('Page.navigate', { url: process.env.E2E_URL ?? 'http://127.0.0.1:5183/?debug=scenes' }); await wait('window.__sccDebug?.view()?.definition.id===1'); await ev("document.querySelector('.debug-panel')?.classList.add('collapsed')"); }
export async function enter(id) { await ev(`window.__sccDebug.session.request(${id},-1,'debug')`); await wait(`window.__sccDebug.view().definition.id===${id}`); }
export function close() { ws.close(); }
if (process.argv[1]?.endsWith("/cdp.mjs") && process.argv[2]) {
    try {
        console.log(JSON.stringify(await ev(process.argv[2]), null, 2));
    }
    finally {
        close();
    }
}
