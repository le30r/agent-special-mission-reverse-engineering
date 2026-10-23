import { Application, Container, Graphics } from 'pixi.js';
import type { Point } from './navigation/router';
import { SceneSession } from './scene/scene-session';
import type { SceneView } from './scene/scene-view';
import { loadSceneCatalog, SceneAssetProvider, type SceneManifestEntry } from './scene/scene-source';
import { InventoryView } from './scene/inventory-view';
import { logicalScreenPoint } from './scene/active-hit';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './config';
import './style.css';
import { BrowserAudioBackend } from './audio/backend';
import { DebugPanel } from './scene/debug-panel';
import { SaveRepository } from './scene/save-repository';
import { SaveLoadView } from './scene/save-load-view';
import { SaveCodec } from './scene/save-codec';
import { pixiTextureDiagnostics } from './scene/textures';
import { MapController } from './scene/map-controller';
import { VideoPlaybackController } from './video/video-playback-controller';
import { CursorView } from './scene/cursor-view';

function screenPosition(app: Application, event: PointerEvent): Point {
  const rect = app.canvas.getBoundingClientRect();
  // Raw logical screen coordinates; scroll is applied exactly once inside the hit tests.
  return logicalScreenPoint(event.clientX, event.clientY, rect);
}

function sprite(view: SceneView | undefined, name: string): string {
  const value = view?.objectDebug(name);
  return value ? `${value.sprite}/${value.width}x${value.height}/d${value.depth}@${value.x.toFixed(1)},${value.y.toFixed(1)}` : 'missing';
}

function objectStateLine(view: SceneView | undefined): string {
  if (!view) return 'scene.objects=none';
  const entries = [...view.state.objects.values()]
    .filter((object) => object.state !== 0 || object.visible !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((object) => `${object.name}=${object.state}${object.visible !== undefined ? `/${object.visible ? 'v' : 'h'}` : ''}`);
  return `scene.objects: ${entries.join(' ') || 'none'}`;
}

function describeSession(session: SceneSession, manifest: { summary: { total: number; loadable: number[]; incomplete: Array<{ id: number }> } }, provider: { loadedCount: number }, unsupported: readonly number[]): string {
  const view = session.view;
  if (!view) {
    return [
      `SCENE DEBUG · no active scene · catalog=${manifest.summary.total} loadable=${manifest.summary.loadable.length} incomplete=${manifest.summary.incomplete.length}`,
      `loading=${session.loading ?? 'none'}${session.loadError ? ` · loadError=${session.loadError.scene}: ${session.loadError.message}` : ''}${unsupported.length ? ` · unsupported=[${unsupported.join(',')}]` : ''}`,
    ].join('\n');
  }
  const status = view.status();
  const definition = view.definition;
  const entry = session.entry;
  const transition = session.lastTransition;
  const entryLabel = transition && transition.portal >= 0 ? `portal[${transition.portal}]` : (entry?.source ?? 'none');
  const level1 = session.loader.state(1);
  const botl = level1.objects.get('Botl');
  const pistol = level1.objects.get('Pistol');
  const slip = level1.objects.get('Slip');
  const flag1 = level1.objects.get('Flag1');
  const nar = level1.objects.get('Nar');
  const goto5 = level1.objects.get('Goto_5');
  const goto11 = session.loader.state(39).objects.get('Goto_11');
  const initRuns = [...session.initRuns.entries()].map(([scene, count]) => `${scene}:${count}`).join(',');
  const lstatePlaceholders = [...session.loader.states.values()]
    .filter((state) => !state.initialized && state.objects.size > 0)
    .sort((a, b) => a.id - b.id)
    .map((state) => `${state.id}:${[...state.objects.values()].map((object) => `${object.name}=${object.state}`).join(',')}`)
    .join(' ');
  return [
    `SCENE DEBUG · active=${status.scene} · catalog=${manifest.summary.total} loadable=${manifest.summary.loadable.length} incomplete=${manifest.summary.incomplete.length}${unsupported.length ? ` · unsupported=[${unsupported.join(',')}]` : ''} · loading=${session.loading ?? 'none'}`,
    `scc=${definition.sccUrl}`,
    `entry=${entryLabel} · pos=(${Math.round(status.position[0])},${Math.round(status.position[1])}) dir=${status.direction} · mask correction=${entry?.snapRadius ?? 0}/${entry?.snapAngleIndex ?? 0}`,
    `scene=${definition.mask.width}x${definition.mask.height} focus=${definition.focus.join(' ')} portals=${definition.portals.length} animations=${definition.animations.size} layout=${definition.layoutAnimation ?? 'none'}`,
    `hero: depth=${status.depth} scale=${status.scale.toFixed(4)} scroll=${status.scroll} objects=${status.objects} · scc.busy=${status.busy} blocked=${status.blocked} mask=${status.activeMaskPath}`,
    `session: zone=${session.loader.game.zone} init=[${initRuns || 'none'}] transitions=[${session.transitionLog.join(' ')}] resources.loadedScenes=${provider.loadedCount}`,
    `audio voices: ${view.audioReport() || 'none'}`,
    `lstate.placeholders=[${lstatePlaceholders}]`,
    ...(session.loadError ? [`loadError=${session.loadError.scene}: ${session.loadError.message}`] : []),
    objectStateLine(view),
    `active: Goto_5.visible=${goto5?.visible ?? false} Goto_11.visible=${goto11?.visible ?? false}`,
    `inventory=[${status.inventory.join(',')}] selected=${status.selectedItem}`,
    `level1.Botl.state=${botl?.state ?? 0} hidden=${botl?.imageHidden === true} · Pistol.state=${pistol?.state ?? 0} hidden=${pistol?.imageHidden === true}`,
    `level1.Slip.state=${slip?.state ?? 0} · Flag1.state=${flag1?.state ?? 0} · Lec_v.state=${level1.objects.get('Lec_v')?.state ?? 0} · Nar.visible=${nar?.visible ?? false}`,
    `sprites: Lec_v=${sprite(view,'Lec_v')} Goto_1=${sprite(view,'Goto_1')} Pistol=${sprite(view,'Pistol')} Slip=${sprite(view,'Slip')} Botl=${sprite(view,'Botl')}`,
    ...(definition.warnings.length ? [`warnings: ${definition.warnings.join('; ')}`] : []),
  ].join('\n');
}

/** Debug controls are generated from the manifest, never from a fixed scene list. */
function buildSceneControls(manifest: { scenes: SceneManifestEntry[] }, session: SceneSession): HTMLDetailsElement {
  const controls = document.createElement('details');
  controls.className = 'scene-controls';
  const summary = document.createElement('summary');
  summary.textContent = `Scenes (${manifest.scenes.length})`;
  controls.appendChild(summary);
  const grid = document.createElement('div');
  grid.className = 'scene-control-buttons';
  for (const scene of manifest.scenes) {
    const button = document.createElement('button');
    button.id = `debug-scene-${scene.id}`;
    button.dataset.scene = String(scene.id);
    button.dataset.loadable = String(scene.loadable);
    button.textContent = `Level${scene.id}`;
    if (!scene.loadable) {
      button.title = scene.missing.required.map((missing) => missing.message).join('; ');
      button.classList.add('incomplete');
    }
    button.onclick = () => session.request(scene.id, 0, 'debug');
    grid.appendChild(button);
  }
  controls.appendChild(grid);
  return controls;
}

async function main() {
  const host = document.querySelector<HTMLDivElement>('#game');
  if (!host) throw new Error('#game is missing');
  const parameters = new URLSearchParams(location.search);
  const depthDebug = parameters.get('debug') === 'depth';
  const sceneDebug = parameters.get('debug') === 'scenes';
  const hitboxDebug = parameters.get('debug') === 'hitbox';
  const saveDebug = parameters.get('debug') === 'save' || sceneDebug;

  const app = new Application();
  await app.init({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, background: 0x000000, antialias: false, autoDensity: true, resolution: window.devicePixelRatio || 1 });
  host.appendChild(app.canvas);
  const stageRoot = new Container();
  app.stage.addChild(stageRoot);
  // Interface overlay stays above every disposable scene root.
  const overlay = new Container();
  app.stage.addChild(overlay);

  const hud = document.createElement('div');
  hud.className = 'hud';
  host.appendChild(hud);
  const depthPanel = depthDebug ? document.createElement('pre') : undefined;
  if (depthPanel) { depthPanel.className = 'depth-debug'; host.appendChild(depthPanel); }
  const animationPanel = depthDebug ? document.createElement('pre') : undefined;
  if (animationPanel) { animationPanel.className = 'animation-debug'; host.appendChild(animationPanel); }
  const scenePanel = sceneDebug ? document.createElement('pre') : undefined;
  if (scenePanel) { scenePanel.className = 'scene-debug'; host.appendChild(scenePanel); }

  const unsupported: number[] = [];
  // The manifest is cheap; SCC/MULT/mask/background/external textures are fetched
  // only when a scene is entered. Nothing from the scene corpus is uploaded up front.
  const catalog = await loadSceneCatalog();
  const provider = new SceneAssetProvider(catalog.manifest);
  const videoController = new VideoPlaybackController(host);
  let audioBackend: BrowserAudioBackend | undefined;
  if (parameters.get('audio') !== 'silent' && typeof AudioContext !== 'undefined') {
    try { audioBackend = new BrowserAudioBackend(); } catch (error) { console.warn('Web Audio unavailable; using deterministic silent timing backend', error); }
  }
  const inventoryView = new InventoryView(catalog.interface.frame, catalog.interface.icons);
  overlay.addChild(inventoryView.root);
  const session = new SceneSession(stageRoot, provider, {
    audioBackend,
    videoController,
    saveUiBusy: () => inventoryView.open || inventoryView.pendingSelection !== 0,
    onRestoreCommit: (items) => { inventoryView.resetForRestore(); inventoryView.setItems(items); },
    onUnsupported: (scene) => { unsupported.push(scene); console.warn(`Scene ${scene} is not in the original scene manifest`); },
    onLoadError: (scene, error) => { console.error(`Scene ${scene} failed to load`, error); },
  });
  const saveRepository = new SaveRepository(undefined, { contentId: catalog.manifest.contentId, sceneIds: catalog.manifest.summary.loadable });
  const saveLoadView = new SaveLoadView({
    repository: saveRepository,
    validation: { contentId: catalog.manifest.contentId, sceneIds: catalog.manifest.summary.loadable },
    canSave: () => session.canSave(),
    exportSave: (label) => session.exportSave(label),
    importSave: (save) => session.importSave(save),
  });
  host.appendChild(saveLoadView.root);
  const saveLoadButton = document.createElement('button');
  saveLoadButton.type = 'button'; saveLoadButton.className = 'save-load-launch'; saveLoadButton.textContent = 'Сохранить / загрузить · F2 / F3';
  saveLoadButton.onclick = () => { if (!mapController.isOpen) void saveLoadView.open('save'); };
  host.appendChild(saveLoadButton);
  const mapLayer = new Container();
  overlay.addChild(mapLayer);
  const cursorView = new CursorView();
  overlay.addChild(cursorView.root);
  void cursorView.load(catalog.resources);
  const mapController = new MapController(mapLayer, {
    map: () => session.loader.game.map,
    canOpen: () => {
      const view = session.view;
      return !!view && !session.videoBarrierActive && !view.scc.busy && !view.blocked && !view.hasScenarioBarrier && !session.loading && !session.loader.pending &&
        !session.isRestoring && !inventoryView.open && inventoryView.pendingSelection === 0 && !saveLoadView.isOpen;
    },
    request: (scene, portal) => session.request(scene, portal, 'map'),
    reportError: (message) => {
      console.error(`Original game map failed to open: ${message}`);
      hud.textContent = `Карта недоступна: ${message}`;
    },
  });
  const debugPanel = sceneDebug || hitboxDebug ? new DebugPanel(catalog.manifest, session, inventoryView, hitboxDebug) : undefined;
  if (hitboxDebug) host.dataset.hitboxDebug = 'true';
  const hitboxPanel = hitboxDebug ? document.createElement('pre') : undefined;
  if (hitboxPanel) { hitboxPanel.className = 'hitbox-debug'; host.appendChild(hitboxPanel); }
  let hitboxGraphics = new Graphics();
  hitboxGraphics.eventMode = 'none';
  const hitboxDebugApi: { graphics: Graphics; view: () => typeof session.view } | undefined = hitboxDebug
    ? { graphics: hitboxGraphics, view: () => session.view }
    : undefined;
  if (debugPanel) host.appendChild(debugPanel.root);
  if (sceneDebug || hitboxDebug) {
    const debugWindow = window as Window & { __audioDebug?: unknown; __sccDebug?: unknown; __inventoryDebug?: unknown; __hitboxDebug?: unknown; __videoDebug?: unknown };
    debugWindow.__audioDebug = { backend: audioBackend, view: () => session.view };
    debugWindow.__sccDebug = { session, view: () => session.view };
    debugWindow.__inventoryDebug = { view: () => ({ open: inventoryView.open, pendingSelection: inventoryView.pendingSelection }) };
    debugWindow.__videoDebug = {
      controller: videoController,
      view: () => session.view,
      session,
      get gameTime() { return elapsedNow; },
      get tickNumber() { return tickNumber; },
    };
    if (hitboxDebugApi) debugWindow.__hitboxDebug = hitboxDebugApi;
  }
  if (saveDebug) {
    const debugWindow = window as Window & { __saveLoadDebug?: unknown };
    debugWindow.__saveLoadDebug = {
      canSave: () => session.canSave(),
      decodeSave: (serialized: string) => {
        const phases: Record<string, number> = {};
        const result = SaveCodec.decode(serialized, { contentId: catalog.manifest.contentId, sceneIds: catalog.manifest.summary.loadable }, (phase, durationMs) => { phases[phase] = durationMs; });
        return { result, phases };
      },
      exportSave: (label = 'E2E') => session.exportSave(label),
      importSave: (save: Parameters<typeof session.importSave>[0]) => session.importSave(save),
      restoreDiagnostics: () => session.lastRestoreDiagnostics,
      textureDiagnostics: pixiTextureDiagnostics,
    };
  }
  // The initial scene uses the same deferred boundary as an SCC Level command.
  session.request(1, -1, 'boot');
  session.flush();
  if ((sceneDebug || hitboxDebug) && session.view) session.view.root.addChild(hitboxGraphics);
  if (session.view) session.view.hitboxDebugEnabled = hitboxDebug;
  if (sceneDebug || hitboxDebug || saveDebug) {
    (window as Window & { __mapDebug?: unknown }).__mapDebug = {
      view: () => ({
        phase: mapController.phase,
        selected: mapController.selected,
        canOpen: mapController.canOpenNow,
        error: mapController.lastError,
        bank: session.loader.game.map.model === 'banked-v1' ? session.loader.game.map.bank : 0,
        unlocked: session.loader.game.map.model === 'banked-v1'
          ? session.loader.game.map.unlocked.map((row) => [...row])
          : [Array(7).fill(false), Array(7).fill(false)],
      }),
    };
  }

  if (depthDebug) host.appendChild(buildSceneControls(catalog.manifest, session));

  let tickNumber = 0;
  let elapsedNow = 0;
  let mapCursorHidden = false;
  const canvasCursor = app.canvas.style.cursor;
  let pointerX = 0;
  let pointerY = 0;
  app.ticker.add((ticker) => {
    if (mapCursorHidden !== mapController.isOpen) {
      mapCursorHidden = mapController.isOpen;
      app.canvas.style.cursor = mapCursorHidden ? 'none' : canvasCursor;
    }
    const dt = Math.max(0, ticker.deltaMS);
    if (mapController.isOpen) {
      cursorView.update(undefined, pointerX, pointerY, dt, false);
      mapController.tick(dt);
      return;
    }
    const videoWasActive = session.videoActive;
    if (!videoWasActive) { tickNumber++; elapsedNow += dt; }
    // A scene switch (including its lazy resource load) is applied only at this boundary.
    session.flush();
    const view = session.view;
    if ((sceneDebug || hitboxDebug) && view && hitboxGraphics.parent !== view.root) {
      // Scene roots destroy their children on release; the cross-scene debug overlay
      // must be recreated instead of reattaching a destroyed GraphicsContext.
      hitboxGraphics = new Graphics();
      hitboxGraphics.eventMode = 'none';
      view.root.addChild(hitboxGraphics);
      if (hitboxDebugApi) hitboxDebugApi.graphics = hitboxGraphics;
    }
    if (view) view.hitboxDebugEnabled = host.dataset.hitboxDebug === 'true';
    inventoryView.setItems(session.loader.inventory);
    debugPanel?.update();
    view?.tick(dt, elapsedNow, tickNumber);
    cursorView.update(view, pointerX, pointerY, dt,
      !inventoryView.capturesPointer(pointerX, pointerY) && !saveLoadView.isOpen && !session.videoBarrierActive && !session.isRestoring);
    app.canvas.style.cursor = cursorView.root.visible ? 'none' : canvasCursor;
    if (view && !session.videoActive) session.markPostTick();
    if (depthPanel) depthPanel.textContent = view?.depthReport() ?? 'DEPTH DEBUG · no active scene';
    if (animationPanel) {
      animationPanel.textContent = view
        ? `ANIMATION TRACE · latest ${Math.min(view.animationLog.length, 120)} updates\n${view.animationReport()}`
        : 'ANIMATION TRACE · no active scene';
    }
    if (scenePanel) scenePanel.textContent = describeSession(session, catalog.manifest, provider, unsupported);
    if (hitboxPanel) {
      const pointer = hitboxPanel.dataset.pointer?.split(',').map(Number) ?? [0, 0];
      const report = view?.hitboxSnapshot(pointer[0], pointer[1]);
      hitboxGraphics.clear();
      if (report && view && host.dataset.hitboxDebug === 'true') {
        for (const object of view.hitboxRenderGeometry()) {
          if (object.width && object.height && object.hitPixels) {
            const x = object.x - object.width / 2, y = object.y - object.height / 2;
            const isHit = report.objects.find((candidate) => candidate.name === object.name)?.hit ?? false;
            const color = !object.visible ? 0xff3c3c : isHit ? 0xffdf35 : 0x36ff65;
            for (let row = 0; row < object.height; row++) {
              let start = -1;
              for (let col = 0; col <= object.width; col++) {
                const alpha = col < object.width && object.hitPixels[(row * object.width + col) * 4 + 3] !== 0;
                if (alpha && start < 0) start = col;
                if (!alpha && start >= 0) { hitboxGraphics.rect(x + start, y + row, col - start, 1).fill({ color, alpha: 0.48 }); start = -1; }
              }
            }
          } else if (object.width && object.height) {
            hitboxGraphics.rect(object.x - object.width / 2, object.y - object.height / 2, object.width, object.height).stroke({ color: 0xff3c3c, width: 2 });
          }
        }
        for (const active of report.actives) {
          const color = active.visible ? 0x319bff : 0xff3c3c;
          hitboxGraphics.rect(active.rect.left, active.rect.top, active.rect.right - active.rect.left, active.rect.bottom - active.rect.top)
            .fill({ color, alpha: active.visible ? 0.18 : 0.09 }).stroke({ color, width: 2 });
        }
      }
      if (report) hitboxPanel.textContent = `HITBOX DEBUG · Level${report.scene} · scrollX=${report.scrollX}\nPointer screen=(${report.screen.join(',')}) world=(${report.world.join(',')}) · selected item=${view?.selectedItem ?? 0}\nUnified picker target: ${report.selectedTarget ? `${report.selectedTarget.name} [${report.selectedTarget.kind}]` : 'none'}\nHover candidates (front to back): ${report.objects.filter((object) => object.hit || object.withinGeometry).map((object) => `${object.name} [${object.kind}] state=${object.state} depth=${object.depth} cursorId=${object.cursorId ?? '—'} visible=${object.visible} MULT=${object.mult} Click=${object.hasClickHandlers ? 'yes' : 'no'} Case=${object.caseMatch ? 'match' : 'miss'} (${object.case}) hit=${object.hit ? 'yes' : `no (${object.rejection})`}`).join('\n') || 'No nearby objects'}\n\nCLICK TRACE\n${report.clickTrace}`;
      else hitboxPanel.textContent = 'HITBOX DEBUG · no active scene';
    }
    const botl = session.loader.state(1).objects.get('Botl')?.state ?? 0;
    const selected = view?.selectedItem ?? 0;
    const loading = session.loading;
    hud.textContent = loading
      ? `Агент: Особое задание · загрузка сцены ${loading}…`
      : `Агент: Особое задание · сцена ${view?.definition.id ?? '—'} · zone ${session.loader.game.zone} · инвентарь ${view && view.scc.inventory.length ? view.scc.inventory.join(', ') : 'пусто'}${selected ? ` · выбран предмет ${selected}` : ''} · Botl.state=${botl}`;
  });

  app.canvas.addEventListener('pointermove', (event) => {
    const [x, y] = screenPosition(app, event);
    pointerX = x; pointerY = y;
    cursorView.setPointerInside(true);
    mapController.pointerMove(x, y);
    if (hitboxPanel) hitboxPanel.dataset.pointer = `${x},${y}`;
  });
  app.canvas.addEventListener('pointerleave', () => cursorView.setPointerInside(false));
  app.canvas.addEventListener('pointerdown', (event) => {
    if (session.videoBarrierActive) {
      if (event.button === 0) videoController.skip();
      event.preventDefault();
      return;
    }
    if (mapController.isOpen) {
      event.preventDefault();
      mapController.pointerDown(event.button);
      return;
    }
    // Unlock Web Audio from the user's gesture before SCC click handling.
    if (audioBackend) void audioBackend.resume().catch((error) => console.warn('Audio unlock failed', error));
    const view = session.view;
    if (!view || session.isRestoring) return;
    if (audioBackend) void view.unlockAudio().catch((error) => console.warn('Audio unlock failed', error));
    const [x, y] = screenPosition(app, event);
    // The inventory is a normal overlay. Its pending choice becomes scene+5
    // only when the panel closes; the tab cancels an existing scene choice.
    const inventoryAction = inventoryView.pointerDown(x, y, session.loader.inventory, view.selectedItem);
    if (inventoryAction.handled) {
      if (inventoryAction.cancelSceneSelection) view.selectItem(0);
      if (inventoryAction.selectedItem) view.selectItem(inventoryAction.selectedItem);
      return;
    }
    view.pointerDown(x, y);
  });
  window.addEventListener('resize', () => {
    const scale = Math.min(window.innerWidth / VIEWPORT_WIDTH, window.innerHeight / VIEWPORT_HEIGHT);
    app.canvas.style.width = `${VIEWPORT_WIDTH * scale}px`;
    app.canvas.style.height = `${VIEWPORT_HEIGHT * scale}px`;
    videoController.position(app.canvas.getBoundingClientRect());
  });
  window.addEventListener('pagehide', () => { cursorView.dispose(); mapController.dispose(); videoController.dispose(); }, { once: true });
  host.addEventListener('pointerdown', (event) => {
    if (!session.videoBarrierActive || event.button !== 0) return;
    const target = event.target;
    if (target instanceof Element && target.closest('.original-video-play')) return;
    videoController.skip();
    event.preventDefault();
    event.stopPropagation();
  }, { capture: true });
  window.addEventListener('keydown', (event) => {
    if (session.videoBarrierActive) {
      videoController.skip();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (mapController.isOpen && (event.key === 'F1' || event.key === 'Escape')) {
      event.preventDefault();
      if (event.key === 'F1') mapController.toggle(); else mapController.escape();
      return;
    }
    if (event.key === 'Escape' && saveLoadView.isOpen) {
      event.preventDefault(); saveLoadView.close(); return;
    }
    const target = event.target;
    const typing = target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
    if (typing) return;
    if (event.key === 'F1') {
      event.preventDefault(); mapController.toggle(); return;
    }
    if (mapController.isOpen && (event.key === 'F2' || event.key === 'F3')) {
      event.preventDefault(); return;
    }
    if (event.key === 'F2') {
      event.preventDefault(); void saveLoadView.open('save'); return;
    }
    if (event.key === 'F3') {
      event.preventDefault(); void saveLoadView.open('load');
    }
  });
  window.dispatchEvent(new Event('resize'));
}

main().catch((error) => {
  console.error(error);
  const host = document.querySelector('#game');
  if (host) host.textContent = `Ошибка загрузки прототипа: ${String(error)}`;
});
