// Звуковые эффекты, синтезированные через WebAudio — никаких файлов

let ctx: AudioContext | null = null;
let enabled = true;

export const setSfxEnabled = (v: boolean) => { enabled = v; };

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.18) {
  const a = ac();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  const t0 = a.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  tap: () => tone(660, 0, 0.06, 'triangle', 0.08),
  correct: () => { tone(784, 0, 0.12, 'triangle'); tone(1175, 0.08, 0.2, 'triangle'); },
  wrong: () => { tone(220, 0, 0.18, 'sawtooth', 0.09); tone(185, 0.1, 0.25, 'sawtooth', 0.08); },
  combo: () => [880, 1109, 1319, 1760].forEach((f, i) => tone(f, i * 0.05, 0.15, 'triangle', 0.12)),
  coin: () => { tone(988, 0, 0.08, 'square', 0.07); tone(1319, 0.07, 0.22, 'square', 0.07); },
  pop: () => tone(520 + Math.random() * 300, 0, 0.08, 'sine', 0.15),
  hit: () => { tone(140, 0, 0.15, 'square', 0.12); tone(90, 0.05, 0.2, 'sawtooth', 0.1); },
  levelup: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.3, 'triangle', 0.14)),
  win: () => [659, 784, 988, 1319].forEach((f, i) => tone(f, i * 0.12, 0.35, 'triangle', 0.14)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, i * 0.15, 0.3, 'sine', 0.14)),
};

export type Sfx = keyof typeof SOUNDS;

export function sfx(name: Sfx) {
  if (!enabled) return;
  try { SOUNDS[name](); } catch { /* звук не критичен */ }
}

export function vibrate(ms: number | number[]) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* ignore */ }
  }
}
