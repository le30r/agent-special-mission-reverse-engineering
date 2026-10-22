/** Extract local originals only. Never downloads game data or runs the game installer. */
import { existsSync } from 'node:fs';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { original, source, scripts } from './lib/asset-paths.mjs';
import { readRss } from './lib/rss.mjs';

const installed = path.dirname(scripts);
if (!existsSync(scripts) || !existsSync(path.join(installed, 'block0.rss'))) {
  const cabinet = path.join(original, 'extracted/data1.cab');
  if (!existsSync(cabinet)) throw new Error(`Supply ${cabinet} and its data1.hdr, or an already extracted Program_Executable_Files tree; see README.md.`);
  const result = spawnSync('unshield', ['-d', path.join(original, 'game-installed'), 'x', cabinet], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`InstallShield extraction failed: ${result.error?.message ?? result.stderr}`);
}

let count = 0;
for (let block = 0; block <= 11; block++) {
  const archive = block === 0 ? path.join(installed, 'block0.rss') : path.join(original, `extracted/block${block}.rss`);
  const entries = readRss(await readFile(archive));
  const output = path.join(source, `block${block}`);
  for (const entry of entries) {
    // Do not follow pre-existing symlinks out of the extraction destination.
    const parts = [source, output];
    let directory = output;
    for (const part of entry.name.split('/').slice(0, -1)) { directory = path.join(directory, part); parts.push(directory); }
    for (const dir of parts) {
      await mkdir(dir, { recursive: true });
      if ((await lstat(dir)).isSymbolicLink()) throw new Error(`Refusing symlink extraction directory: ${dir}`);
    }
    const target = path.join(output, entry.name);
    try {
      await writeFile(target, entry.bytes, { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (!(await lstat(target)).isFile() || !(await readFile(target)).equals(entry.bytes)) throw new Error(`Refusing to replace differing existing file: ${target}`);
    }
    count++;
  }
  console.log(`block${block}: ${entries.length} resources`);
}
console.log(`Extracted/verified ${count} files under ${source}. Next: pnpm check:assets`);
