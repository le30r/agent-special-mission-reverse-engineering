import { SaveCodec, type GameSaveV1, type Result } from './save-codec';

export const SAVE_SLOT_COUNT = 6;
export const saveSlotKey = (slot: number) => `agent-revers.save.v1.slot.${slot}`;

export type SaveSlotInfo = {
  slot: number;
  status: 'empty' | 'valid' | 'corrupt' | 'incompatible' | 'unavailable';
  label?: string;
  createdAt?: string;
  level?: number;
  reason?: string;
  version: string | null;
};
export type RepositoryError = { code: 'InvalidSave' | 'IncompatibleSave' | 'StorageUnavailable' | 'StorageWriteFailed' | 'Conflict'; message: string; cause?: unknown };

/** Six independent SaveCodec envelopes; there is deliberately no side index. */
export class SaveRepository {
  constructor(
    private readonly storage: Storage | undefined = getStorage(),
    private readonly validation: { contentId?: string; sceneIds?: readonly number[] } = {},
  ) {}

  async list(): Promise<SaveSlotInfo[]> {
    const slots: SaveSlotInfo[] = [];
    for (let slot = 0; slot < SAVE_SLOT_COUNT; slot++) {
      const raw = this.safeGet(slot);
      if (raw === null || !raw.ok || raw.value === null) {
        slots.push({ slot, status: raw === null || (raw.ok && raw.value === null) ? 'empty' : raw && !raw.ok && raw.error.code === 'StorageUnavailable' ? 'unavailable' : 'corrupt', version: null, ...(raw && !raw.ok ? { reason: raw.error.message } : {}) });
        continue;
      }
      const decoded = SaveCodec.decode(raw.value, this.validation);
      if (!decoded.ok) {
        console.warn(`Save slot ${slot} is unreadable`, decoded.error);
        slots.push({ slot, status: decoded.error.code === 'IncompatibleSave' ? 'incompatible' : 'corrupt', version: raw.value, reason: decoded.error.message });
      } else {
        slots.push({ slot, status: 'valid', version: raw.value, label: decoded.value.label, createdAt: decoded.value.createdAt, level: decoded.value.world.activeLevel });
      }
    }
    return slots;
  }

  async read(slot: number): Promise<Result<GameSaveV1, RepositoryError>> {
    if (!this.validSlot(slot)) return this.error('InvalidSave', 'Invalid save slot');
    const raw = this.safeGet(slot);
    if (!raw) return this.error('StorageUnavailable', 'Save storage is unavailable');
    if (!raw.ok) return raw;
    if (raw.value === null) return this.error('InvalidSave', 'Save slot is empty');
    const decoded = SaveCodec.decode(raw.value, this.validation);
    return decoded.ok ? decoded : { ok: false, error: { code: decoded.error.code === 'IncompatibleSave' ? 'IncompatibleSave' : 'InvalidSave', message: decoded.error.message, cause: decoded.error.cause } };
  }

  async write(slot: number, save: GameSaveV1, expectedVersion?: string | null): Promise<Result<void, RepositoryError>> {
    if (!this.validSlot(slot)) return this.error('InvalidSave', 'Invalid save slot');
    const checked = SaveCodec.validate(save, this.validation);
    if (!checked.ok) return { ok: false, error: { code: checked.error.code === 'IncompatibleSave' ? 'IncompatibleSave' : 'InvalidSave', message: checked.error.message, cause: checked.error.cause } };
    const before = this.safeGet(slot);
    if (!before) return this.error('StorageUnavailable', 'Save storage is unavailable');
    if (!before.ok) return before;
    if (expectedVersion !== undefined && before.value !== expectedVersion) return this.error('Conflict', 'This slot changed in another tab');
    const encoded = SaveCodec.encode(checked.value);
    if (!encoded.ok) return { ok: false, error: { code: 'InvalidSave', message: encoded.error.message, cause: encoded.error.cause } };
    try {
      if (!this.storage) return this.error('StorageUnavailable', 'Save storage is unavailable');
      // Recheck immediately before a single-item write. localStorage offers no true CAS.
      const current = this.storage.getItem(saveSlotKey(slot));
      if (expectedVersion !== undefined && current !== expectedVersion) return this.error('Conflict', 'This slot changed in another tab');
      this.storage.setItem(saveSlotKey(slot), encoded.value);
      return { ok: true, value: undefined };
    } catch (cause) {
      console.error(`Failed to write save slot ${slot}`, cause);
      return { ok: false, error: { code: 'StorageWriteFailed', message: 'Could not write save slot', cause } };
    }
  }

  private validSlot(slot: number): boolean { return Number.isInteger(slot) && slot >= 0 && slot < SAVE_SLOT_COUNT; }
  private error<T = never>(code: RepositoryError['code'], message: string): Result<T, RepositoryError> { return { ok: false, error: { code, message } }; }
  private safeGet(slot: number): Result<string | null, RepositoryError> | null {
    if (!this.storage) return null;
    try { return { ok: true, value: this.storage.getItem(saveSlotKey(slot)) }; }
    catch (cause) { console.error(`Failed to read save slot ${slot}`, cause); return { ok: false, error: { code: 'StorageUnavailable', message: 'Save storage is unavailable', cause } }; }
  }
}

function getStorage(): Storage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch (error) { console.warn('localStorage is unavailable', error); return undefined; }
}
