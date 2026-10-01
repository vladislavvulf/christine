// Собирает все фразы, которые нужно озвучить, в scripts/.audio-list.json
// Дальше: python scripts/gen-audio.py  (генерирует недостающие mp3 в public/audio/)
import { writeFileSync } from 'node:fs';
import { JAMO, FINALS, WORDS, DRAMAS } from '../src/lib/data';
import { CLIPS } from '../src/lib/clips';
import { compose, L, V } from '../src/lib/hangul';
import { audioKey, voiceForPitch, VOICES, type VoiceCode } from '../src/lib/audio-key';

const items = new Map<string, { text: string; voice: VoiceCode }>();
const add = (text: string, voice: VoiceCode = 'f') => {
  const t = text.trim();
  if (!t) return;
  items.set(audioKey(t, voice), { text: t, voice });
};
const clean = (t: string) => t.replace(/[!?.,…]/g, '');

// буквы и патчхимы
Object.values(JAMO).forEach(j => add(j.say));
Object.values(FINALS).forEach(f => add(f.say));
// все слоги «согласная + гласная» и с 7 патчхимами
const FINAL_KEYS = Object.keys(FINALS);
for (const l of L) for (const v of V) {
  add(compose(l, v));
  for (const t of FINAL_KEYS) add(compose(l, v, t));
}
// слова
Object.values(WORDS).forEach(w => add(w.k));
// мини-сцены: реплики голосами персонажей + слова из разбора
for (const d of DRAMAS) {
  for (const ln of d.lines) {
    add(ln.k, voiceForPitch(d.cast[ln.w].pitch));
    Object.keys(ln.g).forEach(w => add(clean(w)));
    ln.k.split(' ').forEach(w => add(clean(w)));
  }
}
// клипы: слова из разбора + озвучка реплик (на случай, если YouTube недоступен)
for (const c of CLIPS) for (const ln of c.lines) {
  Object.keys(ln.g || {}).forEach(w => add(clean(w)));
  add(ln.k, ln.who ? c.cast[ln.who].v : 'f');
}
// служебные фразы
['감사합니다!', '안녕하세요', '잘했어요!', '다시 해 봐요!'].forEach(t => add(t));

const list = [...items.entries()].map(([key, v]) => ({ key, text: v.text, ...VOICES[v.voice] }));
writeFileSync('scripts/.audio-list.json', JSON.stringify(list));
console.log(`✓ фраз для озвучки: ${list.length}`);
