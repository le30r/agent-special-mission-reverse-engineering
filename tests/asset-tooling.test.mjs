import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRss } from '../scripts/lib/rss.mjs';
import { TestResources } from '../scripts/lib/test-resources.mjs';
import UTIF from 'utif';
import { tiffImageInput } from '../scripts/lib/tiff.mjs';

test('TIFF preparation unwraps complete JPEG strips and preserves ordinary TIFFs', () => {
  const plain = Buffer.from(UTIF.encodeImage(Uint8Array.from([255, 0, 0, 255]), 1, 1));
  assert.equal(tiffImageInput(plain), plain);
  // Synthetic TIFF wrapper with an authored marker payload, not game data.
  const bytes = Buffer.alloc(1004);
  Buffer.from(UTIF.encode([{ t256: [1], t257: [1], t259: [7], t273: [1000], t279: [4] }])).copy(bytes);
  bytes.set([255, 216, 255, 217], 1000);
  assert.deepEqual(tiffImageInput(bytes), Buffer.from([255, 216, 255, 217]));
  const rgb = Buffer.alloc(1004);
  rgb.write('II'); rgb.writeUInt16LE(42, 2); rgb.writeUInt32LE(8, 4);
  const tags = [[256, 4, 1, 1], [257, 4, 1, 1], [259, 3, 1, 7], [262, 3, 1, 2], [273, 4, 1, 1000], [279, 4, 1, 4], [347, 7, 6, 900]];
  rgb.writeUInt16LE(tags.length, 8);
  tags.forEach(([tag, type, count, value], index) => {
    const at = 10 + index * 12;
    rgb.writeUInt16LE(tag, at); rgb.writeUInt16LE(type, at + 2);
    rgb.writeUInt32LE(count, at + 4); rgb.writeUInt32LE(value, at + 8);
  });
  rgb.set([255, 216, 255, 219, 255, 217], 900);
  rgb.set([255, 216, 255, 217], 1000);
  assert.deepEqual(tiffImageInput(rgb), Buffer.from('ffd8ffee000e41646f626500640000000000ffdbffd9', 'hex'));
  assert.throws(() => tiffImageInput(bytes.subarray(0, 1003)), /range/);
  bytes[1000] = 0;
  assert.throws(() => tiffImageInput(bytes), /complete JPEG/);
});

// Authored synthetic archive, not bytes from the game.
function archive(name = 'Xsh\\Example.MULT', payload = Buffer.from('authored fixture')) {
  const bytes = Buffer.alloc(96 + payload.length);
  bytes.writeUInt32LE(1, 0);
  bytes.write(name, 4, 'ascii');
  bytes.writeUInt32LE(96, 84);
  bytes.writeUInt32LE(payload.length, 88);
  payload.copy(bytes, 96);
  return bytes;
}

test('RSS parser preserves paths and payload, including empty files', () => {
  assert.equal(readRss(archive())[0].name, 'Xsh/Example.MULT');
  assert.equal(readRss(archive())[0].bytes.toString(), 'authored fixture');
  assert.equal(readRss(archive('empty.MULT', Buffer.alloc(0)))[0].bytes.length, 0);
});

test('RSS parser rejects traversal, absolute paths and invalid ranges', () => {
  for (const name of ['../outside', 'Xsh/../../outside', '/outside', 'C:\\outside', 'Xsh//file']) {
    assert.throws(() => readRss(archive(name)), /Unsafe RSS path/);
  }
  assert.throws(() => readRss(Buffer.alloc(3)), /header/);
  assert.throws(() => readRss(archive().subarray(0, 80)), /directory/);
  const broken = archive(); broken.writeUInt32LE(1000, 88);
  assert.throws(() => readRss(broken), /range/);
});

async function run(resources, script, original) {
  const child = resources.spawn(process.execPath, [fileURLToPath(new URL(`../scripts/${script}`, import.meta.url))], {
    env: { ...process.env, AGENT_ORIGINAL_DIR: original }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data) => { output += data; });
  child.stderr.on('data', (data) => { output += data; });
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  return { code, output };
}

test('extract command handles all 12 RSS, is idempotent and refuses changed files or symlinks', async () => {
  const resources = new TestResources();
  try {
    const original = resources.tempDir('asset-fixture');
    const installed = path.join(original, 'game-installed/Program_Executable_Files');
    await mkdir(path.join(installed, 'Scripts'), { recursive: true });
    await mkdir(path.join(original, 'extracted'));
    for (let i = 0; i < 12; i++) await writeFile(i ? path.join(original, `extracted/block${i}.rss`) : path.join(installed, 'block0.rss'), archive());
    const first = await run(resources, 'extract-assets.mjs', original);
    assert.equal(first.code, 0, first.output);
    assert.match(first.output, /Extracted\/verified 12 files/);
    assert.equal((await run(resources, 'extract-assets.mjs', original)).code, 0);
    const target = path.join(original, 'game-resources/block11/Xsh/Example.MULT');
    assert.equal((await readFile(target)).toString(), 'authored fixture');
    await writeFile(target, 'changed');
    const changed = await run(resources, 'extract-assets.mjs', original);
    assert.notEqual(changed.code, 0); assert.match(changed.output, /Refusing to replace/);

    const linked = resources.tempDir('asset-symlink');
    await mkdir(path.join(linked, 'game-installed/Program_Executable_Files/Scripts'), { recursive: true });
    await writeFile(path.join(linked, 'game-installed/Program_Executable_Files/block0.rss'), archive());
    await symlink(path.join(original, 'game-resources'), path.join(linked, 'game-resources'), 'dir');
    const result = await run(resources, 'extract-assets.mjs', linked);
    assert.notEqual(result.code, 0); assert.match(result.output, /Refusing symlink/);
  } finally { await resources.cleanup(); }
});

test('missing explicit originals fail with actionable instructions, without fallback', async () => {
  const resources = new TestResources();
  try {
    const result = await run(resources, 'check-assets.mjs', resources.tempDir('missing-originals'));
    assert.notEqual(result.code, 0);
    assert.match(result.output, /pnpm extract:assets/);
  } finally { await resources.cleanup(); }
});
