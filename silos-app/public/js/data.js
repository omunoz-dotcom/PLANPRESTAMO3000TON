// Capa de datos local (IndexedDB) + cola de envío + sincronización con el servidor.
// Todo se guarda primero en el dispositivo; se sube apenas hay conexión.

const DB_NAME = 'silos-control';
const DB_VER = 1;
let dbp;

function idb() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('records', { keyPath: 'id' }).createIndex('kind', 'kind');
      d.createObjectStore('outbox', { keyPath: 'id' });
      d.createObjectStore('kv');
      d.createObjectStore('accounts', { keyPath: 'username' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(v => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const kv = {
  get: k => tx('kv', 'readonly', s => req(s.get(k))),
  set: (k, v) => tx('kv', 'readwrite', s => { s.put(v, k); }),
  del: k => tx('kv', 'readwrite', s => { s.delete(k); }),
};

// ---------- Caché en memoria para lecturas rápidas ----------
const cache = { records: new Map(), users: new Map() };
const listeners = new Set();
export const onChange = fn => (listeners.add(fn), () => listeners.delete(fn));
const emit = (why) => listeners.forEach(fn => fn(why));

export async function loadCache() {
  const all = await tx('records', 'readonly', s => req(s.getAll()));
  cache.records = new Map(all.map(r => [r.id, r]));
  cache.users = new Map(((await kv.get('users')) || []).map(u => [u.id, u]));
}

export const list = (kind, pred = () => true) =>
  [...cache.records.values()].filter(r => r.kind === kind && !r.deleted && pred(r));
export const get = id => cache.records.get(id);
export const users = () => [...cache.users.values()];
export const userName = id => id === 'system' ? 'Sistema' : (cache.users.get(id)?.name || '—');

export const uid = (prefix) => `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2))}`;

// Guarda local + encola para subir.
export async function save(rec) {
  const now = new Date().toISOString();
  const s = session();
  const full = {
    ...rec,
    created_at: rec.created_at || now,
    created_by: rec.created_by || s?.user.id,
    updated_at: now,
    _pending: true,
  };
  cache.records.set(full.id, full);
  await tx('records', 'readwrite', st => { st.put(full); });
  await tx('outbox', 'readwrite', st => { st.put(full); });
  emit('local');
  sync();
  return full;
}

export const pendingCount = () => tx('outbox', 'readonly', s => req(s.count()));

// ---------- Sesión ----------
let current = null;
export const session = () => current;
export const apiBase = () => (localStorage.getItem('silos.server') || '').replace(/\/$/, '');

async function api(path, body, token = current?.token) {
  const r = await fetch(apiBase() + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) { const e = new Error(data.error || `Error ${r.status}`); e.status = r.status; throw e; }
  return data;
}
export { api };

async function pbkdf2(password, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 150000 }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

// Inicia sesión en línea; si no hay red, valida contra la última sesión guardada en este dispositivo.
export async function login(username, password) {
  username = username.trim().toLowerCase();
  try {
    const { token, user } = await api('/api/login', { username, password }, null);
    const salt = uid('s');
    const hash = crypto.subtle ? await pbkdf2(password, salt) : null;
    await tx('accounts', 'readwrite', s => { s.put({ username, user, token, salt, hash }); });
    return setSession({ token, user, offline: false });
  } catch (e) {
    if (e.status) throw e; // el servidor respondió (credenciales malas, etc.)
    const acc = await tx('accounts', 'readonly', s => req(s.get(username)));
    if (!acc || !acc.hash) throw new Error('Sin conexión. Este usuario debe ingresar en línea al menos una vez en este dispositivo.');
    if ((await pbkdf2(password, acc.salt)) !== acc.hash) throw new Error('Contraseña incorrecta');
    return setSession({ token: acc.token, user: acc.user, offline: true });
  }
}

async function setSession(s) {
  current = s;
  await kv.set('session', { token: s.token, user: s.user });
  emit('session');
  connectStream();
  sync();
  return s;
}

export async function restoreSession() {
  const s = await kv.get('session');
  if (s) { current = s; connectStream(); }
  return current;
}

export async function logout() {
  current = null;
  await kv.del('session');
  stream?.close(); stream = null;
  emit('session');
}

// ---------- Sincronización ----------
let syncing = null;
let lastSyncOk = null;
let lastError = null;
export const syncState = () => ({ syncing: !!syncing, lastSyncOk, lastError, online: navigator.onLine });

export function sync() {
  if (!current) return Promise.resolve();
  if (syncing) return syncing.then(() => null);
  syncing = (async () => {
    emit('sync');
    try {
      let more = true;
      while (more) {
        const ops = await tx('outbox', 'readonly', s => req(s.getAll()));
        const batch = ops.slice(0, 25).map(({ _pending, ...r }) => r);
        const since = (await kv.get('rev')) || 0;
        const res = await api('/api/sync', { since, ops: batch });
        const sent = new Map(ops.slice(0, 25).map(o => [o.id, o.updated_at]));
        const rejected = [];
        await tx('outbox', 'readwrite', s => {
          for (const r of res.results) {
            // Solo borra si no se volvió a modificar mientras se enviaba
            const cur = cache.records.get(r.id);
            if (cur?.updated_at === sent.get(r.id)) s.delete(r.id);
            if (!r.ok) rejected.push(r);
          }
        });
        const stillPending = new Set((await tx('outbox', 'readonly', s => req(s.getAllKeys()))));
        await tx('records', 'readwrite', s => {
          for (const rec of res.records) {
            if (stillPending.has(rec.id)) continue;
            cache.records.set(rec.id, rec);
            s.put(rec);
          }
          // Registros rechazados: se restaura la versión del servidor (o se elimina si nunca existió)
          for (const r of rejected) {
            if (stillPending.has(r.id)) continue;
            if (r.server) { cache.records.set(r.id, r.server); s.put(r.server); }
            else { cache.records.delete(r.id); s.delete(r.id); }
          }
        });
        if (res.users?.length) {
          for (const u of res.users) cache.users.set(u.id, u);
          await kv.set('users', [...cache.users.values()]);
          const me = cache.users.get(current.user.id);
          if (me) { current.user = { ...current.user, name: me.name, role: me.role }; if (!me.active) { await logout(); return; } }
        }
        await kv.set('rev', res.rev);
        if (rejected.length) emit({ rejected });
        if (res.records.length) emit({ incoming: res.records });
        more = res.more || (ops.length > 25);
      }
      lastSyncOk = new Date();
      lastError = null;
      if (current?.offline) { current.offline = false; }
    } catch (e) {
      lastError = e.message;
      if (e.status === 401) { await logout(); emit({ expired: true }); }
    } finally {
      syncing = null;
      emit('sync');
    }
  })();
  return syncing;
}

// Canal en tiempo real para alertas
let stream = null;
function connectStream() {
  if (!current || typeof EventSource === 'undefined') return;
  stream?.close();
  stream = new EventSource(`${apiBase()}/api/stream?token=${encodeURIComponent(current.token)}`);
  stream.addEventListener('changed', () => sync());
  stream.addEventListener('alert', (e) => { emit({ alert: JSON.parse(e.data) }); sync(); });
  stream.onopen = () => emit('sync');
}

window.addEventListener('online', () => { sync(); connectStream(); emit('sync'); });
window.addEventListener('offline', () => emit('sync'));
document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
setInterval(() => { if (navigator.onLine) sync(); }, 30e3);
