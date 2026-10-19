import { describe, expect, it } from 'vitest';
import { SaveCodec, saveContentHash, type GameSaveV1 } from '../src/scene/save-codec';

function sample(): GameSaveV1 {
  return {
    format:'agent-revers.game-save', schemaVersion:1, contentId:'content-a',
    createdAt:'2026-10-19T12:00:00.000Z', label:'checkpoint',
    world:{
      currentSceneId:1, activeLevel:1,
      inventory:[5,2,5], map:{model:'banked-v1',bank:1,unlocked:[[false,true,false,false,false,false,false],[true,false,false,false,false,false,false]]},
      hero:{position:[0,0],direction:6,mode:'navigation',transform:{x:0,y:0,scaleX:1,scaleY:1,anchorX:0.5,anchorY:1}},
      scenes:[{id:1,initialized:true,savedPosition:[0,0],savedDirection:6,objects:[
        {name:'Mainhero',state:0,depth:0,image:{kind:'mult',reference:{file:'Stop0',frame:1,slot:1,child:0}},kind:'Object',transform:{x:0,y:0,scaleX:1,scaleY:1,anchorX:0.5,anchorY:1}},
      ]}],
    },
  };
}

describe('GameSaveV1 codec', () => {
  it('uses the standard SHA-256 digest', () => {
    expect(saveContentHash('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('round-trips a deterministic envelope with order, duplicates, and banked map intact', () => {
    const save=sample();
    const encoded=SaveCodec.encode(save);
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(SaveCodec.decode(encoded.value,{contentId:'content-a',sceneIds:[1]})).toEqual({ok:true,value:save});
    expect(SaveCodec.encode(save)).toEqual(encoded);
  });

  it('rejects corrupt digest, incompatible content, duplicate identities and malformed bank rows', () => {
    const encoded=SaveCodec.encode(sample());
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    const envelope=JSON.parse(encoded.value);
    envelope.payload=envelope.payload.replace('checkpoint','changed');
    expect(SaveCodec.decode(JSON.stringify(envelope)).ok).toBe(false);
    expect(SaveCodec.validate(sample(),{contentId:'other'})).toMatchObject({ok:false,error:{code:'IncompatibleSave'}});
    const duplicate=sample(); duplicate.world.scenes[0].objects.push({...duplicate.world.scenes[0].objects[0]});
    expect(SaveCodec.validate(duplicate).ok).toBe(false);
    const malformed=sample(); malformed.world.map.model==='banked-v1' && malformed.world.map.unlocked[0].pop();
    expect(SaveCodec.validate(malformed).ok).toBe(false);
  });

  it('preserves legal unvisited Lstate placeholders and rejects placeholders in visited scenes', () => {
    const save=sample();
    save.world.scenes.push({id:2,initialized:false,savedPosition:[0,0],savedDirection:6,objects:[
      {name:'Remote',state:3,depth:0,image:{kind:'unassigned'},placeholder:true},
    ]});
    expect(SaveCodec.validate(save).ok).toBe(true);
    save.world.scenes[1].initialized=true;
    expect(SaveCodec.validate(save).ok).toBe(false);
  });
});
