# Luna: контракт карты (без изменения игровых SCC)

Основа — [статический RE](README.md), master `fc07ae4`. Требования ниже:
native-derived, если не отмечено **browser policy**. Реализация в этой ветке
не выполнялась. Карта не является исправлением доказанного Level34 blocker.

## Интерфейсы

```ts
type MapBank = 0 | 1;
type MapState = { bank: MapBank; unlocked: [boolean[], boolean[]] };
type MapTarget = { scene: number; portal: number };
type MapPhase = 'closed' | 'loading' | 'open' | 'leaving';
interface GameMapController {
  toggle(): void;                    // F1; только game ↔ map
  escape(): void;                    // map → game, без Level
  pointerMove(screenX: number, screenY: number): void;
  pointerDown(button: number): void;  // left: commit текущего hover
  dispose(): void;
}
```

Владельцем MapState остаётся **существующий SceneLoader.game.map**, не SceneView.
SCC host.setMap → setMapBank, host.setZone → unlockMapZone; не менять SCC parser.
Контроллер читает состояние, но не создаёт вторую копию unlock flags. `selected`
(-1 или 0..6), UI phase, фон и hover transient. Destinations/rect offsets
константны по таблице README; размеры из проверенных кадров map.MULT.

## Состояния и lifecycle

- F1 в closed/game: проверить !busy, !Block, !transition, отсутствие другого
  modal/video. Первые два gate — оригинал; запрет открытия во время async load
  — **browser policy**, защищает существующую транзакцию SceneSession.
- loading: загрузить фон и 7 кадров, не выполнять клики сцены. При успехе open,
  вычислить selected по последним логическим mouse coordinates.
- open: suspend обычный scene update/SCC/navigation, не уничтожать SceneView;
  render фон, выделенный кадр, UI-курсор. Не ставить Scene.inputBlocked:
  этот флаг имеет другую SCC-семантику (Plane fallback).
- Mouse move: строгое попадание внутрь rect, ascending zone order; locked →
  -1. Canvas CSS → 800×600 ровно один раз, **без scene.scroll** и alpha-mask.
- Left down с selected!=-1: play существующий UI effect, mode→game,
  `session.request(target.scene,target.portal,'map')` либо эквивалент существующего
  отложенного перехода. Не teleport героя вручную. Не dispatch invented MapExit.
- Native old-scene tick перед сменой зафиксирован в README. Использовать общий
  scene boundary, не выполнять async load непосредственно из mouse callback.
- Esc/F1 в open: close, selected=-1, release owned map resources, вернуться к
  той же сцене без повторных Init/Start и сброса bank/unlocks.
- Outside left click: оставить карту. Right click: ничего. F1 вне game/map:
  no-op. Во время видео клавишу сначала перехватывает video skip.
- dispose/cancel async load: invalidate token, освободить только свои текстуры,
  не удалить кэши живой сцены/ресурсы другого контроллера. Idempotent cleanup.

## Save/Load и ошибки

- Новый game: bank0 + 14 false. Setmap не сбрасывает флаги. Setzon пишет
  только активный банк; повторный вызов идемпотентен.
- Сохранять существующий banked-v1 DTO; загрузить до scene Start. Никаких
  `selected`, video, map phase в save. В открытой карте F2/F3 не открывают
  save/load (native `0x40d0b4` отказывает для mode7).
- Legacy-zone-v1 не содержит unlock matrix: не считать все направления
  открытыми. Сохранить текущую migration-policy, явно обозначать потерю данных.
- Невалидный SCC bank/zone: **browser policy** диагностировать и оставить
  прежнее состояние (не modulo/clamp). Не эмулировать чтение за пределами PE.
- Missing/corrupt asset: **browser policy** показать короткую ошибку, закрыть
  loading, сохранить world, вернуть ввод; не оставлять invisible modal.
- Destination load failure: использовать текущий transactional SceneSession
  error path; не уничтожать исходную сцену и map state до успешной подготовки.
- Музыку/голоса не останавливать автоматически: native pause такого рода
  не установлен. Не дублировать Smusic/Start при закрытии карты.

## Проверки и критерии приёмки

1. Чистая игра: F1 доступен в idle; все направления locked до Setzon.
2. Setzon3 bank0 → rect(269,153,230,143) ведёт в 1@0; Setmap1 + Setzon3
   тот же rect →37@0. Bank0 unlock остаётся после смены bank.
3. Для всех 14 target exact table equality; zone2:39/5. Нет target34/48.
4. Проверить четыре границы каждого rect (строго не входят), transparent
   pixel внутри rect входит, scroll исходной сцены не влияет.
5. Hover selected frame zone+1; click commit не перебирает сценовые объекты.
6. F1/Esc cancel: тот же hero/object state, Init-count и Start-count без прироста;
   outside/right click карту не закрывают.
7. busy/Block, video, inventory/save modal, async transition gates. Пока карта
   открыта не движется герой и не продолжается SCC.
8. Save/Load: оба банка сохраняются, scene Start может дополнительно Setzon;
   new game всё очищает. F2/F3 в map не открывают второй modal.
9. Реальный выбор: scene loader, portal0, Init once / Start every entry,
   target music следует SCC, не map-controller. Проверить повторный заход.
10. Failure/cancel/dispose: нет зависшего ввода/утечки texture ownership.

Приёмка: эти сценарии + Chromium canvas/keyboard E2E без правки SCC и без
прямого вызова handler вместо реального пользовательского ввода. Windows-run
нужен отдельно для визуального timing/audio parity; не называть Chromium
прохождение dynamic parity оригинала.
