import { describe, expect, it } from 'vitest';
import type { MultFile } from '../src/mult/decoder';
import { COMBINE, InventoryView } from '../src/scene/inventory-view';

const emptyMult: MultFile = {
  frameCount: 0,
  paletteField: 0,
  paletteBGRA: new Uint8Array(),
  frames: [],
  resolve: () => { throw new Error('empty MULT has no records'); },
};

function inventoryView(items: number[]) {
  const view = new InventoryView(emptyMult, emptyMult);
  view.setItems(items);
  return view;
}

function open(view: InventoryView, inventory: number[], selectedItem = 0) {
  expect(view.pointerDown(740, 580, inventory, selectedItem)).toEqual({ handled: true });
  expect(view.open).toBe(true);
}

function selectSlot(view: InventoryView, inventory: number[], ordinal: number) {
  return view.pointerDown(517 + ordinal * 60, 68, inventory);
}

describe('InventoryView native two-phase item selection', () => {
  it.each([[690, 566], [740, 580], [790, 594]])('occludes scene hover and clicks on the inventory tab at (%i, %i)', (x, y) => {
    const view = inventoryView([]);

    expect(view.capturesPointer(x, y)).toBe(true);
    expect(view.open).toBe(false);
    expect(view.pointerDown(x, y, [])).toEqual({ handled: true });
    expect(view.open).toBe(true);
  });

  it.each([[689, 580], [791, 580], [740, 565], [740, 595]])('leaves scene hover and clicks available outside the closed tab at (%i, %i)', (x, y) => {
    const view = inventoryView([]);

    expect(view.capturesPointer(x, y)).toBe(false);
    expect(view.pointerDown(x, y, [])).toEqual({ handled: false });
    expect(view.open).toBe(false);
  });

  it('occludes the scene everywhere while open, including the click that closes the panel', () => {
    const view = inventoryView([]);
    open(view, []);

    expect(view.capturesPointer(100, 300)).toBe(true);
    expect(view.capturesPointer(600, 300)).toBe(true);
    expect(view.pointerDown(100, 300, [])).toEqual({ handled: true, selectedItem: 0 });
    expect(view.capturesPointer(100, 300)).toBe(false);
    expect(view.capturesPointer(740, 580)).toBe(true);
  });

  it('keeps the panel open after first selection and leaves the inventory unchanged', () => {
    const inventory = [5, 2];
    const view = inventoryView(inventory);
    open(view, inventory);

    expect(selectSlot(view, inventory, 0)).toEqual({ handled: true });

    expect(view.pendingSelection).toBe(5);
    expect(view.open).toBe(true);
    expect(inventory).toEqual([5, 2]);
  });

  it('combines 5 + 2 into 39 and consumes both ingredients in the canonical inventory', () => {
    const inventory = [5, 2];
    const view = inventoryView(inventory);
    open(view, inventory);
    selectSlot(view, inventory, 0);
    selectSlot(view, inventory, 1);

    expect(view.open).toBe(true);
    expect(view.pendingSelection).toBe(0);
    expect(inventory).toEqual([39]);
  });

  it('combines 2 + 5 into 39 using the separately recorded reverse entry', () => {
    const inventory = [2, 5];
    const view = inventoryView(inventory);
    open(view, inventory);
    selectSlot(view, inventory, 0);
    selectSlot(view, inventory, 1);

    expect(view.pendingSelection).toBe(0);
    expect(inventory).toEqual([39]);
  });

  it('leaves pending selection and inventory untouched when no recipe exists', () => {
    const inventory = [5, 1];
    const view = inventoryView(inventory);
    open(view, inventory);
    selectSlot(view, inventory, 0);
    selectSlot(view, inventory, 1);

    expect(view.open).toBe(true);
    expect(view.pendingSelection).toBe(5);
    expect(inventory).toEqual([5, 1]);
  });

  it('does not combine an item with itself and preserves the pending choice', () => {
    const inventory = [45, 45];
    const view = inventoryView(inventory);
    open(view, inventory);
    selectSlot(view, inventory, 0);
    selectSlot(view, inventory, 1);

    expect(view.pendingSelection).toBe(45);
    expect(inventory).toEqual([45, 45]);
  });

  it('uses Remtol semantics for duplicates and adds a single result', () => {
    const inventory = [5, 5, 2, 2, 8];
    const view = inventoryView(inventory);
    open(view, inventory);
    selectSlot(view, inventory, 0);
    selectSlot(view, inventory, 2);

    expect(inventory).toEqual([8, 39]);
  });

  it('refuses a result if the pending ingredient was removed meanwhile', () => {
    const inventory = [5, 2];
    const view = inventoryView(inventory);
    open(view, inventory);
    selectSlot(view, inventory, 0);
    inventory.splice(0, 1);
    selectSlot(view, inventory, 0);

    expect(inventory).toEqual([2]);
    expect(view.pendingSelection).toBe(5);
  });

  it('does not reissue a combined item after its ingredients have been consumed', () => {
    const inventory = [5, 2];
    const view = inventoryView(inventory);
    open(view, inventory);
    selectSlot(view, inventory, 0);
    selectSlot(view, inventory, 1);
    expect(inventory).toEqual([39]);

    view.pointerDown(780, 16, inventory);
    open(view, inventory);
    selectSlot(view, inventory, 0);
    expect(selectSlot(view, inventory, 0)).toEqual({ handled: true });
    expect(inventory).toEqual([39]);
    expect(view.pendingSelection).toBe(39);
  });

  it('commits pending selection to the scene only when the panel closes', () => {
    const inventory = [39];
    const view = inventoryView(inventory);
    open(view, inventory);
    selectSlot(view, inventory, 0);

    expect(view.pointerDown(780, 16, inventory)).toEqual({ handled: true, selectedItem: 39 });
    expect(view.open).toBe(false);
    expect(view.pendingSelection).toBe(0);
    expect(inventory).toEqual([39]);
  });

  it('closes from an outside click and commits the pending item', () => {
    const inventory = [39];
    const view = inventoryView(inventory);
    open(view, inventory);
    selectSlot(view, inventory, 0);

    expect(view.pointerDown(100, 300, inventory)).toEqual({ handled: true, selectedItem: 39 });
    expect(view.open).toBe(false);
  });

  it('cancels an existing scene selection on the closed inventory tab instead of opening', () => {
    const inventory = [39];
    const view = inventoryView(inventory);

    expect(view.pointerDown(740, 580, inventory, 39)).toEqual({ handled: true, cancelSceneSelection: true });
    expect(view.open).toBe(false);
  });

  it('allows selecting the resulting item again and passes it to scene selection', () => {
    const inventory = [39];
    const view = inventoryView(inventory);
    open(view, inventory);
    selectSlot(view, inventory, 0);
    const action = view.pointerDown(780, 16, inventory);
    let sceneSelectedItem = action.selectedItem ?? 0;

    expect(sceneSelectedItem).toBe(39);
    const cancel = view.pointerDown(740, 580, inventory, sceneSelectedItem);
    if (cancel.cancelSceneSelection) sceneSelectedItem = 0;
    expect(sceneSelectedItem).toBe(0);
  });

  it('contains exactly the 12 directional entries recovered from the EXE', () => {
    expect(COMBINE).toEqual([
      [5002, 39], [2005, 39], [9010, 40], [10009, 40], [33034, 49], [34033, 49],
      [49031, 50], [31049, 50], [49032, 51], [32049, 51], [45042, 46], [42045, 46],
    ]);
    expect(Object.isFrozen(COMBINE)).toBe(true);
    expect(COMBINE.every((entry) => Object.isFrozen(entry))).toBe(true);
  });

  it.each([
    [5, 2, 39], [2, 5, 39],
    [9, 10, 40], [10, 9, 40],
    [33, 34, 49], [34, 33, 49],
    [49, 31, 50], [31, 49, 50],
    [49, 32, 51], [32, 49, 51],
    [45, 42, 46], [42, 45, 46],
  ])('executes original combination %i + %i -> %i through inventory clicks', (first, second, result) => {
    const inventory = [first, second];
    const view = inventoryView(inventory);
    open(view, inventory);
    selectSlot(view, inventory, 0);
    selectSlot(view, inventory, 1);

    expect(inventory).toEqual([result]);
    expect(view.pendingSelection).toBe(0);
    expect(view.open).toBe(true);
  });
});
