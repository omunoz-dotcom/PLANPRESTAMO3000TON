// Reglas de permisos por rol y tipo de registro.
// El servidor es la autoridad: lo que el cliente envía se filtra aquí.

const STAFF = new Set(['admin', 'supervisor']);
const KINDS = new Set(['zone', 'plan', 'task', 'inspection', 'damage', 'event', 'comment']);
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB por registro (incluye fotos comprimidas)

export class RuleError extends Error {}

const pick = (src, keys) => Object.fromEntries(keys.filter(k => k in src).map(k => [k, src[k]]));
const isStaff = u => STAFF.has(u.role);

export function applyOp(user, op, existing) {
  if (!op || typeof op !== 'object') throw new RuleError('Registro inválido');
  if (typeof op.id !== 'string' || !/^[\w-]{4,100}$/.test(op.id)) throw new RuleError('ID inválido');
  if (!KINDS.has(op.kind)) throw new RuleError('Tipo de registro no permitido');
  if (existing && existing.kind !== op.kind) throw new RuleError('Tipo no coincide');
  if (JSON.stringify(op).length > MAX_BYTES) throw new RuleError('Registro demasiado grande (reduzca fotos)');

  const now = new Date();
  // Evita relojes de dispositivos adelantados
  let updated = Date.parse(op.updated_at);
  if (!Number.isFinite(updated) || updated > now.getTime() + 5 * 60e3) updated = now.getTime();
  const updated_at = new Date(updated).toISOString();

  if (existing && existing.updated_at > updated_at) {
    const e = new RuleError('Conflicto: existe una versión más reciente');
    e.conflict = true;
    throw e;
  }

  if (op.deleted && !existing) throw new RuleError('No existe');
  if (op.deleted) {
    const own = op.kind === 'comment' && existing.created_by === user.id;
    if (!isStaff(user) && !own) throw new RuleError('Sin permiso para eliminar');
    return { ...existing, deleted: true, updated_at, updated_by: user.id };
  }

  const fn = RULES[op.kind];
  const rec = fn(user, op, existing);
  return {
    ...rec,
    id: op.id,
    kind: op.kind,
    created_by: existing ? existing.created_by : user.id,
    created_at: existing ? existing.created_at : (op.created_at || now.toISOString()),
    updated_at,
    updated_by: user.id,
    deleted: false,
    synced_at: now.toISOString(),
  };
}

const RULES = {
  zone(user, op, existing) {
    if (!isStaff(user)) throw new RuleError('Solo supervisores administran zonas');
    return { ...existing, ...op };
  },

  plan(user, op, existing) {
    if (!isStaff(user)) throw new RuleError('Solo supervisores administran el programa');
    return { ...existing, ...op };
  },

  task(user, op, existing) {
    if (isStaff(user)) return { ...existing, ...op };
    if (!existing) throw new RuleError('Solo supervisores crean tareas');
    const mine = existing.assigned_to === user.id || (!existing.assigned_to && existing.role === user.role);
    if (!mine) throw new RuleError('La tarea no está asignada a usted');
    if (!['pendiente', 'en_proceso', 'completada'].includes(op.status)) throw new RuleError('Estado no permitido');
    const out = { ...existing, ...pick(op, ['status', 'evidence', 'notes', 'started_at', 'done_at', 'done_by']) };
    if (Array.isArray(op.checklist) && Array.isArray(existing.checklist)) {
      out.checklist = existing.checklist.map((it, i) => ({ ...it, done: !!op.checklist[i]?.done }));
    }
    return out;
  },

  inspection(user, op, existing) {
    if (!isStaff(user)) throw new RuleError('Solo supervisores registran inspecciones 5S');
    return { ...existing, ...op };
  },

  damage(user, op, existing) {
    if (!existing) return { ...op, status: 'reportado' };
    if (isStaff(user) || user.role === 'mantenimiento') return { ...existing, ...op };
    if (existing.created_by === user.id && existing.status === 'reportado') {
      return { ...existing, ...pick(op, ['description', 'photos', 'equipment', 'zone_id', 'stopped', 'severity', 'type']) };
    }
    throw new RuleError('Sin permiso para modificar el reporte');
  },

  event(user, op, existing) {
    if (!existing) return { ...op, status: 'abierta' };
    if (isStaff(user)) return { ...existing, ...op };
    // Cualquier colaborador puede dar acuse (atender) una alerta abierta.
    if (existing.status === 'abierta' && op.status === 'atendida') {
      return { ...existing, ...pick(op, ['status', 'ack_by', 'ack_at', 'ack_note']) };
    }
    if (existing.created_by === user.id && op.status === existing.status) {
      return { ...existing, ...pick(op, ['description', 'photos']) };
    }
    throw new RuleError('Solo supervisores cierran alertas');
  },

  comment(user, op, existing) {
    if (existing && existing.created_by !== user.id) throw new RuleError('Solo el autor edita el comentario');
    if (typeof op.ref !== 'string') throw new RuleError('Comentario sin referencia');
    return { ...existing, ...pick(op, ['ref', 'text', 'photos', 'action']) };
  },
};
