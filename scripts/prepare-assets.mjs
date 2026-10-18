import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'agent-original/game-resources');
const scripts = path.join(root, 'agent-original/game-installed/Program_Executable_Files/Scripts');
const output = path.join(root, 'public/resources');
const generated = path.join(root, 'public/generated');
/** Scenes whose original SCC, mask, background and MULT animations are prepared. */
const supportedScenes = [1, 39];

await rm(output, { recursive: true, force: true });
await rm(generated, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(generated, { recursive: true });

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full));
    else result.push(full);
  }
  return result;
}

const copies = [
  ['block9/Xsh/Scn_37', 'block9/Xsh/Scn_37'],
  ['block9/Xsh/Scn_39', 'block9/Xsh/Scn_39'],
  ['block1/Xsh/Base', 'block1/Xsh/Base'],
  ['block9/Tzu/Scn_37', 'block9/Tzu/Scn_37'],
  ['block9/Tzu/Scn_39', 'block9/Tzu/Scn_39'],
  ['block1/Backgrd', 'block1/Backgrd'],
  ['block0/Masks', 'block0/Masks'],
  // Original inventory panel and item icons (Frame.MULT, large.MULT).
  ['block0/XSH/Interface', 'block0/XSH/Interface'],
];
for (const [from, to] of copies) {
  const src = path.join(source, from);
  if (existsSync(src)) await cp(src, path.join(output, to), { recursive: true });
}
for (const id of supportedScenes) {
  await cp(path.join(scripts, `Level${id}.scc`), path.join(output, `Level${id}.scc`));
}
await cp(path.join(scripts, 'Mainhero.scc'), path.join(output, 'Mainhero.scc'));

for (const relativeScene of ['block9/Tzu/Scn_37', 'block9/Tzu/Scn_39']) {
  const dir = path.join(source, relativeScene);
  for (const file of await walk(dir)) {
    if (!/\.tif{1,2}$/i.test(file)) continue;
    const rel = path.relative(dir, file);
    const target = path.join(output, relativeScene, rel.replace(/\.tif{1,2}$/i, '.png'));
    await mkdir(path.dirname(target), { recursive: true });
    const res = spawnSync('sips', ['-s', 'format', 'png', file, '--out', target], { encoding: 'utf8' });
    if (res.status !== 0) throw new Error(`sips failed for ${relativeScene}/${rel}: ${res.stderr}`);
  }
}

const resourceIndex = {};
for (const file of await walk(output)) {
  const relative = path.relative(output, file).split(path.sep).join('/');
  resourceIndex[relative.toLowerCase()] = relative;
}
await writeFile(path.join(output, 'resource-index.json'), JSON.stringify(resourceIndex));

/** Resolves an original SCC resource path (e.g. `BACKGRD\scn_37.tif`) against prepared assets. */
function findPrepared(originalPath) {
  const wanted = originalPath.replaceAll('\\', '/').toLowerCase();
  const matches = Object.entries(resourceIndex).filter(([key]) => key === wanted || key.endsWith(`/${wanted}`));
  if (matches.length !== 1) throw new Error(`Prepared asset lookup is not unique for ${originalPath}: ${JSON.stringify(matches)}`);
  return matches[0][1];
}

/**
 * One manifest entry per supported scene. Everything else (portals, Focus, Object
 * declarations, animations) is parsed from the original SCC at run time.
 */
const scenes = [];
for (const id of supportedScenes) {
  const scc = await readFile(path.join(output, `Level${id}.scc`), 'utf8');
  const back = /^\s*Back\s+(\S+)/im.exec(scc)?.[1];
  const mask = /^\s*Mask\s+(\S+)/im.exec(scc)?.[1];
  if (!back || !mask) throw new Error(`Level${id}.scc has no Back/Mask declaration`);
  const backPrepared = findPrepared(back);
  const backgroundRelative = `generated/backgrd/${path.basename(backPrepared).replace(/\.tif{1,2}$/i, '.png')}`;
  const backgroundTarget = path.join(root, 'public', backgroundRelative.split('/').join(path.sep));
  await mkdir(path.dirname(backgroundTarget), { recursive: true });
  const res = spawnSync('sips', ['-s', 'format', 'png', path.join(source, backPrepared.split('/').join(path.sep)), '--out', backgroundTarget], { encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`sips failed for ${back}: ${res.stderr}`);
  scenes.push({ id, scc: `/resources/Level${id}.scc`, background: `/${backgroundRelative}`, mask: `/resources/${findPrepared(mask)}` });
}
await writeFile(path.join(generated, 'scenes.json'), JSON.stringify({ scenes }, null, 2));

console.log(`Prepared ${scenes.length} original scenes (${supportedScenes.join(', ')}) and their MULT/mask/background inputs in public/.`);
