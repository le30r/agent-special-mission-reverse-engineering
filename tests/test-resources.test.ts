import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile, utimes, symlink, lstat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { TestResources, sweepOrphans } from '../scripts/lib/test-resources.mjs';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const fixture = async () => mkdtemp(path.join(os.tmpdir(), 'agent-revers-resource-test-'));
const moduleUrl = new URL('../scripts/lib/e2e-resources.mjs', import.meta.url).href;
async function processFixture(root: string, mode: string) {
  const source = `import { resources } from ${JSON.stringify(moduleUrl)};
    resources.timeout = 200;
    const dir = resources.tempDir('chromium');
    const child = resources.spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], {stdio:'ignore'});
    await new Promise(r=>setTimeout(r,150));
    console.log(JSON.stringify({dir,pid:child.pid}));
    ${mode === 'error' ? "throw new Error('fixture failure')" : mode === 'success' ? 'await resources.cleanup()' : 'setInterval(()=>{},1000)'}`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
    env: { ...process.env, E2E_TEMP_PARENT: root }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = ''; let errors = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { errors += data; });
  const exit = new Promise<number | null>((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  const until = Date.now() + 5000;
  while (!output.includes('\n')) {
    if (Date.now() > until) throw new Error(`Fixture startup timeout: ${errors}`);
    await wait(10);
  }
  return { child, exit, data: JSON.parse(output.trim()) };
}
function isAlive(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }

describe('test resource lifecycle', () => {
  it.each(['success', 'error', 'SIGINT', 'SIGTERM'])('cleans profiles and stubborn child processes: %s', async mode => {
    const root = await fixture();
    let run;
    try {
      run = await processFixture(root, mode);
      if (mode.startsWith('SIG')) run.child.kill(mode as NodeJS.Signals);
      expect(await run.exit).toBe(mode === 'success' ? 0 : mode === 'error' ? 1 : mode === 'SIGINT' ? 130 : 143);
      expect(existsSync(run.data.dir)).toBe(false);
      expect(isAlive(run.data.pid)).toBe(false);
    } finally {
      if (run && run.child.exitCode === null) { run.child.kill('SIGTERM'); await run.exit; }
      await rm(root, { recursive: true, force: true });
    }
  }, 15000);

  it('keeps concurrent processes isolated during signal cleanup', async () => {
    const root = await fixture();
    const a = await processFixture(root, 'wait');
    const b = await processFixture(root, 'wait');
    try {
      expect(a.data.dir).not.toBe(b.data.dir);
      a.child.kill('SIGTERM'); await a.exit;
      expect(existsSync(a.data.dir)).toBe(false);
      expect(existsSync(b.data.dir)).toBe(true);
      expect(isAlive(b.data.pid)).toBe(true);
    } finally {
      a.child.kill('SIGTERM'); b.child.kill('SIGTERM');
      await Promise.all([a.exit, b.exit]);
      await rm(root, { recursive: true, force: true });
    }
  }, 20000);

  it('closes sockets before processes, removes directories last and is idempotent', async () => {
    const root = await fixture();
    const scope = new TestResources({ root, timeout: 100 });
    const dir = scope.tempDir('chromium');
    const events: string[] = [];
    scope.sockets.add({ readyState: 1, addEventListener() {}, removeEventListener() {}, close() { events.push('socket'); } } as unknown as WebSocket);
    const child = scope.spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    child.once('exit', () => { expect(existsSync(dir)).toBe(true); events.push('exit'); });
    try {
      const first = scope.cleanup();
      expect(scope.cleanup()).toBe(first);
      await first;
      expect(events).toEqual(['socket', 'exit']);
      expect(existsSync(dir)).toBe(false);
      await expect(scope.remove(root)).rejects.toThrow('Not owned');
    } finally { await scope.cleanup(); await rm(root, { recursive: true, force: true }); }
  });

  it('cleans up after a failed spawn without waiting forever', async () => {
    const root = await fixture();
    const scope = new TestResources({ root, timeout: 100 });
    const dir = scope.tempDir('chromium');
    scope.spawn(path.join(root, 'missing-executable'), [], { stdio: 'ignore' });
    try { await scope.cleanup(); expect(existsSync(dir)).toBe(false); }
    finally { await rm(root, { recursive: true, force: true }); }
  });

  it('sweeps only old marked dead resources, retaining active, young, unknown and symlinked ones', async () => {
    const root = await fixture();
    const scope = new TestResources({ root });
    const old = scope.tempDir('chromium');
    const active = scope.tempDir('chromium');
    const young = scope.tempDir('downloads');
    const busy = scope.tempDir('chromium');
    const busyProcess = scope.spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)', busy], { stdio: 'ignore' });
    const unknown = await mkdtemp(path.join(root, 'chromium-'));
    const linked = path.join(root, 'chromium-ABCDEF');
    await symlink(old, linked);
    const ancient = new Date(Date.now() - 48 * 3600000);
    for (const dir of [old, busy]) {
      const file = path.join(dir, 'owner.json');
      const meta = JSON.parse(await readFile(file, 'utf8'));
      await writeFile(file, JSON.stringify({ ...meta, pid: 2147483647, groups: [], created: +ancient }));
      await utimes(dir, ancient, ancient);
    }
    try {
      expect(await sweepOrphans({ root })).toEqual([old]);
      for (const dir of [active, young, busy, unknown]) expect(existsSync(dir)).toBe(true);
      expect((await lstat(linked)).isSymbolicLink()).toBe(true);
      expect(isAlive(busyProcess.pid!)).toBe(true);
    } finally { await scope.cleanup(); await rm(root, { recursive: true, force: true }); }
  });
});
