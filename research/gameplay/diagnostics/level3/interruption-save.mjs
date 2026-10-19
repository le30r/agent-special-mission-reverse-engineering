/** Observational reproduction only: no State/Addtol injection or production edits. */
import { boot, enter, ev, sleep, state, shot, world, close, wait } from './cdp.mjs';
import { trace } from './hits.mjs';
import { readFile, writeFile } from 'node:fs/promises';
const dir = 'research/gameplay/evidence/level3-regression';
const save = (name, value) => writeFile(`${dir}/${name}.json`, JSON.stringify(value, null, 2));
try {
    await boot();
    await enter(3);
    await sleep(1000);
    await trace();
    await save('interrupted-before', await ev(state));
    await world(1090, 580);
    await wait('!window.__sccDebug.view().player.isActive("K_slip")', 45000);
    await save('interrupted-after', await ev(state));
    await save('interrupted-trace', await ev('window.__trace'));
    await ev("document.querySelector('.scene-debug').style.opacity='0'");
    await shot(`${dir}/interrupted-after.png`);
    const input = JSON.parse(await readFile(process.argv[2] ?? `${dir}/user-save.json`, 'utf8'));
    await boot();
    const payload = typeof input.payload === 'string' ? JSON.parse(input.payload) : input;
    const result = await ev('window.__sccDebug.session.importSave(' + JSON.stringify(payload) + ')');
    if (!result.ok)
        throw Error(JSON.stringify(result));
    await save('user-restore-immediate', await ev(state));
    await wait('!window.__sccDebug.view().scc.programs.some(p=>p.active)', 45000);
    await save('user-restore-complete', await ev(state));
    await ev("document.querySelector('.scene-debug').style.opacity='0'");
    await shot(`${dir}/user-restore-complete.png`);
}
finally {
    close();
}
