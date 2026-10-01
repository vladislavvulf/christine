'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Ex } from '@/lib/gen';
import { TIPS } from '@/lib/data';
import { compose, cyrillic, normalizeKo } from '@/lib/hangul';
import { useStore } from '@/lib/store';
import { sfx, vibrate } from '@/lib/sfx';
import { listenOnce, speak, stopSpeaking } from '@/lib/voice';
import { pick, shuffle, similarity } from '@/lib/util';
import { Html, Speaker } from './ui';
import { CastFace, CheckCircle, Fire, Heart, Lightbulb, Microphone, Pic, SpeakerHigh, X, XCircle } from './icons';

export type SessionResult = {
  correct: number; wrong: number; maxCombo: number; acc: number; perfect: boolean; seconds: number; failed: boolean;
};

type Props = {
  exs: Ex[];
  mode: 'lesson' | 'boss' | 'practice' | 'drama';
  boss?: { name: string; img: string };
  onExit: () => void;
  onComplete: (r: SessionResult) => void;
};

const PRAISE = ['Отлично!', 'Супер!', '잘했어요! Молодец!', 'Точно в цель!', 'Великолепно!', 'Так держать!', '대박! Круто!'];
const graded = (e: Ex) => e.type !== 'tip' && e.type !== 'intro' && e.type !== 'speak';

type Feedback = { ok: boolean; reveal?: string; praise?: string } | null;

export default function Session({ exs, mode, boss, onExit, onComplete }: Props) {
  const [queue, setQueue] = useState<Ex[]>(exs);
  const [idx, setIdx] = useState(0);
  const [fb, setFb] = useState<Feedback>(null);
  const [combo, setCombo] = useState(0);
  const [bump, setBump] = useState(0);
  const [hearts, setHearts] = useState(3);
  const [monster, setMonster] = useState('');
  const stats = useRef({ correct: 0, wrong: 0, maxCombo: 0, start: Date.now() });
  const retried = useRef(new WeakSet<Ex>());
  const answerStore = useStore(s => s.answer);
  const comboStore = useStore(s => s.combo);

  const bossHp = useMemo(() => exs.filter(graded).length, [exs]);
  const [hp, setHp] = useState(bossHp);

  const ex = queue[idx];

  const finish = useCallback((failed = false) => {
    const s = stats.current;
    const total = s.correct + s.wrong;
    onComplete({
      correct: s.correct, wrong: s.wrong, maxCombo: s.maxCombo, acc: total ? s.correct / total : 1,
      perfect: s.wrong === 0 && !failed, seconds: Math.round((Date.now() - s.start) / 1000), failed,
    });
  }, [onComplete]);

  const next = useCallback(() => {
    stopSpeaking();
    setFb(null);
    if (mode === 'boss' && hearts <= 0) return finish(true);
    if (idx + 1 >= queue.length) return finish(false);
    setIdx(i => i + 1);
  }, [idx, queue.length, finish, hearts, mode]);

  const answer = useCallback((ok: boolean, reveal?: string, itemId?: string, silent = false) => {
    answerStore(itemId, ok);
    if (ok) {
      stats.current.correct++;
      const c = combo + 1;
      setCombo(c);
      setBump(b => b + 1);
      stats.current.maxCombo = Math.max(stats.current.maxCombo, c);
      comboStore(c);
      sfx(c > 0 && c % 5 === 0 ? 'combo' : 'correct');
      if (mode === 'boss') { setHp(h => Math.max(0, h - 1)); setMonster('hit'); setTimeout(() => setMonster(''), 400); }
    } else {
      stats.current.wrong++;
      setCombo(0);
      sfx('wrong');
      vibrate(120);
      if (mode === 'boss') {
        setHearts(h => h - 1);
        setMonster('attack');
        setTimeout(() => setMonster(''), 500);
      }
      // ошибка — повторим это задание в конце
      if (ex && graded(ex) && ex.type !== 'match' && !retried.current.has(ex)) {
        retried.current.add(ex);
        setQueue(q => [...q, ex]);
      }
    }
    if (!silent) setFb({ ok, reveal, praise: pick(PRAISE) });
  }, [answerStore, comboStore, combo, ex, mode]);

  // клавиатура: Enter — дальше
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && fb) { e.preventDefault(); next(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fb, next]);

  if (!ex) return null;
  const progress = Math.min(1, idx / queue.length + (fb ? 1 / queue.length : 0));

  return (
    <div className="session">
      <div className="s-top">
        <button className="icon-btn" aria-label="Выйти" onClick={() => { if (confirm('Выйти? Прогресс этого урока не сохранится.')) { stopSpeaking(); onExit(); } }}><X size={22} weight="bold" /></button>
        <div className="bar"><i style={{ width: `${progress * 100}%` }} /></div>
        {mode === 'boss'
          ? <span className="hearts">{[0, 1, 2].map(i => <Heart key={i} size={24} weight="fill" className={i < hearts ? 'heart-on' : 'heart-off'} />)}</span>
          : <span key={bump} className={`combo-chip ${combo >= 2 ? 'bump' : ''}`}>{combo >= 2 && <><Fire size={20} weight="fill" />×{combo}</>}</span>}
      </div>
      {mode === 'boss' && boss && (
        <div className="boss-arena">
          <span className={`monster ${monster}`}><Pic name={hp <= 0 ? 'collision' : boss.img} size={64} /></span>
          <div className="grow">
            <div className="name">{boss.name} · HP {hp}/{bossHp}</div>
            <div className="bar red"><i style={{ width: `${(hp / bossHp) * 100}%` }} /></div>
          </div>
        </div>
      )}

      <div className="s-body" key={idx}>
        {ex.type === 'tip' && <TipView tip={ex.tip} onNext={next} />}
        {ex.type === 'intro' && <IntroView ex={ex} onNext={next} />}
        {ex.type === 'choice' && <ChoiceView ex={ex} locked={!!fb} onAnswer={(ok) => answer(ok, ex.reveal, ex.itemId)} />}
        {ex.type === 'build' && <BuildView ex={ex} locked={!!fb} onAnswer={ok => answer(ok, `${ex.target} = ${ex.label}`, ex.itemId)} />}
        {ex.type === 'assemble' && <AssembleView ex={ex} locked={!!fb} onAnswer={ok => answer(ok, ex.reveal, ex.itemId)} />}
        {ex.type === 'match' && <MatchView ex={ex} onMistake={id => answer(false, undefined, id, true)} onPair={id => answerStore(id, true)} onDone={() => answer(true, 'Все пары найдены!')} />}
        {ex.type === 'speak' && <SpeakView ex={ex} onDone={ok => { if (ok) { stats.current.correct++; sfx('correct'); setFb({ ok: true, reveal: ex.text, praise: pick(PRAISE) }); } else next(); }} />}
      </div>

      {fb && (
        <div className={`feedback ${fb.ok ? 'ok' : 'bad'}`} role="status">
          <h3>{fb.ok ? <><CheckCircle size={28} weight="fill" /> {fb.praise}</> : <><XCircle size={28} weight="fill" /> Почти!</>}</h3>
          {fb.reveal && <div className="fb-text">{fb.ok ? '' : 'Правильно: '}<span className="ko">{fb.reveal}</span></div>}
          <button className={`btn block ${fb.ok ? 'green' : 'red'}`} onClick={next} autoFocus>Дальше</button>
        </div>
      )}
    </div>
  );
}

/* ================= Упражнения ================= */

function TipView({ tip, onNext }: { tip: string; onNext: () => void }) {
  const t = TIPS[tip];
  return (
    <>
      <div className="tip-card">
        <div className="mascot-say"><Pic name="tiger" size={64} className="m" /><div className="bubble">{t.title}</div></div>
        <Html html={t.html} />
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 16 }}><button className="btn block blue" onClick={onNext}>Понятно!</button></div>
    </>
  );
}

function IntroView({ ex, onNext }: { ex: Extract<Ex, { type: 'intro' }>; onNext: () => void }) {
  const it = ex.item;
  useEffect(() => { const t = setTimeout(() => speak(it.say), 350); return () => clearTimeout(t); }, [it.say]);
  const isWord = it.kind === 'w';
  const kindLabel = { v: 'Новая гласная', c: 'Новая согласная', f: 'Новый патчхим', s: 'Слог', w: 'Новое слово' }[it.kind];
  return (
    <>
      <div className="s-prompt">{kindLabel}</div>
      <div className="intro-card">
        {isWord && it.img && <Pic name={it.img} size={96} />}
        <div className={`glyph ${isWord ? 'word' : ''}`}>{it.k}</div>
        <div className="rr">«{it.ru}»</div>
        {it.h && <div className="ru">{it.h}</div>}
        {it.tr && <div className="tr">{it.tr}</div>}
        <div className="row" style={{ justifyContent: 'center', marginTop: 12 }}>
          <Speaker text={it.say} small />
          <button className="btn ghost small" onClick={() => speak(it.say, { rate: 0.6 })}><Pic name="turtle" size={22} /> Медленно</button>
        </div>
        {it.m && <div className="mnemo"><Lightbulb size={26} weight="duotone" className="t" /><span>{it.m}</span></div>}
        {it.kind === 'c' && <ExampleSyllables jamo={it.k} />}
      </div>
      <div style={{ marginTop: 'auto' }}><button className="btn block" onClick={onNext}>Запомнил!</button></div>
    </>
  );
}

function ExampleSyllables({ jamo }: { jamo: string }) {
  const list = ['ㅏ', 'ㅗ', 'ㅣ', 'ㅜ'].map(v => compose(jamo, v));
  return (
    <div className="word-chips" style={{ marginTop: 12 }}>
      {list.map(s => <button key={s} className="chip" onClick={() => speak(s)}><span className="ko">{s}</span> <span className="muted">{cyrillic(s)}</span> <SpeakerHigh size={16} weight="fill" /></button>)}
    </div>
  );
}

function ChoiceView({ ex, locked, onAnswer }: { ex: Extract<Ex, { type: 'choice' }>; locked: boolean; onAnswer: (ok: boolean) => void }) {
  const [chosen, setChosen] = useState<number | null>(null);
  useEffect(() => {
    if (!ex.autoplay || !ex.audio) return;
    const t = setTimeout(() => speak(ex.audio!, { pitch: ex.pitch }), 300);
    return () => clearTimeout(t);
  }, [ex]);

  const choose = useCallback((i: number) => {
    if (locked || chosen !== null) return;
    setChosen(i);
    const ok = i === ex.answer;
    onAnswer(ok);
    if (ex.after) setTimeout(() => speak(ex.after!, { pitch: ex.pitch }), 150);
    else if (ex.audio && !ok) setTimeout(() => speak(ex.audio!, { pitch: ex.pitch }), 150);
  }, [locked, chosen, ex, onAnswer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const n = Number(e.key); if (n >= 1 && n <= ex.options.length) choose(n - 1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choose, ex.options.length]);

  const long = ex.options.some(o => o.label.length > (o.ko ? 5 : 12));
  return (
    <>
      <div className="s-prompt">{ex.prompt}</div>
      {ex.hint && <div className="s-hint">{ex.hint}</div>}
      {ex.img && <div className="center" style={{ padding: '10px 0' }}><Pic name={ex.img} size={120} /></div>}
      {ex.big && <div className={`s-big ${ex.big.length > 12 ? 'xsmall' : ex.big.length > 4 ? 'small' : ''}`}>{ex.big}</div>}
      {ex.audio && <Speaker text={ex.audio} pitch={ex.pitch} />}
      <div className={`options ${long ? 'list' : ''}`}>
        {ex.options.map((o, i) => {
          const state = chosen === null ? '' : i === ex.answer ? 'right' : i === chosen ? 'wrong' : '';
          return (
            <button key={i} className={`opt ${state}`} disabled={chosen !== null} onClick={() => choose(i)}>
              {o.face && <CastFace id={o.face} size={44} />}
              <span className={o.ko ? 'ko' : ''}>{o.label}</span>
              {o.sub && <small>{o.sub}</small>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function BuildView({ ex, locked, onAnswer }: { ex: Extract<Ex, { type: 'build' }>; locked: boolean; onAnswer: (ok: boolean) => void }) {
  const [l, setL] = useState<string | null>(null);
  const [v, setV] = useState<string | null>(null);
  const [t, setT] = useState<string | null>(ex.ts ? null : '');
  const [done, setDone] = useState(false);
  useEffect(() => { const tm = setTimeout(() => speak(ex.audio), 300); return () => clearTimeout(tm); }, [ex.audio]);
  const preview = l && v ? compose(l, v, t || '') : l || v || '?';
  const ready = l && v && t !== null;
  const check = () => {
    if (!ready || locked) return;
    setDone(true);
    const ok = compose(l!, v!, t!) === ex.target;
    onAnswer(ok);
    speak(ex.target);
  };
  return (
    <>
      <div className="s-prompt">Собери слог «{ex.label}»</div>
      <div className="row" style={{ justifyContent: 'center' }}><Speaker text={ex.audio} small /></div>
      <div className={`builder-preview ${done && preview === ex.target ? 'ok' : ''}`}>{preview}</div>
      <div className="tiles-label">Согласная</div>
      <div className="tiles">{ex.ls.map(c => <button key={c} className={`tile ${l === c ? 'sel' : ''}`} onClick={() => { sfx('tap'); setL(c); }}>{c}</button>)}</div>
      <div className="tiles-label">Гласная</div>
      <div className="tiles">{ex.vs.map(c => <button key={c} className={`tile ${v === c ? 'sel' : ''}`} onClick={() => { sfx('tap'); setV(c); }}>{c}</button>)}</div>
      {ex.ts && <>
        <div className="tiles-label">Патчхим (внизу)</div>
        <div className="tiles">{ex.ts.map(c => <button key={c || 'none'} className={`tile ${c ? '' : 'none'} ${t === c ? 'sel' : ''}`} onClick={() => { sfx('tap'); setT(c); }}>{c || 'нет'}</button>)}</div>
      </>}
      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <button className="btn block green" disabled={!ready || done} onClick={check}>Проверить</button>
      </div>
    </>
  );
}

function AssembleView({ ex, locked, onAnswer }: { ex: Extract<Ex, { type: 'assemble' }>; locked: boolean; onAnswer: (ok: boolean) => void }) {
  const [chosen, setChosen] = useState<number[]>([]);
  const [done, setDone] = useState(false);
  const check = () => {
    if (locked || done) return;
    setDone(true);
    onAnswer(chosen.map(i => ex.tiles[i]).join('') === ex.answer.join(''));
    speak(ex.audio);
  };
  return (
    <>
      <div className="s-prompt">Собери слово</div>
      <div className="mascot-say" style={{ marginTop: 8 }}>
        <Pic name={ex.img || 'tiger'} size={64} className="m" />
        <div className="bubble">«{ex.prompt}»</div>
        <Speaker text={ex.audio} small />
      </div>
      <div className="answer-line">
        {chosen.map((i, pos) => <button key={pos} className="tile" onClick={() => !done && setChosen(c => c.filter((_, p) => p !== pos))}>{ex.tiles[i]}</button>)}
      </div>
      <div className="tiles" style={{ justifyContent: 'center' }}>
        {ex.tiles.map((s, i) => (
          <button key={i} className={`tile ${chosen.includes(i) ? 'used' : ''}`} onClick={() => { sfx('tap'); speak(s); setChosen(c => [...c, i]); }}>{s}</button>
        ))}
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <button className="btn block green" disabled={chosen.length !== ex.answer.length || done} onClick={check}>Проверить</button>
      </div>
    </>
  );
}

function MatchView({ ex, onMistake, onPair, onDone }: { ex: Extract<Ex, { type: 'match' }>; onMistake: (id: string) => void; onPair: (id: string) => void; onDone: () => void }) {
  const left = useMemo(() => shuffle(ex.pairs), [ex]);
  const right = useMemo(() => shuffle(ex.pairs), [ex]);
  const [sel, setSel] = useState<{ side: 'l' | 'r'; id: string } | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [bad, setBad] = useState<string[]>([]);
  const [good, setGood] = useState<string[]>([]);
  const finished = useRef(false);

  const tap = (side: 'l' | 'r', id: string, say?: string) => {
    if (gone.includes(id)) return;
    if (say) speak(say);
    if (!sel || sel.side === side) { sfx('tap'); setSel({ side, id }); return; }
    if (sel.id === id) {
      setGood([id]);
      sfx('correct');
      onPair(id);
      setTimeout(() => {
        setGone(g => {
          const ng = [...g, id];
          if (ng.length === ex.pairs.length && !finished.current) { finished.current = true; setTimeout(onDone, 150); }
          return ng;
        });
        setGood([]);
      }, 350);
    } else {
      setBad([sel.id + sel.side, id + side]);
      onMistake(id);
      setTimeout(() => setBad([]), 450);
    }
    setSel(null);
  };
  const cls = (side: 'l' | 'r', id: string) =>
    `opt ${gone.includes(id) ? 'gone' : ''} ${good.includes(id) ? 'right' : ''} ${bad.includes(id + side) ? 'wrong' : ''} ${sel?.side === side && sel.id === id ? 'sel' : ''}`;

  return (
    <>
      <div className="s-prompt">Найди пары</div>
      <div className="match">
        <div style={{ display: 'grid', gap: 10 }}>
          {left.map(p => <button key={p.id} className={cls('l', p.id)} onClick={() => tap('l', p.id, p.say)}><span className="ko">{p.left}</span></button>)}
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {right.map(p => <button key={p.id} className={cls('r', p.id)} onClick={() => tap('r', p.id)}>{p.right}</button>)}
        </div>
      </div>
    </>
  );
}

function SpeakView({ ex, onDone }: { ex: Extract<Ex, { type: 'speak' }>; onDone: (ok: boolean) => void }) {
  const [state, setState] = useState<'idle' | 'listen' | 'result'>('idle');
  const [score, setScore] = useState(0);
  const [heard, setHeard] = useState('');
  const spoke = useStore(s => s.spoke);
  const rec = async () => {
    setState('listen');
    try {
      const alts = await listenOnce();
      const target = normalizeKo(ex.text);
      let best = 0, bestText = alts[0] || '';
      for (const a of alts) { const s = similarity(normalizeKo(a), target); if (s > best) { best = s; bestText = a; } }
      setScore(best); setHeard(bestText); setState('result');
      spoke(best);
      if (best >= 0.6) onDone(true); else sfx('wrong');
    } catch {
      setHeard('Не удалось включить микрофон'); setScore(0); setState('result');
    }
  };
  return (
    <>
      <div className="s-prompt row"><Microphone size={26} weight="duotone" /> Скажи вслух</div>
      <div className="intro-card">
        <div className="glyph word">{ex.text}</div>
        <div className="rr" style={{ fontSize: '1.2rem' }}>«{ex.r}»</div>
        <div className="tr">{ex.tr}</div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}><Speaker text={ex.text} pitch={ex.pitch} small /></div>
      </div>
      {state === 'result' && (
        <div className="center" style={{ fontWeight: 800 }}>
          {heard && <div>Я услышал: <span className="ko">{heard}</span></div>}
          <div style={{ fontSize: '1.4rem', color: score >= 0.6 ? 'var(--green-d)' : 'var(--red-d)' }}>{Math.round(score * 100)}%</div>
        </div>
      )}
      <div style={{ marginTop: 'auto', display: 'grid', gap: 10 }}>
        <button className="btn block blue" disabled={state === 'listen'} onClick={rec}><Microphone size={22} weight="fill" /> {state === 'listen' ? 'Слушаю…' : state === 'result' ? 'Ещё раз' : 'Нажми и говори'}</button>
        <button className="btn block ghost small" onClick={() => onDone(false)}>Не могу говорить сейчас</button>
      </div>
    </>
  );
}

