// Общие для приложения и скрипта генерации правила: какой голос и какое имя файла у фразы.
// Файлы лежат в public/audio/<ключ>.mp3, список — в public/audio/index.json.

/** f — женский (учитель), m — мужской, o — пожилой/король, k — ребёнок/подросток */
export type VoiceCode = 'f' | 'm' | 'o' | 'k';

export const VOICES: Record<VoiceCode, { name: string; pitch: string; rate: string }> = {
  f: { name: 'ko-KR-SunHiNeural', pitch: '+0Hz', rate: '-5%' },
  m: { name: 'ko-KR-InJoonNeural', pitch: '+0Hz', rate: '+0%' },
  o: { name: 'ko-KR-HyunsuMultilingualNeural', pitch: '-12Hz', rate: '-10%' },
  k: { name: 'ko-KR-SunHiNeural', pitch: '+30Hz', rate: '+5%' },
};

/** Голос персонажа по «высоте» из данных сцены */
export function voiceForPitch(pitch: number): VoiceCode {
  if (pitch <= 0.65) return 'o';
  if (pitch >= 1.42) return 'k';
  if (pitch >= 1.1) return 'f';
  return 'm';
}

/** FNV-1a → base36: стабильное короткое имя файла */
export function audioKey(text: string, voice: VoiceCode = 'f'): string {
  const s = `${voice}|${text.trim()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return voice + h.toString(36);
}
