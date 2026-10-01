// Озвучка: заранее сгенерированные mp3 (нейросетевые голоса) + запасной вариант — синтез речи браузера.
// Распознавание речи — для «повтори за героем».
import { audioKey, voiceForPitch, type VoiceCode } from './audio-key';
import { BASE } from './util';

let index: Set<string> | null = null;
let player: HTMLAudioElement | null = null;
let settings = { rate: 0.85, enabled: true };
let koVoice: SpeechSynthesisVoice | null = null;

/** Загружаем список доступных mp3 и готовим плеер */
export function initVoice() {
  if (typeof window === 'undefined') return;
  fetch(`${BASE}/audio/index.json`)
    .then(r => (r.ok ? r.json() : []))
    .then((keys: string[]) => { index = new Set(keys); })
    .catch(() => { index = new Set(); });
  player = new Audio();
  player.preload = 'auto';
  // iOS: разблокировать воспроизведение первым касанием
  const unlock = () => {
    document.removeEventListener('pointerdown', unlock);
    const p = player;
    if (!p || !p.paused) return;
    const src = `${BASE}/audio/${audioKey('아')}.mp3`;
    p.muted = true;
    p.src = src;
    // если за это время уже запустили настоящий звук — не трогаем его
    p.play().then(() => { if (p.src.endsWith(src)) p.pause(); p.muted = false; }).catch(() => { p.muted = false; });
  };
  document.addEventListener('pointerdown', unlock);
  // запасной вариант — системный голос
  if (window.speechSynthesis) {
    const pick = () => {
      const ko = window.speechSynthesis.getVoices().filter(v => v.lang.toLowerCase().replace('_', '-').startsWith('ko'));
      koVoice = ko.find(v => /google|yuna|sora|heami|sunhi|injoon|natural/i.test(v.name)) || ko[0] || null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
  }
}

export function configureVoice(s: { rate: number; enabled: boolean }) {
  settings = s;
}

/** Скорость mp3 по настройке «Медл./Норм./Быстро» */
const fileRate = () => (settings.rate <= 0.6 ? 0.75 : settings.rate >= 1 ? 1.1 : 1);

export const hasAudioFiles = () => !!index && index.size > 0;
export const ttsSupported = () => typeof window !== 'undefined' && (hasAudioFiles() || !!window.speechSynthesis);

/** Есть ли чем озвучивать (файлы или корейский системный голос) */
export function hasKoreanVoice() {
  return index === null || hasAudioFiles() || !!koVoice;
}

type SpeakOpts = { rate?: number; pitch?: number; voice?: VoiceCode };

export function speak(text: string, opts: SpeakOpts = {}): Promise<void> {
  if (!settings.enabled || !text || typeof window === 'undefined') return Promise.resolve();
  const voice = opts.voice ?? (opts.pitch !== undefined ? voiceForPitch(opts.pitch) : 'f');
  const t = text.trim();
  let key = audioKey(t, voice);
  if (index && index.size && !index.has(key)) {
    const plain = t.replace(/[!?.,…]/g, '');
    key = [audioKey(t, 'f'), audioKey(plain, voice), audioKey(plain, 'f')].find(k => index!.has(k)) || '';
  }
  // список файлов не загрузился — всё равно пробуем mp3, при ошибке переходим на системный голос
  if (key && player) return playFile(key, (opts.rate ?? 1) * fileRate(), () => speakSynth(t, opts));
  return speakSynth(t, opts);
}

function playFile(key: string, rate: number, fallback: () => Promise<void>): Promise<void> {
  return new Promise(resolve => {
    const p = player!;
    stopSpeaking();
    let done = false;
    const finish = () => { if (!done) { done = true; p.onended = p.onerror = null; resolve(); } };
    p.onended = finish;
    p.onerror = () => { if (!done) { done = true; p.onended = p.onerror = null; fallback().then(resolve); } };
    p.muted = false;
    p.src = `${BASE}/audio/${key}.mp3`;
    p.playbackRate = rate;
    (p as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true;
    p.play().catch(() => { if (!done && p.error) p.onerror?.(new Event('error')); else finish(); });
    setTimeout(finish, 12000);
  });
}

function speakSynth(text: string, opts: SpeakOpts): Promise<void> {
  return new Promise(resolve => {
    if (!window.speechSynthesis) return resolve();
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ko-KR';
    if (koVoice) u.voice = koVoice;
    u.rate = (opts.rate ?? 1) * settings.rate;
    u.pitch = opts.pitch ?? 1;
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    u.onend = finish;
    u.onerror = finish;
    setTimeout(finish, 1200 + text.length * 350);
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if (typeof window === 'undefined') return;
  if (player && !player.paused) { player.pause(); }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

/* ---------- Распознавание речи ---------- */
type SR = {
  lang: string; interimResults: boolean; maxAlternatives: number; continuous: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSR(): (new () => SR) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const recognitionSupported = () => !!getSR();

/** Слушает микрофон, возвращает варианты распознанного текста */
export function listenOnce(timeoutMs = 7000): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const Ctor = getSR();
    if (!Ctor) return reject(new Error('unsupported'));
    stopSpeaking();
    const rec = new Ctor();
    rec.lang = 'ko-KR';
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    let settled = false;
    const timer = setTimeout(() => { try { rec.stop(); } catch { /* ignore */ } }, timeoutMs);
    rec.onresult = e => {
      settled = true;
      clearTimeout(timer);
      const alts: string[] = [];
      const first = e.results[0];
      for (let i = 0; i < first.length; i++) alts.push(first[i].transcript);
      resolve(alts);
    };
    rec.onerror = e => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error(e.error)); } };
    rec.onend = () => { if (!settled) { settled = true; clearTimeout(timer); resolve([]); } };
    rec.start();
  });
}
