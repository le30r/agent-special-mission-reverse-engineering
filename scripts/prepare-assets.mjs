/**
 * Prepares browser-ready copies of the original scene corpus.
 *
 * Scene discovery is driven entirely by `Scripts\Level*.scc` and the original
 * resource tree: SCC file presence, recursive `Inc`, `Back`/`Mask`, every
 * `Anim`/`Animc` MULT and every external image referenced by a MULT record. There
 * is no hand-written scene list and no assumption that `Level<id>` maps to a
 * particular `Scn_<id>` directory.
 *
 * The runtime manifest (public/generated/scenes.json) contains only URLs. The
 * browser loads one scene's SCC/MULT/mask/background/external images when it is
 * entered; this script may copy and convert the whole corpus ahead of time.
 */
import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { discoverSceneDependencies, normalizeOriginalPath } from '../src/scene/scene-discovery.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'agent-original/game-resources');
const scripts = path.join(root, 'agent-original/game-installed/Program_Executable_Files/Scripts');
const output = path.join(root, 'public/resources');
const generated = path.join(root, 'public/generated');
const backgroundsOutput = path.join(generated, 'backgrd');
const externalOutput = path.join(generated, 'tzu');
const audioOutput = path.join(generated, 'audio');

await mkdir(output, { recursive: true });
await mkdir(generated, { recursive: true });
await mkdir(backgroundsOutput, { recursive: true });
await mkdir(externalOutput, { recursive: true });
await mkdir(audioOutput, { recursive: true });

async function fileStat(file) {
  try { return await stat(file); } catch { return undefined; }
}

async function copyIfChanged(from, to) {
  const [fromStat, toStat] = await Promise.all([fileStat(from), fileStat(to)]);
  if (!fromStat?.isFile()) return false;
  if (toStat?.isFile() && toStat.size === fromStat.size && toStat.mtimeMs >= fromStat.mtimeMs) return false;
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to);
  return true;
}

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === '.DS_Store') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(full));
    else if (entry.isFile()) result.push(full);
  }
  return result;
}

async function convertTiff(from, to) {
  const [fromStat, toStat] = await Promise.all([fileStat(from), fileStat(to)]);
  if (!fromStat?.isFile()) return { ok: false, reason: `source is not a file: ${from}` };
  if (toStat?.isFile() && toStat.size > 0 && toStat.mtimeMs >= fromStat.mtimeMs) return { ok: true, skipped: true };
  await mkdir(path.dirname(to), { recursive: true });
  const result = spawnSync('sips', ['-s', 'format', 'png', from, '--out', to], { encoding: 'utf8' });
  if (result.status !== 0) return { ok: false, reason: result.stderr || result.stdout || `sips exited ${result.status}` };
  return { ok: true };
}

const discovery = await discoverSceneDependencies({ sourceRoot: source, scriptsRoot: scripts });
const diagnostics = [...discovery.diagnostics];

const copied = { scc: 0, mult: 0, mask: 0, background: 0, shared: 0, wav: 0, wavPcm: 0 };
const converted = { background: 0, external: 0, skipped: 0, failed: 0 };

/** Copy every scene SCC and every recursively included SCC at the resources root. */
const sccFiles = new Set();
for (const scene of discovery.scenes) {
  if (!sccFiles.has(scene.sccFileName)) {
    if (await copyIfChanged(path.join(scripts, scene.sccFileName), path.join(output, scene.sccFileName))) copied.scc++;
    sccFiles.add(scene.sccFileName);
  }
  for (const include of scene.includes) {
    const name = path.basename(include.sourcePath);
    if (sccFiles.has(name)) continue;
    if (await copyIfChanged(path.join(scripts, include.sourcePath), path.join(output, name))) copied.scc++;
    sccFiles.add(name);
  }
}

/** Copy the shared character/interface resources referenced by every scene. */
for (const relative of ['block1/Xsh/Base', 'block0/XSH/Interface']) {
  const from = path.join(source, relative);
  if (!existsSync(from)) {
    diagnostics.push({ level: 'error', kind: 'shared-resource', path: relative, message: `Shared resource directory is missing: ${relative}` });
    continue;
  }
  for (const file of await walk(from)) {
    const rel = path.relative(source, file);
    if (await copyIfChanged(file, path.join(output, rel))) copied.shared++;
  }
}

/** Prepare immutable browser copies of original WAVs; never rewrite the source tree. */
const audioResources = {};
const audioDurations = {};
const audioStorageModes = {};
for (const file of await walk(source)) {
  if (!/\.wav$/i.test(file)) continue;
  const rel = path.relative(source, file).split(path.sep).join('/');
  const target = path.join(output, rel);
  if (await copyIfChanged(file, target)) copied.wav++;
  const key = rel.replace(/^block\d+\//i, '').toLowerCase().replaceAll('\\', '/');
  const wavBytes = await readFile(file);
  if (wavBytes.length >= 12 && wavBytes.toString('ascii', 0, 4) === 'RIFF' && wavBytes.toString('ascii', 8, 12) === 'WAVE') {
    let offset = 12, dataBytes = 0, average = 0;
    while (offset + 8 <= wavBytes.length) {
      const id = wavBytes.toString('ascii', offset, offset + 4), size = wavBytes.readUInt32LE(offset + 4), body = offset + 8;
      if (body + size > wavBytes.length) break;
      if (id === 'fmt ' && size >= 12) {
        average = wavBytes.readUInt32LE(body + 8);
        audioStorageModes[key] = wavBytes.readUInt16LE(body) === 1 ? 'sharedPcm' : 'privateDecoded';
      }
      if (id === 'data') dataBytes = size;
      offset = body + size + (size & 1);
    }
    audioDurations[key] = average > 0 ? Math.floor(dataBytes * 1000 / average) : -1;
  }
  const pcmTarget = path.join(audioOutput, rel);
  const [inputStat, pcmStat] = await Promise.all([fileStat(file), fileStat(pcmTarget)]);
  if (!pcmStat?.isFile() || pcmStat.mtimeMs < inputStat.mtimeMs) {
    await mkdir(path.dirname(pcmTarget), { recursive: true });
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', file, '-map_metadata', '0', '-c:a', 'pcm_s16le', pcmTarget], { encoding: 'utf8' });
    if (result.status === 0) copied.wavPcm++;
    else diagnostics.push({ level: 'warning', kind: 'wav-convert', path: rel, message: result.error?.message ?? result.stderr?.trim() ?? `ffmpeg exited ${result.status}` });
  }
  // Preserve complete RSS-style resource names; ambiguous duplicate keys are not silently overwritten.
  if (audioResources[key] && audioResources[key] !== `/resources/${rel}`) {
    diagnostics.push({ level: 'error', kind: 'wav-ambiguous', path: key, message: `Ambiguous WAV resource key ${key}` });
  } else audioResources[key] = existsSync(pcmTarget) ? `/generated/audio/${rel}` : `/resources/${rel}`;
}

/** Copy masks, backgrounds and every declared animation MULT. */
for (const scene of discovery.scenes) {
  for (const resource of scene.masks) {
    if (await copyIfChanged(path.join(source, resource.sourcePath), path.join(output, resource.sourcePath))) copied.mask++;
  }
  for (const resource of scene.backgrounds) {
    if (await copyIfChanged(path.join(source, resource.sourcePath), path.join(output, resource.sourcePath))) copied.background++;
  }
  for (const animation of scene.animations) {
    if (!animation.sourcePath) continue;
    if (await copyIfChanged(path.join(source, animation.sourcePath), path.join(output, animation.sourcePath))) copied.mult++;
  }
}

/**
 * Convert every referenced background and every external image referenced by a
 * MULT record. Converted files live under generated/ so a later run can reuse
 * them even though resources/ is copied independently.
 */
const backgroundTargets = new Map();
for (const scene of discovery.scenes) {
  for (const background of scene.backgrounds) {
    const basename = path.basename(background.sourcePath).replace(/\.tif{1,2}$/i, '.png');
    let relative = `generated/backgrd/${basename}`;
    if (backgroundTargets.has(relative) && backgroundTargets.get(relative) !== background.sourcePath) {
      // Defensive: keep distinct backgrounds distinct even if basenames collide.
      const suffix = background.sourcePath.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      relative = `generated/backgrd/${path.basename(basename, '.png')}-${suffix}.png`;
    }
    backgroundTargets.set(relative, background.sourcePath);
    const result = await convertTiff(path.join(source, background.sourcePath), path.join(root, 'public', relative));
    if (!result.ok) {
      converted.failed++;
      diagnostics.push({ level: 'error', scene: scene.id, kind: 'background-convert', path: background.sourcePath, message: String(result.reason) });
      continue;
    }
    if (result.skipped) converted.skipped++;
    else converted.background++;
  }
}

const externalSourceToTarget = new Map();
for (const scene of discovery.scenes) {
  for (const external of scene.externalImages) {
    const key = normalizeOriginalPath(external.originalPath);
    if (externalSourceToTarget.has(key)) continue;
    const relative = `generated/tzu/${external.sourcePath.replace(/\.tif{1,2}$/i, '.png')}`;
    const result = await convertTiff(path.join(source, external.sourcePath), path.join(root, 'public', relative));
    if (!result.ok) {
      converted.failed++;
      diagnostics.push({ level: 'warning', scene: scene.id, kind: 'external-convert', path: external.sourcePath, message: String(result.reason) });
      continue;
    }
    if (result.skipped) converted.skipped++;
    else converted.external++;
    externalSourceToTarget.set(key, `/${relative}`);
  }
}

/** Case-insensitive lookup used by tests/diagnostics and by original SCC paths. */
const resourceIndex = {};
for (const file of await walk(output)) {
  const relative = path.relative(output, file).split(path.sep).join('/');
  resourceIndex[relative.toLowerCase()] = relative;
}
await writeFile(path.join(output, 'resource-index.json'), JSON.stringify(resourceIndex));

const scenes = [];
for (const scene of discovery.scenes) {
  const required = scene.missing.filter((entry) => entry.required);
  const optional = scene.missing.filter((entry) => !entry.required);
  const animations = {};
  for (const animation of scene.animations) {
    if (!animation.sourcePath) continue;
    animations[animation.name] = `/resources/${animation.sourcePath}`;
  }
  const externalImages = {};
  for (const external of scene.externalImages) {
    const target = externalSourceToTarget.get(normalizeOriginalPath(external.originalPath));
    if (target) externalImages[normalizeOriginalPath(external.originalPath)] = target;
  }
  const backgroundRelative = scene.background
    ? [...backgroundTargets.entries()].find(([, sourcePath]) => sourcePath === scene.background.sourcePath)?.[0]
    : undefined;
  const backgroundExists = backgroundRelative ? existsSync(path.join(root, 'public', backgroundRelative)) : false;
  if (scene.background && !backgroundExists) {
    required.push({ kind: 'background', originalPath: scene.background.originalPath, sourcePath: scene.background.sourcePath, required: true, message: `Background conversion failed for Level${scene.id}` });
  }
  const maskExists = scene.mask ? existsSync(path.join(output, scene.mask.sourcePath)) : false;
  if (scene.mask && !maskExists) {
    required.push({ kind: 'mask', originalPath: scene.mask.originalPath, sourcePath: scene.mask.sourcePath, required: true, message: `Mask copy failed for Level${scene.id}` });
  }
  const backgrounds = {};
  for (const resource of scene.backgrounds) {
    const relative = [...backgroundTargets.entries()].find(([, sourcePath]) => sourcePath === resource.sourcePath)?.[0];
    if (relative && existsSync(path.join(root, 'public', relative))) backgrounds[normalizeOriginalPath(resource.originalPath)] = `/${relative}`;
    else required.push({ kind: 'background', originalPath: resource.originalPath, sourcePath: resource.sourcePath, required: true, message: `Background conversion failed for Level${scene.id}` });
  }
  const masks = {};
  for (const resource of scene.masks) {
    const exists = existsSync(path.join(output, resource.sourcePath));
    if (!exists && resource.originalPath !== scene.mask?.originalPath) {
      required.push({ kind: 'mask', originalPath: resource.originalPath, sourcePath: resource.sourcePath, required: true, message: `Alternative mask copy failed for Level${scene.id}` });
    }
    if (exists) masks[normalizeOriginalPath(resource.originalPath)] = `/resources/${resource.sourcePath}`;
  }
  scenes.push({
    id: scene.id,
    scc: `/resources/${scene.sccFileName}`,
    includes: scene.includes.map((include) => `/resources/${path.basename(include.sourcePath)}`),
    background: backgroundExists ? `/${backgroundRelative}` : null,
    backgrounds,
    mask: maskExists ? `/resources/${scene.mask.sourcePath}` : null,
    masks,
    animations,
    externalImages,
    layoutAnimation: scene.layoutAnimation ?? null,
    requiredAnimations: scene.requiredAnimations,
    missing: { required, optional },
    loadable: required.length === 0,
    sources: {
      scc: `Scripts/${scene.sccFileName}`,
      includes: scene.includes.map((include) => include.sourcePath),
      background: scene.background?.sourcePath ?? null,
      mask: scene.mask?.sourcePath ?? null,
    },
  });
}

const loadable = scenes.filter((scene) => scene.loadable).map((scene) => scene.id);
const incomplete = scenes.filter((scene) => !scene.loadable).map((scene) => ({ id: scene.id, reasons: scene.missing.required.map((entry) => entry.message) }));
// Save compatibility follows actual SCC/resource semantics, not generated URLs or timestamps.
// Keep the existing background hash coverage: newly discovered Setbck-only images
// are presentation resources and do not invalidate persistent world state.
const semanticFiles = new Map();
for (const scene of discovery.scenes) {
  semanticFiles.set(path.join(scripts, scene.sccFileName), `scripts/${scene.sccFileName}`);
  for (const include of scene.includes) semanticFiles.set(path.join(scripts, include.sourcePath), `scripts/${include.sourcePath}`);
  for (const resource of [scene.background, scene.mask, ...scene.masks, ...scene.animations, ...scene.externalImages]) {
    if (resource?.sourcePath) semanticFiles.set(path.join(source, resource.sourcePath), `resources/${resource.sourcePath}`);
  }
}
for (const relative of ['block1/Xsh/Base', 'block0/XSH/Interface']) {
  for (const file of await walk(path.join(source, relative))) semanticFiles.set(file, `resources/${path.relative(source,file).split(path.sep).join('/')}`);
}
const contentDigest=createHash('sha256');
for (const [file,semanticPath] of [...semanticFiles].sort((a,b)=>a[1].toLowerCase().localeCompare(b[1].toLowerCase()))) {
  contentDigest.update(semanticPath.toLowerCase()); contentDigest.update('\0');
  try { contentDigest.update(await readFile(file)); } catch { contentDigest.update('<missing>'); }
  contentDigest.update('\0');
}
const contentId=`sha256:${contentDigest.digest('hex')}`;
const manifest = {
  version: 2,
  contentId,
  generator: 'scripts/prepare-assets.mjs',
  audioResources,
  audioDurations,
  audioStorageModes,
  summary: {
    total: scenes.length,
    loadable,
    incomplete,
    missingOptional: scenes.reduce((count, scene) => count + scene.missing.optional.length, 0),
  },
  scenes,
  diagnostics,
};
await writeFile(path.join(generated, 'scenes.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const sceneIds = scenes.map((scene) => scene.id);
console.log(`Discovered ${scenes.length} original scenes: ${sceneIds.join(', ')}`);
console.log(`Copied SCC=${copied.scc} MULT=${copied.mult} mask=${copied.mask} background=${copied.background} shared=${copied.shared} WAV=${copied.wav}; PCM-converted WAV=${copied.wavPcm}.`);
console.log(`Converted background=${converted.background} external=${converted.external} (reused ${converted.skipped}, failed ${converted.failed}).`);
console.log(`Loadable scenes: ${loadable.length}/${scenes.length}${incomplete.length ? `; incomplete: ${incomplete.map((entry) => entry.id).join(', ')}` : ''}.`);
if (diagnostics.length) {
  console.warn(`Diagnostics: ${diagnostics.length}`);
  for (const diagnostic of diagnostics.slice(0, 30)) console.warn(`  [${diagnostic.level}] ${diagnostic.scene ? `Level${diagnostic.scene}: ` : ''}${diagnostic.message}`);
}
