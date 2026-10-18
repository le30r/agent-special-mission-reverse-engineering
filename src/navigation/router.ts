export type Point = readonly [number, number];
export type Route = { status: 'route'; start: Point; target: Point; path: Point[]; length: number; pathSha256: string; snapRadius: number; snapAngleIndex: number; targetLabel: number; pops: number } | { status: 'no-walkable-sample' | 'disconnected'; start: Point; target: Point; path: Point[] };
export type NavigationMask = { width: number; height: number; pixels: Uint8Array };

const FORWARD = [[0,1,2],[0,-1,2],[1,0,2],[-1,0,2],[1,1,3],[1,-1,3],[-1,-1,3],[-1,1,3]] as const;
const BACK = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[-1,1],[1,-1],[-1,-1]] as const;
const f32 = Math.fround;

export function sample(mask: NavigationMask, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return 0;
  return 255 - mask.pixels[y * mask.width + x];
}
export function depthAt(mask: NavigationMask, x: number, y: number, focus: readonly [number, number, number] = [120, 1, 1]): number {
  const q = sample(mask, x, y);
  return q ? Math.floor(q * focus[1] + 0.5) : -1;
}
export function scaleAt(mask: NavigationMask, x: number, y: number, focus: readonly [number, number, number] = [120, 1, 1]): number {
  const z = depthAt(mask, x, y, focus);
  return z >= 0 ? focus[0] / (focus[0] + z) * focus[2] : -1;
}

/**
 * Original mask correction 0x409874: the first walkable sample on expanding rings.
 * The same routine is used for an unreachable navigation target and for placing the
 * hero on a portal coordinate, so it is exposed as a reusable boundary.
 */
export function correctPosition(mask: NavigationMask, point: Point): { point: Point; radius: number; angle: number } | undefined {
  for (let radius = 0; radius < mask.width; radius++) {
    for (let k = 0; k < 20; k++) {
      const angle = f32(k * (2 * Math.PI) * 0.05);
      const x = Math.trunc(point[0] + radius * Math.cos(angle));
      const y = Math.trunc(point[1] + radius * Math.sin(angle));
      if (y > 0 && sample(mask, x, y) !== 0) return { point: [x, y], radius, angle: k };
    }
  }
  return undefined;
}

function sha256(bytes: Uint8Array): string {
  // Synchronous SHA-256 for deterministic node/browser route fixtures.
  const k = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const bitLen = bytes.length * 8, paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const msg = new Uint8Array(paddedLen); msg.set(bytes); msg[bytes.length] = 0x80;
  const dv = new DataView(msg.buffer); dv.setUint32(paddedLen - 4, bitLen >>> 0, false); dv.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  const w = new Uint32Array(64), rotr = (x: number,n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) { const a=w[i-15],b=w[i-2],s0=rotr(a,7)^rotr(a,18)^(a>>>3),s1=rotr(b,17)^rotr(b,19)^(b>>>10); w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0; }
    let [a,b,c,d,e,f,g,hh]=h;
    for (let i=0;i<64;i++) { const s1=rotr(e,6)^rotr(e,11)^rotr(e,25), ch=(e&f)^(~e&g), t1=(hh+s1+ch+k[i]+w[i])>>>0; const s0=rotr(a,2)^rotr(a,13)^rotr(a,22), maj=(a&b)^(a&c)^(b&c),t2=(s0+maj)>>>0; hh=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0; }
    h[0]=(h[0]+a)>>>0;h[1]=(h[1]+b)>>>0;h[2]=(h[2]+c)>>>0;h[3]=(h[3]+d)>>>0;h[4]=(h[4]+e)>>>0;h[5]=(h[5]+f)>>>0;h[6]=(h[6]+g)>>>0;h[7]=(h[7]+hh)>>>0;
  }
  return [...h].map(v=>v.toString(16).padStart(8,'0')).join('');
}

export function buildRoute(mask: NavigationMask, start: Point, requestedTarget: Point): Route {
  const corrected = correctPosition(mask, requestedTarget);
  if (!corrected) return { status: 'no-walkable-sample', start, target: requestedTarget, path: [] };
  const target = corrected.point;
  const total = mask.width * mask.height;
  const dist = new Uint16Array(total); dist.fill(0xffff);
  const capacity = 0x1130;
  const queue = new Int32Array(capacity);
  let head = 0, tail = 0, queued = 0;
  const startIndex = start[1] * mask.width + start[0];
  dist[startIndex] = 0; queue[tail] = startIndex; tail = (tail + 1) % capacity; queued++;
  const targetIndex = target[1] * mask.width + target[0];
  let pops = 0;
  while (queued) {
    const current = queue[head]; head = (head + 1) % capacity; queued--; pops++;
    if (current === targetIndex) break;
    const x = current % mask.width, y = Math.floor(current / mask.width), d = dist[current];
    for (const [dx,dy,cost] of FORWARD) {
      const nx=x+dx,ny=y+dy;
      if (!sample(mask,nx,ny)) continue;
      const index=ny*mask.width+nx,newD=(d+cost)&0xffff;
      if (newD < dist[index]) {
        dist[index]=newD;
        if (queued >= capacity) throw new Error('Original navigation ring queue overflow');
        queue[tail]=index;tail=(tail+1)%capacity;queued++;
      }
    }
  }
  const label = dist[targetIndex];
  const base = { start, target, snapRadius: corrected.radius, snapAngleIndex: corrected.angle, targetLabel: label, pops };
  if (label === 0xffff) return { status: 'disconnected', start, target, path: [] };
  let current: Point = target;
  const path: Point[] = [];
  while (current[0] !== start[0] || current[1] !== start[1]) {
    const [x,y] = current;
    let best = 0xffff, chosen: Point | undefined;
    for (const [dx,dy] of BACK) {
      const nx=x+dx,ny=y+dy;
      if (nx < 0 || ny < 0 || nx >= mask.width || ny >= mask.height) continue;
      const value=dist[ny*mask.width+nx];
      if (value < best) { best=value; chosen=[nx,ny]; }
    }
    if (!chosen || best >= dist[y*mask.width+x]) throw new Error('Navigation backtrace cannot descend');
    current=chosen;path.push(current);
    if (path.length > total) throw new Error('Navigation backtrace loop');
  }
  const packed = new Uint8Array(path.length * 8), data = new DataView(packed.buffer);
  path.forEach(([x,y],i)=>{data.setInt32(i*8,x,true);data.setInt32(i*8+4,y,true);});
  return { status:'route', ...base, path, length:path.length, pathSha256:sha256(packed) };
}

export function nextMovement(position: Point, remaining: number, path: Point[], dt: number, scale: number, direction: number): { position: Point; remaining: number; step: number } {
  const factor = direction % 2 ? f32(0.7) : 1;
  const step = Math.max(1, Math.floor(dt * 0.25 * f32(scale) * factor + 0.5));
  remaining -= step;
  // Original terminal branch clears route without assigning the goal/path[0].
  return { position: remaining <= 0 ? position : path[remaining], remaining: Math.max(0, remaining), step };
}

export function updateScroll(current: number, heroX: number, sceneWidth = 1736, viewportWidth = 800): number {
  let scroll=current;
  if (heroX - scroll < 200) scroll = heroX - 200;
  else if (heroX - scroll > 600) scroll = heroX - 600;
  return Math.max(0,Math.min(sceneWidth-viewportWidth,scroll));
}
