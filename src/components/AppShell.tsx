'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import { configureVoice, initVoice } from '@/lib/voice';
import { setSfxEnabled } from '@/lib/sfx';
import { scheduleSync, syncNow } from '@/lib/api';
import { BASE, dayKey, levelOf } from '@/lib/util';
import { Avatar, FilmSlate, Fire, GameController, MapTrifold, Medal, Pic, Star, Trophy } from './icons';

const NAV = [
  { href: '/', Icon: MapTrifold, t: 'Путь' },
  { href: '/games/', Icon: GameController, t: 'Игры' },
  { href: '/dramas/', Icon: FilmSlate, t: 'Дорамы' },
  { href: '/rank/', Icon: Trophy, t: 'Рейтинг' },
  { href: '/me/', Icon: null, t: 'Профиль' },
];

/** Экраны «на весь экран» — без шапки и навигации */
const isFull = (path: string) =>
  /^\/(lesson|practice)\//.test(path) || /^\/games\/[^/]+\//.test(path) || /^\/dramas\/[^/]+\//.test(path);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const path = usePathname() || '/';
  const settings = useStore(s => s.settings);
  const ensureDay = useStore(s => s.ensureDay);

  useEffect(() => {
    setMounted(true);
    initVoice();
    ensureDay();
    // синхронизация прогресса при каждом изменении (с задержкой) и при уходе со страницы
    const unsub = useStore.subscribe((s, prev) => { if (s.p !== prev.p && s.token) scheduleSync(); });
    const onHide = () => { if (document.visibilityState === 'hidden') syncNow(); };
    document.addEventListener('visibilitychange', onHide);
    const onFocus = () => ensureDay();
    window.addEventListener('focus', onFocus);
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register(`${BASE}/sw.js`).catch(() => {});
    }
    return () => { unsub(); document.removeEventListener('visibilitychange', onHide); window.removeEventListener('focus', onFocus); };
  }, [ensureDay]);

  useEffect(() => {
    configureVoice({ rate: settings.rate, enabled: settings.voice });
    setSfxEnabled(settings.sound);
    const root = document.documentElement;
    if (settings.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings]);

  if (!mounted) return <div className="splash"><Pic name="tiger" size={96} /></div>;

  const full = isFull(path);
  return (
    <div className={`app ${full ? 'full' : ''}`}>
      {!full && <TopBar />}
      {children}
      {!full && <BottomNav path={path} />}
      <Toasts />
    </div>
  );
}

function TopBar() {
  const p = useStore(s => s.p);
  const today = p.streak.last === dayKey();
  const { lvl } = levelOf(p.xp);
  return (
    <header className="topbar">
      <Link href="/" className="logo"><Pic name="tiger" size={30} /><span>Christine</span></Link>
      <div className="grow" />
      <Link href="/me/" className="stat lvl" title="Уровень"><Medal size={22} weight="fill" />{lvl}</Link>
      <Link href="/me/" className={`stat fire ${today ? '' : 'off'}`} title="Серия дней"><Fire size={22} weight="fill" />{p.streak.count}</Link>
      <Link href="/rank/" className="stat xp" title="Опыт"><Star size={22} weight="fill" />{p.xp}</Link>
    </header>
  );
}

function BottomNav({ path }: { path: string }) {
  const avatar = useStore(s => s.p.avatar);
  return (
    <nav className="nav">
      {NAV.map(({ href, Icon, t }) => {
        const on = href === '/' ? path === '/' || path === '/alphabet/' : path.startsWith(href);
        return (
          <Link key={href} href={href} className={on ? 'on' : ''}>
            <span className="i">{Icon ? <Icon size={28} weight={on ? 'fill' : 'duotone'} /> : <Avatar value={avatar} size={30} />}</span>
            {t}
          </Link>
        );
      })}
    </nav>
  );
}

function Toasts() {
  const toasts = useStore(s => s.toasts);
  const drop = useStore(s => s.dropToast);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => drop(t.id)}>
          <Pic name={t.img} size={40} />
          <div><b>{t.title}</b>{t.text && <small>{t.text}</small>}</div>
        </div>
      ))}
    </div>
  );
}
