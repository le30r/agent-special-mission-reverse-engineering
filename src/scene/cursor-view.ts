import { Container, Sprite, Texture } from 'pixi.js';
import { decodeMult, type MultFile, type MultObject } from '../mult/decoder';
import { resolvedTexture, releaseMultTextures } from './textures';

const CURSOR_FILES = ['arrown', 'arrow0n', 'arrow1n', 'arrow2n', 'arrow3n', 'lookn', 'taken', 'talk'] as const;

async function loadMult(url: string): Promise<MultFile> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Не удалось загрузить ${url} (${response.status})`);
  return decodeMult(await response.arrayBuffer());
}

/** Original animated action cursor rendered in logical screen coordinates. */
export class CursorView {
  readonly root = new Container();
  private readonly sprite = new Sprite(Texture.EMPTY);
  private files: MultFile[] = [];
  private small?: MultFile;
  private currentId = -1;
  private currentItem = 0;
  private currentFrame = -1;
  private elapsed = 0;
  private pointerInside = false;
  private disposed = false;

  constructor() {
    this.root.eventMode = 'none';
    this.sprite.eventMode = 'none';
    this.sprite.anchor.set(0.5);
    this.root.visible = false;
    this.root.addChild(this.sprite);
  }

  async load(resources: string): Promise<void> {
    let loaded: MultFile[] = [];
    try {
      loaded = await Promise.all(CURSOR_FILES.map((name) => loadMult(`${resources}/block0/XSH/Interface/${name}.MULT`)));
      const small = await loadMult(`${resources}/block0/XSH/Interface/small.MULT`);
      if (this.disposed) {
        loaded.forEach(releaseMultTextures);
        releaseMultTextures(small);
        return;
      }
      this.files = loaded;
      this.small = small;
      this.setFrame(0, 1);
    } catch (error) {
      loaded.forEach(releaseMultTextures);
      if (!this.disposed) console.warn('Оригинальные курсоры недоступны', error);
    }
  }

  setPointerInside(inside: boolean): void {
    this.pointerInside = inside;
  }

  update(
    view: { cursorIdAt(x: number, y: number): number; selectedItem: number } | undefined,
    x: number,
    y: number,
    deltaMs: number,
    enabled: boolean,
  ): void {
    const visible = Boolean(view && this.files.length && this.pointerInside && enabled);
    this.root.visible = visible;
    if (!visible || !view) return;
    this.root.position.set(x, y);

    const item = view.selectedItem;
    const id = item ? 8 : view.cursorIdAt(x, y);
    if (id !== this.currentId || item !== this.currentItem) {
      this.currentId = id;
      this.currentItem = item;
      this.elapsed = 0;
      this.setFrame(id, 1, item);
      return;
    }
    if (id === 8) return;
    this.elapsed += Math.max(0, deltaMs);
    const file = id === 8 ? this.small : this.files[id];
    if (!file) return;
    const period = 50; // Cursor.scc uses Animc 20.
    while (this.elapsed >= period) {
      this.elapsed -= period;
      this.currentFrame = (this.currentFrame % file.frameCount) + 1;
      this.applyFrame(file, this.currentFrame);
    }
  }

  private setFrame(id: number, frame: number, item = 0): void {
    const file = id === 8 ? this.small : this.files[id];
    if (!file) return;
    const selectedFrame = id === 8 ? Math.max(1, Math.min(file.frameCount, item)) : frame;
    this.currentFrame = selectedFrame;
    this.applyFrame(file, selectedFrame);
  }

  private applyFrame(file: MultFile, frame: number): void {
    const record: MultObject | undefined = file.frames[frame - 1]?.[0];
    if (!record) { this.sprite.texture = Texture.EMPTY; return; }
    this.sprite.texture = resolvedTexture(file, frame, record, file.resolve(record.slot, record.child));
    // Native MULT cursor records use the pointer as the image's top-left origin.
    this.sprite.position.set(0, 0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.destroy({ children: true, texture: false, textureSource: false });
    this.files.forEach(releaseMultTextures);
    if (this.small) releaseMultTextures(this.small);
    this.files = [];
    this.small = undefined;
  }
}
