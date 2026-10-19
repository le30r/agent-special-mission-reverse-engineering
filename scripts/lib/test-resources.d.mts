import type { ChildProcess, SpawnOptions } from 'node:child_process';
export const resourceRoot: string;
export function closeSocket(socket: WebSocket, timeout?: number): Promise<void>;
export class TestResources {
  constructor(options?: { root?: string; timeout?: number });
  sockets: Set<WebSocket>;
  tempDir(kind?: string): string;
  spawn(command: string, args: string[], options?: SpawnOptions): ChildProcess;
  stop(child: ChildProcess): Promise<void>;
  remove(directory: string): Promise<void>;
  cleanup(): Promise<void>;
}
export function sweepOrphans(options?: { root?: string; minAge?: number }): Promise<string[]>;
