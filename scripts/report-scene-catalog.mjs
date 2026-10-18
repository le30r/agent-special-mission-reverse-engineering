#!/usr/bin/env node
/**
 * Writes docs/SCENE_CATALOG.md from the generated manifest and, when present,
 * from the real-Chromium catalog E2E result.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const manifest = JSON.parse(await readFile(path.join(root, 'public/generated/scenes.json'), 'utf8'));
const browserReportPath = path.join(root, 'research/transitions/evidence/scene-catalog/browser-scene-catalog.json');
const browserReport = existsSync(browserReportPath) ? JSON.parse(await readFile(browserReportPath, 'utf8')) : undefined;
const browserById = new Map((browserReport?.scenes ?? []).map((scene) => [scene.id, scene]));

const lines = [];
lines.push('# Каталог игровых сцен');
lines.push('');
lines.push(`Сформирован из \`${manifest.generator}\` и оригинального дерева \`agent-original/\`; не содержит ручного списка сцен.`);
lines.push('');
lines.push('## Сводка');
lines.push('');
lines.push(`- Обнаружено SCC-сцен: **${manifest.summary.total}** — ${manifest.scenes.map((scene) => scene.id).join(', ')}.`);
lines.push(`- Загружаемых сцен: **${manifest.summary.loadable.length}**.`);
lines.push(`- Неполных сцен: **${manifest.summary.incomplete.length}**.`);
lines.push(`- Отсутствующих необязательных зависимостей: **${manifest.summary.missingOptional}**.`);
lines.push('- Числового `Level9.scc` в оригинальном корпусе нет; ID берутся из фактического набора файлов.');
lines.push('');
lines.push('## Модель загрузки');
lines.push('');
lines.push('- Манифест содержит URL всех зависимостей, но браузер загружает только SCC/mask/MULT/фон/внешние изображения запрошенной сцены.');
lines.push('- `SceneAssetProvider` кэширует текущую сцену; при переходе отложенно загружает следующую, затем освобождает текстуры MULT, внешних изображений и фон предыдущей сцены (с учётом общих URL).');
lines.push('- `Inc` раскрывается рекурсивно; анимации, объявленные в `Cursor.scc`/`Mainhero.scc`/`Step*.scc`, входят в сцену.');
lines.push('- Сцены без `Startlevel` — допустимый случай: у них нет drawable layout, но `Stop*`/`Walk*` и `Active`/`Light` продолжают работать.');
lines.push('');
lines.push('## Сцены');
lines.push('');
lines.push('| Сцена | SCC | Фон | Маска | Анимаций | Layout | Внешних изображений | Браузер |');
lines.push('|---:|---|---|---|---:|---|---:|---|');
for (const scene of manifest.scenes) {
  const browser = browserById.get(scene.id);
  const browserText = browser ? (browser.ok ? `ok (${browser.elapsedMs} ms)` : 'FAILED') : 'не проверялся';
  lines.push(`| ${scene.id} | ${scene.sources.scc} | ${scene.sources.background ?? '—'} | ${scene.sources.mask ?? '—'} | ${Object.keys(scene.animations).length} | ${scene.layoutAnimation ?? 'нет'} | ${Object.keys(scene.externalImages).length} | ${browserText} |`);
}
lines.push('');
const noLayout = manifest.scenes.filter((scene) => !scene.layoutAnimation).map((scene) => scene.id);
lines.push('### Сцены без `Startlevel`');
lines.push('');
lines.push(noLayout.length ? noLayout.map((id) => `Level${id}`).join(', ') + '.' : 'Нет.');
lines.push('');
lines.push('### Отсутствующие обязательные ресурсы');
lines.push('');
const incomplete = manifest.scenes.filter((scene) => !scene.loadable);
if (incomplete.length === 0) lines.push('Нет: все обнаруженные сцены имеют SCC, фон, маску и обязательные MULT.');
else for (const scene of incomplete) lines.push(`- Level${scene.id}: ${scene.missing.required.map((missing) => missing.message).join('; ')}`);
lines.push('');
lines.push('### Отсутствующие необязательные ресурсы');
lines.push('');
const missingOptional = manifest.scenes.flatMap((scene) => scene.missing.optional.map((missing) => `- Level${scene.id}: ${missing.message}`));
lines.push(missingOptional.length ? missingOptional.join('\n') : 'Нет.');
lines.push('');
lines.push('## Браузерная проверка');
lines.push('');
if (browserReport) {
  lines.push(`Реальный Chromium, \`${browserReport.url}\`: загружено **${browserReport.loaded.length}/${browserReport.total}** сцен.`);
  lines.push('Сцена 1 уже была активна на старте, поэтому её время в таблице не является измерением загрузки.');
  lines.push(`Отчёт: \`research/transitions/evidence/scene-catalog/browser-scene-catalog.json\`.`);
  if (browserReport.failed.length) lines.push(`Ошибки: ${JSON.stringify(browserReport.failed)}.`);
} else {
  lines.push('Отчёт браузерного E2E не найден. Запустите `pnpm e2e:browser:catalog` при работающем `vite preview` и Chrome с CDP.');
}
lines.push('');
lines.push('## Воспроизведение');
lines.push('');
lines.push('```sh');
lines.push('pnpm prepare:assets');
lines.push('pnpm test');
lines.push('pnpm build');
lines.push('pnpm exec vite preview --port 4173 --strictPort --host 127.0.0.1');
lines.push('# Chrome с --remote-debugging-port=9222');
lines.push('pnpm e2e:browser:catalog');
lines.push('pnpm catalog:report');
lines.push('```');
lines.push('');

await writeFile(path.join(root, 'docs/SCENE_CATALOG.md'), `${lines.join('\n')}\n`);
console.log(`Wrote docs/SCENE_CATALOG.md (${manifest.scenes.length} scenes).`);
