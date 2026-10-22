# Аудит ресурсов перед публичной публикацией

Дата: 2026-10-23. Проверено рабочее дерево через `git ls-files`, а не только `.gitignore`. История Git целиком не сканировалась. Изменения этого аудита не удаляют файлы из индекса, рабочего дерева или истории.

## Обнаруженные отслеживаемые производные игровые ресурсы

20 PNG со скриншотами игрового рендеринга, всего 6115983 байт. Они содержат игровую графику, поэтому текущий репозиторий нельзя считать свободным от игровых производных материалов. Точный список:

- `research/gameplay/evidence/level21-ladder/01-level21-ladder-visible.png`
- `research/gameplay/evidence/level21-ladder/02-level21-ladder-picked-up.png`
- `research/gameplay/evidence/level3-regression/all-items.png`
- `research/gameplay/evidence/level3-regression/clean-entry.png`
- `research/gameplay/evidence/level3-regression/interrupted-after.png`
- `research/gameplay/evidence/level3-regression/natural-all-items.png`
- `research/gameplay/evidence/level3-regression/user-restore-complete.png`
- `research/gameplay/evidence/lora/01-level1-cut.png`
- `research/gameplay/evidence/lora/02-level38-hooligans.png`
- `research/gameplay/evidence/lora/03-hooligans-fled.png`
- `research/gameplay/evidence/lora/04-lora-conversation.png`
- `research/inventory/evidence/browser-combination/01-level1-crowbar-hammock.png`
- `research/inventory/evidence/browser-combination/02-level38-knife-collected.png`
- `research/inventory/evidence/browser-combination/03-inventory-first-choice.png`
- `research/inventory/evidence/browser-combination/04-inventory-combined-item-39.png`
- `research/inventory/evidence/browser-combination/05-goto3-pank-opened.png`
- `research/inventory/evidence/browser-combination/05-item-39-selected-for-scene.png`
- `research/inventory/evidence/browser-combination/06-door-attempt-lamp-state-0.png`
- `research/inventory/evidence/browser-combination/06-level44-lamp-item-7.png`
- `research/scc/evidence/fault-e2e/level1-morda.png`

В текущем индексе не обнаружены файлы с расширениями SCC, MULT, TIFF/TIF, WAV, AVI, MP4, RSS, EXE, DLL, CAB, ISO, MDF или MDS. Это проверка файлов/расширений, не доказательство отсутствия игровых данных под другими именами.

## Другие материалы для отдельной проверки

- Технические Markdown-документы в `research/` содержат фрагменты оригинальных SCC и дизассемблированного кода; в частности `research/save-load/evidence/SCC_START_HANDLERS.md`, `EXE_EXCERPTS.md` и `SELECTOR_EXCERPT.md`. Они не исключены автоматически как документация. Допустимость публикации цитат требует отдельного решения; этот аудит её не устанавливает.
- Отслеживаемые JSON: шесть отчётов `research/audio/browser-wav-audit/{e2e-summary,graph,lifecycle,repeat,runtime,scheduler}.json` (самый большой — lifecycle.json, 27 387 байт) и `research/mult/external_verification.json` (331 байт). Это компактные диагностические отчёты, не медиаресурсы. Автоматически не удалялись и не скрывались.
- Локальный `agent-original` в проверенном checkout — неотслеживаемый симлинк. Правило `/agent-original` теперь покрывает как каталог, так и сам симлинк. В tooling нет ссылки на его фактический внешний адрес.
- `public/resources/`, `public/generated/`, `dist/`, оригинальные архивы/медиа, новые игровые PNG и временные выводы игнорируются. Собственные PNG/fixtures можно хранить в явно выделенных `docs/images/authored/` и `tests/fixtures/authored/`.
- Большие generated JSON в research evidence/dump-путях игнорируются; уже отслеживаемые файлы это не затрагивает. Не используйте `git add -f` для оригинальных или производных игровых данных.

## Что остаётся перед публикацией

Нужно отдельно решить судьбу перечисленных скриншотов и исследовательских цитат, а также проверить историю Git и условия публикации кода. Удаление файла из актуального коммита не убирает его из истории. Переписывание истории, удаление ресурсов и назначение лицензии в эту задачу не входят и не выполнялись.

Повторная проверка:

```bash
git ls-files
git status --short --ignored
git check-ignore agent-original public/generated/video/Title.mp4 public/resources/Level1.scc
```

## Проверка воспроизводимости запуска

На macOS с Node.js 26.0.0 и pnpm 10.12.4 проверен отдельный чистый каталог с текущими исходниками, без готовых ассетов и без `.git`:

- Установка по неизменённому lockfile (offline из предварительно заполненного pnpm store).
- Извлечение `data1.cab` через unshield, затем 12 RSS: 2134 файлов.
- Обнаружены 47 сцен без пропущенных обязательных зависимостей.
- Свежая подготовка: 523 PNG (51 фон/карта + 472 внешних изображения), 835 PCM WAV, все 6 MP4; ошибок конвертации нет.
- Повторная подготовка использовала кеш; `pnpm build` прошёл.
- `pnpm dev` и `pnpm preview`: HTTP-проверки страницы, каталога сцен, видеоманифеста и Title.mp4 прошли. Это не полный браузерный E2E и не проверка проходимости.
- `pnpm test:tooling`: 5 тестов; выбранные Vitest scene-manifest/scene-loader/navigation/map-controller: 23 теста; TypeScript и `git diff --check` прошли. Полный `pnpm test` в рамках этой задачи не запускался.

Все временные каталоги и дочерние процессы этих smoke-проверок очищены через проектный TestResources lifecycle. Linux/WSL и минимальная версия Node.js отдельно не прогонялись.
