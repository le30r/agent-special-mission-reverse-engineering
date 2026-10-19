import type { SceneManifestEntry } from './scene-source';
import type { SceneSession } from './scene-session';
import type { InventoryView } from './inventory-view';

const ITEM_NAMES: Readonly<Record<number, string>> = {
  1: 'Бутылка', 2: 'Монтировка', 3: 'Наручники', 4: 'Пистолет', 5: 'Нож',
};

/** Debug-only controls backed directly by the engine's canonical state. */
export class DebugPanel {
  readonly root = document.createElement('aside');
  private readonly itemSelect = document.createElement('select');
  private readonly itemSearch = document.createElement('input');
  private readonly itemList = document.createElement('div');
  private readonly inventory = document.createElement('div');
  private readonly current = document.createElement('p');
  private readonly stateScene = document.createElement('select');
  private readonly stateSearch = document.createElement('input');
  private readonly stateList = document.createElement('div');
  private readonly stateStatus = document.createElement('p');
  private inventorySnapshot = '';
  private stateSnapshot = '';
  private selectedId = 1;
  private readonly hitboxToggle = document.createElement('input');

  constructor(
    private readonly manifest: { scenes: SceneManifestEntry[] },
    private readonly session: SceneSession,
    private readonly inventoryView: InventoryView,
    hitboxEnabled = false,
  ) {
    this.root.className = 'debug-panel scene-controls';
    this.root.innerHTML = '<header><strong>DEBUG PANEL</strong><span>только ?debug=scenes</span></header>';
    const body = document.createElement('div'); body.className = 'debug-panel-body'; this.root.append(body);
    this.root.classList.add('collapsed');
    const header = this.root.querySelector('header')!;
    header.tabIndex = 0; header.setAttribute('role', 'button'); header.setAttribute('aria-expanded', 'false');
    const toggle = () => {
      const collapsed = this.root.classList.toggle('collapsed');
      header.setAttribute('aria-expanded', String(!collapsed));
    };
    header.onclick = toggle;
    header.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); } };
    body.append(this.section('Инвентарь', this.inventoryControls()));
    body.append(this.section('Сцена', this.sceneControls()));
    const hitbox = document.createElement('label');
    this.hitboxToggle.type = 'checkbox'; this.hitboxToggle.setAttribute('aria-label', 'Включить hitbox debugger');
    this.hitboxToggle.checked = hitboxEnabled;
    this.hitboxToggle.onchange = () => { document.querySelector<HTMLElement>('#game')?.setAttribute('data-hitbox-debug', String(this.hitboxToggle.checked)); };
    hitbox.append(this.hitboxToggle, document.createTextNode(' Hitbox debugger'));
    body.append(this.section('Диагностика кликов', hitbox));
    body.append(this.section('SCC State Inspector', this.stateControls()));
    this.renderItems(); this.refresh();
  }

  private section(title: string, content: HTMLElement): HTMLElement {
    const section = document.createElement('section');
    const heading = document.createElement('h3'); heading.textContent = title;
    section.append(heading, content); return section;
  }

  private inventoryControls(): HTMLElement {
    const content = document.createElement('div');
    this.itemSearch.type = 'search'; this.itemSearch.placeholder = 'Поиск по ID или названию';
    this.itemSearch.setAttribute('aria-label', 'Поиск предметов');
    this.itemSearch.oninput = () => this.renderItems();
    this.itemList.className = 'debug-item-list';
    this.itemSelect.setAttribute('aria-label', 'Выбранный предмет');
    this.itemSelect.onchange = () => { this.selectedId = Number(this.itemSelect.value); this.refresh(); };
    const actions = document.createElement('div'); actions.className = 'debug-actions';
    actions.append(this.button('Выдать', () => { this.session.loader.inventory.push(this.selectedId); this.refresh(); }),
      this.button('Удалить все', () => {
        for (let i = this.session.loader.inventory.length - 1; i >= 0; i--) if (this.session.loader.inventory[i] === this.selectedId) this.session.loader.inventory.splice(i, 1);
        this.refresh();
      }),
      this.button('Сбросить выбор', () => {
        this.session.view?.selectItem(0); this.inventoryView.resetSelection(); this.refresh();
      }));
    this.inventory.className = 'debug-current-inventory';
    content.append(this.itemSearch, this.itemList, this.itemSelect, actions, this.current, this.inventory);
    return content;
  }

  private renderItems(): void {
    const query = this.itemSearch.value.trim().toLocaleLowerCase();
    this.itemList.replaceChildren();
    for (let id = 1; id <= 59; id++) {
      const name = ITEM_NAMES[id] ?? `Предмет ${id}`;
      if (query && !String(id).includes(query) && !name.toLocaleLowerCase().includes(query)) continue;
      const option = document.createElement('button');
      option.type = 'button'; option.textContent = `${id} · ${name}`; option.dataset.itemId = String(id);
      option.classList.toggle('selected', id === this.selectedId);
      option.onclick = () => { this.selectedId = id; this.renderItems(); this.refresh(); };
      this.itemList.append(option);
    }
    this.itemSelect.replaceChildren();
    for (let id = 1; id <= 59; id++) {
      const option = document.createElement('option'); option.value = String(id); option.textContent = `${id} · ${ITEM_NAMES[id] ?? `Предмет ${id}`}`;
      option.selected = id === this.selectedId; this.itemSelect.append(option);
    }
  }

  private sceneControls(): HTMLElement {
    const content = document.createElement('div');
    const sceneSelect = document.createElement('select'); sceneSelect.setAttribute('aria-label', 'Сцена для загрузки');
    for (const scene of this.manifest.scenes) {
      const option = document.createElement('option'); option.value = String(scene.id); option.textContent = `Level${scene.id}${scene.loadable ? '' : ' · неполная'}`;
      option.disabled = !scene.loadable; sceneSelect.append(option);
    }
    const load = this.button('Загрузить сцену', () => this.session.request(Number(sceneSelect.value), 0, 'debug'));
    const grid = document.createElement('div'); grid.className = 'debug-scene-grid';
    for (const scene of this.manifest.scenes) {
      const button = this.button(`L${scene.id}`, () => this.session.request(scene.id, 0, 'debug'));
      button.id = `debug-scene-${scene.id}`; button.dataset.scene = String(scene.id); button.dataset.loadable = String(scene.loadable);
      button.title = scene.loadable ? `Перейти в Level${scene.id}` : scene.missing.required.map((item) => item.message).join('; ');
      button.disabled = !scene.loadable; grid.append(button);
    }
    content.append(sceneSelect, load, grid); return content;
  }

  private stateControls(): HTMLElement {
    const content = document.createElement('div');
    for (const scene of this.manifest.scenes) {
      const option = document.createElement('option'); option.value = String(scene.id); option.textContent = `Level${scene.id}`; this.stateScene.append(option);
    }
    this.stateScene.onchange = () => { this.stateSnapshot = ''; this.renderState(); };
    this.stateSearch.type = 'search'; this.stateSearch.placeholder = 'Фильтр переменных';
    this.stateSearch.setAttribute('aria-label', 'Фильтр SCC-переменных');
    this.stateSearch.oninput = () => this.renderState();
    const refresh = this.button('Обновить', () => { this.stateSnapshot = ''; this.renderState(); });
    this.stateList.className = 'debug-state-list';
    content.append(this.stateScene, refresh, this.stateSearch, this.stateStatus, this.stateList); return content;
  }

  private renderState(): void {
    const id = Number(this.stateScene.value || this.session.view?.definition.id || 1);
    const state = this.session.loader.states.get(id);
    const query = this.stateSearch.value.trim().toLocaleLowerCase();
    const rows = [...(state?.objects.values() ?? [])]
      .filter((item) => !query || item.name.toLocaleLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name));
    this.stateSnapshot = `${id}|${rows.map((item) => `${item.name}:${item.state}`).join(',')}`;
    this.stateStatus.textContent = `${state?.initialized ? 'Инициализирована' : 'Не инициализирована'} · ${rows.length} переменных${id === this.session.view?.definition.id ? ' · активная сцена' : ''}`;
    this.stateList.replaceChildren();
    for (const object of rows) {
      const row = document.createElement('label'); row.className = 'debug-state-row';
      const name = document.createElement('span'); name.textContent = object.name;
      const value = document.createElement('input'); value.type = 'number'; value.step = '1'; value.value = String(object.state); value.setAttribute('aria-label', `${object.name} state`);
      value.onchange = () => {
        const next = Number(value.value);
        if (!Number.isSafeInteger(next)) { value.value = String(object.state); return; }
        object.state = next; this.stateSnapshot = ''; this.refresh();
      };
      row.append(name, value); this.stateList.append(row);
    }
    const zone = document.createElement('label'); zone.className = 'debug-state-row';
    const zoneName = document.createElement('span'); zoneName.textContent = 'Game.zone';
    const zoneValue = document.createElement('input'); zoneValue.type = 'number'; zoneValue.step = '1'; zoneValue.value = String(this.session.loader.game.zone);
    zoneValue.onchange = () => { const next = Number(zoneValue.value); if (Number.isSafeInteger(next)) this.session.loader.game.zone = next; else zoneValue.value = String(this.session.loader.game.zone); };
    zone.append(zoneName, zoneValue); this.stateList.prepend(zone);
  }

  private button(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = action; return button;
  }

  private refresh(): void {
    const items = this.session.loader.inventory;
    const snapshot = items.join(',');
    if (snapshot !== this.inventorySnapshot) {
      this.inventorySnapshot = snapshot; this.inventoryView.setItems(items);
      this.inventory.replaceChildren();
      if (!items.length) this.inventory.textContent = 'Инвентарь пуст';
      else for (const [index, id] of items.entries()) {
        const chip = this.button(`${id} · ${ITEM_NAMES[id] ?? `Предмет ${id}`} ×`, () => { items.splice(index, 1); this.inventorySnapshot = ''; this.refresh(); });
        chip.title = 'Удалить этот экземпляр'; this.inventory.append(chip);
      }
    }
    const view = this.session.view;
    this.current.textContent = `Выбран предмет: ${this.selectedId} · ${ITEM_NAMES[this.selectedId] ?? `Предмет ${this.selectedId}`} | для сцены: ${view?.selectedItem ?? 0} | pending: ${this.inventoryView.pendingSelection}`;
    if (!this.stateSnapshot || !this.stateList.childElementCount) this.renderState();
  }

  update(): void {
    this.refresh();
    const id = Number(this.stateScene.value || 1);
    const state = this.session.loader.states.get(id);
    const query = this.stateSearch.value.trim().toLocaleLowerCase();
    const snapshot = `${id}|${[...(state?.objects.values() ?? [])]
      .filter((item) => !query || item.name.toLocaleLowerCase().includes(query))
      .map((item) => `${item.name}:${item.state}`).sort().join(',')}`;
    if (snapshot !== this.stateSnapshot) this.renderState();
  }
}
