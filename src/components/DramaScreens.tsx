'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DRAMAS, type Drama, type DramaLine } from '@/lib/data';
import { CLIPS, type Clip, type ClipLine } from '@/lib/clips';
import { genClipQuiz, genDramaQuiz } from '@/lib/gen';
import { normalizeKo } from '@/lib/hangul';
import { useStore } from '@/lib/store';
import { sfx } from '@/lib/sfx';
import { listenOnce, recognitionSupported, speak, stopSpeaking } from '@/lib/voice';
import { similarity } from '@/lib/util';
import Session, { type SessionResult } from './Session';
import { Result, xpFor } from './LessonScreen';
import { Stars, confetti } from './ui';
import {
  CastFace, ChatCircleDots, Eye, EyeSlash, Gauge, Lightbulb, Microphone, Pause, Pic, Play, Repeat, SkipBack, SkipForward,
  SpeakerHigh, Subtitles, Target, X,
} from './icons';

type Done = SessionResult & { xp: number; stars: number; fresh: string[] };
const clean = (t: string) => t.replace(/[!?.,…]/g, '');

/* ================= Список ================= */
export function DramasScreen() {
  const done = useStore(s => s.p.dramas);
  return (
    <main className="page">
      <h1 className="section-title" style={{ fontSize: '1.5rem', marginTop: 8 }}>Дорамы</h1>
      <p className="muted" style={{ fontWeight: 700 }}>
        Настоящие сцены из дорам с субтитрами: смотри, повторяй реплики, замедляй видео, разбирай слова — и проходи квиз.
      </p>

      <h2 className="section-title">Фрагменты из дорам</h2>
      <div className="clip-list">
        {CLIPS.map(c => (
          <Link key={c.id} href={`/dramas/${c.id}/`} className="clip-card">
            <div className="thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`https://i.ytimg.com/vi/${c.yt}/mqdefault.jpg`} alt="" loading="lazy" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              <span className="play"><Play size={22} weight="fill" /></span>
              <span className="dur">{fmt(c.end - c.start)}</span>
            </div>
            <div className="info">
              <small className="muted">{c.drama} · {c.year}</small>
              <h3>{c.title}</h3>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                <span className="pill"><Subtitles size={14} weight="bold" /> {c.lines.length} реплик</span>
                <Level n={c.level} />
                {done[c.id] && <span className="pill"><Stars n={done[c.id].stars} size={13} /></span>}
              </div>
            </div>
          </Link>
        ))}
      </div>

      <h2 className="section-title">Мини-сцены для начинающих</h2>
      <p className="muted" style={{ fontWeight: 700, marginTop: -4 }}>Короткие озвученные диалоги с самыми частыми фразами из дорам.</p>
      <div className="drama-list">
        {DRAMAS.map(d => (
          <Link key={d.id} href={`/dramas/${d.id}/`} className="drama-card">
            <div className="poster" style={{ background: `linear-gradient(135deg, ${d.bg[0]}, ${d.bg[1]})` }}><Pic name={d.img} size={60} /></div>
            <div className="info">
              <h3>{d.title}</h3>
              <p>{d.scene}</p>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                <span className="pill">{d.genre}</span>
                <Level n={d.level} />
                {done[d.id] && <span className="pill"><Stars n={done[d.id].stars} size={13} /></span>}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

function Level({ n }: { n: number }) {
  const names = ['', 'Легко', 'Средне', 'Сложно'];
  return <span className={`pill lvl-${n}`}><Gauge size={14} weight="bold" /> {names[n]}</span>;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Маршрут /dramas/[id]: клип или мини-сцена */
export function DramaRoute({ id }: { id: string }) {
  const clip = CLIPS.find(c => c.id === id);
  if (clip) return <ClipPlayer clip={clip} />;
  return <DramaPlayer id={id} />;
}

/* ================= Общая часть: квиз и итог ================= */
function useQuizFlow(id: string, title: string, back: string) {
  const router = useRouter();
  const addXP = useStore(s => s.addXP);
  const finishDrama = useStore(s => s.finishDrama);
  const [result, setResult] = useState<Done | null>(null);
  const complete = (r: SessionResult) => {
    const stars = r.perfect ? 3 : r.acc >= 0.75 ? 2 : 1;
    const xp = xpFor(r, 10);
    finishDrama(id, stars);
    addXP(xp);
    sfx('win'); confetti();
    setResult({ ...r, xp, stars, fresh: [] });
  };
  return { result, setResult, complete, done: (onRetry: () => void) => result && (
    <Result r={result} title={`«${title}» — снято!`} icon="clapper" onRetry={onRetry} onContinue={() => router.push(back)} />
  ) };
}

/* ================= Плеер клипа (YouTube) ================= */
export type YTPlayer = {
  playVideo(): void; pauseVideo(): void; seekTo(s: number, allow: boolean): void; getCurrentTime(): number;
  setPlaybackRate(r: number): void; getPlayerState(): number; destroy(): void;
};
type YTNamespace = { Player: new (el: HTMLElement, opts: object) => YTPlayer };

let ytPromise: Promise<YTNamespace> | null = null;
export function loadYT(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace & { loaded?: number }; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (!ytPromise) {
    ytPromise = new Promise((resolve, reject) => {
      w.onYouTubeIframeAPIReady = () => resolve(w.YT!);
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.onerror = () => { ytPromise = null; reject(new Error('yt')); };
      document.head.appendChild(s);
    });
  }
  return ytPromise;
}

type SubMode = 'all' | 'ko' | 'none';

function ClipPlayer({ clip }: { clip: Clip }) {
  const router = useRouter();
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(clip.start);
  const [loop, setLoop] = useState<number | null>(null);
  const [pauseEach, setPauseEach] = useState(false);
  const [rate, setRate] = useState(1);
  const [sub, setSub] = useState<SubMode>('all');
  const [phase, setPhase] = useState<'watch' | 'quiz' | 'done'>('watch');
  const [run, setRun] = useState(0);
  const [gloss, setGloss] = useState<{ k: string; t: string } | null>(null);
  const roman = useStore(s => s.settings.roman);
  const pausedAt = useRef(-1);
  const lines = clip.lines;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const quiz = useMemo(() => genClipQuiz(clip), [clip, run]);
  const flow = useQuizFlow(clip.id, clip.title, '/dramas/');

  const cur = lines.findIndex(l => t >= l.s && t < l.e);
  const lastPassed = cur >= 0 ? cur : lines.reduce((acc, l, i) => (t >= l.s ? i : acc), -1);
  const shown = cur >= 0 ? cur : lastPassed;

  // создаём плеер
  useEffect(() => {
    if (phase !== 'watch') return;
    let cancelled = false;
    const timeout = setTimeout(() => { if (!player.current) setStatus('failed'); }, 10000);
    loadYT().then(YT => {
      if (cancelled || !holder.current) return;
      const el = document.createElement('div');
      holder.current.innerHTML = '';
      holder.current.appendChild(el);
      player.current = new YT.Player(el, {
        videoId: clip.yt,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { start: Math.floor(clip.start), end: Math.ceil(clip.end), playsinline: 1, rel: 0, modestbranding: 1, cc_load_policy: 0, iv_load_policy: 3, fs: 1 },
        events: {
          onReady: () => { clearTimeout(timeout); setStatus('ready'); },
          onStateChange: (e: { data: number }) => setPlaying(e.data === 1),
          onError: () => setStatus('failed'),
        },
      });
    }).catch(() => setStatus('failed'));
    return () => { cancelled = true; clearTimeout(timeout); try { player.current?.destroy(); } catch { /* ignore */ } player.current = null; };
  }, [clip, phase]);

  // следим за временем: подсветка реплики, повтор, пауза после реплики
  useEffect(() => {
    if (status !== 'ready') return;
    const iv = setInterval(() => {
      const p = player.current;
      if (!p) return;
      const now = p.getCurrentTime();
      setT(now);
      if (loop !== null && now >= lines[loop].e) { p.seekTo(Math.max(0, lines[loop].s - 0.15), true); return; }
      if (pauseEach && loop === null) {
        const idx = lines.findIndex(l => now >= l.e - 0.05 && now < l.e + 0.6);
        if (idx >= 0 && pausedAt.current !== idx && p.getPlayerState() === 1) { pausedAt.current = idx; p.pauseVideo(); }
      }
    }, 120);
    return () => clearInterval(iv);
  }, [status, loop, pauseEach, lines]);

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => { if (!gloss) return; const tm = setTimeout(() => setGloss(null), 2600); return () => clearTimeout(tm); }, [gloss]);

  const seekLine = useCallback((i: number) => {
    const ln = lines[Math.max(0, Math.min(lines.length - 1, i))];
    pausedAt.current = -1;
    if (status === 'ready' && player.current) {
      player.current.seekTo(Math.max(0, ln.s - 0.15), true);
      player.current.playVideo();
      setT(ln.s);
    } else {
      setT(ln.s + 0.01);
      speak(ln.k, { voice: ln.who ? clip.cast[ln.who].v : 'f', rate });
    }
  }, [lines, status, clip, rate]);

  const toggle = () => {
    const p = player.current;
    if (!p) return;
    if (playing) p.pauseVideo(); else { pausedAt.current = -1; p.playVideo(); }
  };
  const changeRate = () => {
    const next = rate === 1 ? 0.75 : rate === 0.75 ? 0.5 : 1;
    setRate(next);
    player.current?.setPlaybackRate(next);
  };

  if (phase === 'quiz') return <Session key={run} exs={quiz} mode="drama" onExit={() => setPhase('watch')} onComplete={r => { flow.complete(r); setPhase('done'); }} />;
  if (phase === 'done' && flow.result) return flow.done(() => { setRun(n => n + 1); flow.setResult(null); setPhase('quiz'); });

  const line = shown >= 0 ? lines[shown] : null;
  return (
    <div className="clip-player">
      <header className="clip-head">
        <button className="icon-btn" aria-label="Назад" onClick={() => router.push('/dramas/')}><X size={22} weight="bold" /></button>
        <div className="grow">
          <b>{clip.title}</b>
          <small className="muted">{clip.drama} ({clip.dramaKo}) · {clip.ep}</small>
        </div>
      </header>

      <div className="clip-sticky">
      <div className="video-box">
        <div ref={holder} className="yt-holder" />
        {status === 'loading' && <div className="video-overlay">Загружаем видео…</div>}
        {status === 'failed' && (
          <div className="video-overlay">
            <b>YouTube недоступен</b>
            <span>Субтитры, озвучка реплик и квиз работают и без видео. Нажимай на реплики ниже.</span>
          </div>
        )}
      </div>

      <section className={`subtitle ${sub}`} aria-live="polite">
        {line ? (
          <>
            {line.who && <span className="who" style={{ color: clip.cast[line.who].color }}>{clip.cast[line.who].name}</span>}
            <div className="sub-ko ko">{sub === 'none' ? '••••' : line.k}</div>
            {sub === 'all' && roman && <div className="sub-ru">{line.ru}</div>}
            {sub === 'all' && <div className="sub-tr">{line.tr}</div>}
          </>
        ) : <div className="muted center">Нажми ▶ — субтитры появятся здесь</div>}
      </section>

      <div className="clip-controls">
        <button className="ctrl" aria-label="Предыдущая реплика" onClick={() => seekLine((shown < 0 ? 0 : shown) - 1)}><SkipBack size={24} weight="fill" /></button>
        <button className="ctrl main" aria-label={playing ? 'Пауза' : 'Играть'} disabled={status !== 'ready'} onClick={toggle}>
          {playing ? <Pause size={30} weight="fill" /> : <Play size={30} weight="fill" />}
        </button>
        <button className="ctrl" aria-label="Следующая реплика" onClick={() => seekLine(shown + 1)}><SkipForward size={24} weight="fill" /></button>
        <button className={`ctrl ${loop !== null ? 'on' : ''}`} aria-label="Повторять реплику" title="Повторять текущую реплику по кругу"
          onClick={() => setLoop(loop !== null ? null : Math.max(0, shown))}><Repeat size={22} weight="bold" /></button>
        <button className="ctrl txt" onClick={changeRate} title="Скорость">{rate}×</button>
        <button className="ctrl" aria-label="Режим субтитров" title="Субтитры: все / только корейские / скрыть"
          onClick={() => setSub(sub === 'all' ? 'ko' : sub === 'ko' ? 'none' : 'all')}>
          {sub === 'none' ? <EyeSlash size={22} weight="bold" /> : sub === 'ko' ? <Subtitles size={22} weight="bold" /> : <Eye size={22} weight="bold" />}
        </button>
      </div>
      </div>
      <label className="pause-each">
        <input type="checkbox" checked={pauseEach} onChange={e => setPauseEach(e.target.checked)} />
        Пауза после каждой реплики — чтобы успеть повторить вслух
      </label>

      <p className="clip-desc">{clip.desc}</p>

      <div className="transcript">
        {lines.map((ln, i) => (
          <ClipLineRow key={i} clip={clip} ln={ln} active={i === shown} looping={loop === i} roman={roman}
            onSeek={() => seekLine(i)} onLoop={() => { setLoop(loop === i ? null : i); seekLine(i); }} onWord={setGloss} rate={rate} />
        ))}
      </div>

      {gloss && <div className="gloss"><span className="ko">{gloss.k}</span> — {gloss.t}</div>}

      <div className="s-foot sticky-foot">
        <button className="btn block green" onClick={() => { player.current?.pauseVideo(); stopSpeaking(); setPhase('quiz'); }}>
          <Target size={22} weight="bold" /> Квиз по сцене
        </button>
        <p className="credit">Видео: {clip.channel}, YouTube. Субтитры и перевод — Christine.</p>
      </div>
    </div>
  );
}

function ClipLineRow({ clip, ln, active, looping, roman, onSeek, onLoop, onWord, rate }: {
  clip: Clip; ln: ClipLine; active: boolean; looping: boolean; roman: boolean; rate: number;
  onSeek: () => void; onLoop: () => void; onWord: (g: { k: string; t: string }) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const who = ln.who ? clip.cast[ln.who] : null;
  return (
    <div ref={ref} className={`tline ${active ? 'active' : ''}`}>
      <button className="tline-main" onClick={onSeek}>
        <span className="time">{fmt(ln.s)}</span>
        <span className="grow">
          {who && <span className="who" style={{ color: who.color }}>{who.name}</span>}
          <span className="ko tk">{ln.k}</span>
          {roman && <span className="tr-ru">{ln.ru}</span>}
          <span className="tr">{ln.tr}</span>
        </span>
      </button>
      {ln.g && (
        <div className="word-chips left">
          {Object.entries(ln.g).map(([k, v]) => (
            <button key={k} className="chip sm" onClick={() => { onWord({ k, t: v }); speak(clean(k)); }}><span className="ko">{k}</span></button>
          ))}
        </div>
      )}
      {ln.note && <div className="note"><Lightbulb size={18} weight="duotone" /> {ln.note}</div>}
      <div className="acts">
        <button onClick={onLoop} className={looping ? 'on' : ''}><Repeat size={16} weight="bold" /> Повтор</button>
        <button onClick={() => speak(ln.k, { voice: who?.v || 'f', rate })}><SpeakerHigh size={16} weight="fill" /> Озвучка</button>
        {recognitionSupported() && <SpeakButton text={ln.k} />}
      </div>
    </div>
  );
}

/** Кнопка «повтори за героем» с оценкой произношения */
function SpeakButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'listen' | number>('idle');
  const spoke = useStore(s => s.spoke);
  const run = async () => {
    setState('listen');
    try {
      const alts = await listenOnce();
      const target = normalizeKo(text);
      const best = Math.max(0, ...alts.map(a => similarity(normalizeKo(a), target)));
      setState(best);
      spoke(best);
      sfx(best >= 0.8 ? 'win' : best >= 0.5 ? 'correct' : 'wrong');
    } catch { setState(0); }
  };
  return (
    <button onClick={run} disabled={state === 'listen'} className={typeof state === 'number' ? (state >= 0.8 ? 'good' : state >= 0.5 ? 'ok' : 'bad') : ''}>
      <Microphone size={16} weight="fill" /> {state === 'listen' ? 'Слушаю…' : typeof state === 'number' ? `${Math.round(state * 100)}%` : 'Повтори'}
    </button>
  );
}

/* ================= Мини-сцена ================= */
export function DramaPlayer({ id }: { id: string }) {
  const router = useRouter();
  const d = DRAMAS.find(x => x.id === id);
  const [phase, setPhase] = useState<'watch' | 'quiz' | 'done'>('watch');
  const [shown, setShown] = useState(1);
  const [auto, setAuto] = useState(false);
  const [run, setRun] = useState(0);
  const [gloss, setGloss] = useState<{ k: string; t: string } | null>(null);
  const roman = useStore(s => s.settings.roman);
  const endRef = useRef<HTMLDivElement>(null);
  const autoRef = useRef(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const quiz = useMemo(() => (d ? genDramaQuiz(d) : []), [d, run]);
  const flow = useQuizFlow(id, d?.title || '', '/dramas/');

  const sayLine = (ln: DramaLine, rate = 1) => speak(ln.k, { pitch: d!.cast[ln.w].pitch, rate });

  useEffect(() => {
    if (!d || phase !== 'watch') return;
    const tm = setTimeout(() => sayLine(d.lines[0]), 500);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, phase]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [shown]);
  useEffect(() => () => { autoRef.current = false; stopSpeaking(); }, []);
  useEffect(() => { if (!gloss) return; const tm = setTimeout(() => setGloss(null), 2500); return () => clearTimeout(tm); }, [gloss]);

  if (!d) return <div className="result"><h1>Сцена не найдена</h1><Link className="btn" href="/dramas/">К сценам</Link></div>;

  const next = () => {
    if (shown >= d.lines.length) return;
    sfx('tap');
    setShown(shown + 1);
    sayLine(d.lines[shown]);
  };
  const playAll = async () => {
    if (autoRef.current) { autoRef.current = false; setAuto(false); stopSpeaking(); return; }
    autoRef.current = true;
    setAuto(true);
    for (let i = 0; i < d.lines.length && autoRef.current; i++) {
      setShown(s => Math.max(s, i + 1));
      await sayLine(d.lines[i]);
      await new Promise(r => setTimeout(r, 450));
    }
    autoRef.current = false;
    setAuto(false);
  };

  if (phase === 'quiz') return <Session key={run} exs={quiz} mode="drama" onExit={() => setPhase('watch')} onComplete={r => { flow.complete(r); setPhase('done'); }} />;
  if (phase === 'done' && flow.result) return flow.done(() => { setRun(n => n + 1); flow.setResult(null); setPhase('quiz'); });

  const castIds = Object.keys(d.cast);
  return (
    <div className="player">
      <header className="player-head" style={{ background: `linear-gradient(135deg, ${d.bg[0]}, ${d.bg[1]})` }}>
        <div className="row">
          <button className="icon-btn" aria-label="Назад" onClick={() => { autoRef.current = false; stopSpeaking(); router.push('/dramas/'); }}><X size={22} weight="bold" /></button>
          <span className="grow" />
          <span className="pill glass">{d.genre}</span>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <Pic name={d.img} size={56} />
          <h1>{d.title}</h1>
        </div>
        <p>{d.scene}</p>
        <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {castIds.map(c => <span key={c} className="pill glass"><CastFace id={`${d.id}-${c}`} size={22} /> {d.cast[c].ru}</span>)}
        </div>
      </header>

      <div className="player-lines">
        {d.lines.slice(0, shown).map((ln, i) => (
          <SceneLine key={i} d={d} ln={ln} right={ln.w !== castIds[0]} roman={roman} onWord={setGloss} onSay={r => sayLine(ln, r)} />
        ))}
        <div ref={endRef} />
      </div>

      {gloss && <div className="gloss"><span className="ko">{gloss.k}</span> — {gloss.t}</div>}

      <div className="s-foot sticky-foot grid2">
        <button className="btn ghost" onClick={playAll}>{auto ? <><Pause size={20} weight="fill" /> Стоп</> : <><Play size={20} weight="fill" /> Всё</>}</button>
        {shown < d.lines.length
          ? <button className="btn blue" onClick={next}><ChatCircleDots size={20} weight="fill" /> Дальше ({shown}/{d.lines.length})</button>
          : <button className="btn green" onClick={() => { autoRef.current = false; stopSpeaking(); setPhase('quiz'); }}><Target size={20} weight="bold" /> Квиз</button>}
      </div>
    </div>
  );
}

function SceneLine({ d, ln, right, roman, onWord, onSay }: {
  d: Drama; ln: DramaLine; right: boolean; roman: boolean;
  onWord: (g: { k: string; t: string }) => void; onSay: (rate?: number) => void;
}) {
  const [showTr, setShowTr] = useState(false);
  const who = d.cast[ln.w];
  const tokens = ln.k.split(' ');
  return (
    <div className={`line ${right ? 'right' : ''}`}>
      <div className="ava"><CastFace id={`${d.id}-${ln.w}`} size={48} /><small>{who.ru}</small></div>
      <div className="bub">
        <div className="k">
          {tokens.map((tk, i) => {
            const g = ln.g[clean(tk)];
            return g
              ? <span key={i} onClick={() => { onWord({ k: clean(tk), t: g }); speak(clean(tk)); }}>{tk}</span>
              : <b key={i} style={{ fontWeight: 700 }}>{tk}</b>;
          })}
        </div>
        {roman && <div className="r">{ln.ru}</div>}
        <div className={`t ${showTr ? '' : 'hidden-tr'}`} onClick={() => setShowTr(true)}><span>{ln.tr}</span></div>
        <div className="acts">
          <button onClick={() => onSay()} aria-label="Прослушать"><SpeakerHigh size={16} weight="fill" /></button>
          <button onClick={() => onSay(0.6)} aria-label="Медленно"><Pic name="turtle" size={18} /></button>
          {recognitionSupported() && <SpeakButton text={ln.k} />}
        </div>
      </div>
    </div>
  );
}
