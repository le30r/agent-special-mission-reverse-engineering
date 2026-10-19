import { readFile, readdir, writeFile } from 'node:fs/promises';
import ts from 'typescript';
const compiled = ts.transpileModule(await readFile(process.cwd() + '/src/scc/runtime.ts', 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { parseScc } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
const root = process.cwd() + '/agent-original/game-installed/Program_Executable_Files/Scripts';
const records = [];
for (const file of (await readdir(root)).filter(f => /^level\d+\.scc$/i.test(f))) {
    const source = await readFile(root + '/' + file, 'utf8'), handlers = parseScc(source);
    const starts = handlers.filter(h => h.event === 'Start');
    const rows = starts.map((h, index) => ({ index, stateObject: h.stateObject, programs: [...h.programs].map(([value, p]) => ({ value, commands: p.commands })) }));
    const pairs = [];
    for (let i = 0; i < starts.length; i++)
        for (const [a, p] of starts[i].programs)
            if (p.commands.some(c => c.op === 'StartW'))
                for (let j = i + 1; j < starts.length; j++)
                    for (const [b, q] of starts[j].programs)
                        if (!q.commands.some(c => ['StartW', 'Goto', 'Goport', 'SclipW'].includes(c.op)))
                            pairs.push({ waiter: { index: i, object: starts[i].stateObject, state: a }, finisher: { index: j, object: starts[j].stateObject, state: b }, conditional: true });
    records.push({ scene: Number(/\d+/.exec(file)[0]), startHandlers: rows, possibleBusyClobber: pairs });
}
records.sort((a, b) => a.scene - b.scene);
await writeFile(process.cwd() + '/research/gameplay/evidence/level3-regression/scene-audit.json', JSON.stringify({ method: 'Static ordered Start-handler candidates; branch reachability not established', sceneCount: records.length, scenes: records }, null, 2));
console.log(records.filter(r => r.possibleBusyClobber.length).map(r => ({ scene: r.scene, pairs: r.possibleBusyClobber.length })));
