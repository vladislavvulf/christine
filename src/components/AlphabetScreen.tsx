'use client';
import { useState } from 'react';
import Link from 'next/link';
import { WORDS } from '@/lib/data';
import { compose, cyrillic } from '@/lib/hangul';
import { LAB } from '@/lib/gen';
import { ALPHABET_GROUPS, item } from '@/lib/items';
import { sfx } from '@/lib/sfx';
import { speak } from '@/lib/voice';
import { useKnown } from './ui';
import { ArrowLeft, BookOpenText, Pic, SpeakerHigh, Sparkle } from './icons';

export function AlphabetScreen() {
  const { sets, readable } = useKnown();
  const [l, setL] = useState('ㅎ');
  const [v, setV] = useState('ㅏ');
  const [t, setT] = useState('ㄴ');
  const out = compose(l, v, t);
  const isLearned = (id: string) => {
    const k = id.slice(2);
    return id[0] === 'f' ? sets.fins.has(k) : sets.cons.has(k) || sets.vows.has(k);
  };

  return (
    <main className="page">
      <div className="row" style={{ marginTop: 6 }}>
        <Link href="/" className="icon-btn" aria-label="Назад"><ArrowLeft size={22} weight="bold" /></Link>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 900 }}>Алфавит</h1>
      </div>

      <h2 className="section-title"><Sparkle size={22} weight="fill" /> Лаборатория слогов</h2>
      <div className="card">
        <p className="muted" style={{ fontWeight: 700, fontSize: '.88rem' }}>Собери любой слог из букв и послушай, как он звучит.</p>
        <button className="lab-out" style={{ width: '100%' }} onClick={() => speak(out)}>{out}</button>
        <div className="center" style={{ fontWeight: 900, fontSize: '1.4rem' }}>«{cyrillic(out)}» <SpeakerHigh size={20} weight="fill" className="muted" /></div>
        <LabRow title="Начальная согласная" list={LAB.L} value={l} set={x => { setL(x); speak(compose(x, v, t)); }} />
        <LabRow title="Гласная" list={LAB.V} value={v} set={x => { setV(x); speak(compose(l, x, t)); }} />
        <LabRow title="Патчхим" list={LAB.T} value={t} set={x => { setT(x); speak(compose(l, v, x)); }} />
      </div>

      {ALPHABET_GROUPS.map(g => (
        <section key={g.title}>
          <h2 className="section-title">{g.title}</h2>
          <div className="abc-grid">
            {g.items.map(id => {
              const it = item(id);
              return (
                <button key={id} className={`abc-cell ${isLearned(id) ? 'learned' : ''}`} onClick={() => { sfx('tap'); speak(it.say); }} title={it.m}>
                  <span className="ko">{it.kind === 'f' ? it.jamo : it.k}</span>
                  <small>{it.kind === 'f' ? '-' + it.ru.slice(1) : it.ru}</small>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <h2 className="section-title" id="words"><BookOpenText size={22} weight="fill" /> Слова, которые ты можешь прочитать ({readable.length})</h2>
      {readable.length === 0 ? <p className="muted" style={{ fontWeight: 700 }}>Пройди первые уроки — и здесь появятся слова.</p> : (
        <div className="word-chips" style={{ justifyContent: 'flex-start' }}>
          {readable.map(w => (
            <button key={w} className="chip" onClick={() => speak(WORDS[w].k)}>
              <Pic name={w} size={26} /> <span className="ko">{WORDS[w].k}</span> <span className="muted">{WORDS[w].tr}</span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

function LabRow({ title, list, value, set }: { title: string; list: string[]; value: string; set: (v: string) => void }) {
  return (
    <>
      <div className="tiles-label">{title}</div>
      <div className="tiles" style={{ flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: 6 }}>
        {list.map(x => (
          <button key={x || 'none'} className={`tile ${x ? '' : 'none'} ${value === x ? 'sel' : ''}`} style={{ flex: 'none' }} onClick={() => set(x)}>{x || 'нет'}</button>
        ))}
      </div>
    </>
  );
}
