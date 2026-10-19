/** Entrypoint-only lifecycle hooks, including sockets opened before a scenario's try/finally. */
import { TestResources } from './test-resources.mjs';
export const resources = new TestResources(process.env.E2E_TEMP_PARENT ? { root: process.env.E2E_TEMP_PARENT } : {});
const NativeWebSocket = globalThis.WebSocket;
if (NativeWebSocket) globalThis.WebSocket = class extends NativeWebSocket {
  constructor(...args) {
    super(...args);
    resources.sockets.add(this);
    this.addEventListener('close', () => resources.sockets.delete(this), { once: true });
  }
};
let ending;
async function finish(code, error) {
  if (ending) return ending;
  ending = (async () => {
    if (error) console.error(error);
    try { await resources.cleanup(); } catch (e) { console.error(e); code ||= 1; }
    process.exit(code);
  })();
  return ending;
}
process.on('SIGINT', () => void finish(130));
process.on('SIGTERM', () => void finish(143));
process.on('uncaughtException', error => void finish(1, error));
process.on('unhandledRejection', error => void finish(1, error));
process.once('beforeExit', () => void finish(process.exitCode ?? 0));
