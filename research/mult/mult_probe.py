"""Offline MULT research verifier. Originals are read-only; outputs stay here.

Reconstruction follows Agent.exe SHA256 71065c57...3186e85:
0040c094 (container), 0040c14c (references), 00401d00 (RLE).
This is not a browser engine or an exact emulator of the DirectDraw renderer.
"""
from pathlib import Path, PureWindowsPath
from collections import Counter
from array import array
import hashlib
import json
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / 'agent-original/game-resources'
OUT = Path(__file__).resolve().parent

def u32(data, at):
    return struct.unpack_from('<I', data, at)[0]

def cstr(data):
    return data.split(b'\0', 1)[0].decode('cp1251')

def read_mult(path):
    data = path.read_bytes()
    if not data:
        raise ValueError('empty resource: no MULT header')
    assert len(data) >= 0x4000
    count, field4 = struct.unpack_from('<II', data)
    palette = data[8:0x4000]
    assert len(palette) == 4094 * 4
    records = []
    at = 0x4000
    for slot in range(1, count + 1):
        children = u32(data, at)
        at += 4
        row = []
        for child in range(children):
            tag, size, a, b = struct.unpack_from('<iIii', data, at + 0x32)
            assert size >= 74 and at + size <= len(data), (at, tag, size)
            position = struct.unpack_from('<ff', data, at + size - 8)
            rec = dict(slot=slot, child=child, offset=at, tag=tag, size=size,
                       name=cstr(data[at:at+50]), a=a, b=b, position=position)
            if tag == -16:
                assert a >= 0 and b >= 0
                stream = array('H', data[at+66:at+size-8])
                if sys.byteorder != 'little':
                    stream.byteswap()
                cursor = 0
                indices = set()
                for y in range(b):
                    x = 0
                    while x < a:
                        assert cursor < len(stream), (at, 'truncated RLE', y)
                        token = stream[cursor]
                        cursor += 1
                        x += (token >> 12) + 1
                        index = token & 0xfff
                        assert index < 4094
                        indices.add(index)
                    assert x == a, (at, 'RLE crosses row', y, x, a)
                assert cursor == len(stream), (at, 'unused RLE words', len(stream)-cursor)
                rec.update(width=a, height=b, rle_words=len(stream),
                           used_indices=sorted(indices), rle_sha256=hashlib.sha256(data[at+66:at+size-8]).hexdigest())
            elif tag == -13:
                assert size == 74
                rec.update(target_slot=a, target_child=b)
            elif tag == -14:
                assert size == 330
                rec.update(width=a, height=b, external=cstr(data[at+66:at+322]))
            else:
                raise AssertionError((at, 'unknown record tag', tag))
            row.append(rec)
            at += size
        records.append(row)
    assert at == len(data), ('trailing bytes', len(data)-at)
    def resolve(slot, child, seen=None):
        seen = set() if seen is None else seen
        assert (slot,child) not in seen, ('reference cycle',slot,child)
        seen.add((slot,child))
        assert 1 <= slot <= len(records), ('bad slot',slot)
        assert 0 <= child < len(records[slot-1]), ('bad child',slot,child)
        rec=records[slot-1][child]
        return resolve(rec['target_slot'], rec['target_child'], seen) if rec['tag']==-13 else rec
    for row in records:
        for rec in row:
            resolve(rec['slot'],rec['child'])
    return data, palette, records, resolve, field4

def png(path, width, height, rgba):
    def chunk(kind, payload):
        return struct.pack('>I',len(payload))+kind+payload+struct.pack('>I',zlib.crc32(kind+payload)&0xffffffff)
    raw=b''.join(b'\0'+rgba[y*width*4:(y+1)*width*4] for y in range(height))
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))

def preview(data,palette,rec):
    """Source-plus-background preview; not standard straight RGBA or exact blit rounding.

    Keep original palette bytes: some RGB values exceed alpha, so blindly
    unpremultiplying or enforcing standard premultiplied-alpha bounds is wrong.
    """
    at=rec['offset']+66
    raw=bytearray()
    for y in range(rec['height']):
        x=0
        while x<rec['width']:
            token=struct.unpack_from('<H',data,at)[0];at+=2
            index=token&4095;run=(token>>12)+1
            b,g,r,a=palette[index*4:index*4+4]
            for xx in range(x,x+run):
                bg=220 if ((xx//12+y//12)&1) else 160
                rgb=[min(255,round(v+bg*(255-a)/255)) if a else bg for v in (r,g,b)]
                raw.extend((*rgb,255))
            x+=run
    return bytes(raw)

def verify_rss(files):
    archives=[ROOT/'agent-original/game-installed/Program_Executable_Files/block0.rss']
    archives += [ROOT/f'agent-original/extracted/block{i}.rss' for i in range(1,12)]
    checked=0
    for archive in archives:
        with archive.open('rb') as f:
            count=struct.unpack('<I',f.read(4))[0]
            table=f.read(count*92)
            for i in range(count):
                entry=table[i*92:(i+1)*92]
                name=cstr(entry[:80]);offset,size=struct.unpack_from('<II',entry,80)
                if PureWindowsPath(name).suffix.lower()!='.mult':continue
                rel=archive.stem+'/'+PureWindowsPath(name).as_posix()
                target=files[rel.lower()]
                f.seek(offset);payload=f.read(size)
                assert payload==target.read_bytes(), ('RSS mismatch',rel)
                checked+=1
    return checked

def main():
    paths=sorted(p for p in BASE.rglob('*') if p.suffix.lower()=='.mult')
    inventory={str(p.relative_to(BASE)).lower():p for p in paths}
    report=dict(executable_sha256=hashlib.sha256((ROOT/'agent-original/game-installed/Program_Executable_Files/Agent.exe').read_bytes()).hexdigest(),
                files=[], errors=[], empty=[], counts=Counter(), subcounts=Counter(), external_missing=[], palette_stats=Counter())
    previews=[]
    requested=['block1/Xsh/Base/walk0.MULT','block1/Xsh/Base/walk1.MULT','block1/Xsh/Base/walk2.MULT',
               'block1/Xsh/Base/stop0.MULT','block7/Xsh/Scn_27/Start_m.MULT','block8/Xsh/Scn_31/Step_02.MULT',
               'block0/XSH/Interface/small.MULT']
    all_paths={str(p.relative_to(BASE)).split('/',1)[1].replace('\\','/').lower() for p in BASE.rglob('*') if p.is_file() and '/' in str(p.relative_to(BASE))}
    for p in paths:
        rel=str(p.relative_to(BASE));raw=p.read_bytes()
        if not raw:
            report['empty'].append(rel);continue
        try:
            data,pal,records,resolve,field4=read_mult(p)
            flat=[r for row in records for r in row]
            used=set()
            for row in records:
                report['subcounts'][len(row)]+=1
                for r in row:
                    report['counts'][str(r['tag'])]+=1
                    used.update(r.get('used_indices',[]))
                    if r['tag']==-14 and r['external'].replace('\\','/').lower() not in all_paths:
                        report['external_missing'].append([rel,r['slot'],r['child'],r['external']])
            report['palette_stats']['field4_equals_max_index_plus1']+=bool(used and field4==max(used)+1)
            report['palette_stats']['field4_bounds_used_indices']+=bool(not used or max(used)<field4)
            for idx in used:
                b,g,r,a=pal[idx*4:idx*4+4]
                report['palette_stats']['used_entries']+=1
                report['palette_stats']['alpha_zero']+=a==0
                report['palette_stats']['partial_alpha']+=0<a<254
                report['palette_stats']['positive_alpha_rgb_exceeds_alpha']+=bool(a and max(b,g,r)>a)
            item=dict(path=rel,size=len(data),sha256=hashlib.sha256(data).hexdigest(),timeline_entries=len(records),field4=field4,
                      record_count=len(flat),tags=dict(Counter(str(r['tag']) for r in flat)),
                      max_index=max(used) if used else None,
                      records=[{k:v for k,v in r.items() if k!='used_indices'} for r in flat])
            report['files'].append(item)
            if rel in requested:
                rec=resolve(1,0)
                if rec['tag']==-16:
                    name=rel.replace('/','_')+'.png'
                    png(OUT/name,rec['width'],rec['height'],preview(data,pal,rec))
                    previews.append((name,rec['width'],rec['height']))
        except Exception as exc:
            report['errors'].append([rel,repr(exc)])
    report['rss_matches']=verify_rss(inventory)
    report['previews']=previews
    (OUT/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=False,indent=2))
    print('validated files',len(report['files']))
    assert not report['errors']

if __name__=='__main__':main()
