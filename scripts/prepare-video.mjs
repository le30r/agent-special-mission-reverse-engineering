/** Prepare browser-playable copies of the original AVI clips without touching them. */
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { root, videoSource as sourceDir, videoNames as names } from './lib/asset-paths.mjs';
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
const durationOf = (info, stream) => Number(stream.duration ?? info.format.duration);
function compatible(source, prepared) {
  const sourceVideo = source.streams.find((stream) => stream.codec_type === 'video');
  const sourceAudio = source.streams.find((stream) => stream.codec_type === 'audio');
  const video = prepared.streams.find((stream) => stream.codec_type === 'video');
  const audio = prepared.streams.find((stream) => stream.codec_type === 'audio');
  if (!sourceVideo || !sourceAudio || !video || !audio || video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p') return false;
  if (video.width !== sourceVideo.width || video.height !== sourceVideo.height) return false;
  if (Math.abs(durationOf(source, sourceVideo) - durationOf(prepared, video)) > 0.12) return false;
  const rate = (value) => { const [n, d] = String(value).split('/').map(Number); return d ? n / d : n; };
  return Math.abs(rate(video.avg_frame_rate) - rate(sourceVideo.avg_frame_rate)) < 0.02;
}
const summary = (info) => {
  const video = info.streams.find((stream) => stream.codec_type === 'video');
  const audio = info.streams.find((stream) => stream.codec_type === 'audio');
  return {
    duration: Number(info.format.duration), width: video?.width, height: video?.height,
    frameRate: video?.avg_frame_rate, videoCodec: video?.codec_name, audioCodec: audio?.codec_name,
    audioDuration: audio?.duration === undefined ? null : Number(audio.duration),
  };
};

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
    const sourceInfo = probe(source);
    const prior = previous.clips?.[originalName];
    let converted = false;
    let targetInfo;
    if (prior?.sourceSha256 === sourceSha256 && prior?.url === `/generated/video/${preparedName}` && existsSync(target) && (await stat(target)).size > 0) {
      try { targetInfo = probe(target); } catch { /* damaged cached output is regenerated below */ }
    }
    if (!targetInfo || !compatible(sourceInfo, targetInfo)) {
      run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', source, '-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', target], `ffmpeg ${originalName}`);
      converted = true;
      targetInfo = probe(target);
    }
    const info = targetInfo;
    const video = info.streams.find((stream) => stream.codec_type === 'video');
    const audio = info.streams.find((stream) => stream.codec_type === 'audio');
    if (!compatible(sourceInfo, info)) throw new Error(`prepared video metadata is not browser-compatible or no longer preserves source dimensions/duration/frame rate`);
    if (!audio || !compatible(sourceInfo, info)) throw new Error(`prepared file has no valid audio/video streams; refusing to publish an incomplete clip`);
    const sourceSummary = summary(sourceInfo), preparedSummary = summary(info);
    if (sourceSummary.audioDuration !== null && preparedSummary.audioDuration !== null
      && Math.abs(sourceSummary.audioDuration - preparedSummary.audioDuration) > 0.2) {
      throw new Error(`audio duration drift exceeds 200 ms (${sourceSummary.audioDuration} → ${preparedSummary.audioDuration})`);
    }
    manifest.clips[originalName] = {
      url: `/generated/video/${preparedName}`, sourceSha256, sourceBytes: sourceStat.size,
      ...preparedSummary, source: sourceSummary, prepared: preparedSummary,
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
