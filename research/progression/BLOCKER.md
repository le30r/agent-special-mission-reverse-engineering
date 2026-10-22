# P0 Level34: проверка блокировки прохождения

## Итог

**Блокировка всех штатных выходов Level34 на master `fc07ae4` не
воспроизведена.** Оба предусмотренных SCC выхода работают в Chromium без
правки runtime или ресурсов. Зависимость этих выходов от карты/видео
**опровергнута для проверенных состояний**. Нельзя честно назвать отсутствующую
карту или SclipW причиной пользовательского сбоя.

**CONFIRMED Chromium reconstruction:** `34→35`, `35→34→35`,
`34→Rub_off→To_8→8`, `34→Per_plat→Knopka→34→35` пройдены реальными CDP
mouse events. Начальная сцена задаётся debug setup, но сами переходы, изменения
состояний и ходьба выполняются обычным SCC и input pipeline. Это локальная
проверка маршрутов, **не полное прохождение от новой игры**.

**CONFIRMED static original:** выходы — `Level 35 1` и `Level 8 2`.
`To_48` не является третьим рабочим переходом. Rolik2 — сюжетная платформа,
не транспорт в следующую сцену. **UNKNOWN:** состояние/сохранение и конкретный
клик, на котором пользователь получил тупик; такой failing save не предоставлен.
Исходный Windows-процесс не запускался; dynamic parity не заявляется.

## Baseline и доказательства

- Чистый отдельный worktree от локального master `fc07ae4` (`Merge unified
  hit-testing pipeline`); не выполнялись fetch/merge/push.
- Agent.exe SHA-256 `71065c571a9cd40f460458d766720c0a01954e0bef521aad675b4ea6b3186e85`.
- REA/Ghidra 12.1.4, оригинальные SCC/MULT/TIF и AVI, read-only.
- [source-facts.json](evidence/source-facts.json): полные строки Level34 и
  include closure `Cursor.scc`, `Mainhero.scc`, `Step4.scc`, hashes,
  original PE table bytes, MULT records; без исполняемого Windows-процесса.
- [финальная Chromium trace](evidence/chromium-final/trace.json): snapshots
  состояний, actual selected target, coordinate/hit facts, animation history,
  active Programs, transition и cross-scene Lstate. `?debug=hitbox&audio=silent`;
  слуховая/A/V проверка не проводилась.
- [EXE input/executor](evidence/exe-first.json), [state dispatch](evidence/exe-fifth.json),
  [loader/entry](evidence/exe-fourth.json), [requested portal](evidence/exe-sixth.json),
  [executor assembly excerpt](evidence/executor-excerpt.json).

## Полный Level34: что действительно объявлено

Строки относятся к оригинальному `Scripts/Level34.scc` (CP1251).

| Раздел / handler | Условие и эффект | Выход? |
|---|---|---|
| Active To_8 :6 | cursor1, depth1000, rect754,308–772,550 | по Case1 |
| Active To_35 :7 | cursor2, depth1000, rect11,223–106,526 | по Case0 |
| Active To_48 :8 | cursor5, depth1000, rect214,10–302,195 | нет |
| Init Interface :112 | Case0, Start Startlevel; Show все 7 Active | нет |
| Click45 Mainhero :126 | Case0, Speak0 | нет |
| Start Interface :134 | Case0, Smusic1 empty.mp3 | нет |
| Start Knopka :141 | Case6, Cursor Knopka0 | нет |
| Start To_48 :148 | Case6, Cursor To_480 | нет |
| Start To_8 :155 | Case2, Gotoiz8, Setxy724544, Door_close, Hide Rub_on, To_8=0, depths Rub_off1400/Rub_on1450 | вход из8 |
| Start To_35 :168 | Case1, Gotoiz35, Setxy90544, To_35=0 | вход из35 |
| Click0 Ognet Interface :178 | Case0, Goto490485, K_ognet, Addtol52 | подбор |
| Click0 Per_plat Per_plat :188 | Case0, Goto260475, Hide Per_plat, K_dosca, Setxy260475, Per_plat=1 | подготовка платформы |
| Click0 To_48 Per_plat :200 | **Case2**, Goto260475, Speak_pula, Setxy | реплика |
| Click0 Knopka Per_plat :209 | Case1: K_verh→Rolik2→K_vniz→states; Case2: Speak_pula | сюжет, не Level |
| Click0 To_35 To_35 :233 | **Case0**, Goport1, Gotov35, Level35 1 | да |
| Click0 Rub_off Rub_off :242 | Case0, Goto664505, Rub_on, depths swap, Rub_on1, Setxy664505, Door_enter, To_8=1 | открывает дверь |
| Click0 Door To_8 :256 | **Case1**, Goport0, Gotov8, Level8 2 | да |
| Click0 To_8 To_8 :265 | **Case1**, та же программа | да |

Все Goport используют **текущие** portal declarations:
portal[0]=(dir4,x730,y542), portal[1]=(dir6,x88,y541), строки27–28.
Параметр `Level` — entry index **целевой** сцены, не номер текущей двери.

Fault Caption/Zep/Chit/To_48 (106–109) содержит соответственно
`otd_002/003/001/004.wav`; обработка fallback: no matching Program → fault
voice → synthetic Fault Program, не transition. При Per_plat2 у To_48 есть
явная программа Speak_pula, поэтому не generic Fault. Ни одна ветка To_48
не содержит `Level 48`. В собранном корпусе SCC вообще нет команды `Level 48`.
Утверждение «надо выйти вверх в Level48» противоречит этим ресурсам;
назначение отдельного Level48 как неиспользуемого/доступного внешним путём
**не установлено**, не исправлять сценарий по его имени.

MULT Startlevel назначает 7 объектов (Ognet, Platforma, Per_plat, Rub_off,
Rub_on, Stena_8, Zanaves), внешние TIF из `Tzu\Scn_34`. Рубильник — **Object
Rub_off**, а не прямоугольник Knopka. Knopka — другая, левая кнопка платформы.
Различие подтверждено MULT identity и отдельными SCC handlers. Depth0 и
cursor0 не одно и то же: не делать cursorId=0 общим запретом hit-test.

## Выход в Level35: точная цепочка

**Необходимые условия (CONFIRMED static):** idle scene busy0, Block0,
selected item0, To_35 visible, state To_35=0, клик строго внутри его rect и
отсутствие более переднего target на выбранном пикселе. Предмет/карта/видео
не требуются. Init показывает Active; возврат из35 (Lstate To_35=1)
проигрывает вход и сбрасывает его в0.

```text
WM_LBUTTONDOWN 0x40f204
 → UI game click 0x40cb84
 → Scene click 0x40a238 (busy/Block, обратный depth-sorted проход)
 → Active virtual hit 0x404c50 (visible + strict rect-scroll)
 → dispatch 0x4079ac(scene,0,0,"To_35")
 → 0x408cd8 → 0x408c8c: To_35.state0 / Case0
 → Program 0x405e5c: Goport1 (op0xc) → route to88,541
 → StartW Gotov35 (op1): yield until MULT/sound barrier complete
 → Level35 1 (op5): requested=35, 0x4096f4(scene35,1)
 → UI 0x40c974: unload34 0x4089cc → load35 0x407ffc
 → Init once → entry1 position 0x40868c → Start
```

**CONFIRMED Chromium:** логический клик `(15.5,227.5)` выбрал Active:To_35,
цель35@1, после Start герой `(775,450)` (entry behaviour, не ручной teleport).
Нативный SCC возврат из35 `To_34` (Level35:250–255) даёт `Level34 1;
Lstate To_35 1 34`; вход34 заканчивается `(90,544),To_35=0`, повторный выход
успешен. Не переносить эти координаты на любой CSS размер без canvas mapping.

## Выход в Level8: точная цепочка

**CONFIRMED static:** свежий/возвратный To_8=0 — простой клик на правую
зону пока не имеет matching Case. Нужно нажать **Rub_off** (Case0):

```text
реальный pixel hit Rub_off → dispatch → Goto664505
 → StartW Rub_on → Objzet Rub_off1450 / Rub_on1400
 → StartW Rub_on1 → Setxy664505 → StartW Door_enter
 → State To_8 1
 → новый клик Door ИЛИ Active To_8
 → Goport0 → StartW Gotov8 → Level8 2
```

Это те же input/dispatch/executor/loader функции, что выше. **CONFIRMED
Chromium:** Rub_off hit `(739.5,323.5)` → To_8=1, затем To_8 hit
`(755.5,311.5)` →8@2, итог `(464,367)`. SCC на входе8 может дополнительно
менять маску/позицию; не требовать голого portal pose после всех Start.

Обычный вход из8: `Gotox_a/Ohpana Case2`, Level8:231–238,
`Lstate To_8 2 34; Level34 0`, затем описанный Start To_8 Case2 закрывает
дверь и возвращает To_8=0. Полная сюжетная подготовка Ohpana2 в Chromium
этим probe **не проверялась**, в отличие от локальной цепи выхода34→8.

## Платформа/ролик — отдельный сюжетный механизм

**CONFIRMED original:** нажать Object Per_plat (Case0) → state1;
Active Knopka (handler проверяет **Per_plat**, не Knopka!) Case1:

```text
Goto260475 → Setxy260475 → StartW K_verh
 → SclipW0 Rolik2.avi
 → State Knopka2 → StartW K_vniz → Setxy260475 → Hide On_off
 → State Per_plat2
 → Lstate Manecen1 19; Bomsh4 19; Bomsh1 25; Baby1 35
```

Нет `Level`/Goport в хвосте. EXE video gate: [video README](../video/README.md).
**CONFIRMED Chromium:** после нынешнего one-poll stub все эти states
получены; Per_plat2/Knopka2 и external states присутствуют в trace, To_35
затем снова ведёт35. Значит stub нарушает **медиа и timing**, но не задерживает
этот хвост навсегда в проверенном сценарии. В Level25 другой ролик Rolik5
меняет Knopka/To_48 на6 при дальнейшей истории; это не условие обычного
To_35 Case0 и не новый выход. Cursor0 в Start не заменяет State/Case.

## Сопоставление с TypeScript

| Механизм | Native | Порт fc07ae4 | Связь с выходом34 |
|---|---|---|---|
| Init/Show Active | 407ffc / 405e5c | SceneLoader + SceneView | поддержан, проверен |
| click / depth / Active | 40a238 / 404c50 | SceneView.pointerDown + pickSceneTarget | поддержан, проверен |
| Case/State/Lstate | 408cd8 / 405b78 | SccRuntime + loader states | поддержан, проверен |
| Goto/Goport | 405e5c op2/0xc | navigation + SceneView.goport | поддержан, проверен |
| StartW / MULT | 405e5c op1 | SCC/player barrier | поддержан; silent audio run |
| Objzet / Fram depth | op0x13 / frame updates | existing depth pipeline | Rub_off работает |
| Level / entry | op5 →4096f4 | SceneSession deferred transition | оба выхода проверены |
| SclipW | op0x1b / global video | **один poll**, не настоящий player | расхождение, не exit root |
| Setmap/Setzon | bank + unlock matrix | storage/save уже есть, **нет map UI** | не вызываются выходами34 |
| Smusic | zvideo music graph | SCC команда пропускается | медиа-пробел, не exit root |
| Egame | UI session/menu gate | unsupported parser/runtime | Level28 ending, не выход34 |

Конкретное расхождение видео: `src/scc/runtime.ts` SclipW branch автоматически
снимает waiting на следующем poll, не вызывает EXE-equivalent controller.
Конкретное расхождение карты: `src/main.ts` нет F1/controller, при существующих
`SceneLoader.setMapBank/unlockMapZone` и banked save. Ничто из этого не стоит
в доказанных Program выходов34. Не писать patch, связывающий Level34 с картой
или автоматически выполняющий Level48.

## Минимальное исправление и дальнейший план

**Для проверенного master минимальный production patch выхода34: не нужен.**
Ветка исследования намеренно не меняет production. Для конкретного
пользовательского сбоя root cause остаётся **UNKNOWN**, а не «карта отсутствует».

1. Сначала сопоставить failing state/клик с trace: ревизия/контент save,
   выбранный item, busy/Block, active Programs/PC, To_35/To_8/Per_plat states,
   видимость, actual selected target. Не сбрасывать состояния для обхода.
2. Если не работает To_35: различить input rejection, wrong frontmost target,
   Case miss, незавершённую ходьбу/StartW и отказ loader. Исправлять только
   воспроизведённый слой; сейчас положительные маршруты все поддержаны.
3. Если ожидается To_48: оригинал не обещает там перехода; нужен дальнейший
   сюжет через платформу и доступные обычные выходы. Не добавлять Level48.
4. Полноценная карта: F1 modal UI + 7 native rects + bank unlocks + штатный
   loader/portal + close/save lifecycle — [map spec](../map/LUNA_SPEC.md).
5. Полноценное видео: offline AVI→browser assets + global clip lifecycle,
   game-tick suspension, skip/error barrier + ending Egame —
   [video spec](../video/LUNA_SPEC.md). Это отдельная работа, не доказанный
   минимальный patch Level34. MP4 feasibility уже проверена offline.
6. После реализации выполнить перечисленные acceptance cases; Windows-run
   отдельно нужен для A/V timing, смешивания аудио и сложных error paths.

## Воспроизводимый Chromium E2E

```sh
# При доступных оригиналах в agent-original:
pnpm install
pnpm prepare:assets
# Либо использовать уже подготовленные ресурсы той же ревизии read-only.
E2E_OUTPUT_DIR=research/progression/evidence/chromium-final node research/progression/probe-level34.mjs
```

Probe сам запускает изолированные Vite/Chromium с уникальным профилем и
OS-assigned CDP port, нажимает настоящие canvas targets и ждёт actual scenes/
завершение SCC Programs. Нет direct dispatch, ручного State или изменения SCC.
Для Rub_off ожидание **To_8=1**, а не только busy=false: Goto может оставаться
активным при busy=false. Для CDP клик центр логического пикселя +0.5:
иначе масштабирование CSS способно округлить edge-pixel в прозрачный сосед.

Сценарии: fresh34→35; click35.To_34→34→35; reload34→Rub_off→To_8→8;
reload34→Per_plat→Knopka→post-video-states→To_35→35.
Окончание `LEVEL34_EXIT_PROBE_PASS`, exit0. Это не тест реального AVI,
а тест доступности выходов в существующем reconstruction с one-poll stub.

Все сокеты/owned процессы закрыты, Chromium завершён перед удалением своего
профиля; disposable dirs очищены через `scripts/lib/e2e-resources.mjs`.
Явные E2E_OUTPUT_DIR — сохранённое evidence, не подлежат автоматическому
удалению. Первые исследовательские прогоны были скорректированы из-за
раннего ожидания/edge click; их timeout **не считается багом runtime**.
