/** Offline media decode/transcode feasibility; no Windows or original-resource writes. */
import { resources } from '../../scripts/lib/e2e-resources.mjs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const output=process.env.E2E_OUTPUT_DIR ?? resources.tempDir('artifacts');
const tmp=resources.tempDir('media');
const base=path.resolve('agent-original/extracted/Data');
const report={method:'ffprobe + complete offline decoding + disposable MP4 conversion; not Windows parity',files:[]};
async function run(cmd,args){return new Promise((resolve,reject)=>{const c=resources.spawn(cmd,args,{stdio:['ignore','pipe','pipe']});let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);c.once('error',reject);c.once('exit',code=>code===0?resolve(out):reject(Error(`${cmd} exit ${code}: ${err}`)));});}
try{
 await mkdir(output,{recursive:true});
 report.ffmpeg=(await run('ffmpeg',['-version'])).split('\n')[0];
 for(const name of ['Final.avi','Rolik1.avi','Rolik2.avi','Rolik5.avi','Title.avi','Titres.avi']){
  const file=path.join(base,name),raw=await readFile(file);
  const info=JSON.parse(await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));
  await run('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-map','0:a:0','-f','null','-']);
  const entry={name,sha256:createHash('sha256').update(raw).digest('hex'),header:raw.subarray(0,64).toString('hex'),info,completeDecode:'pass'};
  if(name==='Rolik2.avi'){
   const converted=path.join(tmp,'rolik2.mp4');
   await run('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-map','0:a:0','-c:v','libx264','-pix_fmt','yuv420p','-crf','18','-c:a','aac','-b:a','128k','-movflags','+faststart',converted]);
   entry.converted={bytes:(await stat(converted)).size,info:JSON.parse(await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',converted]))};
   await run('ffmpeg',['-v','error','-i',converted,'-f','null','-']);
   entry.converted.completeDecode='pass';
  }
  report.files.push(entry);console.log(name,'decode pass',entry.converted?'MP4 conversion pass':'');
 }
 await writeFile(path.join(output,'media-probe.json'),JSON.stringify(report,null,2));
}finally{await resources.cleanup();}
