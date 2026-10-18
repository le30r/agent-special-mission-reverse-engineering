# Независимый аудит браузерного WAV runtime

Дата: 18 октября 2026. Срез: `1e239be` (`638bf93` + `7d5d749`). **Исследование, без исправлений приложения.**

## Заключение

Проблема воспроизведена. Единственной причины нет. Главный дефект обычной игры — **scene-owned audio уничтожается при клике для ходьбы, но не уничтожается при выгрузке сцены**. Независимо от него E2E оставляет текущий документ с нулевым выходным gain. Ещё обнаружены смешение silent-clock и настоящего playback, пропуск звуковых кадров, потеря всех исходных `Repeat` и нарушение идентичности Voice при повторном запуске.

Зелёные тесты не опровергают эти дефекты: штатный Level1 E2E **прошёл в этом аудите**, хотя после ходьбы `Razres` не создал ни одного источника. Проверка `source.start.ok` не проверяет ни нужный WAV, ни PCM на выходе.

| ID | Дефект | Статус доказательства |
|---|---|---|
| A | Walk-click необратимо dispose-ит аудио текущей сцены | Реальный ввод мыши в игре + трасса |
| B | Scene unload не dispose-ит аудио старой сцены | Реальный переход 1→38 через штатный debug control + трасса |
| C | E2E-mute затрагивает последующую ручную игру в том же документе | Реальный Web Audio graph, gain/connections и выходной PCM |
| D | Реальный звук считается завершённым до загрузки/в suspended context | Контролируемые browser fixtures текущего runtime |
| E | Catch-up анимации пропускает промежуточные звуковые hooks | Реальные Level1 definition и SceneView, детерминированные шаги |
| F | Исходный inline `Repeat` не распознаётся | Исходный SCC-корпус + текущий browser parser |
| G | Один eventId превращается в несколько живых Voice; Stop видит только последний | Текущий runtime + реальные Web Audio sources |

## Метод и пределы

Прочитаны весь `src/audio/`, интеграция `SceneView`/`SceneSession`/`main`, animation player, asset preparation, аудиотесты, все E2E audio policy call sites, история `29b16ca`, `7d5d749`, `638bf93` и [AUDIO_RUNTIME.md](AUDIO_RUNTIME.md), включая уточнения §12 и Implementation Contract. Прежние выводы не использовались как доказательство корректности порта.

Окружение: текущий Vite на `127.0.0.1:4173`, Chrome `155.0.8059.80`, отдельный headless-профиль `/private/tmp/wav-audit/chrome-profile`, CDP `9333`, **без** `--autoplay-policy=no-user-gesture-required`. Настоящий fresh boot наблюдался с `context=suspended`, `sources=1` и Voice `playing`.

Проверка тракта выполнена до выходного PCM через `OfflineAudioContext`, а не прослушиванием системного устройства. Поэтому установлено обнуление сигнала графом; состояние колонок, системного микшера и конкретного аудиоустройства этим не проверялось. Safari/Firefox и оригинальный Windows-процесс не запускались. В контролируемых fixtures загрузка/результат декодера задавались явно; AudioContext/source nodes оставались браузерными. Это не объявляется end-to-end проверкой всех 835 WAV.

Исходники приложения, штатные тесты и E2E не изменены. Добавлены только это заключение и [research evidence](browser-wav-audit/). Предсуществующий `.worktrees/` не изменялся.

## A. Клик для ходьбы уничтожает аудио навсегда для данного посещения сцены

**Код:** [SceneView.pointerDown](../../src/scene/scene-view.ts#L582), особенно [строка 613](../../src/scene/scene-view.ts#L613); [SccAudioRuntime.dispose](../../src/audio/scc-audio.ts#L241), [play](../../src/audio/scc-audio.ts#L133), [unlock](../../src/audio/scc-audio.ts#L170), [startBrowserPlayback](../../src/audio/scc-audio.ts#L184).

Последовательность:

1. Сцена загружена; `audio.disposed=false`, WAV играет.
2. Клик не обработан Active/Object Click-Program и не отвергнут `busy`. Это обычный click-to-walk; не только «пустой пиксель», но и объект без подходящего Program.
3. После `scc.cancelActive()` вызывается **`this.audio.dispose()`**. Ставится `disposed=true`, меняется generation, abort-ятся запросы, закрывается scene scope, останавливаются источники, очищаются коллекции.
4. `SceneView` продолжает жить и ходить. Новый аудиосервис не создаётся. `unlock()` сразу возвращается из-за `disposed`.
5. Следующий `Fram` всё же вызывает `play()`: у него нет live-guard. Создаётся новый `pending` Voice; `scope.play()` отклоняется, потому что scope уже disposed.
6. Обработчик rejection видит `this.disposed` и молча возвращается. Handle остаётся `pending`, ошибки в snapshot нет. Слышать нечего; повторный жест не помогает.
7. Положительный диапазон впоследствии освобождается логическим duration-clock (D), поэтому игра продолжает сценарий и скрывает поломку.

**Доказательство:** [lifecycle.json](browser-wav-audit/lifecycle.json). До walk-click активен источник. После реального клика `(60,470)` та же сцена имеет `disposed=true`, `active=0`; следующий реальный `Takedr1`-Fram остаётся `pending` без нового source. Дополнительный запуск `Takedr1` в probe сделан явно для детерминированного контроля; сам dispose вызван обычным браузерным вводом.

**Полностью игровой контроль:** штатный `pnpm e2e:browser:interactions` с обычными кликами прошёл. В [e2e-summary.json](browser-wav-audit/e2e-summary.json): 26 успешных стартов **до** dispose в `25911 ms`; после него — **0**. `Razres` создал события `32/33/34`; синхронный event `34` запросил playback в `32409.6 ms`, но без source. В `38426.2 ms` он получил `voice.logical-finished`, `elapsed=6017`, `duration=6012`. Затем E2E объявил успех.

Это детерминированная причина «сначала звук был, потом пропал». Кажущаяся периодичность зависит от порядка кликов: прямой клик по предмету и предварительная ходьба проходят разные ветки.

## B. Настоящий scene cleanup аудио пропускает

**Код:** [SceneView.dispose](../../src/scene/scene-view.ts#L736) не вызывает `this.audio.dispose()`. Именно этот метод зарегистрирован владельцем ресурсов в [SceneSession.enter](../../src/scene/scene-session.ts#L247).

В чистой сцене, ещё не испорченной walk-click, переход 1→38 удаляет старый view, но не отменяет его WAV scope. В browser trace старый `audio.disposed=false`; после перехода у backend одновременно остаются старые и новые sources. См. `before-scene-switch` / `after-scene-switch` в [lifecycle.json](browser-wav-audit/lifecycle.json).

Следствия: one-shot может доигрывать в чужой сцене; pending decode может поздно запустить старый WAV; корректно распознанный loop вообще не обязан закончиться. Это не разрешённая глобальная музыка. Проверка scene generation есть **внутри** audio runtime, но она не помогает, когда владелец никогда не вызывает dispose.

**История:** обе ошибочные границы появились в `7d5d749`. В `638bf93` изменили внутренности Voice и cleanup коллекций, но место вызова `SceneView` не исправили. `git blame` строки 613 указывает на `7d5d749`.

## C. E2E-mute действительно затрагивает обычную игру

**Код:** [e2e-audio-policy.mjs](../../scripts/e2e-audio-policy.mjs#L5). Переопределяется глобальный `AudioBufferSourceNode.prototype.connect`. Вместо прямого подключения backend из [backend.ts:168](../../src/audio/backend.ts#L168) получается:

```text
AudioBufferSourceNode → GainNode(gain.value=0) → context.destination
```

Gain подключён, context/source могут работать нормально, start и onended проходят, но PCM на destination нулевой. Resume не меняет gain; новая Voice в том же документе снова получает нулевой gain. В production backend собственного GainNode нет: этот узел добавляет именно E2E hook.

**Измерение:** один и тот же backend, mono-буфер из 44100 samples со значением `0.25`, полный offline render через настоящий destination. Результаты: [graph.json](browser-wav-audit/graph.json).

| Условие | Успешных start | Gain → destination | Выходной RMS |
|---|---:|---|---:|
| Чистая вкладка | 1 | Нулевой gain отсутствует | 0.25 |
| После установки штатной E2E policy | 1 | `gain=0`, подключён | 0 |
| Навигация на обычный URL игры при активной CDP-сессии | 1 | `gain=0`, подключён | 0 |
| `E2E_MUTE_AUDIO=0` после уже установленного hook в той же сессии | 1 | `gain=0`, подключён | 0 |
| После закрытия CDP-сессии, текущий документ | 1 | `gain=0`, подключён | 0 |
| Перезагрузка после закрытия CDP-сессии | 1 | Нулевой gain отсутствует | 0.25 |

**Важное ограничение:** в проверенном Chrome pre-navigation scripts перестают инжектироваться после detach CDP-сессии. Не подтверждается утверждение «E2E навсегда заглушает профиль» или «reload после завершённого E2E не помогает». Однако уже изменённый JS-прототип и существующие gain в текущем документе после `socket.close()` остаются. Именно продолжение ручной игры в этой вкладке затронуто. Новая чистая вкладка после E2E не заражена.

Штатные E2E выбирают **существующую** localhost/page вкладку ([выбор target](../../scripts/e2e-browser-level1-interactions.mjs#L22)); в `finally` только закрывают websocket ([строка 233](../../scripts/e2e-browser-level1-interactions.mjs#L233)). Нет собственного disposable target, восстановления прототипа и уже созданных gain. `E2E_MUTE_AUDIO=0` — пропуск установки, **не** команда unmute. Тест «mute disabled» на чистом документе не проверяет восстановление ранее изменённого документа.

Семантика gain и запуска сверена с [Web Audio: GainNode](https://webaudio.github.io/web-audio-api/#GainNode) и [AudioBufferSourceNode.start](https://webaudio.github.io/web-audio-api/#dom-audiobuffersourcenode-start). Возможность регистрации и удаления pre-navigation scripts описана в [Chrome DevTools Page domain](https://chromedevtools.github.io/devtools-protocol/tot/Page/). Выводы о detach/reload выше — **из эксперимента**, не предположение по названию CDP API.

## D. Silent clock ошибочно завершает browser playback

**Код:** [SccAudioRuntime.isReady](../../src/audio/scc-audio.ts#L113). `lastPlay` задаётся при запросе, а `duration` приходит из encoded RIFF metadata. Проверка `logicalTick-lastPlay > duration` действует и при настоящем backend: нет условия `this.silent`, нет учёта `context.currentTime`, фактического старта и suspension.

[AUDIO_RUNTIME.md §5.3/§12.3](AUDIO_RUNTIME.md#123-silent-fallback-воспроизводимый-oracle-без-устройства) прямо ограничивает этот oracle отсутствующим устройством. В обычном audio path original ready читает статус buffer. Implementation Contract отдельно запрещает смешивать no-device, mute и autoplay restriction. Комментарий текущего `isReady` переносит silent-правило на обычный playback без такого основания.

**Контролируемые доказательства:** [runtime.json](browser-wav-audit/runtime.json).

- Настоящий `AudioContext` явно suspended, `currentTime=0`. `source.start()` успешен, handle=`playing`, исключения `NotAllowedError` нет. При logical elapsed `1001 ms` и duration `1000 ms` `isReady=true`, хотя ни один audio sample не продвинулся. Fresh boot игры также наблюдался как suspended + playing.
- Запрос WAV удержан неразрешённым fetch Promise. До ответа handle=`pending`, но по тому же clock ready уже true. Явный последующий dispose корректно abort-ит запрос, source не создаётся. Это probe самого audio runtime, **не** утверждение, что текущий ошибочный `SceneView.dispose()` уже умеет его вызывать.

Конкретная cold-start последовательность: запрос → ещё идёт fetch/decode → logical duration истекла → barrier снимается → StartW видит animation inactive и Program продолжает → следующий звук/сценарный переход наступает до фактического начала предыдущего WAV. Поздний результат либо звучит не вовремя/перекрывается, либо должен быть отменён реальным owner cleanup. Сейчас A может уничтожить его даже обычным walk-click, а B позволяет ему пережить scene unload. Обе границы неправильны.

Быстрые взаимодействия увеличивают число pending/replayed requests, а холодный старт увеличивает окно между request и render. Warm cache уменьшает окно, но не исправляет контракт. Suspension после старта тоже не должна превращаться в EOF по игровому времени.

**История:** `7d5d749` по этому deadline ещё и вызывал `playback.stop()` и отбрасывал поздний source. `638bf93` убрал эти две причины преждевременной физической остановки, но сохранил раннее завершение **сценарного барьера**. Поэтому предыдущий диагноз был частично правильным, но исправление не замкнуло модель.

`NotAllowedError`-recovery не заменяет context-state machine. Браузерный `start()` может принять scheduling при suspended context; это видно в эксперименте и соответствует [алгоритму start](https://webaudio.github.io/web-audio-api/#dom-audiobuffersourcenode-start). Успех вызова не означает rendering и не означает слышимость. Unit fake, выбрасывающий `NotAllowedError` из `start()`, моделирует только один выбранный error-path.

## E. Промежуточные кадры теряют звук при catch-up

**Код:** [SceneView.tick](../../src/scene/scene-view.ts#L449) вызывает `updateSoundEvents()` **один раз до** `player.advance(deltaMS)`. В [AnimationPlayer.advance](../../src/animation/player.ts#L106) `while` может пройти несколько кадров. Возвращённые переходы применяются визуально, но звуковые hooks на них не опрашиваются. Следующий RAF видит только конечный cursor. Это не проблема `source.start`: до него код вообще не доходит.

**Реальная definition Level1:** `Walk1`, rate=36, interval=`floor(1000/36)=27 ms`, звуковой event на кадре 2. Два прогона с одинаковым итоговым cursor=4:

- Три шага по 27 ms с опросом hooks на каждом кадре: event 2 создал Voice.
- Один catch-up на 81 ms: player вернул переходы 2,3,4, но следующий poll на frame4 не создал ни одной Voice.

Доказательство: [scheduler.json → skipped](browser-wav-audit/scheduler.json). Использованы отдельные SceneView с реальной загруженной definition; timestep управляется probe, это не замер частоты dropped frames в ручной сессии. Установлена потеря при таком достижимом delta. Нагрузка загрузки/декодирования и реальная машина могут создавать такие кадры; конкретная частота не измерялась.

Пропасть может как end0-effect, так и начало положительного range. Барьер пропущенного range не появится. Простое сканирование «всех пересечённых кадров после advance» недостаточно: sync-range меняет cursor и может запретить продвижение к следующему событию. Event dispatch должен быть внутри последовательного animation stepping.

## F. Все восемь исходных Repeat потеряны парсером

**Код:** [parseFrameSoundEvents](../../src/audio/scc-audio.ts#L42). После разбора `Fram` берётся только `args[count]`, устанавливается `repeat:false`, затем выполняется `continue`. `Repeat` распознаётся только как отдельная строка [строка 53](../../src/audio/scc-audio.ts#L53).

В оригинальном корпусе все 8 директив находятся **на той же строке**: `Fram ... file.wav Repeat`. Это Level3:115/118, Level27:99, Level28:37, Level29:53, Level31:51/54, Level36:89. Пример: `Fram 1 0 1 Mainhero SOUND\scn_28\Eff\Sea.wav Repeat`.

Browser parser проверен на Level3/28/31/36: все соответствующие события имеют `repeat:false`; море/вентилятор/вода/собаки/огонь не становятся настоящими looping sources. Проверка минимальной пары «inline vs отдельная строка» даёт false vs true. См. [repeat.json](browser-wav-audit/repeat.json).

Анимация может иногда повторно запускать one-shot на новом проходе, что маскирует дефект, но это не непрерывный loop: возникают паузы/наложения, нет корректного repeat latch для Stop. Проверка [unit parser fixture](../../tests/scc-audio.test.ts#L311) использует именно отдельную строку и потому пропускает реальный формат корпуса.

Дополнительно `firedEffects` — frame-edge latch, а не Voice-ready predicate: [строки 496–502](../../src/scene/scene-view.ts#L496). Не проверяется готовность уже звучащего end0 Voice; при возвращении на кадр возможен лишний overlapping one-shot. Если Stop/Start события с start1 происходит без наблюдавшегося другого кадра, флаг может остаться от предыдущего запуска и подавить следующий. Это статически выявленная дополнительная проблема rearm; её частота в реальной игре отдельно не измерялась. Исправление только inline `Repeat` её не закрывает.

## G. eventId, Voice и очередной play смешаны

**Код:** [play](../../src/audio/scc-audio.ts#L133) удерживает старую non-repeat Voice в `allVoices`, но `voices.set(event.id,voice)` заменяет единственную доступную через eventId запись. [stop(eventId)](../../src/audio/scc-audio.ts#L227) останавливает только эту последнюю запись. На каждый повторный запуск одного объявления создаются новые Voice/handles; completed записи не удаляются из `allVoices`/`handles` до dispose.

**Воспроизведение:** два play одного eventId → 2 активных реальных source; Stop этого eventId → 1 активный source, первая Voice всё ещё `playing`, вторая `stopped`. [scheduler.json → replay](browser-wav-audit/scheduler.json). Для воспроизводимости использован фиксированный decoded buffer, backend/source/scope настоящие.

Это не запрет полифонии разных событий одного URL. [AUDIO_RUNTIME.md §5.2](AUDIO_RUNTIME.md#52-playreplay--confirmed) различает resource/Voice: повторный play **того же Voice** перезапускает его; другие private Voice могут перекрываться. Shared PCM дополнительно имеет alias-семантику, а разделяемый `AudioBuffer` сам по себе не разделяет playback identity. `638bf93` удалил прежнюю потерю pending occurrence, но заменил её безусловной полифонией одного SCC-объявления. [Unit regression](../../tests/scc-audio.test.ts#L197) теперь фиксирует именно это отклонение.

Следствия: Stop не охватывает всю связанную с событием жизнь, поздние старые загрузки могут стартовать параллельно новым, snapshot скрывает старые Voice, коллекции растут даже после EOF. На cold cache параллельные miss одного URL ещё и отдельно fetch/decode-ятся: [backend.load](../../src/audio/backend.ts#L223) имеет кэш готовых buffers, но не in-flight dedup. Это усилитель нагрузки/гонок, не самостоятельно доказанная причина полного mute.

## Остальные проверенные границы

| Узел | Вывод |
|---|---|
| Имена ресурсов | Нормализуется полный путь/case/slashes, не basename. В проверенных игровых WAV нет HTTP/decode ошибки, объясняющей исчезновение после ходьбы. Все 835 не декодировались в рамках аудита. |
| PCM preparation | [prepare-assets](../../scripts/prepare-assets.mjs#L104) делает отдельные PCM-копии; encoded duration хранится отдельно. Исходные WAV не переписываются. Риски codec при fallback на оригинал остаются, но это не диагноз наблюдённого lifecycle-дефекта. |
| Узкий SCC Stop | [stopAnimation](../../src/scene/scene-view.ts#L424) ищет первый latched event по declaration order. Это правильнее stopAll; обычный unlatched one-shot не обязан остановиться. Но G и потерянный Repeat ломают ownership/latches. |
| Stop во время decode | Текущий `audio.stop(eventId)` abort-ит Voice signal и проверяется после decode; существующая regression покрывает этот путь. Он не доказывает корректность `SceneView.dispose` и повторных eventId. |
| ResourceScope | [scope.play](../../src/audio/backend.ts#L298) отменяет pending и scope.dispose останавливает известные playbacks. Но forwarding внешнего signal снимается сразу после start, не при EOF; публичный handle.stop также не abort-ит pending prepare. Контракт этих API требует уточнения. В основном SCC Stop явный handle.stop компенсирует active-path, поэтому это не объявляется причиной A. |
| Busy click | [pointerDown:583](../../src/scene/scene-view.ts#L583) просто возвращает; native force0 skip первого sync-latch из §7 не реализован. Не исправлять это широким dispose/stopAll. |
| Fault/Speak | Динамические `Fault` Voice и подстановка в общий Speak не реализованы; есть декларативные Sound для конкретных Speak-анимаций. Отсутствие Fault-реплики — отдельная функциональная неполнота, не сетевой сбой существующей Voice. |
| Музыка/видео | [SccRuntime](../../src/scc/runtime.ts#L210): `Smusic` no-op, `SclipW` одноразовый yield. Их звук/барьеры не реализованы; не смешивать с рассматриваемым WAV трактом. |
| Диагностика | [diagnostics](../../src/audio/scc-audio.ts#L180) переименовывает playbackId в voiceId и теряет contextState backend-события. Номера не являются общей identity. `Playback.complete()` вызывается и из stop, но backend пишет `source.onended` в общем onFinish: это не надёжное доказательство естественного EOF. Snapshot показывает только последнюю Voice eventId и глобальное число backend sources. |

## Почему автоматические проверки проходят

Выполнено `pnpm exec vitest run tests/audio-backend.test.ts tests/scc-audio.test.ts tests/animation-player.test.ts`: **37/37 passed**. Это не полный запуск всего suite. Штатный Chromium Level1 interaction E2E также **passed**, несмотря на A и отсутствие звука `Razres` после ходьбы.

- Unit audio tests вызывают `SccAudioRuntime.dispose()` напрямую; scene tests используют fake view. Неправильное место вызова в настоящем `pointerDown`/`SceneView.dispose` между этими тестами не проверяется.
- Fake context обычно `running`; `connect()` пустой. Нет реального destination graph, zero gain и paused audio clock.
- Некоторые тесты прямо требуют `ready=true` у pending browser Voice по logical duration и сохранения двух источников одного eventId. Они закрепляют D/G вместо независимой проверки контракта.
- [E2E проверки pistol/bottle](../../scripts/e2e-browser-level1-interactions.mjs#L159) смотрят увеличение **общего числа** start, а не start конкретного event/resource. Оно может прийти от шагов или Slip.
- Pistol и bottle проверяются **до** первого обычного walk-click. После него hammock проверяется по inventory/state/последнему изображению, но не по audio events. Финальные `starts.length>=2` уже удовлетворены предыдущими действиями.
- E2E по умолчанию намеренно делает выход нулевым, а потом проверяет, что mute установлен. Это lifecycle-тест с немым sink, не тест слышимости.
- Warm pause (по умолчанию 700 ms), последовательные клики с ожиданием states, быстрый локальный сервер и screenshot/wait cadence уменьшают cold/rapid windows. CDP ввод способен разблокировать context так же, как обычный жест; само наличие CDP не доказывает обход autoplay. Профиль и повторные прогоны также отличаются от fresh manual boot.

Ручная игра свободно меняет порядок действий: сначала движение, повторные клики, остановка/перезапуск, ранний выход со сцены, длительная пауза до первого жеста. Именно эти различия пересекают найденные границы; задержка в E2E или ещё один `source.start` assertion их не исправят.

## Архитектурно корректное решение — спецификация, не реализация

1. **Вернуть ownership на реальную границу scene visit.** `SceneView.dispose()` обязан ровно один раз dispose-ить свой audio scope. Click-to-walk отменяет Program/нужный range через отдельную операцию; он не уничтожает scene audio service. После disposal любой новый play обязан возвращать явный terminal disposed/rejected result, не новый pending Voice. `unlock` не «оживляет» уничтоженного владельца.
2. **Развести режимы.** Native-no-device/silent-clock — отдельная реализация готовности. Audible browser backend и обычный mute завершают Voice по фактическому playback/explicit stop/failure; pending fetch/decode и waiting-context не EOF. Положительный диапазон ожидает свой handle, продолжая range-анимацию, а не замораживая всю сцену. Pending ошибки дают явный failure/skip по выбранной policy; неизвестное ожидание не выдаётся за успешное окончание.
3. **Управлять context отдельно от source.** Один session-owned AudioContext, resume из допустимого жеста, явное состояние context/rendering и обработка изменений. `start` = scheduling accepted, не audible started. Не создавать вторую Voice из-за одного resume. Уже запланированные источники suspended context не нуждаются в повторном start того же узла. Наличие nonzero output тоже не гарантирует физические колонки — эти уровни диагностировать отдельно.
4. **Подготовка до активации синхронной анимации.** Разделить prepare/decode и play, заранее готовить нужные сцене WAV либо вводить явное preparing-состояние. Не расходовать длительность реплики на сеть. Не блокировать всё приложение загрузкой всех ресурсов игры. In-flight dedup допустим на resource layer; отмена одного потребителя не должна отменять чужие requests.
5. **Стабильная identity.** Раздельные `sceneVisitId/sceneGeneration`, `animationId/eventId`, stable `voiceId`, `playGeneration` и `playbackId`. Повторный non-repeat play того же Voice применяет определённую restart/replacement policy; старый callback не меняет новый запуск. Другие Voice того же ресурса независимы согласно storage policy; при необходимости точной совместимости отдельно моделировать shared-PCM alias. Все active/pending occurrences имеют владельца и ограниченный lifetime.
6. **Один источник истины о terminal state.** `finished` settles один раз с reason `ended/stopped/replaced/failed/disposed`; Stop отменяет prepare и playback, не только последнее поле map. Generation проверяется после каждого async boundary. Terminal entries и forwarding listeners освобождаются после завершения, а не копятся до конца долгого посещения сцены.
7. **Dispatch по каждому animation step.** Проверять hooks/range ready в том же последовательном цикле, где меняется cursor. Barrier обязан влиять на следующие шаги catch-up. Сохранять declaration order и same-update handoff соседних диапазонов из research; не заменять его post-hoc списком независимых playback calls.
8. **Парсить реальный token stream.** Inline `Repeat` должен модифицировать предшествующий Fram. Перепроверить все восемь исходных объявлений. Effect latch/rearm должен учитывать Voice readiness и Stop/Start, а не только «успели ли увидеть другой кадр».
9. **Явный выходной граф.** Session mixer с наблюдаемыми output/category gain и owned connection до destination позволяет различать playing-but-muted и ожидание context. Mute не должен менять completion семантику. Прототипные E2E-patches в пользовательской вкладке исключить: собственный disposable browser context/target и очистка в finally, включая error-path. Если остаётся инъекция — хранить CDP script identifier, remove, восстановление текущего документа/узлов; одного удаления future script недостаточно.

Это уточнение границ существующих audio backend/scope/scheduler, а не требование переписывать весь движок. Таймаут «чтобы доиграло», forced warm delay и stopAll на каждый клик архитектурной ошибки не устраняют и здесь не предлагаются.

## Приёмочные проверки будущего исправления

1. Чистая unmuted вкладка: floor/walk → object/speech → ещё walk → object. Audio scope остаётся live, каждый ожидаемый eventId даёт правильный WAV, не просто любой start.
2. Переход между сценами с pending decode, one-shot и настоящим Repeat: все old-owned sources/requests terminal, поздние callbacks не звучат и не меняют новую сцену.
3. Управляемый deferred fetch/decode дольше source duration; отдельный suspended/resumed context. До реального окончания/явного skip sync-range не сообщает ложный EOF. Нужны и cold, и cached варианты.
4. Один non-repeat eventId повторяется до ready/во время playback; Stop во всех фазах; distinct events одного URL. Проверить replacement policy и конечное число owned handles.
5. Реальные eight inline Repeat; loop живёт до узкого Stop/scene dispose, после Stop/Start корректно перезапускается. Не добавлять artificial positive-Repeat как замену корпусным cases.
6. Одинаковое animation elapsed разбито на мелкие шаги либо catch-up: одинаковый упорядоченный список sound events и корректный barrier handoff, включая соседние positive ranges.
7. Сигнальный тест: известный nonzero buffer/WAV → source → mixer/gain → output. Измерять pre-mute и post-mute PCM отдельно; не требовать nonzero после намеренного mute. Затем проверить чистую ручную вкладку после успешного **и упавшего** E2E.
8. Непрерывная игра с повторениями: terminal collections/listeners не растут без ограничения; текущая сцена не считает чужие sources своими. Никаких production sleeps для прохождения теста.

## Evidence и воспроизводимость

- [lifecycle.json](browser-wav-audit/lifecycle.json) — snapshots и diagnostics до/после walk и scene switch.
- [e2e-summary.json](browser-wav-audit/e2e-summary.json) — точный успешный штатный E2E, граница dispose, отсутствие последующих sources и `Razres` timer-only completion.
- [graph.json](browser-wav-audit/graph.json) — PCM RMS, gain.value, destination connection, условия detach/reload.
- [runtime.json](browser-wav-audit/runtime.json) — suspended/currentTime и deferred-load fixture.
- [scheduler.json](browser-wav-audit/scheduler.json) — реальные frame hooks и повторный eventId/Stop.
- [repeat.json](browser-wav-audit/repeat.json) — реальные inline объявления и результат текущего парсера.
- [probe.mjs](browser-wav-audit/probe.mjs) — только диагностический harness; приложением не импортируется. Исходный исполненный экземпляр, raw E2E log и screenshots также лежат в `/private/tmp/wav-audit/`; temporary paths не считать долговременным хранилищем.

Для повторения: запустить текущий `pnpm dev --host 127.0.0.1 --port 4173`; отдельный Chrome с `--headless=new --remote-debugging-port=9333 --user-data-dir=<отдельный временный профиль> about:blank`, без autoplay bypass. Создать `/private/tmp/wav-audit`. Запускать `node research/audio/browser-wav-audit/probe.mjs <mode> fresh`, где mode: `lifecycle`, `graph`, `runtime`, `scheduler`, `repeat`. Не направлять harness на пользовательскую вкладку: он намеренно меняет navigation, ввод и тестовую policy. Для штатного E2E использовались `E2E_CDP=http://127.0.0.1:9333` и `E2E_SCREENSHOT_DIR=/private/tmp/wav-audit/screens`.

**Итог:** сначала исправлять A/B и изоляцию C, затем D/E/F/G с единым контрактом состояний и identity. Иначе очередной локальный «source.start теперь проходит» оставит либо тишину на gain, либо уже уничтоженного владельца, либо преждевременно завершённый сценарий.
