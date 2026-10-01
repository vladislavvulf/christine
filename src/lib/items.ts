// Единая модель «учебного элемента»: буква, патчхим, слог или слово
import { JAMO, FINALS, WORDS, UNITS, type Lesson, type Unit } from './data';
import { compose, cyrillic, decompose, romanize, syllablesOf, FINAL_GROUP, L, V } from './hangul';

export type ItemKind = 'v' | 'c' | 'f' | 's' | 'w';
export type Item = {
  id: string;
  kind: ItemKind;
  k: string;        // что показываем крупно
  r: string;        // латиница (внутреннее, в интерфейсе не показываем)
  ru: string;       // русская транскрипция — её видит пользователь
  h?: string;       // подсказка произношения
  tr?: string;      // перевод (для слов)
  img?: string;     // 3D-картинка (для слов)
  m?: string;       // мнемоника
  say: string;      // что озвучивать
  jamo?: string;    // для букв и патчхимов — сама буква
};

const cache = new Map<string, Item>();

export function item(id: string): Item {
  const hit = cache.get(id);
  if (hit) return hit;
  const [type, key] = [id.slice(0, 1), id.slice(2)];
  let it: Item;
  if (type === 'j') {
    const j = JAMO[key];
    it = { id, kind: j.t, k: key, r: j.r, ru: j.ru, h: j.h, m: j.m, say: j.say, jamo: key };
  } else if (type === 'f') {
    const f = FINALS[key];
    const syl = compose('ㅇ', 'ㅏ', key);
    it = { id, kind: 'f', k: syl, r: 'a' + f.r.slice(1), ru: 'а' + f.ru, h: `в конце слога ${key} звучит как «${f.ru}»`, m: f.m, say: f.say, jamo: key };
  } else if (type === 's') {
    it = { id, kind: 's', k: key, r: romanize(key), ru: cyrillic(key), say: key };
  } else {
    const w = WORDS[key];
    it = { id, kind: 'w', k: w.k, r: w.r, ru: w.ru, tr: w.tr, img: key, say: w.k };
  }
  cache.set(id, it);
  return it;
}

export const syl = (ch: string) => item('s:' + ch);

/* ---------- Порядок уроков ---------- */
export type FlatLesson = Lesson & { unit: Unit; unitIndex: number; index: number };
export const ALL_LESSONS: FlatLesson[] = UNITS.flatMap((u, ui) => u.lessons.map(l => ({ ...l, unit: u, unitIndex: ui, index: 0 })));
ALL_LESSONS.forEach((l, i) => (l.index = i));
export const lessonById = (id: string) => ALL_LESSONS.find(l => l.id === id);

/** Все элементы юнита (для босса) */
export const unitItems = (u: Unit) => u.lessons.flatMap(l => l.learn || []);

/** Что изучено ДО урока (по порядку курса) */
export function learnedBefore(lessonId: string): string[] {
  const idx = lessonById(lessonId)?.index ?? 0;
  return ALL_LESSONS.slice(0, idx).flatMap(l => l.learn || []);
}

/** Что изучено по прогрессу */
export function learnedFrom(done: Record<string, unknown>): string[] {
  return ALL_LESSONS.filter(l => done[l.id]).flatMap(l => l.learn || []);
}

export type KnownSets = { cons: Set<string>; vows: Set<string>; fins: Set<string>; words: Set<string>; all: Set<string> };

export function knownSets(ids: string[]): KnownSets {
  const s: KnownSets = { cons: new Set(['ㅇ']), vows: new Set(), fins: new Set(), words: new Set(), all: new Set(ids) };
  for (const id of ids) {
    const k = id.slice(2);
    if (id[0] === 'j') (JAMO[k].t === 'v' ? s.vows : s.cons).add(k);
    else if (id[0] === 'f') s.fins.add(k);
    else if (id[0] === 'w') s.words.add(k);
  }
  return s;
}

/** Можно ли прочитать текст, зная эти буквы */
export function canRead(text: string, s: KnownSets): boolean {
  const syls = syllablesOf(text);
  if (!syls.length) return false;
  return syls.every(ch => {
    const p = decompose(ch)!;
    if (!s.cons.has(p.l) || !s.vows.has(p.v)) return false;
    return !p.t || s.fins.has(FINAL_GROUP[p.t]);
  });
}

/** Все слова, которые уже можно прочитать */
export function readableWords(s: KnownSets): string[] {
  return Object.keys(WORDS).filter(id => s.words.has(id) || canRead(WORDS[id].k, s));
}

/** Слоги из изученных букв */
export function syllablePool(s: KnownSets, opts: { withFinals?: boolean } = {}): string[] {
  const out: string[] = [];
  const cons = L.filter(c => s.cons.has(c));
  const vows = V.filter(v => s.vows.has(v));
  for (const c of cons) for (const v of vows) out.push(compose(c, v));
  if (opts.withFinals) for (const f of s.fins) for (const c of cons) for (const v of vows.slice(0, 6)) out.push(compose(c, v, f));
  return out;
}

/** Метка элемента для вариантов ответа */
export const label = (it: Item) => (it.kind === 'w' ? it.tr! : it.ru);

/** Подбор отвлекающих вариантов: сначала похожие (общая буква), потом случайные */
export function distractors(target: Item, pool: Item[], n: number, lab: (i: Item) => string = label): Item[] {
  const tl = lab(target);
  const seen = new Set([tl, target.k]);
  const cands = pool.filter(p => p.id !== target.id && !seen.has(lab(p)) && p.k !== target.k);
  const tp = target.kind === 's' ? decompose(target.k) : null;
  const similar = tp
    ? cands.filter(c => { const p = decompose(c.k); return p && (p.l === tp.l || p.v === tp.v); })
    : [];
  const res: Item[] = [];
  const take = (list: Item[], max: number) => {
    for (const c of shuffleCopy(list)) {
      if (res.length >= max) break;
      const l = lab(c);
      if (seen.has(l) || seen.has(c.k)) continue;
      seen.add(l); seen.add(c.k);
      res.push(c);
    }
  };
  take(similar, Math.min(2, n));
  take(cands, n);
  return res;
}

function shuffleCopy<T>(a: T[]): T[] {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
}

/** Все буквы для таблицы алфавита */
export const ALPHABET_GROUPS = [
  { title: 'Простые гласные', items: J('ㅏㅓㅗㅜㅡㅣ') },
  { title: 'Йотированные', items: J('ㅑㅕㅛㅠ') },
  { title: 'ㅐ ㅔ и их пары', items: J('ㅐㅔㅒㅖ') },
  { title: 'Дифтонги', items: J('ㅘㅝㅢㅙㅚㅞㅟ') },
  { title: 'Базовые согласные', items: J('ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅎ') },
  { title: 'С придыханием', items: J('ㅋㅌㅍㅊ') },
  { title: 'Напряжённые', items: J('ㄲㄸㅃㅆㅉ') },
  { title: 'Патчхим (7 звуков)', items: [...'ㄱㄴㄷㄹㅁㅂㅇ'].map(c => 'f:' + c) },
];
function J(s: string) { return [...s].map(c => 'j:' + c); }

export const ALL_LETTER_IDS = ALPHABET_GROUPS.flatMap(g => g.items);

/** Урок открыт, если пройден предыдущий */
export function isUnlocked(lessonId: string, done: Record<string, unknown>): boolean {
  const l = lessonById(lessonId);
  if (!l) return false;
  return l.index === 0 || !!done[ALL_LESSONS[l.index - 1].id];
}

/** Первый непройденный урок */
export function currentLesson(done: Record<string, unknown>): FlatLesson | undefined {
  return ALL_LESSONS.find(l => !done[l.id]);
}
