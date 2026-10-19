"""Read-only artifact probe and bounded, instruction-derived navigation replay.

Requires Python 3 and libtiff's tiffcp. No game process or browser implementation.
Replays integer routing exactly for tested in-bounds, non-overflowing cases;
Python libm/float32 approximates original x87/software-trig arithmetic (see spec).
"""
from array import array
from collections import Counter, deque
from pathlib import Path
import hashlib
import json
import math
import os
import time
import shutil
import signal
import struct
import subprocess
import sys
import tempfile

def _terminate(signum, frame):
    # Raise through subprocess.run and TemporaryDirectory so both unwind normally.
    raise SystemExit(128 + signum)


signal.signal(signal.SIGTERM, _terminate)

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
RES = ROOT / 'agent-original/game-resources'
BASE = ROOT / 'agent-original/game-installed/Program_Executable_Files'
sys.path.insert(0, str(ROOT / 'research/mult'))
from mult_probe import read_mult, png

FORWARD = [(0,1,2),(0,-1,2),(1,0,2),(-1,0,2),
           (1,1,3),(1,-1,3),(-1,-1,3),(-1,1,3)]
BACK = [(0,1),(0,-1),(1,0),(-1,0),(1,1),(-1,1),(1,-1),(-1,-1)]
f32 = lambda x: struct.unpack('<f', struct.pack('<f', x))[0]
sha = lambda b: hashlib.sha256(b).hexdigest()


def tiff_tags(data):
    assert data[:4] == b'II*\0'
    at = struct.unpack_from('<I', data, 4)[0]
    count = struct.unpack_from('<H', data, at)[0]
    tags = {}
    for i in range(count):
        tag, kind, n, value = struct.unpack_from('<HHII', data, at+2+12*i)
        size = {1:1, 2:1, 3:2, 4:4, 5:8, 7:1}[kind] * n
        raw = data[at+2+12*i+8:at+2+12*i+12] if size <= 4 else data[value:value+size]
        tags[tag] = list(struct.unpack('<'+{1:'B',2:'B',3:'H',4:'I',5:'I',7:'B'}[kind]*(n*2 if kind == 5 else n), raw[:size]))
    return tags


def decode_tiff(path):
    """Use libtiff to undo LZW and horizontal predictor, then read scanlines."""
    tool = shutil.which('tiffcp')
    if not tool:
        raise RuntimeError('Install libtiff (tiffcp required) before running this probe')
    owner = hashlib.sha256(str(ROOT.resolve()).encode()).hexdigest()[:16]
    temporary_root = Path(tempfile.gettempdir()) / f'agent-revers-tests-{owner}'
    temporary_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='navigation-', dir=temporary_root) as temp:
        (Path(temp) / 'owner.json').write_text(json.dumps({
            'owner': owner, 'pid': os.getpid(), 'created': time.time() * 1000, 'groups': []
        }))
        target = Path(temp) / 'decoded.tif'
        subprocess.run([tool, '-c', 'none', '-r', '600', str(path), str(target)], check=True, timeout=60)
        data = target.read_bytes()
    tags = tiff_tags(data)
    assert tags[258] == [8] and tags[277] == [1] and tags[259] == [1]
    assert tags[262] == [1] and tags.get(274, [1]) == [1]
    pixels = b''.join(data[o:o+n] for o,n in zip(tags[273],tags[279]))
    w,h = tags[256][0],tags[257][0]
    assert len(pixels) == w*h
    return w,h,pixels


def pe_reader(data):
    pe = struct.unpack_from('<I',data,0x3c)[0]
    n = struct.unpack_from('<H',data,pe+6)[0]
    optional = struct.unpack_from('<H',data,pe+20)[0]
    sections = [struct.unpack_from('<4I',data,pe+24+optional+i*40+8) for i in range(n)]
    def read(va,n):
        rva = va-0x400000
        _, start, size, offset = next(s for s in sections if s[1] <= rva < s[1]+s[2])
        at = offset+rva-start
        return data[at:at+n]
    return read


class Scene:
    def __init__(self,w,h,pixels,focus=(120.,1.,1.)):
        self.w,self.h,self.pixels = w,h,pixels
        self.focus,self.depth_factor,self.scale_factor = focus

    def q(self,x,y):
        return 255-self.pixels[y*self.w+x] if 0 <= x < self.w and 0 <= y < self.h else 0

    def depth(self,x,y):
        q = self.q(x,y)
        return math.floor(q*self.depth_factor+0.5) if q else -1

    def scale(self,x,y):
        z = self.depth(x,y)
        return self.focus/(self.focus+z)*self.scale_factor if z >= 0 else -1.

    def snap(self,point):
        # 0x409874: increasing radius, 20 angles, x uses cos, y uses sin.
        # Original angle stored float32; original trig returns x87 extended.
        for radius in range(self.w):
            for k in range(20):
                angle = f32(k*(2*math.pi)*0.05)
                x = math.trunc(point[0]+radius*math.cos(angle))
                y = math.trunc(point[1]+radius*math.sin(angle))
                if y > 0 and self.q(x,y):
                    return (x,y),radius,k
        return None

    def route(self,start,target):
        snapped = self.snap(target)
        if not snapped:
            return dict(status='no-walkable-sample',start=start,target=target)
        target = snapped[0]
        dist = array('H',[65535])*(self.w*self.h)
        queue = deque([start])
        dist[start[1]*self.w+start[0]] = 0
        peak, pops = 1,0
        while queue:
            x,y = queue.popleft()
            pops += 1
            if (x,y) == target:
                break
            d = dist[y*self.w+x]
            for dx,dy,cost in FORWARD:
                nx,ny=x+dx,y+dy
                if self.q(nx,ny):
                    idx=ny*self.w+nx
                    new=(d+cost)&65535
                    if new < dist[idx]:
                        dist[idx]=new
                        queue.append((nx,ny))
            peak=max(peak,len(queue))
            assert peak < 0x1130, 'Original ring queue would overflow'
        result=dict(start=start,target=target,snap_radius=snapped[1],snap_angle_index=snapped[2],
                    queue_peak=peak,pops=pops,target_label=dist[target[1]*self.w+target[0]])
        if result['target_label'] == 65535:
            return dict(result,status='disconnected',path=[])
        point=target
        path=[]
        while point != start:
            x,y=point
            assert 0 < x < self.w-1 and 0 < y < self.h-1, 'Native backtrace has no bounds guards'
            best=65535
            chosen=None
            for dx,dy in BACK:
                candidate=(x+dx,y+dy)
                label=dist[candidate[1]*self.w+candidate[0]]
                if label < best:
                    chosen,best=candidate,label
            assert chosen is not None and best < dist[y*self.w+x], 'Backtrace failed to descend'
            point=chosen
            path.append(point)
            assert len(path)<10000, 'Original static route array capacity not guaranteed'
        assert (not path or path[-1] == start) and target not in path
        return dict(result,status='route',path=path,length=len(path),
                    path_sha256=sha(b''.join(struct.pack('<ii',*p) for p in path)))


def replay(scene,route,dt,direction=0):
    """Synthetic elapsed-time replay, not a trace captured from Agent.exe."""
    path=route['path']; remaining=len(path); position=route['start']; samples=[]
    previous=older=-1
    factors=[1.,f32(.7)]*4
    while remaining > 0:
        step=max(1,math.floor(dt*.25*f32(scene.scale(*position))*factors[direction]+.5))
        remaining-=step
        if remaining <= 0:
            break  # native stop branch does not assign target or path[0]
        before=position
        position=path[remaining]
        angle=math.atan2(before[1]-position[1],position[0]-before[0])
        if angle<0:angle=f32(angle+2*math.pi)
        candidate=math.floor(f32(f32(angle)*(4/math.pi))+.5)%8
        if older == -1:
            previous=older=candidate
        if candidate==previous==older:
            direction=candidate
        older,previous=previous,candidate
        if len(samples)<5:
            samples.append(dict(position=position,remaining=remaining,step=step,direction=direction))
    return dict(dt=dt,final_position=position,target=route['target'],
                target_delta=[position[i]-route['target'][i] for i in range(2)],first_samples=samples)


def components(scene):
    seen=bytearray(scene.w*scene.h)
    sizes=[]
    for at,pixel in enumerate(scene.pixels):
        if pixel==255 or seen[at]:
            continue
        queue=deque([at]);seen[at]=1;size=0
        while queue:
            pos=queue.popleft();size+=1;x,y=pos%scene.w,pos//scene.w
            for dx,dy,_ in FORWARD:
                nx,ny=x+dx,y+dy
                if scene.q(nx,ny):
                    idx=ny*scene.w+nx
                    if not seen[idx]:
                        seen[idx]=1;queue.append(idx)
        sizes.append(size)
    return sorted(sizes,reverse=True)


def main():
    mask=RES/'block0/Masks/Scn_01_1.TIF'
    w,h,pixels=decode_tiff(mask)
    assert (w,h)==(1736,600)
    exe=(BASE/'Agent.exe').read_bytes();read=pe_reader(exe)
    assert sha(exe)=='71065c571a9cd40f460458d766720c0a01954e0bef521aad675b4ea6b3186e85'
    assert struct.unpack('<f',read(0x4059bc,4))[0]==.5
    assert struct.unpack('<f',read(0x405a04,4))[0]==-1.
    assert struct.unpack('<f',read(0x409ee4,4))[0]==.25
    factors=struct.unpack('<8f',read(0x444a24,32))
    assert factors==(1.,f32(.7))*4
    assert struct.unpack('<2f',read(0x40986c,8))==(250.,.5)
    level=(BASE/'Scripts/Level1.scc').read_text();lines=level.splitlines()
    assert 'Focus 120 1 1' in level and 'Mask Masks\\scn_01_1.tif' in level
    assert 'Setxy 1199 524' in level
    at=lines.index('Click 0 Botl Botl')
    assert [l.strip() for l in lines[at+3:at+6]]==['Goto 660 480','StartW Takedr1','Setxy 670 477']
    scene=Scene(w,h,pixels)
    points=[(1199,524),(660,480),(670,477),(250,450),(1400,280),(110,330),(1677,560),(118,340)]
    samples=[dict(x=x,y=y,pixel=pixels[y*w+x],q=scene.q(x,y),depth=scene.depth(x,y),scale=scene.scale(x,y),snap=scene.snap((x,y))) for x,y in points]
    assert scene.q(660,480)==scene.q(670,477)==14
    assert math.isclose(scene.scale(670,477),60/67)
    routes=[]
    for start,target in [((1199,524),(660,480)),((250,450),(660,480)),((670,477),(1400,280))]:
        r=scene.route(start,target)
        routes.append(r)
    # Separate synthetic mask demonstrates that snapping checks walkability,
    # not connectivity, and that no fallback to reachable boundary occurs.
    synthetic=Scene(7,7,bytes(240 if (x,y) in [(1,1),(1,2),(5,5)] else 255 for y in range(7) for x in range(7)))
    failure=synthetic.route((1,1),(5,5))
    assert failure['status']=='disconnected' and failure['target']==(5,5)
    assert Scene(3,3,bytes([255])*9).snap((1,1)) is None
    same=scene.route((660,480),(660,480))
    assert same['length']==0
    assert all(r['status']=='route' for r in routes)
    assert routes[0]['length']==539 and routes[0]['path_sha256']=='d78da9b88acc044590dc11aa247aaf3507f6f4e93687ee423af7e8060be8012e'
    component_sizes=components(scene)
    assert component_sizes==[197165]
    # The original only tests the diagonal destination, not orthogonal corners.
    corner=Scene(5,5,bytes(240 if (x,y) in [(1,1),(2,2)] else 255 for y in range(5) for x in range(5)))
    assert corner.route((1,1),(2,2))['length']==1
    # MULT frames remain separate from path state; verify actual pickup anchors.
    mult=[]
    for relative in ['block1/Xsh/Base/walk0.MULT','block1/Xsh/Base/stop6.MULT',
                     'block9/Xsh/Scn_37/Step_02.MULT','block9/Xsh/Scn_37/start.MULT']:
        data,palette,rows,resolve,_=read_mult(RES/relative)
        objects=[]
        for frame,row in enumerate(rows,1):
            for i,record in enumerate(row):
                if record['name']=='Mainhero':
                    resolved=resolve(frame,i)
                    objects.append(dict(frame=frame,offset=hex(record['offset']),position=record['position'],
                                        size=[resolved['a'],resolved['b']]))
        mult.append(dict(path=relative,sha256=sha(data),hero_records=objects))
    assert all(r['position']==(0.,0.) for r in mult[0]['hero_records'])
    replays=[replay(scene,routes[0],dt) for dt in [15,16,33,100]]
    scale32=f32(scene.scale(670,477))
    objx=f32(670-w//2);objy=f32(h//2-477+278*scale32/2)
    cx=math.trunc(w//2+objx);cy=math.trunc(h//2-objy)
    bounds=[cx-math.floor(127*scale32/2),cy-math.floor(278*scale32/2),
            cx+math.ceil(127*scale32/2),cy+math.ceil(278*scale32/2)]
    assert bounds==[614,228,727,477]
    background=RES/'block1/Backgrd/Scn_37.TIF'
    background_tags=tiff_tags(background.read_bytes())
    assert (background_tags[256][0],background_tags[257][0])==(w,h)
    manifest={str(p.relative_to(ROOT)):sha(p.read_bytes()) for p in [BASE/'Agent.exe',BASE/'Scripts/Level1.scc',BASE/'Scripts/Mainhero.scc',mask,background]}
    summary=dict(method='Static resources + instruction-derived offline replay, not original-process trace',
                 source_sha256=manifest,width=w,height=h,pixel_sha256=sha(pixels),
                 histogram=dict(sorted(Counter(pixels).items())),walkable=sum(p!=255 for p in pixels),
                 component_sizes=component_sizes,
                 constants={hex(a):read(a,n).hex() for a,n in [(0x4059bc,4),(0x405a04,4),(0x40986c,8),(0x409950,18),(0x409ee4,30),(0x444a24,32)]},
                 same_y_samples=[dict(x=x,y=480,pixel=pixels[480*w+x],scale=scene.scale(x,480)) for x in [100,250,500,660,800,1000,1200]],
                 samples=samples,routes=[{k:v for k,v in r.items() if k!='path'} for r in routes],
                 replays=replays,synthetic_disconnected=failure,same_point={k:v for k,v in same.items() if k!='path'},mult=mult)
    summary['setxy_example']=dict(world=[670,477],stop6_size=[127,278],scale32=scale32,
                                 object_xy=[objx,objy],scroll=[0,0],center=[cx,cy],bounds=bounds)
    (OUT/'evidence/verification.json').write_text(json.dumps(summary,indent=2)+'\n')
    (OUT/'evidence/routes.json').write_text(json.dumps(routes,indent=2)+'\n')
    rgba=bytearray()
    route_set=set(routes[0]['path'])
    for y in range(h):
        for x in range(w):
            p=pixels[y*w+x]
            color=(255,60,20) if (x,y) in route_set else ((35,35,35) if p==255 else (p,p,p))
            rgba.extend((*color,255))
    png(OUT/'mask_route.png',w,h,rgba)
    print(json.dumps({k:summary[k] for k in ['walkable','pixel_sha256','samples','routes','replays']},indent=2))


if __name__=='__main__':
    main()
