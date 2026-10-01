export const rnd = (n: number) => Math.floor(Math.random() * n);

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const sample = <T,>(arr: T[], n: number): T[] => shuffle(arr).slice(0, n);
export const pick = <T,>(arr: T[]): T => arr[rnd(arr.length)];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const uniq = <T,>(arr: T[]): T[] => [...new Set(arr)];

/** Дата в локальном часовом поясе: YYYY-MM-DD */
export function dayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dayKey(d);
}

/** Детерминированный ГПСЧ (для ежедневных заданий — одинаковые у всех в этот день) */
export function seeded(seedStr: string) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Расстояние Левенштейна — для оценки произношения */
export function similarity(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return 1 - dp[a.length][b.length] / Math.max(a.length, b.length);
}

/** Уровень по XP: для уровня L нужно 25·L·(L−1) XP */
export function levelOf(xp: number) {
  let lvl = 1;
  while (25 * (lvl + 1) * lvl <= xp) lvl++;
  const cur = 25 * lvl * (lvl - 1);
  const next = 25 * (lvl + 1) * lvl;
  return { lvl, cur, next, pct: (xp - cur) / (next - cur) };
}

export const LEAGUES = [
  { min: 0, name: 'Бронза', e: '🥉' },
  { min: 500, name: 'Серебро', e: '🥈' },
  { min: 2000, name: 'Золото', e: '🥇' },
  { min: 5000, name: 'Сапфир', e: '💎' },
  { min: 10000, name: 'Корона', e: '👑' },
];
export const leagueOf = (xp: number) => [...LEAGUES].reverse().find(l => xp >= l.min)!;

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
