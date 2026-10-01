'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ACHIEVEMENTS, AVATARS } from '@/lib/data';
import { leaderboard, login, loginGoogle, logout, publicConfig, register, type LeaderRow } from '@/lib/api';
import { ALPHABET_GROUPS, item } from '@/lib/items';
import { useStore } from '@/lib/store';
import { LEAGUES, leagueOf, levelOf } from '@/lib/util';
import { speak } from '@/lib/voice';
import { useKnown } from './ui';
import {
  Avatar, BookOpenText, Brain, Check, CloudArrowUp, Fire, Gauge, MoonStars, Pic, SignOut, SpeakerHigh, Star, Subtitles,
  Target, TextAa, Trophy,
} from './icons';

const LEAGUE_IMG = ['medal3', 'medal2', 'medal1', 'gem', 'crown'];
const leagueImg = (xp: number) => LEAGUE_IMG[LEAGUES.indexOf(leagueOf(xp))];

/* ================= Рейтинг ================= */
export function RankScreen() {
  const user = useStore(s => s.user);
  const xp = useStore(s => s.p.xp);
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const [data, setData] = useState<{ rows: LeaderRow[]; me: LeaderRow | null; total: number } | null>(null);
  const [err, setErr] = useState('');
  const lg = leagueOf(xp);
  const nextLg = LEAGUES.find(l => l.min > xp);

  useEffect(() => {
    setErr(''); setData(null);
    leaderboard(period).then(setData).catch(e => setErr(e.message));
  }, [period, user]);

  const rows = data?.rows || [];
  const top = [rows[1], rows[0], rows[2]];
  return (
    <main className="page">
      <div className="card league">
        <Pic name={leagueImg(xp)} size={84} />
        <h2>Лига «{lg.name}»</h2>
        <p className="muted" style={{ fontWeight: 700 }}>
          {nextLg ? `До лиги «${nextLg.name}»: ${nextLg.min - xp} XP` : 'Ты на вершине!'}
        </p>
        {nextLg && <div className="bar yellow"><i style={{ width: `${((xp - lg.min) / (nextLg.min - lg.min)) * 100}%` }} /></div>}
      </div>

      <div className="tabs" style={{ marginTop: 14 }}>
        <button className={period === 'week' ? 'on' : ''} onClick={() => setPeriod('week')}>Эта неделя</button>
        <button className={period === 'all' ? 'on' : ''} onClick={() => setPeriod('all')}>За всё время</button>
      </div>

      {!user && (
        <Link href="/auth/" className="notice row" style={{ marginTop: 14 }}>
          <CloudArrowUp size={28} weight="duotone" />
          <span>Ты пока гость. <b>Войди</b>, чтобы попасть в рейтинг — весь прогресс сохранится.</span>
        </Link>
      )}

      {err && <div className="error" style={{ marginTop: 14 }}>{err}</div>}
      {!data && !err && <div className="center muted" style={{ padding: 30 }}>Загрузка…</div>}
      {data && rows.length === 0 && <div className="center muted" style={{ padding: 30, fontWeight: 700 }}>Пока никого нет. Стань первым!</div>}

      {rows.length > 0 && (
        <div className="podium">
          {top.map((r, i) => r ? (
            <div key={r.rank}>
              <Avatar value={r.avatar} size={52} />
              <div className="name">{r.username}</div>
              <div className="muted" style={{ fontWeight: 800, fontSize: '.8rem' }}>{r.xp} XP</div>
              <div className="stand" style={{ height: [70, 96, 54][i], background: ['#9ca3af', '#f5b301', '#cd7f32'][i] }}>{[2, 1, 3][i]}</div>
            </div>
          ) : <div key={i} />)}
        </div>
      )}

      <div>
        {rows.slice(3).map(r => <Row key={r.rank} r={r} />)}
        {data?.me && !rows.some(r => r.me) && <><div className="center muted">⋯</div><Row r={data.me} /></>}
      </div>
      {data && <p className="center muted" style={{ fontSize: '.8rem', marginTop: 12 }}>Участников: {data.total}. Недельный рейтинг обнуляется по понедельникам.</p>}
    </main>
  );
}

function Row({ r }: { r: LeaderRow }) {
  return (
    <div className={`lb-row ${r.me ? 'me' : ''}`}>
      <span className="rk">{r.rank}</span>
      <Avatar value={r.avatar} size={34} />
      <span className="nm">{r.username}{r.streak > 1 && <small className="muted"> <Fire size={12} weight="fill" />{r.streak}</small>}</span>
      <span className="sc">{r.xp} XP</span>
    </div>
  );
}

/* ================= Профиль ================= */
export function ProfileScreen() {
  const p = useStore(s => s.p);
  const user = useStore(s => s.user);
  const settings = useStore(s => s.settings);
  const setSetting = useStore(s => s.setSetting);
  const setAvatar = useStore(s => s.setAvatar);
  const setGoal = useStore(s => s.setGoal);
  const { readable } = useKnown();
  const [pickAva, setPickAva] = useState(false);
  const lv = levelOf(p.xp);
  const total = p.stats.correct + p.stats.wrong;
  const lettersMastered = ALPHABET_GROUPS.flatMap(g => g.items).filter(id => (p.srs[id]?.s || 0) >= 3).length;
  const lg = leagueOf(p.xp);

  return (
    <main className="page">
      <div className="profile-head">
        <button className="avatar-big" onClick={() => setPickAva(v => !v)} aria-label="Сменить аватар"><Avatar value={p.avatar} size={70} /></button>
        <div className="grow">
          <h2 style={{ fontSize: '1.4rem', fontWeight: 900 }}>{user?.username || 'Гость'}</h2>
          <div className="muted row" style={{ fontWeight: 800, gap: 6 }}>Уровень {lv.lvl} · <Pic name={leagueImg(p.xp)} size={20} /> {lg.name}</div>
          <div className="bar blue" style={{ marginTop: 6 }}><i style={{ width: `${lv.pct * 100}%` }} /></div>
          <small className="muted" style={{ fontWeight: 700 }}>{p.xp - lv.cur} / {lv.next - lv.cur} XP до уровня {lv.lvl + 1}</small>
        </div>
      </div>
      {pickAva && (
        <div className="card" style={{ marginTop: 12 }}>
          <div className="avatar-pick">
            {AVATARS.map(a => <button key={a} className={a === p.avatar ? 'on' : ''} onClick={() => { setAvatar(a); setPickAva(false); }}><Pic name={a} size={36} /></button>)}
          </div>
        </div>
      )}
      {!user && <Link href="/auth/" className="btn block blue" style={{ marginTop: 14 }}><CloudArrowUp size={22} weight="bold" /> Войти / Зарегистрироваться</Link>}

      <h2 className="section-title">Статистика</h2>
      <div className="stats-grid">
        <StatBox icon={<Fire size={26} weight="fill" />} color="#ff7a1a" value={p.streak.count} label={`серия (рекорд ${p.streak.best})`} />
        <StatBox icon={<Star size={26} weight="fill" />} color="#e0a400" value={p.xp} label="всего XP" />
        <StatBox icon={<BookOpenText size={26} weight="fill" />} color="#3d7bff" value={Object.keys(p.lessons).length} label="уроков пройдено" />
        <StatBox icon={<Target size={26} weight="bold" />} color="#22c07a" value={`${total ? Math.round((p.stats.correct / total) * 100) : 0}%`} label="точность" />
        <StatBox icon={<TextAa size={26} weight="bold" />} color="#ff4f79" value={lettersMastered} label="букв освоено" />
        <StatBox icon={<Brain size={26} weight="fill" />} color="#8b5cf6" value={readable.length} label="слов могу прочитать" />
      </div>

      <h2 className="section-title">Карта знаний</h2>
      <div className="card">
        <p className="muted" style={{ fontWeight: 700, fontSize: '.85rem' }}>Цвет — насколько прочно ты знаешь букву. Нажми, чтобы услышать.</p>
        <div className="mastery">
          {ALPHABET_GROUPS.flatMap(g => g.items).map(id => {
            const it = item(id);
            const s = p.srs[id]?.s;
            return <button key={id} className={`mcell ${s !== undefined ? 's' + Math.max(1, s) : ''}`} onClick={() => speak(it.say)} title={it.ru}>{it.kind === 'f' ? it.jamo : it.k}</button>;
          })}
        </div>
      </div>

      <h2 className="section-title"><Trophy size={22} weight="fill" /> Достижения <span className="pill">{Object.keys(p.ach).length}/{ACHIEVEMENTS.length}</span></h2>
      <div className="ach-grid">
        {ACHIEVEMENTS.map(a => (
          <div key={a.id} className={`ach ${p.ach[a.id] ? 'on' : 'off'}`} title={a.desc}>
            <Pic name={a.img} size={44} />
            <small>{a.title}</small>
          </div>
        ))}
      </div>

      <h2 className="section-title">Настройки</h2>
      <div className="card">
        <div className="setting">
          <span className="row"><Target size={20} weight="bold" /> Цель дня</span>
          <div className="seg">{[10, 30, 50, 100].map(g => <button key={g} className={p.goal === g ? 'on' : ''} onClick={() => setGoal(g)}>{g}</button>)}</div>
        </div>
        <Toggle icon={<SpeakerHigh size={20} weight="fill" />} label="Озвучка" on={settings.voice} set={v => setSetting('voice', v)} />
        <Toggle icon={<Star size={20} weight="fill" />} label="Звуки" on={settings.sound} set={v => setSetting('sound', v)} />
        <Toggle icon={<Subtitles size={20} weight="bold" />} label="Транскрипция в дорамах" on={settings.roman} set={v => setSetting('roman', v)} />
        <div className="setting">
          <span className="row"><Gauge size={20} weight="bold" /> Скорость речи</span>
          <div className="seg">{[0.6, 0.85, 1].map(r => <button key={r} className={settings.rate === r ? 'on' : ''} onClick={() => { setSetting('rate', r); setTimeout(() => speak('안녕하세요'), 50); }}>{r === 0.6 ? 'Медл.' : r === 1 ? 'Быстро' : 'Норм.'}</button>)}</div>
        </div>
        <div className="setting">
          <span className="row"><MoonStars size={20} weight="fill" /> Тема</span>
          <div className="seg">{(['auto', 'light', 'dark'] as const).map(t => <button key={t} className={settings.theme === t ? 'on' : ''} onClick={() => setSetting('theme', t)}>{{ auto: 'Авто', light: 'Светлая', dark: 'Тёмная' }[t]}</button>)}</div>
        </div>
      </div>
      {user && <button className="btn block ghost" style={{ marginTop: 16 }} onClick={() => { if (confirm('Выйти из аккаунта? Прогресс сохранён на сервере.')) logout(); }}><SignOut size={20} weight="bold" /> Выйти из аккаунта</button>}
      <p className="center muted" style={{ fontSize: '.75rem', marginTop: 18 }}>
        Christine · иконки Phosphor, иллюстрации Microsoft Fluent Emoji, персонажи Avataaars · озвучка — нейросетевые голоса
      </p>
    </main>
  );
}

function StatBox({ icon, color, value, label }: { icon: React.ReactNode; color: string; value: React.ReactNode; label: string }) {
  return (
    <div className="stat-box">
      <span className="se" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>{icon}</span>
      <div><b>{value}</b><small>{label}</small></div>
    </div>
  );
}

function Toggle({ icon, label, on, set }: { icon: React.ReactNode; label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <div className="setting">
      <span className="row">{icon} {label}</span>
      <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={() => set(!on)} />
    </div>
  );
}

/* ================= Вход / регистрация ================= */
type GIS = {
  accounts: { id: {
    initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; auto_select?: boolean }): void;
    renderButton(el: HTMLElement, o: Record<string, unknown>): void;
  } };
};

function GoogleButton({ onError }: { onError: (m: string) => void }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { publicConfig().then(c => setClientId(c.googleClientId || '')); }, []);

  useEffect(() => {
    if (!clientId || !box.current) return;
    const init = () => {
      const g = (window as unknown as { google?: GIS }).google;
      if (!g || !box.current) return;
      g.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setBusy(true);
          try { await loginGoogle(credential); router.push('/'); }
          catch (e) { onError((e as Error).message); }
          finally { setBusy(false); }
        },
      });
      g.accounts.id.renderButton(box.current, {
        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'filled_black' : 'outline',
        size: 'large', shape: 'pill', text: 'continue_with', locale: 'ru', width: Math.min(360, box.current.clientWidth || 320),
      });
    };
    if ((window as unknown as { google?: GIS }).google) { init(); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = init;
    s.onerror = () => onError('Не удалось загрузить кнопку Google');
    document.head.appendChild(s);
  }, [clientId, router, onError]);

  if (clientId === null || clientId === '') return null;
  return (
    <>
      <div ref={box} className="google-btn" aria-busy={busy} />
      <div className="or"><span>или</span></div>
    </>
  );
}

export function AuthScreen() {
  const router = useRouter();
  const user = useStore(s => s.user);
  const xp = useStore(s => s.p.xp);
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    return (
      <main className="page center">
        <div className="result" style={{ minHeight: 'auto' }}>
          <div className="trophy"><Pic name="check" size={110} /></div>
          <h1>Ты вошёл как {user.username}</h1>
          <Link href="/" className="btn block">На карту</Link>
        </div>
      </main>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'register') await register(name.trim(), pass);
      else await login(name.trim(), pass);
      router.push('/');
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <main className="page">
      <div className="mascot-say" style={{ marginTop: 10 }}>
        <Pic name="tiger" size={64} className="m" />
        <div className="bubble">{mode === 'register' ? 'Создай аккаунт — и прогресс будет с тобой на любом устройстве!' : 'С возвращением! 반가워요!'}</div>
      </div>
      {err && <div className="error">{err}</div>}
      <GoogleButton onError={setErr} />
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Регистрация</button>
        <button className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Вход</button>
      </div>
      <form onSubmit={submit}>
        <label className="field">
          <span>Имя (видно в рейтинге)</span>
          <input className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="username" minLength={3} maxLength={20} required placeholder="например, Кристина" />
        </label>
        <label className="field">
          <span>Пароль</span>
          <input className="input" type="password" value={pass} onChange={e => setPass(e.target.value)} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={6} required placeholder="минимум 6 символов" />
        </label>
        {mode === 'register' && xp > 0 && <p className="muted row" style={{ fontWeight: 700 }}><Check size={18} weight="bold" /> Твои {xp} XP и весь прогресс перенесутся в аккаунт.</p>}
        <button className="btn block green" disabled={busy}>{busy ? '…' : mode === 'register' ? 'Создать аккаунт' : 'Войти'}</button>
      </form>
    </main>
  );
}
