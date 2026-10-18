import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeMult } from '../src/mult/decoder';
import { SccRuntime, parseFclickBindings, parseScc, type SccHost } from '../src/scc/runtime';

describe('cooperative SCC runtime', () => {
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
