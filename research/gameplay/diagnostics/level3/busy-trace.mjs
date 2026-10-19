import { boot, enter, ev, sleep, close } from './cdp.mjs';
import { writeFile } from 'node:fs/promises';
try {
    await boot();
    await ev(`(async()=>{
    const {SccRuntime}=await import('/src/scc/runtime.ts');
    const run=SccRuntime.prototype.run;
    window.__busyTrace=[];
    SccRuntime.prototype.run=function(program){
      const before=this.busy, pc=program.pc;
      const result=run.call(this,program);
      if(this.handlers.some(h=>h.event==='Plocat') && before!==this.busy)
        window.__busyTrace.push({before,after:this.busy,pcBefore:pc,pcAfter:program.pc,active:program.active,commands:program.program.commands,
          waitingPrograms:this.programs.filter(p=>p.active).map(p=>({pc:p.pc,waiting:p.waiting,waitName:p.waitName}))});
      return result;
    };
  })()`);
    await enter(3);
    await sleep(1000);
    const trace = await ev('window.__busyTrace');
    await writeFile('research/gameplay/evidence/level3-regression/busy-writer-trace.json', JSON.stringify(trace, null, 2));
    console.log(trace);
}
finally {
    close();
}
