import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { MultFile } from '../mult/decoder';
import { resolvedTexture } from './textures';
import { INVENTORY_LAYOUT, inventorySlotOrigin, itemAtInventoryPosition } from './inventory-layout';

const TAB = { x: 690, y: 566, width: 100, height: 28 };
const CLOSE = { x: 770, y: 6, width: 24, height: 24 };

/**
 * Normal inventory UI built from the original interface resources: 340x600
 * `Frame.MULT` panel and `large.MULT` item icons in the recovered 4x5 grid.
 * It is a real clickable overlay, not a debug control. Opening/closing is a
 * browser-prototype affordance; the original UI-mode transition is not fully
 * reconstructed. The item->slot mapping and select/consume semantics are.
 */
export class InventoryView {
  readonly root = new Container();
  private readonly panel = new Container();
  private readonly icons = new Container();
  private readonly tab = new Container();
  private items: number[] = [];
  private selected = 0;
  open = false;

  constructor(
    private readonly frame: MultFile,
    private readonly iconFile: MultFile,
  ) {
    this.panel.visible = false;
    const frameRecord = this.frame.frames[0]?.[0];
    if (frameRecord) {
      const resolved = this.frame.resolve(frameRecord.slot, frameRecord.child);
      const sprite = new Sprite(resolvedTexture(this.frame, 1, frameRecord, resolved));
      sprite.position.set(INVENTORY_LAYOUT.panelX, 0);
      this.panel.addChild(sprite);
    }
    this.panel.addChild(this.icons);
    this.panel.addChild(this.closeButton());
    this.root.addChild(this.panel);
    this.root.addChild(this.tab);
    this.drawTab();
  }

  private closeButton(): Container {
    const button = new Container();
    const box = new Graphics().roundRect(CLOSE.x, CLOSE.y, CLOSE.width, CLOSE.height, 4).fill({ color: 0x2b2b2b, alpha: 0.9 });
    const label = new Text({ text: '×', style: { fontFamily: 'Arial', fontSize: 18, fill: 0xdddddd } });
    label.position.set(CLOSE.x + 7, CLOSE.y + 1);
    button.addChild(box, label);
    return button;
  }

  private drawTab(): void {
    this.tab.removeChildren().forEach((child) => child.destroy());
    const box = new Graphics().roundRect(TAB.x, TAB.y, TAB.width, TAB.height, 6).fill({ color: 0x1b1b1b, alpha: 0.88 }).stroke({ color: 0x9a9a9a, width: 1 });
    const label = new Text({ text: 'ИНВЕНТАРЬ', style: { fontFamily: 'Arial', fontSize: 12, fill: 0xd8d8d8 } });
    label.position.set(TAB.x + 12, TAB.y + 7);
    this.tab.addChild(box, label);
  }

  setItems(items: readonly number[]): void {
    if (items.length === this.items.length && items.every((id, index) => id === this.items[index])) return;
    this.items = [...items];
    this.drawIcons();
  }

  private drawIcons(): void {
    this.icons.removeChildren().forEach((child) => child.destroy());
    this.items.filter((id) => id >= 0).forEach((id, ordinal) => {
      const record = this.iconFile.frames[id - 1]?.[0];
      if (!record) return;
      const resolved = this.iconFile.resolve(record.slot, record.child);
      if (!resolved.width || !resolved.height) return;
      const sprite = new Sprite(resolvedTexture(this.iconFile, id, record, resolved));
      const [x, y] = inventorySlotOrigin(ordinal);
      sprite.position.set(x + resolved.source.x, y + resolved.source.y);
      this.icons.addChild(sprite);
    });
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.panel.visible = open;
    this.tab.visible = !open;
  }

  /**
   * Raw logical screen click. Returns true when the inventory consumed it; a
   * selected slot closes the panel and is returned by `consumeSelection`.
   */
  pointerDown(x: number, y: number): boolean {
    if (!this.open) {
      const insideTab = x >= TAB.x && x <= TAB.x + TAB.width && y >= TAB.y && y <= TAB.y + TAB.height;
      if (!insideTab) return false;
      this.setOpen(true);
      return true;
    }
    const insideClose = x >= CLOSE.x && x <= CLOSE.x + CLOSE.width && y >= CLOSE.y && y <= CLOSE.y + CLOSE.height;
    if (insideClose) { this.setOpen(false); return true; }
    const id = itemAtInventoryPosition(this.items, x, y);
    if (id > 0) {
      this.selected = id;
      this.setOpen(false);
      return true;
    }
    // A click outside the panel closes it; clicks over the panel do not reach the scene.
    if (x < INVENTORY_LAYOUT.panelX || x > INVENTORY_LAYOUT.panelX + INVENTORY_LAYOUT.panelWidth) this.setOpen(false);
    return true;
  }

  consumeSelection(): number {
    const selected = this.selected;
    this.selected = 0;
    return selected;
  }
}
