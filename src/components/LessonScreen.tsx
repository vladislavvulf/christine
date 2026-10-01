'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Session, { type SessionResult } from './Session';
import { BOSSES, WORDS } from '@/lib/data';
import { genLesson, genPractice } from '@/lib/gen';
import { isUnlocked, item, knownSets, learnedFrom, lessonById, readableWords } from '@/lib/items';
import { dueItems, useStore } from '@/lib/store';
import { sfx } from '@/lib/sfx';
import { speak } from '@/lib/voice';
import { plural, sample, uniq } from "@/lib/util";
import { confetti } from './ui';
import { BookOpenText, Fire, Pic, Star, Target, Timer } from './icons';

type Done = SessionResult & { xp: number; stars: number; fresh: string[] };

export function xpFor(r: SessionResult, bonus = 0) {
  return 10 + r.correct + Math.floor(r.maxCombo / 5) * 2 + (r.perfect ? 5 : 0) + bonus;
}

export default function LessonScreen({ id }: { id: string }) {
  const router = useRouter();
  const lesson = lessonById(id);
  const lessons = useStore(s => s.p.lessons);
  const finishLesson = useStore(s => s.finishLesson);
  const addXP = useStore(s => s.addXP);
  const [run, setRun] = useState(0);
  const [skip, setSkip] = useState(false);
  const [result, setResult] = useState<Done | null>(null);
  useEffect(() => setSkip(window.location.hash === '#skip'), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => (lesson ? genLesson(id) : null), [id, run]);

  if (!lesson || !data) return <NotFound />;
  const isBoss = lesson.boss !== undefined;
  if (!isUnlocked(id, lessons) && !skip) {
    return (
      <div className="result">
        <div className="trophy"><Pic name="lock" size={110} /></div>
        <h1>Урок пока закрыт</h1>
        <p className="muted">Пройди предыдущие уроки — или проверь знания на боссе юнита, чтобы перепрыгнуть вперёд.</p>
        <Link className="btn block" href="/">На карту</Link>
      </div>
    );
  }
  const boss = isBoss ? BOSSES[lesson.boss!] : undefined;

  const complete = (r: SessionResult) => {
    if (r.failed) { sfx('lose'); setResult({ ...r, xp: 0, stars: 0, fresh: [] }); return; }
    const before = new Set(readableWords(knownSets(learnedFrom(useStore.getState().p.lessons))));
    const stars = finishLesson(id, { acc: r.acc, perfect: r.perfect, boss: isBoss, skip: skip && isBoss });
    const xp = xpFor(r, isBoss ? 20 : 0);
    addXP(xp);
    const after = readableWords(knownSets(learnedFrom(useStore.getState().p.lessons)));
    const fresh = after.filter(w => !before.has(w) && !lesson.learn?.includes('w:' + w));
    sfx('win');
    confetti();
    setResult({ ...r, xp, stars, fresh });
  };

  if (result) {
    return (
      <Result
        r={result}
        title={result.failed ? `${boss?.name} победил…` : isBoss ? `${boss?.name} повержен!` : 'Урок пройден!'}
        icon={result.failed ? 'skull' : isBoss ? 'trophy' : 'party'}
        onRetry={() => { setResult(null); setRun(n => n + 1); }}
        onContinue={() => router.push('/')}
      />
    );
  }

  return (
    <Session
      key={run}
      exs={data.exs}
      mode={isBoss ? 'boss' : 'lesson'}
      boss={boss}
      onExit={() => router.push('/')}
      onComplete={complete}
    />
  );
}

export function Result({ r, title, icon, onRetry, onContinue }: { r: Done; title: string; icon: string; onRetry: () => void; onContinue: () => void }) {
  const mins = Math.floor(r.seconds / 60), secs = r.seconds % 60;
  return (
    <div className="result">
      <div className="trophy"><Pic name={icon} size={120} /></div>
      <h1 style={r.failed ? { color: 'var(--red)' } : undefined}>{title}</h1>
      {r.failed ? (
        <p className="muted">Не сдавайся! Каждая попытка делает тебя сильнее. Попробуй ещё раз.</p>
      ) : (
        <div className="big-stars">
          {[1, 2, 3].map(i => <span key={i} className={i <= r.stars ? '' : 'off'} style={{ animationDelay: `${i * 0.15}s` }}><Star size={54} weight="fill" /></span>)}
        </div>
      )}
      <div className="result-stats">
        <div className="rs y"><small>Опыт</small><b><Star size={20} weight="fill" /> {r.xp}</b></div>
        <div className="rs g"><small>Точность</small><b><Target size={20} weight="bold" /> {Math.round(r.acc * 100)}%</b></div>
        <div className="rs b"><small>Время</small><b><Timer size={20} weight="bold" /> {mins}:{String(secs).padStart(2, '0')}</b></div>
      </div>
      {r.maxCombo >= 3 && <div className="pill" style={{ alignSelf: 'center' }}><Fire size={16} weight="fill" /> Лучшее комбо: ×{r.maxCombo}</div>}
      {r.fresh.length > 0 && (
        <div className="card">
          <b className="row" style={{ justifyContent: 'center' }}><BookOpenText size={22} weight="duotone" /> Теперь ты можешь прочитать {r.fresh.length} {plural(r.fresh.length, "новое слово", "новых слова", "новых слов")}!</b>
          <div className="word-chips" style={{ marginTop: 10 }}>
            {r.fresh.slice(0, 12).map(w => (
              <button key={w} className="chip" onClick={() => speak(WORDS[w].k)}>
                <Pic name={w} size={26} /> <span className="ko">{WORDS[w].k}</span> <span className="muted">{WORDS[w].tr}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        <button className={`btn block ${r.failed ? 'red' : 'green'}`} onClick={r.failed ? onRetry : onContinue}>{r.failed ? 'Реванш!' : 'Продолжить'}</button>
        <button className="btn block ghost" onClick={r.failed ? onContinue : onRetry}>{r.failed ? 'На карту' : 'Пройти ещё раз'}</button>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="result">
      <div className="trophy"><Pic name="thinking" size={110} /></div>
      <h1>Урок не найден</h1>
      <Link className="btn block" href="/">На карту</Link>
    </div>
  );
}

/* ---------- Повторение ---------- */
export function PracticeScreen() {
  const router = useRouter();
  const p = useStore(s => s.p);
  const addXP = useStore(s => s.addXP);
  const finishPractice = useStore(s => s.finishPractice);
  const [run, setRun] = useState(0);
  const [result, setResult] = useState<Done | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exs = useMemo(() => {
    const learned = learnedFrom(p.lessons);
    if (!learned.length) return [];
    const due = dueItems(p).filter(id => { try { item(id); return true; } catch { return false; } });
    const pool = due.length >= 5 ? due.slice(0, 8) : uniq([...due, ...sample(learned, 8 - due.length)]);
    return genPractice(pool, learned);
  }, [run]);

  if (!exs.length) {
    return (
      <div className="result">
        <div className="trophy"><Pic name="seed" size={110} /></div>
        <h1>Пока нечего повторять</h1>
        <p className="muted">Пройди первый урок — и здесь появятся буквы для тренировки.</p>
        <Link className="btn block" href="/">На карту</Link>
      </div>
    );
  }

  if (result) {
    return <Result r={result} title="Повторение завершено!" icon="brain" onRetry={() => { setResult(null); setRun(n => n + 1); }} onContinue={() => router.push('/')} />;
  }

  return (
    <Session key={run} exs={exs} mode="practice" onExit={() => router.push('/')} onComplete={r => {
      const xp = xpFor(r, 0);
      addXP(xp);
      finishPractice();
      sfx('win');
      confetti(50);
      setResult({ ...r, xp, stars: r.perfect ? 3 : r.acc >= 0.8 ? 2 : 1, fresh: [] });
    }} />
  );
}
