#!/usr/bin/env node
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) {
  console.error('Usage: node scripts/convert-wav-for-browser.mjs <input-dir> <output-dir>');
  process.exit(2);
}
const inputRoot = path.resolve(inputArg);
const outputRoot = path.resolve(outputArg);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (/\.wav$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

let inputs;
try {
  inputs = await walk(inputRoot);
} catch (error) {
  console.error(`Cannot read input directory ${inputRoot}: ${error.message}`);
  process.exit(1);
}
if (inputs.length === 0) {
  console.error(`No WAV files found under ${inputRoot}`);
  process.exit(1);
}

for (const input of inputs) {
  const relative = path.relative(inputRoot, input);
  const output = path.join(outputRoot, relative);
  await mkdir(path.dirname(output), { recursive: true });
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', input,
    '-map_metadata', '0', '-c:a', 'pcm_s16le', output,
  ], { encoding: 'utf8' });
  if (result.error) throw new Error(`Could not run ffmpeg: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`ffmpeg failed for ${relative}: ${result.stderr.trim()}`);
}
console.log(`Converted ${inputs.length} WAV files to 16-bit PCM under ${outputRoot}; originals were not changed.`);
