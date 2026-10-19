import { SaveCodec, type GameSaveV1, type Result } from './save-codec';
import { SaveRepository, type RepositoryError, type SaveSlotInfo } from './save-repository';

export type SaveLoadMode = 'save' | 'load';
type SaveResult = Result<GameSaveV1>;
type RestoreResult = Result<void>;

/** Compact DOM UI; all world capture/restore remains owned by SceneSession. */
export class SaveLoadView {
  readonly root = document.createElement('section');
  private mode: SaveLoadMode = 'save';
  private slots: SaveSlotInfo[] = [];
  private selected?: SaveSlotInfo;
  private busy = false;
  private pendingFileSave?: GameSaveV1;
  private status = '';
  private statusError = false;
  private toastTimer?: number;
  private readonly titleInput = document.createElement('input');
  private readonly fileInput = document.createElement('input');

  constructor(private readonly options: {
    repository: SaveRepository;
    validation?: { contentId?: string; sceneIds?: readonly number[] };
    canSave: () => { ok: true } | { ok: false; reason: string };
    exportSave: (label: string) => SaveResult;
    importSave: (save: GameSaveV1) => Promise<RestoreResult>;
  }) {
    this.root.className = 'save-load-overlay';
    this.root.hidden = true;
    this.titleInput.maxLength = 80;
    this.titleInput.value = 'Сохранение';
    this.titleInput.setAttribute('aria-label', 'Название сохранения');
    this.fileInput.type = 'file'; this.fileInput.accept = '.json,application/json'; this.fileInput.hidden = true;
    this.fileInput.onchange = () => { const file = this.fileInput.files?.[0]; if (file) void this.readFile(file); this.fileInput.value = ''; };
    this.root.append(this.fileInput);
    window.addEventListener('storage', this.onStorage);
  }

  async open(mode: SaveLoadMode): Promise<void> {
    if (this.busy) return;
    this.mode = mode; this.selected = undefined; this.pendingFileSave = undefined; this.status = '';
    this.root.hidden = false; await this.refresh();
  }

  close(): void {
    if (this.busy) return;
    this.root.hidden = true; this.selected = undefined; this.pendingFileSave = undefined; this.render();
  }

  get isOpen(): boolean { return !this.root.hidden; }
  destroy(): void { window.removeEventListener('storage', this.onStorage); this.root.remove(); }

  private onStorage = (event: StorageEvent) => {
    if (event.key === null || /^agent-revers\.save\.v1\.slot\.[0-5]$/.test(event.key)) void this.refresh();
  };

  private async refresh(): Promise<void> {
    this.slots = await this.options.repository.list();
    // Keep the selection's original compare token; a cross-tab update must cause conflict.
    this.render();
  }

  private render(): void {
    if (this.root.hidden) return;
    const dialog = document.createElement('div'); dialog.className = 'save-load-dialog'; dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    const header = document.createElement('header');
    const heading = document.createElement('h2'); heading.textContent = this.mode === 'save' ? 'Сохранить игру' : 'Загрузить игру';
    const close = this.button('×', () => this.close()); close.className = 'sl-close'; close.setAttribute('aria-label', 'Закрыть');
    header.append(heading, close); dialog.append(header);
    const modebar = document.createElement('nav'); modebar.className = 'sl-modebar';
    modebar.append(this.button('Сохранить · F2', () => void this.open('save')), this.button('Загрузить · F3', () => void this.open('load'))); dialog.append(modebar);
    if (this.mode === 'save') {
      const eligible = this.options.canSave();
      const row = document.createElement('div'); row.className = 'sl-save-row';
      this.titleInput.disabled = this.busy; row.append(this.titleInput);
      row.append(this.button('Сохранить в выбранный слот', () => void this.saveSelected(), !eligible.ok || !this.selected || this.busy));
      if (!eligible.ok) this.note(this.mode === 'save' ? eligible.reason : '', true, row);
      dialog.append(row);
    }
    const list = document.createElement('div'); list.className = 'sl-slots';
    for (const info of this.slots) list.append(this.slotRow(info));
    dialog.append(list);
    const actions = document.createElement('div'); actions.className = 'sl-actions';
    actions.append(this.button('Экспортировать текущее состояние', () => this.exportCurrent(), !this.options.canSave().ok || this.busy));
    actions.append(this.button('Импортировать JSON…', () => this.fileInput.click(), this.busy));
    dialog.append(actions);
    if (this.pendingFileSave) {
      const preview = document.createElement('div'); preview.className = 'sl-file-preview';
      const save = this.pendingFileSave;
      const text = document.createElement('span'); text.textContent = `Файл: «${save.label}» · Level${save.world.activeLevel} · ${new Date(save.createdAt).toLocaleString()}`;
      preview.append(text, this.button('Загрузить этот файл', () => void this.loadSave(save), this.busy), this.button('Отмена', () => { this.pendingFileSave = undefined; this.render(); }, this.busy));
      dialog.append(preview);
    }
    if (this.status) this.note(this.status, this.statusError, dialog);
    this.root.replaceChildren(dialog, this.fileInput);
  }

  private slotRow(info: SaveSlotInfo): HTMLElement {
    const row = document.createElement('article'); row.className = `sl-slot ${this.selected?.slot === info.slot ? 'selected' : ''} ${info.status}`;
    const summary = document.createElement('div'); summary.className = 'sl-slot-info';
    const name = document.createElement('strong'); name.textContent = `Слот ${info.slot + 1} · ${info.status === 'empty' ? 'Пустой' : info.status === 'valid' ? (info.label || 'Без названия') : info.status === 'incompatible' ? 'Несовместимое сохранение' : info.status === 'unavailable' ? 'Хранилище недоступно' : 'Повреждённое сохранение'}`;
    const meta = document.createElement('small');
    meta.textContent = info.status === 'valid' ? `${info.createdAt ? new Date(info.createdAt).toLocaleString() : ''} · Level${info.level}` : info.reason ?? '';
    summary.append(name, meta); row.append(summary);
    if (info.status === 'empty') {
      row.append(this.button(this.mode === 'save' ? 'Выбрать' : 'Пусто', () => { if (this.mode === 'save') { this.selected = info; this.status = ''; this.render(); this.titleInput.focus(); } }, this.mode === 'load' || this.busy));
    } else if (info.status === 'valid') {
      if (this.mode === 'save') row.append(this.button('Выбрать', () => { this.selected = info; this.status = ''; this.render(); this.titleInput.focus(); }, this.busy));
      else row.append(this.button('Загрузить', () => void this.loadSlot(info), this.busy));
      row.append(this.button('Экспорт JSON', () => void this.exportSlot(info), this.busy));
    } else if (this.mode === 'load') row.append(this.button('Недоступно', () => {}, true));
    return row;
  }

  private async saveSelected(): Promise<void> {
    if (!this.selected || this.busy) return;
    const eligibility = this.options.canSave();
    if (!eligibility.ok) { this.setStatus(this.reason(eligibility.reason), true); return; }
    const slot = this.selected;
    if (slot.status !== 'empty' && !window.confirm(`Перезаписать «${slot.label ?? `слот ${slot.slot + 1}`}»?`)) return;
    // Re-check at commit, immediately before snapshot capture.
    const again = this.options.canSave();
    if (!again.ok) { this.setStatus(this.reason(again.reason), true); return; }
    const save = this.options.exportSave(this.titleInput.value.trim() || 'Сохранение');
    if (!save.ok) { this.setStatus(this.reason(save.error.message), true); return; }
    this.busy = true; this.render();
    const written = await this.options.repository.write(slot.slot, save.value, slot.version);
    this.busy = false;
    if (!written.ok) this.setStatus(this.repoMessage(written.error), true);
    else { this.setStatus('Игра сохранена', false); this.selected = undefined; }
    await this.refresh();
  }

  private async loadSlot(info: SaveSlotInfo): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.render();
    const result = await this.options.repository.read(info.slot);
    this.busy = false;
    if (!result.ok) { this.setStatus(this.repoMessage(result.error), true); await this.refresh(); return; }
    await this.loadSave(result.value);
  }

  private async loadSave(save: GameSaveV1): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.render();
    const result = await this.options.importSave(save);
    this.busy = false;
    if (!result.ok) {
      const message = result.error.code === 'IncompatibleSave' ? 'Сохранение несовместимо с текущей версией игры'
        : result.error.code === 'InvalidSave' ? 'Не удалось прочитать сохранение'
          : 'Не удалось загрузить сохранение';
      this.setStatus(message, true); this.render(); return;
    }
    this.status = 'Игра загружена'; this.statusError = false;
    this.pendingFileSave = undefined; this.selected = undefined; this.root.hidden = true; this.render(); this.toast('Игра загружена');
  }

  private async readFile(file: File): Promise<void> {
    const max = 2 * 1024 * 1024 + 1024;
    if (file.size > max) { this.setStatus('Файл сохранения слишком большой', true); return; }
    try {
      const raw = await file.text();
      const decoded = SaveCodec.decode(raw, this.options.validation);
      if (!decoded.ok) { console.warn('Save file rejected', decoded.error); this.setStatus(decoded.error.code === 'IncompatibleSave' ? 'Сохранение несовместимо с текущей версией игры' : 'Не удалось прочитать сохранение', true); return; }
      this.pendingFileSave = decoded.value; this.status = ''; this.render();
    } catch (cause) { console.error('Could not read save file', cause); this.setStatus('Не удалось прочитать сохранение', true); }
  }

  private exportCurrent(): void {
    const result = this.options.exportSave('Текущее состояние');
    if (!result.ok) { this.setStatus(this.reason(result.error.message), true); return; }
    this.download(result.value);
  }
  private async exportSlot(info: SaveSlotInfo): Promise<void> {
    const result = await this.options.repository.read(info.slot);
    if (!result.ok) { this.setStatus(this.repoMessage(result.error), true); return; }
    this.download(result.value);
  }
  private download(save: GameSaveV1): void {
    const encoded = SaveCodec.encode(save);
    if (!encoded.ok) { this.setStatus('Не удалось подготовить файл сохранения', true); return; }
    const blob = new Blob([encoded.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `agent-save-level${save.world.activeLevel}-${save.createdAt.slice(0, 10)}.json`;
    anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); this.setStatus('Сохранение экспортировано', false);
  }
  private setStatus(message: string, error: boolean): void { this.status = message; this.statusError = error; this.render(); }
  private toast(message: string): void {
    let element = document.querySelector<HTMLElement>('.save-load-toast');
    if (!element) { element = document.createElement('div'); element.className = 'save-load-toast'; document.body.append(element); }
    element.textContent = message; element.hidden = false;
    if (this.toastTimer !== undefined) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { if (element) element.hidden = true; }, 3000);
  }
  private note(text: string, error: boolean, parent: HTMLElement): void { const element = document.createElement('p'); element.className = error ? 'sl-error' : 'sl-message'; element.textContent = text; parent.append(element); }
  private button(text: string, action: () => void, disabled = false): HTMLButtonElement { const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.disabled = disabled || this.busy; button.onclick = action; return button; }
  private reason(text: string): string {
    if (/moving/i.test(text)) return 'Сохранение недоступно во время движения';
    if (/transition|resource load|pending/i.test(text)) return 'Дождитесь загрузки локации';
    if (/animation|program|media|blocked|tick|selection|busy|restore/i.test(text)) return 'Дождитесь завершения действия';
    return text;
  }
  private repoMessage(error: RepositoryError): string {
    if (error.code === 'Conflict') return 'Этот слот был изменён в другой вкладке';
    if (error.code === 'IncompatibleSave') return 'Сохранение несовместимо с текущей версией игры';
    if (error.code === 'StorageUnavailable' || error.code === 'StorageWriteFailed') return 'Не удалось записать сохранение';
    return 'Не удалось прочитать сохранение';
  }
}
