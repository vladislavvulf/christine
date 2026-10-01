// Шаг после `next build`.
// Next.js 16 при статическом экспорте сохраняет файлы предзагрузки маршрутов во вложенных папках
// (out/games/__next.games/__PAGE__.txt), а клиент запрашивает их «плоским» именем
// (out/games/__next.games.__PAGE__.txt). Создаём плоские копии — тогда предзагрузка работает
// на любом статическом хостинге без правил переписывания URL.
import { readdirSync, statSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'out';
let copied = 0;

function flatten(dir, prefix, target) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const flat = `${prefix}.${name}`;
    if (statSync(p).isDirectory()) flatten(p, flat, target);
    else if (!existsSync(join(target, flat))) { copyFileSync(p, join(target, flat)); copied++; }
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory() || name === '_next' || name === 'api') continue;
    if (name.startsWith('__next.')) flatten(p, name, dir);
    else walk(p);
  }
}

if (!existsSync(OUT)) {
  console.error('Папка out/ не найдена — сначала выполните next build');
  process.exit(1);
}
walk(OUT);

// На Vercel API работает как Node-функция (api/main.mts) — PHP-файлы не отдаём, иначе их исходник скачался бы как статика
if (process.env.VERCEL) {
  rmSync(join(OUT, 'api'), { recursive: true, force: true });
  rmSync(join(OUT, '.htaccess'), { force: true });
  console.log('✓ postbuild: сборка для Vercel — PHP API убран, используется api/main.ts');
}
console.log(`✓ postbuild: создано ${copied} файлов предзагрузки. Папка out/ готова к загрузке на хостинг.`);
