// Christine — API для Vercel (Node.js + Postgres). Повторяет протокол PHP-версии (public/api/index.php),
// поэтому фронтенд одинаково работает на обычном PHP-хостинге и на Vercel.
// Vercel: /api/index.php?action=... → эта функция (см. vercel.json).
// Переменные окружения: DATABASE_URL (или POSTGRES_URL) — Postgres (например, Neon из Vercel Storage),
//                       GOOGLE_CLIENT_ID — для входа через Google (необязательно).
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'node:crypto';

const CFG = {
  tokenTtlDays: 90,
  maxXpPerRequest: 400,
  maxXpPerDay: 4000,
  importXpCap: 3000,
  loginAttempts: 10,
  loginWindowMin: 10,
};

type Row = Record<string, unknown>;
type User = {
  id: number; username: string; avatar: string; xp: number; week_xp: number; week_key: string; day_xp: number;
  day_key: string; streak: number; progress: string | null; pass_hash: string; google_sub: string | null; last_used?: number;
};

class HttpError extends Error { constructor(message: string, public status = 400) { super(message); } }
const fail = (msg: string, status = 400): never => { throw new HttpError(msg, status); };
const json = (data: Row, status = 200) =>
  new Response(JSON.stringify({ ok: status < 400, ...data }), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/* ---------- База ---------- */
let sqlFn: ReturnType<typeof neon> | null = null;
let migrated: Promise<void> | null = null;

function sql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) fail('База данных не подключена: добавьте Postgres в Vercel → Storage (переменная DATABASE_URL)', 503);
  if (!sqlFn) sqlFn = neon(url!);
  return sqlFn!;
}
async function q<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  // для автотестов можно подставить свою реализацию запросов (scripts/test-api.ts)
  const override = (globalThis as { __christineQuery?: (t: string, p: unknown[]) => Promise<unknown[]> }).__christineQuery;
  if (override) return (await override(text, params)) as T[];
  return (await sql().query(text, params)) as T[];
}
async function db() {
  if (!migrated) {
    migrated = (async () => {
      await q(`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, username VARCHAR(32) NOT NULL, username_lc VARCHAR(32) NOT NULL UNIQUE,
        pass_hash VARCHAR(255) NOT NULL DEFAULT '', avatar VARCHAR(16) NOT NULL DEFAULT 'a_tiger',
        xp INT NOT NULL DEFAULT 0, week_xp INT NOT NULL DEFAULT 0, week_key VARCHAR(10) NOT NULL DEFAULT '',
        day_xp INT NOT NULL DEFAULT 0, day_key VARCHAR(10) NOT NULL DEFAULT '', streak INT NOT NULL DEFAULT 0,
        progress TEXT, created_at INT NOT NULL, updated_at INT NOT NULL, google_sub VARCHAR(64) UNIQUE)`);
      await q(`CREATE TABLE IF NOT EXISTS tokens (token_hash CHAR(64) PRIMARY KEY, user_id INT NOT NULL, created_at INT NOT NULL, last_used INT NOT NULL)`);
      await q(`CREATE TABLE IF NOT EXISTS attempts (ip VARCHAR(64) NOT NULL, ts INT NOT NULL)`);
    })().catch(e => { migrated = null; throw e; });
  }
  await migrated;
}

/* ---------- Вспомогательное ---------- */
const now = () => Math.floor(Date.now() / 1000);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const dayKey = () => new Date().toISOString().slice(0, 10);
function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
const publicUser = (u: User) => ({ id: u.id, username: u.username, avatar: u.avatar });
const cleanAvatar = (a: unknown) => (typeof a === 'string' && /^a_[a-z]{2,12}$/.test(a) ? a : 'a_tiger');
function cleanProgress(p: unknown): string | null {
  if (!p || typeof p !== 'object') return null;
  const s = JSON.stringify(p);
  if (s.length > 500000) fail('Прогресс слишком большой', 413);
  return s;
}
const ipOf = (req: Request) => (req.headers.get('x-forwarded-for') || '0').split(',')[0].trim().slice(0, 64);

async function rateLimit(req: Request) {
  const ip = ipOf(req);
  await q('DELETE FROM attempts WHERE ts < $1', [now() - CFG.loginWindowMin * 60]);
  const [{ c }] = await q<{ c: string }>('SELECT COUNT(*) AS c FROM attempts WHERE ip = $1', [ip]);
  if (Number(c) >= CFG.loginAttempts) fail('Слишком много попыток. Подождите несколько минут.', 429);
  await q('INSERT INTO attempts (ip, ts) VALUES ($1, $2)', [ip, now()]);
}

async function issueToken(userId: number) {
  const t = randomBytes(32).toString('hex');
  await q('INSERT INTO tokens (token_hash, user_id, created_at, last_used) VALUES ($1, $2, $3, $3)', [sha(t), userId, now()]);
  return t;
}

async function currentUser(req: Request, required = true): Promise<User | null> {
  const t = req.headers.get('x-auth-token') || '';
  if (!/^[a-f0-9]{64}$/.test(t)) return required ? fail('Нужно войти', 401) : null;
  const rows = await q<User>('SELECT u.*, t.last_used FROM tokens t JOIN users u ON u.id = t.user_id WHERE t.token_hash = $1', [sha(t)]);
  const u = rows[0];
  if (!u || (u.last_used || 0) < now() - CFG.tokenTtlDays * 86400) return required ? fail('Сессия истекла, войдите снова', 401) : null;
  if ((u.last_used || 0) < now() - 3600) await q('UPDATE tokens SET last_used = $1 WHERE token_hash = $2', [now(), sha(t)]);
  return u;
}

function grantXp(u: Pick<User, 'xp' | 'week_xp' | 'week_key' | 'day_xp' | 'day_key'>, delta: number, cap: number) {
  const wk = weekKey(), dk = dayKey();
  const week = u.week_key === wk ? u.week_xp : 0;
  const day = u.day_key === dk ? u.day_xp : 0;
  const d = Math.max(0, Math.min(Math.floor(delta) || 0, cap, CFG.maxXpPerDay - day));
  return { xp: u.xp + d, week_xp: week + d, week_key: wk, day_xp: day + d, day_key: dk };
}

async function createUser(name: string, passHash: string, body: Row, googleSub: string | null) {
  const xp = grantXp({ xp: 0, week_xp: 0, week_key: '', day_xp: 0, day_key: '' }, Number(body.xp) || 0, CFG.importXpCap);
  const prog = body.progress as { streak?: { count?: number } } | undefined;
  const streak = Math.min(10000, Number(prog?.streak?.count) || 0);
  const [u] = await q<User>(
    `INSERT INTO users (username, username_lc, pass_hash, avatar, xp, week_xp, week_key, day_xp, day_key, streak, progress, created_at, updated_at, google_sub)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13) RETURNING *`,
    [name, name.toLowerCase(), passHash, cleanAvatar(body.avatar), xp.xp, xp.week_xp, xp.week_key, xp.day_xp, xp.day_key, streak,
      cleanProgress(body.progress), now(), googleSub]);
  return u;
}

async function verifyGoogle(credential: string, clientId: string) {
  if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(credential)) fail('Неверный токен Google');
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`).catch(() => null);
  const info = r && r.ok ? (await r.json()) as Record<string, string> : null;
  if (!info) fail('Google не подтвердил вход', 401);
  if (info!.aud !== clientId) fail('Токен выдан для другого приложения', 401);
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(info!.iss)) fail('Неверный издатель токена', 401);
  if (Number(info!.exp) < now()) fail('Токен Google истёк', 401);
  if (!info!.sub) fail('Нет идентификатора пользователя Google', 401);
  return info!;
}

async function uniqueUsername(base: string) {
  let b = base.trim().replace(/[^\p{L}\p{N}_.-]+/gu, '_').replace(/^[_.-]+|[_.-]+$/g, '');
  if ([...b].length < 3) b = 'user';
  b = [...b].slice(0, 16).join('');
  let name = b;
  for (let i = 0; i < 50; i++) {
    const rows = await q('SELECT 1 FROM users WHERE username_lc = $1', [name.toLowerCase()]);
    if (!rows.length) return name;
    name = b + randomInt(10, 9999);
  }
  return 'user' + randomInt(100000, 999999);
}

const parseProgress = (u: User) => (u.progress ? JSON.parse(u.progress) : null);

/* ---------- Маршруты ---------- */
async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'ping';
  const isPost = req.method === 'POST';
  let body: Row = {};
  if (isPost) {
    const text = await req.text();
    if (text.length > 600000) fail('Слишком большой запрос', 413);
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  }
  const needPost = () => { if (!isPost) fail('Нужен POST', 405); };
  const googleId = process.env.GOOGLE_CLIENT_ID || '';

  if (action === 'config') return json({ googleClientId: googleId });
  await db();

  switch (action) {
    case 'ping':
      return json({ service: 'christine', runtime: 'vercel-node', db: 'postgres' });

    case 'register': {
      needPost();
      await rateLimit(req);
      const name = String(body.username || '').trim();
      const pass = String(body.password || '');
      if (!/^[\p{L}\p{N}_.-]{3,20}$/u.test(name)) fail('Имя: 3–20 символов (буквы, цифры, _ . -)');
      if ([...pass].length < 6) fail('Пароль — минимум 6 символов');
      if (pass.length > 200) fail('Слишком длинный пароль');
      if ((await q('SELECT 1 FROM users WHERE username_lc = $1', [name.toLowerCase()])).length) fail('Это имя уже занято');
      const u = await createUser(name, await bcrypt.hash(pass, 10), body, null);
      return json({ user: publicUser(u), token: await issueToken(u.id), progress: null });
    }

    case 'login': {
      needPost();
      await rateLimit(req);
      const [u] = await q<User>('SELECT * FROM users WHERE username_lc = $1', [String(body.username || '').trim().toLowerCase()]);
      if (u && !u.pass_hash && u.google_sub) fail('Этот аккаунт создан через Google — нажмите «Войти через Google»', 401);
      if (!u || !(await bcrypt.compare(String(body.password || ''), u.pass_hash))) fail('Неверное имя или пароль', 401);
      return json({ user: publicUser(u), token: await issueToken(u.id), progress: parseProgress(u) });
    }

    case 'google': {
      needPost();
      if (!googleId) fail('Вход через Google не настроен на сервере');
      await rateLimit(req);
      const info = await verifyGoogle(String(body.credential || ''), googleId);
      const [existing] = await q<User>('SELECT * FROM users WHERE google_sub = $1', [info.sub]);
      if (existing) return json({ user: publicUser(existing), token: await issueToken(existing.id), progress: parseProgress(existing), created: false });
      const u = await createUser(await uniqueUsername(info.given_name || info.name || 'user'), '', body, info.sub);
      return json({ user: publicUser(u), token: await issueToken(u.id), progress: null, created: true });
    }

    case 'logout': {
      const t = req.headers.get('x-auth-token') || '';
      if (t) await q('DELETE FROM tokens WHERE token_hash = $1', [sha(t)]);
      return json({});
    }

    case 'me': {
      const u = (await currentUser(req))!;
      return json({ user: publicUser(u), xp: u.xp, progress: parseProgress(u) });
    }

    case 'save': {
      needPost();
      const u = (await currentUser(req))!;
      const cap = body.import && u.xp === 0 ? CFG.importXpCap : CFG.maxXpPerRequest;
      const xp = grantXp(u, Number(body.xpDelta) || 0, cap);
      const p = body.progress as { streak?: { count?: number }; avatar?: string } | undefined;
      const progress = cleanProgress(p);
      await q(`UPDATE users SET xp=$1, week_xp=$2, week_key=$3, day_xp=$4, day_key=$5, streak=$6, avatar=$7,
               progress=COALESCE($8, progress), updated_at=$9 WHERE id=$10`,
        [xp.xp, xp.week_xp, xp.week_key, xp.day_xp, xp.day_key, Math.min(10000, Number(p?.streak?.count) || u.streak),
          p ? cleanAvatar(p.avatar) : u.avatar, progress, now(), u.id]);
      return json({ xp: xp.xp, weekXp: xp.week_xp });
    }

    case 'leaderboard': {
      const me = await currentUser(req, false);
      const all = url.searchParams.get('period') === 'all';
      const col = all ? 'xp' : 'week_xp';
      const where = all ? 'xp > 0' : 'week_key = $1 AND week_xp > 0';
      const params = all ? [] : [weekKey()];
      const rows = await q<User & { score: number }>(`SELECT id, username, avatar, ${col} AS score, streak FROM users WHERE ${where} ORDER BY ${col} DESC, updated_at ASC LIMIT 50`, params);
      const [{ c }] = await q<{ c: string }>(`SELECT COUNT(*) AS c FROM users WHERE ${where}`, params);
      let mine = null;
      if (me) {
        const score = all ? me.xp : me.week_key === weekKey() ? me.week_xp : 0;
        const [{ c: above }] = await q<{ c: string }>(`SELECT COUNT(*) AS c FROM users WHERE ${where} AND ${col} > $${params.length + 1}`, [...params, score]);
        mine = { rank: Number(above) + 1, username: me.username, avatar: me.avatar, xp: score, streak: me.streak, me: true };
      }
      return json({
        rows: rows.map((r, i) => ({ rank: i + 1, username: r.username, avatar: r.avatar, xp: Number(r.score), streak: r.streak, me: !!me && r.id === me.id })),
        me: mine, total: Number(c), period: all ? 'all' : 'week',
      });
    }

    default:
      return fail('Неизвестное действие', 404);
  }
}

async function entry(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error('[christine-api]', e);
    return json({ error: 'Внутренняя ошибка сервера' }, 500);
  }
}

export const GET = entry;
export const POST = entry;
