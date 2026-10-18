/**
 * Inventory toolbar geometry recovered from 0x40ed08 (slot hit test) and
 * 0x40ed88 (draw): x 487..727, y 18..518, four columns of 60x100 slots.
 * The panel itself is the original 340x600 `XSH\Interface\Frame.MULT`.
 */
export const INVENTORY_LAYOUT = {
  panelX: 460,
  panelWidth: 340,
  panelHeight: 600,
  slotX: 487,
  slotY: 18,
  slotWidth: 60,
  slotHeight: 100,
  columns: 4,
  rows: 5,
} as const;

export function inventorySlotOrdinal(x: number, y: number): number | undefined {
  const { slotX, slotY, slotWidth, slotHeight, columns, rows } = INVENTORY_LAYOUT;
  if (!(x > slotX && x < slotX + columns * slotWidth && y > slotY && y < slotY + rows * slotHeight)) return undefined;
  return Math.floor((y - slotY) / slotHeight) * columns + Math.floor((x - slotX) / slotWidth);
}

/**
 * 0x40ed08 packs non-empty slots in drawing order and counts them while scanning
 * the fixed 100-slot array. The browser inventory keeps a packed array, but the
 * same empty-sentinel filter is applied so a future sparse model stays correct.
 */
export function itemAtInventoryPosition(items: readonly number[], x: number, y: number): number {
  const ordinal = inventorySlotOrdinal(x, y);
  if (ordinal === undefined) return -1;
  const visible = items.filter((id) => id >= 0);
  return visible[ordinal] ?? -1;
}

export function inventorySlotOrigin(ordinal: number): [number, number] {
  const { slotX, slotY, slotWidth, slotHeight, columns } = INVENTORY_LAYOUT;
  return [slotX + (ordinal % columns) * slotWidth, slotY + Math.floor(ordinal / columns) * slotHeight];
}
