# Luna: контракт видео и SclipW

Основа: [RE README](README.md). Это проект реализации, не выполненный patch.
Точные native факты отделены ниже от безопасной **browser policy**.

## Интерфейсы и ownership

```ts
type ClipResult = 'ended' | 'skipped' | 'error';
type ClipPhase = 'idle' | 'loading' | 'playing' | 'finishing';
type ClipRequest = { originalName: string; ignoredSccArg: number };
interface ClipController {
  readonly phase: ClipPhase;
  readonly active: boolean;
  begin(request: ClipRequest): void;
  skip(): void;
  dispose(): void;
}
```

Один controller на game session, не на анимацию или SceneView. Собственность:
один `<video>`/surface, загрузочный token, listeners, terminal result/error;
исходный SCC filename и converted URL раздельны. Результат diagnostic, не
новое SCC-событие. Manifest case-insensitive original resource key → URL,
format, hash исходного AVI и conversion metadata; не менять SCC.

## SCC barrier и lifecycle

1. Parser сохраняет оба аргумента SclipW. Integer игнорируется при playback
   (не трактовать как loop). First executor entry вызывает begin, сохраняет PC,
   ставит global barrier и обязательно yield даже при synchronous missing URL.
2. loading/playing: общий игровой scene update, SCC tick/navigation/анимации
   приостановлены; media A/V clock продолжает работать. Не реализовывать
   блокировку только одного Program: native останавливает обычный idle tick.
3. При Init loader завершает текущий синхронный Init→position→Start lifecycle;
   не превращать Init в await до конца clip и не терять paused Init Program.
4. Контроллер обслуживается вне приостановленного scene tick. `ended`, skip
   или terminal playback/load error → finishing, detach media/listeners,
   active=false, вернуть game update. Не вызывать SCC.dispatch из media callback.
5. Следующий обычный SCC poll видит clip inactive, снимает barrier и продолжает
   хвост в том же poll. Никакого автоматического `Level`/teleport в controller.
6. Any keydown или left-down при активном clip: skip + consume event; не
   открыть map/save, не кликнуть сцену в том же event. Right-down skip не
   доказан. Autorepeat и pointerup после skip не должны давать второй skip.
7. Startup Title и menu Titres используют тот же controller, но не ждут SCC.
   Egame после Final: gate UI session→не-resumable main menu, отдельно от clip.

**Browser policy:** loading также modal; autoplay rejected — показать явное
действие «Воспроизвести»/«Пропустить», не трактовать `NotAllowedError` как EOF.
Media error/missing file логируется с filename/result и завершает barrier
после первого yield, не зависает. Полная native COM failure policy неизвестна.
Artificial overlapping begin: диагностировать unsupported concurrent request;
не изобретать native очередь и не перепутать completion старого/нового clip.
У валидного корпуса новых параллельных SCC playback сценариев не доказано.

## Рендер и аудио

- Растянуть 400×300 → **внутренний 800×600 viewport** (2×), затем обычное
  CSS scaling canvas. Не браузерный Fullscreen API по умолчанию: native
  fullscreen означает игровую DirectDraw surface. Не сохранять scene.scroll.
- Обычный game render/input закрыты клипом; browser controls скрыты, native
  skip gesture сохранён. Не показывать лишние продуктовые codec/RE детали.
- Embedded audio из video element/media graph, не создавать Sound Fram,
  Voice или MULT Anim. Не применять правила WAV frame-range barrier к AVI.
- Не делать доказанными stop/pause/duck музыки и существующих WAV: для всех
  входов такая native policy не установлена. Явно зафиксировать выбранную
  browser mixing policy и проверить на Windows до объявления parity.
- Dispose: pause, clear src/load, detach listeners, revoke только свои object
  URLs, освободить texture при canvas upload. Completion идемпотентен.
- Async callbacks проверяют session/load generation; после new game/load/dispose
  старый clip не меняет новую сцену и не снимает чужой barrier.

## Подготовка ресурсов

Использовать offline asset preparation, а не декодирование IV50 в runtime.
Проверенный full conversion Rolik2:

```sh
ffmpeg -i Rolik2.avi -map 0:v:0 -map 0:a:0 -c:v libx264 -pix_fmt yuv420p -crf 18 -c:a aac -b:a 128k -movflags +faststart rolik2.mp4
```

Аналогично остальные AVI с их codec различиями. Не масштабировать/менять fps,
не обрезать аудио `-shortest` без отдельного решения. Проверить manifest,
duration, frame count, stream presence; originals read-only. Offline probe уже
доказал полный decode всех файлов и conversion одного; остальные conversion
и HTML playback требуют выполнения при implementation. Не коммитить original
AVI/converted copyrighted media в research-ветку.

## Save/Load

Не сохранять media position, decoder pointers, transient results и Program PC.
Существующий canSave расширить clip/loading gate; нельзя сохранить после
первого yield до появления media surface. F2/F3 во время clip потребляются
как skip, а не немедленный save/load. При load/new game сначала отменить owned
clip с generation guard; затем восстановить object states и обычный entry Start.
Не replay Init для уже initialized сцены. Внешняя mid-clip import policy —
**browser policy**, не восстановленный native пользовательский сценарий.

## Фокусные проверки и приёмка

1. Реальный Rolik2: первый yield, clip modal, PC не проходит к Knopka2 до конца;
   time с loading не считается завершением; game ticks действительно стоят.
2. Natural EOF → State Knopka2 → K_vniz → Per_plat2 и Lstate 19/25/35 ровно
   один раз; после этого обычный To_35 всё ещё ведёт35@1.
3. Key и left skip: тот же SCC хвост, ни scene click, ни F1/F2/F3 в том же
   событии; skip идемпотентен. No right-click skip assertion.
4. Missing filename / media decode error: первый yield сохранён, diagnostic,
   input возвращается, tail исполняется; нет вечного loading и silent failure.
5. Browser autoplay refusal: gesture recovery, доступный skip, без ложного EOF.
6. Level1: Init suspended на Rolik1, entry Start не дублирует post-video
   Slip/Stat_v; после completion корректный порядок. Не await Init в loader.
7. Level25: Rolik5 → Bomsh5 и Lstate → Level19@3 только после завершения/skip.
8. Level28: Final → Egame→menu без обычного resume; new game сбрасывает gate.
9. Title/Titres outside SCC; все 6 assets имеют видео и слышимое A/V audio,
   полный frame/duration, правильный aspect ratio в 800×600.
10. Save gate, load/new game/dispose race, повторный clip, ошибка после dispose,
    ресурсное владение и отсутствие active media/listeners после teardown.

Chromium E2E должен использовать реальный UI/input и реальный media `ended`,
не ручной вызов onEnded вместо клипа. Отдельно Windows-run для A/V sync,
timing/codec failure/audio mixing. Не объявлять dynamic parity по успешному
browser E2E или ffmpeg decode.
