'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ACHIEVEMENTS, DRAMAS, QUESTS, UNITS, type Quest } from './data';
import { ALL_LESSONS, knownSets, learnedFrom, readableWords } from './items';
import { dayKey, levelOf, seeded, yesterdayKey } from './util';
import { sfx } from './sfx';
import { GAME_IDS } from './games-meta';

/* ---------- Типы ---------- */
export type LessonRec = { stars: number; best: number; n: number };
export type SrsRec = { s: number; due: number; ok: number; bad: number };
export type Daily = {
  date: string; xp: number; lessons: number; games: number; dramas: number;
  maxCombo: number; perfect: number; practice: number; correct: number; claimed: string[];
};
export type Progress = {
  xp: number;
  lessons: Record<string, LessonRec>;
  srs: Record<string, SrsRec>;
  streak: { count: number; best: number; last: string };
  daily: Daily;
  goal: number;
  ach: Record<string, number>;
  games: Record<string, { best: number; plays: number }>;
  dramas: Record<string, { stars: number; best: number }>;
  stats: { correct: number; wrong: number; lessons: number; bosses: number; maxCombo: number; speak: number };
  avatar: string;
  updated: number;
};
export type Settings = { sound: boolean; voice: boolean; rate: number; theme: 'auto' | 'light' | 'dark'; roman: boolean };
export type User = { id: number; username: string; avatar: string };
export type Toast = { id: number; img: string; title: string; text?: string; kind: 'xp' | 'ach' | 'level' | 'info' | 'streak' };

const emptyDaily = (): Daily => ({
  date: dayKey(), xp: 0, lessons: 0, games: 0, dramas: 0, maxCombo: 0, perfect: 0, practice: 0, correct: 0, claimed: [],
});

export const emptyProgress = (): Progress => ({
  xp: 0, lessons: {}, srs: {}, streak: { count: 0, best: 0, last: '' }, daily: emptyDaily(), goal: 30, ach: {},
  games: {}, dramas: {}, stats: { correct: 0, wrong: 0, lessons: 0, bosses: 0, maxCombo: 0, speak: 0 }, avatar: 'a_tiger', updated: 0,
});

/** Приводим сохранённый прогресс к текущему формату */
export function normalize(p: Partial<Progress>): Progress {
  const out = { ...emptyProgress(), ...p } as Progress;
  if (!out.avatar || !out.avatar.startsWith('a_')) out.avatar = 'a_tiger';
  return out;
}

/** Интервалы повторения (часы) по уровню «силы» элемента */
const SRS_HOURS = [0, 4, 24, 72, 168, 384];

type State = {
  p: Progress;
  settings: Settings;
  token: string | null;
  user: User | null;
  pendingXp: number;
  toasts: Toast[];

  ensureDay: () => void;
  addXP: (n: number, why?: string) => void;
  answer: (itemId: string | undefined, ok: boolean) => void;
  combo: (n: number) => void;
  finishLesson: (id: string, r: { acc: number; perfect: boolean; boss: boolean; skip?: boolean }) => number;
  finishPractice: () => void;
  finishGame: (id: string, score: number) => { best: boolean };
  finishDrama: (id: string, stars: number) => void;
  spoke: (score: number) => void;
  claimQuest: (id: string) => void;
  setSetting: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  setGoal: (g: number) => void;
  setAvatar: (a: string) => void;
  login: (token: string, user: User, progress: Progress | null) => void;
  logout: () => void;
  replaceProgress: (p: Progress) => void;
  ackXp: (n: number) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dropToast: (id: number) => void;
  checkAch: () => void;
};

let toastId = 1;

export const useStore = create<State>()(
  persist(
    (set, get) => {
      /** Изменить прогресс (иммутабельно) */
      const mut = (fn: (p: Progress) => void) => {
        const p: Progress = structuredClone(get().p);
        fn(p);
        p.updated = Date.now();
        set({ p });
      };

      return {
        p: emptyProgress(),
        settings: { sound: true, voice: true, rate: 0.85, theme: 'auto', roman: true },
        token: null,
        user: null,
        pendingXp: 0,
        toasts: [],

        ensureDay: () => {
          const { p } = get();
          const today = dayKey();
          const broken = p.streak.last && p.streak.last !== today && p.streak.last !== yesterdayKey();
          if (p.daily.date !== today || (broken && p.streak.count)) {
            mut(q => {
              if (q.daily.date !== today) q.daily = emptyDaily();
              if (broken) q.streak.count = 0;
            });
          }
        },

        addXP: (n, why) => {
          if (n <= 0) return;
          get().ensureDay();
          const before = levelOf(get().p.xp).lvl;
          const today = dayKey();
          let streakUp = 0;
          mut(p => {
            p.xp += n;
            p.daily.xp += n;
            if (p.streak.last !== today) {
              p.streak.count = p.streak.last === yesterdayKey() ? p.streak.count + 1 : 1;
              p.streak.last = today;
              p.streak.best = Math.max(p.streak.best, p.streak.count);
              streakUp = p.streak.count;
            }
          });
          set(s => ({ pendingXp: s.pendingXp + n }));
          const after = levelOf(get().p.xp).lvl;
          if (why) get().toast({ kind: 'xp', img: 'star', title: `+${n} XP`, text: why });
          if (streakUp) get().toast({ kind: 'streak', img: 'fire', title: `Серия: ${streakUp} д.`, text: streakUp > 1 ? 'Так держать!' : 'Первый день серии!' });
          if (after > before) {
            sfx('levelup');
            get().toast({ kind: 'level', img: 'glowstar', title: `Уровень ${after}!`, text: 'Новый уровень' });
          }
          get().checkAch();
        },

        answer: (itemId, ok) => {
          get().ensureDay();
          mut(p => {
            if (ok) { p.stats.correct++; p.daily.correct++; } else p.stats.wrong++;
            if (!itemId) return;
            const r = p.srs[itemId] || { s: 0, due: 0, ok: 0, bad: 0 };
            if (ok) { r.ok++; r.s = Math.min(5, r.s + 1); } else { r.bad++; r.s = Math.max(0, r.s - 2); }
            r.due = Date.now() + SRS_HOURS[r.s] * 3600_000;
            p.srs[itemId] = r;
          });
        },

        combo: n => {
          const { p } = get();
          if (n > p.daily.maxCombo || n > p.stats.maxCombo) {
            mut(q => {
              q.daily.maxCombo = Math.max(q.daily.maxCombo, n);
              q.stats.maxCombo = Math.max(q.stats.maxCombo, n);
            });
          }
        },

        finishLesson: (id, r) => {
          get().ensureDay();
          const stars = r.skip ? 1 : r.perfect ? 3 : r.acc >= 0.8 ? 2 : 1;
          mut(p => {
            // «перепрыгнуть» через юнит: засчитываем все уроки до этого босса включительно
            const target = ALL_LESSONS.find(x => x.id === id)!;
            const ids = r.skip ? ALL_LESSONS.filter(l => l.index <= target.index && !p.lessons[l.id]).map(l => l.id).concat(p.lessons[id] ? [id] : []) : [id];
            for (const lid of ids) {
              const prev = p.lessons[lid] || { stars: 0, best: 0, n: 0 };
              p.lessons[lid] = { stars: Math.max(prev.stars, lid === id ? stars : 1), best: Math.max(prev.best, Math.round(r.acc * 100)), n: prev.n + 1 };
            }
            p.stats.lessons++;
            p.daily.lessons++;
            if (r.perfect) p.daily.perfect++;
            if (r.boss) p.stats.bosses++;
          });
          get().checkAch();
          return stars;
        },

        finishPractice: () => { mut(p => { p.daily.practice++; }); get().checkAch(); },

        finishGame: (id, score) => {
          get().ensureDay();
          const prev = get().p.games[id]?.best || 0;
          mut(p => {
            const g = p.games[id] || { best: 0, plays: 0 };
            p.games[id] = { best: Math.max(g.best, score), plays: g.plays + 1 };
            p.daily.games++;
          });
          get().checkAch();
          return { best: score > prev };
        },

        finishDrama: (id, stars) => {
          get().ensureDay();
          mut(p => {
            const d = p.dramas[id] || { stars: 0, best: 0 };
            p.dramas[id] = { stars: Math.max(d.stars, stars), best: Math.max(d.best, stars) };
            p.daily.dramas++;
          });
          get().checkAch();
        },

        spoke: score => {
          if (score >= 0.8) mut(p => { p.stats.speak++; });
          get().checkAch();
        },

        claimQuest: id => {
          const q = QUESTS.find(x => x.id === id);
          if (!q || get().p.daily.claimed.includes(id)) return;
          mut(p => { p.daily.claimed.push(id); });
          sfx('coin');
          get().addXP(15, `Задание: ${q.title}`);
        },

        setSetting: (k, v) => set(s => ({ settings: { ...s.settings, [k]: v } })),
        setGoal: g => mut(p => { p.goal = g; }),
        setAvatar: a => mut(p => { p.avatar = a; }),

        login: (token, user, progress) => {
          set({ token, user, pendingXp: 0 });
          if (progress && progress.updated) set({ p: normalize(progress) });
        },
        logout: () => set({ token: null, user: null, pendingXp: 0, p: emptyProgress() }),
        replaceProgress: p => set({ p: normalize(p) }),
        ackXp: n => set(s => ({ pendingXp: Math.max(0, s.pendingXp - n) })),

        toast: t => {
          const id = toastId++;
          set(s => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
          setTimeout(() => get().dropToast(id), t.kind === 'ach' ? 4200 : 2600);
        },
        dropToast: id => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),

        checkAch: () => {
          const { p } = get();
          const done = (unitId: string) => UNITS.find(u => u.id === unitId)!.lessons.every(l => p.lessons[l.id]);
          const readable = readableWords(knownSets(learnedFrom(p.lessons))).length;
          const hour = new Date().getHours();
          const cond: Record<string, boolean> = {
            first: Object.keys(p.lessons).length > 0,
            vowels: done('u1'),
            builder: done('u2'),
            alphabet: ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'].every(done),
            streak3: p.streak.best >= 3,
            streak7: p.streak.best >= 7,
            streak30: p.streak.best >= 30,
            combo10: p.stats.maxCombo >= 10,
            combo25: p.stats.maxCombo >= 25,
            perfect: Object.values(p.lessons).some(l => l.stars >= 3),
            boss1: p.stats.bosses >= 1,
            boss5: p.stats.bosses >= 5,
            reader20: readable >= 20,
            reader50: readable >= 50,
            gamer: GAME_IDS.every(g => p.games[g]),
            drama3: Object.keys(p.dramas).length >= 3,
            dramaAll: DRAMAS.every(d => p.dramas[d.id]),
            speaker: p.stats.speak >= 1,
            xp1000: p.xp >= 1000,
            xp5000: p.xp >= 5000,
            night: p.xp > 0 && hour >= 23,
            early: p.xp > 0 && hour < 7 && hour >= 4,
          };
          const fresh = ACHIEVEMENTS.filter(a => cond[a.id] && !p.ach[a.id]);
          if (!fresh.length) return;
          mut(q => { fresh.forEach(a => (q.ach[a.id] = Date.now())); });
          sfx('win');
          fresh.forEach(a => get().toast({ kind: 'ach', img: a.img, title: a.title, text: 'Новое достижение!' }));
        },
      };
    },
    {
      name: 'christine',
      version: 2,
      migrate: (state) => {
        const st = state as { p?: Progress };
        if (st.p) st.p = normalize(st.p);
        return state as State;
      },
      partialize: s => ({ p: s.p, settings: s.settings, token: s.token, user: s.user, pendingXp: s.pendingXp }),
    },
  ),
);

/** Три задания на сегодня — одинаковые для всех в этот день */
export function todaysQuests(date = dayKey()): Quest[] {
  const r = seeded(date);
  const pool = QUESTS.slice();
  const out: Quest[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

/** Элементы, которые пора повторить */
export function dueItems(p: Progress, now = Date.now()): string[] {
  return Object.entries(p.srs)
    .filter(([, r]) => r.due <= now)
    .sort((a, b) => a[1].s - b[1].s || a[1].due - b[1].due)
    .map(([id]) => id);
}
