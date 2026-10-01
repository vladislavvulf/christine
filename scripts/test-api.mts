// Автотест Vercel-API на встроенном Postgres (PGlite) — без облака.
// npm i --no-save @electric-sql/pglite && npx tsx scripts/test-api.mts
import { PGlite } from '@electric-sql/pglite';

const pg = new PGlite();
(globalThis as Record<string, unknown>).__christineQuery = async (t: string, p: unknown[]) => (await pg.query(t, p)).rows;
const { GET, POST } = await import('../api/main.mjs');

let token = '';
async function call(action: string, body?: unknown, extra = '') {
  const req = new Request(`https://x.test/api/index.php?action=${action}${extra}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...(token ? { 'x-auth-token': token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const res = await (body ? POST : GET)(req);
  return { status: res.status, data: await res.json() as Record<string, any> };
}
const checks: [string, boolean][] = [];
const ok = (name: string, cond: boolean) => checks.push([name, cond]);

ok('ping', (await call('ping')).data.ok === true);
ok('config', (await call('config')).data.googleClientId === '');
const reg = await call('register', { username: 'Тестер', password: 'secret12', xp: 999999, progress: { xp: 5, streak: { count: 2 } }, avatar: 'a_fox' });
ok('register', reg.status === 200 && reg.data.user.username === 'Тестер' && reg.data.user.avatar === 'a_fox');
token = reg.data.token;
ok('duplicate name', (await call('register', { username: 'тестер', password: 'secret12' })).data.error === 'Это имя уже занято');
ok('short password', (await call('register', { username: 'abc', password: '1' })).status === 400);
const save = await call('save', { progress: { xp: 10, streak: { count: 3 }, avatar: 'a_cat' }, xpDelta: 100000 });
ok('xp capped (3000 import + 400)', save.data.xp === 3400);
const me = await call('me'); 
ok('me', me.data.user.avatar === 'a_cat' && me.data.progress.xp === 10);
token = '';
ok('bad login', (await call('login', { username: 'Тестер', password: 'nope' })).status === 401);
const lg = await call('login', { username: 'ТЕСТЕР', password: 'secret12' });
ok('login case-insensitive', lg.status === 200);
token = lg.data.token;
const lb = await call('leaderboard', undefined, '&period=week');
ok('leaderboard week', lb.data.rows.length === 1 && lb.data.rows[0].xp === 3400 && lb.data.me.rank === 1 && lb.data.rows[0].me === true);
ok('leaderboard all', (await call('leaderboard', undefined, '&period=all')).data.total === 1);
ok('google not configured', (await call('google', { credential: 'a.b.c' })).status === 400);
await call('logout', {});
ok('logout', (await call('me')).status === 401);
ok('unknown action', (await call('nope')).status === 404);

for (const [n, c] of checks) console.log(c ? '✓' : '✗', n);
const failed = checks.filter(c => !c[1]).length;
console.log(failed ? `Провалено: ${failed}` : 'Все проверки API пройдены');
process.exit(failed ? 1 : 0);
