import { boot, enter, ev, sleep, state, shot, world, close, wait } from './cdp.mjs';
import { probe, trace } from './hits.mjs';
import { writeFile } from 'node:fs/promises';
const dir = process.cwd() + '/research/gameplay/evidence/level3-regression';
const save = async (n, x) => writeFile(dir + '/' + n + '.json', JSON.stringify(x, null, 2));
async function active(n) { const p = await ev(`(()=>{const v=window.__sccDebug.view(),d=v.definition.active.get(${JSON.stringify(n)});return [(d.rect.left+d.rect.right)/2,(d.rect.top+d.rect.bottom)/2]})()`); await world(...p); }
try {
    await boot();
    await enter(4);
    await active('To3');
    await wait('window.__sccDebug.view().definition.id===3');
    await save('natural-early', await ev(state));
    await wait('window.__sccDebug.view().state.objects.get("Interface").state===1&&!window.__sccDebug.view().scc.programs.some(p=>p.active)', 45000);
    await save('natural-complete', await ev(state));
    await trace();
    const results = [];
    for (const n of ['Plocat', 'Iach_click', 'Stool']) {
        const p = await probe(n);
        await world(...p.best.world);
        await wait('!window.__sccDebug.view().scc.programs.some(p=>p.active)', 45000);
        const after = await ev(state);
        await world(...p.best.world);
        await sleep(500);
        results.push({ probe: p, after, repeat: await ev(state) });
    }
    await save('natural-pickups', results);
    await save('natural-trace', await ev('window.__trace'));
    await shot(dir + '/natural-all-items.png');
    await wait('window.__sccDebug.session.canSave().ok', 30000);
    const s = await ev("window.__sccDebug.session.exportSave('Healthy Level3 after natural entry and pickups')");
    await save('healthy-save', s);
    console.log('save', s.ok);
    console.log('restore', await ev('window.__sccDebug.session.importSave(' + JSON.stringify(s.value) + ')'));
    await sleep(500);
    await save('healthy-restore', await ev(state));
    while (await ev('window.__sccDebug.view().scrollX>0')) {
        const x = await ev('window.__sccDebug.view().scrollX+30');
        await world(x, 575);
        await wait('!window.__sccDebug.view().moving&&!window.__sccDebug.view().scc.busy', 30000);
        await sleep(300);
    }
    const stair = await probe('Lec_v');
    await world(...stair.best.world);
    await wait('window.__sccDebug.view().definition.id===4', 45000);
    await active('To3');
    await wait('window.__sccDebug.view().definition.id===3');
    await wait('!window.__sccDebug.view().scc.programs.some(p=>p.active)', 45000);
    await save('healthy-reentry', await ev(state));
    await save('natural-transitions', await ev('window.__sccDebug.session.transitionLog'));
    console.log('finished natural');
}
finally {
    close();
}
