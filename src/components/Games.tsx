'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WORDS } from '@/lib/data';
import { compose, decompose, L, V } from '@/lib/hangul';
import { item, label, syl, syllablePool, type Item } from '@/lib/items';
import { sfx, vibrate } from '@/lib/sfx';
import { speak } from '@/lib/voice';
import { clamp, pick, sample, shuffle, uniq } from '@/lib/util';
import { Speaker, floatText, type useKnown } from './ui';
import { Fire, Heart, Pic, SpeakerHigh, Star } from './icons';

export type Known = ReturnType<typeof useKnown>;
export type GameProps = { known: Known; onEnd: (score: number) => void; setHud: (h: Hud) => void };
export type Hud = { score: number; extra?: React.ReactNode };
const hearts = (n: number) => <span className="hearts">{Array.from({ length: Math.max(0, n) }, (_, i) => <Heart key={i} size={20} weight="fill" className="heart-on" />)}</span>;

/* ---------- Пулы ---------- */
function jamoPool(k: Known): Item[] {
  return k.learned.filter(id => id.startsWith('j:')).map(item);
}
function sylPool(k: Known): Item[] {
  const s = syllablePool(k.sets).map(syl);
  return s.length >= 6 ? s : uniq([...s, ...jamoPool(k)]);
}
function mixedPool(k: Known): Item[] {
  const j = jamoPool(k);
  return k.sets.cons.size > 1 ? [...sample(j, 12), ...sample(sylPool(k), 20)] : j;
}
function options(target: Item, pool: Item[], n = 4, lab = label): string[] {
  const others = uniq(pool.filter(p => lab(p) !== lab(target)).map(lab));
  return shuffle([lab(target), ...sample(others, n - 1)]);
}

/** Таймер обратного отсчёта */
function useCountdown(seconds: number, onZero: () => void, setHud: (h: Hud) => void, score: number) {
  const [left, setLeft] = useState(seconds);
  const ref = useRef(onZero);
  ref.current = onZero;
  useEffect(() => {
    const t = setInterval(() => setLeft(l => l - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (left <= 0) ref.current(); }, [left]);
  useEffect(() => { setHud({ score, extra: `⏱ ${Math.max(0, left)}` }); }, [left, score, setHud]);
  return [left, setLeft] as const;
}

/* ================= Хангыль-дождь ================= */
type Drop = { id: number; it: Item; x: number; y: number; pop?: boolean };

export function RainGame({ known, onEnd, setHud }: GameProps) {
  const pool = useMemo(() => mixedPool(known), [known]);
  const field = useRef<HTMLDivElement>(null);
  const [drops, setDrops] = useState<Drop[]>([]);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [shake, setShake] = useState(-1);
  const st = useRef({ id: 0, speed: 38, spawn: 2000, last: 0, lastSpawn: 0, combo: 0, over: false, lives: 3 });

  useEffect(() => { setHud({ score, extra: hearts(lives) }); }, [score, lives, setHud]);

  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      const s = st.current;
      if (s.over) return;
      const dt = s.last ? Math.min(0.05, (t - s.last) / 1000) : 0;
      s.last = t;
      const h = field.current?.clientHeight || 500;
      setDrops(ds => {
        let next = ds.map(d => (d.pop ? d : { ...d, y: d.y + s.speed * dt }));
        const fallen = next.filter(d => !d.pop && d.y > h - 70);
        if (fallen.length) {
          s.lives -= fallen.length;
          s.combo = 0;
          setLives(s.lives);
          sfx('hit'); vibrate(80);
          next = next.filter(d => !fallen.includes(d));
          if (s.lives <= 0) { s.over = true; setTimeout(() => onEnd(scoreRef.current), 300); }
        }
        if (t - s.lastSpawn > s.spawn && next.filter(d => !d.pop).length < 5) {
          s.lastSpawn = t;
          const it = pick(pool);
          next = [...next, { id: ++s.id, it, x: 12 + Math.random() * 76, y: -60 }];
        }
        return next;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pool, onEnd]);

  const scoreRef = useRef(0);
  scoreRef.current = score;
  const target = drops.filter(d => !d.pop).sort((a, b) => b.y - a.y)[0];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const opts = useMemo(() => (target ? options(target.it, pool) : []), [target?.id]);

  const tap = (o: string, i: number) => {
    if (!target) return;
    const s = st.current;
    if (o === label(target.it)) {
      s.combo++;
      const pts = 10 * (1 + Math.floor(s.combo / 5));
      setScore(v => v + pts);
      s.speed = Math.min(150, s.speed + 2.2);
      s.spawn = Math.max(650, s.spawn - 45);
      sfx('pop');
      if (s.combo % 5 === 0) sfx('combo');
      speak(target.it.say);
      setDrops(ds => ds.map(d => (d.id === target.id ? { ...d, pop: true } : d)));
      setTimeout(() => setDrops(ds => ds.filter(d => d.id !== target.id)), 300);
      const rect = field.current?.getBoundingClientRect();
      if (rect) floatText(`+${pts}`, rect.left + (rect.width * target.x) / 100, rect.top + target.y);
    } else {
      s.combo = 0;
      sfx('wrong'); vibrate(60);
      setShake(i);
      setTimeout(() => setShake(-1), 400);
    }
  };

  return (
    <>
      <div className="rain-field" ref={field}>
        {drops.map(d => (
          <div key={d.id} className={`drop ${d === target ? 'target' : ''} ${d.pop ? 'pop' : ''}`} style={{ left: `${d.x}%`, top: d.y }}>{d.it.k}</div>
        ))}
        <div className="ground" />
      </div>
      <div className="g-answers">
        {opts.map((o, i) => <button key={o + i} className={`opt ${shake === i ? 'wrong' : ''}`} onClick={() => tap(o, i)}>{o}</button>)}
      </div>
    </>
  );
}

/* ================= Мемори ================= */
type MemCard = { key: string; pair: string; text: string; ko: boolean };

export function MemoryGame({ known, onEnd, setHud }: GameProps) {
  const cards = useMemo<MemCard[]>(() => {
    const base = jamoPool(known);
    const pool = base.length >= 6 ? base : uniq([...base, ...sylPool(known)]);
    const chosen = sample(pool, Math.min(6, pool.length));
    return shuffle(chosen.flatMap(it => [
      { key: it.id + 'k', pair: it.id, text: it.k, ko: true },
      { key: it.id + 'r', pair: it.id, text: it.ru, ko: false },
    ]));
  }, [known]);
  const [open, setOpen] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const start = useRef(Date.now());
  const pairs = cards.length / 2;

  useEffect(() => { setHud({ score: matched.length, extra: `Ходы: ${moves}` }); }, [matched.length, moves, setHud]);

  const flip = (c: MemCard) => {
    if (open.length === 2 || open.includes(c.key) || matched.includes(c.pair)) return;
    if (c.ko) speak(item(c.pair).say);
    sfx('tap');
    const next = [...open, c.key];
    setOpen(next);
    if (next.length === 2) {
      setMoves(m => m + 1);
      const [a, b] = next.map(k => cards.find(x => x.key === k)!);
      if (a.pair === b.pair) {
        setTimeout(() => {
          sfx('correct');
          setMatched(m => {
            const nm = [...m, a.pair];
            if (nm.length === pairs) {
              const secs = (Date.now() - start.current) / 1000;
              const score = pairs * 20 + Math.max(0, 100 - (moves + 1 - pairs) * 8) + Math.max(0, Math.round(60 - secs));
              setTimeout(() => onEnd(score), 600);
            }
            return nm;
          });
          setOpen([]);
        }, 350);
      } else {
        setTimeout(() => { setOpen([]); }, 900);
      }
    }
  };

  return (
    <div className="mem-grid">
      {cards.map(c => (
        <button key={c.key} className={`mem-card ${open.includes(c.key) || matched.includes(c.pair) ? 'flip' : ''} ${matched.includes(c.pair) ? 'matched' : ''}`} onClick={() => flip(c)}>
          <div className="mem-inner">
            <div className="mem-face mem-back">한</div>
            <div className={`mem-face mem-front ${c.ko ? 'ko' : ''}`}>{c.text}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

/* ================= Аудио-ниндзя ================= */
export function NinjaGame({ known, onEnd, setHud }: GameProps) {
  const pool = useMemo(() => sylPool(known), [known]);
  const [score, setScore] = useState(0);
  const [q, setQ] = useState(() => pick(pool));
  const [state, setState] = useState<{ i: number; ok: boolean } | null>(null);
  const combo = useRef(0);
  const [, setLeft] = useCountdown(60, () => onEnd(score), setHud, score);
  const opts = useMemo(() => options(q, pool, 4, i => i.k), [q, pool]);

  useEffect(() => { const t = setTimeout(() => speak(q.say), 200); return () => clearTimeout(t); }, [q]);

  const choose = (o: string, i: number) => {
    if (state) return;
    const ok = o === q.k;
    setState({ i, ok });
    if (ok) {
      combo.current++;
      setScore(s => s + 10 * (1 + Math.floor(combo.current / 5)));
      sfx(combo.current % 5 === 0 ? 'combo' : 'correct');
    } else {
      combo.current = 0;
      setLeft(l => l - 3);
      sfx('wrong'); vibrate(80);
    }
    setTimeout(() => { setState(null); setQ(prev => { let n = pick(pool); while (n.k === prev.k && pool.length > 1) n = pick(pool); return n; }); }, ok ? 350 : 800);
  };

  return (
    <div className="s-body" style={{ justifyContent: 'center' }}>
      <div className="center"><Pic name="g_ninja" size={84} /></div>
      <div className="center muted" style={{ fontWeight: 800 }}>{combo.current >= 2 ? <><Fire size={18} weight="fill" /> Серия ×{combo.current}</> : 'Слушай внимательно…'}</div>
      <Speaker text={q.say} />
      <div className="options">
        {opts.map((o, i) => (
          <button key={o} className={`opt ${state && (o === q.k ? 'right' : state.i === i ? 'wrong' : '')}`} onClick={() => choose(o, i)}>
            <span className="ko">{o}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================= Слогоконструктор ================= */
export function BuilderGame({ known, onEnd, setHud }: GameProps) {
  const cons = useMemo(() => L.filter(c => known.sets.cons.has(c)), [known]);
  const vows = useMemo(() => V.filter(v => known.sets.vows.has(v)), [known]);
  const newTarget = useCallback(() => compose(pick(cons), pick(vows)), [cons, vows]);
  const [target, setTarget] = useState(newTarget);
  const [l, setL] = useState<string | null>(null);
  const [v, setV] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [flash, setFlash] = useState<'' | 'ok' | 'bad'>('');
  const combo = useRef(0);
  useCountdown(60, () => onEnd(score), setHud, score);

  const p = decompose(target)!;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ls = useMemo(() => shuffle(uniq([p.l, ...sample(cons.filter(c => c !== p.l), 4)])), [target]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const vs = useMemo(() => shuffle(uniq([p.v, ...sample(vows.filter(x => x !== p.v), 4)])), [target]);
  useEffect(() => { const t = setTimeout(() => speak(target), 200); return () => clearTimeout(t); }, [target]);

  useEffect(() => {
    if (!l || !v) return;
    const ok = compose(l, v) === target;
    setFlash(ok ? 'ok' : 'bad');
    if (ok) {
      combo.current++;
      setScore(s => s + 10 * (1 + Math.floor(combo.current / 5)));
      sfx('correct');
    } else { combo.current = 0; sfx('wrong'); vibrate(60); }
    const t = setTimeout(() => {
      setFlash(''); setL(null); setV(null);
      if (ok) setTarget(prev => { let n = newTarget(); while (n === prev) n = newTarget(); return n; });
    }, ok ? 400 : 700);
    return () => clearTimeout(t);
  }, [l, v, target, newTarget]);

  return (
    <div className="s-body">
      <div className="center s-prompt">Собери: «{syl(target).ru}» <Speaker text={target} small className="inline" /></div>
      <div className={`builder-preview ${flash === 'ok' ? 'ok' : ''}`} style={flash === 'bad' ? { borderColor: 'var(--red)', animation: 'shake .4s' } : undefined}>
        {l && v ? compose(l, v) : l || v || '?'}
      </div>
      <div className="tiles-label">Согласная</div>
      <div className="tiles">{ls.map(c => <button key={c} className={`tile ${l === c ? 'sel' : ''}`} onClick={() => { sfx('tap'); setL(c); }}>{c}</button>)}</div>
      <div className="tiles-label">Гласная</div>
      <div className="tiles">{vs.map(c => <button key={c} className={`tile ${v === c ? 'sel' : ''}`} onClick={() => { sfx('tap'); setV(c); }}>{c}</button>)}</div>
    </div>
  );
}

/* ================= Блиц-чтение ================= */
export function BlitzGame({ known, onEnd, setHud }: GameProps) {
  const pool = useMemo(() => known.readable.map(w => item('w:' + w)), [known]);
  const [q, setQ] = useState(() => pick(pool));
  const [score, setScore] = useState(0);
  const [state, setState] = useState<number | null>(null);
  const combo = useRef(0);
  const [, setLeft] = useCountdown(60, () => onEnd(score), setHud, score);
  const opts = useMemo(() => options(q, pool, 4, i => i.tr!), [q, pool]);

  const choose = (o: string, i: number) => {
    if (state !== null) return;
    setState(i);
    const ok = o === q.tr;
    speak(q.say);
    if (ok) { combo.current++; setScore(s => s + 10 * (1 + Math.floor(combo.current / 5))); sfx('correct'); }
    else { combo.current = 0; setLeft(l => l - 3); sfx('wrong'); vibrate(60); }
    setTimeout(() => { setState(null); setQ(prev => { let n = pick(pool); while (n.id === prev.id) n = pick(pool); return n; }); }, ok ? 450 : 900);
  };

  return (
    <div className="s-body">
      <div className="center muted" style={{ fontWeight: 800 }}>{combo.current >= 2 ? <><Fire size={18} weight="fill" /> Серия ×{combo.current}</> : 'Прочитай слово'}</div>
      <div className="s-big" key={q.id}>{q.k}</div>
      <div className="options list">
        {opts.map((o, i) => (
          <button key={o} className={`opt ${state !== null && (o === q.tr ? 'right' : state === i ? 'wrong' : '')}`} onClick={() => choose(o, i)}>{o}</button>
        ))}
      </div>
    </div>
  );
}

/* ================= Сеульское кафе ================= */
const GUESTS = ['p_person', 'p_woman', 'p_girl', 'p_oldwoman', 'p_oldman', 'p_student', 'p_police', 'p_cook', 'p_panda', 'p_robot', 'p_boy', 'p_artist'];

export function CafeGame({ known, onEnd, setHud }: GameProps) {
  const menu = useMemo(() => shuffle(known.foods).slice(0, 8), [known]);
  const [order, setOrder] = useState(() => pick(menu));
  const [guest, setGuest] = useState(() => pick(GUESTS));
  const [mood, setMood] = useState<'' | 'happy' | 'angry'>('');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [served, setServed] = useState(0);
  const patience = Math.max(4, 10 - served * 0.35);
  const [left, setLeft] = useState(patience);
  const busy = useRef(false);
  const over = useRef(false);

  useEffect(() => { setHud({ score, extra: hearts(lives) }); }, [score, lives, setHud]);

  const nextGuest = useCallback(() => {
    setTimeout(() => {
      if (over.current) return;
      setMood('');
      setGuest(pick(GUESTS));
      setOrder(prev => { let n = pick(menu); while (n === prev && menu.length > 1) n = pick(menu); return n; });
      busy.current = false;
    }, 700);
  }, [menu]);

  const lose = useCallback(() => {
    setMood('angry');
    sfx('hit'); vibrate(100);
    setLives(l => {
      const nl = l - 1;
      if (nl <= 0) { over.current = true; setTimeout(() => onEnd(scoreRef.current), 700); }
      return nl;
    });
    nextGuest();
  }, [nextGuest, onEnd]);

  const scoreRef = useRef(0);
  scoreRef.current = score;

  useEffect(() => { setLeft(patience); /* новый гость — новое терпение */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, guest]);
  useEffect(() => {
    const t = setInterval(() => {
      if (busy.current || over.current) return;
      setLeft(v => {
        if (v <= 0.1) { busy.current = true; lose(); return 0; }
        return v - 0.1;
      });
    }, 100);
    return () => clearInterval(t);
  }, [lose]);

  const serve = (w: string) => {
    if (busy.current || over.current) return;
    busy.current = true;
    if (w === order) {
      const pts = 10 + Math.round(left * 2);
      setScore(s => s + pts);
      setServed(n => n + 1);
      setMood('happy');
      sfx('coin');
      speak('감사합니다!', { pitch: 1.2 });
      nextGuest();
    } else lose();
  };

  return (
    <>
      <div className="cafe-scene">
        <div className={`customer ${mood}`} key={guest + order}><Pic name={mood === 'angry' ? 'angry' : mood === 'happy' ? 'yum' : guest} size={110} /></div>
        <div className="order-bubble">{WORDS[order].k} <button onClick={() => speak(WORDS[order].k)} aria-label="Прослушать заказ" className="order-sound"><SpeakerHigh size={24} weight="fill" /></button></div>
        <div className="bar patience red"><i style={{ width: `${clamp(left / patience, 0, 1) * 100}%`, transition: 'width .1s linear' }} /></div>
        <div className="muted" style={{ fontWeight: 800, fontSize: '.85rem' }}>Обслужено гостей: {served}</div>
      </div>
      <div className="menu-grid">
        {menu.map(w => <button key={w} className="opt" onClick={() => serve(w)} aria-label={WORDS[w].tr}><Pic name={w} size={46} /></button>)}
      </div>
    </>
  );
}

/* ================= Пропись ================= */
export function TraceGame({ known, onEnd, setHud }: GameProps) {
  const letters = useMemo(() => sample(jamoPool(known), 5), [known]);
  const [round, setRound] = useState(0);
  const [total, setTotal] = useState(0);
  const [res, setRes] = useState<number | null>(null);
  const guide = useRef<HTMLCanvasElement>(null);
  const draw = useRef<HTMLCanvasElement>(null);
  const font = useRef('sans-serif');
  const drawing = useRef(false);
  const cur = letters[round];

  useEffect(() => { setHud({ score: total, extra: `${round + 1}/${letters.length}` }); }, [total, round, letters.length, setHud]);

  const setup = useCallback(async () => {
    const probe = document.createElement('span');
    probe.className = 'ko';
    document.body.appendChild(probe);
    font.current = getComputedStyle(probe).fontFamily;
    probe.remove();
    try { await document.fonts.load(`700 200px ${font.current}`, cur.k); } catch { /* шрифт по умолчанию */ }
    for (const c of [guide.current, draw.current]) {
      if (!c) continue;
      const r = c.getBoundingClientRect();
      c.width = r.width * devicePixelRatio;
      c.height = r.height * devicePixelRatio;
    }
    const g = guide.current!.getContext('2d')!;
    renderGlyph(g, cur.k, font.current, 'rgba(255,79,121,0.3)');
    const d = draw.current!.getContext('2d')!;
    d.clearRect(0, 0, d.canvas.width, d.canvas.height);
    speak(cur.say);
  }, [cur]);

  useEffect(() => { setup(); }, [setup]);

  const pos = (e: React.PointerEvent) => {
    const r = draw.current!.getBoundingClientRect();
    return [(e.clientX - r.left) * devicePixelRatio, (e.clientY - r.top) * devicePixelRatio];
  };
  const down = (e: React.PointerEvent) => {
    if (res !== null) return;
    drawing.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    const c = draw.current!.getContext('2d')!;
    const [x, y] = pos(e);
    c.strokeStyle = '#3d7bff';
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.lineWidth = c.canvas.width * 0.075;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.1, y); c.stroke();
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const c = draw.current!.getContext('2d')!;
    const [x, y] = pos(e);
    c.lineTo(x, y); c.stroke();
  };
  const up = () => { drawing.current = false; };

  const check = () => {
    const score = compareGlyph(draw.current!, cur.k, font.current);
    const stars = score >= 0.72 ? 3 : score >= 0.55 ? 2 : score >= 0.35 ? 1 : 0;
    setRes(stars);
    setTotal(t => t + stars * 10);
    sfx(stars >= 2 ? 'correct' : stars ? 'pop' : 'wrong');
  };
  const nextRound = () => {
    setRes(null);
    if (round + 1 >= letters.length) onEnd(total);
    else setRound(r => r + 1);
  };
  const clear = () => { const c = draw.current!.getContext('2d')!; c.clearRect(0, 0, c.canvas.width, c.canvas.height); };

  return (
    <div className="s-body">
      <div className="center s-prompt">Обведи: <span className="ko">{cur.k}</span> <small className="muted">«{cur.ru}»</small></div>
      <div className="trace-wrap">
        <div className="trace-grid" />
        <canvas ref={guide} />
        <canvas ref={draw} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      </div>
      {res !== null && <div className="center big-stars">{[1, 2, 3].map(i => <span key={i} className={i <= res ? '' : 'off'}><Star size={40} weight="fill" /></span>)}</div>}
      <div style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
        {res === null ? <>
          <button className="btn ghost" onClick={clear}>Стереть</button>
          <button className="btn green" onClick={check}>Проверить</button>
        </> : <>
          <button className="btn ghost" onClick={() => { setTotal(t => t - res * 10); setRes(null); clear(); }}>Заново</button>
          <button className="btn blue" onClick={nextRound}>{round + 1 >= letters.length ? 'Финиш' : 'Дальше'}</button>
        </>}
      </div>
    </div>
  );
}

function renderGlyph(ctx: CanvasRenderingContext2D, ch: string, font: string, color: string) {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(h * 0.72)}px ${font}`;
  ctx.fillText(ch, w / 2, h / 2 + h * 0.02);
}

/** Сравнение рисунка с эталоном: покрытие буквы и точность штрихов */
function compareGlyph(drawn: HTMLCanvasElement, ch: string, font: string): number {
  const N = 96;
  const tgt = document.createElement('canvas');
  tgt.width = tgt.height = N;
  const tc = tgt.getContext('2d')!;
  renderGlyph(tc, ch, font, '#000');
  const usr = document.createElement('canvas');
  usr.width = usr.height = N;
  const uc = usr.getContext('2d')!;
  uc.drawImage(drawn, 0, 0, N, N);
  const T = tc.getImageData(0, 0, N, N).data;
  const U = uc.getImageData(0, 0, N, N).data;
  const t = new Uint8Array(N * N), u = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) { t[i] = T[i * 4 + 3] > 80 ? 1 : 0; u[i] = U[i * 4 + 3] > 80 ? 1 : 0; }
  // «расширенная» буква — допуск на неточность пальца
  const R = 4;
  const near = (arr: Uint8Array, x: number, y: number) => {
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < N && yy < N && arr[yy * N + xx]) return true;
    }
    return false;
  };
  let tCount = 0, tCovered = 0, uCount = 0, uInside = 0;
  for (let y = 0; y < N; y += 2) for (let x = 0; x < N; x += 2) {
    const i = y * N + x;
    if (t[i]) { tCount++; if (near(u, x, y)) tCovered++; }
    if (u[i]) { uCount++; if (near(t, x, y)) uInside++; }
  }
  if (!uCount || !tCount) return 0;
  const coverage = tCovered / tCount;
  const precision = uInside / uCount;
  return coverage * 0.6 + precision * 0.4 - (coverage < 0.3 ? 0.2 : 0);
}
