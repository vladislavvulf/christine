// Описание мини-игр (без React — используется и в хранилище)
export type GameMeta = {
  id: string; title: string; e: string; desc: string; rules: string; color: string;
  /** null — открыто; строка — что нужно сделать, чтобы открыть */
  lock: (ctx: { done: Set<string>; readable: string[]; foods: string[] }) => string | null;
};

const needLesson = (id: string, title: string) => (c: { done: Set<string> }) => (c.done.has(id) ? null : `Пройди урок «${title}»`);

export const GAMES: GameMeta[] = [
  { id: 'rain', title: 'Хангыль-дождь', e: '🌧️', color: '#3D7BFF',
    desc: 'Лови падающие буквы, пока они не упали',
    rules: 'Буквы и слоги падают с неба. Нажми правильное чтение для самой нижней капли. 3 промаха — конец игры.',
    lock: needLesson('u1l1', 'ㅏ ㅓ ㅣ') },
  { id: 'memory', title: 'Мемори', e: '🃏', color: '#8B5CF6',
    desc: 'Найди пары: буква ↔ звук',
    rules: 'Переворачивай карточки и находи пары «буква — чтение». Чем меньше ходов, тем больше очков.',
    lock: needLesson('u1l1', 'ㅏ ㅓ ㅣ') },
  { id: 'trace', title: 'Пропись', e: '✍️', color: '#0EA5A4',
    desc: 'Обведи букву пальцем',
    rules: 'Обведи букву по контуру. Чем точнее — тем больше звёзд. Моторная память помогает запоминать в 2 раза быстрее!',
    lock: needLesson('u1l1', 'ㅏ ㅓ ㅣ') },
  { id: 'ninja', title: 'Аудио-ниндзя', e: '🥷', color: '#111827',
    desc: 'Слушай и руби правильный слог',
    rules: 'Ты слышишь слог — выбери его. 60 секунд. Ошибка отнимает 3 секунды. Серия верных ответов умножает очки!',
    lock: needLesson('u1l2', 'ㅗ ㅜ ㅡ') },
  { id: 'builder', title: 'Слогоконструктор', e: '🧩', color: '#F97316',
    desc: 'Собери слог из букв на скорость',
    rules: 'Слышишь слог — собери его из согласной и гласной. 60 секунд на рекорд.',
    lock: needLesson('u2l1', 'ㄱ ㄴ ㄷ ㄹ') },
  { id: 'blitz', title: 'Блиц-чтение', e: '⚡', color: '#EAB308',
    desc: 'Читай слова и угадывай смысл',
    rules: 'Появляется корейское слово — выбери перевод. 60 секунд, серия умножает очки.',
    lock: c => (c.readable.length >= 8 ? null : `Нужно уметь читать 8 слов (сейчас ${c.readable.length})`) },
  { id: 'cafe', title: 'Сеульское кафе', e: '🧋', color: '#DB2777',
    desc: 'Прочитай заказ и накорми гостей',
    rules: 'Гости заказывают по-корейски. Прочитай заказ и подай нужное блюдо, пока гость не ушёл. 3 недовольных гостя — кафе закрывается!',
    lock: c => (c.foods.length >= 5 ? null : `Нужно уметь читать 5 блюд (сейчас ${c.foods.length})`) },
];

export const GAME_IDS = GAMES.map(g => g.id);
