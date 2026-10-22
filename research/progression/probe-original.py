"""Read-only SCC/PE/MULT inventory. No Windows process execution."""
from pathlib import Path
import struct,json,hashlib,argparse,importlib.util
ROOT=Path(__file__).resolve().parents[2]
BASE=ROOT/'agent-original/game-installed/Program_Executable_Files'
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
class PE:
 def __init__(self,p):
  self.data=p.read_bytes();d=self.data;pe=struct.unpack_from('<I',d,0x3c)[0];n=struct.unpack_from('<H',d,pe+6)[0];o=pe+24;size=struct.unpack_from('<H',d,pe+20)[0];self.base=struct.unpack_from('<I',d,o+28)[0];self.sections=[]
  for i in range(n):
   at=o+size+40*i;vs,va,rs,raw=struct.unpack_from('<IIII',d,at+8);self.sections.append((va,max(vs,rs),raw,rs))
 def read(self,va,n):
  rva=va-self.base
  for start,size,raw,rs in self.sections:
   if start<=rva and rva+n<=start+rs:return self.data[raw+rva-start:raw+rva-start+n]
  raise ValueError(hex(va))
 def ints(self,va,n):return list(struct.unpack('<'+'i'*n,self.read(va,n*4)))
def main():
 parser=argparse.ArgumentParser(__doc__);parser.add_argument('--output',type=Path);args=parser.parse_args()
 pe=PE(BASE/'Agent.exe');out={'authority':'static original bytes; no Windows process','hashes':{},'scc':{},'commands':{},'destinations':pe.ints(0x4456b4,28),'positions':pe.ints(0x44576c,14),'display_rect':pe.ints(0x446338,4)}
 for name in ['Agent.exe','zvideo.dll']:out['hashes'][name]=digest(BASE/name)
 # Full Level34 include closure, preserved with source line identities.
 todo=['Level34.scc'];seen=set()
 while todo:
  name=todo.pop(0)
  if name.lower() in seen:continue
  seen.add(name.lower());p=next(x for x in (BASE/'Scripts').iterdir() if x.name.lower()==name.lower());lines=p.read_text(encoding='cp1251').splitlines();out['hashes']['Scripts/'+p.name]=digest(p);out['scc'][p.name]=[{'line':n,'source':s}for n,s in enumerate(lines,1)]
  for line in lines:
   if line.startswith('Inc '):todo.append(line.split('\\')[-1])
 for p in sorted((BASE/'Scripts').glob('*.scc')):
  handler=case=None
  for n,s in enumerate(p.read_text(encoding='cp1251').splitlines(),1):
   words=s.split()
   if not words:continue
   if words[0]=='Click':handler=s
   if words[0]=='Case':case=s
   if words[0] in ['Level','Goport','Portal','Setmap','Setzon','SclipW','Block','Ublock','Egame']:
    out['commands'].setdefault(words[0],[]).append({'file':p.name,'line':n,'source':s,'handler':handler,'case':case})
 spec=importlib.util.spec_from_file_location('multprobe',ROOT/'research/mult/mult_probe.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
 files=['XSH/Interface/map.MULT','XSH/SCN_34/start.MULT','XSH/SCN_34/step_05_r.MULT','XSH/SCN_34/step_04_on.MULT']
 out['mult']={}
 for name in files:
  p=next(x for x in (ROOT/'agent-original/game-resources').rglob('*')if x.is_file() and str(x).lower().endswith(name.lower()))
  data,palette,records,resolve,field=m.read_mult(p);out['hashes'][name]=digest(p);out['mult'][name]=[[{**r,'resolved':resolve(r['slot'],r['child'])}for r in row]for row in records]
 if args.output:args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(out,ensure_ascii=False,indent=2))
 print(json.dumps({k:out[k]for k in ['destinations','positions','display_rect']},indent=2));print('SCC closure:',list(out['scc']));print('command counts:',{k:len(v)for k,v in out['commands'].items()})
if __name__=='__main__':main()
