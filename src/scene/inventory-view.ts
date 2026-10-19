import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { MultFile } from '../mult/decoder';
import { resolvedTexture } from './textures';
import { INVENTORY_LAYOUT, inventorySlotOrigin, itemAtInventoryPosition } from './inventory-layout';

const TAB = { x: 690, y: 566, width: 100, height: 28 };
const CLOSE = { x: 770, y: 6, width: 24, height: 24 };

/** Native 0x40eacc table. Keys are directional: first * 1000 + second. */
export const COMBINE: readonly (readonly [number, number])[] = Object.freeze([
  [5002, 39], [2005, 39],
  [9010, 40], [10009, 40],
  [33034, 49], [34033, 49],
  [49031, 50], [31049, 50],
  [49032, 51], [32049, 51],
  [45042, 46], [42045, 46],
].map(([key, result]) => Object.freeze([key, result] as const)));

export type InventoryPointerResult = {
  handled: boolean;
  /** Item to commit to SceneView.selectedItem when the panel closes. */
  selectedItem?: number;
  /** The inventory tab cancels an existing scene selection instead of opening. */
  cancelSceneSelection?: boolean;
};

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
  pendingSelection = 0;
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

  /** Clears the inventory's pending choice without committing a scene selection. */
  resetSelection(): void {
    this.pendingSelection = 0;
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
      if (id === this.pendingSelection) {
        // Minimal browser adaptation: the EXE highlight treatment is not established.
        const outline = new Graphics().rect(x + 2, y + 2, INVENTORY_LAYOUT.slotWidth - 4, INVENTORY_LAYOUT.slotHeight - 4)
          .stroke({ color: 0xffd35a, width: 2 });
        this.icons.addChild(outline);
      }
    });
  }

  private setOpen(open: boolean): void {
    this.open = open;
    this.panel.visible = open;
    this.tab.visible = !open;
  }

  private closePanel(): number {
    this.setOpen(false);
    const selectedItem = this.pendingSelection;
    this.pendingSelection = 0;
    this.drawIcons();
    return selectedItem;
  }

  /** Raw logical screen click; mutates the existing SceneLoader inventory array. */
  pointerDown(x: number, y: number, inventory: number[], sceneSelectedItem = 0): InventoryPointerResult {
    if (!this.open) {
      const insideTab = x >= TAB.x && x <= TAB.x + TAB.width && y >= TAB.y && y <= TAB.y + TAB.height;
      if (!insideTab) return { handled: false };
      if (sceneSelectedItem > 0) return { handled: true, cancelSceneSelection: true };
      this.setOpen(true);
      this.pendingSelection = 0;
      this.drawIcons();
      return { handled: true };
    }
    const insideClose = x >= CLOSE.x && x <= CLOSE.x + CLOSE.width && y >= CLOSE.y && y <= CLOSE.y + CLOSE.height;
    if (insideClose) return { handled: true, selectedItem: this.closePanel() };
    const id = itemAtInventoryPosition(inventory, x, y);
    if (id > 0) {
      if (this.pendingSelection < 1) {
        this.pendingSelection = id;
        this.drawIcons();
      } else {
        const first = this.pendingSelection;
        const result = COMBINE.find(([key]) => key === id * 1000 + first)?.[1] ?? 0;
        // A miss is a native no-op: keep the original pending selection.
        // Confirm both ingredients exist before changing the canonical inventory.
        if (result > 0 && inventory.includes(id) && inventory.includes(first)) {
          for (let i = inventory.length - 1; i >= 0; i--) {
            if (inventory[i] === id || inventory[i] === first) inventory.splice(i, 1);
          }
          inventory.push(result);
          this.pendingSelection = 0;
          this.setItems(inventory);
        }
      }
      return { handled: true };
    }
    // A click outside the panel closes it; clicks over the panel do not reach the scene.
    if (x < INVENTORY_LAYOUT.panelX || x > INVENTORY_LAYOUT.panelX + INVENTORY_LAYOUT.panelWidth) {
      return { handled: true, selectedItem: this.closePanel() };
    }
    return { handled: true };
  }
}
