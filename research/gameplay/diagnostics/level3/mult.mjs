import ts from 'typescript';
import { readFile, writeFile } from 'node:fs/promises';
const root = process.cwd();
const c = ts.transpileModule(await readFile(root + '/src/mult/decoder.ts', 'utf8'), { compilerOptions: { target: 99, module: 99 } }).outputText;
const { decodeMult } = await import('data:text/javascript;base64,' + Buffer.from(c).toString('base64'));
const m = JSON.parse(await readFile(root + '/public/generated/scenes.json', 'utf8'));
const scene = m.scenes.find(s => s.id === 3);
const result = {};
for (const a of ['Startlevel', 'Startlevel1', 'K_slip', 'take_k', 'K_ploc', 'K_stool']) {
    const file = decodeMult(new Uint8Array(await readFile(root + '/public' + scene.animations[a])));
    result[a] = { path: scene.animations[a], frameCount: file.frameCount, frames: [] };
    for (let f = 0; f < file.frames.length; f++) {
        const entries = file.frames[f].filter(r => ['stool', 'iach_click', 'plocat', 'mainhero', 'kreslo', 'main_creslo'].includes(r.name.toLowerCase()));
        if (f === 0 || f === file.frames.length - 1 || entries.some(r => { const x = file.resolve(r.slot, r.child); return x.width === 0 || x.height === 0; }))
            result[a].frames.push({ frame: f + 1, entries: entries.map(r => { const x = file.resolve(r.slot, r.child); return { name: r.name, slot: r.slot, child: r.child, x: r.x, y: r.y, width: x.width, height: x.height, external: x.externalPath }; }) });
    }
}
await writeFile(root + '/research/gameplay/evidence/level3-regression/mult-facts.json', JSON.stringify(result, null, 2));
console.log(Object.fromEntries(Object.entries(result).map(([a, v]) => [a, { path: v.path, frameCount: v.frameCount, first: v.frames[0], last: v.frames.at(-1) }])));
