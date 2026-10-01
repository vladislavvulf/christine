'use client';
// «Студия клипов»: разметка реплик для новых фрагментов из дорам.
// Вставьте ссылку на YouTube, запустите видео и отмечайте начало/конец реплик — внизу появится готовый код для src/lib/clips.ts.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cyrillic } from '@/lib/hangul';
import { loadYT, type YTPlayer } from './DramaScreens';
import { ArrowLeft, Copy, Plus, Trash } from './icons';

type Row = { s: number; e: number; who: string; k: string; ru: string; tr: string };

const parseId = (v: string) => v.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/)?.[1] || (/^[\w-]{11}$/.test(v.trim()) ? v.trim() : '');
const r1 = (n: number) => Math.round(n * 10) / 10;

export default function StudioScreen() {
  const [url, setUrl] = useState('');
  const [vid, setVid] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [t, setT] = useState(0);
  const holder = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);

  useEffect(() => {
    if (!vid || !holder.current) return;
    let alive = true;
    loadYT().then(YT => {
      if (!alive || !holder.current) return;
      holder.current.innerHTML = '';
      const el = document.createElement('div');
      holder.current.appendChild(el);
      player.current = new YT.Player(el, { videoId: vid, playerVars: { playsinline: 1, rel: 0, cc_load_policy: 1, cc_lang_pref: 'ko' } });
    });
    const iv = setInterval(() => { try { setT(player.current?.getCurrentTime() || 0); } catch { /* not ready */ } }, 100);
    return () => { alive = false; clearInterval(iv); try { player.current?.destroy(); } catch { /* ignore */ } };
  }, [vid]);

  const upd = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const now = () => r1(player.current?.getCurrentTime() || t);
  const addRow = () => setRows(rs => {
    const s = now();
    const prev = rs.length ? { ...rs[rs.length - 1], e: rs[rs.length - 1].e || s } : null;
    return [...(prev ? [...rs.slice(0, -1), prev] : rs), { s, e: 0, who: prev?.who === 'a' ? 'b' : 'a', k: '', ru: '', tr: '' }];
  });

  const code = rows.map(r =>
    `      { s: ${r.s}, e: ${r.e || r.s + 2}, who: '${r.who}', k: ${JSON.stringify(r.k)}, ru: ${JSON.stringify(r.ru || cyrillic(r.k))}, tr: ${JSON.stringify(r.tr)} },`,
  ).join('\n');
  const full = `  {
    id: 'my-clip', yt: '${vid}', title: 'Название сцены', drama: 'Дорама', dramaKo: '', year: 2024, ep: '1 серия',
    channel: 'Канал', level: 2, start: ${rows[0]?.s ? Math.floor(rows[0].s - 1) : 0}, end: ${rows.length ? Math.ceil((rows[rows.length - 1].e || rows[rows.length - 1].s + 3) + 1) : 60}, img: 'clapper',
    desc: 'Описание',
    cast: { a: { name: 'Герой', color: '#3d7bff', v: 'm' }, b: { name: 'Героиня', color: '#ff4f79', v: 'f' } },
    lines: [
${code}
    ],
  },`;

  return (
    <main className="page studio">
      <div className="row" style={{ marginTop: 6 }}>
        <Link href="/dramas/" className="icon-btn" aria-label="Назад"><ArrowLeft size={22} weight="bold" /></Link>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Студия клипов</h1>
      </div>
      <p className="muted" style={{ fontWeight: 700, marginTop: 8 }}>
        Инструмент для добавления новых фрагментов. Включите корейские субтитры YouTube (CC), отмечайте реплики кнопкой «+», заполните текст и перевод, затем скопируйте код в <code>src/lib/clips.ts</code> и пересоберите сайт.
      </p>
      <div className="row" style={{ marginTop: 10 }}>
        <input className="input" placeholder="Ссылка на YouTube" value={url} onChange={e => setUrl(e.target.value)} />
        <button className="btn small" onClick={() => setVid(parseId(url))}>Открыть</button>
      </div>
      {vid && <>
        <div className="video-box" style={{ marginTop: 12, borderRadius: 16, overflow: 'hidden' }}><div ref={holder} className="yt-holder" /></div>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 10 }}>
          <b>⏱ {r1(t).toFixed(1)} с</b>
          <button className="btn small green" onClick={addRow}><Plus size={18} weight="bold" /> Реплика с текущего момента</button>
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {rows.map((r, i) => (
            <div key={i} className="card" style={{ display: 'grid', gap: 6 }}>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button className="btn ghost small" onClick={() => upd(i, { s: now() })}>Начало: {r.s}</button>
                <button className="btn ghost small" onClick={() => upd(i, { e: now() })}>Конец: {r.e || '—'}</button>
                <button className="btn ghost small" onClick={() => player.current?.seekTo(r.s, true)}>▶</button>
                <input className="input" style={{ width: 60, height: 38 }} value={r.who} onChange={e => upd(i, { who: e.target.value })} title="Кто говорит (ключ из cast)" />
                <button className="icon-btn" aria-label="Удалить" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}><Trash size={18} /></button>
              </div>
              <input className="input ko" placeholder="Корейский текст" value={r.k} onChange={e => upd(i, { k: e.target.value, ru: r.ru ? r.ru : '' })} />
              <input className="input" placeholder={`Транскрипция (авто: ${cyrillic(r.k) || '…'})`} value={r.ru} onChange={e => upd(i, { ru: e.target.value })} />
              <input className="input" placeholder="Перевод" value={r.tr} onChange={e => upd(i, { tr: e.target.value })} />
            </div>
          ))}
        </div>
        {rows.length > 0 && <>
          <h2 className="section-title">Код для clips.ts</h2>
          <textarea className="input" readOnly value={full} style={{ height: 260, fontFamily: 'monospace', fontSize: 12, padding: 12 }} />
          <button className="btn block blue" style={{ marginTop: 10 }} onClick={() => navigator.clipboard?.writeText(full)}><Copy size={20} /> Скопировать</button>
        </>}
      </>}
    </main>
  );
}
