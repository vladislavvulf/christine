'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GAMES } from '@/lib/games-meta';
import { useStore } from '@/lib/store';
import { sfx } from '@/lib/sfx';
import { stopSpeaking } from '@/lib/voice';
import { clamp } from '@/lib/util';
import { confetti, useKnown } from './ui';
import { Lock, Pic, Star, Trophy, X } from './icons';
import { BlitzGame, BuilderGame, CafeGame, MemoryGame, NinjaGame, RainGame, TraceGame, type GameProps, type Hud } from './Games';

const COMPONENTS: Record<string, (p: GameProps) => React.ReactNode> = {
  rain: RainGame, memory: MemoryGame, trace: TraceGame, ninja: NinjaGame, builder: BuilderGame, blitz: BlitzGame, cafe: CafeGame,
};

export function GamesScreen() {
  const known = useKnown();
  const games = useStore(s => s.p.games);
  return (
    <main className="page">
      <h1 className="section-title" style={{ fontSize: '1.5rem', marginTop: 8 }}>Мини-игры</h1>
      <p className="muted" style={{ fontWeight: 700 }}>Игры подстраиваются под твои знания: чем больше букв выучишь, тем разнообразнее задания.</p>
      <div className="games-grid">
        {GAMES.map(g => {
          const lock = g.lock(known);
          const best = games[g.id]?.best;
          const card = (
            <div className={`game-card ${lock ? 'locked' : ''}`} style={{ background: g.color }}>
              {best ? <span className="best"><Trophy size={14} weight="fill" /> {best}</span> : null}
              <span className="ge">{lock ? <Lock size={44} weight="fill" /> : <Pic name={'g_' + g.id} size={64} />}</span>
              <h3>{g.title}</h3>
              <p>{g.desc}</p>
              {lock && <span className="lock">{lock}</span>}
            </div>
          );
          return lock ? <div key={g.id}>{card}</div> : <Link key={g.id} href={`/games/${g.id}/`}>{card}</Link>;
        })}
      </div>
    </main>
  );
}

export default function GameScreen({ id }: { id: string }) {
  const router = useRouter();
  const meta = GAMES.find(g => g.id === id);
  const known = useKnown();
  const best = useStore(s => s.p.games[id]?.best || 0);
  const finishGame = useStore(s => s.finishGame);
  const addXP = useStore(s => s.addXP);
  const [phase, setPhase] = useState<'intro' | 'play' | 'over'>('intro');
  const [run, setRun] = useState(0);
  const [hud, setHudState] = useState<Hud>({ score: 0 });
  const [res, setRes] = useState({ score: 0, xp: 0, record: false });
  const setHud = useCallback((h: Hud) => setHudState(h), []);

  const onEnd = useCallback((score: number) => {
    stopSpeaking();
    const { best: record } = finishGame(id, score);
    const xp = clamp(Math.round(score / 10), 2, 50);
    addXP(xp);
    sfx(record && score > 0 ? 'win' : 'coin');
    if (record && score > 0) confetti(60);
    setRes({ score, xp, record: record && score > 0 });
    setPhase('over');
  }, [id, finishGame, addXP]);

  if (!meta) return <div className="result"><h1>Игра не найдена</h1><Link className="btn" href="/games/">К играм</Link></div>;
  const lock = meta.lock(known);
  const Comp = COMPONENTS[id];

  return (
    <div className="game">
      <div className="g-top">
        <button className="icon-btn" aria-label="Назад" onClick={() => { stopSpeaking(); router.push('/games/'); }}><X size={22} weight="bold" /></button>
        {phase === 'play' && <><span className="score"><Star size={22} weight="fill" /> {hud.score}</span><span className="timer">{hud.extra}</span></>}
        {phase !== 'play' && <b>{meta.title}</b>}
      </div>

      {phase === 'intro' && (
        <div className="g-intro">
          <div className="ge"><Pic name={'g_' + meta.id} size={120} /></div>
          <h1>{meta.title}</h1>
          <p>{meta.rules}</p>
          {best > 0 && <span className="pill"><Trophy size={16} weight="fill" /> Рекорд: {best}</span>}
          {lock ? <div className="notice row"><Lock size={22} weight="fill" /> {lock}</div>
            : <button className="btn block" style={{ maxWidth: 320, background: meta.color }} onClick={() => { sfx('tap'); setPhase('play'); }}>Играть!</button>}
        </div>
      )}

      {phase === 'play' && !lock && <Comp key={run} known={known} onEnd={onEnd} setHud={setHud} />}

      {phase === 'over' && (
        <div className="g-intro">
          <div className="ge"><Pic name={res.record ? 'trophy' : 'gamepad'} size={120} /></div>
          <h1>{res.record ? 'Новый рекорд!' : 'Игра окончена'}</h1>
          <div className="result-stats" style={{ width: '100%', maxWidth: 380 }}>
            <div className="rs y"><small>Очки</small><b>{res.score}</b></div>
            <div className="rs b"><small>Рекорд</small><b>{Math.max(best, res.score)}</b></div>
            <div className="rs g"><small>Опыт</small><b>+{res.xp}</b></div>
          </div>
          <div style={{ display: 'grid', gap: 10, width: '100%', maxWidth: 380 }}>
            <button className="btn block green" onClick={() => { setRun(r => r + 1); setHudState({ score: 0 }); setPhase('play'); }}>Ещё раз</button>
            <Link className="btn block ghost" href="/games/">Другие игры</Link>
          </div>
        </div>
      )}
    </div>
  );
}
