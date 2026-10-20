import type { PersistentWorldSnapshot, SavedImage, Transform } from './scene-loader';

export type GameSaveV1 = {
  format: 'agent-revers.game-save';
  schemaVersion: 1;
  contentId: string;
  createdAt: string;
  label: string;
  world: PersistentWorldSnapshot & { activeLevel: number; currentSceneId: number };
};
export type SaveErrorCode = 'InvalidSave' | 'IncompatibleSave' | 'ResourceLoadFailed' | 'RestoreFailed' | 'Busy' | 'TransitionInProgress';
export type SaveError = { code: SaveErrorCode; message: string; cause?: unknown };
export type Result<T, E = SaveError> = { ok: true; value: T } | { ok: false; error: E };
export type SaveEligibility = { ok: true } | { ok: false; code: 'Busy' | 'TransitionInProgress'; reason: string };
export type SaveEnvelopeV1 = { storageVersion: 1; payload: string; integrity: { algorithm: 'sha256-utf8'; digest: string } };
export type SaveDecodePhase = 'envelopeJsonMs' | 'sha256Ms' | 'payloadJsonMs' | 'schemaValidationMs';

const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const MAX_SCENES = 128;
const MAX_OBJECTS_PER_SCENE = 4096;
const MAX_INVENTORY = 100;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const plainObject = (value: unknown): value is Record<string, unknown> => object(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const onlyKeys = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every(key => keys.includes(key));
const integer = (value: unknown, min: number, max: number) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

// Small synchronous SHA-256 implementation so the core API stays synchronous in browsers.
function sha256(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const words: number[] = [];
  for (const byte of bytes) words.push(byte);
  const bitLength = bytes.length * 8;
  words.push(0x80);
  while (words.length % 64 !== 56) words.push(0);
  for (let i = 7; i >= 0; i--) words.push(i < 4 ? (bitLength >>> (i * 8)) & 255 : 0);
  const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const rr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < words.length; offset += 64) {
    const w = new Array<number>(64);
    for (let i = 0; i < 16; i++) w[i] = ((words[offset+i*4]<<24)|(words[offset+i*4+1]<<16)|(words[offset+i*4+2]<<8)|words[offset+i*4+3]) >>> 0;
    for (let i = 16; i < 64; i++) { const a=w[i-15], b=w[i-2]; w[i]=(w[i-16]+(rr(a,7)^rr(a,18)^(a>>>3))+w[i-7]+(rr(b,17)^rr(b,19)^(b>>>10)))>>>0; }
    let [a,b,c,d,e,f,g,hh] = h;
    for (let i=0;i<64;i++) { const t1=(hh+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0; const t2=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b)^(a&c)^(b&c)))>>>0; hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0; }
    [a,b,c,d,e,f,g,hh].forEach((v,i)=>h[i]=(h[i]+v)>>>0);
  }
  return h.map((n) => n.toString(16).padStart(8,'0')).join('');
}
export function saveContentHash(input: string): string { return sha256(input); }

function fail(message: string): Result<never> { return { ok: false, error: { code: 'InvalidSave', message } }; }
function checkTransform(value: unknown): value is Transform {
  return plainObject(value) && onlyKeys(value,['x','y','scaleX','scaleY','anchorX','anchorY']) && Object.keys(value).length===6 && ['x','y','scaleX','scaleY','anchorX','anchorY'].every((key) => finite(value[key]));
}
function checkImage(value: unknown): value is SavedImage {
  if (!plainObject(value)) return false;
  if (value.kind === 'empty' || value.kind === 'unassigned') return Object.keys(value).length === 1;
  if (value.kind !== 'mult' || !plainObject(value.reference) || Object.keys(value).length!==2 || !onlyKeys(value.reference,['file','frame','slot','child']) || Object.keys(value.reference).length!==4) return false;
  const ref = value.reference;
  return typeof ref.file === 'string' && ref.file.length > 0 && integer(ref.frame,1,100000) && integer(ref.slot,1,100000) && integer(ref.child,0,100000);
}
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export class SaveCodec {
  static validate(save: unknown, options: { contentId?: string; sceneIds?: readonly number[]; validItem?: (id: number) => boolean } = {}): Result<GameSaveV1> {
    if (!plainObject(save) || !onlyKeys(save,['format','schemaVersion','contentId','createdAt','label','world']) || Object.keys(save).length!==6) return fail('Save root must be a strict JSON object');
    if (save.format !== 'agent-revers.game-save' || save.schemaVersion !== 1) return { ok:false, error:{code:'IncompatibleSave',message:'Unsupported save format or schema version'} };
    if (typeof save.contentId !== 'string' || !save.contentId || (options.contentId && save.contentId !== options.contentId)) return { ok:false,error:{code:'IncompatibleSave',message:'Save contentId does not match this game content'} };
    if (typeof save.createdAt !== 'string' || !Number.isFinite(Date.parse(save.createdAt)) || !save.createdAt.endsWith('Z')) return fail('createdAt must be an ISO UTC date');
    if (typeof save.label !== 'string' || save.label.length > 256) return fail('Invalid save label');
    const candidateWorld=save.world;
    if (!plainObject(candidateWorld) || !onlyKeys(candidateWorld,['activeLevel','currentSceneId','scenes','inventory','map','hero']) || !['activeLevel','currentSceneId','scenes','inventory','map'].every(key=>own(candidateWorld,key))) return fail('Missing or unsupported world data');
    const world = candidateWorld as Record<string,unknown>;
    if (!integer(world.activeLevel,1,10000) || world.currentSceneId !== world.activeLevel) return fail('Invalid active Level');
    if (!Array.isArray(world.inventory) || world.inventory.length > MAX_INVENTORY || world.inventory.some(id => !integer(id,1,59) || (options.validItem && !options.validItem(id)))) return fail('Invalid inventory contents');
    if (!Array.isArray(world.scenes) || world.scenes.length > MAX_SCENES) return fail('Invalid scene table size');
    const ids = new Set<number>();
    for (const scene of world.scenes) {
      if (!plainObject(scene) || !onlyKeys(scene,['id','initialized','savedPosition','savedDirection','objects']) || Object.keys(scene).length!==5 || !integer(scene.id,1,10000) || ids.has(scene.id as number)) return fail('Invalid or duplicate scene ID');
      ids.add(scene.id as number);
      if (options.sceneIds && !options.sceneIds.includes(scene.id as number)) return {ok:false,error:{code:'IncompatibleSave',message:`Unknown scene ${scene.id}`}};
      if (typeof scene.initialized !== 'boolean' || !Array.isArray(scene.savedPosition) || scene.savedPosition.length !== 2 || !scene.savedPosition.every(finite) || !integer(scene.savedDirection,0,7)) return fail(`Invalid saved scene fields for ${scene.id}`);
      if (!Array.isArray(scene.objects) || scene.objects.length > MAX_OBJECTS_PER_SCENE) return fail(`Invalid object list in scene ${scene.id}`);
      const names = new Set<string>();
      for (const item of scene.objects) {
        if (!plainObject(item) || !onlyKeys(item,['name','state','depth','cursorId','image','transform','visible','rect','kind','placeholder']) || typeof item.name !== 'string' || !item.name || item.name.length > 256) return fail(`Invalid object identity in scene ${scene.id}`);
        const key = `${item.placeholder === true ? 'placeholder' : String(item.kind ?? 'Object')}:${item.name.toUpperCase()}`;
        if (names.has(key)) return fail(`Duplicate object identity ${item.name} in scene ${scene.id}`);
        names.add(key);
        if (!integer(item.state,0,49)) return fail(`Invalid object State for ${item.name}`);
        if (item.placeholder === true) {
          if (scene.initialized || own(item,'kind') || own(item,'mult') || own(item,'visible') || own(item,'transform') || own(item,'rect') || !checkImage(item.image) || item.image.kind !== 'unassigned') return fail(`Invalid Lstate placeholder ${item.name}`);
          continue;
        }
        if (!integer(item.depth,-100000,100000) || (item.cursorId !== undefined && !integer(item.cursorId,0,255)) || !checkImage(item.image)) return fail(`Invalid persistent object fields for ${item.name}`);
        if (item.transform !== undefined && !checkTransform(item.transform)) return fail(`Invalid transform for ${item.name}`);
        if (item.visible !== undefined && typeof item.visible !== 'boolean') return fail(`Invalid visibility for ${item.name}`);
        if (item.kind !== undefined && !['Object','Active','Light'].includes(String(item.kind))) return fail(`Invalid object kind for ${item.name}`);
        const rect=item.rect as Record<string,unknown>|undefined;
        if (rect !== undefined && (!object(rect) || !['left','top','right','bottom'].every(key=>finite(rect[key])))) return fail(`Invalid rectangle for ${item.name}`);
      }
    }
    if (!ids.has(world.activeLevel as number) || !world.scenes.find(s => s.id === world.activeLevel && s.initialized)) return fail('Active Level must be present and initialized');
    const map=world.map as Record<string,unknown>;
    if (plainObject(map) && map.model === 'legacy-zone-v1') { if (!onlyKeys(map,['model','zone']) || Object.keys(map).length!==2 || !integer(map.zone,0,6)) return fail('Invalid legacy map'); }
    else if (plainObject(map) && map.model === 'banked-v1') {
      const unlocked=map.unlocked;
      if (!onlyKeys(map,['model','bank','unlocked']) || Object.keys(map).length!==3 || !integer(map.bank,0,1) || !Array.isArray(unlocked) || unlocked.length !== 2 || unlocked.some((row:unknown)=>!Array.isArray(row)||row.length!==7||row.some((v:unknown)=>typeof v!=='boolean'))) return fail('Invalid banked map');
    } else return fail('Unknown map model');
    if (world.hero !== null && world.hero !== undefined && (!plainObject(world.hero) || !onlyKeys(world.hero,['position','direction','mode','transform']) || !Array.isArray(world.hero.position) || world.hero.position.length!==2 || !world.hero.position.every(finite) || !integer(world.hero.direction,0,7) || !['navigation','object','hidden'].includes(String(world.hero.mode)) || (world.hero.transform!==undefined&&!checkTransform(world.hero.transform)))) return fail('Invalid active hero state');
    return { ok:true, value:save as GameSaveV1 };
  }

  static encode(save: GameSaveV1): Result<string> {
    const checked = this.validate(save);
    if (!checked.ok) return checked;
    const payload = canonicalJson(save);
    if (new TextEncoder().encode(payload).byteLength > MAX_PAYLOAD_BYTES) return fail('Save exceeds 2 MiB limit');
    const envelope: SaveEnvelopeV1 = { storageVersion:1, payload, integrity:{algorithm:'sha256-utf8',digest:sha256(payload)} };
    return {ok:true,value:JSON.stringify(envelope)};
  }

  static decode(serialized: string, options: { contentId?: string; sceneIds?: readonly number[]; validItem?: (id: number) => boolean } = {}, onTiming?: (phase: SaveDecodePhase, durationMs: number) => void): Result<GameSaveV1> {
    if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).byteLength > MAX_PAYLOAD_BYTES + 1024) return fail('Save envelope exceeds size limit');
    let envelope: unknown;
    let phaseStart=performance.now();
    try { envelope=JSON.parse(serialized); } catch { return fail('Save envelope is not valid JSON'); }
    onTiming?.('envelopeJsonMs',performance.now()-phaseStart);
    if (!plainObject(envelope)||!onlyKeys(envelope,['storageVersion','payload','integrity'])||Object.keys(envelope).length!==3||envelope.storageVersion!==1||typeof envelope.payload!=='string'||!plainObject(envelope.integrity)||!onlyKeys(envelope.integrity,['algorithm','digest'])||Object.keys(envelope.integrity).length!==2||envelope.integrity.algorithm!=='sha256-utf8'||typeof envelope.integrity.digest!=='string') return fail('Invalid save envelope');
    if (new TextEncoder().encode(envelope.payload).byteLength > MAX_PAYLOAD_BYTES) return fail('Save payload exceeds 2 MiB limit');
    phaseStart=performance.now();
    const digest=sha256(envelope.payload);
    onTiming?.('sha256Ms',performance.now()-phaseStart);
    if (digest!==envelope.integrity.digest) return fail('Save digest mismatch');
    let save: unknown;
    phaseStart=performance.now();
    try { save=JSON.parse(envelope.payload); } catch { return fail('Save payload is not valid JSON'); }
    onTiming?.('payloadJsonMs',performance.now()-phaseStart);
    phaseStart=performance.now();
    const result=this.validate(save,options);
    onTiming?.('schemaValidationMs',performance.now()-phaseStart);
    return result;
  }
}
