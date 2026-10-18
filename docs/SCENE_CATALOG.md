# Каталог игровых сцен

Сформирован из `scripts/prepare-assets.mjs` и оригинального дерева `agent-original/`; не содержит ручного списка сцен.

## Сводка

- Обнаружено SCC-сцен: **47** — 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48.
- Загружаемых сцен: **47**.
- Неполных сцен: **0**.
- Отсутствующих необязательных зависимостей: **0**.
- Числового `Level9.scc` в оригинальном корпусе нет; ID берутся из фактического набора файлов.

## Модель загрузки

- Манифест содержит URL всех зависимостей, но браузер загружает только SCC/mask/MULT/фон/внешние изображения запрошенной сцены.
- `SceneAssetProvider` кэширует текущую сцену; при переходе отложенно загружает следующую, затем освобождает текстуры MULT, внешних изображений и фон предыдущей сцены (с учётом общих URL).
- `Inc` раскрывается рекурсивно; анимации, объявленные в `Cursor.scc`/`Mainhero.scc`/`Step*.scc`, входят в сцену.
- Сцены без `Startlevel` — допустимый случай: у них нет drawable layout, но `Stop*`/`Walk*` и `Active`/`Light` продолжают работать.

## Сцены

| Сцена | SCC | Фон | Маска | Анимаций | Layout | Внешних изображений | Браузер |
|---:|---|---|---|---:|---|---:|---|
| 1 | Scripts/Level1.scc | block1/Backgrd/Scn_37.TIF | block0/Masks/Scn_01_1.TIF | 47 | Startlevel | 18 | ok (1 ms) |
| 2 | Scripts/Level2.scc | block1/Backgrd/Scn_02.TIF | block0/Masks/Scn_02.TIF | 52 | Startlevel | 19 | ok (1381 ms) |
| 3 | Scripts/Level3.scc | block1/Backgrd/Scn_03.TIF | block0/Masks/Scn_03_1.TIF | 67 | Startlevel | 17 | ok (2768 ms) |
| 4 | Scripts/Level4.scc | block1/Backgrd/Scn_04.TIF | block0/Masks/Scn_04_1.TIF | 36 | Startlevel | 8 | ok (1190 ms) |
| 5 | Scripts/Level5.scc | block1/Backgrd/Scn_05.TIF | block0/Masks/Scn_05.TIF | 49 | Startlevel | 8 | ok (1424 ms) |
| 6 | Scripts/Level6.scc | block1/Backgrd/Scn_06.TIF | block0/Masks/Scn_06.TIF | 49 | Startlevel | 9 | ok (1377 ms) |
| 7 | Scripts/Level7.scc | block1/Backgrd/Scn_07.TIF | block0/Masks/Scn_07.TIF | 43 | Startlevel | 5 | ok (1358 ms) |
| 8 | Scripts/Level8.scc | block1/Backgrd/Scn_08.TIF | block0/Masks/Scn_081.TIF | 46 | Startlevel | 0 | ok (1781 ms) |
| 10 | Scripts/Level10.scc | block1/Backgrd/Scn_10.TIF | block0/Masks/Scn_10.TIF | 49 | Startlevel | 14 | ok (2048 ms) |
| 11 | Scripts/Level11.scc | block1/Backgrd/Scn_11.TIF | block0/Masks/Scn_11.TIF | 39 | Startlevel | 2 | ok (1204 ms) |
| 12 | Scripts/Level12.scc | block1/Backgrd/Scn_12.TIF | block0/Masks/Scn_12_sm.TIF | 45 | Startlevel | 4 | ok (1852 ms) |
| 13 | Scripts/Level13.scc | block1/Backgrd/Scn_13.TIF | block0/Masks/Scn_13_2.TIF | 47 | Startlevel | 2 | ok (1274 ms) |
| 14 | Scripts/Level14.scc | block1/Backgrd/Scn_14.TIF | block0/Masks/Scn_14.TIF | 42 | Startlevel | 8 | ok (1404 ms) |
| 15 | Scripts/Level15.scc | block1/Backgrd/Scn_15.TIF | block0/Masks/Scn_15.TIF | 54 | Startlevel | 4 | ok (1875 ms) |
| 16 | Scripts/Level16.scc | block1/Backgrd/Scn_16.TIF | block0/Masks/Scn_16.TIF | 42 | Startlevel | 8 | ok (1014 ms) |
| 17 | Scripts/Level17.scc | block1/Backgrd/Scn_17.TIF | block0/Masks/Scn_17.TIF | 50 | Startlevel | 11 | ok (1883 ms) |
| 18 | Scripts/Level18.scc | block1/Backgrd/Scn_18.TIF | block0/Masks/Scn_18.TIF | 47 | Startlevel | 5 | ok (1433 ms) |
| 19 | Scripts/Level19.scc | block1/Backgrd/Scn_19.TIF | block0/Masks/Scn_19_1.TIF | 56 | Startlevel | 15 | ok (1703 ms) |
| 20 | Scripts/Level20.scc | block1/Backgrd/Scn_20.TIF | block0/Masks/Scn_20.TIF | 40 | Startlevel | 4 | ok (1183 ms) |
| 21 | Scripts/Level21.scc | block1/Backgrd/Scn_21.TIF | block0/Masks/Scn_21.TIF | 55 | Startlevel | 1 | ok (1645 ms) |
| 22 | Scripts/Level22.scc | block1/Backgrd/Scn_22_1.TIF | block0/Masks/Scn_22_no.TIF | 59 | Startlevel | 29 | ok (2043 ms) |
| 23 | Scripts/Level23.scc | block1/Backgrd/Scn_23.TIF | block0/Masks/Scn_23_1.TIF | 67 | Startlevel | 9 | ok (3020 ms) |
| 24 | Scripts/Level24.scc | block1/Backgrd/Scn_24.TIF | block0/Masks/Scn_24.TIF | 42 | Startlevel | 10 | ok (1439 ms) |
| 25 | Scripts/Level25.scc | block1/Backgrd/Scn_25.TIF | block0/Masks/Scn_25.TIF | 48 | Startlevel | 18 | ok (1921 ms) |
| 26 | Scripts/Level26.scc | block1/Backgrd/Scn_26.TIF | block0/Masks/Scn_26.TIF | 33 | нет | 0 | ok (924 ms) |
| 27 | Scripts/Level27.scc | block1/Backgrd/Scn_27.TIF | block0/Masks/Scn_27_1.TIF | 49 | Startlevel | 25 | ok (2036 ms) |
| 28 | Scripts/Level28.scc | block1/Backgrd/Scn_28.TIF | block0/Masks/Scn_28_no.TIF | 40 | Startlevel | 10 | ok (1270 ms) |
| 29 | Scripts/Level29.scc | block1/Backgrd/Scn_29.TIF | block0/Masks/Scn_29.TIF | 41 | Startlevel | 0 | ok (2123 ms) |
| 30 | Scripts/Level30.scc | block1/Backgrd/Scn_30.TIF | block0/Masks/Scn_30.TIF | 42 | Startlevel | 7 | ok (2773 ms) |
| 31 | Scripts/Level31.scc | block1/Backgrd/Scn_31.TIF | block0/Masks/Scn_31m.TIF | 45 | Startlevel | 3 | ok (1623 ms) |
| 32 | Scripts/Level32.scc | block1/Backgrd/Scn_32.TIF | block0/Masks/Scn_32.TIF | 47 | Startlevel | 9 | ok (2165 ms) |
| 33 | Scripts/Level33.scc | block1/Backgrd/Scn_33.TIF | block0/Masks/Scn_33.TIF | 47 | Startlevel | 7 | ok (2561 ms) |
| 34 | Scripts/Level34.scc | block1/Backgrd/Scn_34.TIF | block0/Masks/Scn_34.TIF | 48 | Startlevel | 11 | ok (2019 ms) |
| 35 | Scripts/Level35.scc | block1/Backgrd/Scn_35.TIF | block0/Masks/Scn_35_no.TIF | 47 | Startlevel | 0 | ok (2755 ms) |
| 36 | Scripts/Level36.scc | block1/Backgrd/Scn_36.TIF | block0/Masks/Scn_36_1.TIF | 51 | Startlevel | 48 | ok (3172 ms) |
| 37 | Scripts/Level37.scc | block1/Backgrd/Scn_01.TIF | block0/Masks/Scn_37.TIF | 51 | Startlevel | 14 | ok (2876 ms) |
| 38 | Scripts/Level38.scc | block1/Backgrd/Scn_38.TIF | block0/Masks/Scn_38_1.TIF | 64 | Startlevel | 59 | ok (6025 ms) |
| 39 | Scripts/Level39.scc | block1/Backgrd/Scn_39.TIF | block0/Masks/Scn_39.TIF | 38 | Startlevel | 26 | ok (2197 ms) |
| 40 | Scripts/Level40.scc | block1/Backgrd/Scn_40.TIF | block0/Masks/Scn_40.TIF | 36 | Startlevel | 7 | ok (1769 ms) |
| 41 | Scripts/Level41.scc | block1/Backgrd/Scn_41.TIF | block0/Masks/Scn_41.TIF | 39 | Startlevel | 11 | ok (1498 ms) |
| 42 | Scripts/Level42.scc | block1/Backgrd/Scn_42.TIF | block0/Masks/Scn_42.TIF | 33 | нет | 0 | ok (1446 ms) |
| 43 | Scripts/Level43.scc | block1/Backgrd/Scn_43.TIF | block0/Masks/Scn_43.TIF | 33 | нет | 0 | ok (1378 ms) |
| 44 | Scripts/Level44.scc | block1/Backgrd/Scn_44_1.TIF | block0/Masks/Scn_44.TIF | 42 | Startlevel | 5 | ok (1805 ms) |
| 45 | Scripts/Level45.scc | block1/Backgrd/Scn_45.TIF | block0/Masks/Scn_45.TIF | 34 | нет | 0 | ok (1384 ms) |
| 46 | Scripts/Level46.scc | block1/Backgrd/Scn_46.TIF | block0/Masks/Scn_46.TIF | 34 | нет | 0 | ok (1402 ms) |
| 47 | Scripts/Level47.scc | block1/Backgrd/Scn_47.TIF | block0/Masks/Scn_47.TIF | 36 | Startlevel | 2 | ok (1471 ms) |
| 48 | Scripts/Level48.scc | block1/Backgrd/Scn_48.TIF | block0/Masks/Scn_48.TIF | 33 | нет | 0 | ok (1492 ms) |

### Сцены без `Startlevel`

Level26, Level42, Level43, Level45, Level46, Level48.

### Отсутствующие обязательные ресурсы

Нет: все обнаруженные сцены имеют SCC, фон, маску и обязательные MULT.

### Отсутствующие необязательные ресурсы

Нет.

## Браузерная проверка

Реальный Chromium, `http://127.0.0.1:4173/?debug=scenes`: загружено **47/47** сцен.
Сцена 1 уже была активна на старте, поэтому её время в таблице не является измерением загрузки.
Отчёт: `research/transitions/evidence/scene-catalog/browser-scene-catalog.json`.

## Воспроизведение

```sh
pnpm prepare:assets
pnpm test
pnpm build
pnpm exec vite preview --port 4173 --strictPort --host 127.0.0.1
# Chrome с --remote-debugging-port=9222
pnpm e2e:browser:catalog
pnpm catalog:report
```

