import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as UTIF from 'utif';
import { buildRoute, depthAt, nextMovement, scaleAt, type NavigationMask } from '../src/navigation/router';
import { stableDepthOrder } from '../src/navigation/depth-sort';

async function loadMask(): Promise<NavigationMask> {
  const bytes=await readFile(path.join(process.cwd(),'agent-original/game-resources/block0/Masks/Scn_01_1.TIF'));
  const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  const ifd=UTIF.decode(buffer)[0];
  UTIF.decodeImage(buffer,ifd);
  return {width:Number(ifd.width),height:Number(ifd.height),pixels:(ifd.data as Uint8Array).slice()};
}

describe('original pixel navigation', () => {
  it('reproduces route controls and mask-based focus scaling', async () => {
    const mask=await loadMask();
    expect([mask.width,mask.height,mask.pixels.length]).toEqual([1736,600,1041600]);
    expect(depthAt(mask,1199,524)).toBe(12);
    expect(scaleAt(mask,660,480)).toBeCloseTo(120/134,12);
    const bottle=buildRoute(mask,[1199,524],[660,480]);
    expect(bottle.status).toBe('route');
    if(bottle.status==='route') expect([bottle.length,bottle.pathSha256,bottle.targetLabel]).toEqual([539,'d78da9b88acc044590dc11aa247aaf3507f6f4e93687ee423af7e8060be8012e',1180]);
    const corrected=buildRoute(mask,[670,477],[1400,280]);
    expect(corrected.status).toBe('route');
    if(corrected.status==='route') expect([corrected.target,corrected.length,corrected.pathSha256]).toEqual([[1396,269],844,'8a579d6a1d77a4ec8da2a101b009f46859f6640f089510e7919a6243446c0435']);
  },30000);

  it('uses terminal route semantics without snapping to the requested target', async () => {
    const mask=await loadMask();
    const route=buildRoute(mask,[1199,524],[660,480]);
    if(route.status!=='route') throw new Error('route missing');
    const first=nextMovement([1199,524],route.length,route.path,15,scaleAt(mask,1199,524),4);
    expect(first).toMatchObject({position:[1197,524],remaining:536,step:3});
    const terminal=nextMovement([662,482],2,route.path,15,scaleAt(mask,662,482),4);
    expect(terminal.position).toEqual([662,482]);
    expect(terminal.remaining).toBe(0);
  });

  it('changes front/back relation while approaching the ladder (Lect depth 14)', async () => {
    const mask=await loadMask();
    const route=buildRoute(mask,[1199,524],[1302,420]);
    expect(route.status).toBe('route');
    const nearSide=depthAt(mask,1199,524);
    const farSide=depthAt(mask,1302,420);
    expect([nearSide,farSide]).toEqual([12,15]);
    const orderAt=(heroDepth:number)=>stableDepthOrder([
      {name:'hero',depth:heroDepth,insertionOrder:0},
      {name:'Lect',depth:14,insertionOrder:1},
    ]).map(item=>item.name);
    // Smaller abs-depth draws later/in front. Walking to the deeper side reverses the relation.
    expect(orderAt(nearSide)).toEqual(['Lect','hero']);
    expect(orderAt(farSide)).toEqual(['hero','Lect']);
  },30000);
});
