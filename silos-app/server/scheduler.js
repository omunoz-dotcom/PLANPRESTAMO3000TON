// Genera automáticamente las tareas del programa de limpieza para el período vigente.
import { getRecord, putRecord } from './db.js';
import { SHIFTS } from '../public/js/catalog.js';

const H = 3600e3;
const pad = n => String(n).padStart(2, '0');

// Devuelve { key, due } del período actual para una frecuencia, en hora local (offset fijo, Ecuador = -5).
export function currentPeriod(frequency, now, offsetH) {
  const local = new Date(now.getTime() + offsetH * H); // usar getUTC* = hora local
  const y = local.getUTCFullYear(), m = local.getUTCMonth(), d = local.getUTCDate(), h = local.getUTCHours();
  const toUtc = (Y, M, D, hh = 0) => new Date(Date.UTC(Y, M, D, hh) - offsetH * H).toISOString();
  const ymd = (Y, M, D) => { const t = new Date(Date.UTC(Y, M, D)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };

  switch (frequency) {
    case 'turno': {
      const starts = SHIFTS.map(s => s.start).sort((a, b) => a - b);
      let idx = starts.filter(s => s <= h).length - 1;
      let day = d;
      if (idx < 0) { idx = starts.length - 1; day = d - 1; } // madrugada pertenece al turno nocturno del día anterior
      const shift = SHIFTS.find(s => s.start === starts[idx]);
      const nextStart = idx + 1 < starts.length ? toUtc(y, m, day, starts[idx + 1]) : toUtc(y, m, day + 1, starts[0]);
      return { key: `${ymd(y, m, day)}-${shift.id}`, due: nextStart, shift: shift.id };
    }
    case 'semanal': {
      const dow = (local.getUTCDay() + 6) % 7; // lunes = 0
      const monday = d - dow;
      return { key: `S${ymd(y, m, monday)}`, due: toUtc(y, m, monday + 7) };
    }
    case 'mensual':
      return { key: `${y}-${pad(m + 1)}`, due: toUtc(y, m + 1, 1) };
    case 'diario':
    default:
      return { key: ymd(y, m, d), due: toUtc(y, m, d + 1) };
  }
}

export function generateTasks(db, { offsetH, onCreated }) {
  const now = new Date();
  const plans = db.prepare(`SELECT data FROM records WHERE kind = 'plan' AND deleted = 0`).all()
    .map(r => JSON.parse(r.data)).filter(p => p.active !== false);
  let created = 0;
  for (const plan of plans) {
    const { key, due, shift } = currentPeriod(plan.frequency, now, offsetH);
    const id = `t-${plan.id}-${key}`;
    if (getRecord(db, id)) continue;
    const ts = now.toISOString();
    const task = {
      id, kind: 'task', category: plan.category || 'limpieza', title: plan.title,
      zone_id: plan.zone_id, role: plan.role || null, assigned_to: plan.assigned_to || null,
      checklist: (plan.checklist || []).map(t => ({ t, done: false })),
      status: 'pendiente', priority: plan.priority || 'media', due, period: key, shift: shift || null,
      plan_id: plan.id, created_by: 'system', created_at: ts, updated_at: ts, deleted: false,
    };
    putRecord(db, task);
    created++;
  }
  if (created) onCreated?.(created);
  return created;
}
