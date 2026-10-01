// Сборка/разборка слогов хангыля по формуле Unicode и латинизация (Revised Romanization)

export const L = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
export const V = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'];
export const T = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const RL = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const RV = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const RT = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];

/** Какой из 7 «звуков-патчхимов» обозначает финальная буква */
export const FINAL_GROUP: Record<string, string> = {
  'ㄱ': 'ㄱ', 'ㄲ': 'ㄱ', 'ㅋ': 'ㄱ', 'ㄳ': 'ㄱ', 'ㄺ': 'ㄱ',
  'ㄴ': 'ㄴ', 'ㄵ': 'ㄴ', 'ㄶ': 'ㄴ',
  'ㄷ': 'ㄷ', 'ㅅ': 'ㄷ', 'ㅆ': 'ㄷ', 'ㅈ': 'ㄷ', 'ㅊ': 'ㄷ', 'ㅌ': 'ㄷ', 'ㅎ': 'ㄷ',
  'ㄹ': 'ㄹ', 'ㄼ': 'ㄹ', 'ㄽ': 'ㄹ', 'ㄾ': 'ㄹ', 'ㅀ': 'ㄹ',
  'ㅁ': 'ㅁ', 'ㄻ': 'ㅁ',
  'ㅂ': 'ㅂ', 'ㅍ': 'ㅂ', 'ㅄ': 'ㅂ', 'ㄿ': 'ㅂ',
  'ㅇ': 'ㅇ',
};

/** Вертикальные гласные ставятся справа от согласной, горизонтальные — снизу */
export const VERTICAL_V = new Set(['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅣ']);

export type Parts = { l: string; v: string; t: string };

export function compose(l: string, v: string, t = ''): string {
  const li = L.indexOf(l), vi = V.indexOf(v), ti = T.indexOf(t);
  if (li < 0 || vi < 0 || ti < 0) return '';
  return String.fromCharCode(0xac00 + (li * 21 + vi) * 28 + ti);
}

export function isSyllable(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 0xac00 && c <= 0xd7a3;
}

export function decompose(ch: string): Parts | null {
  if (!ch || !isSyllable(ch)) return null;
  const n = ch.charCodeAt(0) - 0xac00;
  return { l: L[Math.floor(n / 588)], v: V[Math.floor((n % 588) / 28)], t: T[n % 28] };
}

/** Латинизация слога или строки (без правил ассимиляции — для отдельных слогов этого достаточно) */
export function romanize(text: string): string {
  let out = '';
  for (const ch of text) {
    if (!isSyllable(ch)) { out += ch; continue; }
    const n = ch.charCodeAt(0) - 0xac00;
    out += RL[Math.floor(n / 588)] + RV[Math.floor((n % 588) / 28)] + RT[n % 28];
  }
  return out;
}

/* ---------- Русская транскрипция (упрощённая, «как слышится») ---------- */
const CL = ['г', 'кк', 'н', 'д', 'тт', 'р', 'м', 'б', 'пп', 'с', 'сс', '', 'дж', 'чч', 'чх', 'кх', 'тх', 'пх', 'х'];
// гласная: [в начале слога (после немой ㅇ), после согласной]
const CV: [string, string][] = [
  ['а', 'а'], ['э', 'э'], ['я', 'я'], ['йэ', 'е'], ['ŏ', 'ŏ'], ['е', 'е'], ['йŏ', 'ьŏ'], ['йе', 'е'], ['о', 'о'], ['ва', 'ва'],
  ['вэ', 'вэ'], ['вэ', 'вэ'], ['ё', 'ё'], ['у', 'у'], ['во', 'во'], ['вэ', 'вэ'], ['ви', 'ви'], ['ю', 'ю'], ['ы', 'ы'], ['ый', 'ый'], ['и', 'и'],
];
const CT: Record<string, string> = { 'ㄱ': 'к', 'ㄴ': 'н', 'ㄷ': 'т', 'ㄹ': 'ль', 'ㅁ': 'м', 'ㅂ': 'п', 'ㅇ': 'нг' };

/** Русская транскрипция слога/строки — по слогам, без правил ассимиляции */
export function cyrillic(text: string): string {
  let out = '';
  for (const ch of text) {
    if (!isSyllable(ch)) { out += ch; continue; }
    const n = ch.charCodeAt(0) - 0xac00;
    const li = Math.floor(n / 588), vi = Math.floor((n % 588) / 28), ti = n % 28;
    const init = CL[li];
    out += init + CV[vi][init ? 1 : 0] + (ti ? CT[FINAL_GROUP[T[ti]]] : '');
  }
  return out;
}

/** Только слоги хангыля из строки */
export function syllablesOf(text: string): string[] {
  return [...text].filter(isSyllable);
}

/** Нормализация для сравнения произнесённого текста */
export function normalizeKo(text: string): string {
  return syllablesOf(text).join('');
}
