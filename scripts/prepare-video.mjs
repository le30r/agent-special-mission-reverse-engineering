/** Prepare browser-playable copies of the original AVI clips without touching them. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const names = ['Title.avi', 'Titres.avi', 'Rolik1.avi', 'Rolik2.avi', 'Rolik5.avi', 'Final.avi'];

// Assets are deliberately outside Git. In a worktree, use the shared checkout's
// immutable originals; in a regular checkout the local path is used directly.
function findRepositoryRoot(from) {
  for (let current = from; ; current = path.dirname(current)) {
    if (existsSync(path.join(current, '.git', 'HEAD')) || existsSync(path.join(current, '.git', 'refs'))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Cannot locate repository root above ${from}`);
  }
}
const repositoryRoot = findRepositoryRoot(root);
const sourceDir = path.join(repositoryRoot, 'agent-original', 'extracted', 'Data');
const outputDir = path.join(root, 'public', 'generated', 'video');
const manifestPath = path.join(outputDir, 'manifest.json');
const manifest = { version: 1, format: 'mp4', codec: 'H.264 yuv420p + AAC', clips: {}, diagnostics: [] };

function run(command, args, label) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) {
    throw new Error(`${label}: ${result.error?.message ?? result.stderr?.trim() ?? `${command} exited ${result.status}`}`);
  }
  return result.stdout;
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const probe = (file) => JSON.parse(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], `ffprobe ${file}`));

await mkdir(outputDir, { recursive: true });
let previous = { clips: {} };
try { previous = JSON.parse(await readFile(manifestPath, 'utf8')); } catch { /* first preparation */ }
const failures = [];
for (const originalName of names) {
  const source = path.join(sourceDir, originalName);
  const preparedName = `${path.basename(originalName, path.extname(originalName))}.mp4`;
  const target = path.join(outputDir, preparedName);
  try {
    const sourceBytes = await readFile(source);
    const sourceSha256 = hash(sourceBytes);
    const sourceStat = await stat(source);
    const prior = previous.clips?.[originalName];
    let converted = false;
    if (prior?.sourceSha256 !== sourceSha256 || prior?.url !== `/generated/video/${preparedName}` || !existsSync(target) || (await stat(target)).size === 0) {
      run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', source, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', target], `ffmpeg ${originalName}`);
      converted = true;
    }
    const info = probe(target);
    const video = info.streams.find((stream) => stream.codec_type === 'video');
    const audio = info.streams.find((stream) => stream.codec_type === 'audio');
    if (!video || video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p') throw new Error(`prepared file lacks browser-compatible H.264/yuv420p video`);
    if (!audio) throw new Error(`prepared file has no audio stream; refusing to publish a silent clip`);
    manifest.clips[originalName] = {
      url: `/generated/video/${preparedName}`, sourceSha256, sourceBytes: sourceStat.size,
      duration: Number(info.format.duration), width: video.width, height: video.height,
      frameRate: video.avg_frame_rate, videoCodec: video.codec_name, audioCodec: audio.codec_name,
      converted,
    };
    console.log(`${converted ? 'converted' : 'reused'} ${originalName} -> ${preparedName}`);
  } catch (error) {
    const message = `${originalName}: ${error instanceof Error ? error.message : String(error)}`;
    failures.push(message);
    manifest.diagnostics.push(message);
    console.error(`video preparation failed: ${message}`);
  }
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (failures.length) throw new Error(`Prepared ${Object.keys(manifest.clips).length}/${names.length} original videos; see ${manifestPath}:\n${failures.join('\n')}`);
