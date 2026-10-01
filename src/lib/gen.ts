// Генерация упражнений для уроков, боссов, повторения и сцен из дорам
import { WORDS, type Drama } from './data';
import type { Clip } from './clips';
import { compose, decompose, syllablesOf, L, V, T, VERTICAL_V } from './hangul';
import {
  item, syl, label, distractors, knownSets, learnedBefore, lessonById, readableWords, syllablePool,
  unitItems, type Item, type KnownSets,
} from './items';
import { pick, sample, shuffle, uniq } from './util';
import { recognitionSupported } from './voice';

export type Option = { label: string; sub?: string; ko?: boolean; face?: string };
export type Ex =
  | { type: 'tip'; tip: string }
  | { type: 'intro'; item: Item }
  | { type: 'choice'; itemId?: string; prompt: string; big?: string; bigKo?: boolean; hint?: string; img?: string;
      audio?: string; pitch?: number; autoplay?: boolean; options: Option[]; answer: number; after?: string; reveal?: string }
  | { type: 'build'; itemId: string; target: string; label: string; audio: string; ls: string[]; vs: string[]; ts?: string[] }
  | { type: 'assemble'; itemId: string; prompt: string; img?: string; audio: string; answer: string[]; tiles: string[]; reveal: string }
  | { type: 'match'; pairs: { id: string; left: string; right: string; say: string }[] }
  | { type: 'speak'; itemId?: string; text: string; r: string; tr: string; pitch?: number };

/* ---------- Конструкторы упражнений ---------- */

function choice(target: Item, pool: Item[], mode: 'sound' | 'letter' | 'listen' | 'meaning' | 'word' | 'listenWord'): Ex {
  const isWord = target.kind === 'w';
  const ds = distractors(target, pool, 3, isWord ? (i => i.tr || i.ru) : label);
  const all = shuffle([target, ...ds]);
  const answer = all.indexOf(target);
  const reveal = isWord ? `${target.k} [${target.ru}] — ${target.tr}` : `${target.k} = «${target.ru}»`;
  switch (mode) {
    case 'sound':
      return { type: 'choice', itemId: target.id, prompt: 'Как это читается?', big: target.k, bigKo: true,
        options: all.map(i => ({ label: i.ru })), answer, after: target.say, reveal };
    case 'letter':
      return { type: 'choice', itemId: target.id, prompt: `Найди «${target.ru}»`, hint: target.h,
        audio: target.say, options: all.map(i => ({ label: i.k, ko: true })), answer, reveal };
    case 'listen':
      return { type: 'choice', itemId: target.id, prompt: 'Что ты слышишь?', audio: target.say, autoplay: true,
        options: all.map(i => ({ label: i.k, ko: true })), answer, reveal };
    case 'meaning':
      return { type: 'choice', itemId: target.id, prompt: 'Прочитай и выбери перевод', big: target.k, bigKo: true,
        options: all.map(i => ({ label: i.tr! })), answer, after: target.say, reveal };
    case 'word':
      return { type: 'choice', itemId: target.id, prompt: `Как сказать «${target.tr}»?`, img: target.img,
        options: all.map(i => ({ label: i.k, ko: true })), answer, after: target.say, reveal };
    case 'listenWord':
      return { type: 'choice', itemId: target.id, prompt: 'Послушай и выбери слово', audio: target.say, autoplay: true,
        options: all.map(i => ({ label: i.k, ko: true })), answer, reveal };
  }
}

function build(target: Item, s: KnownSets): Ex | null {
  const p = decompose(target.k);
  if (!p) return null;
  const cons = L.filter(c => s.cons.has(c));
  const vows = V.filter(v => s.vows.has(v));
  const ls = shuffle(uniq([p.l, ...sample(cons.filter(c => c !== p.l), 3)]));
  const vs = shuffle(uniq([p.v, ...sample(vows.filter(v => v !== p.v), 3)]));
  let ts: string[] | undefined;
  if (p.t || s.fins.size) {
    const fins = [...s.fins].filter(f => f !== p.t);
    ts = shuffle(uniq(['', p.t, ...sample(fins, 2)]));
  }
  if (ls.length < 2 || vs.length < 2) return null;
  return { type: 'build', itemId: target.id, target: target.k, label: target.ru, audio: target.say, ls, vs, ts };
}

function assemble(w: Item, pool: Item[]): Ex | null {
  const parts = syllablesOf(w.k);
  if (parts.length < 2) return null;
  const extra = uniq(pool.flatMap(p => syllablesOf(p.k))).filter(x => !parts.includes(x));
  const tiles = shuffle([...parts, ...sample(extra, Math.min(3, Math.max(2, 6 - parts.length)))]);
  return { type: 'assemble', itemId: w.id, prompt: w.tr!, img: w.img, audio: w.say, answer: parts, tiles, reveal: `${w.k} [${w.ru}]` };
}

function match(items: Item[]): Ex {
  // ответы в парах должны различаться (ㅙ ㅚ ㅞ звучат одинаково — не ставим их вместе)
  const seen = new Set<string>();
  const uniqItems = items.filter(i => { const r = label(i); if (seen.has(r)) return false; seen.add(r); return true; });
  return { type: 'match', pairs: uniqItems.map(i => ({ id: i.id, left: i.k, right: label(i), say: i.say })) };
}

/** Слоги, в которых «работает» новая буква */
function syllablesWith(it: Item, s: KnownSets): Item[] {
  const j = it.jamo!;
  let list: string[];
  if (it.kind === 'c') list = V.filter(v => s.vows.has(v)).map(v => compose(j, v));
  else if (it.kind === 'v') list = L.filter(c => s.cons.has(c)).map(c => compose(c, j));
  else list = L.filter(c => s.cons.has(c)).flatMap(c => [...s.vows].slice(0, 6).map(v => compose(c, v, j)));
  return sample(list.filter(Boolean), 8).map(syl);
}

/** Одно упражнение на закрепление элемента */
function practiceFor(it: Item, s: KnownSets, pools: { jamo: Item[]; syl: Item[]; words: Item[]; fins: Item[] }): Ex | null {
  if (it.kind === 'w') {
    const opts: (() => Ex | null)[] = [
      () => choice(it, pools.words, 'meaning'),
      () => choice(it, pools.words, 'word'),
      () => choice(it, pools.words, 'listenWord'),
      () => assemble(it, pools.words),
    ];
    return pick(opts)();
  }
  if (it.kind === 'v' && s.cons.size <= 1) {
    // пока знаем только гласные
    const sameKind = pools.jamo.filter(j => j.kind === 'v');
    return pick([() => choice(it, sameKind, 'sound'), () => choice(it, sameKind, 'letter'),
      () => choice(syl(compose('ㅇ', it.jamo!)), pools.syl, 'listen')])();
  }
  if (it.kind === 'f') {
    const target = pick(syllablesWith(it, s));
    return pick([() => choice(target, pools.syl, 'sound'), () => choice(target, pools.syl, 'listen'),
      () => build(target, s), () => choice(it, pools.fins, 'sound')])();
  }
  const sameKind = pools.jamo.filter(j => j.kind === it.kind);
  const target = pick(syllablesWith(it, s));
  if (!target) return choice(it, sameKind, 'sound');
  return pick([
    () => choice(it, sameKind, 'sound'),
    () => choice(it, sameKind, 'letter'),
    () => choice(target, pools.syl, 'sound'),
    () => choice(target, pools.syl, 'listen'),
    () => build(target, s),
  ])();
}

function poolsFor(ids: string[], s: KnownSets) {
  const items = ids.map(item);
  const fins = items.filter(i => i.kind === 'f');
  const sylPool = syllablePool(s, { withFinals: s.fins.size > 0 }).map(syl);
  const words = uniq([...readableWords(s), ...[...s.words]]).map(w => item('w:' + w));
  return {
    jamo: items.filter(i => i.kind === 'v' || i.kind === 'c'),
    syl: sylPool,
    fins: fins.length >= 2 ? fins : Object.keys({ ㄴ: 1, ㅁ: 1, ㅇ: 1, ㄹ: 1 }).map(f => item('f:' + f)),
    words: words.length >= 4 ? words : Object.keys(WORDS).slice(0, 12).map(w => item('w:' + w)),
  };
}

function fill(exs: (Ex | null)[]): Ex[] {
  return exs.filter((e): e is Ex => !!e);
}

/* ---------- Урок ---------- */
export function genLesson(lessonId: string): { exs: Ex[]; newIds: string[] } {
  const lesson = lessonById(lessonId)!;
  if (lesson.boss !== undefined) return { exs: genBoss(lessonId), newIds: [] };
  const before = learnedBefore(lessonId);
  const newIds = lesson.learn!;
  const allIds = uniq([...before, ...newIds]);
  const s = knownSets(allIds);
  const pools = poolsFor(allIds, s);
  const news = newIds.map(item);
  const exs: (Ex | null)[] = [];

  if (lesson.tip) exs.push({ type: 'tip', tip: lesson.tip });

  // знакомство: карточка + сразу простой вопрос
  news.forEach((it, i) => {
    exs.push({ type: 'intro', item: it });
    if (i > 0) {
      const sub = news.slice(0, i + 1);
      exs.push(it.kind === 'w' ? choice(it, uniq([...sub, ...pools.words]), 'meaning') : choice(it, uniq([...sub, ...pools.jamo.filter(j => j.kind === it.kind)]), 'sound'));
    }
  });

  // закрепление: новые ×2 + немного старого
  const old = before.filter(id => !id.startsWith('w:') || Math.random() < 0.5);
  const targets = shuffle([...news, ...news, ...sample(old, 2).map(item)]);
  for (const t of targets) exs.push(practiceFor(t, s, pools));

  // говорение — для слов, если браузер умеет распознавать речь
  if (news[0].kind === 'w' && recognitionSupported()) {
    const w = pick(news);
    exs.push({ type: 'speak', itemId: w.id, text: w.k, r: w.ru, tr: w.tr! });
  }

  // финальный «матч»
  const matchItems = news.length >= 3 ? news.slice(0, 5) : uniq([...news, ...sample(before.map(item).filter(i => i.kind === news[0].kind), 4 - news.length)]);
  if (matchItems.length >= 3 && news[0].kind !== 'f') exs.push(match(matchItems));

  // «смотри, ты уже можешь прочитать!»
  if (news[0].kind !== 'w') {
    const prev = new Set(readableWords(knownSets(before)));
    const fresh = readableWords(s).filter(w => !prev.has(w));
    for (const w of sample(fresh, 2)) exs.push(choice(item('w:' + w), pools.words, 'meaning'));
  }

  return { exs: fill(exs), newIds };
}

/* ---------- Босс ---------- */
export function genBoss(lessonId: string): Ex[] {
  const lesson = lessonById(lessonId)!;
  const ids = unitItems(lesson.unit);
  const allIds = uniq([...learnedBefore(lessonId), ...ids]);
  const s = knownSets(allIds);
  const pools = poolsFor(allIds, s);
  const targets = shuffle([...ids, ...ids, ...ids]).slice(0, 14).map(item);
  return fill(targets.map(t => practiceFor(t, s, pools)));
}

/* ---------- Повторение (интервальное) ---------- */
export function genPractice(ids: string[], learned: string[]): Ex[] {
  const s = knownSets(learned);
  const pools = poolsFor(learned, s);
  const list = ids.map(item);
  const exs = fill(list.flatMap(t => [practiceFor(t, s, pools), Math.random() < 0.4 ? practiceFor(t, s, pools) : null]));
  if (list.length >= 4) exs.push(match(sample(list.filter(i => i.kind !== 'f'), 4)));
  return shuffle(exs).slice(0, 14);
}

/* ---------- Квиз по сцене ---------- */
export function genDramaQuiz(d: Drama): Ex[] {
  const lines = d.lines;
  const exs: Ex[] = [];
  const opt = <T,>(target: T, others: T[], n = 3) => shuffle([target, ...sample(others.filter(o => o !== target), n)]);

  // смысл фразы
  for (const ln of sample(lines, 2)) {
    const options = opt(ln.tr, uniq(lines.map(l => l.tr)));
    exs.push({ type: 'choice', prompt: 'Что значит эта фраза?', big: ln.k, bigKo: true, after: ln.k, pitch: d.cast[ln.w].pitch,
      options: options.map(o => ({ label: o })), answer: options.indexOf(ln.tr), reveal: `${ln.k} — ${ln.tr}` });
  }
  // аудирование
  {
    const ln = pick(lines);
    const options = opt(ln.k, uniq(lines.map(l => l.k)));
    exs.push({ type: 'choice', prompt: 'Послушай: какую фразу сказали?', audio: ln.k, autoplay: true, pitch: d.cast[ln.w].pitch,
      options: options.map(o => ({ label: o, ko: true })), answer: options.indexOf(ln.k), reveal: `${ln.k} — ${ln.tr}` });
  }
  // пропущенное слово
  const multi = lines.filter(l => l.k.split(' ').length >= 2);
  if (multi.length) {
    const ln = pick(multi);
    const tokens = ln.k.split(' ');
    const idx = Math.floor(Math.random() * tokens.length);
    const clean = (t: string) => t.replace(/[!?.,…]/g, '');
    const missing = clean(tokens[idx]);
    const blanked = tokens.map((t, i) => (i === idx ? t.replace(missing, '＿＿') : t)).join(' ');
    const allTokens = uniq(lines.flatMap(l => l.k.split(' ').map(clean))).filter(t => t && t !== missing);
    const options = opt(missing, allTokens);
    exs.push({ type: 'choice', prompt: `Вставь слово: «${ln.tr}»`, big: blanked, bigKo: true, after: ln.k,
      options: options.map(o => ({ label: o, ko: true })), answer: options.indexOf(missing), reveal: ln.k });
  }
  // кто это сказал?
  {
    const ln = pick(lines);
    const castIds = Object.keys(d.cast);
    const options = shuffle(castIds);
    exs.push({ type: 'choice', prompt: `Кто сказал «${ln.tr}»?`, big: ln.k, bigKo: true,
      options: options.map(c => ({ label: d.cast[c].ru, face: `${d.id}-${c}` })), answer: options.indexOf(ln.w),
      reveal: `${d.cast[ln.w].ru}: ${ln.k}` });
  }
  return exs;
}

/** Для лаборатории слогов */
export const LAB = { L, V, T: T.filter(t => !t || ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅇ'].includes(t)), VERTICAL_V };

/* ---------- Квиз по клипу из дорамы ---------- */
export function genClipQuiz(c: Clip): Ex[] {
  const lines = c.lines.filter(l => l.k.length > 1);
  const exs: Ex[] = [];
  const opt = <T,>(target: T, others: T[], n = 3) => shuffle([target, ...sample(uniq(others).filter(o => o !== target), n)]);
  const clean = (t: string) => t.replace(/[!?.,…]/g, '');

  for (const ln of sample(lines.filter(l => l.k.length >= 4), 2)) {
    const options = opt(ln.tr, lines.map(l => l.tr));
    exs.push({ type: 'choice', prompt: 'Что значит эта фраза?', big: ln.k, bigKo: true, hint: ln.ru,
      options: options.map(o => ({ label: o })), answer: options.indexOf(ln.tr), reveal: `${ln.k} — ${ln.tr}` });
  }
  const glosses = uniq(c.lines.flatMap(l => Object.entries(l.g || {}).map(([k, v]) => `${k}\u0000${v}`))).map(x => x.split('\u0000'));
  for (const [k, v] of sample(glosses, 3)) {
    const options = opt(v, glosses.map(g => g[1]));
    exs.push({ type: 'choice', prompt: 'Что значит это слово из сцены?', big: k, bigKo: true, after: clean(k),
      options: options.map(o => ({ label: o })), answer: options.indexOf(v), reveal: `${k} — ${v}` });
  }
  const multi = lines.filter(l => l.k.split(' ').length >= 3);
  if (multi.length) {
    const ln = pick(multi);
    const tokens = ln.k.split(' ');
    const idx = Math.floor(Math.random() * tokens.length);
    const missing = clean(tokens[idx]);
    if (missing) {
      const blanked = tokens.map((t, i) => (i === idx ? t.replace(missing, '＿＿') : t)).join(' ');
      const options = opt(missing, lines.flatMap(l => l.k.split(' ').map(clean)).filter(Boolean));
      exs.push({ type: 'choice', prompt: `Вставь слово: «${ln.tr}»`, big: blanked, bigKo: true,
        options: options.map(o => ({ label: o, ko: true })), answer: options.indexOf(missing), reveal: ln.k });
    }
  }
  const castIds = Object.keys(c.cast);
  if (castIds.length > 1) {
    const ln = pick(lines.filter(l => l.who));
    const options = shuffle(castIds);
    exs.push({ type: 'choice', prompt: `Кто сказал «${ln.tr}»?`, big: ln.k, bigKo: true,
      options: options.map(id => ({ label: c.cast[id].name })), answer: options.indexOf(ln.who!), reveal: `${c.cast[ln.who!].name}: ${ln.k}` });
  }
  return shuffle(exs);
}
