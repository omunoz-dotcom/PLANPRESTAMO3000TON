import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { currentPeriod } from '../server/scheduler.js';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://localhost:${PORT}`;
let proc, dir;

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silos-test-'));
  proc = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { env: { ...process.env, PORT, DATA_DIR: dir, DEMO: '1' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE + '/api/health')).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('servidor no inició');
});
after(() => { proc.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

const call = async (p, body, token) => {
  const r = await fetch(BASE + p, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};
const login = async (u, p = 'demo123') => (await call('/api/login', { username: u, password: p })).body.token;
const now = () => new Date().toISOString();

test('login rechaza credenciales inválidas', async () => {
  assert.equal((await call('/api/login', { username: 'admin', password: 'x' })).status, 401);
  assert.ok(await login('admin', 'admin123'));
});

test('sincronización inicial trae zonas, programa y tareas generadas', async () => {
  const t = await login('operador');
  const { body } = await call('/api/sync', { since: 0, ops: [] }, t);
  assert.ok(body.records.some(r => r.kind === 'zone'));
  assert.ok(body.records.some(r => r.kind === 'plan'));
  assert.ok(body.records.some(r => r.kind === 'task' && r.plan_id));
  assert.ok(body.users.length >= 5);
});

test('operador reporta alerta; no puede cerrarla; supervisor sí', async () => {
  const op = await login('operador'), sup = await login('supervisor');
  const ev = { id: 'e-test-1', kind: 'event', type: 'derrame', severity: 'media', zone_id: 'z-silo1', status: 'cerrada', updated_at: now() };
  let r = await call('/api/sync', { since: 0, ops: [ev] }, op);
  assert.equal(r.body.results[0].ok, true);
  assert.equal(r.body.records.find(x => x.id === 'e-test-1').status, 'abierta', 'el estado inicial lo fuerza el servidor');
  r = await call('/api/sync', { since: 0, ops: [{ ...ev, status: 'cerrada', updated_at: now() }] }, op);
  assert.equal(r.body.results[0].ok, false);
  r = await call('/api/sync', { since: 0, ops: [{ ...ev, status: 'atendida', ack_by: 'u-op1', updated_at: now() }] }, op);
  assert.equal(r.body.results[0].ok, true);
  r = await call('/api/sync', { since: 0, ops: [{ ...ev, status: 'cerrada', resolution: 'Limpio', updated_at: now() }] }, sup);
  assert.equal(r.body.results[0].ok, true);
});

test('colaborador solo modifica estado/checklist de su tarea', async () => {
  const sup = await login('supervisor'), lim = await login('limpieza'), op = await login('operador');
  const task = { id: 't-test-1', kind: 'task', title: 'Barrer fosa', role: 'limpieza', status: 'pendiente', checklist: [{ t: 'a', done: false }], updated_at: now() };
  assert.equal((await call('/api/sync', { ops: [task] }, sup)).body.results[0].ok, true);
  assert.equal((await call('/api/sync', { ops: [{ ...task, status: 'completada', updated_at: now() }] }, op)).body.results[0].ok, false);
  const r = await call('/api/sync', { ops: [{ ...task, title: 'hackeado', status: 'completada', checklist: [{ t: 'otro', done: true }], updated_at: now() }] }, lim);
  assert.equal(r.body.results[0].ok, true);
  const saved = r.body.records.find(x => x.id === 't-test-1');
  assert.equal(saved.title, 'Barrer fosa');
  assert.deepEqual(saved.checklist, [{ t: 'a', done: true }]);
  assert.equal((await call('/api/sync', { ops: [{ ...task, status: 'verificada', updated_at: now() }] }, lim)).body.results[0].ok, false);
});

test('una versión más antigua no sobrescribe a la más reciente', async () => {
  const sup = await login('supervisor');
  const z = { id: 'z-test', kind: 'zone', name: 'Nueva', updated_at: now() };
  await call('/api/sync', { ops: [z] }, sup);
  const r = await call('/api/sync', { ops: [{ ...z, name: 'Vieja', updated_at: '2020-01-01T00:00:00.000Z' }] }, sup);
  assert.equal(r.body.results[0].conflict, true);
  assert.equal(r.body.results[0].server.name, 'Nueva');
});

test('solo admin crea usuarios', async () => {
  const sup = await login('supervisor'), adm = await login('admin', 'admin123');
  assert.equal((await call('/api/users', { username: 'nuevo', name: 'N', role: 'operador', password: '123456' }, sup)).status, 403);
  assert.equal((await call('/api/users', { username: 'nuevo', name: 'N', role: 'operador', password: '123456' }, adm)).status, 200);
  assert.ok(await login('nuevo', '123456'));
});

test('períodos del programa (hora Ecuador)', () => {
  const at = iso => new Date(iso);
  assert.equal(currentPeriod('diario', at('2026-10-18T04:00:00Z'), -5).key, '2026-10-17');
  assert.equal(currentPeriod('turno', at('2026-10-18T04:00:00Z'), -5).key, '2026-10-17-T3'); // 23:00 local
  assert.equal(currentPeriod('turno', at('2026-10-18T10:00:00Z'), -5).key, '2026-10-17-T3'); // 05:00 local
  assert.equal(currentPeriod('turno', at('2026-10-18T12:00:00Z'), -5).key, '2026-10-18-T1'); // 07:00 local
  assert.equal(currentPeriod('turno', at('2026-10-18T12:00:00Z'), -5).due, '2026-10-18T19:00:00.000Z');
  assert.equal(currentPeriod('semanal', at('2026-10-18T15:00:00Z'), -5).key, 'S2026-10-12'); // domingo → semana del lunes 12
  assert.equal(currentPeriod('mensual', at('2026-10-31T23:00:00Z'), -5).key, '2026-10');
});
