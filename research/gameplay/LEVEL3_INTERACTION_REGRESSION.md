# Level3: прерывание StartW оставляет недоступные предметы и повторяет вступление

Дата: 2026-10-19. Исследование, **без изменения production runtime или ресурсов**.
Ветка `research/level3-interaction-regression`, worktree
`/private/tmp/agent-revers-level3-regression`. База — актуальный локальный
`master@141bfed336d4e37cfed3cafb6cd16a0331a47027` (Save/Load UI включён).
Master не переключался, merge не выполнялся. Сеть/upstream для выбора базы не нужны.

## 1. Результат

**CONFIRMED, Chromium + SCC + static EXE:** одна общая причинная цепочка объясняет
три симптома на предоставленном состоянии и в независимом воспроизведении:

```text
Start/Interface Case0 → StartW K_slip → busy=true, Program ждёт
Start/Vent Case0 → Start Ventc → конец другого Program → busy=false [ОШИБКА]
пользовательский клик во время K_slip → cancelActive()
K_slip визуально/по звуку завершается, но отменённый Program не возобновляется
Setxy 720 575 и State Interface 1 не выполняются → Interface остаётся 0
Click 0 {Plocat,Iach_click,Stool} Interface → Case1 отсутствует для state0
Save сохраняет state0; Load/обычный re-entry отправляет Start → K_slip снова
```

Первый неверный этап **при возникновении дефекта** — запись `busy=false` в конце
постороннего Program. Первый неверный результат **последующего pickup-клика** —
выбор Case: объект найден, handler зарегистрирован, но `Interface=0`, а есть только
`Case 1`. До Goto/StartW/Addtol дело не доходит. Это не поломка inventory mutation.

**CONFIRMED:** если не кликать во время первого вступления, на текущем master
`Interface=1`, все три предмета доступны. Проверено также после настоящего SCC
перехода `Level4 → Level3`, после Save/Load и возврата `3 → 4 → 3`.

**CONFIRMED:** тот же отказ с кликом и успешный контроль без клика воспроизведены
на `d910b1d`, до WAV/SCC архитектурных дополнений, case-insensitive binding и всего
Save/Load. **Новый регрессионный коммит не установлен.** Ошибочная строка введена
уже в корневом `111fe31`; на нём самом Level3 не входит в загружаемый каталог.
Нельзя выдавать это за доказанное «новая архитектура сломала ранее исправный код».

**UNKNOWN:** точный момент/координата исторического клика пользователя.
Сейв доказывает сохранённый state0, а независимый браузерный эксперимент — способ
его получить; сам JSON не содержит истории ввода.

## 2. Источники и уровни доказательств

- **CONFIRMED** — прочитанные SCC/MULT/EXE или непосредственно записанное Chromium
  поведение; static EXE явно отделён от исполнения браузера.
- **DERIVED** — следствие установленного control/data flow, не Windows trace.
- **HYPOTHESIS** — кандидат без проверки достижимости/динамического воспроизведения.
- **UNKNOWN** — не установленное данным исследованием.

Прочитаны `IMPLEMENTATION_STATUS`, `SAVE_LOAD_RUNTIME`, `LEVEL21_LADDER_BUG`,
`OBJECT_DEPTH`, `COLUMN_ORDER`, `SCC_RUNTIME`, `SCC_MASK_INPUT`,
`SCC_VISIBILITY_INIT`, контракты анимаций/Block/Fclick из Basic Memory.
`Level3.scc` прочитан полностью вместе с `cursor.scc`, `mainhero.scc`, `step2.scc`;
в этих трёх Inc нет следующего уровня Inc. SHA-256 и include closure:
[evidence/scc-source-facts.json](evidence/level3-regression/scc-source-facts.json).

Chromium — отдельный headless Google Chrome, CDP `9383`, чистый профиль
`/private/tmp/agent-level3-chromium`, оригинальные подготовленные ресурсы. Реальный
Web Audio, `--autoplay-policy=no-user-gesture-required`, **без E2E mute**. Каждая
независимая ветка начинает с reload; localStorage-сохранения не используются.
Зависимости/подготовленные ресурсы доступны через symlink на основной worktree;
оригиналы не менялись. Изменения старых ревизий не накладывались поверх нового src.

## 3. Точные объекты и подбор

Все три — **Object**, не Active/Light. Все handlers имеют selected item **0**,
проверяют **Interface**, единственный `Case 1`. Никакой предмет в руке не нужен.
Имена установлены по SCC, MULT и исходным TIF/анимациям, не переводом названий.

| Предмет | SCC declaration | Начальное изображение | Результат |
|---|---|---|---|
| Мемориальная табличка | `Object Plocat 6 100` | `Startlevel` frame1 slot1 child8; `Tzu\Scn_03\Plocat\S0\PLOCATM.tif` | item8 |
| Гаечный ключ (подбор из ящика) | `Object Iach_click 6 100` | `Startlevel` frame1 slot1 child6; `Tzu\Scn_03\Iach_click\S0\Stat1.tif` | item9 |
| Табуретка | `Object Stool 6 900` | `Startlevel1` frame1 slot1 child0, внутренний MULT bitmap | item10 |

`Iachik` — отдельный ящик cursor0/depth110, `Per_iach` — передняя часть depth95;
ни один из них не заменяет pickup identity `Iach_click`.
`Caption`, `Stat_m`, `Stat_big` — отдельные Active, **не** подбираемая табличка.

Оригинальные handlers (`Level3.scc:408–437`):

```text
Click 0 Iach_click Interface
{
  Case 1
    Goto 470 540
    StartW take_k
    Setxy 475 550
    Addtol 9
  Break
}
Click 0 Plocat Interface
{
  Case 1
    Goto 910 460
    StartW K_ploc
    Setxy 910 480
    Addtol 8
  Break
}
Click 0 Stool Interface
{
   Case 1
    Goto 1038 560
    StartW K_stool
    Setxy 1035 560
    Addtol 10
  Break
}
```

**CONFIRMED:** в этих handlers нет `Hide`, `State` или ручной блокировки.
Исчезновение обеспечивает назначение пустого bitmap из MULT: `K_ploc` frame13,
`take_k` frame34, `K_stool` frame9. Последняя ссылка на MULT остаётся, но изображение
имеет размер 0×0 и sprite становится invisible/removed; это **не** SCC State=1.
`take_k` дополнительно выполняет `Fram 1 -1 1 Iach_click 5`, т.е. depth100→5,
не State. Повторный подбор предотвращает отсутствие изображения, не смена Case.

Появление не требует Water/Lora/Lec_v или других сюжетных состояний: Init/Interface
Case0 запускает `Start Startlevel`, `Start Startlevel1`, `Setmap 1`, показывает
Active. Отдельного `Show` для этих Object нет и не нужно. При возврате Init не
повторяется, сохраняются последние MULT/image/visibility. Неподобранные объекты
сохраняют свои исходные изображения; подобранные — пустые кадры.

**DERIVED из SCC, подтверждено Chromium:** после нормального конца вступления
все три доступны сразу. Порядок табличка → ключ → табуретка допустим.

## 4. Init, Start и монолог

`cursor.scc` объявляет `Object Interface 0 0`, State по умолчанию 0.
`initialized` сцены — другой флаг: он не заменяет SCC `Interface.state`.

```text
Click 0 Start Interface
{
  Case 0
    Smusic 1 7.mp3
    StartW K_slip
    Setxy 720 575
    State Interface 1
  Break
  Case 1
    Smusic 1 4.mp3
  Break
}
Click 0 Start Vent
{
  Case 0
    Start Ventc
  Break
}
```

**CONFIRMED:** `K_slip = XSH\SCN_03\step_06.mult`, Anim8, 53 кадра;
задействованы `Mainhero`, `Main_creslo`, `Kreslo`. Sound: frame23 fire-and-forget
`konst\019.wav`, frame35 шаг, frame41–41 синхронная реплика `konst\001.wav`.
Завершение — окончание MULT с учётом его кадрового аудиобарьера, затем poll
StartW, Setxy, State. Нет `Block` и нет `Fclick` у вступления. **Отсутствие Block
не разрешает движение: StartW сам устанавливает scene busy.**

Прочие Start handlers Level3:

- Vent0 → `Start Ventc` (ambient Animc25). Именно его конец преждевременно снимает busy.
- Lora4 → Setmsk, Objzet, StartW Lora_c1, Block, Goto, StartW Talke_lora,
  Setxy, Ublock, StartW Lora_out, State Lora5; Lora5 → Hide Lora.
- Lec_v2 → Cursor2; Lec_v3 → Hide Mainhero, StartW Vniz, Setxy130/570,
  State Lec_v2; Lec_v5 → Cursor0.
- Water1 → Start Watc, StartW Lora_s, Start Lora_c.

Первый прямой вход: Init один раз, Interface0, Water0, Lora0, Lec_v0; после
непрерванного K_slip — Interface1 и hero720/575, остальные перечисленные State
не изменяются. После портала из Level4 дополнительно приходит `Lstate Lec_v 3 3`,
поэтому одновременно запускается Vniz; после завершения Lec_v2, Interface1.
Это отличающее условие входа сохранено в `natural-early/complete.json`.

## 5. Chromium: воспроизведение и hit-testing

### 5.1. Полная цепочка клика

[evidence/failed-pickups-trace.json](evidence/level3-regression/failed-pickups-trace.json)
содержит Browser `pointerdown`/client coordinates → `SceneView.pointerDown`
logical screen → `scc.click(name,0)` → `dispatch(name,0)=false`, inventory без изменений.
[evidence/failed-pickups.json](evidence/level3-regression/failed-pickups.json)
содержит world coordinates, все перекрытия, зарегистрированные handlers/Case,
полные State и состояния Program/Animation после каждого клика.

Одинаковые direct-entry точки при scroll500:

| Identity | World | Screen | Фактический выбранный hit | Dispatch при Interface0 |
|---|---|---|---|---|
| Plocat | 870,321 | 370,321 | Plocat | false, Case1 не выбран |
| Iach_click | 544,516 | 44,516 | Iach_click; за ним Iachik110 | false, Case1 не выбран |
| Stool | 977,479 | 477,479 | Stool | false, Case1 не выбран |

Browser event target — CANVAS; UI сцену не перехватывает, selectedItem0,
blocked=false, после отменённого вступления busy=false и нет активного Program.
Координаты в CDP пересчитываются из фактического CSS canvas rect и обратно в
800×600; worldX=screenX+scrollX ровно один раз.

| Identity | Sprite center | Width×height | RGBA hit mask bytes | Depth | Painter index в failed fixture |
|---|---|---|---|---|---|
| Plocat | 869.9001,320.7000 | 77×39 | 12012 | 100 | 7 |
| Iach_click | 559.4000,515.2801 | 80×50 | 16000 | 100 | 6 |
| Stool | 976.8501,479.4000 | 60×137 | 32880 | 900 | 2 |

У всех sprite exists=true, visible=true, removed=false, parent=world;
поля declarations/MULT identity совпадают. Painter index — наблюдение данного
состояния, не постоянная нативная характеристика. До/после lifecycle нет утраты
ресурса, имени или depth. Полные значения — в JSON, без округления таблицы.

Пиксельный аудит всех непрозрачных точек этих спрайтов:

- Plocat: 2700 точек выбирают Plocat, 303 — Per_ploc.
- Iach_click: 876 выбирают Iach_click, 204 — Active Forma.
- Stool: 2502 выбирают Stool.

**CONFIRMED:** Active-first действительно перехватывает часть ключа. Его depth190
в EXE уступает Iach_click100 при общем reverse-painter hit-test. Это отдельное
известное архитектурное отличие, но **не первопричина отказа всех трёх**: указанные
точки не перекрываются Active и доходят до правильных SCC handlers. Полную замену
hit-testing для этого исправления делать не нужно. Нативные адреса/общий список —
`SCC_RUNTIME`, `OBJECT_DEPTH`: `0x40a238`, comparator `0x40a4ac`, base pixel-test
`0x40445c`, Active rect-test `0x404c50`. Новый реверс этого механизма не требовался.

### 5.2. Контрольные ветки

- **CONFIRMED, direct debug:** без кликов до Interface1 → pickups item8/9/10;
  с реальным canvas-кликом world1090/580 спустя 1s → движение до1094/576,
  Program K_slip отменён, визуальная анимация доигрывает, Interface0 навсегда до
  следующего Start. Потом все три настоящих клика отказывают.
- **CONFIRMED, SCC portal:** debug используется только для выбора соседнего
  Level4. Затем обычный Active `To3` → `Goport 0; Lstate Lec_v 3 3; Level 3 1`.
  После окончания программ все pickups срабатывают; повторные клики оставляют
  inventory `[8,9,10]`. Далее сохранение/загрузка и настоящие Lec_v/To3 переходы
  `3→4→3` сохраняют inventory и пустые изображения.
- **CONFIRMED, user snapshot:** импорт неизменённого совместимого payload успешен;
  initialized=true/Interface0 восстановлены, Init не отправлен; Start запускает
  K_slip. Если больше не кликать, Interface становится1 и pickups работают.
- **UNKNOWN, полный сюжет New Game→Level3:** не пройден. Соседний портал проверен,
  но не подменяет полный сюжетный путь через Level38. Попытка прямого предшественника
  Level2 не дала кликабельного Door в свежем состоянии (`natural-predecessor.json`);
  его дальнейшая механика не исправлялась. Маршрут через Level38 требует сюжетных
  предусловий и связан с отдельным уже документированным To_38-блокером; Level44
  здесь не изменялся и не исследовался заново.

## 6. Save/Load и повтор K_slip

Исходный envelope: [user-save.json](evidence/level3-regression/user-save.json),
label «Сохранение», createdAt `2026-10-19T17:55:50.395Z`, contentId
`sha256:0da15d45c7419d56a3ab5310ea4a7b1d531dda44edc2c6a6bf499014c66b447c`.
В Level3 уже **initialized=true, Interface0**, hero659/562 direction4 navigation,
inventory `[4,3,6,5]`, Water1, Lec_v1, Prosn3. Образы трёх pickup Object назначены
и visible=true; `Kreslo/Main_creslo` содержат поздние кадры K_slip. Сам файл
проходит текущую валидацию. Полный исходный JSON сохранён, оригинал в Downloads
не изменялся.

| Сценарий | Init | State при Start | K_slip | Результат |
|---|---|---|---|---|
| Первый вход без вмешательства | да | Interface0 | да | Interface1, pickups доступны |
| Возврат здоровой сцены | нет | Interface1 | нет | музыка4, предметы не воскресают |
| Load здорового snapshot | нет | Interface1 | нет | inventory/image/initialized сохранены |
| Возврат прерванной сцены | нет | Interface0 | да | ожидаемый SCC Case0 |
| Load пользовательского snapshot | нет | Interface0 | да | после нормального завершения Interface1 |

**CONFIRMED:** это не повтор Init, не потеря initialized, не стирание State в
`declareObject` и не восстановление Program/PC. Restore сперва сохраняет MULT
references/видимость/hero, затем штатно вызывает `dispatchStart`; Start может
сознательно заменить героя и запустить анимации. Именно это видно в
`user-restore-immediate.json` и `user-restore-complete.json`. Разница hero direction
на restore связана с текущим Stop0-navigation восстановлением; она не объясняет
Interface0 и не входит в это исправление.

**DERIVED, EXE/SCC:** при сохранённом Interface0 повтор вступления соответствует
оригинальному load→Start контракту (`SAVE_LOAD_RUNTIME` §6). При здоровом
Interface1 повторять K_slip не следует — и Chromium этого не делает.
Нельзя отключать Start при загрузке, насильно выставлять Interface1 или добавлять
Level3 migration в SaveCodec. Это скрывает первичный дефект и ломает оригинальные
Start-сценарии других сцен. Возможная ручная реабилитация старых повреждённых
сейвов — отдельное решение, здесь не реализовано.

## 7. Сопоставление с Agent.exe

REA/Ghidra12.1.4, Agent.exe SHA-256
`71065c571a9cd40f460458d766720c0a01954e0bef521aad675b4ea6b3186e85`.
Windows-процесс не запускался; ниже **CONFIRMED static**, не его dynamic trace.

Повторно проверена именно неоднозначная ветка завершения Program:

- `0x405e5c`, StartW opcode1: первый вход ставит Program waiting и scene+0x709=1;
  пока anim+0xbb9!=0, yield; после конца анимации scene+0x709=0 и waiting=0.
- **`0x4065d9` пишет Program+0x29e4=0, `0x4065e0` пишет Program+0x29e6=0.
  Никакой записи scene+0x709=0 в generic end-of-Program нет.**
- `0x408d58` отменяет active Program, не останавливает MULT-анимацию. Поэтому
  окончание картинки само по себе не доказывает исполнение State после StartW.
- `0x40a238` при busy не делает обычный dispatch/click-to-walk; допускает лишь
  узкую попытку прерывания синхронного аудиодиапазона `0x404ff4`. Это не команда
  отмены SCC-продолжения и не выдача нового маршрута.

Нормализованный псевдокод различия:

```text
native ordinary Program end: program.active=0; program.executionMode=0; return
browser ordinary Program end: program.active=false; program.waiting=false;
                              scene.busy=false; return   // лишняя запись
```

Новые raw Evidence: [exe-0.json](evidence/level3-regression/exe-0.json)
(`ev_053e3e9264357f62810b921446a7409489736f18916947a12980309533a8e693`),
[exe-1.json](evidence/level3-regression/exe-1.json)
(`ev_ac02c628bdcf3f33c5d47d650d983929620581baa6877da38bdcc490d2808e72`),
[executor-assembly.json](evidence/level3-regression/executor-assembly.json)
(`ev_6705e7595bb6201ad8a44866d85c503968d5bd9b2ac6f20db7316bc74277a365`).

[busy-writer-trace.json](evidence/level3-regression/busy-writer-trace.json)
показывает в браузере ровно два перехода: false→true в Start/Interface на K_slip,
затем true→false в списке `[Start Ventc]`, при живом ожидающем Program K_slip.
Обёртка run установлена только в памяти вкладки для логирования.

## 8. Git: проверенные ревизии

Исходный поиск: `git log --oneline --all -- src/scene`; сохранён
[git-scene-log.txt](evidence/level3-regression/git-scene-log.txt).
Просмотрены изменения `7c76122`, `a3c6442`, `cc235b3`, `5c4a39a`, input/Fclick
`43d20c0`, ранний runtime. Generic-end строка не менялась после `111fe31`.

| Ревизия | Chromium: no-click контроль | Chromium: один клик во вступлении |
|---|---|---|
| `d910b1d97207c8112c50e5d9e64ee890ecaf6ba2` | Interface1, inventory8/9/10 | Interface0, три dispatch=false |
| `141bfed336d4e37cfed3cafb6cd16a0331a47027` | Interface1, inventory8/9/10 | Interface0, три dispatch=false |

Одинаковые original resources, прямой свежий вход, клик world1090/580 через1s,
три pickup точки из §5, отсутствие localStorage; для каждой ветки reload.
Результаты: [history-d910b1d.json](evidence/level3-regression/history-d910b1d.json),
[history-141bfed.json](evidence/level3-regression/history-141bfed.json).
Старый runtime экспонирован диагностической prototype-обёрткой, исходники старого
worktree не редактировались. `status().busy` на старой версии не экспортируется;
`programs` и прямой `scc.busy` доступны для наблюдения.

`git blame src/scc/runtime.ts:266` указывает на корневой
`111fe3111cc9e8419516f7eab2aa6da1497efb49`. **CONFIRMED source introduction**, но
не доказанный новый regression boundary: Level3 ещё отсутствовал в его каталоге.
Ранее работавшая ревизия при тех же условиях не найдена, валидного good/bad
диапазона для bisect нет. Успех старой версии без клика не является good-границей
для новой версии с кликом. Новые Save/Load коммиты причиной этой записи не являются.

## 9. Минимальная спецификация исправления для Luna

**Доказанный scope:** `src/scc/runtime.ts`, `SccRuntime.run`, ветка `!command`
(на базе исследования строка266).

1. Удалить **только** безусловный `this.busy=false` при обычном достижении конца
   Program. Завершать свой Program, не менять input-busy другого StartW.
2. Сохранить установку/снятие busy в ветке StartW согласно EXE; scene cleanup и
   cancelActive — по их существующим контрактам. Не превращать все active Programs
   или Goto в блокировку ввода.
3. Не заменять нативный global byte рефкаунтером/автоматическим `some(waiting)`
   без отдельного исследования нескольких конкурирующих StartW. Эта задача
   доказывает лишнюю запись generic end, не новую модель приоритетов scheduler.
4. Не править SceneView hit-testing, SCC/ресурсы, Init/Start порядок, save DTO,
   declareObject, visibility или inventory в качестве обхода.
5. Не добавлять Level3-условий и принудительный `State Interface 1`.

**DERIVED:** после устранения этой записи Vent не откроет ввод во время K_slip;
случайный пользовательский клик не отменит Program. По завершении StartW
исполнится State Interface1, поэтому исчезнут и постоянный отказ pickups, и
повтор K_slip у новых корректно созданных сохранений. Реализация ещё не сделана;
этот post-fix результат должен подтвердить Luna, не считать его уже проверенным.

Узкое игнорирование busy-кликов в текущем SceneView отличается от нативного
аудио-skip пути; **не требуется** реализовывать аудио-skip ради этого исправления.
Нельзя «починить монолог» просто запретом всех кликов при любых SCC programs:
во время обычного Goto замена маршрута/Program в оригинале допустима.

## 10. Масштаб: аудит всех 47 сцен

[scene-audit.json](evidence/level3-regression/scene-audit.json), скрипт
`diagnostics/level3/audit.mjs`, разбирает все оригинальные Level*.scc текущим
parser, сохраняет порядок и программы Start. Выделяет пары: более ранний
Start-handler с StartW и более поздний handler с веткой, завершающейся без
Goto/Goport/StartW/SclipW. Такой завершающийся список способен перезаписать busy.

**HYPOTHESIS / условные кандидаты:** Level2,3,5,7,8,14,16,18,19,24,25,32,37,44
(14 сцен, из них13 помимо Level3). Достижимость комбинаций State в этих сценах
не доказана автоматически; в JSON есть точные waiter/finisher/state пары.
Level3 Interface0/Vent0 — **CONFIRMED** динамически. Level44 здесь лишь результат
статического поиска, не расследование To_38. Остальные33 сцены не объявляются
«безопасными»: Fclick, перекрывающиеся Init/Start и другие event combinations
выходят за критерий этого узкого статического фильтра.

## 11. Требования регрессионных проверок Luna

Минимальная unit-регрессия scheduler (не копия реализации): реальный порядок
двух handlers одного Start — первый `StartW A; State checkpoint 1`, второй
`Start ambient`. После dispatch A active, checkpoint0, **busy=true** несмотря
на завершение второго Program. После finish A + tick → checkpoint1, busy=false.
Отдельно завершить невладеющий Program во время ожидания A; обычный Goto должен
по-прежнему допускать замену пользовательским кликом. Не тестировать только
наличие вызова startAnimation: это пропустит потерянный State.

Chromium E2E с оригинальными ресурсами:

1. Чистое состояние/профиль. Войти в Level3 как минимум через соседний настоящий
   портал; отдельная direct-entry ветка нужна для точного Interface0/Vent0.
2. В начале K_slip послать реальный canvas-клик по проходимой точке world1090/580.
   Проверить: нет пользовательского маршрута, Program всё ещё active/waiting,
   state0, busy сохраняется. Не требовать неизменного sprite.x: его двигает MULT.
3. Дождаться **Program completion**, не только конца звука/изображения:
   Interface1, State-команда реально исполнена, busy=false, no pending SCC.
4. Реальный клик Plocat (world870/321 с актуальным scroll). Проверить
   handler/event, item0, stateObject Interface1, выбран Case1, Goto, StartW K_ploc,
   пустой frame13, Addtol8, один item8.
5. Аналогично Iach_click в неперекрытой точке544/516 → take_k, depth5,
   пустой frame34, Addtol9; Stool977/479 → K_stool, пустой frame9, Addtol10.
   Координаты при другой позе/камере пересчитать и подтвердить hit, не обходить его.
6. После каждого подбора снова кликнуть по прежней мировой точке. Инвентарь
   не увеличивается, pickup event не исполняется второй раз. Не требовать
   отсутствия любого другого взаимодействия: там может быть фон/другой объект.
7. Safe-save gate дождаться после окончания конечного Stop animation. Snapshot:
   initialized=true, Interface1, inventory содержит каждый8/9/10 ровно один раз,
   три image.kind=mult с нулевыми кадрами и visible=false. **Не** ожидать image=empty:
   это Hide-семантика, не данные этих подборов.
8. Export/import через реальный Save/Load UI, затем после reload F3: тот же
   результат, Init не повторён, K_slip не запущен, герой восстановлен.
9. Настоящие `Lec_v → Level4 → To3 → Level3`; проверить сохранность предметов,
   invisible zero-image, Interface1, отсутствие повторного вступления. Vniz,
   зависящий от Lec_v3 при возврате, не путать с K_slip.
10. Соседи Level4 и Level2/38 должны грузиться и сохранять свои Start/Init/State
    контракты. Запустить существующие interaction/transition/SaveLoad E2E и
    целевой concurrency-кейс из аудита. Не лечить сторонние механики попутно.
11. Отдельная old-save fixture с Interface0: Load **должен** запустить K_slip;
    клик не отменяет checkpoint continuation; после завершения Interface1.
    Это защищает штатный Start при restore от ошибочного удаления.

Скрипты исследования уже проверили реальные pickups/repeat/persistence на здоровой
ветке, но post-fix busy-тесты в текущем master закономерно воспроизводят дефект.
Production unit-suite/build не запускались: production-код не менялся.

## 12. Артефакты и остаточные ограничения

Все данные: [evidence/level3-regression](evidence/level3-regression/).
Скриншоты clean-entry/interrupted/user-restore/all-items/natural-all-items
дополняют JSON; диагностическая надпись местами перекрывает графику, поэтому
доказательство dispatch основано на pointer/state/handler logs, а не картинке.
Воспроизводимые команды: [diagnostics README](diagnostics/level3/README.md).

**UNKNOWN:** точная историческая последовательность ввода пользователя,
good-ревизия при идентичных условиях, полный New Game→Level38→Level3 walkthrough,
динамическая Windows-трасса, достижимость всех статических audit candidates.
Это не препятствует точному исправлению доказанной лишней записи в scheduler.

Basic Memory синхронизирована: дополнен существующий `SCC_RUNTIME` проекта
`agent-reverse`; отдельная дублирующая заметка не создавалась.
