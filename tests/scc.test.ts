import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeMult } from '../src/mult/decoder';
import { SccRuntime, parseFaultLists, parseFclickBindings, parseScc, selectFaultVoiceIndex, type SccHost } from '../src/scc/runtime';

describe('SCC Fault declarations and selection', () => {
  it('parses the original Level1, Level17, and Level29 declarations exactly', async () => {
    const scripts = path.join(process.cwd(), 'agent-original/game-installed/Program_Executable_Files/Scripts');
    const level1 = parseFaultLists(await readFile(path.join(scripts, 'Level1.scc'), 'utf8'), 1);
    expect(level1.lists[0]).toMatchObject({ objectName: 'Morda', voices: ['SOUND\\scn_01\\otboy\\otd_001.wav'] });
    const level17 = parseFaultLists(await readFile(path.join(scripts, 'Level17.scc'), 'utf8'), 17);
    expect(level17.lists.find((list) => list.objectName === 'New_janitor1')?.voices).toEqual(['SOUND\\scn_17\\otboy\\Sound042.wav']);
    expect(level17.diagnostics.some((diagnostic) => diagnostic.includes('derived scanner-state compatibility'))).toBe(true);
    const level29 = parseFaultLists(await readFile(path.join(scripts, 'Level29.scc'), 'utf8'), 29);
    expect(level29.lists.find((list) => list.objectName === 'Janitor')?.voices).toEqual([
      'Sound\\scn_29\\konst\\002.wav', 'Sound\\scn_29\\otboy\\Sound065.wav',
    ]);
  });

  it('preserves declaration order, duplicate names, duplicate paths, and multiline resources', () => {
    const parsed = parseFaultLists([
      'Fault Janitor 2 Sound\\scn_29\\konst\\002.wav',
      '  Sound\\scn_29\\otboy\\Sound065.wav',
      'Fault Janitor 1 Sound\\scn_29\\konst\\002.wav',
      'Fault Duplicates 2 a.wav a.wav',
      'Click 0 Janitor Janitor',
    ].join('\n'));
    expect(parsed.diagnostics).toEqual([]);
    expect(parsed.lists).toEqual([
      { objectName: 'Janitor', voices: ['Sound\\scn_29\\konst\\002.wav', 'Sound\\scn_29\\otboy\\Sound065.wav'], line: 1 },
      { objectName: 'Janitor', voices: ['Sound\\scn_29\\konst\\002.wav'], line: 3 },
      { objectName: 'Duplicates', voices: ['a.wav', 'a.wav'], line: 4 },
    ]);
  });

  it('uses the original biased rand15 formula and rejects unsafe lists/counts', () => {
    expect([0, 8191, 8192, 32767].map((value) => selectFaultVoiceIndex(2, value))).toEqual([0, 0, 1, 1]);
    expect([0, 32767].map((value) => selectFaultVoiceIndex(1, value))).toEqual([0, 0]);
    expect(selectFaultVoiceIndex(0, 0)).toBeUndefined();
    expect(selectFaultVoiceIndex(2, 32768)).toBeUndefined();
    expect(parseFaultLists('Fault Bad nope.wav\nFault Empty 2 only.wav\nFault Overflow 11 a.wav').diagnostics).toHaveLength(3);
  });

  it('keeps Level17 line 127 as one explicit derived compatibility case only', () => {
    const source = `${'Fault Prior 1 prior.wav\n'.repeat(126)}Fault New_janitor1 SOUND\\scn_17\\otboy\\Sound042.wav`;
    const parsed = parseFaultLists(source, 17);
    expect(parsed.lists.at(-1)).toMatchObject({ objectName: 'New_janitor1', voices: ['SOUND\\scn_17\\otboy\\Sound042.wav'] });
    expect(parsed.diagnostics.at(-1)).toContain('derived scanner-state compatibility');
    expect(parseFaultLists('Fault Other voice.wav', 18).lists).toEqual([]);
  });

  it('runs the synthetic Fault program through the SCC executor and native no-route Speak special case', () => {
    const events: string[] = [];
    let moving = false, speaking = false;
    const runtime = new SccRuntime('', {
      pathActive: () => moving,
      animationActive: () => speaking,
      startAnimation: (name) => { events.push(`StartW:${name}`); speaking = true; },
      setPosition: (x, y) => events.push(`Setxy:${x},${y}`),
      setDepth: () => {},
      goto: (x, y) => { events.push(`Goto:${x},${y}`); moving = true; return true; },
    });
    runtime.dispatchFault(125, 300);
    expect(runtime.programs.at(-1)).toMatchObject({ active: true, waiting: true, pc: 0 });
    moving = false; runtime.tick();
    expect(events).toEqual(['Goto:125,300', 'Setxy:125,300', 'StartW:Speak']);
    expect(runtime.busy).toBe(true);
    speaking = false; runtime.tick();
    expect(events).toEqual(['Goto:125,300', 'Setxy:125,300', 'StartW:Speak', 'Setxy:125,300']);
    expect(runtime.busy).toBe(false);

    const noRoute: string[] = [];
    const fallback = new SccRuntime('', {
      pathActive: () => false, animationActive: () => false,
      startAnimation: (name) => noRoute.push(`StartW:${name}`),
      setPosition: (x, y) => noRoute.push(`Setxy:${x},${y}`), setDepth: () => {},
      goto: () => false,
    });
    fallback.dispatchFault(9, 10);
    expect(noRoute).toEqual(['StartW:Speak']);
  });
});

describe('cooperative SCC runtime', () => {
  it('splits inline braces while preserving source line attribution across the SCC corpus', async () => {
    const scripts = path.join(process.cwd(), 'agent-original/game-installed/Program_Executable_Files/Scripts');
    const files = (await readdir(scripts)).filter((file) => file.endsWith('.scc')).sort();
    expect(files).toHaveLength(57);
    for (const file of files) {
      const source = await readFile(path.join(scripts, file), 'utf8');
      expect(parseScc(source), file).toHaveLength((source.match(/^\s*Click\s/img) ?? []).length);
    }

    const level38 = await readFile(path.join(scripts, 'Level38.scc'), 'utf8');
    const handlers = parseScc(level38);
    expect(handlers).toHaveLength(27);
    expect(handlers.find((handler) => handler.event === 'Lora' && handler.itemId === 0)?.programs.get(1)?.commands).toEqual([
      { op: 'Goto', x: 555, y: 498 }, { op: 'StartW', name: 'K_talke' },
      { op: 'Setxy', x: 555, y: 497 }, { op: 'State', name: 'Lora', value: 2 },
    ]);
    expect(handlers.find((handler) => handler.event === 'Gungster' && handler.itemId === 4)?.programs.get(1)?.commands).toEqual([
      { op: 'Goto', x: 655, y: 490 }, { op: 'Stop', name: 'Bandit1_c' },
      { op: 'Stop', name: 'Bandit2_c' }, { op: 'StartW', name: 'Victoti' },
      { op: 'Setxy', x: 650, y: 490 }, { op: 'State', name: 'Pank', value: 2 },
      { op: 'Setmsk', path: 'Masks\\Scn_38.tif' }, { op: 'Cursor', name: 'Lora', value: 7 },
      { op: 'State', name: 'Lora', value: 1 },
    ]);

    const inline = parseScc('Click 0 Demo Demo\n{ Case 1\n Addtol 1\n}\nClick 0 Next Next\n{\n Case 0\n Addtol 2\n Break\n}');
    expect(inline).toHaveLength(2);
    expect(inline[0].programs.get(1)?.commands).toEqual([{ op: 'Addtol', id: 1 }]);
    expect(inline[1].programs.get(0)?.commands).toEqual([{ op: 'Addtol', id: 2 }]);

    expect(parseFaultLists('Fault First 1 first.wav\n\nFault Broken nope.wav').diagnostics).toEqual([
      'line 3: Fault Broken has invalid or missing count',
    ]);
  });

  it('parses Break at load time and suspends/resumes the bottle program in source order', async () => {
    const source=await readFile(path.join(process.cwd(),'agent-original/game-installed/Program_Executable_Files/Scripts/Level1.scc'),'utf8');
    const animationBytes=await readFile(path.join(process.cwd(),'agent-original/game-resources/block9/Xsh/Scn_37/Step_02.MULT'));
    const animation=decodeMult(animationBytes);
    const handler=parseScc(source).find((item)=>item.event==='Botl');
    expect(handler?.programs.get(0)?.commands.map((item)=>item.op)).toEqual(['Goto','StartW','Setxy','Addtol','State']);
    const events:string[]=[];
    let pathActive=false, animationActive=false, bottleVisible=true;
    const host:SccHost & {goto:(x:number,y:number)=>boolean}={
      pathActive:()=>pathActive,animationActive:()=>animationActive,
      startAnimation:(name)=>{events.push(`StartW:${name}`);animationActive=true;},
      setPosition:(x,y)=>{events.push(`Setxy:${x},${y}`);},
      setDepth:(name,depth)=>events.push(`Objzet:${name}:${depth}`),
      goto:(x,y)=>{events.push(`Goto:${x},${y}`);pathActive=true;return true;},
    };
    const runtime=new SccRuntime(source,host);runtime.states.set('Botl',0);
    expect(runtime.click('Botl')).toBe(true);
    expect(runtime.programs[0]).toMatchObject({active:true,waiting:true,pc:0});
    expect(runtime.inventory).toEqual([]);
    pathActive=false;runtime.tick();
    expect(runtime.programs[0]).toMatchObject({active:true,waiting:true,pc:1});
    expect(runtime.busy).toBe(true);
    runtime.tick();expect(runtime.inventory).toEqual([]);
    const emptyBottle=animation.frames[9].find((record)=>record.name==='Botl');
    expect(emptyBottle).toBeDefined();
    const emptyImage=animation.resolve(emptyBottle!.slot,emptyBottle!.child);
    bottleVisible=Boolean(emptyImage.width && emptyImage.height);
    expect(bottleVisible).toBe(false);
    animationActive=false;runtime.tick();
    expect(events).toEqual(['Goto:660,480','StartW:Takedr1','Setxy:670,477']);
    expect(runtime.inventory).toEqual([1]);
    expect(runtime.states.get('Botl')).toBe(1);
    expect(bottleVisible).toBe(false);
    expect(runtime.programs[0].active).toBe(false);
    expect(runtime.click('Botl')).toBe(false);
  });

  it('Start advances immediately while StartW keeps a continuation waiting', () => {
    const source=`Click 0 Demo Demo\n{\n Case 0\n  Start Blink\n  Addtol 3\n  StartW Finish\n  Addtol 4\n Break\n}`;
    let active=false;const host:SccHost={pathActive:()=>false,animationActive:()=>active,startAnimation:(name)=>{if(name==='Finish')active=true;},setPosition:()=>{},setDepth:()=>{}};
    const runtime=new SccRuntime(source,host);
    runtime.click('Demo');
    expect(runtime.inventory).toEqual([3]);
    expect(runtime.programs[0]).toMatchObject({active:true,waiting:true,pc:2});
    active=false;runtime.tick();
    expect(runtime.inventory).toEqual([3,4]);
    expect(runtime.programs[0].active).toBe(false);
  });

  it('keeps StartW busy while a later concurrent Start Program finishes', () => {
    const source = `Click 0 Start Interface
{
 Case 0
  StartW A
  State checkpoint 1
 Break
}
Click 0 Start Vent
{
 Case 0
  Start ambient
 Break
}`;
    let animationAActive = false;
    const started: string[] = [];
    const runtime = new SccRuntime(source, {
      pathActive: () => false,
      animationActive: (name) => name === 'A' && animationAActive,
      startAnimation: (name) => { started.push(name); if (name === 'A') animationAActive = true; },
      setPosition: () => {}, setDepth: () => {},
    });

    runtime.dispatch('Start');

    expect(started).toEqual(['A', 'ambient']);
    expect(runtime.programs).toHaveLength(2);
    expect(runtime.programs[0]).toMatchObject({ active: true, waiting: true, pc: 0 });
    expect(runtime.programs[1]).toMatchObject({ active: false, waiting: false });
    expect(runtime.states.get('checkpoint')).toBeUndefined();
    expect(runtime.busy).toBe(true);

    animationAActive = false;
    runtime.tick();

    expect(runtime.states.get('checkpoint')).toBe(1);
    expect(runtime.programs[0].active).toBe(false);
    expect(runtime.busy).toBe(false);
  });

  it('adjacent Case labels share one Program and Break starts the next list', () => {
    const source='Click 0 Demo Demo\n{\n Case 0\n Case 1\n  Addtol 1\n Break\n Case 2\n  Addtol 2\n Break\n}';
    const handler=parseScc(source)[0];
    expect(handler.programs.get(0)).toBe(handler.programs.get(1));
    expect(handler.programs.get(0)?.commands).toEqual([{op:'Addtol',id:1}]);
    expect(handler.programs.get(2)?.commands).toEqual([{op:'Addtol',id:2}]);
    expect(handler.programs.get(0)).not.toBe(handler.programs.get(2));
    const host:SccHost={pathActive:()=>false,animationActive:()=>false,startAnimation:()=>{},setPosition:()=>{},setDepth:()=>{}};
    const caseZero=new SccRuntime(source,host); caseZero.click('Demo');
    expect(caseZero.inventory).toEqual([1]);
    const caseOne=new SccRuntime(source,host); caseOne.states.set('Demo',1); caseOne.click('Demo');
    expect(caseOne.inventory).toEqual([1]);
    const caseTwo=new SccRuntime(source,host); caseTwo.states.set('Demo',2); caseTwo.click('Demo');
    expect(caseTwo.inventory).toEqual([2]);
  });

  it('uses Click stateScene for selection but executes programs in the active scene', () => {
    const source = `Click 0 Probe Flag 10\n{\n Case 0\n  State Local 20\n Break\n Case 1\n  State Local 21\n Break\n}`;
    const handler = parseScc(source)[0];
    expect(handler.stateScene).toBe(10);
    let remote = 1;
    const host: SccHost = {
      pathActive: () => false, animationActive: () => false, startAnimation: () => {},
      setPosition: () => {}, setDepth: () => {}, readState: (_name, scene) => scene === 10 ? remote : 0,
    };
    const runtime = new SccRuntime(source, host);
    runtime.dispatch('Probe');
    expect(runtime.states.get('Local')).toBe(21);
    remote = 0;
    runtime.dispatch('Probe');
    expect(runtime.states.get('Local')).toBe(20);
    expect(parseScc('Click 0 Probe Flag {\n Case 0\n Break\n}')[0].stateScene).toBe(-1);
    expect(parseScc('Click 0 Probe Flag -1\n{\n Case 0\n Break\n}')[0].stateScene).toBe(-1);
  });

  it('maps all five real StatrW calls to StartW and retains Fclick as load-time metadata', async () => {
    const scripts = path.join(process.cwd(), 'agent-original/game-installed/Program_Executable_Files/Scripts');
    const expected = new Map([[10, ['Speak_t1', 'Speak_tl']], [18, ['K_talke', 'Exchenge']], [25, ['Bom_bez_shl']]]);
    let total = 0;
    for (const [scene, names] of expected) {
      const source = await readFile(path.join(scripts, `Level${scene}.scc`), 'utf8');
      const commands = parseScc(source).flatMap((handler) => [...handler.programs.values()].flatMap((program) => program.commands));
      for (const name of names) {
        expect(commands).toContainEqual({ op: 'StartW', name });
        total++;
      }
    }
    expect(total).toBe(5);
    expect(parseFclickBindings('Start K_bandit Fclick Name\nStart Other Fclick End')).toEqual(new Map([['K_bandit', 'Name'], ['Other', 'End']]));
  });

  it('keeps Block boolean independent of StartW busy until explicit Ublock', () => {
    const source = `Click 0 Cutscene Interface\n{\n Case 0\n  Block\n  Block\n  StartW Walk\n  Addtol 1\n  Ublock\n Break\n}`;
    let active = false, blocked = false;
    const runtime = new SccRuntime(source, {
      pathActive: () => false, animationActive: () => active,
      startAnimation: () => { active = true; }, setPosition: () => {}, setDepth: () => {},
      setBlocked: (value) => { blocked = value; },
    });
    runtime.dispatch('Cutscene');
    expect(blocked).toBe(true);
    expect(runtime.busy).toBe(true);
    active = false;
    runtime.tick();
    expect(blocked).toBe(false);
    expect(runtime.inventory).toEqual([1]);
    expect(runtime.busy).toBe(false);
  });

  it('executes original Level5 Objzet depth changes as SCC commands', async () => {
    const source=await readFile(path.join(process.cwd(),'agent-original/game-installed/Program_Executable_Files/Scripts/Level5.scc'),'utf8');
    const depthChanges:string[]=[];
    const host:SccHost={pathActive:()=>false,animationActive:()=>false,startAnimation:()=>{},setPosition:()=>{},setDepth:(name,depth)=>depthChanges.push(`${name}:${depth}`)};
    const runtime=new SccRuntime(source,host);
    const clickIndex=source.indexOf('Objzet Col_all 5');
    runtime.states.set('Boy_a',2);
    expect(clickIndex).toBeGreaterThan(0);
    runtime.click('Start');
    expect(depthChanges).toContain('Col_all:5');
    expect(depthChanges).toContain('Col_vaz:6');
  });
});
