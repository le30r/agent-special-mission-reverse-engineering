import { access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { source, scripts, videoSource, videoNames } from './lib/asset-paths.mjs';
import { discoverSceneDependencies } from '../src/scene/scene-discovery.ts';

export async function checkAssets() {
  for (const directory of [source, scripts, path.join(source, 'block1/Xsh/Base'), path.join(source, 'block0/XSH/Interface')]) {
    try { await access(directory); } catch {
      throw new Error(`Missing ${directory}. Supply your own game files and run pnpm extract:assets; see README.md.`);
    }
  }
  if (!(await readdir(scripts)).some((name) => /^level\d+\.scc$/i.test(name))) throw new Error(`No Level*.scc in ${scripts}`);
  for (const name of videoNames) {
    try { await access(path.join(videoSource, name)); } catch { throw new Error(`Missing original video: ${path.join(videoSource, name)}`); }
  }
  for (const command of ['ffmpeg', 'ffprobe']) {
    const result = spawnSync(command, ['-version'], { encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(`Required tool ${command} is unavailable on PATH: ${result.error?.message ?? result.stderr}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await checkAssets();
  const result = await discoverSceneDependencies({ sourceRoot: source, scriptsRoot: scripts });
  const missing = result.scenes.flatMap((scene) => scene.missing.filter((item) => item.required).map((item) => `Level${scene.id}: ${item.message}`));
  for (const diagnostic of result.diagnostics) console.warn(`[${diagnostic.level}] ${diagnostic.message}`);
  console.log(`Source: ${source}\nScripts: ${scripts}\nVideo: ${videoSource} (${videoNames.length} originals present)\nScenes: ${result.scenes.length}; missing required dependencies: ${missing.length}`);
  if (missing.length || result.diagnostics.some((item) => item.level === 'error')) throw new Error(missing.join('\n') || 'Resource discovery reported errors');
}
