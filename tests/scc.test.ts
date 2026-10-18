import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeMult } from '../src/mult/decoder';
import { SccRuntime, parseScc, type SccHost } from '../src/scc/runtime';

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
