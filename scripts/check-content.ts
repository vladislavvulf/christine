// Проверка контента: генерирует все уроки/боссы/квизы много раз и ищет некорректные задания.
// Запуск: npx tsx scripts/check-content.ts
import { genLesson, genPractice, genDramaQuiz, genClipQuiz, type Ex } from '../src/lib/gen';
import { CLIPS } from '../src/lib/clips';
import { audioKey, voiceForPitch } from '../src/lib/audio-key';
import { existsSync, readFileSync } from 'node:fs';
import { ALL_LESSONS, learnedBefore, item } from '../src/lib/items';
import { DRAMAS, WORDS, JAMO } from '../src/lib/data';
import { compose } from '../src/lib/hangul';

const problems: string[] = [];
const check = (where: string, ex: Ex) => {
  if (ex.type === 'choice') {
    const labels = ex.options.map(o => o.label);
    if (ex.answer < 0 || ex.answer >= labels.length) problems.push(`${where}: нет правильного ответа — ${ex.prompt}`);
    if (new Set(labels).size !== labels.length) problems.push(`${where}: дубли вариантов ${labels.join('|')}`);
    if (labels.length < 2) problems.push(`${where}: меньше 2 вариантов — ${ex.prompt}`);
  }
  if (ex.type === 'build') {
    const ok = ex.ls.some(l => ex.vs.some(v => (ex.ts || ['']).some(t => compose(l, v, t) === ex.target)));
    if (!ok) problems.push(`${where}: слог ${ex.target} нельзя собрать`);
  }
  if (ex.type === 'assemble' && !ex.answer.every(s => ex.tiles.includes(s))) problems.push(`${where}: нет плиток для ${ex.answer.join('')}`);
  if (ex.type === 'match' && new Set(ex.pairs.map(p => p.right)).size !== ex.pairs.length) problems.push(`${where}: одинаковые ответы в парах`);
};

for (const l of ALL_LESSONS) {
  for (let i = 0; i < 30; i++) {
    try {
      const { exs } = genLesson(l.id);
      if (exs.length < 5) problems.push(`${l.id}: слишком мало заданий (${exs.length})`);
      exs.forEach(e => check(l.id, e));
    } catch (e) { problems.push(`${l.id}: исключение ${(e as Error).message}`); break; }
  }
  const learned = [...learnedBefore(l.id), ...(l.learn || [])];
  if (learned.length) {
    try { genPractice(learned.slice(-8), learned).forEach(e => check('practice@' + l.id, e)); }
    catch (e) { problems.push(`practice@${l.id}: ${(e as Error).message}`); }
  }
}
for (const d of DRAMAS) for (let i = 0; i < 20; i++) genDramaQuiz(d).forEach(e => check(d.id, e));
for (const c of CLIPS) {
  for (let i = 0; i < 20; i++) genClipQuiz(c).forEach(e => check(c.id, e));
  c.lines.forEach((l, i) => {
    if (l.e <= l.s) problems.push(`${c.id}: реплика ${i} заканчивается раньше начала`);
    if (l.who && !c.cast[l.who]) problems.push(`${c.id}: нет персонажа ${l.who}`);
    if (/[a-z]/i.test(l.ru)) problems.push(`${c.id}: латиница в транскрипции «${l.ru}»`);
  });
}
// озвучка: всё, что произносит приложение, должно иметь mp3
if (existsSync('public/audio/index.json')) {
  const have = new Set<string>(JSON.parse(readFileSync('public/audio/index.json', 'utf8')));
  const need: [string, string][] = [];
  Object.values(JAMO).forEach(j => need.push([j.say, audioKey(j.say)]));
  Object.values(WORDS).forEach(w => need.push([w.k, audioKey(w.k)]));
  DRAMAS.forEach(d => d.lines.forEach(l => need.push([l.k, audioKey(l.k, voiceForPitch(d.cast[l.w].pitch))])));
  CLIPS.forEach(c => c.lines.forEach(l => need.push([l.k, audioKey(l.k, l.who ? c.cast[l.who].v : 'f')])));
  const miss = need.filter(([, k]) => !have.has(k));
  if (miss.length) problems.push(`нет озвучки для ${miss.length} фраз, например: ${miss.slice(0, 5).map(m => m[0]).join(', ')} — запустите npm run audio`);
}
Object.keys(JAMO).forEach(j => item('j:' + j));
Object.keys(WORDS).forEach(w => item('w:' + w));

const uniq = [...new Set(problems)];
console.log(uniq.length ? uniq.slice(0, 40).join('\n') + `\n\nПроблем: ${uniq.length}` : `✓ Всё в порядке: ${ALL_LESSONS.length} уроков, ${DRAMAS.length} сцен, ${Object.keys(WORDS).length} слов`);
process.exit(uniq.length ? 1 : 0);
