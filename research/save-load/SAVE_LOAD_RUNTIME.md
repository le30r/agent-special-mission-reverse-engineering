# Save/Load: оригинальная семантика и спецификация браузерной сессии

Дата: 2026-10-19. Исследовательская ветка: `research/save-load-exe`.
База — **локальный** master `fc200d71f67b2e0b04c3feaa70e03f0093298859`, по уточнению пользователя; upstream не подтягивался. Старое решение Luna / `research/save-load-runtime` не использовано.

## 1. Результат и достоверность

**CONFIRMED, static EXE:** оригинал сохраняет **данные мира и последние визуальные назначения объектов**, а не работающую виртуальную машину SCC. В файл входят инвентарь, карта, номер активной сцены, все 50 сценовых записей с объектами, включая ещё не посещённые сцены с `Lstate` placeholders. Не входят Program/PC/wait, маршруты, часы анимаций, активные аудио/видео handles, выбранный предмет или Portal index.

**CONFIRMED:** F2 = Save, F3 = Load. При `StartW` обе клавиши не открывают меню: общий вход проверяет `scene+0x709`. `Goto` этот busy не выставляет: сохранить во время подхода можно, если другие условия допуска соблюдены. Меню замораживает сценовый update, но не доводит сценарий до конца. После Load старый подход/обработчик **не продолжается**. Неблокирующий `Start`/`Fclick` тоже не запрещает Save автоматически.

**CONFIRMED:** Load восстанавливает объекты, пересобирает runtime активной сцены, **не повторяет Init посещённой сцены**, но **отправляет Start заново**. Для обычной сохранённой позиции ставит **Stop0**, а не сохранённое направление. Инициализация картинки и исполнение анимации — разные операции: последнее изображение предмета сохраняется без часов породившей его анимации.

**Предложение для браузера, не факт об оригинале:** разрешать ручной Save только на безопасной границе без активных Programs, движения и незавершённых сюжетных one-shot/Fclick. Это строже оригинала и предотвращает потерю хвоста действия. Формат — JSON V1, шесть ручных слотов localStorage; Load — отдельный путь восстановления, не `request(scene, portal)`.

Метки в документе:

- **CONFIRMED** — непосредственно инструкции EXE, оригинальный SCC или прочитанный TypeScript на базе выше. Не означает запуск Windows-игры.
- **DERIVED** — связанный вывод из этих наблюдений при указанных условиях.
- **HYPOTHESIS** — недоказанная интерпретация, не контракт реализации.
- **UNKNOWN** — данных недостаточно; не заменяется предположением.
- **SPEC** — выбранное требование будущей реализации браузера, а не восстановленный факт.

Исследован `agent-original/game-installed/Program_Executable_Files/Agent.exe`, PE32/x86, SHA-256:
`71065c571a9cd40f460458d766720c0a01954e0bef521aad675b4ea6b3186e85`.
REA, provider Ghidra **12.1.4**, профиль `4f6212bfe31448a7b96743a449e91c35890105cedd34e1d9951e9467d284e0a5`. Адреса — VA при image base `0x400000`.

Оригинальный процесс не запускался; настоящих `.sav` в установленном корпусе нет. Формат ниже восстановлен по **обеим** сторонам I/O и vtable dispatch, не по сгенерированному нами файлу. Production, оригинальные ресурсы и UI не изменены; To_38 не исследовался.

### Источники

Сначала прочитаны Basic Memory `agent-reverse`: recent activity, SCC_RUNTIME, SCENE_STATE_CONTRACTS, поиск Save/Load; затем Git: SCC_RUNTIME, SCC_VISIBILITY_INIT, SCENE_TRANSITIONS, SCC_MASK_INPUT, SCC_MAP_MISC, SCC_FAULT_EVENTS, INVENTORY_COMBINATION_RUNTIME, LEVEL21_LADDER_BUG, LORA_INTERACTION_BLOCKER и текущий `src/`.

Первичные материалы этого исследования:

- [EXE_EXCERPTS.md](evidence/EXE_EXCERPTS.md) — псевдокод ключевых функций и критическая assembly, REA Evidence IDs.
- `evidence/native-evidence.json` — полные сохранённые ответы REA с digest, профилем и ограничениями. Ошибочные селекторы, если встречаются в batch, явно имеют status=error и не доказывают поведение.
- [SCC_START_HANDLERS.md](evidence/SCC_START_HANDLERS.md) — **138** Start-handler в **47** оригинальных Level SCC, с номерами строк; 43 содержат команды изменения постоянных данных. Это статическая инвентаризация, не трасса выполнения.
- `evidence/scc-sha256.json` — хеши этих SCC. Отсутствуют Level9/49/50, но EXE выделяет 50 сценовых структур.
- [SELECTOR_EXCERPT.md](evidence/SELECTOR_EXCERPT.md) — адресная выдержка парсера условного include и backup/restore opcodes, поясняющая два native selector scalar.

Git — источник спецификации; Basic Memory — краткий поисковый индекс. Старая запись индекса от Luna заменена проверенными результатами, новая дублирующая заметка не создаётся.

## 2. Адресный маршрут оригинала

Имена ролей ниже аналитические: исходных C++ символов у игры нет.

| Роль | Адрес | Связи / доказанный смысл |
|---|---|---|
| Window procedure / горячие клавиши | `0x40f204` | WM_KEYDOWN=0x100; 0x71 → `0x40d0b4(UI,1)`, 0x72 → `(UI,0)`; активное видео перехватывает клавишу |
| Открыть Save/Load | `0x40d0b4` | условия допуска → перечитать подписи слотов `0x40cefc` → UI mode 4 Save / 3 Load |
| Главное меню | `0x40e200` | пункт 0 → NewGame; 1 → Load; 2 → Save; те же функции, не обход busy |
| Прочитать подписи шести файлов | `0x40cefc` | цикл slot=0..5, читает первые 80 байт; при отсутствии подпись «- Здесь пусто -» |
| Выбрать Save slot | `0x40e6e0` | mode4 → mode6, копия имени в поле редактирования |
| Редактирование имени / Enter | `0x40cf8c` | непустое имя, максимум 15 введённых байт → writer; Escape возвращает список |
| Подтверждение Save мышью | `0x40e4f8` | тот же writer, возврат в mode0 |
| Записать файл | `0x40c8bc` | fopen wb → label → inventory → map → activeLevel → все scenes → fclose |
| Подтверждение Load | `0x40e838` | `0x40c7c4(UI,slot)`; -1 — остаётся в меню, 0 — игровой mode0 |
| Прочитать и восстановить игру | `0x40c7c4` | fopen rb → cleanup старого visit → seek80 → данные → load active scene с mode=0 |
| Scene serialize / deserialize | `0x407d44` / `0x407e14` | scene header, тип каждого объекта, virtual save/load; после чтения найти Mainhero |
| Base Object deserialize / serialize | `0x40422c` / `0x404318` | 548 байт базовых полей |
| Active deserialize / serialize | `0x404ce8` / `0x404d2c` | base + rect16 + visible1 |
| Light deserialize / serialize | `0x403e70` / `0x403ef0` | base + четыре int + visible1 |
| Inventory serialize / deserialize | `0x40ebd0` / `0x40ebb4` | 100×int, не рецепт-таблица |
| Map serialize / deserialize | `0x40d220` / `0x40d250` | банк int и 14 int доступности |
| Уничтожить visit | `0x4089cc → 0x407c14` | handlers/Programs, animations/events/voices, фон/nav/cache; объекты оставляет до reader |
| Загрузить активный SCC | `0x407ffc` | parse → preload → Init если впервые → placement → Start → Arrow → initialized=1 |
| Преподготовка ресурсов объектов | `0x4083bc → 0x408420` | preload сохранённых MULT names и ссылок Program |
| Общие анимации/ресурсы | `0x4084c0`, `0x4081c8` | Walk/Stop/Mstop, Speak, Arrow; синтетический Fault handler |
| Поставить героя | `0x40868c(scene,xy,dir)` | Stop dir → корректировать xy → depth/scale/transform → camera clamp |
| Новая игра | `0x40c6e4` | reset inventory/map, unload visit, удалить сцены, создать 50 новых → Level1, mode1 |
| Конструктор UI / число сцен | `0x40c5a4`, caller `0x40f5e8` | передано 0x32=50; count хранится в UI+0 |
| Scene constructor | `0x407a80` | size0x772, initialized0, selector0, portal -1, scroll0, runtime fields0 |
| File API | `0x438bb4`, `0x439004`, `0x438e28`, `0x438f04`, `0x43858c` | fopen, **fwrite**, **fread**, fseek, fclose |

### Исправление прежнего исследования

**CONFIRMED:** в SCC_VISIBILITY_INIT были перепутаны Save и Load адреса объектов. `0x438e28` — **чтение**, `0x439004` — **запись**. Это видно из rb/wb вызывающих путей и копирования buffer→destination в `0x438cf8` против source→stream в `0x438c1c`.

Верно: **Object save `0x404318`, load `0x40422c`; Active save `0x404d2c`, load `0x404ce8`**. Наличие сериализации visible/MULT в прежнем выводе верно, ошибочно только направление. В этом worktree Git-документ исправлен, Basic Memory синхронизирована.

Ключевые Evidence IDs:

| Материал | ID |
|---|---|
| Core scene/Load/NewGame/Object псевдокод | `ev_811b6cd793aa55c25369d67fd69884a8801e1365b488adf59c157e4f03e2a518` |
| Writer/Object/UI псевдокод | `ev_007343f8edabb3e4751856d5c45411e501130df914535926d6195fc0b23a63d9` |
| Writer dossier / два callers | `ev_e33aefc94fcaa484e5f963d7555ae33dfab59eadfdf118da240d886bd2b7a940` |
| Gate dossier / два callers | `ev_eba821163ee90a5362939856f4693ba43662554d4e88d4ca8b2f2a6bca39c2e8` |
| Scene header writer assembly | `ev_3fbebb517cad8cacd588c2eaf819f6d5b8aee7b1760ca37c742fcf5bd9d7718f` |
| Loader / принудительный dir=0 | `ev_005a2130bf5a8cae7ade721a26280a4a113fc6a0921f8f458f234453fc19ffe9` |
| Placement / потерянный Ghidra третий аргумент | `ev_d9c65754b25036170307a83d372f03b5329ab2a3511779fb1dd4740519eef0a5` |
| rb/wb, slot%d.sav, пустая подпись | `ev_2cf67139afe6b4ccec539159294395eeb55e83b3ad9383b6eac197b6928317e8` |
| Vtables / virtual I/O slots | `ev_958e9028fd4f46146f80dba0fec21fc4e7629d3d578401aa9c3c35ad88fddb75` |

## 3. Жизненный цикл Save и момент снимка

### 3.1. Допуск — CONFIRMED

Нормализованный полный predicate `0x40d0b4`:

```c
openSaveLoad(UI, save) {
  if (UI.mode == 3 || UI.mode == 4 || UI.mode == 7) return;
  if (save == 1 && !UI.gameStarted) return; // UI+0xc
  if (activeScene && activeScene.busy709 != 0) return;
  UI.previousMode = UI.mode;
  readSixSlotLabels();
  if (UI.mode == 0) UI.cachedBackground = NULL;
  UI.mode = save >= 1 ? 4 : 3;
  loadMenuBackground(save ? "TZU\\Interface\\Save\\save.tif"
                          : "TZU\\Interface\\Load\\load.tif");
  UI.selectedSlot = -1;
}
```

Это **не** проверка «есть хоть один активный Program» и **не** проверка `Block` (`scene+0x73b`). Путь Escape→главное меню дополнительно проверяет busy и `DAT_0044569c`; прямой F2 использует свой predicate выше. Для video pointer `DAT_00446254!=0` WindowProc не вызывает Save/Load: клавиша завершает видео, и только новое нажатие после него может открыть меню.

`StartW` opcode1 в `0x405e5c` ставит `scene+0x709=1`, сохраняет PC и yield. Когда animation+0xbb9 становится 0, следующий poll снимает busy и выполняет хвост Program. Значит, даже после последнего визуального кадра, **до poll SCC**, Save ещё запрещён. Нажатие не ставится в очередь и автоматически после окончания действия не исполняется.

### 3.2. Что происходит в примере Goto → StartW → Save

| Момент | Оригинальный результат |
|---|---|
| Только Goto/path active, busy709=0 | **CONFIRMED:** F2 допускается; меню не ждёт подхода |
| Во время StartW, включая WAV-барьер его анимации | **CONFIRMED:** F2/F3 игнорируются gate; файл не создаётся |
| StartW закончился визуально, SCC ещё не снял busy | **CONFIRMED:** всё ещё запрещено |
| Хвост Setxy/State/Addtol завершён, busy0 | **CONFIRMED:** Save разрешён при остальных условиях |
| Неблокирующий Start / сюжетный Fclick pending, busy0 | **CONFIRMED:** сами по себе не запрещают меню |
| Block=1, busy0 | **CONFIRMED:** прямой F2 не проверяет Block; это не общий запрет Save |
| AVI / SclipW | **CONFIRMED:** WindowProc перехватывает клавишу для остановки AVI, не сохранения |

В UI mode3/4/6 `0x40c974` вызывает меню-рендеры, **не `0x40a76c`**. Programs, animation scheduler и движение сцены на это время не тикают. Отдельные внешние аудиопотоки не следует считать остановленными этим фактом.

При отмене меню прежняя сессия возвращается к обычным тикам, её контекст в памяти ещё существует. При создании Save тоже нет cancel/normalization старого действия: после закрытия меню текущая сессия продолжает его. Но **файл этот контекст не содержит**.

**DERIVED:** если сохранить на Goto перед `StartW K_talk`, затем Load, в файле будут позиция последнего тика и ещё старые State/предметы. Маршрут и PC исчезнут; `K_talk` не запустится от старого клика. Сцена выполнит новый `Start`, а игрок должен кликнуть заново, если Start сам не выбирает сюжетное действие. Это не зависшее ожидание: старого ожидающего Program больше нет.

**DERIVED:** оригинал также допускает снимок посреди неблокирующей сюжетной анимации с Fclick. Его загрузка не обещает продолжить анимацию/доставить прежний Fclick. Не превращать это ограничение оригинала в требование небезопасного браузерного Save.

### 3.3. Подпись и запись — CONFIRMED

Выбор строки Save переводит UI в mode6. Пользовательское имя копируется в slotLabel[slot] (80 байт выделенного пространства); непустое имя подтверждается Enter или кнопкой. Ввод ограничен 15 байтами, не 80 символами. Writer исполняется синхронно, **без отдельной SCC-команды Save**, без ожидания устойчивого кадра и без вызова Stop всем анимациям.

```c
writeSave(UI, slot) {                  // 0x40c8bc
  file = fopen(sprintf("slot%d.sav", slot), "wb");
  fwrite(UI.slotLabel[slot], 80, 1, file);
  saveInventory(globalInventory, file);
  saveMap(UI, file);
  fwrite(&requestedLevel, 4, 1, file);
  for (i = 1; i <= UI.sceneCount; ++i) saveScene(sceneTable[i], file);
  fclose(file);
}
```

Нет сравнения requestedLevel (`0x46851c`) с фактическим activeScene (`0x4686b0`) перед записью. **DERIVED:** короткое окно отложенного `Level` допускает несовпадение; будущий browser gate обязан закрыть transition pending, а не копировать эту гонку. Windows message interleaving в этом окне не измерялся.

## 4. Состав сохранения: сериализуемое ≠ весь runtime

Статусы ниже относятся к **оригинальному файлу**. У сериализованного поля отдельно отмечен возможный override при загрузке. RECONSTRUCTED не означает «точно тот же кадр/таймер»; TRANSIENT не означает, что оригинал обязательно обнуляет все глобальные байты при hot-load.

| Данные | Класс | Что установлено |
|---|---|---|
| Активный/requested Level | **SERIALIZED** | один int глобали `0x46851c` |
| Номер входного Portal `scene+0x712` | **TRANSIENT** | в writer отсутствует; Load использует mode0, не Portal; холодный default -1 |
| Список Portal и Focus | **RECONSTRUCTED** | повторный SCC/Inc parse |
| Visited/initialized каждого из 50 scene+4 | **SERIALIZED** | один byte; определяет пропуск Init и создание объектов |
| Scene+0, script selector | **SERIALIZED** | int; читатель условных include сравнивает его с двумя operand; default0 |
| Scene+0x737, backup selector | **SERIALIZED** | int; opcodes0xd/0xe копируют selector туда/обратно; это не PC и не направление |
| Object/Active/Light identity, type и порядок | **SERIALIZED** | count, type tags и имена; нужно сохранить в том числе placeholders |
| Локальный State всех сцен / Lstate | **SERIALIZED** | object+4, включая неактивные/непосещённые сцены |
| Сюжетные флаги | **SERIALIZED** | State объектов и сохранённые selector/map поля; отдельного day/quest dictionary writer не пишет |
| Object depth / Objzet | **SERIALIZED** | object+0x108; не восстанавливать все depth по SCC defaults |
| Hover Cursor ID | **SERIALIZED** | object+0x152; не confused с selected item |
| Active rect / Light параметры | **SERIALIZED** | 16 байт type-specific |
| Active/Light Show/Hide | **SERIALIZED** | byte+0x297 |
| Base Object Hide | **SERIALIZED** | пустая строка MULT; не State и не отдельный visibility flag |
| Последнее MULT name/frame/record каждого объекта | **SERIALIZED** | не курсор Animation scheduler; в том числе пустой растр/исчезнувшая тень |
| Object X/Y/scaleX/scaleY | **SERIALIZED** | четыре raw float32; renderer может заменить координаты из ненулевого MULT record |
| Bitmap, кэш raster/hit mask, texture pointers | **RECONSTRUCTED** | по MULT reference и ресурсам, не копировать адреса памяти |
| Map bank и unlocked[2][7] | **SERIALIZED** | global UI+0x21 + 14 int; Setzon ≠ один current zone |
| Выбранная область/открытая панель карты | **TRANSIENT** | UI navigation state не входит в writer |
| Логические X/Y Громова | **SERIALIZED** | scene+0x716/+0x71a; имеют приоритет при обычном placement |
| Внешний вид Mainhero как Object | **SERIALIZED** | обычный object record; при savedX>=0 и !busy loader **переопределяет** Stop0 |
| Отдельное направление героя / гистерезис хода | **TRANSIENT** | направление хода — process globals, не writer; обычный load appearance **RECONSTRUCTED** через Stop0 |
| Перспективные depth/scale героя | **RECONSTRUCTED** | несмотря на raw Mainhero fields в файле, обычное placement пересчитает по mask/focus |
| Инвентарь | **SERIALIZED** | 100 int slots, -1 empty, порядок и дубликаты допустимы |
| Рецепты комбинаций | **RECONSTRUCTED** | конструктор `0x40eacc`, не save record |
| scene selected item | **TRANSIENT** | scene+5 не записан; `0x407ffc` сбрасывает0 |
| UI pending inventory selection | **TRANSIENT** | UI+0x11 не записан; не восстанавливать старую выборку |
| Block (`scene+0x73b`) | **SERIALIZED** | но active scene loader сразу очищает0; затем Start может поставить снова |
| Изменённый Setmsk/Setbck effect | **RECONSTRUCTED** | пути/указатели не записаны; базовые Mask/Back разбираются снова, Start может переопределить |
| Shift target | **TRANSIENT** | scene+0x75a сбрасывается0 |
| Camera scrollX/scrollY | **TRANSIENT** | не записаны; видимая область **RECONSTRUCTED** placement/camera clamp; точный старый scroll не обещан |
| Animation instances, frame cursor/elapsed/active/barriers | **TRANSIENT** | пересоздаются; запускаемые Start анимации начинают сначала |
| Fclick binding / новые handlers | **RECONSTRUCTED** | из SCC; прежний pending completion **TRANSIENT** |
| Programs, PC, waiting/mode, активные Click/Start/Init | **TRANSIENT** | нигде не записываются; новые Start Programs могут появиться при загрузке |
| Маршрут, remaining, target, отложенные команды/переход | **TRANSIENT** | runtime scratch; Level сам хранит только итоговый requestedLevel |
| Таймеры, RNG и Fault last choice | **TRANSIENT** | в write closure нет; новое посещение пересоздаёт Fault, seed не сохраняется |
| WAV playback, Voices, subtitles, sound latches | **TRANSIENT** | definitions/resources восстановлены, прежние handles/time не восстанавливаются |
| MP3 track/playhead/loop handle | **TRANSIENT** | save не пишет MusicManager; музыка обычно задаётся новым Start/Smusic; сохранённый playback offset не существует |
| AVI object/video wait | **TRANSIENT** | pointer/global gates не входят в save; горячая клавиша при AVI не сохраняет |
| UI mode, поля меню, mouse/hover, debug | **TRANSIENT** | после успешного Load игровой mode0; конфигурация отдельна от игрового сохранения |

**CONFIRMED:** Scene selector и backup реально входят в формат; для **данного** корпуса их команды сохранения/возврата selector не используются. **UNKNOWN:** авторское название этих полей и гарантии неиспользуемых языковых веток. Не добавлять фиктивный `day` и не путать scene selector с Level number (номер структуры хранится отдельно в +9).

Для Setmsk/Setbck/Shift подробности уже в SCC_MASK_INPUT/SCC_MAP_MISC; повторно их формат не реверсился. Отсутствие effect в save не запрещает состоянию оставаться изменённым в текущем visit до выхода.

## 5. Бинарный формат оригинала

### 5.1. Файл, слоты, заголовок

**CONFIRMED:** `slot0.sav` … `slot5.sav`, **6** слотов. Строка `slot%d.sav` по `0x4459c3`, fopen modes `wb` по `0x4459bd` и `rb` по `0x4459c0`. Нет quicksave/autosave в исследованной цепочке.

Путь **относительный CWD процесса**, не каталог `Saves` и не AppData. `0x40b424` читает HKLM `Software\Buka\Agent` / `Block%d`; у первого блока выделяет dirname и вызывает SetCurrentDirectoryA (`0x40b5c4`). **DERIVED:** при обычной установленной конфигурации это каталог первого ресурсного блока. **UNKNOWN:** конкретный абсолютный Windows-путь без registry пользователя; не объявлять без доказательства «всегда рядом с Agent.exe». Остальные найденные chdir относятся к построению ресурсных архивов.

Первые **80 байт — пользовательская подпись**, а не magic/version, screenshot, timestamp или opaque VM-header. `0x40cefc` читает её для списка; reader `0x40c7c4` просто fseek80. Нет записываемой версии, scene-count, длины payload, CRC/checksum, compressed wrapper или padding alignment между полями. Совместимость других изданий **UNKNOWN**: формат зависит от EXE sceneCount и object schemas, отсутствие version не доказывает совместимость.

```text
file offset  size       data
0x000        80         slotLabel[80], char bytes / NUL string + raw tail
0x050        400        inventory[100] : int32 little endian (-1 empty)
0x1e0        4          mapBank : int32
0x1e4        56         unlocked[2][7] : 14 int32, bank-major
0x21c        4          requestedLevel : int32
0x220        variable   scene[1], scene[2], ... scene[50]
```

`fwrite` пишет raw memory PE32/x86: int32 и float32 little endian, bool1. Строки объектов — raw 256-byte arrays с NUL; имена ресурсов в корпусе ASCII, подписи допускают кириллицу (Windows byte-oriented input). **DERIVED:** Windows-1251 для русской подписи согласуется с кодом UI/корпусом; writer сам encoding не маркирует. После NUL хвост не обязан быть нулевым; бинарный importer не должен считать его полезным текстом.

### 5.2. Scene record — CONFIRMED

Никакого выравнивания между записями: fixed header **22 байта**.

| Offset от начала record | Размер | Native field |
|---|---|---|
| 0 | 1 | initialized (`scene+4`) |
| 1 | 4 | selector (`scene+0`) |
| 5 | 1 | Block (`scene+0x73b`) |
| 6 | 4 | backupSelector (`scene+0x737`) |
| 10 | 4 | logical hero X (`scene+0x716`) |
| 14 | 4 | logical hero Y (`scene+0x71a`) |
| 18 | 4 | objectCount (`scene+0x1a1`) |
| 22… | variable | object entries in list order |

У каждого object entry сперва int32 type tag, затем payload. Virtual getType — vtable+0x1c; writer calls slot+0x10, reader slot+0x0c. Подтверждены **0=Object**, **2=Active**, **3=Light**. Reader по tag создаёт соответствующий класс, читает поля и находит Mainhero по имени. `Lstate` placeholder сохраняется как обычный type0 даже при initialized0; после первого SCC declaration переносят его State.

### 5.3. Object payload — CONFIRMED

Base **548 байт** (0x224), с type tag entry=552. Порядок не совпадает с расположением в C++ памяти:

| Payload offset | Размер | Поле |
|---|---|---|
| 0 | 4 | State int (+4) |
| 4 | 4 | depth int (+0x108) |
| 8 / 12 | 4 / 4 | X/Y float (+0x277/+0x27b), объектные, не logical hero XY |
| 16 / 20 | 4 / 4 | scaleX/Y float (+0x27f/+0x283) |
| 24 | 4 | cursor int (+0x152) |
| 28 | 256 | name (+8) |
| 284 | 256 | MULT resource name (+0x167); пусто = нет изображения |
| 540 / 544 | 4 / 4 | MULT frame / record index (+0x267/+0x26b) |

Active добавляет rect 4×int (+0x287..+0x293) и visible byte (+0x297): payload **565**, entry **569**. Light добавляет четыре int его собственных параметров (+0x287/+0x28b/+0x28f/+0x293) и visible: те же размеры, **не** интерпретировать их автоматически как Active rect.

Отдельно изображение/bitmap пиксели не пишутся. `0x404974` резолвит reference заново; ненулевые координаты MULT record могут нормализовать ранее сохранённый transform, поэтому «побитово тот же transform после первого render» не универсальное требование.

### 5.4. Ошибки оригинала — CONFIRMED / UNKNOWN

- Reader возвращает -1, если fopen rb вернул NULL, **до** выгрузки текущей сцены. Load UI не выходит в игру. Специального сообщения об ошибке в этом пути нет.
- Writer не проверяет fopen wb на NULL; не проверяет fwrite/fclose result и не использует временный файл/atomic replace. UI возвращается в игру без подтверждения успешности диска. **UNKNOWN:** конкретный crash/dialog CRT при отказе записи; не называть его обработанным.
- Чтения, counts, type tags и scene index не валидируются полноценным протоколом. Повреждённый/усечённый файл может разрушить уже выгруженную сессию; восстановление после такого отказа не доказано.
- `0x40aebc` вокруг Load — проверка heap с сообщением `Heap corrupt absolutely`, не checksum сохранения и не validator его формата.

Для браузера эти слабости **не копировать**. Бинарная совместимость сейчас не реализуется; структура достаточна для будущего отдельного importer с жёсткими bounds.

## 6. Точный порядок Load и новой игры

### 6.1. Load — CONFIRMED

```text
0x40e838 (кнопка)
  → 0x40c7c4(UI,slot)
    1. heap-check; fopen slot rb; при NULL return -1 (старый visit цел)
    2. если activeScene существует: 0x4089cc → 0x407c14
       освободить Programs/handlers, animations/events/voices, фон/nav/cache
    3. fseek(file,80,SEEK_SET)
    4. inventory read100 ints
    5. map bank + unlocked14 read
    6. requestedLevel read
    7. для каждой из 50 заранее существующих Scene:
       удалить прежние Object instances
       read initialized/selector/Block/backupSelector/logicalXY/objectCount
       type→constructor→virtual load каждого Object/Active/Light
       scene.Mainhero = findObject("Mainhero")
    8. fclose; activeScene=sceneTable[requestedLevel]
    9. heap-check; 0x407ffc(activeScene,0)
       a. очистить Block, selected item, Shift, runtime counts/route/handlers и др.
       b. parse Scripts\\LevelN.scc + Inc в исходном порядке
          visited сцена: Object/Active declarations не создают новые объекты
          Back/Mask/Focus/Portal, анимации, Click и Fclick разбираются заново
       c. обычная ветка scene+0x741==0:
          preload сохранённых MULT names и Program resources (0x4083bc)
          общие Walk/Stop/Mstop/Speak/Arrow (0x4084c0)
          создать synthetic Fault (0x4081c8)
       d. если initialized==0: dispatch Init; иначе пропустить
       e. если !busy709 и savedX>=0:
          0x40868c(scene,&savedXY,0) — Stop0, коррекция mask,
          depth/scale/transform и camera clamp
          если savedX<0 — этот placement пропускается, остаётся object visual
       f. dispatch Start (executionMode0, item0)
       g. start Arrow, initialized=1, собрать object render list
   10. return0
  → UI mode0/gameStarted1, убрать menu background, resume music manager
```

Строка `PUSH 0` в `0x40815c` — **третий аргумент направления** для `0x40868c`. Декомпилятор потерял этот параметр из-за sprintf varargs; вывод о направлении сделан по assembly, не по восстановленной Ghidra signature.

**CONFIRMED:** loader сам не ждёт полного завершения нового Start. Он может поставить busy и продолжиться следующими тиками. Старый PC не возвращается. Нет отдельного SCC-события `Load`/`OnLoad` в этой цепочке; вызываются обычные Init/Start с условиями выше.

**Оговорка:** reader не пересоздаёт сами Scene containers, поэтому несерилизуемые поля могут сохранять process-local остатки (например, прежний scroll, глобальное направление ходьбы). Loader явно обнуляет только перечисленные поля. На холодном старте constructor задаёт другие исходные значения. Camera clamp берёт текущую основу; hot-load и cold-load не обещают абсолютно одинаковый scroll. Browser SPEC ниже использует чистый runtime и детерминированную основу0. Особая error-scene ветка `+0x741!=0` ставит busy и пропускает обычный путь; гарантии корректного ресурсообеспеченного gameplay на неё не распространяются.

### 6.2. Повторные события и сюжетные checkpoint — CONFIRMED / DERIVED

`Start` **нельзя целиком выключать при Load**, и нельзя после него повторно накатывать старый snapshot: это отменит его законные State/Hide/Setmsk эффекты. 138 исходных handler перечислены в evidence. Среди них нет прямых Addtol/Remtol в Start; но есть state mutations, Level и запуск анимаций/Fclick, поэтому отсутствие прямого Addtol не доказывает идемпотентность всего call graph.

- **Level1:** initialized=true запрещает повтор Init с роликом/стартовыми State. `Start Slip` возобновляет фон в нужном Slip.state; `Start Lec_v` Case2 — специально одноразовый входной спуск с переводом Lec_v→1. Snapshot после его завершения содержит1, повторного спуска нет.
- **Level21 после лестницы:** `Click 0 Lest Grandmother` Case1: Goto → StartW K_lest → Setxy160,460 → Hide Lest → Addtol29. Сам `Lest.state` **не меняется**. Нельзя восстановить лестницу только по State: нужен Hide и последнее назначение `Lest_ten`. `Start Grandmother` Case1 скрывает бабушку, `Start Balerin` Case1 имеет одноразовый разговор и Balerin→2; после завершённого Case1 сохраняется2 и разговор не повторяется.
- **Level38 после первого разговора:** Lora=2, Pank=2. Новый `Start Pank` Case2 восстанавливает обычную mask, не Bandit2_Lora; `Start Lamp_t` восстанавливает лампу. `Click Lora` не вызывается загрузчиком; K_talke/State Lora2 повторно сами по себе не исполняются. Следующий клик идёт в Case2, не Case1. Сохранить надо также Cursor Lora7 и картинки NPC/убежавших хулиганов.
- **Не все «однократные» анимации — однократные сюжетные события.** Например, Level24 `Start Ocno` Case1 снова выполняет K_enter1 на каждом входе, в том числе Load. Это оригинальная повторная entry-анимация, не баг дедупликации. Level15 Narcman Case4–8 аналогично запускает Narc_otb4. Не добавлять глобальный журнал «этот animation name уже играл».
- Level48 `Start Interface` Case0 записывает cross-scene Lstate и Interface→1; последующий Load со State1 не выполняет Case0. Это пример необходимости сохранять все сцены **до** dispatch Start.

**DERIVED:** надёжный browser Save gate + сохранённые State/visited/visuals предотвращают повтор завершённых item/NPC действий без сериализации их Program. Общее обещание «после Load никаких SCC-команд не исполнится» было бы неверным.

### 6.3. Новая игра — CONFIRMED

`0x40c6e4`: inventory reset (`0x40ebec`:100 slots=-1), map reset (`0x40d1ec`:bank0/unlocks0), cleanup active visit, destructor всех старых Scene (`0x407b94`), новые 50 Scene через `0x407a80`, requestedLevel1, active scene1, `0x407ffc(scene1,1)`. Поэтому fresh Init запускается. Save slot files не удаляются. Общие настройки audio/subtitles хранятся отдельно в config.cfg (13 байт) и не являются прогрессом.

Browser сейчас делает эквивалент свежего старта через **новый SceneSession** и boot request1,-1; полноценного `newGame/resetGame` API нет. Одного перехода `request(1,-1)` для NewGame недостаточно: states/inventory останутся, Init будет пропущен.

## 7. Аудит браузерной архитектуры на fc200d7

Это **CONFIRMED по TypeScript**, не оценки по старым Basic Memory status.

| Данные | Где сейчас | Как экспортировать | Как восстановить / минимальная добавка |
|---|---|---|---|
| Текущий Level | `SceneSession.view.definition.id`, `loader.active.id` | actual active ID, только если pending отсутствует | отдельный restore entry, не Portal travel; force rebuild даже того же ID |
| Все сцены / visited | `SceneLoader.states: Map<number,SceneState>` | массив entries, initialized и **все** objects, не только active | создать SceneState без Init; импорт before view/Start |
| State/Lstate | `SceneState.objects[].state`, placeholders | canonical name + int + placeholder discriminator | перенести placeholders без materialization; State source — loader |
| Дубликат SCC State | `SccRuntime.states` плюс `host.writeState` пишет SceneState | **не** экспортировать второй Map | host.readState читает canonical SceneState; новый runtime Map можно оставить пустым |
| Инвентарь | `SceneLoader.inventory`, тот же массив в `SccRuntime.inventory` | один snapshot массива с порядком/дубликатами | новый canonical массив, передать всем новым views; не восстанавливать две независимые копии |
| Inventory UI | `InventoryView.items` — display copy; pendingSelection/open | не сохранять | закрыть/reset без commit pending selection; вернуть display из canonical inventory |
| Scene selected item | `SceneView.selectedItem` | не сохранять | selectItem0; это не inventory contents |
| Depth и visual | `SceneState.objects[].depth/mult/imageHidden/visible` плюс live sprites | deep DTO, references без texture; получить фактический transform active view | сохранить всех объектов, включая пустой MULT; применить visuals без запуска frame/Sound/Fclick |
| Cursor | `SceneObjectState.cursorId`, defaults в definition | override или effective cursor | `declareObject` сейчас **теряет cursorId** при merge — сохранить его, а также rect/новые visual поля |
| Object pose/transform | `SceneView.objects[].sprite`, hero Sprite; State полного transform не содержит | добавить небольшой persisted transform к Object state; active capture может прочитать live sprite | apply raw placement после image resolution; не восстанавливать всё по текущему layout |
| Hero XY/direction | live `heroPosition/heroDirection`; `SceneState.savedPosition/savedDirection` обновляются при dispose/Setxy | active scene брать **из live view**, остальные из State | explicit load placement; не пользоваться нулём как «нет позиции» |
| Hero coordinate mode | private `heroIsObjectSpace`, hidden hero / MULT pose | минимальный view capture с режимом и visual, если не обычная навигация | отрицательная/объектная позиция не должна стать Portal fallback; навигационная загрузка Stop0 по оригиналу |
| Камера | `SceneView.scrollX` | не требуется оригинальному save | deterministic clamp от0 после savedXY; Shift reset; optional сохранение scroll — отдельное улучшение, не native parity |
| Setmsk / Block | private `activeMask` / `inputBlocked` | не включать как самостоятельные сюжетные flags | свежая definition mask, Blockfalse, затем Start; exposes gate read-only status |
| Карта | **только** `loader.game.zone` / `scc.zone`, setZone hook | текущий int можно сохранить только как browser legacy field | Setmap/unlocks2×7 в этой базе отсутствуют; zone не даёт восстановить оригинальную карту |
| Programs / scheduler | public `scc.programs`, `scc.busy`, player.states; private movement/barriers | только читать для safe gate | новый runtime + cancellation старого; не JSON этих структур |
| Fclick | `definition.completionEvents`, `scc.fclickBindings` | не сохранять | bindings из SCC; pending finite callback запрещает Save |
| Аудио | private SccAudioRuntime, backend resource scopes/generations | не сохранять | view.dispose отменяет старые runs; новые callbacks scoped к новой generation |
| Асинхронные переходы | loader.pending, private pendingLoad/loadToken/loaded | не сохранять | invalidate tokens; поздний результат release, не enter; gate проверяет не только getter loading |
| Runtime дубликат player | `SceneDefinition.player` и отдельный `SceneView.player` | не сохранять ни один | authority для gameplay — **view.player**, definition player — не часы текущей сессии |

### Скрытые проблемы существующих интерфейсов

1. `SceneState.savedPosition` часто отстаёт от live героя: перемещение пишет `heroPosition`, State обновляется при dispose. Save **не должен вызывать dispose ради снимка**. Нужен `capturePersistentState()` без побочных эффектов.
2. `SceneView` constructor сначала `createLayoutObjects`, потом `applyStoredObjectVisuals`; последнее использует `applyRecord`. Оно смешивает presentation и запись State, а `depth>=10000` может пропустить применение сохранённой картинки. Restore обязан уметь **прямо привязать сохранённое изображение**, обходя freeze только на этапе восстановления, не меняя обычные frame rules.
3. `applyStoredObjectVisuals` игнорирует Mainhero; для обычной загрузки это правильно лишь при явном Stop0 placement. Для savedX<0/объектной позы нужен отдельный путь.
4. `createLayoutObjects` выставляет sprite X/Y, а `applyRecord` при record.x=y=0 сохраняет прежний transform. Поэтому одного последнего reference недостаточно для произвольного сохранённого transform. Минимальная добавка — snapshot transform в object State, поддерживаемый в обычных кадровых/placement mutations и при выгрузке visit. Нельзя восстановить потерянный transform уже оставленной сцены задним числом без replay; для текущего порта допустим его нынешний layout fallback, но это явно не точная native parity.
5. `SceneLoader.declareObject` переносит State/depth/mult/imageHidden/visible, но забывает cursorId, rect и ещё не добавленный transform. После import они потеряются без маленького исправления merge. Для initialized=true не создавать из defaults отсутствующие объекты молча; соответствие declared object set проверять contentId/validator.
6. `SceneSession.flush()` same-scene fast path делает no-op; **для Load так нельзя**. `enterPending()` всегда предполагает travel/portal, не имеет параметра restore и сбрасывает pending до подготовки.
7. `SceneAssetProvider.loaded` — cache keyed по scene ID, **не ref-counted visit lease**. Два `load(sameId)` возвращают один record без нового acquire; его `release(id)` разрушит MULT textures кандидата. При same-scene restore либо передать существующий lease новому view без release, либо подготовить кандидата через отдельный provider instance и собственные resource acquire. Второй вариант подходит для атомарного rollback.
8. `loading` undefined для settled pendingLoad. Пока loader.pending или любой pendingLoad record существует, Save должен быть запрещён. Проверять только `session.loading` недостаточно.
9. Стартовые UI/debug snapshots не authority. Debug counters/logs, asset manifest, decoded MULT, navigation buffers и Pixi display tree не входят в DTO.

## 8. Browser policy: безопасная граница и объём MVP

### 8.1. Save gate — SPEC

`SceneSession.canSave()` вызывается на границе **после полного view.tick** (SCC → animation/Fclick → movement → camera), не изнутри кадра/handler. Отдельно проверить ещё раз в `exportSave`; отсутствие true не должно менять мир.

Возвращает `{ok:false, reason}` если:

- нет успешно вошедшей активной сцены или идут boot/restore/newGame;
- есть loader.pending / pendingLoad, в том числе settled, или active/view ID не совпадают;
- `scc.busy`, **любой `program.active`** или движение (включая plain walking без SCC);
- активная **конечная сюжетная анимация**, особенно с completionEvents/Fclick, ещё может поменять мир после снимка; при непонятной роли конечной анимации — ждать её естественного конца;
- незавершённые сценарные media barriers, временная объектная катсценовая поза/Block, чьё устойчивое восстановление не обеспечено;
- открытый inventory с pending choice: MVP предлагает закрыть панель, не фиксирует выборку автоматически.

**Не** блокировать все active animations: Walk уже закрыт movement gate; бесконечные Animc ambient loops и стабильные Stop/Mstop позы не должны делать Save недоступным навсегда. Loop clock не сериализуется. `AnimationPlayer.definition(name).loop` и completionEvents позволяют различить их; неизвестный конечный animation считается сюжетным. Block при busy0 **не является запретом оригинала**; запрет временного blocked-cutscene в MVP — сознательное ужесточение. Если нужна поддержка устойчивого Plane-режима Block, разрешить только с доказанной реконструкцией его Start, не добавлять сохранённый mutex.

При отказе **сразу вернуть Busy/TransitionInProgress**, не ставить скрытую очередь Save, не отменять Program, не заканчивать анимацию принудительно, не писать предыдущий «хороший» snapshot под видом текущего. Игрок повторяет действие после завершения сценария.

Окно Save UI можно открыть заранее без снимка; slot commit обязан повторить gate. UI не должен навсегда останавливать тик, из-за которого Busy никогда не завершится. Это отличие от оригинального modal-menu.

### 8.2. Карта и отсутствующие механизмы — SPEC

Для **полной оригинальной семантики** минимально нужны `game.mapBank` и `game.mapUnlocked[2][7]`, без разработки map UI: parse Setmap, hook выбора банка; Setzon отмечает ячейку текущего банка. Контракт/адреса уже восстановлены в SCC_MAP_MISC; это небольшой world-state seam, а не рефакторинг движка.

На fc200d7 этих данных **не существует**. Нельзя получить посещённые unlocks из одного `game.zone`, activeLevel или списка посещений: Setzon условен. Старую уже идущую сессию без наблюдения истории нельзя честно превратить в banked map с выдуманными false/true.

Поэтому схема ниже допускает явный профиль `legacy-zone-v1` для сохранения **всей реально существующей браузерной сессии** на этой базе. Он сохраняет zone и явно не заявляет native map parity. После добавления banked tracking новые игры/сессии получают профиль `banked-v1`; загрузчик, требующий banked, отвергает legacy с понятной ошибкой, не стирая файл и не обнуляя карту. Эта граница необходима, чтобы не потерять текущий ручной прогресс при внедрении Save. Миграцию существующего in-memory прогресса можно делать только как legacy snapshot с честной маркировкой.

## 9. Предлагаемый GameSaveV1 — SPEC

Владение остаётся у **существующего SceneSession/SceneLoader**. Новый GameSession wrapper не нужен. Небольшой pure save codec и storage repository отделены от Pixi, localStorage и SCC runtime.

```ts
type Point = [number, number];
type Transform = {
  x: number; y: number;
  scaleX: number; scaleY: number;
  anchorX: number; anchorY: number;
};
type SavedImage =
  | { kind: 'none' } // пустое имя MULT; не рисовать layout вместо него
  | { kind: 'mult'; animation: string; frame: number; slot: number; child: number };
type SavedObject =
  | { name: string; kind: 'placeholder'; state: number }
  | {
      name: string; kind: 'Object' | 'Active' | 'Light'; state: number;
      depth: number; cursorId: number;
      image: SavedImage; transform?: Transform;
      visible?: boolean; // обязательно для Active/Light, не для Object
      rect?: { left: number; top: number; right: number; bottom: number };
    };
type SavedScene = {
  id: number; initialized: boolean;
  hero: {
    position: Point;
    direction: number; // browser extension для per-scene savedDirection; не native field
    mode: 'navigation' | 'object-space' | 'hidden';
    transform?: Transform; // только для устойчивой non-navigation позы
  };
  objects: SavedObject[]; // сохранить insertion order и canonical spelling
};
type SavedMap =
  | { model: 'legacy-zone-v1'; zone: number }
  | { model: 'banked-v1'; bank: 0 | 1;
      unlocked: [boolean[], boolean[]] }; // runtime validator: ровно 2×7
type GameSaveV1 = {
  format: 'agent-revers.game-save';
  schemaVersion: 1;
  contentId: string; // стабильный идентификатор SCC/asset semantics, не время build
  createdAt: string; // ISO UTC, metadata, не игровой таймер
  label: string;
  world: {
    activeLevel: number;
    inventory: number[]; // packed как текущий browser, порядок/дубликаты сохранять
    map: SavedMap;
    scenes: SavedScene[]; // visited + непосещённые с placeholders
  };
};
type StoredSaveV1 = {
  storageVersion: 1;
  payload: string; // exact JSON.stringify(GameSaveV1) bytes/string
  integrity: { algorithm: 'sha256-utf8'; digest: string };
};
```

1. `SavedImage.animation` здесь — стабильный ключ текущей SceneDefinition.animations (то, что сейчас `SceneImageReference.file`), **не URL blob и не native absolute file path**. ContentId защищает от переименований и другой структуры records. Пустой MULT raster сохраняется как **mult reference на этот пустой record**, а Hide как none.
2. Реальные Object без State.mult, но с исходной layout картинкой, при export получают reference layoutAnimation/frame1/slot/child через definition.layout; не сохранять «нет reference» неоднозначно. Если картинки нет, kind none. Snapshot presentation не запускает Startlevel/Fram ради вычисления.
3. Mainhero остаётся в object list. При active hero.mode=navigation на обычном Load применить **Stop0** и пересчитать depth/scale, как EXE; direction active станет0. Значения savedDirection у неактивных сцен сохраняют текущую browser-модель re-entry -1 (адаптация). Если продукт захочет сохранять точное направление активного героя, это явное улучшение спецификации, не утверждение об оригинале.
4. Для устойчивой object-space/hidden сцены не делать Portal fallback/Stop0; восстановить Mainhero image/transform и mode. Пока режим временный и действие не закончено, Save запрещён gate. `position=[0,0]` — валидная позиция, не sentinel отсутствия. Отрицательные native Setxy имеют особую семантику; валидатор допускает только поддержанные текущим content profile варианты, не превращает их в walkable0.
5. `depthProvenance`, declarations/portals/focus, handlers, PC, active animations, audio snapshots, selectedItem, UI mode, scroll/Shift и runtime.zone-дубликат не включаются. Дефолтные поля объектов разрешается хранить явно: сокращение размера не важнее однозначности.
6. Не сериализовать несуществующие native selector fields выдуманными значениями. У текущего браузера их нет, условные selector-языковые ветки не используются ресурсами. Если они появятся как поддержанная игровая механика, нужен новый content/profile контракт и явная миграция схемы.

### Валидатор и совместимость

Проверка должна завершиться **до dispose текущего visit**:

- envelope/storageVersion/schemaVersion/format exact; digest SHA-256 от точной UTF-8 `payload` string, затем JSON parse/shape validation;
- ограничение input size (например 2 MiB UTF-8) до глубокого обхода, scenes/objects/string lengths; циклов в JSON нет, лишние prototype keys не сливать в объекты;
- activeLevel входит в provider manifest и присутствует среди initialized scenes; IDs целые, уникальные; импортированная сцена не может стать «visited потому что загрузили definition»;
- names непустые, case-insensitive identity, но canonical casing и order сохранены; дубли declared identity отвергать, placeholders допустимы только у initialized=false;
- State/depth/cursor/item/frame/slot/child — целые в применимых bounds; State допустим0..49 для обработчиков данного движка; не clamp неизвестное состояние в0;
- numeric transforms/positions finite (без NaN/Infinity), структурные bounds по content; координату вне walk mask не отклонять автоматически, EXE имеет correction/спецпозиции;
- mult reference существует: scene animation, frame1..frameCount, slot/child record **и совпадение object identity**; не игнорировать битую reference и не показывать default layout;
- инвентарь ≤100 положительных валидных item IDs из текущего icon catalog; дубликаты не удалять Set-ом; порядок packed-array не сортировать;
- map model exact; bank0/1, таблица ровно2×7 boolean. Нельзя интерпретировать legacy zone как unlock table;
- `contentId` из хеша нормализованного manifest/SCC/ссылок MULT + version semantics (включая casefold binding). Обычная пересборка без семантических изменений не ломает Save. Изменённый contentId без известной миграции → IncompatibleSave.

SHA-256 проверяет повреждение, не подлинность против умышленного редактирования: секретного ключа нет и не требуется. Структурная и семантическая проверки обязательны даже при правильном digest. Сломанный slot остаётся доступным для экспорта/диагностики, не удаляется и не заменяется новой игрой.

### Storage

Шесть ручных слотов0..5, key `agent-revers.save.v1.slot.<n>`. Весь envelope одного слота — **один setItem**, без раздельного mandatory index, который может отстать. Метаданные списка выводить из независимых slot records. localStorage достаточно для компактных DTO; IndexedDB сейчас не обоснован.

Сохранение: capture DTO синхронно на safe boundary → serialize payload → digest → перед записью сверить, что выбранный slot не изменился другим окном → setItem. Если пользователь выбрал занятый slot — только явное действие overwrite конкретного слота. Асинхронный digest относится к уже снятому DTO; нельзя после него подменять snapshot текущим миром.

QuotaExceeded/SecurityError/crypto/serialization error возвращаются вызывающему UI; не показывать «сохранено», не удалять другие слоты ради места. При ошибке setItem прежнее содержимое сохраняется. Отмена/неуспех Save ничего в gameplay не меняют. Перед явной перезаписью можно предложить export старого JSON, но automatic save/overwrite при boot, Load, NewGame или refresh **запрещены**.

Два окна: storage event инвалидирует cached slot-list; commit сравнивает текущий raw string с прочитанным при выборе слота. localStorage не предоставляет полноценный CAS, поэтому для MVP документировать single-writer UI либо использовать доступный origin lock для записи; не утверждать транзакционность нескольких setItem. Не внедрять IndexedDB только ради гипотетического размера.

## 10. Минимальное техническое задание Luna

Реализация ниже **не выполнена** в этой ветке.

### Интерфейсы

```ts
// Названия ориентировочные; ответственность и порядок обязательны.
SceneSession.canSave(): SaveEligibility;
SceneSession.exportSave(label: string): Result<GameSaveV1, SaveError>;
SceneSession.importSave(save: GameSaveV1): Promise<Result<void, SaveError>>;
SceneSession.newGame(): Promise<Result<void, SceneLoadError>>;
SceneView.capturePersistentState(): CapturedScene; // без dispose/cancel/tick
SceneView.saveEligibility(): ViewEligibility;      // private movement/barriers/mode
SceneView.restorePresentation(data: CapturedScene): void; // без событий
SceneLoader.exportPersistentState(): SavedWorld;   // deep copy, не Maps/Pixi
SaveCodec.encode/decode/validate(...);
SaveRepository.list/read/write(slot,...);          // только storage, не SCC
```

### Export

1. Выполнить gate на post-tick boundary. Не достаточно одного `scc.busy`.
2. Deep-copy loader.states/inventory/game, включая placeholders; поверх active scene положить свежий live hero и object visuals/transforms. Не менять текущую активность, selected item или camera.
3. DTO не держит ссылок на mutable arrays/Map/Point. Экспорт уже не меняется после следующего tick или комбинации предметов.
4. Валидировать DTO тем же валидатором до записи. Storage failure не влияет на сессию.

### Import: подготовка → commit

1. Прочитать/декодировать/проверить slot, **не разрушая текущую игру**. Любая ошибка до commit оставляет мир и slot как были.
2. Подготовить candidate SceneLoader с восстановленными всеми states/инвентарём/картой. Полностью заменить мир, не merge поверх старой сессии: не должно остаться предметов или State из текущей более поздней игры.
3. Загрузить definition/resources активной сцены без dispatch Init/Start. Использовать отдельный SceneAssetProvider для candidate или корректный transfer lease; same-scene fast path обходить. Глобальный AudioContext можно переиспользовать, но candidate visit scopes ещё не тикают.
4. Создать detached SceneView кандидата с сохранёнными объектами, правильным merge Cursor/rect/transform. Заполнить новые handlers/definitions, но **не запускать сохранённые Programs/animations**. Восстановить presentation как data assignment, не `applyAnimationFrame` с Fram/Sound/Fclick. Ресурсная ошибка — dispose только candidate, текущая игра цела.
5. Слой `restore` не имеет права вызывать `dispatchInit` для initialized active. Validate гарантирует initialized=true. Непосещённые placeholder-сцены остаются ленивыми; их Init случится только при первом реальном путешествии.
6. На commit-boundary приостановить input/ticker старой сцены, increment generation/loadToken, очистить pending переходы и pendingLoad. Поздние Promise/callback старой generation только освобождают старые ресурсы, не меняют мир.
7. Dispose old view/runtime (уже есть audio cancellation). **Dispose пишет старую savedPosition:** не дать этому затереть candidate DTO. После этого swap candidate loader/view/provider ownership, убрать старый root. Обновить InventoryView из нового canonical inventory, закрыть панель и обнулить pending/selectedItem. При желании сохранить readonly публичный loader — getter к private заменяемому полю; глобальный рефакторинг не нужен.
8. Сбросить route, Programs, barriers, Block, Shift и visit clocks через свежий view. Поставить героя: navigation → savedXY с коррекцией top-level mask/focus, Stop0, camera clamp от0; object-space/hidden → сохранённая presentation, без Portal и sentinel fallback.
9. **Один раз dispatch Start** с item0, через hooks **нового** loader. Не отменять Programs этого нового Start, не дублировать Init, не запускать Startlevel искусственно. Подготовленные visuals уже применены до Start; его новые визуальные/State/Setmsk эффекты имеют приоритет. Не накатывать snapshot повторно после Start.
10. Разрешить новые тики и input. Возникшие от Start waiting Programs — нормальный новый контекст; они завершатся штатно. Если Start запросил Level, это **новый** pending transition, не удалять его старым restore cleanup. События/ресурсы старой generation не воскресают. Сохранения на диске не менять.

Для predictable failures `Start` должен быть pre-parsed/validated до commit; не выполнять его дважды «для проверки». Возникший после commit ошибочный runtime сообщается как ошибка текущей игры, а сохранение не объявляется повреждённым и не стирается. Candidate нельзя заранее прогонять с живыми аудио/глобальными hooks.

**Same-scene Load обязателен.** Обычный request/flush пропускает его и не заменяет inventory/objects, поэтому использовать existing travel path без отдельного restore mode нельзя. Минимально вынести общую prepare/place/Start часть, оставив travel и restore разные причины входа; не переписывать архитектуру всех сцен.

### NewGame и refresh

NewGame создаёт чистые loader/world/runtime, inventory empty, map bank0/unlocks0 или legacy zone0 по профилю, active1, один настоящий Init и Start. Слоты сохраняются. Полное обновление страницы читает список слотов, но **не пишет boot-state в занятый slot**; загрузка выбранного slot исполняет тот же import path. Пока resources/restore не закончены, скрытый boot `request(1,-1)` не должен соревноваться с Load.

### Узкий scope изменений

Добавить pure codec/storage файлы, capture/restore seams в SceneSession/Loader/View, маленький persisted-transform DTO и перенос Cursor/rect, reset inventory overlay. Если включается banked profile — минимальный state tracking Setmap/Setzon без map UI. Не сериализовать runtime для обхода safe gate; не добавлять «восстановить PC, а если завис — таймером снять busy».

## 11. Проверки будущей реализации

Здесь **описаны**, но не запускались runtime-тесты и не добавлялись production-тесты. Проверки реализации Luna должна провести после изменений. Каждый сценарий включает Save на eligible boundary; до/после Load отслеживать реальные dispatch/events и inventory, не только screenshot.

| № | Сценарий | Ожидаемое поведение / основание |
|---|---|---|
| 1 | Новая игра → Save → Load | Дождаться окончания Init/video stub и сюжетных one-shots. Level1, позиция и State сохранены; Init/Rolik1/начальные Show не повторяются, Start один раз. В native при AVI клавиша не Save |
| 2 | Подбор Botl → Save → Load | После Takedr1 + Setxy + Addtol1 + State Botl1. Item1 ровно как до Save, Botl невидим из empty raster reference, повторный pickup не запущен; не делать Hide из State |
| 3 | Комбинация 2+5→39 → Save → Load | Порядок массива сохранён; обоих исходных IDs нет,39 есть, рецепт заново не исполняется; pending/selected0. Также проверить неизвестный рецепт не меняет inventory |
| 4 | Изменение NPC State → Save → Load | Local и remote State восстановлены до Start, будущий Case выбирается по ним; новый Start может законно менять их; старый NPC Click не вызывается автоматически |
| 5 | Hide объекта → Save → Load | Active/Light visible=false и base Object empty MULT переживают Load. Отдельно hidden при state0 и visible при state1, чтобы исключить ложную связь State↔visibility |
| 6 | Переход между сценами → Save → Load | Пока pending/settled pendingLoad — отказ без записи. После успешного входа сохраняется actual activeLevel, не previous; Load использует savedXY, не Portal travel |
| 7 | Load → возврат в прежнюю сцену | У всех прежних сцен visited/State/depth/Cursor/Hide/MULT сохранены; Init не повторён; обычный Start при возвращении один раз. Unvisited placeholder сохраняет только State до declaration |
| 8 | Положение героя | Save после plain walk, затем другая позиция и Load. Исходные logicalXY восстановлены/corrected, route отсутствует, обычная native-поза Stop0, scroll вычислен. Дополнительно0,0 и поддержанная negative/object-space поза не превращаются в Portal0 |
| 9 | Level21 после лестницы | Grandmother1; закончить K_lest/Hide Lest/Addtol29, затем Save. Load:29 есть, Lest скрыта, Lest_ten не вернулась из layout, State Lest необязательно1; Grandmother скрыта через Start Case1. Не выполнять K_lest/Addtol повторно |
| 10 | После разговора с Лорой | Level38 Lora2/Pank2/Cursor Lora7, завершённый K_talke. После Load первый разговор и Bandit2_Lora не повторяются; следующий Click Lora выбирает Case2. Остальные объекты/картинки хулиганов сохранены |
| 11 | Полный refresh | Из нового JS процесса тот же slot восстанавливает все сцены, inventory, карту/legacy marker, hidden visuals. Boot/newGame не перезаписывает slot; same-scene shortcut не мешает |
| 12 | Повреждённый Save | Неверный JSON/digest, truncation, отсутствующий MULT record, NaN в runtime DTO, дубли scene/object IDs → явная InvalidSave. Текущая игра и raw slot неизменны. Правильный digest при неверной shape тоже отклоняется |
| 13 | Несовместимая версия | storageVersion/schemaVersion/contentId/mapModel без разрешённой миграции → IncompatibleSave; без Init/default reset/autodelete/перезаписи |
| 14 | Save во время StartW | В native F2/F3 не открываются до poll, снявшего busy. Browser export возвращает Busy, bytes slot неизменны, Program/анимация не отменены. По завершении Save работает, Load без старого wait |
| 15 | Save во время Goto | Native разрешает при busy0, Load теряет маршрут/хвост. Browser MVP **отказывает** и не ставит deferred Save; явно проверить это отличие |
| 16 | Неблокирующий Start + Fclick | Во время сюжетной one-shot Save запрещён browser gate даже при busyfalse/programs inactive; callback исполняется в обычной сессии. После завершения Save/Load не доставляет прежний Fclick второй раз |
| 17 | Idle Animc | Ambient loop не блокирует Save навсегда. Load пересоздаёт его из Start, часы/frame cursor не обязаны совпасть; никаких snapshot active flags |
| 18 | Same-scene Load + ресурсы | Играть дальше в той же сцене, Load более раннего snapshot: State/inventory откатились, old program/audio disposed, candidate textures живы, resources count не растёт |
| 19 | Отмена/ошибка записи/два окна | Cancel/QuotaExceeded не меняют slot и мир. Конфликт slot обнаруживается до overwrite; нет ложного success или очистки других слотов |
| 20 | Async race / Load error | Запросить переход, затем Load; поздний fetch и WAV callback старого visit не входят в сцену и не запускают звук. Ошибка ресурсов кандидата до commit сохраняет старую игру |
| 21 | Lstate до первого посещения | Записать remote placeholder, Save/Load, впервые войти: перенести State, Init ровно1; не считать все экспортированные scenes посещёнными |
| 22 | Карта / новый день | Bank0 zone3 и bank1 zone3 разные unlocks, оба ряда переживают Save/Load; обычный Setmap не очищает другой ряд. Legacy save не выдаёт выдуманную banked карту |
| 23 | Entry events и legitimate replay | Level24 Ocno1: K_enter1 снова на Load — **ожидаемо в оригинале**. Level48 Interface1: Case0 не повторяется. Не запрещать Start глобально ради теста «ни одной анимации» |
| 24 | Snapshot не alias | Снять DTO, потом изменить inventory/objects/hero до digest/write: записан именно снимок момента capture, а не частично новый мир |
| 25 | NewGame после Load | Ни одного прежнего State/placeholder/item/map unlock, Init Level1 ровно1 в новой сессии; сохранённые slots побайтно не тронуты |

Для каждого completed-action checkpoint отдельно считать Init/Start/Click/Fclick и Addtol/Remtol/State события: **нулевой повтор прежнего Click/Init**, один новый Start, ожидаемые его ветки. Не сравнивать целый world JSON до/после Start слепо: оригинальные entry-команды могут законно изменять State и visuals.

## 12. Оставшиеся неизвестные и граница готовности

| Статус | Вопрос | Влияет на browser MVP? |
|---|---|---|
| UNKNOWN | Динамическая Windows-трасса F2 на Goto, кадр последнего StartW, дисковые отказы | Нет для доказанной static ветки; полезна независимая проверка, не подменять её наблюдением браузера |
| UNKNOWN | Реальные `.sav` и побайтовое roundtrip с оригинальной игрой | Нет; бинарный importer вне scope |
| UNKNOWN | Совместимость разных изданий EXE | Нет; browser contentId/version обязателен |
| UNKNOWN | Абсолютный Windows save path конкретной установки | Нет; известен relative CWD и его initialization route |
| UNKNOWN | Полное авторское назначение selector/backup и неиспользуемых opcode0xd/e | Нет для данного SCC corpus; не добавлять их как несуществующее browser state |
| UNKNOWN | Process-local RNG seed, точные audio/MP3 tails и resume после modal menu | Нет; они не сериализуются, browser scopes/Start определяют новый playback |
| UNKNOWN | Все malformed-resource/error-scene +0x741 пути и повреждённый native файл | Нет; browser обязан валидировать и не копировать memory corruption |
| DERIVED, ограничение порта | Исторический banked map и transform неактивных объектов, уже потерянные старой in-memory моделью | Не восстанавливать догадкой; legacy profile сохраняет текущую модель, полноценная native parity требует отслеживать эти данные с начала поддержанной сессии |

**Готовность для Luna:** адреса и порядок Save/Load, состав мира, gate и отсутствие VM persistence установлены; повторный реверс для реализации JSON save/load **не требуется**. Открытые вопросы отделены от обязательных seams. Критические правила: все scenes+placeholders; сохранённые images/Hide/Cursor, не только State; свежий runtime; Init не повторять; Start один раз; same-scene restore отдельно; никакой автоматической перезаписи прогресса.
