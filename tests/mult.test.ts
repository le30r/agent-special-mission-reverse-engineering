import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeMult } from '../src/mult/decoder';

const root = process.cwd();
async function filesUnder(dir: string): Promise<string[]> {
  const output: string[] = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) output.push(...await filesUnder(full));
    else if (item.name.toLowerCase().endsWith('.mult')) output.push(full);
  }
  return output;
}

describe('MULT decoder corpus', () => {
  it('matches the Python probe metadata for all 505 non-empty files and resolves every reference', async () => {
    const python = JSON.parse(await readFile(path.join(root, 'research/mult/verification.json'), 'utf8')) as { files: Array<{path:string;size:number;sha256:string;timeline_entries:number;field4:number;record_count:number;records:Array<{offset:number;tag:number;size:number;name:string;a:number;b:number;position:[number,number];rle_sha256?:string}> }> };
    const expected = new Map(python.files.map((entry) => [entry.path.toLowerCase(), entry]));
    const all = await filesUnder(path.join(root, 'agent-original/game-resources'));
    let nonempty = 0, records = 0, references = 0, runs = 0;
    for (const file of all) {
      const relative = path.relative(path.join(root, 'agent-original/game-resources'), file).replaceAll('\\','/').toLowerCase();
      const bytes = await readFile(file);
      if (!bytes.length) continue;
      nonempty++;
      const sourceHash = createHash('sha256').update(bytes).digest('hex');
      const reference = expected.get(relative);
      expect(reference, relative).toBeDefined();
      expect(sourceHash, relative).toBe(reference!.sha256);
      const decoded = decodeMult(bytes);
      expect(decoded.frameCount, relative).toBe(reference!.timeline_entries);
      expect(decoded.paletteField, relative).toBe(reference!.field4);
      const flat = decoded.frames.flat();
      expect(flat.length, relative).toBe(reference!.record_count);
      records += flat.length;
      const probesByOffset = new Map(reference!.records.map((record) => [record.offset, record]));
      for (let f=0;f<decoded.frames.length;f++) for (let c=0;c<decoded.frames[f].length;c++) {
        const actual=decoded.frames[f][c];
        decoded.resolve(f+1,c);
        if (actual.type === -13) references++;
        if (actual.type === -16) {
          runs++;
          const raw=bytes.subarray(actual.offset+0x42,actual.offset+actual.recordSize-8);
          const expectedRecord=probesByOffset.get(actual.offset);
          expect(createHash('sha256').update(raw).digest('hex'), `${relative}@${actual.offset}`).toBe(expectedRecord?.rle_sha256);
        }
      }
      let cursor=0;
      for (const frame of decoded.frames) for (const actual of frame) {
        const probe=reference!.records[cursor++];
        expect([actual.offset,actual.type,actual.recordSize,actual.name,actual.a,actual.b], `${relative}@${actual.offset}`).toEqual([probe.offset,probe.tag,probe.size,probe.name,probe.a,probe.b]);
        expect([actual.x,actual.y], `${relative}@${actual.offset}`).toEqual(probe.position);
      }
    }
    expect(nonempty).toBe(505);
    expect(records).toBe(27131);
    expect(references).toBe(11355);
    expect(runs).toBe(15098);
  }, 60000);
});
