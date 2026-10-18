// Servidor de Control de Área de Silos — sin dependencias externas (Node.js >= 22.13).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDb, seed, getRecord, putRecord, recordsSince, usersSince, hashPassword, checkPassword, nextRev, getMeta, setMeta } from './db.js';
import { applyOp, RuleError } from './rules.js';
import { generateTasks } from './scheduler.js';
import { ROLES } from '../public/js/catalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.resolve(__dirname, '../public');
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '../data'));
const UTC_OFFSET = Number(process.env.UTC_OFFSET ?? -5);
const TOKEN_DAYS = Number(process.env.TOKEN_DAYS || 30);
const TRUST_PROXY = process.env.TRUST_PROXY === '1'; // detrás del proxy HTTPS de la nube

const db = openDb(DATA_DIR);
seed(db, { adminPassword: process.env.ADMIN_PASSWORD, demo: process.env.DEMO === '1' });

let SECRET = process.env.SECRET || getMeta(db, 'secret');
if (!SECRET) { SECRET = crypto.randomBytes(32).toString('hex'); setMeta(db, 'secret', SECRET); }

// ---------- Tokens ----------
const b64 = s => Buffer.from(s).toString('base64url');
const sign = s => crypto.createHmac('sha256', SECRET).update(s).digest('base64url');
function makeToken(user) {
  const body = b64(JSON.stringify({ uid: user.id, exp: Date.now() + TOKEN_DAYS * 864e5 }));
  return `${body}.${sign(body)}`;
}
function readToken(token) {
  if (!token) return null;
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  const expected = sign(body);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  const { uid, exp } = payload;
  if (!(exp > Date.now())) return null;
  const u = db.prepare(`SELECT id, username, name, role, active FROM users WHERE id = ?`).get(uid);
  return u && u.active ? u : null;
}
const publicUser = u => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: !!u.active });

// ---------- Tiempo real (Server-Sent Events) ----------
const streams = new Set();
function broadcast(type, payload, exceptUid) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const s of streams) if (s.uid !== exceptUid) s.res.write(msg);
}
setInterval(() => { for (const s of streams) s.res.write(`: ping\n\n`); }, 25e3);

// ---------- Utilidades HTTP ----------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...CORS });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('Carga demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}
const authUser = req => readToken((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));

const loginAttempts = new Map();
function throttled(key) {
  const now = Date.now();
  const a = (loginAttempts.get(key) || []).filter(t => now - t < 10 * 60e3);
  loginAttempts.set(key, a);
  return a.length >= 10;
}

// ---------- API ----------
const routes = {
  'GET /api/health': async () => ({ ok: true, time: new Date().toISOString(), version: 1 }),

  'POST /api/login': async (req) => {
    const { username, password } = await readBody(req);
    const ip = TRUST_PROXY ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress : req.socket.remoteAddress;
    const key = `${ip}|${String(username).toLowerCase()}`;
    if (throttled(key)) return [429, { error: 'Demasiados intentos. Espere 10 minutos.' }];
    const u = db.prepare(`SELECT * FROM users WHERE username = ?`).get(String(username || '').trim().toLowerCase());
    if (!u || !u.active || !checkPassword(String(password || ''), u.pass)) {
      loginAttempts.get(key).push(Date.now());
      return [401, { error: 'Usuario o contraseña incorrectos' }];
    }
    loginAttempts.delete(key);
    return { token: makeToken(u), user: publicUser(u) };
  },

  'GET /api/me': async (req, user) => ({ user: publicUser(user) }),

  'POST /api/password': async (req, user) => {
    const { current, next } = await readBody(req);
    const u = db.prepare(`SELECT * FROM users WHERE id = ?`).get(user.id);
    if (!checkPassword(String(current || ''), u.pass)) return [400, { error: 'Contraseña actual incorrecta' }];
    if (String(next || '').length < 6) return [400, { error: 'Mínimo 6 caracteres' }];
    db.prepare(`UPDATE users SET pass = ?, rev = ?, updated_at = ? WHERE id = ?`).run(hashPassword(next), nextRev(db), new Date().toISOString(), u.id);
    return { ok: true };
  },

  'POST /api/users': async (req, user) => {
    if (user.role !== 'admin') return [403, { error: 'Solo el administrador gestiona usuarios' }];
    const b = await readBody(req);
    const username = String(b.username || '').trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,32}$/.test(username)) return [400, { error: 'Usuario: 3–32 caracteres (a-z, 0-9, . _ -)' }];
    if (!ROLES[b.role]) return [400, { error: 'Rol inválido' }];
    if (!String(b.name || '').trim()) return [400, { error: 'Nombre requerido' }];
    const now = new Date().toISOString();
    const existing = b.id ? db.prepare(`SELECT * FROM users WHERE id = ?`).get(b.id) : null;
    const dup = db.prepare(`SELECT id FROM users WHERE username = ?`).get(username);
    if (dup && dup.id !== existing?.id) return [400, { error: 'El usuario ya existe' }];
    if (existing) {
      if (existing.id === user.id && (b.role !== 'admin' || b.active === false)) return [400, { error: 'No puede quitarse el rol admin ni desactivarse' }];
      const pass = b.password ? hashPassword(String(b.password)) : existing.pass;
      db.prepare(`UPDATE users SET username = ?, name = ?, role = ?, active = ?, pass = ?, rev = ?, updated_at = ? WHERE id = ?`)
        .run(username, b.name.trim(), b.role, b.active === false ? 0 : 1, pass, nextRev(db), now, existing.id);
    } else {
      if (String(b.password || '').length < 6) return [400, { error: 'Contraseña: mínimo 6 caracteres' }];
      b.id = 'u-' + crypto.randomUUID();
      db.prepare(`INSERT INTO users (id, username, name, role, pass, active, rev, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(b.id, username, b.name.trim(), b.role, hashPassword(String(b.password)), b.active === false ? 0 : 1, nextRev(db), now);
    }
    broadcast('changed', {});
    return { user: publicUser(db.prepare(`SELECT * FROM users WHERE id = ?`).get(b.id)) };
  },

  // Sincronización: el cliente envía sus cambios pendientes y recibe todo lo nuevo desde `since`.
  'POST /api/sync': async (req, user) => {
    const { since = 0, ops = [] } = await readBody(req);
    const results = [];
    const alerts = [];
    for (const op of Array.isArray(ops) ? ops.slice(0, 200) : []) {
      try {
        const existing = getRecord(db, op.id);
        const rec = applyOp(user, op, existing);
        putRecord(db, rec);
        results.push({ id: op.id, ok: true });
        const isNew = !existing;
        if (isNew && rec.kind === 'event') alerts.push(rec);
        if (isNew && rec.kind === 'damage' && (rec.severity === 'critica' || rec.stopped)) alerts.push(rec);
      } catch (e) {
        if (!(e instanceof RuleError)) console.error(e);
        results.push({ id: op?.id, ok: false, conflict: !!e.conflict, error: e.message, server: typeof op?.id === 'string' ? getRecord(db, op.id) : null });
      }
    }
    const since0 = Number(since) || 0;
    const changes = recordsSince(db, since0);
    const rev = changes.length === 500 ? changes.at(-1).rev : Number(getMeta(db, 'rev') || 0);
    const users = usersSince(db, since0);
    if (results.some(r => r.ok)) broadcast('changed', { rev }, user.id);
    for (const a of alerts) broadcast('alert', { id: a.id, kind: a.kind, type: a.type, severity: a.severity, zone_id: a.zone_id, title: a.title || a.equipment || '', by: user.name }, user.id);
    return { rev, more: changes.length === 500, results, records: changes.map(c => c.rec), users };
  },
};

function handleStream(req, res, url) {
  const user = readToken(url.searchParams.get('token'));
  if (!user) return send(res, 401, { error: 'No autorizado' });
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', ...CORS });
  res.write(`retry: 5000\n\n`);
  const s = { res, uid: user.id };
  streams.add(s);
  req.on('close', () => streams.delete(s));
}

// ---------- Archivos estáticos ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.resolve(PUBLIC, '.' + p);
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    const target = !err && st.isFile() ? file : path.join(PUBLIC, 'index.html');
    const ext = path.extname(target);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' || p === '/sw.js' ? 'no-cache' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    fs.createReadStream(target).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (url.pathname === '/api/stream') return handleStream(req, res, url);
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
  const route = routes[`${req.method} ${url.pathname}`];
  if (!route) return send(res, 404, { error: 'No encontrado' });
  try {
    const open = url.pathname === '/api/login' || url.pathname === '/api/health';
    const user = open ? null : authUser(req);
    if (!open && !user) return send(res, 401, { error: 'Sesión expirada o no autorizada' });
    const out = await route(req, user);
    Array.isArray(out) ? send(res, out[0], out[1]) : send(res, 200, out);
  } catch (e) {
    console.error(e);
    send(res, 400, { error: e.message || 'Error' });
  }
});

const runGenerator = () => generateTasks(db, { offsetH: UTC_OFFSET, onCreated: n => { console.log(`[plan] ${n} tareas generadas`); broadcast('changed', {}); } });
runGenerator();
setInterval(runGenerator, 5 * 60e3);

server.listen(PORT, () => console.log(`Control de Silos escuchando en http://localhost:${PORT}  (datos: ${DATA_DIR})`));
