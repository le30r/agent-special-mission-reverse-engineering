import { describe, expect, it } from 'vitest';
import { SaveCodec, type GameSaveV1 } from '../src/scene/save-codec';
import { SAVE_SLOT_COUNT, SaveRepository, saveSlotKey } from '../src/scene/save-repository';

class MemoryStorage {
  data = new Map<string, string>();
  failSet?: unknown;
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void { if (this.failSet) throw this.failSet; this.data.set(key, String(value)); }
}
function sample(contentId = 'content-a'): GameSaveV1 {
  return { format:'agent-revers.game-save', schemaVersion:1, contentId, createdAt:'2026-10-19T12:00:00.000Z', label:'checkpoint', world:{
    currentSceneId:1, activeLevel:1, inventory:[5], map:{model:'banked-v1',bank:1,unlocked:[[false,true,false,false,false,false,false],[true,false,false,false,false,false,false]]},
    hero:{position:[0,0],direction:6,mode:'navigation'}, scenes:[{id:1,initialized:true,savedPosition:[0,0],savedDirection:6,objects:[
      {name:'Mainhero',state:0,depth:0,image:{kind:'mult',reference:{file:'Stop0',frame:1,slot:1,child:0}},kind:'Object',transform:{x:0,y:0,scaleX:1,scaleY:1,anchorX:.5,anchorY:1}},
    ]}],
  }};
}

describe('SaveRepository', () => {
  it('discovers six empty independent slots and writes/reads codec envelopes', async () => {
    const storage = new MemoryStorage(); const repository = new SaveRepository(storage as unknown as Storage, { contentId:'content-a', sceneIds:[1] });
    expect((await repository.list()).map(x => x.status)).toEqual(Array(SAVE_SLOT_COUNT).fill('empty'));
    expect(await repository.write(0, sample(), null)).toMatchObject({ok:true});
    const loaded = await repository.read(0);
    expect(loaded).toEqual({ok:true,value:sample()});
    expect(JSON.parse(storage.data.get(saveSlotKey(0))!).integrity.algorithm).toBe('sha256-utf8');
    expect((await repository.list())[0]).toMatchObject({status:'valid',label:'checkpoint',level:1});
    expect((await repository.list())[1].status).toBe('empty');
  });

  it('preserves and isolates malformed slots and reports schema/content incompatibility', async () => {
    const storage = new MemoryStorage(); storage.data.set(saveSlotKey(1), '{broken');
    const repository = new SaveRepository(storage as unknown as Storage, { contentId:'content-a', sceneIds:[1] });
    expect((await repository.list())[1]).toMatchObject({status:'corrupt'});
    expect(await repository.read(1)).toMatchObject({ok:false});
    expect(storage.getItem(saveSlotKey(1))).toBe('{broken');
    expect(await repository.write(2, sample('other'), null)).toMatchObject({ok:false,error:{code:'IncompatibleSave'}});
    expect((await repository.list())[0].status).toBe('empty');
  });

  it('detects stale versions and leaves old data intact on write and quota failures', async () => {
    const storage = new MemoryStorage(); const repository = new SaveRepository(storage as unknown as Storage, { contentId:'content-a', sceneIds:[1] });
    const original = SaveCodec.encode(sample())!;
    if (!original.ok) throw new Error('fixture invalid');
    storage.data.set(saveSlotKey(0), original.value);
    const changed = SaveCodec.encode({ ...sample(), label:'other tab' });
    if (!changed.ok) throw new Error('fixture invalid');
    storage.data.set(saveSlotKey(0), changed.value);
    expect(await repository.write(0, sample(), original.value)).toMatchObject({ok:false,error:{code:'Conflict'}});
    const before = storage.getItem(saveSlotKey(0));
    storage.failSet = Object.assign(new Error('quota'), { name:'QuotaExceededError' });
    expect(await repository.write(0, sample(), before)).toMatchObject({ok:false,error:{code:'StorageWriteFailed'}});
    expect(storage.getItem(saveSlotKey(0))).toBe(before);
  });

  it('round-trips a JSON export envelope and rejects incompatible content IDs', async () => {
    const encoded = SaveCodec.encode(sample());
    if (!encoded.ok) throw new Error('fixture invalid');
    expect(SaveCodec.decode(encoded.value, { contentId:'content-a', sceneIds:[1] })).toMatchObject({ok:true,value:{label:'checkpoint'}});
    expect(SaveCodec.decode(encoded.value, { contentId:'other', sceneIds:[1] })).toMatchObject({ok:false,error:{code:'IncompatibleSave'}});
  });
});
