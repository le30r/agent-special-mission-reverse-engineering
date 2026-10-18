import { describe, expect, it } from 'vitest';
import { SceneLoader, parsePortals } from '../src/scene/scene-loader';
import { parseScc, SccRuntime, type SccHost } from '../src/scc/runtime';

describe('SceneLoader persistent state and disposable runtime', () => {
  it('keeps objects/depth/MULT/inventory across re-entry and applies placeholder state', () => {
    const loader = new SceneLoader();
    loader.lstate(39,'ReturnFlag',6);
    const scene = loader.state(39);
    loader.declareObject(scene,{name:'ReturnFlag',state:0,depth:12,mult:{file:'scene.MULT',frame:2,slot:3,child:0}});
    expect(scene.objects.get('ReturnFlag')).toMatchObject({state:6,depth:12,mult:{frame:2}});
    scene.objects.set('Botl',{name:'Botl',state:1,depth:1000,mult:{file:'start.MULT',frame:1,slot:0,child:0}});
    loader.inventory.push(1); loader.schedule(39,-1);
    const enter = () => loader.enterPending(()=>{},()=>{},()=>{});
    enter(); const object = scene.objects.get('Botl');
    loader.schedule(1,1); enter(); loader.schedule(39,-1); enter();
    expect(scene.objects.get('Botl')).toBe(object);
    expect(scene.objects.get('Botl')?.state).toBe(1);
    expect(loader.inventory).toEqual([1]);
  });

  it('disposes runtime resources and invokes cancellation when leaving a scene', () => {
    let cancelled=0,disposed=0; const loader=new SceneLoader(()=>cancelled++);
    loader.schedule(1,-1); loader.enterPending(()=>{},()=>{},()=>{});
    loader.runtime!.resources.add({destroy:()=>disposed++});
    loader.schedule(39,0); loader.enterPending(()=>{},()=>{},()=>{});
    expect(cancelled).toBe(2); expect(disposed).toBe(1); expect(loader.runtime?.id).toBe(39);
  });

  it('parses indexed portals, and Level defers switching while later commands execute', () => {
    expect(parsePortals('Portal 4 1100 570\nPortal 6 1400 280')).toEqual([{direction:4,x:1100,y:570},{direction:6,x:1400,y:280}]);
    expect(parseScc('Click 0 Demo Demo\n{\nCase 0\nLevel 39 0\nAddtol 8\nBreak\n}')[0].programs.get(0)?.commands.map(x=>x.op)).toEqual(['Level','Addtol']);
    const events:string[]=[];
    const host:SccHost={pathActive:()=>false,animationActive:()=>false,startAnimation:()=>{},setPosition:()=>{},setDepth:()=>{},level:(s,p)=>events.push(`pending:${s}:${p}`)};
    const runtime=new SccRuntime('Click 0 Demo Demo\n{\nCase 0\nLevel 39 0\nAddtol 8\nBreak\n}',host);
    runtime.click('Demo'); expect(events).toEqual(['pending:39:0']); expect(runtime.inventory).toEqual([8]);
  });

  it('Goport waits for current-scene route completion before Level', () => {
    let path=true; const events:string[]=[];
    const host:SccHost={pathActive:()=>path,animationActive:()=>false,startAnimation:()=>{},setPosition:()=>{},setDepth:()=>{},goport:(index)=>{events.push(`portal:${index}`);return true;},level:(scene,index)=>events.push(`level:${scene}:${index}`)};
    const runtime=new SccRuntime('Click 0 Demo Demo\n{\nCase 0\nGoport 0\nLevel 1 1\nBreak\n}',host);
    runtime.click('Demo'); expect(events).toEqual(['portal:0']); path=false; runtime.tick(); expect(events).toEqual(['portal:0','level:1:1']);
  });
});
