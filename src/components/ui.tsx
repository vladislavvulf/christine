'use client';
import { useMemo, useState } from 'react';
import { useStore } from '@/lib/store';
import { knownSets, learnedFrom, readableWords } from '@/lib/items';
import { WORDS } from '@/lib/data';
import { speak } from '@/lib/voice';
import { SpeakerHigh, Star } from './icons';

/** Что пользователь уже знает (по пройденным урокам) */
export function useKnown() {
  const lessons = useStore(s => s.p.lessons);
  return useMemo(() => {
    const learned = learnedFrom(lessons);
    const sets = knownSets(learned);
    const readable = readableWords(sets);
    const foods = readable.filter(w => WORDS[w].tags?.includes('food'));
    return { learned, sets, readable, foods, done: new Set(Object.keys(lessons)) };
  }, [lessons]);
}

export function Speaker({ text, pitch, small, className = '', label, voice }: { text: string; pitch?: number; small?: boolean; className?: string; label?: string; voice?: 'f' | 'm' | 'o' | 'k' }) {
  const [playing, setPlaying] = useState(false);
  return (
    <button
      type="button"
      aria-label={label || 'Прослушать'}
      className={`speaker ${small ? 'sm' : ''} ${playing ? 'playing' : ''} ${className}`}
      onClick={async () => {
        setPlaying(true);
        await speak(text, { pitch, voice });
        setPlaying(false);
      }}
    >
      <SpeakerHigh weight="fill" size={small ? 26 : 44} />
    </button>
  );
}

export function Ring({ value, size = 64, stroke = 7, color = '#fff', track = 'rgba(255,255,255,0.3)', children }:
  { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, value))} style={{ transition: 'stroke-dashoffset .6s' }} />
      </svg>
      <b>{children}</b>
    </div>
  );
}

export function Stars({ n, max = 3, size = 16 }: { n: number; max?: number; size?: number }) {
  return <>{Array.from({ length: max }, (_, i) => <Star key={i} size={size} weight="fill" className={i < n ? 'star-on' : 'star-off'} />)}</>;
}

/** Конфетти — простой DOM-эффект */
export function confetti(count = 80) {
  if (typeof document === 'undefined') return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#ff4f79', '#ffc233', '#22c07a', '#3d7bff', '#8b5cf6', '#ff9a5a'];
  for (let i = 0; i < count; i++) {
    const el = document.createElement('i');
    el.style.left = Math.random() * 100 + 'vw';
    el.style.background = colors[i % colors.length];
    el.style.animationDuration = 1.6 + Math.random() * 1.8 + 's';
    el.style.animationDelay = Math.random() * 0.5 + 's';
    el.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(el);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4200);
}

export function floatText(text: string, x: number, y: number) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.className = 'float-xp';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

export function Html({ html }: { html: string }) {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
