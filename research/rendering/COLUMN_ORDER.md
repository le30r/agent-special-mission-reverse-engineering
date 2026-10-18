# Level39: painter order колонн и MULT-only записи

Дата: 2026-10-18. Изолированная реализация: `.dsh/column-fix`, коммит `4d98b78`
(базовый снапшот общего worktree — `91fcaff`). **Фикс перенесён в общий `src/`
после завершения параллельной задачи**; полный `pnpm test` (61 тест),
`pnpm build` и три браузерных сценария прошли. Патч сохранён как аудит:
[`level39-columns-fix.diff`](level39-columns-fix.diff), git-формат:
[`0001-fix-level39-never-invent-depth-for-MULT-only-column-.patch`](0001-fix-level39-never-invent-depth-for-MULT-only-column-.patch).
Повторно применять патч к текущему `src/` не нужно.

## Итог

Визуальный дефект у левой колонны центрального монумента вызывает не маска и не
`Col_all`/`Col_vaz`/`Arca_d`, а записи `Goto` и `Ygol` из
`XSH\SCN_39\Start.MULT`:

- `Goto` — левая колонна/пилон центрального монумента;
- `Ygol` — правая колонна/пилон;
- в `Level39.scc` **нет** `Object Goto` и `Object Ygol`;
- прототип создавал для них спрайты с depth по умолчанию `0`, поэтому они
  рисовались поверх героя (у героя оставались видны только ноги).

### Оригинальный код

`0x405064` (кадровое обновление анимации) для каждой записи MULT вызывает
`FUN_0040a8dc(scene, record_name)` (`findObject` по списку объектов сцены).
Если результат `NULL`, запись **пропускается**: `0x404928` (назначение
изображения/метаданных) не вызывается. `0x40a8dc` возвращает `NULL`, если имя не
найдено в `scene+0x1a5[0..count)`. Следовательно, у `Goto`/`Ygol` в оригинале
нет ни объекта, ни depth, ни спрайта. Фон уже содержит соответствующую графику
колонн; дублирующие TIF-записи в `Start.MULT` не рисуются.

Evidence: `research/mult/evidence/functions.json` (псевдокод `0x405064`),
`research/scc/evidence/assembly.json` (`0x40a8dc`), `research/rendering/
OBJECT_DEPTH.md` (поля `+0x108`/`+0x152`, компаратор `0x40a4ac`).

## Глубины колонн Level39

| Объект | Происхождение depth | Depth | Примечание |
|---|---|---:|---|
| `Col_all` | SCC declaration `Object Col_all 0 1000` | 1000 | `Objzet 5`/`1010`; `Fram Vniz:144 → 1010` |
| `Col_vaz` | SCC declaration `Object Col_vaz 0 226` | 226 | `Objzet 6`/`1000`; `Fram Verx:5 → 6`; `Fram Vniz:144 → 1000` |
| `Arca_d` | SCC declaration `Object Arca_d 0 10` | 10 | без `Objzet`/`Fram` |
| `Cust_go47` | SCC declaration `Object Cust_go47 0 225` | 225 | без изменений |
| `Goto_1` | SCC declaration `Object Goto_1 3 1000` | 1000 | левая арка, не центральная колонна |
| `Vaza` | SCC declaration `Object Vaza 0 128` | 128 | левая ваза |
| `Goto` | **MULT-only**, объявления нет | — | оригинал пропускает запись (`findObject=NULL`) |
| `Ygol` | **MULT-only**, объявления нет | — | оригинал пропускает запись (`findObject=NULL`) |

Порядок painter order для объявленных колонн:
`Goto_1(1000) → Col_all(1000) → Col_vaz(226) → Cust_go47(225) → Vaza(128) →
Arca_d(10)`; больший `abs(depth)` рисуется раньше. `Goto`/`Ygol` в этом списке
отсутствуют.

## `Goto_40`: порядок SCC-команд

`Level39.scc:136–147`:

```text
Click 0 Goto_40 Goto_40
{
  Case 0
    Goto 460 405
    Objzet Col_all 5
    Objzet Col_vaz 6
    StartW Verx
    Lstate Goto_5 1 6
    Level 40 0
    Objzet Col_all 1010
    Objzet Col_vaz 1000
  Break
}
```

`Goto` — блокирующая команда: ждёт завершения маршрута (`pathActive`).
`StartW` — блокирующая: ждёт завершения анимации. `Objzet` синхронен и
выполняется в порядке команд.

Проверено в реальном Chromium (`?debug=depth`, изолированная сборка):
`Active Goto_40` имеет прямоугольник `445..520 × 230..430` (первые два числа
`Active` — cursor ID и depth, а не часть прямоугольника). Клик в
`(130,350)` при `scroll=352` дал:

| Время от клика | Hero | Col_all | Col_vaz | Источник |
|---:|---|---:|---:|---|
| 0.4–5.2 s | `(1100,570) → (461,444)` | 1000 | 226 | SCC declaration |
| 5.641 s | `(461,444)` | **5** | **6** | `SCC Objzet` (после завершения `Goto`) |
| 5.742 s | `(461,444)` | 5 | 6 | `SCC Fram (Verx frame 5)` |
| 15.261 s | `(461,444)` | **1010** | **1000** | `SCC Objzet` (после `StartW Verx`) |

Вывод: в обработчике `Click 0 Goto_40 Goto_40` `Objzet` выполняется **после
завершения перемещения**, потому что перед ним стоит блокирующий `Goto`.
В `Click 0 Start Goto_40` (`Case 1`) перед `Objzet` нет `Goto`, поэтому там
`Objzet` выполняется сразу при dispatch события `Start`. Восстановление
`Objzet 1010/1000` в обоих случаях идёт после `StartW`-анимации.

Независимой ошибки SCC Runtime не обнаружено. Первый браузерный клик был
ошибочным: использовался прямоугольник `1000..1090 × 445..520` вместо
фактического `445..520 × 230..430`.

## Маска проходимости

Маска не является причиной. В точке дефекта `(505,485)`:

- `sample = 255 - pixel = 152` (пиксель не белый, проходимый);
- `depthAt = 152` при `Focus 140 1 1.45`;
- герой стоит ниже основания колонны (`Goto` base ≈ 430.7 при y=485), то есть
  визуально перед ней;
- маршрут до точки строится.

Маска задаёт только `hero.depth`; порядок сценовых объектов задаётся их
собственным `+0x108`. Подмена глубины неизвестного объекта на `0` — ошибка
объектной модели, а не маски.

## Что в патче

- `src/scene/mult-target.ts` — `findFrameTarget`: MULT-запись без SCC/`State`
  идентичности не создаёт спрайт; `Active`/`Light` не являются drawable Object.
- `src/scene/scene-view.ts` — фильтрация `Startlevel` и последующих кадров;
  provenance depth (`SCC declaration` / `Objzet` / `Fram` / `default`) и список
  пропущенных MULT-only имён в `?debug=depth`.
- `src/scene/scene-loader.ts` — `DepthProvenance`, `setStateDepth`,
  `depthOriginLabel`, сохранение provenance при повторном входе.
- `src/scene/scene-session.ts` — declaration provenance.
- `tests/level39-columns.test.ts` — 6 регрессионных тестов (включая guard, что фильтр не отбрасывает ни одну из 19 записей Level1) на реальных
  Level39/Level39.scc/`Fram`.
- `scripts/e2e-level39-columns.mjs` — реальный Chromium E2E.

Временный `window.__columnDebug` в патч **не входит**.

## Проверки изолированной копии

```sh
cd .dsh/column-fix
pnpm exec vitest run          # 59 tests passed
pnpm exec tsc -b
pnpm exec vite build --outDir dist --emptyOutDir
python3 -m http.server 4273 --bind 127.0.0.1 --directory dist
# Chrome: --remote-debugging-port=9322
node scripts/e2e-level39-columns.mjs
```

Скриншоты: [`evidence/columns/level39-left-column-fixed-canvas.png`](evidence/columns/level39-left-column-fixed-canvas.png)
(после фикса), [`evidence/columns/L2_500_480.png`](evidence/columns/L2_500_480.png)
(до фикса, видны только ноги героя). JSON: [`evidence/columns/level39-column-depth.json`](evidence/columns/level39-column-depth.json),
[`evidence/columns/goto40-sequence.json`](evidence/columns/goto40-sequence.json).

## Статус переноса

**Перенесено.** После завершения параллельной задачи актуальные
`scene-view.ts`, `scene-loader.ts`, `scene-session.ts` были перечитаны, патч
применён к общему worktree, затем выполнены:

- `pnpm test` — 61 тест, все прошли;
- `pnpm build` — успешно;
- `pnpm e2e:browser:columns` — Level39, `(505,485)`, depth 152, `Goto`/`Ygol`
  отсутствуют, объявленные колонны сохранены;
- `pnpm e2e:browser` — полный `Level1 → Level39 → Level1`, бутылка и
  `inventory=[1]` сохранены;
- `pnpm e2e:browser:interactions` — пистолет, бутылка, инвентарь и гамак,
  `Slip.state=3`, `Flag1=1`, `Lec_v=1`.

Временный `window.__columnDebug` в итоговый `src/` не попал. Патч оставлен для
аудита; повторно применять его к текущему `src/` не нужно.
