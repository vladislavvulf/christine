'use client';
import { useStore, type Progress, type User } from './store';
import { BASE } from './util';

const URL = `${BASE}/api/index.php`;

export type LeaderRow = { rank: number; username: string; avatar: string; xp: number; streak: number; me?: boolean };

export class ApiError extends Error {
  constructor(message: string, public status = 0) { super(message); }
}

export async function api<T = Record<string, unknown>>(action: string, body?: unknown): Promise<T> {
  const token = useStore.getState().token;
  let res: Response;
  try {
    res = await fetch(`${URL}?action=${action}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth-Token': token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError('Нет связи с сервером', 0);
  }
  let data: { ok?: boolean; error?: string } & Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    throw new ApiError('Сервер недоступен (API не найден — запущен ли PHP?)', res.status);
  }
  if (!res.ok || !data.ok) {
    if (res.status === 401 && token) useStore.setState({ token: null, user: null });
    throw new ApiError(data.error || `Ошибка ${res.status}`, res.status);
  }
  return data as T;
}

type AuthResp = { user: User; token: string; progress: Progress | null };

export async function register(username: string, password: string) {
  const { p, pendingXp } = useStore.getState();
  const r = await api<AuthResp>('register', { username, password, progress: p, xp: p.xp, avatar: p.avatar });
  useStore.getState().login(r.token, r.user, null);
  useStore.getState().ackXp(pendingXp);
  return r;
}

export async function login(username: string, password: string) {
  const r = await api<AuthResp>('login', { username, password });
  const st = useStore.getState();
  const local = st.p;
  const serverEmpty = !r.progress || !r.progress.updated;
  st.login(r.token, r.user, serverEmpty ? null : r.progress);
  // на сервере пусто, а на устройстве есть гостевой прогресс — переносим его
  if (serverEmpty && local.xp > 0) {
    await api('save', { progress: local, xpDelta: local.xp, import: true }).catch(() => {});
  }
  useStore.setState({ pendingXp: 0 });
  return r;
}

export async function logout() {
  await api('logout', {}).catch(() => {});
  useStore.getState().logout();
}

/* ---------- Синхронизация прогресса ---------- */
let timer: ReturnType<typeof setTimeout> | null = null;
let inflight = false;

export function scheduleSync(delay = 2500) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

export async function syncNow() {
  const st = useStore.getState();
  if (!st.token || inflight) return;
  inflight = true;
  const xpDelta = st.pendingXp;
  try {
    await api('save', { progress: st.p, xpDelta });
    useStore.getState().ackXp(xpDelta);
  } catch { /* повторим при следующем изменении */ }
  inflight = false;
}

export const leaderboard = (period: 'week' | 'all') =>
  api<{ rows: LeaderRow[]; me: LeaderRow | null; total: number }>(`leaderboard&period=${period}`);

/* ---------- Вход через Google ---------- */
let configCache: Promise<{ googleClientId: string }> | null = null;
export function publicConfig() {
  if (!configCache) configCache = api<{ googleClientId: string }>('config').catch(() => ({ googleClientId: '' }));
  return configCache;
}

export async function loginGoogle(credential: string) {
  const st = useStore.getState();
  const local = st.p;
  const r = await api<AuthResp & { created: boolean }>('google', { credential, progress: local, xp: local.xp, avatar: local.avatar });
  const serverEmpty = !r.progress || !r.progress.updated;
  st.login(r.token, r.user, serverEmpty ? null : r.progress);
  // старый аккаунт без прогресса, а на устройстве есть гостевой — переносим
  if (!r.created && serverEmpty && local.xp > 0) {
    await api('save', { progress: local, xpDelta: local.xp, import: true }).catch(() => {});
  }
  useStore.setState({ pendingXp: 0 });
  return r;
}
