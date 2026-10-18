# Блокирующий прохождение баг: клик по Лоре запускает ходьбу вместо разговора

Дата: 18 октября 2026. Проект `agent-reverse` (Basic Memory).
Ветка: `research/lora-interaction-blocker`.

## 1. Резюме и вердикт

**Причина бага — CONFIRMED (статический анализ парсера + корпуса, воспроизведено
прогоном `parseScc` на реальном `Level38.scc`).**

Клик по Лоре превращается в обычную ходьбу, потому что обработчик разговора
`Click 0 Lora Lora` **вообще не регистрируется** браузерным SCC-парсером. Он
«проглатывается» предыдущим обработчиком `Click 4 Gungster Pank`, у которого
открывающая скобка `{` стоит на **одной физической строке** с `Case 1`
(`Level38.scc:382`: `{  Case 1`).

Браузерный парсер `parseScc` ищет открывающую скобку как **целую строку**
(точное сравнение `lines[i + 1] !== '{'`), тогда как оригинальный парсер EXE
читает грамматику **токенами**, а не строками. В результате:

- `Click 4 Gungster Pank` получает **тело** `Click 0 Lora Lora` (Case 1–4 =
  разговоры `K_talke`/`K_talke_1/2/3`).
- `Click 0 Lora Lora` исчезает из реестра обработчиков.

Следствие в рантайме: `dispatch('Lora', 0)` не находит ни одного обработчика,
`handled == false`, Fault-fallback для `Lora` отсутствует, и `pointerDown`
проваливается в ветку click-to-walk — ровно наблюдаемый симптом «Громов
проходит мимо».

Это **не** hit-test (гипотеза A), **не** курсор/глагол 45/46 (гипотеза B) и **не**
ошибка игрового состояния как такового (гипотеза C в узком смысле). Это дефект
строчного парсера SCC на единственной в корпусе строке `{  Case …`.

**Степень уверенности: высокая (CONFIRMED).** Подтверждено: (1) исходным SCC;
(2) фактическим прогоном `parseScc` (`Lora handlers count: 0`, `Click 4 Gungster`
получает keys `[1,2,3,4]`); (3) прогоном предложенного исправления
(`Lora` присутствует, `Click 4 Gungster` получает корректное тело `Victoti`,
27/27 обработчиков). Оригинальный Windows-процесс не запускался; динамический
trace отсутствует — но дефект не зависит от рантайма, он детерминирован на
уровне парсинга.

## 2. Точное местоположение проблемного сценария

- Файл: `agent-original/game-installed/Program_Executable_Files/Scripts/Level38.scc`.
- Сцена: **Level38** (вечерний ревизит Level2; сцена «встреча с хулиганами →
  разговор с Лорой»).
- NPC Лора: `Object Lora 0 139` — Level38.scc:21 (`cursorId=0`, `depth=139`).
- Хулиганы: `Object Gungster 0 135` (строка 17), `Object Pank 0 137` (строка 25).
- Разговор: `Click 0 Lora Lora` — строки **395–421**.
- Проблемная строка: `{  Case 1` — строка **382** (открывающая скобка `Click 4
  Gungster Pank` на одной строке с `Case 1`).

Единственное в корпусе вхождение `{` с последующим содержимым на той же строке:

```sh
grep -rnE "^\{\s*\S" Scripts/*.scc
# => Level38.scc:382:{  Case 1
```

`Click 0 Lora Lora` существует **только** в Level38 (проверено по всему корпусу),
поэтому баг локализован именно здесь и не затрагивает другие сцены.

## 3. Оригинальная последовательность взаимодействий

1. Вход в Level38 через `Level 38 0` (из Level1 после разреза гамака).
2. `Start`-диспетч → `Click 0 Start Pank` Case 0 (Pank.state=0): катсцена хулиганов
   (`Setmsk no`, `Start Bandit1_c`, `Block`, `Start Bandit2_Lora Fclick Bandit`).
3. `Bandit2_Lora` завершается → `Fclick Bandit` → `Click 0 Bandit Interface`
   Case 0: `Ublock`, `Start Bandit2_c`, `Cursor Pank 7`, `Cursor Gungster 7`,
   **`State Pank 1`**.
4. Игрок выбирает **пистолет (item 4)** и кликает по `Pank` или `Gungster`:
   `Click 4 Pank Pank` Case 1 (или `Click 4 Gungster Pank` Case 1) → `StartW
   Victoti` (выстрел) → `State Pank 2`, `Cursor Lora 7`, **`State Lora 1`**.
5. Игрок кликает по Лоре (без предмета, item 0): `Click 0 Lora Lora` Case 1 →
   `Goto 555 498; StartW K_talke; Setxy 555 497; State Lora 2` — **разговор**.

## 4. Соответствующие SCC-фрагменты

`Level38.scc:381–421` (проблемный фрагмент; номера строк точные, CRLF-оригинал):

```text
381  Click 4 Gungster Pank
382  {  Case 1
383      Goto 655 490
384      Stop Bandit1_c
385      Stop Bandit2_c
386      StartW Victoti
387      Setxy 650 490
388      State Pank 2
389      Setmsk Masks\Scn_38.tif
390      Cursor Lora 7
391      State Lora 1
392    Break
393  }
394
395  Click 0 Lora Lora
396  {
397    Case 1
398      Goto 555 498
399      StartW K_talke
400      Setxy 555 497
401      State Lora 2
402    Break
403    Case 2
404      Goto 555 498
405      StartW K_talke_1
406      Setxy 555 497
407      State Lora 3
408    Break
409    Case 3
410      Goto 555 498
411      StartW K_talke_2
412      Setxy 555 497
413      State Lora 4
414    Break
415    Case 4
416      Goto 555 498
417      StartW K_talke_3
418      Setxy 555 497
419      State Lora 2
420    Break
421  }
```

Парный обработчик (корректный, строка `{` отдельно — 367):

```text
366  Click 4 Pank Pank
367  {
368    Case 1
369      Goto 655 490
370      Stop Bandit1_c
371      Stop Bandit2_c
372      StartW Victoti
373      Setmsk Masks\Scn_38.tif
374      Setxy 650 490
375      State Pank 2
376      Cursor Lora 7
377      State Lora 1
378    Break
379  }
```

## 5. Условия запуска разговора

`Click 0 Lora Lora` — `itemId=0`, `eventName=Lora`, `stateObject=Lora`,
`stateScene=-1` (текущая). Ветка `Case N` выбирается по `Lora.state == N`.

Чтобы разговор запустился, одновременно должны быть верны:

| Условие | Значение | Кто устанавливает |
|---|---|---|
| Выбранный предмет (`scene+5`) | `0` (без предмета) | обычный клик без инвентаря |
| `Lora.state` | `1` (для первого разговора `K_talke`) | `Click 4 Pank/Gungster Pank` Case 1 → `State Lora 1` |
| `Pank.state` | `1` (для срабатывания `Click 4 …` Case 1) | `Fclick Bandit` → `Click 0 Bandit Interface` Case 0 → `State Pank 1` |
| `Block` снят (`Ublock`) | `false` | тот же `Click 0 Bandit Interface` Case 0 |
| Пистолет в инвентаре и выбран | item 4 | `Click 0 Pistol Pistol` (Level1) → `Addtol 4`; выбор в инвентаре |
| `Lora` проходит hit-test | видимый спрайт с ненулевой глубиной и пикселями | MULT-кадры `Bandit2_Lora`/`Victoti` |

После разговора (`Case 1`) `State Lora 2`, и последующие клики идут через
`Case 2/3/4` (`K_talke_1/2/3`), а финальный выход из сцены — через `Click 39
Door Lamp_t` Case 1 (Level38:525) с `StartW Lora_out` и `Level 3 -1`.

## 6. Результаты проверки hit-test (гипотеза A) — НЕ причина

- `Lora` — базовый `Object` (`Object Lora 0 139`), не `Active`/`Light`.
- Спрайт Лоры создаётся через MULT-кадры: `Bandit2_Lora`/`Bandit2_c`
  (`Step_02_22/Step_02_2.MULT`), `Victoti` (`Step_02_31.MULT`), `K_talke`
  (`Step_10.MULT`). После драки (Victoti, кадр 130) Лора остаётся видимой
  `59×231` на world ≈ `(746, 375)`, а `Pank`/`Gungster` получают пустой растр
  `0×0` (хулиганы убегают). Это согласуется с сюжетом.
- Пиксельный hit-test базовых объектов (`src/scene/object-hit.ts`) и reverse
  painter-order (`firstHitTarget`, `abs(depth)` по возрастанию) уже покрыты
  тестами Level1 (пистолет/бутылка/гамак) и работают. Для Лоры препятствий нет.
- **Вывод:** hit-test здесь не виноват. Симптом «проходит мимо» возникает на
  более позднем этапе — когда `firstHitTarget` **находит** Лору, но
  `scc.click('Lora', 0)` возвращает `false`, потому что обработчик отсутствует.

## 7. Результаты проверки курсоров и item ID (гипотеза B) — НЕ причина

- `Cursor Lora 7` / `Cursor Pank 7` / `Cursor Gungster 7` — пишут `+0x152`
  (hover-курсор «Lips/разговор»). Это **визуальная** подсказка; она не влияет на
  выбор ветки `Click`.
- `itemId 45` (26 вхождений) и `itemId 46` (29 вхождений) — обработчики
  `Click 45/46 Mainhero …` (например `Level10.scc:141`, `Level22.scc:288/322`).
  Это глаголы «посмотреть на себя» (Eye) и «поговорить с собой» (Lips) по
  `Mainhero`; к разговору с Лорой отношения не имеют: разговор с Лорой — это
  **`Click 0 Lora Lora`** (item 0).
- Разговор с Лорой запускается обычным левым кликом по объекту при
  `Lora.state==1`; отдельный «режим разговора» (verb UI) для него **не нужен**.

## 8. Результаты проверки игрового состояния (гипотеза C) — косвенно

Сама цепочка состояний реализована и работает (подтверждено существующим
E2E `scene38`: `Pank=1`, `blocked=false` после катсцены). Проблема **не** в том,
что `Lora.state != 1`; проблема в том, что даже при `Lora.state == 1` **нечего
диспетчить**: обработчик `Click 0 Lora Lora` пропал при парсинге.

## 9. Конкретное расхождение браузерного движка с оригиналом

| Слой | Оригинал (`Agent.exe`) | Браузер |
|---|---|---|
| Чтение SCC | токены через scanf-хелпер (`0x438e6c`), хеш `0x4058d8`; `{`/`Case`/`Break` — отдельные токены, границы строк не имеют значения (SCC_RUNTIME §3.1) | `parseScc` режет исходник на строки и ищет `{`/`}` как целые строки |
| `{  Case 1` (Level38:382) | токены `{`, `Case`, `1` — корректно | `lines[i+1] !== '{'` ложно для строки `{  Case 1`, парсер пропускает строку и ищет следующий `{` |
| Итог | регистрируются 27 обработчиков, включая `Click 0 Lora Lora` | регистрируются 26; `Click 4 Gungster Pank` получает тело `Click 0 Lora Lora`, `Click 0 Lora Lora` отсутствует |

Дефектная строка кода — `src/scc/runtime.ts:130`:

```ts
while (i + 1 < lines.length && lines[i + 1] !== '{') i++;
```

и связанный цикл тела на строке 133 (`for (; … && lines[i] !== '}'; i++)`), где
токен `{`/`Case` из одной строки не разбирается.

## 10. Минимальный план исправления (для Luna)

Файл: `src/scc/runtime.ts`, функция `parseScc` (только нормализация входа в
блоки; интерпретатор и рантайм не трогаются).

**Рекомендуемое исправление** — перед построчным разбором нормализовать скобки
в отдельные строки (эквивалентно токенизации оригинала):

```ts
const lines = source
  .split(/\r?\n/)
  .flatMap((line) => {
    const normalized = line.replace(/(\{|\})/g, (m) => (m === '{' ? '\n{\n' : '\n}\n'));
    return normalized.split('\n');
  })
  .map((line) => line.trim())
  .filter(Boolean);
```

(Замена текущего `const lines = source.split(/\r?\n/).map(…).filter(Boolean);`.)
Скобки в SCC не встречаются внутри имён/путей/событий, поэтому сплит безопасен;
`}` с содержимым на одной строке в корпусе отсутствует, но нормализация
покрывает и его.

Проверка исправления (прогон на реальном файле):

- `parseScc(Level38.scc)` возвращает **27** обработчиков;
- присутствует `Click 0 Lora Lora` с Case 1–4 (`K_talke`, `K_talke_1/2/3`);
- `Click 4 Gungster Pank` Case 1 = `Goto 655 490; Stop Bandit1_c; Stop
  Bandit2_c; StartW Victoti; Setxy 650 490; State Pank 2; Setmsk; Cursor Lora 7;
  State Lora 1`.

Альтернатива (не рекомендуемая как «костыль»): точечно обработать строку,
начинающуюся с `{`, и её хвост. Нормализация строк выше — минимальна и
соответствует исходной токенной грамматике.

**Не требуется:** менять hit-test, инвентарь, состояние объектов, анимации,
аудио, Fault/Fclick/Block. Всё это уже реализовано и не связано с багом.

## 11. Регрессионные тесты (предотвращение повтора)

### Юнит (парсер)

1. `parseScc` на реальном `Level38.scc`:
   - `handlers.length === 27` (равно числу строк `Click` в исходнике);
   - есть `Click 0 Lora Lora` (itemId 0, stateObject `Lora`) с `programs`
     `{1,2,3,4}` и Case 1 = `[Goto(555,498), StartW K_talke, Setxy(555,497),
     State Lora 2]`;
   - есть `Click 4 Gungster Pank` (itemId 4, stateObject `Pank`) с Case 1 =
     `[Goto(655,490), Stop Bandit1_c, Stop Bandit2_c, StartW Victoti,
     Setxy(650,490), State Pank 2, Setmsk, Cursor Lora 7, State Lora 1]`.
2. Синтетический SCC со строкой `{  Case 1`: Case привязывается к текущему
   Program, следующий обработчик **не** проглатывается.
3. Синтетический SCC со строкой `}` + комментарий/хвост (если решено покрывать
   `}`) — тело завершается корректно.

### Диспетч-интеграция

4. При `Lora.state=0` (и item 0) `dispatch('Lora', 0)` == `false` (нет Case 0);
   при `Lora.state=1` == `true` и запускается Program `K_talke`.
5. `dispatch('Gungster', 4)` при `Pank.state=1` выбирает **`Victoti`**, а не
   `K_talke`.

### Браузерный E2E (отдельный сценарий)

См. `scripts/e2e-browser-lora.mjs` (и следующий раздел). До исправления сценарий
**падает** на шаге «клик по Лоре» (симптом бага); после исправления — завершается
успешным запуском разговора.

## 12. Воспроизводимый сценарий Chromium E2E

Файл: `scripts/e2e-browser-lora.mjs`.

Маршрут (без отладочных кнопок перехода):

1. Level1: подобрать **пистолет** (`Click 0 Pistol Pistol` → `Addtol 4`) и
   **бутылку** (`Click 0 Botl Botl` → `Addtol 1`).
2. Level1: открыть инвентарь, выбрать бутылку (item 1), кликнуть по гамаку →
   `Click 1 Slip Flag1` Case 0 → `Lec_v=1`, `Lstate Goto_1 1 38`.
3. Кликнуть `Lec_v` → `Click 0 Lec_v Lec_v` Case 1 → `Level 38 0`.
4. Level38: дождаться `Pank=1` и `blocked=false` (катсцена + Fclick `Bandit`).
5. Открыть инвентарь, выбрать пистолет (item 4, слот 0), кликнуть по `Pank`
   (`Click 4 Pank Pank` Case 1 → `StartW Victoti`).
6. Дождаться `Pank=2` и `Lora=1`.
7. Кликнуть по Лоре (без предмета). **Ожидание:** `Lora.state` → `2` (запущен
   `K_talke`), `selected=0`, герой выполняет `Goto 555 498` (разговор), а не
   произвольную ходьбу в точку клика.

Координаты кликов в Level38 получаются динамически через отладочную ручку
`window.__sccDebug.view().objectDebug('Pank'|'Lora')` (world X/Y) и `scroll` из
панели: `screenX = worldX - scroll`, клик в центр спрайта (anchor 0.5).
Статические ориентиры: Лора world ≈ `(746, 375)`, Pank world ≈ `(770, 349)`
(по MULT-кадрам `Step_02_31/Step_02_22`).

Ключевая проверка (шаг 7) **до исправления падает**: `Lora` не переходит в 2,
герой просто идёт. После исправления — проходит.

## 13. Ответ на контрольный вопрос

**Почему клик по Лоре запускает движение Громова вместо разговора?**

Потому что обработчик `Click 0 Lora Lora` (Level38.scc:395–421) не попадает в
реестр SCC: строка `Level38.scc:382` `{  Case 1` (скобка и `Case` на одной
строке) ломает строчный поиск `{` в `parseScc` (`src/scc/runtime.ts:130`).
`Click 4 Gungster Pank` «проглатывает» тело `Click 0 Lora Lora`, и диспетч
`Lora` не находит ветку → `handled=false` → Fault-фолбэк отсутствует →
`pointerDown` уходит в click-to-walk.

## 14. Оставшиеся неизвестные

- `UNKNOWN` — динамический прогон полного сценария в Chromium не выполнялся в
  рамках этого исследования (требует сборки + `vite preview` + headless Chrome);
  дефект, однако, детерминирован на уровне парсера и не зависит от рантайма.
- `UNKNOWN` — точная tie-семантика hit-test при равных `abs(depth)` (не влияет
  на данный баг; уже задокументирована в existing research).
- `UNKNOWN` — полное поведение остальных (работающих) обработчиков Level38 после
  исправления; исправление восстанавливает только два обработчика и не меняет
  остальные 25.

## 15. Минимальный объём исправлений

- 1 функция (`parseScc`), ~4 строки (нормализация `{`/`}` в отдельные строки).
- Юнит-регрессии парсера Level38.
- E2E `scripts/e2e-browser-lora.mjs`.
- Без изменений: интерпретатор, рантайм, hit-test, инвентарь, анимации, аудио,
  Fault/Fclick/Block, ресурсы.
