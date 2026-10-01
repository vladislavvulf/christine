'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { BOSSES, UNITS } from '@/lib/data';
import { currentLesson, isUnlocked } from '@/lib/items';
import { dueItems, todaysQuests, useStore } from '@/lib/store';
import { hasKoreanVoice } from '@/lib/voice';
import { Ring, Stars, useKnown } from './ui';
import { ArrowClockwise, BookOpenText, Check, CloudArrowUp, FastForward, Gift, Lock, Pic, TextAa } from './icons';

const OFFSETS = [0, 52, 78, 52, 0, -52, -78, -52];

export default function PathScreen() {
  const router = useRouter();
  const p = useStore(s => s.p);
  const user = useStore(s => s.user);
  const claim = useStore(s => s.claimQuest);
  const { readable } = useKnown();
  const cur = currentLesson(p.lessons);
  const due = dueItems(p).length;
  const quests = todaysQuests(p.daily.date);
  const curRef = useRef<HTMLDivElement>(null);
  const goalPct = Math.min(1, p.daily.xp / p.goal);

  useEffect(() => {
    if (Object.keys(p.lessons).length) curRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let n = 0;
  return (
    <main className="page">
      <section className="hero">
        <Pic name="tiger" size={72} className="mascot" />
        <div className="grow">
          <h2>{greeting(p.daily.xp, p.goal, !!cur)}</h2>
          <p>Цель дня: {Math.min(p.daily.xp, p.goal)} / {p.goal} XP</p>
          <div className="bar"><i style={{ width: `${goalPct * 100}%` }} /></div>
        </div>
        <Ring value={goalPct}>{goalPct >= 1 ? <Check size={22} weight="bold" /> : `${Math.round(goalPct * 100)}%`}</Ring>
      </section>

      {!hasKoreanVoice() && (
        <div className="notice" style={{ marginTop: 12 }}>
          Озвучка не загрузилась. Проверьте, что папка <b>audio/</b> загружена на хостинг вместе с сайтом.
        </div>
      )}

      <div className="quick">
        <Link href="/practice/">
          <span className="qi" style={{ background: '#e7f0ff', color: '#3d7bff' }}><ArrowClockwise size={26} weight="bold" /></span>Повторение
          {due > 0 && <span className="badge-dot">{due > 99 ? '99+' : due}</span>}
        </Link>
        <Link href="/alphabet/"><span className="qi" style={{ background: '#ffe7ee', color: '#ff4f79' }}><TextAa size={26} weight="bold" /></span>Алфавит</Link>
        <Link href="/alphabet/#words"><span className="qi" style={{ background: '#dcfce9', color: '#179a60' }}><BookOpenText size={26} weight="bold" /></span>Слов: {readable.length}</Link>
      </div>

      <h2 className="section-title">Задания дня</h2>
      <div className="quests">
        {quests.map(q => {
          const val = p.daily[q.key] as number;
          const done = val >= q.goal;
          const claimed = p.daily.claimed.includes(q.id);
          return (
            <div key={q.id} className={`quest ${done ? 'done' : ''} ${claimed ? 'claimed' : ''}`}>
              <Pic name={q.img} size={40} />
              <div className="grow">
                <div className="qt">{q.title}</div>
                <div className="bar yellow"><i style={{ width: `${Math.min(1, val / q.goal) * 100}%` }} /></div>
              </div>
              {claimed ? <span className="pill"><Check size={14} weight="bold" /></span>
                : done ? <button className="btn yellow small" onClick={() => claim(q.id)}><Gift size={18} weight="fill" /> +15</button>
                : <span className="pill">{Math.min(val, q.goal)}/{q.goal}</span>}
            </div>
          );
        })}
      </div>

      {!user && (
        <Link href="/auth/" className="notice row" style={{ marginTop: 14 }}>
          <CloudArrowUp size={28} weight="duotone" />
          <span><b>Сохрани прогресс</b> — войди через Google или по имени, чтобы попасть в рейтинг.</span>
        </Link>
      )}

      {UNITS.map((u, ui) => {
        const unitLocked = !isUnlocked(u.lessons[0].id, p.lessons);
        const doneCount = u.lessons.filter(l => p.lessons[l.id]).length;
        const bossLesson = u.lessons[u.lessons.length - 1];
        return (
          <section className="unit" key={u.id}>
            <div className={`unit-head ${unitLocked ? 'locked' : ''}`} style={{ background: u.color }}>
              <Pic name={u.id} size={52} />
              <div className="grow">
                <small>Юнит {ui + 1} · {doneCount}/{u.lessons.length}</small>
                <h3>{u.title}</h3>
                <small>{u.desc}</small>
              </div>
              {unitLocked && (
                <button className="skip" onClick={() => router.push(`/lesson/${bossLesson.id}/#skip`)} title="Сдать босса и перепрыгнуть">
                  <FastForward size={14} weight="fill" /> Тест
                </button>
              )}
            </div>
            <div className="path">
              {u.lessons.map(l => {
                const off = OFFSETS[n++ % OFFSETS.length];
                const rec = p.lessons[l.id];
                const open = isUnlocked(l.id, p.lessons);
                const isCur = cur?.id === l.id;
                const isBoss = l.boss !== undefined;
                const cls = `node ${isBoss ? 'boss' : ''} ${!open ? 'locked' : rec ? 'done' : ''} ${isCur ? 'current' : ''}`;
                const style = open && !rec && !isBoss ? ({ '--c': u.color, '--cd': shade(u.color) } as React.CSSProperties) : undefined;
                return (
                  <div className="node-wrap" key={l.id} style={{ transform: `translateX(${off}px)` }} ref={isCur ? curRef : undefined}>
                    {isCur && <span className="start-bubble">{rec ? 'Повторить' : 'Начать'}</span>}
                    {rec && !isBoss && <span className="stars"><Stars n={rec.stars} size={18} /></span>}
                    <button
                      className={cls}
                      style={style}
                      aria-label={l.title || 'Босс'}
                      onClick={() => (open ? router.push(`/lesson/${l.id}/`) : navigator.vibrate?.(60))}
                    >
                      {isBoss ? <Pic name={BOSSES[l.boss!].img} size={54} className={open ? '' : 'gray'} />
                        : !open ? <Lock size={28} weight="fill" />
                        : rec ? <Check size={32} weight="bold" />
                        : <span className="ko">{nodeLabel(l.title)}</span>}
                    </button>
                    <div className="node-label">{isBoss ? `Босс: ${BOSSES[l.boss!].name}` : l.title}</div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      <div className="center muted row" style={{ margin: '30px 0 10px', fontWeight: 800, justifyContent: 'center' }}>
        <Pic name="tiger" size={28} /> Новые юниты скоро!
      </div>
    </main>
  );
}

function nodeLabel(title?: string) {
  if (!title) return '★';
  const first = title.split(' ')[0];
  return /[가-힣ㄱ-ㅣ]/.test(first) ? first : '★';
}

function greeting(xp: number, goal: number, hasNext: boolean) {
  if (xp >= goal) return 'Цель выполнена!';
  if (xp > 0) return 'Ещё немного!';
  return hasNext ? 'Привет! Готов учиться?' : 'Курс пройден!';
}

function shade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.round(v * 0.78));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}
