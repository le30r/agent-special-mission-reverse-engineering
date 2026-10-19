/** Project-owned disposable resources. No sweeping is performed implicitly. */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, realpathSync } from 'node:fs';
import { readdir, lstat, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const project = realpathSync(fileURLToPath(new URL('../../', import.meta.url)));
const owner = createHash('sha256').update(project).digest('hex').slice(0, 16);
export const resourceRoot = path.join(os.tmpdir(), `agent-revers-tests-${owner}`);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };

export async function closeSocket(socket, timeout = 1000) {
  if (socket.readyState === 3) return;
  await new Promise(resolve => {
    const done = () => { clearTimeout(timer); socket.removeEventListener('close', done); resolve(); };
    const timer = setTimeout(done, timeout);
    socket.addEventListener('close', done, { once: true });
    try { socket.close(); } catch { done(); }
  });
}

export class TestResources {
  constructor({ root = resourceRoot, timeout = 5000 } = {}) {
    this.root = root; this.timeout = timeout;
    this.directories = new Set(); this.children = new Map(); this.sockets = new Set();
  }
  tempDir(kind = 'artifacts') {
    if (this.cleaning) throw new Error('Resource scope is closing');
    if (!/^[a-z-]+$/.test(kind)) throw new Error('Invalid resource kind');
    mkdirSync(this.root, { recursive: true });
    const directory = mkdtempSync(path.join(this.root, `${kind}-`));
    this.directories.add(directory);
    this.writeOwner(directory);
    return directory;
  }
  writeOwner(directory) {
    writeFileSync(path.join(directory, 'owner.json'), JSON.stringify({ owner, pid: process.pid, created: Date.now(), groups: [...this.children.keys()].map(child => child.pid).filter(Boolean) }));
  }
  spawn(command, args, options = {}) {
    if (this.cleaning) throw new Error('Resource scope is closing');
    const child = spawn(command, args, { ...options, detached: process.platform !== 'win32' });
    // Observe spawn failures immediately, even while the caller awaits readiness.
    const state = { error: undefined, exited: false };
    child.once('error', error => { state.error = error; state.exited = true; if (!child.pid) this.children.delete(child); });
    child.once('exit', () => {
      state.exited = true;
      // Forget completed groups immediately, avoiding later signals to a reused PID.
      if (process.platform === 'win32' || !alive(-child.pid)) this.children.delete(child);
    });
    this.children.set(child, state);
    for (const directory of this.directories) this.writeOwner(directory);
    return child;
  }
  async stop(child) {
    const state = this.children.get(child);
    if (!state) return;
    // A failed spawn has no PID. Never call kill() on its uninitialised handle:
    // on some Node/platform combinations this can signal the caller's group.
    if (!child.pid) { this.children.delete(child); return; }
    const group = process.platform !== 'win32' && child.pid;
    const running = () => group ? alive(-child.pid) : !state.exited;
    const kill = signal => {
      try { group ? process.kill(-child.pid, signal) : child.kill(signal); }
      catch (e) { if (e.code !== 'ESRCH') throw e; }
    };
    for (const signal of ['SIGTERM', 'SIGKILL']) {
      if (!running()) break;
      kill(signal);
      const until = Date.now() + this.timeout;
      while (running() && Date.now() < until) await delay(25);
    }
    if (running()) throw new Error(`Process group ${child.pid} did not exit; retaining temporary resources`);
    this.children.delete(child);
  }
  async remove(directory) {
    if (!this.directories.has(directory)) throw new Error('Not owned by this scope');
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    this.directories.delete(directory);
  }
  cleanup() {
    return this.cleaning ??= (async () => {
      await Promise.all([...this.sockets].map(socket => closeSocket(socket)));
      let failure;
      for (const child of [...this.children.keys()].reverse()) {
        try { await this.stop(child); } catch (error) { failure ??= error; }
      }
      if (failure) throw failure; // Never remove profiles while a process might still use them.
      await Promise.all([...this.directories].map(directory => this.remove(directory)));
    })();
  }
}

/** Explicit opt-in only. Unknown, legacy, symlinked, young or live-owned resources are retained. */
export async function sweepOrphans({ root = resourceRoot, minAge = 24 * 60 * 60 * 1000 } = {}) {
  if (!Number.isFinite(minAge) || minAge < 60 * 60 * 1000) throw new Error('Orphan grace period must be at least one hour');
  let entries;
  try { entries = await readdir(root); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  // Fail closed when process inspection is unavailable. Include any command using the path,
  // not merely Chrome: a surviving child test may still be using downloads/artifacts.
  const processes = () => execFileSync('ps', ['-ax', '-o', 'command='], { encoding: 'utf8', timeout: 5000 });
  const removed = [];
  for (const name of entries) {
    if (!/^[a-z-]+-[A-Za-z0-9_-]{6,16}$/.test(name)) continue;
    const directory = path.join(root, name);
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
    let metadata;
    try { metadata = JSON.parse(await readFile(path.join(directory, 'owner.json'), 'utf8')); } catch { continue; }
    if ((await lstat(path.join(directory, 'owner.json'))).isSymbolicLink()) continue;
    if (metadata.owner !== owner || !Number.isInteger(metadata.pid) || metadata.pid <= 0 ||
        !Number.isFinite(metadata.created) || Date.now() - Math.max(metadata.created, stat.mtimeMs) < minAge || alive(metadata.pid) ||
        !Array.isArray(metadata.groups) || metadata.groups.some(pid => !Number.isInteger(pid) || pid <= 0 || alive(pid) || alive(-pid))) continue;
    if (processes().includes(directory) || processes().includes(realpathSync(directory))) continue;
    await rm(directory, { recursive: true, force: true });
    removed.push(directory);
  }
  return removed;
}
