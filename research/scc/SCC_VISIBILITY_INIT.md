# SCC: Show/Hide, поля видимости/интерактивности и выполнение Init

Дата: 18 октября 2026 (ревизия 2 — техническая проверка). Basic Memory: проект `agent-reverse`.

Объект анализа — оригинальный PE32/x86 `agent-original/game-installed/Program_Executable_Files/Agent.exe`, SHA-256 `71065c571a9cd40f460458d766720c0a01954e0bef521aad675b4ea6b3186e85`, image base `0x400000`. Адреса ниже — VA. REA/Ghidra **12.1.4**, профиль `4f6212bfe31448a7b96743a449e91c35890105cedd34e1d9951e9467d284e0a5`. Оригинальный Windows-процесс **не запускался**: `CONFIRMED` = машинный код / исходный SCC, не runtime-наблюдение.

Машиночитаемая выжимка и все REA evidence ID — [`evidence/visibility-init/evidence.json`](evidence/visibility-init/evidence.json).

Использованы ранее установленные факты: [SCC_RUNTIME](SCC_RUNTIME.md), [SCENE_TRANSITIONS](../transitions/SCENE_TRANSITIONS.md), [OBJECT_DEPTH](../rendering/OBJECT_DEPTH.md). Эти подсистемы не переанализировались.

> **Ревизия 2.** Внесены исправления по результатам адресной проверки: (1) `+0x297` **входит** в сериализацию save/load (прежнее утверждение §3.4 было ошибочным); (2) уточнена система координат и строгие границы hit-test; (3) уточнены последствия `Hide` для базового `Object`; (4) разделены in-memory персистентность и save-файл. Полный список — в §11.

## 1. Формат и семантика Show/Hide

### 1.1. Лексика — CONFIRMED (static)

Парсер `0x4066c8` вычисляет хеш токена через `0x4058d8` (веса `1000,100,10,1,1,1`, регистрозависимый). Подтверждённые хеши:

| Команда | Хеш | Ветка парсера | Opcode |
|---|---|---|---|
| `Show <name>` | `0x171a5` | `0x4074f3` | `0x1e` |
| `Hide <name>` | `0x14691` | `0x4074c3` | `0x10` |
| `Setzon <int>` | `0x1718b` | `0x407873` | `0x20` |
| `SclipW <int> <avi>` | `0x1704c` | `0x407810` | `0x1b` |
| `Smusic <int> <mp3>` | `0x1749d` | `0x407794` | `0x17` |

Обе команды читают ровно один токен `%s` — имя объекта (`0x444aeb`). Числовых аргументов у `Show`/`Hide` нет.

### 1.2. Исполнение — CONFIRMED (static)

Исполнитель `0x405e5c` (таблица `0x405ea1`):

```asm
; case 0x10 (Hide) — 0x406508
CALL 0x0040a8dc        ; findObject(scene, name)
TEST EAX, EAX
JZ  0x004065c8         ; не найден -> пропустить
PUSH EAX               ; this = объект
MOV  ECX, [EAX]        ; ECX = vtable
CALL [ECX+0x14]        ; vtable[0x14] == Hide
; case 0x1e (Show) — 0x40653b, идентично, CALL [ECX+0x18] == Show
```

Нормализованно: `object = findObject(scene, name); if (object) object->vtable[Show? +0x18 : +0x14]();`

Обе команды **не блокируют** Program (нет записи `pc`/`return`): следующий опкод исполняется в том же вызове.

### 1.3. Виртуальные методы — CONFIRMED (static)

`+0x297` — байтовый флаг видимости у «интерактивных» типов. Базовый `Object` имеет размер `0x287` и поля `+0x297` не содержит.

| Тип | vtable | Hide (slot +0x14) | Show (slot +0x18) |
|---|---|---|---|
| `Active` | `0x443e20` | `0x404d70`: `byte[obj+0x297]=0` | `0x404d80`: `byte[obj+0x297]=1` |
| `Light` | `0x443e84` | `0x403f70`: `byte[obj+0x297]=0` | `0x403f80`: `byte[obj+0x297]=1` |
| `Object` (базовый) | `0x443e54` | `0x40576c`: `byte[obj+0x167]=0` | `0x40577c`: **no-op** |

Асимметрия базового `Object` — **CONFIRMED** (байты `0x40577c`: `PUSH EBP; MOV EBP,ESP; POP EBP; RET` — пустая функция):

- `Hide <Object>` очищает **первый байт** `+0x167` (начало имени MULT) → имя становится пустым → объект перестаёт отрисовываться и попадать в hit-test.
- `Show <Object>` — no-op. Базовые объекты «показываются» только назначением MULT-кадра (`Startlevel`/`Start`/кадровые `Fram`), **не** командой `Show`.

По корпусу SCC `Show` применяется почти исключительно к `Active`/`Light`; однако есть **контрпример**: `Level7.scc:91` вызывает `Show Vaza` при объявлении `Object Vaza 5 140` (Level7.scc:11). В оригинале этот вызов — **no-op** (побочного эффекта нет). Точная формулировка: *в корпусе `Show` на базовом `Object` встречается единожды и не имеет эффекта; все остальные вызовы адресованы `Active`/`Light`.*

## 2. Поля видимости и интерактивности объекта

| Смещение | Тип | Смысл | Источник записи |
|---|---|---|---|
| `+0x004` | int | `State` (для `Case`) | `State`/`Lstate` (`0x405b78`) |
| `+0x108` | int (знак) | глубина; hit-test требует `abs>0` | объявление, `Objzet`, `Fram end=-1`, маска героя |
| `+0x14e` | ptr | кэш указателя изображения (пересчитывается) | hit-test/renderer |
| `+0x152` | int | cursor ID | объявление, `Cursor` |
| `+0x167` | char[256] | имя MULT (ссылка на изображение, базовый `Object`) | `0x404928`, `Hide <Object>` |
| `+0x267` | int | номер кадра MULT | `0x404928` |
| `+0x26b` | int | номер записи MULT | `0x404928` |
| `+0x277/+0x27b` | int | объектные X/Y | save/load, размещение |
| `+0x27f/+0x283` | float | scale X/Y | save/load, маска |
| `+0x287` | int | rect.left (`Active`) | объявление |
| `+0x28b` | int | rect.top (`Active`) | объявление |
| `+0x28f` | int | rect.right (`Active`) | объявление |
| `+0x293` | int | rect.bottom (`Active`) | объявление |
| `+0x297` | byte | **флаг видимости** (`Active`/`Light`) | конструктор (`=0`), `Show` (`=1`), `Hide` (`=0`), save/load |

Конструктор `Active` `0x404bf0` (`Active Goto_5 3 230 1350 180 1450 280`): базовый конструктор `0x404150` пишет `+0x152=3`, `+0x108=230`; vtable `0x443e20`; копия прямоугольника в `+0x287/+0x28b/+0x28f/+0x293`; **`+0x297=0` (скрыт по умолчанию)**.

## 3. Связь с рендерингом и hit-test

### 3.1. Рендеринг `Active` — CONFIRMED (static)

`Active`-рендер (vtable slot +4) `0x404ce0` — **no-op**. `Active` — невидимая интерактивная область; её «видимость» означает только доступность для hit-test.

### 3.2. Hit-test `Active`: точная семантика — CONFIRMED (static)

Вызов в `0x40a238` (VA):

```asm
0x40a242 MOV EAX,[EBP+0xc]        ; screenX (RAW, из lParam)
0x40a245 MOV EDX,[EBX+0x766]      ; scene.scrollX
0x40a24b ADD EAX,EDX              ; worldX = screenX + scrollX
0x40a24d MOV [EBP-0x4],EAX        ; worldX — используется ПОЗЖЕ (pathfinding 0x409964,
                                  ;   dispatch 0x408350), НЕ для hit-test
...
0x40a298 LEA EAX,[EBX+0x75e]      ; &scene.W (W=+0x75e, H=+0x762)
0x40a29e LEA EDX,[EBX+0x766]      ; &scene.scrollX (scroll[0]=+0x766, scroll[1]=+0x76a)
0x40a2a4 PUSH EAX                 ; arg5 = &size[W,H]  (не используется Active)
0x40a2a5 PUSH EDX                 ; arg4 = &scroll[scrollX,scrollY]
0x40a2a6 MOV ECX,[EBP+0x10]       ; screenY
0x40a2a9 PUSH ECX                 ; arg3 = screenY (RAW)
0x40a2aa MOV EAX,[EBP+0xc]        ; screenX (RAW, повторно)
0x40a2ad PUSH EAX                 ; arg2 = screenX (RAW)
0x40a2ae MOV EDX,[ESI]            ; object
0x40a2b0 PUSH EDX                 ; arg1 = object
0x40a2b1 MOV ECX,[EDX]            ; vtable
0x40a2b3 CALL [ECX+0x8]           ; hit-test(object, screenX, screenY, &scroll, &size)
0x40a2b6 ADD ESP,0x14             ; 5 аргументов
```

`0x404c50` (точный ассемблер):

```asm
0x404c71 MOV ECX,[EDX]            ; scroll[0] = scrollX
0x404c73 MOV ESI,[EAX+0x287]      ; left
0x404c79 SUB ESI,ECX              ; left' = left - scrollX
0x404c7e MOV ESI,[EDX+4]          ; scroll[1] = scrollY
0x404c81 MOV EDI,[EAX+0x28b]      ; top
0x404c87 SUB EDI,ESI              ; top' = top - scrollY
0x404c8c MOV EDI,[EAX+0x28f]      ; right
0x404c92 SUB EDI,ECX              ; right' = right - scrollX
0x404c97 MOV ECX,[EAX+0x293]      ; bottom
0x404c9d SUB ECX,ESI              ; bottom' = bottom - scrollY
0x404ca2 MOV AL,[EAX+0x297]       ; флаг видимости
0x404ca8 TEST AL,AL
0x404caa JZ  0x404cce             ; скрыт -> 0
0x404cac MOV EDX,[EBP-0x10]       ; left'
0x404caf CMP EBX,EDX              ; screenX vs left'
0x404cb1 JLE 0x404cce             ; screenX <= left' -> 0  (СТРОГО)
0x404cb3 MOV EAX,[EBP-0x8]        ; right'
0x404cb6 CMP EBX,EAX              ; screenX vs right'
0x404cb8 JGE 0x404cce             ; screenX >= right' -> 0 (СТРОГО)
0x404cba MOV EDX,[EBP+0x10]       ; screenY
0x404cbd MOV ECX,[EBP-0xc]        ; top'
0x404cc0 CMP EDX,ECX
0x404cc2 JLE 0x404cce             ; screenY <= top' -> 0  (СТРОГО)
0x404cc4 MOV EAX,[EBP+0x10]       ; screenY
0x404cc7 MOV EDX,[EBP-0x4]        ; bottom'
0x404cca CMP EAX,EDX
0x404ccc JL  0x404cd2             ; screenY < bottom' -> 1
0x404cce XOR ECX,ECX              ; 0
```

Точный TypeScript-псевдокод:

```typescript
function activeHitTest(obj, screenX, screenY, scrollX, scrollY): boolean {
  if (!obj.visible) return false;                       // obj+0x297 === 0
  const left   = obj.left   - scrollX;                  // +0x287 - scroll[0]
  const right  = obj.right  - scrollX;                  // +0x28f - scroll[0]
  const top    = obj.top    - scrollY;                  // +0x28b - scroll[1]
  const bottom = obj.bottom - scrollY;                  // +0x293 - scroll[1]
  // строгие границы (JLE/JGE в оригинале): точки на границе НЕ попадают
  return screenX > left && screenX < right && screenY > top && screenY < bottom;
}
```

Ответы на подвопросы §2 (ревизия):

- **Система координат аргументов**: `screenX`/`screenY` — **сырые экранные координаты** мыши (из lParam окна), **без** учёта scroll. Мировые координаты (`screenX + scrollX`) вычисляются в `0x40a238` отдельно и используются только для pathfinding/диспатча, не для hit-test.
- **Где учитывается scrollX**: внутри hit-test, как `rect - scroll[0/1]`. Поле scroll — массив `[scene+0x766=scrollX, scene+0x76a=scrollY]` (scrollY всегда 0 — вертикальной прокрутки нет).
- **Двойная прокрутка при портировании**: да, возможна. Если порт предварительно прибавляет scrollX к X и одновременно реализует hit-test как `screenX - scrollX > left` (или наоборот), scroll применится дважды. Контракт: hit-test получает **сырые** screenX/screenY и вычитает scroll ровно один раз.
- **Границы**: строгие со всех сторон: `left < X < right`, `top < Y < bottom`; точки точно на границе (равенство) — промах.

Пример `Goto_5`: rect world `(1350,180)-(1450,280)`, scrollX в момент клика переменный. При `scrollX=0` клик попадает при `1350 < screenX < 1450` и `180 < screenY < 280`. При ненулевом scrollX экранный диапазон сдвигается влево.

### 3.3. Повторные Show/Hide — CONFIRMED (static)

Обе команды — идемпотентная запись байта; счётчиков/очередей нет. `Show`/`Hide` несуществующего объекта молча пропускается.

### 3.4. Персистентность видимости: два механизма — CONFIRMED (static)

Разделяются **два независимых механизма**:

1. **In-memory персистентность при переходах сцен.** Структура объекта живёт в структуре сцены и переживает переход; повторный вход (`scene+4==1`) пропускает объявление `Active` и не перезапускает `Init`. Поэтому `+0x297` сохраняет значение от первого входа (`Goto_5` остаётся показанным после `1→39→1`).

2. **Сериализация в save-файл.** **`+0x297` сериализуется.** `Active::Save` `0x404ce8` пишет его (1 байт), `Active::Load` `0x404d2c` читает:

```asm
; 0x404ce8 (Save)
CALL 0x40422c                  ; базовый Object save
; write rect: PUSH size=0x10, PUSH &obj+0x287, CALL 0x438e28
; write flag: PUSH size=0x1,  PUSH &obj+0x297, CALL 0x438e28
; 0x404d2c (Load) — симметрично: 0x404318, read rect 0x439004, read +0x297 0x439004
```

Базовый `Object::Save` `0x40422c` пишет (в порядке): `+0x4` (state), `+0x108` (depth), `+0x277/+0x27b` (X/Y), `+0x27f/+0x283` (scale), `+0x152` (cursor), `+0x8` (name, 256), `+0x167` (MULT name, 256), `+0x267` (frame), `+0x26b` (record). То есть и «скрытость» базового `Object` (пустое `+0x167`) сохраняется в save.

**Исправление ревизии 1**: прежнее утверждение «`+0x297` не входит в сериализацию save/load» было **ошибочным**. Верно: флаг сериализуется (и сохраняется в памяти при переходах).

## 4. Семантика выполнения Init

### 4.1. Init — обычный Click-handler — CONFIRMED (static)

`Click 0 Init Interface` = handler с `eventName="Init"`, `itemId=0`, `stateObject="Interface"`, `Program[0..49]`. Никакого отдельного Init-механизма нет.

### 4.2. Dispatch Init из загрузчика — CONFIRMED (static)

`0x407ffc`:

```asm
0x408100 MOV AL,[ESI+0x4]      ; scene+4
0x408103 TEST AL,AL
0x408105 JNZ 0x408119          ; повторный вход -> пропустить Init
0x408107 PUSH 0x444b7b         ; "Init"
0x40810c PUSH 0                ; executionMode=0
0x40810e PUSH 0                ; selectedItemId=0
0x408110 PUSH ESI              ; scene
0x408111 CALL 0x4079ac         ; dispatch(scene, 0, 0, "Init")
```

Порядок в `0x407ffc`: сброс runtime → разбор SCC `0x4066c8` → preload `0x4083bc` → `0x4084c0` → `0x4081c8` → **dispatch Init** → размещение из `Portal`/сохранённая позиция → dispatch `"Start"` (`0x444b80`) → запуск `Arrow` → `scene+4=1`.

### 4.3. Синхронность до первого yield — CONFIRMED (static)

`0x408cd8` → `0x405d30` (active=1, waiting=0, mode, pc=0) → сразу `0x405e5c` до первой команды, возвращающей управление.

Init Level1 (синхронно до `SclipW`):

```text
Setzon 3 · Start Startlevel · Show Goto_5 (+0x297=1) · Show Goto_10 · Show Goto_29
· Show Nar · Show Naruchniki · Show Light0 · Show Morda · Show Flag1 · Setxy 1199 524
· SclipW 0 Rolik1.avi  → yield
[после видео] Start Slip · Smusic 1 1.mp3 · State Stat_v 1 · State Slip 1
```

`Show Goto_5` гарантированно выполняется до размещения из Portal и dispatch `Start`.

### 4.4. Жизненный цикл Init и блокирующего SclipW — CONFIRMED (static) + различие порта

**Точная оригинальная семантика:**

```text
dispatch Init (0x4079ac)  →  синхронное исполнение до SclipW  →  SclipW yield
  →  loader продолжает: Portal placement (0x40868c) / сохранённая позиция
  →  dispatch "Start" (0x4079ac)  →  запуск Arrow  →  scene+4=1
  →  на последующих тиках приостановленный Init продолжается после окончания видео
```

Приостановленный Init (на SclipW) и программы обработчиков `Start` — **разные Program-объекты в разных handler**. Планировщик тика `0x40a76c → 0x408d24 → 0x405e5c` обходит **все** handler и **все 50** слотов Program и исполняет каждый активный. Общего мьютекса, запрещающего параллельные программы, нет. Общие флаги — только узкие: `scene+0x709` (busy, ставит `StartW`, не SclipW), глобальные `DAT_00444690`/`DAT_00446254` (одно видео одновременно). Таким образом Init и Start **в принципе могут** быть активны одновременно.

На **свежем** Level1 dispatch `Start` не активирует ни одной программы: `Click 0 Start Stat_v` (Case 1), `Click 0 Start Slip` (Case 1), `Click 0 Start Lec_v` (Case 2) — все состояния объектов равны 0, подходящего `Case` нет. Поэтому на первом входе активен только Init.

**Допустимое временное упрощение для порта и его следствие:**

Если порт трактует `SclipW` как no-op (не блокирует), Init исполняется **до конца синхронно**: `State Stat_v 1` и `State Slip 1` выполняются **до** dispatch `Start`. Тогда dispatch `Start` **найдёт** `Click 0 Start Stat_v` (Case 1 → `Smusic 1 1.mp3`) и `Click 0 Start Slip` (Case 1 → `Start Slip`) и исполнит их повторно. В оригинале этого не происходит (состояния ещё 0). Различие: `Start Slip` и `Smusic` выполняются **дважды**, и порядок `State` сдвигается раньше. Для доступности `Goto_5` это несущественно; но это документированное отклонение, а не точная эмуляция.

Минимально-безопасный способ избежать двойного срабатывания: либо сохранить блокировку `SclipW` (однократный yield с последующим продолжением), либо исполнять Init и Start в одном синхронном проходе **до** перечитывания `State` обработчиками `Start` (что и происходит в оригинале из-за блокировки).

## 5. Минимальная семантика Setzon / SclipW / Smusic

### 5.1. Setzon — CONFIRMED (static) запись; DERIVED (не доказано отсутствие влияния)

Opcode `0x20`, `0x40659b`:

```asm
MOV EAX,[EBX+0x4]        ; значение
MOV ECX,[0x00468788]     ; глобальный указатель игрового/UI-объекта
MOV [ECX+0x21],EAX       ; gameObject+0x21 = zone
```

Не блокирует. Единственный писатель поля `gameObject+0x21` — сама команда Setzon (xrefs на `0x468788`: только исполнитель и window-proc `0x40f204`). В цепочке Goto_5 (Show → `+0x297` → `0x404c50` → `0x4079ac` → `0x408cd8` → `Goto`/`Level`) поле `gameObject+0x21` **не читается**.

**Однако** читатели поля в window-proc `0x40f204` полностью не прослежены, поэтому **категорически доказать** «Setzon не влияет на доступность Goto_5» нельзя. Статус: **DERIVED** — поле не на критическом пути, риск низкий, но не нулевой. Рекомендация: реализовать как сохранение int в отдельный регистр `zone` (дешевле, чем доказывать no-op) либо явно задокументировать no-op как риск. Аргументы `0..6` в корпусе.

### 5.2. SclipW — CONFIRMED (static), видео, БЛОКИРУЕТ

Opcode `0x1b`. Первый вход: `0x40fc8c(имя_avi)` создаёт видеообъект (`DAT_00446254`), сохраняет `pc`, ставит `DAT_00444690=1`, `yield`. Далее: пока `[0x446254]!=0` — `yield`; когда видеообъект обнулён — снять флаг и продолжить. `0x40fc8c`: `0x402640(имя,buf)` резолвит файл; при неудаче — бездействие; иначе аллоцирует объект, кладёт в `DAT_00446254`, запускает `0x4023b8`.

Видео; для доступности перехода не нужна. Минимальный контракт: no-op (см. §4.4 о побочном эффекте двойного `Start Slip`/`Smusic`) либо однократный yield+продолжение.

### 5.3. Smusic — CONFIRMED (static), музыка, не блокирует

Opcode `0x17`, `0x40645f`: `0x402768(*(0x461680), имя_mp3, A>0)`. `0x402768` при отличии имени копирует его в менеджер, пишет `+0x201=loop`, `+0x20a=1` (старт). Аудио, не блокирует. Минимальный контракт: no-op.

## 6. Полная цепочка активации Goto_5 (Level1)

```text
(1) Первичная загрузка Level1 (0x40c6e4 → 0x407ffc(scene1,1), scene+4==0)
      ├─ разбор SCC 0x4066c8: создан Active Goto_5 (rect 1350,180..1450,280,
      │   depth 230, cursor 3, +0x297=0 СКРЫТ), зарегистрированы Click 0 Init Interface,
      │   Click 0 Goto_5 Goto_5
(2) dispatch Init → 0x4079ac(scene,0,0,"Init") → 0x408cd8 (itemId 0, state(Interface)=0)
      └─ 0x405e5c синхронно: Setzon 3 · Start Startlevel · Show Goto_5 (+0x297=1!) · ...
         · Setxy 1199 524 · SclipW (yield)
(3) Goto_5 кликабелен: 0x404c50 видит +0x297=1 и строгий rect (screenX>left-scrollX, ...)
(4) Клик → 0x40f204 → 0x40cb84 → 0x40a238: hit-test (vtable+8=0x404c50) → dispatch(scene,0,scene+5=0,"Goto_5")
(5) 0x4079ac → 0x408cd8: state(Goto_5)∈{0,1}, itemId 0==selectedItem 0 → Case 0/1 → Goto 1250 150 → Level 39 0
(6) Следующий проход 0x40c974: смена сцены → 0x407c14(старая) → 0x407ffc(Level39,1)
```

Условия срыва (все CONFIRMED как ветки): `Show Goto_5` не выполнен (`+0x297=0`); `selectedItem!=0`; `Goto_5.state∉{0,1}`; Program отменён (`0x408d58`) или `scene+0x709` busy; путь `Goto 1250 150` не завершён (`scene+0x72e>0`). Проверка предмета: `0x40a238` передаёт `*(scene+5)` (0 без предмета). Состояние для Case: `0x408c8c` читает `Goto_5+4` (свежий 0). `Level 39 0` (opcode 5) — повторно не анализировался.

## 7. Контракт реализации для браузерного SCC Runtime

1. **`Active`**: хранить rect (`left/top/right/bottom`) и `visible` (по умолчанию `false`).
2. **Show/Hide**: `Show`→`visible=true`; `Hide`→`visible=false`. Базовый `Object`: `Hide` очищает имя MULT (`+0x167`), `Show` — no-op. Несуществующее имя — пропустить.
3. **Hit-test `Active`**: `visible` первым; затем **сырой** screenX/screenY против `rect - scroll` (scrollX применить ровно один раз); **строгие** границы (`>`, `<`). Прямоугольник в мировых координатах, преобразование `rect - scroll`.
4. **Рендер `Active`**: не рисовать.
5. **Init как Program**: при первом входе (`scene+4==0`) исполнять handler `eventName="Init"` через общий Click-механизм синхронно до yield.
6. **Порядок загрузчика**: разбор → preload → dispatch Init → Portal/позиция → dispatch Start → Arrow.
7. **SclipW/Smusic/Setzon**: см. §5; SclipW — no-op/один yield; Smusic — no-op; Setzon — сохранить int или no-op с риском.
8. **Персистентность**: `visible` сохраняется в `SceneState` (переживает переходы) и, при реализации save/load, сериализуется вместе с rect (и для базового `Object` — MULT name/frame/record).

## 8. Проверяемые тестовые сценарии

1. После разбора `Active Goto_5`: `visible=false`, rect `(1350,180)-(1450,280)`, depth 230, cursor 3, state 0.
2. Dispatch `Init` (первый вход) до yield: `Goto_5.visible==true`; герой в `(1199,524)`; Program приостановлен на SclipW.
3. `Show`/`Hide` идемпотентность; `Hide Goto_5`→`false`, `Show Goto_5`→`true`.
4. Hit-test: скрытый `Active` не попадает нигде; показанный попадает только при `left<screenX<right && top<screenY<bottom` (после `-scrollX`); граница (равенство) — промах; прокрутка применяется один раз.
5. `Click 0 Goto_5 Goto_5`: state 0 + selectedItem 0 → Program[0]; selectedItem 1 → нет; state 2 → нет.
6. После `Goto 1250 150` + конец пути: `Level 39 0` → scene 39, portal 0; смена отложена до границы цикла.
7. Цикл `1→39→1`: `Goto_5.visible` остаётся `true`; Init не переигрывается; позиция из `Portal[1]`.
8. Базовый `Object`: `Hide Mainhero` очищает имя MULT (frame/record сохраняются); следующий кадр анимации восстанавливает изображение; до этого hit-test возвращает 0.
9. save/load `Active`: `visible` и rect восстанавливаются из файла.

Браузерный E2E: при первом входе Level1 клик по выходу `(1350..1450, 180..280)` запускает `Goto 1250 150` и переход в Level39 без отладочных кнопок.

## 9. Неразрешённые вопросы

| Статус | Вопрос | Проверка |
|---|---|---|
| DERIVED (риск) | Читатели `gameObject+0x21` (Setzon) в window-proc не прослежены; категорическое «не влияет на Goto_5» не доказано | проследить все чтения `[0x468788]+0x21` |
| UNKNOWN | Точный смысл `scroll[1]` (`scene+0x76a`, всегда 0) и `size[W,H]` для Active (не используется) | подтвердить отсутствие вертикальной прокрутки |
| UNKNOWN | Поведение `SclipW` при отсутствующем AVI и его влияние на тайминг Init | read-only replay без `Rolik1.avi` |
| UNKNOWN | Намеренность no-op `Show Vaza` (Level7) на базовом Object | не требуется для Goto_5 |

## 10. Краткий ответ на вопросы исследования

1. **Формат**: `Show <name>` / `Hide <name>` — один строковый аргумент; opcodes `0x1e`/`0x10`; виртуальные методы объекта.
2. **Поля**: `Active`/`Light` — байт `+0x297`; базовый `Object` — `+0x167` (имя MULT).
3. **Рендеринг/hit-test**: `Active` не рисуется; `0x404c50` проверяет `+0x297` первым, затем **строгий** прямоугольник `rect-scroll`; базовый `Object` — пиксельный hit-test, пустое имя MULT → промах.
4. **Init**: обычный `Click 0 Init Interface`, синхронно до первого yield (SclipW); Init и Start-программы могут сосуществовать; на свежем Level1 Start не активируется.
5. **Setzon/SclipW/Smusic**: не на критическом пути Goto_5; Setzon — DERIVED (риск), SclipW блокирует, Smusic нет.
6. **Цепочка Goto_5**: `Show` → `+0x297=1` → hit-test → dispatch → `Case 0/1` → `Goto` → `Level`.
7. **Повторы**: идемпотентная запись; несуществующее имя пропускается.
8. **Переходы сцен**: `+0x297` сохраняется в памяти и сериализуется; Init не переигрывается.
9. **Object vs Active**: `Active` — флаг `+0x297` (симметричный Show/Hide); `Object` — очистка имени MULT, `Show` no-op.

## 11. CONFIRMED BEFORE → CORRECTED / CONFIRMED AFTER

| Вывод | Было (ревизия 1) | Стало (ревизия 2) | Уровень |
|---|---|---|---|
| Сериализация `+0x297` | «не входит в save/load» (§3.4), при этом §9 UNKNOWN — противоречие | **Входит**: `Active::Save 0x404ce8`/`Active::Load 0x404d2c` пишут/читают 1 байт `+0x297` (+ rect 16 байт); базовый `Object::Save 0x40422c` сериализует `+0x167/+0x267/+0x26b` и др. | CONFIRMED |
| Координаты hit-test | «X прибавляется scrollX» (неоднозначно) | Hit-test получает **сырые** screenX/screenY; scroll вычитается **внутри** из rect (`rect - scroll[0/1]`); worldX=screenX+scrollX используется только для pathfinding | CONFIRMED |
| Границы rect | не специфицировано | **Строгие** (`left<X<right`, `top<Y<bottom`; равенство — промах), JLE/JGE | CONFIRMED |
| Двойная прокрутка | не отмечена | Возможна при портировании; hit-test применяет scroll ровно один раз | CONFIRMED (риск) |
| `Hide` базового Object | «очищает изображение» (неточно) | Очищает **первый байт** `+0x167`; `+0x267` (frame)/`+0x26b` (record) **остаются**; следующий кадровый event `0x404928` восстанавливает изображение; hit-test `0x40445c` с пустым именем → ранний return 0 | CONFIRMED |
| «Show только Active/Light» | категорично (§1.3), ниже контрпример Level7 | Уточнено: в корпусе один `Show` на базовом Object (`Level7 Show Vaza`) — no-op | CONFIRMED |
| Setzon «не влияет на Goto_5» | CONFIRMED (§5.1) | **DERIVED** (риск): единственный писатель, не на критическом пути, но читатели `gameObject+0x21` не прослежены | DERIVED |
| Init/SclipW при пропуске | не отмечено | Пропуск SclipW ведёт к двойному `Start Slip`/`Smusic` (State устанавливаются до dispatch Start) | CONFIRMED (различие) |
| Приостановленный Init после re-entry | не отмечено | Освобождается при `0x407c14` (старый Program удаляется), не возобновляется | CONFIRMED |

Кратко для реализации (Flash): `Active` — rect + `visible` (дефолт false); Show/Hide — флаг; hit-test — `visible` первым, затем строгий `rect - scroll` по сырым screen-координатам; Init — синхронный Program при `scene+4==0`; SclipW/Smusic — no-op (с учётом двойного `Start Slip`/`Smusic`); Setzon — сохранить int или no-op с явным риском; `visible` (и rect) персистентны и сериализуемы.
