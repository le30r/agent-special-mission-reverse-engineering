import { ev, sleep, state, shot, world, close, wait, send } from './cdp.mjs';
import { probe, trace } from './hits.mjs';
import { writeFile } from 'node:fs/promises';
const revision = process.argv[3] ?? 'd910b1d', url = process.argv[2] ?? 'http://127.0.0.1:5184/?debug=scenes';
const dir = process.cwd() + '/research/gameplay/evidence/level3-regression';
async function start() { await send('Page.navigate', { url }); await wait('document.querySelector(".scene-debug")?.textContent.includes("active=1")'); await ev(`(async()=>{const {SceneView}=await import('/src/scene/scene-view.ts'); const original=SceneView.prototype.dispatchStart;SceneView.prototype.dispatchStart=function(...args){window.__sccDebug={view:()=>this};return original.apply(this,args)}})()`); await ev("document.getElementById('debug-scene-3').click()"); await wait('window.__sccDebug?.view()?.definition.id===3'); }
try {
    let result = { revision, url };
    await start();
    await sleep(1000);
    result.early = await ev(state);
    await trace();
    await world(1090, 580);
    await wait('!window.__sccDebug.view().player.isActive("K_slip")', 45000);
    result.interrupted = await ev(state);
    result.hits = [];
    for (const n of ['Plocat', 'Iach_click', 'Stool']) {
        const p = await probe(n);
        if (p.best)
            await world(...p.best.world);
        await sleep(150);
        result.hits.push({ probe: p, after: await ev(state) });
    }
    result.trace = await ev('window.__trace');
    await start();
    await wait('window.__sccDebug.view().state.objects.get("Interface").state===1', 45000);
    result.undisturbed = await ev(state);
    result.controlHits = [];
    for (const n of ['Plocat', 'Iach_click', 'Stool']) {
        const p = await probe(n);
        if (p.best)
            await world(...p.best.world);
        await wait('!window.__sccDebug.view().scc.programs.some(p=>p.active)', 45000);
        result.controlHits.push({ probe: p, after: await ev(state) });
    }
    await writeFile(dir + '/history-' + revision + '.json', JSON.stringify(result, null, 2));
    console.log(revision, { early: result.early.status.busy, interrupted: result.interrupted.objects[0], control: result.undisturbed.objects[0], inventory: result.controlHits.at(-1).after.status.inventory });
}
finally {
    close();
}
