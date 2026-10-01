"""
Генерирует mp3 для всех фраз из scripts/.audio-list.json нейросетевыми голосами Microsoft Edge TTS.
Уже готовые файлы пропускаются — можно запускать повторно после добавления контента.

    pip install edge-tts
    npx tsx scripts/audio-list.ts
    python scripts/gen-audio.py

Требуется ffmpeg (обрезка тишины и сжатие). Результат: public/audio/<ключ>.mp3 + public/audio/index.json
"""
import asyncio, json, os, shutil, subprocess, sys, tempfile
import edge_tts

OUT = os.path.join('public', 'audio')
LIST = os.path.join('scripts', '.audio-list.json')
CONCURRENCY = 12
HAS_FFMPEG = shutil.which('ffmpeg') is not None


def compress(src: str, dst: str) -> None:
    """Обрезаем тишину по краям, моно 32 кбит/с — файлы становятся в 3–4 раза меньше."""
    if not HAS_FFMPEG:
        shutil.move(src, dst)
        return
    subprocess.run([
        'ffmpeg', '-y', '-loglevel', 'error', '-i', src,
        '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,apad=pad_dur=0.08',
        '-ac', '1', '-ar', '24000', '-b:a', '32k', dst,
    ], check=True)
    os.remove(src)


async def make(item, sem, tmp, stats):
    dst = os.path.join(OUT, item['key'] + '.mp3')
    if os.path.exists(dst):
        stats['skip'] += 1
        return
    async with sem:
        for attempt in range(4):
            try:
                raw = os.path.join(tmp, item['key'] + '.raw.mp3')
                tts = edge_tts.Communicate(item['text'], item['name'], rate=item['rate'], pitch=item['pitch'])
                await asyncio.wait_for(tts.save(raw), timeout=30)
                await asyncio.to_thread(compress, raw, dst)
                stats['new'] += 1
                if stats['new'] % 100 == 0:
                    print(f"  … {stats['new']} новых файлов", flush=True)
                return
            except Exception as e:  # сеть может моргнуть — пробуем ещё раз
                await asyncio.sleep(1.5 * (attempt + 1))
                last = e
        stats['fail'].append(f"{item['text']}: {last}")


async def main():
    with open(LIST, encoding='utf-8') as f:
        items = json.load(f)
    os.makedirs(OUT, exist_ok=True)
    sem = asyncio.Semaphore(CONCURRENCY)
    stats = {'new': 0, 'skip': 0, 'fail': []}
    with tempfile.TemporaryDirectory() as tmp:
        await asyncio.gather(*(make(i, sem, tmp, stats) for i in items))
    keys = sorted(i['key'] for i in items if os.path.exists(os.path.join(OUT, i['key'] + '.mp3')))
    with open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(keys, f, separators=(',', ':'))
    print(f"✓ озвучка: новых {stats['new']}, уже было {stats['skip']}, всего в индексе {len(keys)}")
    if stats['fail']:
        print('Ошибки:', *stats['fail'][:10], sep='\n  ')
        sys.exit(1)

asyncio.run(main())
