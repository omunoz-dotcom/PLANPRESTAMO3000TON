import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SEED_ZONES, SEED_PLANS } from '../public/js/catalog.js';

export function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'silos.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      pass TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      rev INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      data TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      rev INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS records_rev ON records(rev);
    CREATE INDEX IF NOT EXISTS records_kind ON records(kind);
    CREATE INDEX IF NOT EXISTS users_rev ON users(rev);
  `);
  return db;
}

export function nextRev(db) {
  const row = db.prepare(`SELECT v FROM meta WHERE k = 'rev'`).get();
  const rev = (row ? Number(row.v) : 0) + 1;
  db.prepare(`INSERT INTO meta (k, v) VALUES ('rev', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(String(rev));
  return rev;
}

export function getMeta(db, k) {
  return db.prepare(`SELECT v FROM meta WHERE k = ?`).get(k)?.v;
}
export function setMeta(db, k, v) {
  db.prepare(`INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v`).run(k, v);
}

// ---------- Contraseñas ----------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
export function checkPassword(pw, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(pw, salt, 64);
  return crypto.timingSafeEqual(test, Buffer.from(hash, 'hex'));
}

// ---------- Registros ----------
export function getRecord(db, id) {
  const row = db.prepare(`SELECT data FROM records WHERE id = ?`).get(id);
  return row ? JSON.parse(row.data) : null;
}

export function putRecord(db, rec) {
  const rev = nextRev(db);
  db.prepare(`
    INSERT INTO records (id, kind, data, created_by, created_at, updated_at, deleted, rev)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at,
      deleted = excluded.deleted, rev = excluded.rev
  `).run(rec.id, rec.kind, JSON.stringify(rec), rec.created_by ?? null, rec.created_at,
         rec.updated_at, rec.deleted ? 1 : 0, rev);
  return rev;
}

export function recordsSince(db, since, limit = 500) {
  return db.prepare(`SELECT data, rev FROM records WHERE rev > ? ORDER BY rev LIMIT ?`)
    .all(since, limit).map(r => ({ rec: JSON.parse(r.data), rev: r.rev }));
}

export function usersSince(db, since) {
  return db.prepare(`SELECT id, username, name, role, active, rev, updated_at FROM users WHERE rev > ? ORDER BY rev`).all(since)
    .map(u => ({ ...u, active: !!u.active }));
}

// ---------- Datos iniciales ----------
export function seed(db, { adminPassword, demo }) {
  const now = new Date().toISOString();
  const count = db.prepare(`SELECT COUNT(*) AS n FROM users`).get().n;
  if (count === 0) {
    const pw = adminPassword || 'admin123';
    db.prepare(`INSERT INTO users (id, username, name, role, pass, active, rev, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
      .run('u-admin', 'admin', 'Jefe de Área', 'admin', hashPassword(pw), nextRev(db), now);
    console.log(`[seed] Usuario inicial: admin / ${adminPassword ? '(ADMIN_PASSWORD)' : pw}  ← cámbielo al ingresar`);
    if (demo) {
      const demoUsers = [
        ['u-sup1', 'supervisor', 'Supervisor Turno 1', 'supervisor'],
        ['u-op1', 'operador', 'Operador Silos', 'operador'],
        ['u-lim1', 'limpieza', 'Auxiliar de Limpieza', 'limpieza'],
        ['u-mant1', 'mantenimiento', 'Técnico Mantenimiento', 'mantenimiento'],
      ];
      for (const [id, username, name, role] of demoUsers) {
        db.prepare(`INSERT INTO users (id, username, name, role, pass, active, rev, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`)
          .run(id, username, name, role, hashPassword('demo123'), nextRev(db), now);
      }
      console.log('[seed] Usuarios demo creados (contraseña demo123): supervisor, operador, limpieza, mantenimiento');
    }
  }
  if (!getMeta(db, 'seeded_catalog')) {
    for (const z of SEED_ZONES) {
      putRecord(db, { ...z, kind: 'zone', active: true, created_by: 'u-admin', created_at: now, updated_at: now });
    }
    for (const p of SEED_PLANS) {
      putRecord(db, { ...p, kind: 'plan', active: true, created_by: 'u-admin', created_at: now, updated_at: now });
    }
    setMeta(db, 'seeded_catalog', now);
  }
}
