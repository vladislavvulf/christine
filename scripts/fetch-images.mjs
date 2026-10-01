// Скачивает 3D-иллюстрации Microsoft Fluent Emoji (лицензия MIT) и сохраняет как WebP в public/img/3d/.
// Запускается один раз при изменении списка картинок:  node scripts/fetch-images.mjs
// Готовые картинки лежат в репозитории — на хостинге ничего скачивать не нужно.
import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import sharp from 'sharp';

const OUT = 'public/img/3d';
const SIZE = 160;

/** ключ → название в наборе Fluent Emoji */
export const IMAGES = {
  // слова
  coffee: 'Hot beverage', pizza: 'Pizza', bus: 'Bus', taxi: 'Taxi', banana: 'Banana', tomato: 'Tomato', camera: 'Camera',
  radio: 'Radio', computer: 'Laptop', icecream: 'Soft ice cream', hotel: 'Hotel', drama: 'Television', milk: 'Glass of milk',
  water: 'Droplet', rice: 'Cooked rice', kimchi: 'Leafy green', ramyeon: 'Steaming bowl', apple: 'Red apple', tteok: 'Hot pepper',
  bibimbap: 'Green salad', bread: 'Bread', tea: 'Teacup without handle', mom: 'Woman', dad: 'Man', friend: 'Handshake',
  school: 'School', seoul: 'Cityscape', korea: 'Globe showing asia-australia', cat: 'Cat face', puppy: 'Dog face', hello: 'Waving hand',
  yes: 'Check mark button', no: 'Cross mark', thanks: 'Folded hands', sorry: 'Pensive face', love: 'Red heart',
  oppa: 'Smiling face with heart-eyes', daebak: 'Star-struck', really: 'Face with open mouth', okay: 'Hugging face',
  fighting: 'Flexed biceps', aigo: 'Weary face', whatdo: 'Face screaming in fear', wait: 'Raised hand', miss: 'Pleading face',
  child: 'Child', cucumber: 'Cucumber', me: 'Person raising hand', you: 'Backhand index pointing right', tree: 'Deciduous tree',
  sea: 'Water wave', hat: 'Billed cap', one: 'Keycap 1', tofu: 'Butter', leg: 'Leg', head: 'Brain', mother: 'Woman with headscarf',
  father: 'Man beard', sound: 'Speaker high volume', spider: 'Spider', meat: 'Cut of meat', duck: 'Duck', fox: 'Fox',
  we: 'People hugging', baby: 'Baby bottle', song: 'Musical note', clock: 'Alarm clock', chair: 'Chair', train: 'High-speed train',
  skirt: 'Dress', nose: 'Nose', rabbit: 'Rabbit face', tail: 'Paw prints', lion: 'Lion', hippo: 'Hippopotamus', bird: 'Bird',
  dog: 'Dog', pear: 'Pear', pig: 'Pig face', ear: 'Ear', pants: 'Jeans', juice: 'Beverage box', cake: 'Shortcake',
  chicken: 'Poultry leg', candy: 'Candy', egg: 'Egg', grape: 'Grapes',
  // маскот, боссы, аватары
  tiger: 'Tiger face', ogre: 'Ogre', foxboss: 'Fox', dragon: 'Dragon', ghost: 'Ghost', robot: 'Robot', bear: 'Bear', snake: 'Snake',
  cupmonster: 'Alien monster', tigerfull: 'Tiger', villain: 'Man supervillain',
  a_tiger: 'Tiger face', a_panda: 'Panda', a_fox: 'Fox', a_rabbit: 'Rabbit face', a_bear: 'Bear', a_cat: 'Cat face', a_dog: 'Dog face',
  a_koala: 'Koala', a_frog: 'Frog', a_unicorn: 'Unicorn', a_penguin: 'Penguin', a_hamster: 'Hamster', a_dragon: 'Dragon face',
  a_lion: 'Lion', a_monkey: 'Monkey face', a_octopus: 'Octopus',
  // юниты
  u1: 'Seedling', u2: 'Brick', u3: 'Sparkles', u4: 'Dashing away', u5: 'Flexed biceps', u6: 'Cyclone', u7: 'Anchor',
  u8: 'Hot beverage', u9: 'Steaming bowl', u10: 'Clapper board',
  // игры
  g_rain: 'Cloud with rain', g_memory: 'Joker', g_trace: 'Writing hand', g_ninja: 'Ninja', g_builder: 'Puzzle piece',
  g_blitz: 'High voltage', g_cafe: 'Bubble tea',
  // достижения и задания
  party: 'Party popper', medal: 'Sports medal', fire: 'Fire', volcano: 'Volcano', target: 'Bullseye', collision: 'Collision',
  gem: 'Gem stone', swords: 'Crossed swords', shield: 'Shield', book: 'Open book', books: 'Books', gamepad: 'Video game',
  joystick: 'Joystick', clapper: 'Clapper board', popcorn: 'Popcorn', mic: 'Microphone', star: 'Star', glowstar: 'Glowing star',
  owl: 'Owl', rooster: 'Rooster', bluebook: 'Blue book', repeat: 'Counterclockwise arrows button', check: 'Check mark button',
  trophy: 'Trophy', skull: 'Skull', brain: 'Brain', crown: 'Crown', gift: 'Wrapped gift', detective: 'Detective',
  medal1: '1st place medal', medal2: '2nd place medal', medal3: '3rd place medal', lock: 'Locked', speaker: 'Speaker high volume',
  heart: 'Red heart', blackheart: 'Black heart', bulb: 'Light bulb', turtle: 'Turtle', thinking: 'Thinking face',
  cloud: 'Cloud', key: 'Key', bell: 'Bell', calendar: 'Calendar', seed: 'Seedling', chart: 'Bar chart', abc: 'Input latin letters',
  // гости кафе и эмоции
  p_person: 'Person', p_woman: 'Woman', p_girl: 'Girl', p_oldwoman: 'Old woman', p_oldman: 'Old man', p_student: 'Student',
  p_police: 'Police officer', p_cook: 'Cook', p_panda: 'Panda', p_robot: 'Robot', p_boy: 'Boy', p_artist: 'Artist',
  angry: 'Angry face', yum: 'Face savoring food', cool: 'Smiling face with sunglasses',
};

const tree = JSON.parse(readFileSync(process.argv[2] || 'fluent-tree.json', 'utf8')).tree.map(x => x.path);
function findPath(name) {
  const base = `assets/${name}/`;
  return tree.find(p => p.startsWith(base + '3D/') && p.endsWith('.png'))
    || tree.find(p => p.startsWith(base + 'Default/3D/') && p.endsWith('.png'));
}

mkdirSync(OUT, { recursive: true });
const missing = [];
let done = 0;
const entries = Object.entries(IMAGES);
await Promise.all(Array.from({ length: 8 }, async (_, w) => {
  for (let i = w; i < entries.length; i += 8) {
    const [key, name] = entries[i];
    const file = `${OUT}/${key}.webp`;
    if (existsSync(file)) { done++; continue; }
    const path = findPath(name);
    if (!path) { missing.push(`${key}: ${name}`); continue; }
    const rel = path.split('/').map(encodeURIComponent).join('/');
    const urls = [
      `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/${rel}`,
      `https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/${rel}`,
    ];
    let buf = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
        if (res.ok) { buf = Buffer.from(await res.arrayBuffer()); break; }
      } catch { /* пробуем следующее зеркало */ }
    }
    if (!buf) { missing.push(`${key}: не удалось скачать`); continue; }
    writeFileSync(file, await sharp(buf).resize(SIZE, SIZE).webp({ quality: 82 }).toBuffer());
    done++;
  }
}));
console.log(`✓ картинок: ${done}`);
if (missing.length) { console.log('Не найдено:\n' + missing.join('\n')); process.exitCode = 1; }
