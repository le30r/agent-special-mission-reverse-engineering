import { Application, Container } from 'pixi.js';
import type { Point } from './navigation/router';
import { SceneSession } from './scene/scene-session';
import type { SceneView } from './scene/scene-view';
import { loadSceneCatalog } from './scene/scene-source';
import { InventoryView } from './scene/inventory-view';
import { logicalScreenPoint } from './scene/active-hit';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './config';
import './style.css';

function screenPosition(app: Application, event: PointerEvent): Point {
  const rect = app.canvas.getBoundingClientRect();
  // Raw logical screen coordinates; scroll is applied exactly once inside the hit tests.
  return logicalScreenPoint(event.clientX, event.clientY, rect);
}

function sprite(view: SceneView | undefined, name: string): string {
  const value = view?.objectDebug(name);
  return value ? `${value.sprite}/${value.width}x${value.height}/d${value.depth}@${value.x.toFixed(1)},${value.y.toFixed(1)}` : 'missing';
}

function describeSession(session: SceneSession, unsupported: readonly number[]): string {
  const view = session.view;
  if (!view) return 'SCENE DEBUG · no active scene';
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
  return [
    `SCENE DEBUG · active=${status.scene} · supported=[${session.supportedScenes.join(',')}]${unsupported.length ? ` · unsupported=[${unsupported.join(',')}]` : ''}`,
    `scc=${definition.sccUrl}`,
    `entry=${entryLabel} · pos=(${Math.round(status.position[0])},${Math.round(status.position[1])}) dir=${status.direction} · mask correction=${entry?.snapRadius ?? 0}/${entry?.snapAngleIndex ?? 0}`,
    `scene=${definition.mask.width}x${definition.mask.height} focus=${definition.focus.join(' ')} portals=${definition.portals.length}`,
    `hero: depth=${status.depth} scale=${status.scale.toFixed(4)} scroll=${status.scroll} objects=${status.objects} animations=${definition.animations.size}`,
    `session: zone=${session.loader.game.zone} init=[${initRuns || 'none'}] transitions=[${session.transitionLog.join(' ')}]`,
    `active: Goto_5.visible=${goto5?.visible ?? false} Goto_11.visible=${goto11?.visible ?? false}`,
    `inventory=[${status.inventory.join(',')}] selected=${status.selectedItem}`,
    `level1.Botl.state=${botl?.state ?? 0} hidden=${botl?.imageHidden === true} · Pistol.state=${pistol?.state ?? 0} hidden=${pistol?.imageHidden === true}`,
    `level1.Slip.state=${slip?.state ?? 0} · Flag1.state=${flag1?.state ?? 0} · Lec_v.state=${level1.objects.get('Lec_v')?.state ?? 0} · Nar.visible=${nar?.visible ?? false}`,
    `sprites: Pistol=${sprite(view,'Pistol')} Slip=${sprite(view,'Slip')} Botl=${sprite(view,'Botl')}`,
  ].join('\n');
}

async function main() {
  const host = document.querySelector<HTMLDivElement>('#game');
  if (!host) throw new Error('#game is missing');
  const parameters = new URLSearchParams(location.search);
  const depthDebug = parameters.get('debug') === 'depth';
  const sceneDebug = parameters.get('debug') === 'scenes';

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
  const catalog = await loadSceneCatalog();
  const inventoryView = new InventoryView(catalog.interface.frame, catalog.interface.icons);
  overlay.addChild(inventoryView.root);
  const session = new SceneSession(stageRoot, catalog.definitions, catalog.backgrounds, {
    onUnsupported: (scene) => { unsupported.push(scene); console.warn(`Scene ${scene} has no prepared definition`); },
  });
  // The initial scene uses the same deferred boundary as an SCC Level command.
  session.request(1, -1, 'boot');
  session.flush();

  if (sceneDebug || depthDebug) {
    const controls = document.createElement('div');
    controls.className = 'scene-controls';
    const buttons = [
      ['debug-scene-39', 'Level39 · Portal[0]', 39, 0],
      ['debug-scene-1', 'Level1 · Portal[1]', 1, 1],
    ] as const;
    for (const [id, label, scene, portal] of buttons) {
      const button = document.createElement('button');
      button.id = id;
      button.textContent = label;
      button.onclick = () => session.request(scene, portal, 'debug');
      controls.appendChild(button);
    }
    host.appendChild(controls);
  }

  let tickNumber = 0;
  let elapsedNow = 0;
  app.ticker.add((ticker) => {
    tickNumber++;
    const dt = Math.max(0, ticker.deltaMS);
    elapsedNow += dt;
    // A scene switch is applied only at this boundary, never inside a command.
    session.flush();
    const view = session.view;
    inventoryView.setItems(session.loader.inventory);
    view?.tick(dt, elapsedNow, tickNumber);
    if (depthPanel) depthPanel.textContent = view?.depthReport() ?? 'DEPTH DEBUG · no active scene';
    if (animationPanel) {
      animationPanel.textContent = view
        ? `ANIMATION TRACE · latest ${Math.min(view.animationLog.length, 120)} updates\n${view.animationReport()}`
        : 'ANIMATION TRACE · no active scene';
    }
    if (scenePanel) scenePanel.textContent = describeSession(session, unsupported);
    const botl = session.loader.state(1).objects.get('Botl')?.state ?? 0;
    const selected = view?.selectedItem ?? 0;
    hud.textContent = `Агент: Особое задание · сцена ${view?.definition.id ?? '—'} · zone ${session.loader.game.zone} · инвентарь ${view && view.scc.inventory.length ? view.scc.inventory.join(', ') : 'пусто'}${selected ? ` · выбран предмет ${selected}` : ''} · Botl.state=${botl}`;
  });

  app.canvas.addEventListener('pointerdown', (event) => {
    const view = session.view;
    if (!view) return;
    const [x, y] = screenPosition(app, event);
    // The inventory is a normal overlay: it consumes its clicks, and a selected
    // slot becomes SCC `scene+5` for the next scene click.
    if (inventoryView.pointerDown(x, y)) {
      const selected = inventoryView.consumeSelection();
      if (selected > 0) view.selectItem(selected);
      return;
    }
    view.pointerDown(x, y);
  });

  window.addEventListener('resize', () => {
    const scale = Math.min(window.innerWidth / VIEWPORT_WIDTH, window.innerHeight / VIEWPORT_HEIGHT);
    app.canvas.style.width = `${VIEWPORT_WIDTH * scale}px`;
    app.canvas.style.height = `${VIEWPORT_HEIGHT * scale}px`;
  });
  window.dispatchEvent(new Event('resize'));
}

main().catch((error) => {
  console.error(error);
  const host = document.querySelector('#game');
  if (host) host.textContent = `Ошибка загрузки прототипа: ${String(error)}`;
});
