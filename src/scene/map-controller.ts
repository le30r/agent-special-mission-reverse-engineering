import { Container, Sprite, Texture } from 'pixi.js';
import { decodeMult, type MultFile } from '../mult/decoder';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../config';
import type { SavedMap } from './scene-loader';
import { releaseMultTextures, resolvedTexture } from './textures';

export type MapTarget = { scene: number; portal: number };
export type MapZone = { x: number; y: number; width: number; height: number };

/** Recovered EXE tables: strict screen-space rectangles, map.MULT frame and target per bank. */
export const MAP_ZONES: readonly MapZone[] = Object.freeze([
  { x: 208, y: 59, width: 100, height: 138 },
  { x: 417, y: 315, width: 130, height: 122 },
  { x: 424, y: 48, width: 242, height: 97 },
  { x: 269, y: 153, width: 230, height: 143 },
  { x: 0, y: 157, width: 205, height: 177 },
  { x: 570, y: 216, width: 230, height: 167 },
  { x: 128, y: 384, width: 215, height: 216 },
]);

export const MAP_TARGETS: readonly (readonly MapTarget[])[] = Object.freeze([
  Object.freeze([47, 45, 39, 1, 41, 46, 44].map((scene) => ({ scene, portal: 0 }))),
  Object.freeze([16, 20, 5, 37, 10, 29, 18].map((scene) => ({ scene, portal: 0 }))),
]);

export function mapZoneAt(x: number, y: number, unlocked: readonly boolean[]): number {
  for (let zone = 0; zone < MAP_ZONES.length; zone++) {
    const rect = MAP_ZONES[zone]!;
    if (unlocked[zone] && x > rect.x && x < rect.x + rect.width && y > rect.y && y < rect.y + rect.height) return zone;
  }
  return -1;
}

export type MapAssets = { background: Texture; highlights: MultFile; cursor: MultFile };

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Не удалось загрузить ${url} (${response.status})`);
  return response.arrayBuffer();
}

async function loadMapBackground(url: string): Promise<Texture> {
  const image = new Image();
  image.src = url;
  await image.decode();
  if (image.naturalWidth !== VIEWPORT_WIDTH || image.naturalHeight !== VIEWPORT_HEIGHT) {
    throw new Error(`Размер оригинальной карты ${image.naturalWidth}×${image.naturalHeight}, ожидалось 800×600`);
  }
  return Texture.from(image);
}

export async function loadMapAssets(resources = '/resources'): Promise<MapAssets> {
  let background: Texture | undefined;
  let highlights: MultFile | undefined;
  let cursor: MultFile | undefined;
  const imagePromise = loadMapBackground('/generated/interface/map.png');
  try {
    const [image, mapBytes, cursorBytes] = await Promise.all([
      imagePromise,
      fetchBytes(`${resources}/block0/XSH/Interface/map.MULT`),
      fetchBytes(`${resources}/block0/XSH/Interface/arrown.MULT`),
    ]);
    background = image;
    highlights = decodeMult(mapBytes);
    cursor = decodeMult(cursorBytes);
    if (highlights.frameCount !== 7 || cursor.frameCount !== 12) throw new Error('Некорректное число кадров ресурсов карты');
    for (let zone = 0; zone < MAP_ZONES.length; zone++) {
      const imageRecord = highlights.frames[zone]?.[0];
      const rect = MAP_ZONES[zone]!;
      if (!imageRecord || imageRecord.a !== rect.width || imageRecord.b !== rect.height) throw new Error(`Размер кадра карты ${zone + 1} не совпадает с оригинальной геометрией`);
    }
    return { background, highlights, cursor };
  } catch (error) {
    (background ?? await imagePromise.catch(() => undefined))?.destroy(true);
    if (highlights) releaseMultTextures(highlights);
    if (cursor) releaseMultTextures(cursor);
    throw error;
  }
}

/** A map-only Pixi subtree. All loaded textures are released by dispose(). */
class MapRenderer {
  readonly root = new Container();
  private readonly mapSprite: Sprite;
  private readonly highlightSprites: Sprite[];
  private readonly cursorSprite: Sprite;
  private cursorFrame = 0;
  private cursorElapsed = 0;
  private disposed = false;

  constructor(private readonly assets: MapAssets) {
    this.mapSprite = new Sprite(assets.background);
    this.root.addChild(this.mapSprite);
    this.highlightSprites = MAP_ZONES.map((zone, index) => {
      const record = assets.highlights.frames[index]![0]!;
      const sprite = new Sprite(resolvedTexture(assets.highlights, index + 1, record, assets.highlights.resolve(record.slot, record.child)));
      sprite.position.set(zone.x, zone.y);
      sprite.visible = false;
      this.root.addChild(sprite);
      return sprite;
    });
    const cursor = assets.cursor.frames[0]![0]!;
    this.cursorSprite = new Sprite(resolvedTexture(assets.cursor, 1, cursor, assets.cursor.resolve(cursor.slot, cursor.child)));
    this.cursorSprite.eventMode = 'none';
    this.root.addChild(this.cursorSprite);
  }

  select(zone: number): void {
    this.highlightSprites.forEach((sprite, index) => { sprite.visible = index === zone; });
  }

  moveCursor(x: number, y: number): void { this.cursorSprite.position.set(x, y); }

  tick(deltaMs: number): void {
    this.cursorElapsed += deltaMs;
    while (this.cursorElapsed >= 100) {
      this.cursorElapsed -= 100;
      this.cursorFrame = (this.cursorFrame + 1) % this.assets.cursor.frameCount;
      const record = this.assets.cursor.frames[this.cursorFrame]![0]!;
      this.cursorSprite.texture = resolvedTexture(this.assets.cursor, this.cursorFrame + 1, record, this.assets.cursor.resolve(record.slot, record.child));
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.destroy({ children: true, texture: false, textureSource: false });
    this.assets.background.destroy(true);
    releaseMultTextures(this.assets.highlights);
    releaseMultTextures(this.assets.cursor);
  }
}

export type MapPhase = 'closed' | 'loading' | 'open' | 'leaving';
export type MapControllerOptions = {
  map: () => SavedMap;
  canOpen: () => boolean;
  request: (scene: number, portal: number) => void;
  reportError?: (message: string) => void;
  loadAssets?: () => Promise<MapAssets>;
  createRenderer?: (assets: MapAssets) => Pick<MapRenderer, 'root' | 'select' | 'moveCursor' | 'tick' | 'dispose'>;
};

/** Owns transient map UI only; persistent bank/unlock state remains in SceneLoader. */
export class MapController {
  phase: MapPhase = 'closed';
  selected = -1;
  lastError?: string;
  private renderer?: Pick<MapRenderer, 'root' | 'select' | 'moveCursor' | 'tick' | 'dispose'>;
  private token = 0;
  private pointer: [number, number] = [0, 0];

  constructor(private readonly layer: Container, private readonly options: MapControllerOptions) {}

  get isOpen(): boolean { return this.phase !== 'closed'; }
  get canOpenNow(): boolean { return this.phase === 'closed' && this.options.canOpen(); }

  toggle(): void {
    if (this.phase === 'closed') this.open();
    else if (this.phase === 'open' || this.phase === 'loading') this.close();
  }

  escape(): void { if (this.phase === 'open' || this.phase === 'loading') this.close(); }

  private open(): void {
    if (this.phase !== 'closed' || !this.options.canOpen()) return;
    this.lastError = undefined;
    const token = ++this.token;
    this.phase = 'loading';
    const load = this.options.loadAssets ?? (() => loadMapAssets());
    void load().then((assets) => {
      if (token !== this.token || this.phase !== 'loading') {
        assets.background.destroy(true);
        releaseMultTextures(assets.highlights);
        releaseMultTextures(assets.cursor);
        return;
      }
      try {
        this.renderer = (this.options.createRenderer ?? ((loaded) => new MapRenderer(loaded)))(assets);
        this.layer.addChild(this.renderer.root);
        this.phase = 'open';
        this.renderer.moveCursor(this.pointer[0], this.pointer[1]);
        this.updateSelection();
      } catch (error) {
        assets.background.destroy(true);
        releaseMultTextures(assets.highlights);
        releaseMultTextures(assets.cursor);
        throw error;
      }
    }).catch((error: unknown) => {
      if (token !== this.token) return;
      this.phase = 'closed';
      this.selected = -1;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.options.reportError?.(this.lastError);
    });
  }

  private close(): void {
    ++this.token;
    this.phase = 'closed';
    this.selected = -1;
    this.renderer?.dispose();
    this.renderer = undefined;
  }

  pointerMove(x: number, y: number): void {
    this.pointer = [x, y];
    if (this.phase !== 'open') return;
    this.renderer?.moveCursor(x, y);
    this.updateSelection();
  }

  private updateSelection(): void {
    if (this.phase !== 'open') return;
    const map = this.options.map();
    const bank = map.model === 'banked-v1' ? map.bank : 0;
    const unlocked = map.model === 'banked-v1' ? map.unlocked[bank] : [];
    this.selected = mapZoneAt(this.pointer[0], this.pointer[1], unlocked);
    this.renderer?.select(this.selected);
  }

  pointerDown(button: number): boolean {
    if (this.phase !== 'open') return this.isOpen;
    if (button !== 0 || this.selected < 0) return true;
    // Re-read the canonical state at commit time; hover is transient and never unlocks a zone.
    const map = this.options.map();
    const bank = map.model === 'banked-v1' ? map.bank : 0;
    const unlocked = map.model === 'banked-v1' ? map.unlocked[bank] : [];
    const zone = mapZoneAt(this.pointer[0], this.pointer[1], unlocked);
    if (zone < 0) { this.selected = -1; this.renderer?.select(-1); return true; }
    const target = MAP_TARGETS[bank]![zone]!;
    this.phase = 'leaving';
    this.options.request(target.scene, target.portal);
    this.close();
    return true;
  }

  tick(deltaMs: number): void { if (this.phase === 'open') this.renderer?.tick(deltaMs); }

  dispose(): void { this.close(); }
}
