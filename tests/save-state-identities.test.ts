import { Container, Texture } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { buildSceneDefinition } from '../src/scene/scene-definition';
import { SaveCodec, type GameSaveV1 } from '../src/scene/save-codec';
import { SceneSession } from '../src/scene/scene-session';
import { parseObjectCreationIdentities } from '../src/scc/runtime';

const source = `
Object Interface 0 0
Active Switch 0 0 0 0 10 10
Light Ambient 0 0
Anim 1 Stop0 Casm unused.mult
Sound Stop0
Fram 1 -1 1 FrameDepthFlag 12
Fram 0 -1 1 ZeroFrame 12
Fram 2 -1 1 OutOfRangeFrame 12
Sound MissingAnimation
Fram 1 -1 1 MissingAnimationFrame 12
State Outside 1
Click 0 Init Interface { Case 0
  Addtol 5
Break }
Click 0 Create Interface { Case 0
  State DynamicFlag 1
  State MixedCase 2
  State Switch 1
  State Ambient 1
  Cursor CursorFlag 5
  Hide CursorFlag
  Objzet DepthFlag 7
Break }
Click 0 Inspect ReadOnlySelector { Case 0
  // State CommentOnly 1
  Lstate RemoteOnly 1 2
  Show ShowOnly
  Hide HideOnly
Break }
`;

function definition(id: number, scc = source) {
  return buildSceneDefinition({
    id, scc, sccUrl: `scene-${id}`, background: '',
    mask: { width: 800, height: 600, pixels: new Uint8Array(800 * 600) },
    mults: new Map([['Stop0', {
      frameCount: 1, paletteField: 0, paletteBGRA: new Uint8Array(), frames: [[]],
      resolve() { throw new Error('No image records in this fixture'); },
    }]]),
    // Included declarations are parsed, but included Programs are not executed
    // by SceneView's SCC runtime and must not widen the restore allowlist.
    includeSources: ['Click 0 Included Interface { Case 0\nState IncludeOnly 1\nBreak }'],
  });
}

function setup() {
  const session = new SceneSession(new Container(), new Map([
    [1, definition(1)], [2, definition(2, 'Object Interface 0 0\nAnim 1 Stop0 Casm unused.mult')],
  ]), new Map([[1, Texture.EMPTY], [2, Texture.EMPTY]]));
  session.request(1, -1);
  session.flush(); session.flush();
  expect(session.view?.scc.dispatch('Create')).toBe(true);
  session.markPostTick();
  return session;
}

function exportSave(session: SceneSession): GameSaveV1 {
  const result = session.exportSave('dynamic State roundtrip');
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function envelopeRoundtrip(save: GameSaveV1): GameSaveV1 {
  const encoded = SaveCodec.encode(save);
  if (!encoded.ok) throw new Error(encoded.error.message);
  const decoded = SaveCodec.decode(encoded.value);
  if (!decoded.ok) throw new Error(decoded.error.message);
  return decoded.value;
}

describe('SCC State-created save identities', () => {
  it('derives identities only from object-creating instructions in parsed Programs', () => {
    expect([...parseObjectCreationIdentities(source)]).toEqual(['DYNAMICFLAG', 'MIXEDCASE', 'SWITCH', 'AMBIENT', 'CURSORFLAG', 'DEPTHFLAG']);
    // The earlier Case 0 Program is replaced, exactly as in the interpreter.
    expect([...parseObjectCreationIdentities(`Click 0 Run Interface { Case 0
      State Replaced 1
    Break
    Case 0
      State Actual 1
    Break }`)]).toEqual(['ACTUAL']);
  });

  it('round-trips actual runtime-created objects through export, codec and real SceneView restore', async () => {
    const session = setup();
    try {
      const saved = envelopeRoundtrip(exportSave(session));
      const dynamic = saved.world.scenes[0].objects.find(item => item.name === 'DynamicFlag');
      expect(dynamic).toMatchObject({ state: 1, kind: 'Object', image: { kind: 'unassigned' } });
      session.view!.scc.host.writeState!('DynamicFlag', 9);
      expect(await session.importSave(saved)).toEqual({ ok: true, value: undefined });
      expect(session.loader.readState(1, 'dynamicflag')).toBe(1);
      expect(session.loader.readState(1, 'mixedcase')).toBe(2);
      expect(session.loader.state(1).objects.get('CursorFlag')?.cursorId).toBe(5);
      expect(session.loader.state(1).objects.get('CursorFlag')?.imageHidden).toBe(true);
      expect(session.loader.state(1).objects.get('DepthFlag')?.depth).toBe(7);
      expect(session.loader.inventory).toEqual([5]); // Init must not replay.
      session.markPostTick();
      expect((await session.importSave(envelopeRoundtrip(exportSave(session)))).ok).toBe(true);
      expect(session.loader.readState(1, 'DynamicFlag')).toBe(1);
    } finally { session.loader.disposeRuntime(); }
  });

  it('accepts case-insensitive State names and the V1 default Object kind', async () => {
    const session = setup();
    try {
      const saved = exportSave(session);
      const dynamic = saved.world.scenes[0].objects.find(item => item.name === 'DynamicFlag')!;
      dynamic.name = 'dynamicflag';
      delete dynamic.kind;
      expect((await session.importSave(saved)).ok).toBe(true);
      expect(session.loader.readState(1, 'DYNAMICFLAG')).toBe(1);
    } finally { session.loader.disposeRuntime(); }
  });

  it.each(['Foreign', 'ReadOnlySelector', 'Outside', 'CommentOnly', 'RemoteOnly', 'IncludeOnly', 'ShowOnly', 'HideOnly', 'ZeroFrame', 'OutOfRangeFrame', 'MissingAnimationFrame'])(
    'rejects non-State identity %s without replacing the live session', async name => {
      const session = setup();
      try {
        const saved = exportSave(session);
        saved.world.scenes[0].objects.push({ name, state: 1, depth: 0, kind: 'Object', image: { kind: 'unassigned' } });
        const view = session.view, loader = session.loader;
        expect(await session.importSave(envelopeRoundtrip(saved))).toMatchObject({ ok: false, error: { code: 'IncompatibleSave', message: `Unknown Object identity ${name} in scene 1` } });
        expect(session.view).toBe(view);
        expect(session.loader).toBe(loader);
        expect(session.loader.readState(1, 'DynamicFlag')).toBe(1);
      } finally { session.loader.disposeRuntime(); }
    },
  );

  it('round-trips a dynamic object created by a real Fram depth hook', async () => {
    const session = setup();
    try {
      session.view!.scc.host.startAnimation('Stop0');
      session.view!.tick(2000, 2000, 1);
      session.view!.tick(2000, 4000, 2);
      session.markPostTick();
      expect(session.loader.state(1).objects.get('FrameDepthFlag')?.depth).toBe(12);
      expect((await session.importSave(envelopeRoundtrip(exportSave(session)))).ok).toBe(true);
      expect(session.loader.state(1).objects.get('FrameDepthFlag')?.depth).toBe(12);
    } finally { session.loader.disposeRuntime(); }
  });

  it.each(['Active', 'Light'] as const)('does not accept a State name as %s', async kind => {
    const session = setup();
    try {
      const saved = exportSave(session);
      saved.world.scenes[0].objects.find(item => item.name === 'DynamicFlag')!.kind = kind;
      expect(await session.importSave(saved)).toMatchObject({ ok: false, error: { code: 'IncompatibleSave' } });
    } finally { session.loader.disposeRuntime(); }
  });

  it.each(['Switch', 'Ambient'])('does not retype declared %s as a dynamic Object', async name => {
    const session = setup();
    try {
      const saved = exportSave(session);
      saved.world.scenes[0].objects.find(item => item.name === name)!.kind = 'Object';
      expect(await session.importSave(saved)).toMatchObject({ ok: false, error: { message: `Unknown Object identity ${name} in scene 1` } });
    } finally { session.loader.disposeRuntime(); }
  });

  it('does not bypass identity or MULT validation when kind is omitted', async () => {
    const session = setup();
    try {
      const saved = exportSave(session);
      saved.world.scenes[0].objects.push({ name: 'Foreign', state: 1, depth: 0, image: { kind: 'unassigned' } });
      expect(await session.importSave(saved)).toMatchObject({ ok: false, error: { message: 'Unknown Object identity Foreign in scene 1' } });
      saved.world.scenes[0].objects.pop();
      saved.world.scenes[0].objects.find(item => item.name === 'DynamicFlag')!.image = {
        kind: 'mult', reference: { file: 'Stop0', frame: 1, slot: 1, child: 0 },
      };
      expect(await session.importSave(saved)).toMatchObject({ ok: false, error: { message: 'Invalid MULT identity DynamicFlag in scene 1' } });
    } finally { session.loader.disposeRuntime(); }
  });

  it('validates visited inactive scenes with their own SCC, not the active scene allowlist', async () => {
    const session = setup();
    try {
      session.request(2, -1); session.flush(); session.flush(); session.markPostTick();
      const saved = envelopeRoundtrip(exportSave(session));
      expect((await session.importSave(saved)).ok).toBe(true);
      expect(session.loader.readState(1, 'DynamicFlag')).toBe(1);
      saved.world.scenes.find(scene => scene.id === 2)!.objects.push({
        name: 'DynamicFlag', kind: 'Object', state: 1, depth: 0, image: { kind: 'unassigned' },
      });
      expect(await session.importSave(saved)).toMatchObject({ ok: false, error: { message: 'Unknown Object identity DynamicFlag in scene 2' } });
      saved.world.scenes.find(scene => scene.id === 2)!.objects.pop();
      saved.world.scenes[0].objects.push({ name: 'Foreign', kind: 'Object', state: 0, depth: 0, image: { kind: 'unassigned' } });
      expect(await session.importSave(saved)).toMatchObject({ ok: false, error: { message: 'Unknown Object identity Foreign in scene 1' } });
    } finally { session.loader.disposeRuntime(); }
  });
});
