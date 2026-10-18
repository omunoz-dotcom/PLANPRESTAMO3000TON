// Control de Área de Silos — aplicación principal (vistas y navegación).
import * as D from './data.js';
import * as C from './catalog.js';
import { h, icon, toast, modal, confirmDlg, photoField, viewPhoto, fmtDate, fmtDay, ago, isToday, beep, notify, downloadCsv } from './ui.js';

const $app = document.getElementById('app');
const me = () => D.session()?.user;
const isStaff = () => ['admin', 'supervisor'].includes(me()?.role);
const isAdmin = () => me()?.role === 'admin';
const canMaint = () => isStaff() || me()?.role === 'mantenimiento';

// ---------- Helpers de dominio ----------
const zones = () => D.list('zone').sort((a, b) => a.name.localeCompare(b.name, 'es'));
const zoneName = id => D.get(id)?.name || '—';
const DONE = ['completada', 'verificada'];
const isOverdue = t => t.due && new Date(t.due) < new Date() && !DONE.includes(t.status);
const isMine = t => t.assigned_to === me()?.id || (!t.assigned_to && t.role === me()?.role);
const openEvents = () => D.list('event', e => e.status !== 'cerrada');
const openDamages = () => D.list('damage', d => !['resuelto', 'cerrado'].includes(d.status));
const elapsedMin = iso => (Date.now() - new Date(iso)) / 60e3;
const slaBreached = e => e.status === 'abierta' && elapsedMin(e.created_at) > (C.SLA_MIN[e.severity] ?? 60);
const byNewest = (a, b) => (b.created_at || '').localeCompare(a.created_at || '');
const assigneeLabel = t => t.assigned_to ? D.userName(t.assigned_to) : (t.role ? `Rol: ${C.ROLES[t.role]?.label || t.role}` : 'Sin asignar');

const toLocalInput = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const fromLocalInput = v => v ? new Date(v).toISOString() : null;

function sevChip(sev) { const s = C.SEVERITY[sev] || C.SEVERITY.media; return h('span', { class: `chip chip-${s.color}` }, s.label); }
function statusChip(map, st, cls = '') { return h('span', { class: `chip chip-st chip-st-${st} ${cls}` }, map[st] || st); }
function pendingMark(r) { return r._pending ? h('span', { class: 'chip chip-pending', title: 'Pendiente de subir al servidor' }, icon('sync', 12), ' Por subir') : null; }

function select(name, options, value, attrs = {}) {
  const el = h('select', { name, ...attrs }, Object.entries(options).map(([v, l]) => h('option', { value: v }, l)));
  if (value != null) el.value = value;
  return el;
}
// <label> solo envuelve controles nativos: con botones reenviaría el clic al primero.
const field = (label, input, hint) => h(/^(INPUT|SELECT|TEXTAREA)$/.test(input.tagName) ? 'label' : 'div', { class: 'field' }, h('span', { class: 'field-label' }, label), input, hint ? h('small', { class: 'hint' }, hint) : null);
const zoneOptions = (empty) => ({ ...(empty ? { '': empty } : {}), ...Object.fromEntries(zones().map(z => [z.id, z.name])) });
const userOptions = (filter = () => true) => Object.fromEntries(D.users().filter(u => u.active && filter(u)).map(u => [u.id, `${u.name} · ${C.ROLES[u.role]?.label || u.role}`]));

function segmented(name, options, value, onChange) {
  const wrap = h('div', { class: 'seg', role: 'radiogroup' });
  wrap.value = value;
  const render = () => wrap.replaceChildren(...Object.entries(options).map(([v, l]) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(wrap.value === v), class: `seg-btn seg-${v} ${wrap.value === v ? 'on' : ''}`,
      onclick: () => { wrap.value = v; render(); onChange?.(v); } }, l)));
  render();
  return wrap;
}

// ---------- Navegación ----------
const NAV = [
  { href: '#/', label: 'Tablero', icon: 'home' },
  { href: '#/tareas', label: 'Tareas', icon: 'tasks' },
  { href: '#/alertas', label: 'Alertas', icon: 'bell', badge: () => openEvents().length },
  { href: '#/danos', label: 'Daños', icon: 'wrench', badge: () => openDamages().length },
  { href: '#/inspecciones', label: 'Inspección 5S', icon: 'shield', more: true },
  { href: '#/plan', label: 'Programa', icon: 'plan', more: true, staff: true },
  { href: '#/reportes', label: 'Reportes', icon: 'chart', more: true, staff: true },
  { href: '#/usuarios', label: 'Usuarios', icon: 'users', more: true, admin: true },
  { href: '#/perfil', label: 'Mi perfil', icon: 'sun', more: true },
];
const navAllowed = n => (!n.staff || isStaff()) && (!n.admin || isAdmin());

const routes = [
  [/^$/, viewDashboard],
  [/^tareas$/, viewTasks],
  [/^tarea\/nueva$/, () => viewTaskForm()],
  [/^tarea\/(.+)\/editar$/, id => viewTaskForm(id)],
  [/^tarea\/(.+)$/, viewTask],
  [/^alertas$/, viewEvents],
  [/^alerta\/(.+)$/, viewEvent],
  [/^danos$/, viewDamages],
  [/^dano\/nuevo$/, () => viewDamageForm()],
  [/^dano\/(.+)$/, viewDamage],
  [/^inspecciones$/, viewInspections],
  [/^inspeccion\/nueva$/, viewInspectionForm],
  [/^inspeccion\/(.+)$/, viewInspection],
  [/^plan$/, viewPlan],
  [/^plan\/(.+)$/, viewPlanForm],
  [/^zona\/(.+)$/, viewZoneForm],
  [/^reportes$/, viewReports],
  [/^usuarios$/, viewUsers],
  [/^perfil$/, viewProfile],
];

let main, shell;
function route() {
  if (!D.session()) return renderLogin();
  if (!shell) buildShell();
  const path = location.hash.replace(/^#\/?/, '');
  const found = routes.find(([re]) => re.test(path));
  main.dataset.form = '';
  main.replaceChildren();
  window.scrollTo(0, 0);
  if (!found) { main.append(h('p', {}, 'Página no encontrada')); return; }
  const m = path.match(found[0]);
  found[1](...m.slice(1).map(decodeURIComponent));
  updateNav();
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

function buildShell() {
  main = h('main', { id: 'main', tabindex: '-1' });
  const nav = h('nav', { class: 'nav', 'aria-label': 'Principal' });
  shell = h('div', { class: 'shell' },
    h('header', { class: 'topbar' },
      h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark' }, icon('silo', 22)),
        h('span', { class: 'brand-text' }, h('b', {}, 'SILOS'), h('small', {}, 'Control de Área'))),
      h('div', { class: 'top-right' },
        h('button', { class: 'sync-pill', id: 'syncPill', onclick: () => { D.sync(); toast('Sincronizando…'); } }),
        h('a', { class: 'user-btn', href: '#/perfil', id: 'userBtn' }))),
    h('div', { class: 'body' }, nav, h('div', { class: 'content' }, h('div', { id: 'banner' }), main)),
    h('button', { class: 'fab', 'aria-label': 'Reportar alerta', onclick: startEventReport }, icon('alert', 26), h('span', {}, 'ALERTA')));
  $app.replaceChildren(shell);
  updateNav(); updateSync(); updateBanner();
}

function updateNav() {
  const nav = shell?.querySelector('.nav'); if (!nav) return;
  const path = '#/' + location.hash.replace(/^#\/?/, '').split('/')[0];
  const item = n => {
    const b = n.badge?.();
    const active = path === n.href || (n.href !== '#/' && path.startsWith(n.href.replace(/s$/, '')));
    return h('a', { href: n.href, class: `nav-item ${n.more ? 'more-item' : ''} ${active ? 'active' : ''}` },
      icon(n.icon), h('span', {}, n.label), b ? h('i', { class: 'badge' }, b) : null);
  };
  nav.replaceChildren(...NAV.filter(navAllowed).map(item),
    h('button', { class: 'nav-item more-btn', onclick: openMore }, icon('plus'), h('span', {}, 'Más')));
  const ub = shell.querySelector('#userBtn');
  ub.replaceChildren(h('span', { class: 'avatar' }, (me()?.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('')),
    h('span', { class: 'user-meta' }, h('b', {}, me()?.name), h('small', {}, C.ROLES[me()?.role]?.label)));
}

function openMore() {
  const close = () => wrap.remove();
  const wrap = h('div', { class: 'sheet-wrap', onclick: e => { if (e.target === wrap) close(); } },
    h('div', { class: 'sheet' }, NAV.filter(n => n.more && navAllowed(n)).map(n =>
      h('a', { href: n.href, class: 'sheet-item', onclick: close }, icon(n.icon), n.label))));
  document.body.append(wrap);
}

async function updateSync() {
  const pill = document.getElementById('syncPill'); if (!pill) return;
  const st = D.syncState();
  const n = await D.pendingCount();
  const state = !st.online ? 'off' : st.lastError ? 'err' : st.syncing ? 'busy' : 'on';
  const label = { off: 'Sin conexión', err: 'Error de conexión', busy: 'Sincronizando', on: 'En línea' }[state];
  pill.className = `sync-pill sync-${state}`;
  pill.title = st.lastSyncOk ? `Última sincronización: ${st.lastSyncOk.toLocaleTimeString('es-EC')}` : 'Aún sin sincronizar';
  pill.replaceChildren(h('i', { class: 'dot' }), h('span', { class: 'sync-label' }, label), ...(n ? [h('b', { class: 'sync-n' }, `${n} por subir`)] : []));
}

function updateBanner() {
  const el = document.getElementById('banner'); if (!el) return;
  const crit = openEvents().filter(e => e.status === 'abierta').sort(byNewest);
  if (!crit.length) return el.replaceChildren();
  const breached = crit.filter(slaBreached).length;
  el.replaceChildren(h('a', { class: `banner ${crit.some(e => e.severity === 'critica') ? 'banner-crit' : ''}`, href: crit.length === 1 ? `#/alerta/${crit[0].id}` : '#/alertas' },
    icon('alert', 22),
    h('span', {}, h('b', {}, `${crit.length} alerta${crit.length > 1 ? 's' : ''} sin atender`),
      ` · ${C.EVENT_TYPES[crit[0].type]?.label || 'Evento'} en ${zoneName(crit[0].zone_id)} (${ago(crit[0].created_at)})`,
      breached ? h('b', { class: 'banner-sla' }, ` · ${breached} fuera de tiempo`) : null),
    h('span', { class: 'banner-go' }, 'Ver ›')));
}

// ---------- Componentes ----------
const pageHead = (title, sub, ...actions) => h('div', { class: 'page-head' },
  h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'muted' }, sub) : null), h('div', { class: 'page-actions' }, actions));
const backLink = (href, label = 'Volver') => h('a', { class: 'back', href }, icon('back', 18), label);
const empty = (text) => h('div', { class: 'empty' }, text);
const btnLink = (href, label, cls = 'primary', ic = 'plus') => h('a', { class: `btn ${cls}`, href }, icon(ic, 18), label);

function tabs(items, current, onPick) {
  return h('div', { class: 'tabs', role: 'tablist' }, items.map(([k, l, n]) =>
    h('button', { role: 'tab', 'aria-selected': String(k === current), class: `tab ${k === current ? 'on' : ''}`, onclick: () => onPick(k) },
      l, n != null ? h('i', { class: 'tab-n' }, n) : null)));
}

function taskCard(t) {
  const done = t.checklist?.filter(i => i.done).length || 0, total = t.checklist?.length || 0;
  return h('a', { class: `card row-card ${isOverdue(t) ? 'is-late' : ''}`, href: `#/tarea/${t.id}` },
    h('div', { class: `stripe st-${t.status}` }),
    h('div', { class: 'rc-main' },
      h('div', { class: 'rc-title' }, t.title),
      h('div', { class: 'rc-meta' },
        h('span', { class: 'chip chip-cat' }, C.TASK_CATEGORIES[t.category] || t.category),
        h('span', {}, zoneName(t.zone_id)), h('span', {}, assigneeLabel(t)),
        t.due ? h('span', { class: isOverdue(t) ? 'late' : '' }, icon('clock', 13), ' ', isOverdue(t) ? 'Vencida ' : 'Vence ', fmtDate(t.due)) : null)),
    h('div', { class: 'rc-side' }, statusChip(C.TASK_STATUS, t.status), total ? h('small', { class: 'muted' }, `${done}/${total}`) : null, pendingMark(t)));
}

function eventCard(e) {
  const T = C.EVENT_TYPES[e.type] || C.EVENT_TYPES.otro;
  const late = slaBreached(e);
  return h('a', { class: `card row-card ev-${e.severity} ${e.status === 'abierta' ? 'is-open' : ''}`, href: `#/alerta/${e.id}` },
    h('div', { class: 'ev-icon' }, T.icon),
    h('div', { class: 'rc-main' },
      h('div', { class: 'rc-title' }, T.label),
      h('div', { class: 'rc-meta' }, h('span', {}, zoneName(e.zone_id)), h('span', {}, D.userName(e.created_by)), h('span', {}, ago(e.created_at)),
        late ? h('span', { class: 'late' }, 'Fuera de tiempo de respuesta') : null)),
    h('div', { class: 'rc-side' }, sevChip(e.severity), statusChip(C.EVENT_STATUS, e.status), pendingMark(e)));
}

function damageCard(d) {
  return h('a', { class: 'card row-card', href: `#/dano/${d.id}` },
    h('div', { class: `stripe sev-${d.severity}` }),
    h('div', { class: 'rc-main' },
      h('div', { class: 'rc-title' }, d.equipment || 'Equipo', d.stopped ? h('span', { class: 'chip chip-red stop' }, 'DETENIDO') : null),
      h('div', { class: 'rc-meta' }, h('span', {}, zoneName(d.zone_id)), h('span', {}, C.DAMAGE_TYPES[d.type] || d.type), h('span', {}, ago(d.created_at)),
        d.assigned_to ? h('span', {}, '→ ', D.userName(d.assigned_to)) : null)),
    h('div', { class: 'rc-side' }, sevChip(d.severity), statusChip(C.DAMAGE_STATUS, d.status), pendingMark(d)));
}

// Línea de tiempo de comentarios para tareas, daños y alertas.
function timeline(ref) {
  const box = h('section', { class: 'card timeline' }, h('h2', {}, 'Bitácora'));
  const items = D.list('comment', c => c.ref === ref).sort((a, b) => a.created_at.localeCompare(b.created_at));
  box.append(items.length ? h('ol', { class: 'tl' }, items.map(c => h('li', { class: c.action ? 'tl-action' : '' },
    h('div', { class: 'tl-head' }, h('b', {}, D.userName(c.created_by)), h('small', { class: 'muted' }, fmtDate(c.created_at)), pendingMark(c)),
    h('div', {}, c.text),
    c.photos?.length ? h('div', { class: 'photos' }, c.photos.map(src => h('div', { class: 'photo' }, h('img', { src, onclick: () => viewPhoto(src) })))) : null)))
    : h('p', { class: 'muted' }, 'Sin comentarios.'));
  const ta = h('textarea', { rows: 2, placeholder: 'Agregar comentario o avance…' });
  const ph = photoField([], { max: 2 });
  box.append(h('div', { class: 'tl-new' }, ta, ph, h('button', { class: 'btn', onclick: async () => {
    if (!ta.value.trim() && !ph.getPhotos().length) return;
    await D.save({ id: D.uid('c'), kind: 'comment', ref, text: ta.value.trim(), photos: ph.getPhotos() });
    route();
  } }, 'Comentar')));
  return box;
}
const logAction = (ref, text) => D.save({ id: D.uid('c'), kind: 'comment', ref, text, action: true });

// ========== TABLERO ==========
function viewDashboard() {
  const tasks = D.list('task');
  const today = tasks.filter(t => isToday(t.due) || isToday(t.created_at) || (isOverdue(t)));
  const doneToday = today.filter(t => DONE.includes(t.status)).length;
  const pctToday = today.length ? Math.round(doneToday / today.length * 100) : 100;
  const since30 = Date.now() - 30 * 864e5;
  const insp = D.list('inspection', i => new Date(i.created_at) > since30);
  const idx5s = insp.length ? Math.round(insp.reduce((a, i) => a + i.score, 0) / insp.length) : null;
  const ev = openEvents(); const dm = openDamages();
  const stopped = dm.filter(d => d.stopped).length;

  const kpi = (label, val, note, tone, href) => h('a', { class: `card kpi tone-${tone}`, href },
    h('span', { class: 'kpi-label' }, label), h('span', { class: 'kpi-val' }, val), h('span', { class: 'kpi-note' }, note));

  const mine = tasks.filter(t => isMine(t) && !DONE.includes(t.status)).sort((a, b) => (a.due || '').localeCompare(b.due || ''));
  const late = tasks.filter(isOverdue);

  main.append(
    pageHead('Tablero del área', `${new Date().toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' })} · ${currentShiftLabel()}`),
    h('div', { class: 'kpis' },
      kpi('Alertas activas', ev.length, ev.filter(slaBreached).length ? `${ev.filter(slaBreached).length} fuera de tiempo` : `${ev.filter(e => e.severity === 'critica').length} críticas`, ev.length ? 'red' : 'green', '#/alertas'),
      kpi('Daños abiertos', dm.length, `${stopped} equipo${stopped === 1 ? '' : 's'} detenido${stopped === 1 ? '' : 's'}`, stopped ? 'red' : dm.length ? 'orange' : 'green', '#/danos'),
      kpi('Cumplimiento hoy', `${pctToday}%`, `${doneToday} de ${today.length} tareas`, pctToday >= 90 ? 'green' : pctToday >= 70 ? 'orange' : 'red', '#/tareas'),
      kpi('Índice 5S (30 d)', idx5s == null ? '—' : `${idx5s}%`, `${insp.length} inspecciones`, idx5s == null ? 'blue' : idx5s >= 85 ? 'green' : idx5s >= 70 ? 'orange' : 'red', '#/inspecciones')),
    h('div', { class: 'grid2' },
      h('section', {},
        h('h2', { class: 'sec' }, 'Estado por zona'),
        h('div', { class: 'zones' }, zones().filter(z => z.active !== false).map(zoneTile))),
      h('section', {},
        h('h2', { class: 'sec' }, 'Alertas activas'),
        ev.length ? h('div', { class: 'list' }, ev.sort(byNewest).slice(0, 6).map(eventCard)) : empty('Sin alertas activas ✔'),
        h('h2', { class: 'sec' }, isStaff() ? 'Tareas vencidas' : 'Mis tareas pendientes'),
        (() => { const arr = isStaff() ? late : mine; return arr.length ? h('div', { class: 'list' }, arr.slice(0, 6).map(taskCard)) : empty(isStaff() ? 'Sin tareas vencidas ✔' : 'No tiene tareas pendientes ✔'); })())));
}

function currentShiftLabel() {
  const hr = new Date().getHours();
  const s = [...C.SHIFTS].sort((a, b) => b.start - a.start).find(s => hr >= s.start) || C.SHIFTS.find(s => s.id === 'T3');
  return s.label;
}

function zoneTile(z) {
  const ev = openEvents().filter(e => e.zone_id === z.id);
  const dm = openDamages().filter(d => d.zone_id === z.id);
  const tk = D.list('task', t => t.zone_id === z.id && !DONE.includes(t.status));
  const late = tk.filter(isOverdue).length;
  const last = D.list('inspection', i => i.zone_id === z.id).sort(byNewest)[0];
  const tone = ev.some(e => e.severity === 'critica') || dm.some(d => d.stopped) ? 'red' : (ev.length || dm.length || late) ? 'orange' : 'green';
  return h('div', { class: `zone tone-${tone}` },
    h('div', { class: 'zone-head' }, h('b', {}, z.name), last ? h('span', { class: `score ${last.score >= 85 ? 'ok' : last.score >= 70 ? 'mid' : 'bad'}`, title: `Última 5S ${fmtDate(last.created_at)}` }, `${last.score}%`) : null),
    h('div', { class: 'zone-stats' },
      h('span', { title: 'Alertas activas' }, icon('bell', 14), ev.length),
      h('span', { title: 'Daños abiertos' }, icon('wrench', 14), dm.length),
      h('span', { title: 'Tareas pendientes', class: late ? 'late' : '' }, icon('tasks', 14), tk.length, late ? ` (${late} venc.)` : '')));
}

// ========== TAREAS ==========
let taskTab = 'mias';
function viewTasks() {
  const all = D.list('task');
  const sets = {
    mias: all.filter(t => isMine(t) && !DONE.includes(t.status)),
    pendientes: all.filter(t => !DONE.includes(t.status)),
    vencidas: all.filter(isOverdue),
    verificar: all.filter(t => t.status === 'completada'),
    hechas: all.filter(t => DONE.includes(t.status)),
  };
  if (!isStaff() && taskTab === 'verificar') taskTab = 'mias';
  const list = sets[taskTab].sort((a, b) => taskTab === 'hechas' ? (b.done_at || '').localeCompare(a.done_at || '') : (a.due || 'z').localeCompare(b.due || 'z'));
  const catFilter = select('cat', { '': 'Todas las categorías', ...C.TASK_CATEGORIES }, sessionStorage.taskCat || '', { onchange: e => { sessionStorage.taskCat = e.target.value; route(); } });
  const filtered = list.filter(t => !catFilter.value || t.category === catFilter.value).slice(0, 200);
  main.append(
    pageHead('Tareas', 'Limpieza, operación y gestión', isStaff() ? btnLink('#/tarea/nueva', 'Nueva tarea') : null),
    tabs([
      ['mias', 'Mis tareas', sets.mias.length], ['pendientes', 'Pendientes', sets.pendientes.length], ['vencidas', 'Vencidas', sets.vencidas.length],
      ...(isStaff() ? [['verificar', 'Por verificar', sets.verificar.length]] : []), ['hechas', 'Realizadas'],
    ], taskTab, k => { taskTab = k; route(); }),
    h('div', { class: 'filters' }, catFilter),
    filtered.length ? h('div', { class: 'list' }, filtered.map(taskCard)) : empty('No hay tareas en esta vista.'));
}

function viewTask(id) {
  const t = D.get(id);
  if (!t) return main.append(backLink('#/tareas'), empty('Tarea no encontrada (puede estar sincronizándose).'));
  const canWork = isStaff() || isMine(t);
  const locked = t.status === 'verificada' || !canWork;
  main.dataset.form = '1';
  const checks = (t.checklist || []).map(i => ({ ...i }));
  const notes = h('textarea', { rows: 3, placeholder: 'Observaciones del trabajo realizado…', disabled: locked, value: t.notes || '' });
  const photos = photoField(t.evidence || [], { readonly: locked });

  const saveWith = async (patch, msg) => {
    await D.save({ ...t, checklist: checks, notes: notes.value, evidence: photos.getPhotos(), ...patch });
    if (msg) { await logAction(t.id, msg); toast(msg, 'ok'); }
    route();
  };
  const actions = [];
  if (canWork && ['pendiente', 'rechazada'].includes(t.status))
    actions.push(h('button', { class: 'btn', onclick: () => saveWith({ status: 'en_proceso', started_at: new Date().toISOString() }, 'Tarea iniciada') }, 'Iniciar'));
  if (canWork && ['pendiente', 'en_proceso', 'rechazada'].includes(t.status))
    actions.push(h('button', { class: 'btn primary', onclick: async () => {
      if (checks.some(c => !c.done) && !(await confirmDlg('Checklist incompleto', 'Hay puntos sin marcar. ¿Completar de todas formas?', 'Completar'))) return;
      saveWith({ status: 'completada', done_at: new Date().toISOString(), done_by: me().id }, 'Tarea completada');
    } }, icon('check', 18), 'Completar'));
  if (isStaff() && t.status === 'completada') {
    actions.push(h('button', { class: 'btn danger-ghost', onclick: async () => {
      const r = await askText('Rechazar tarea', 'Motivo del rechazo (se notificará al responsable)');
      if (r) saveWith({ status: 'rechazada' }, `Rechazada: ${r}`);
    } }, 'Rechazar'));
    actions.push(h('button', { class: 'btn primary', onclick: () => saveWith({ status: 'verificada', verified_by: me().id, verified_at: new Date().toISOString() }, 'Tarea verificada') }, icon('shield', 18), 'Verificar'));
  }
  if (canWork && !locked) actions.push(h('button', { class: 'btn ghost', onclick: () => saveWith({}, null).then(() => toast('Guardado', 'ok')) }, 'Guardar avance'));

  main.append(
    backLink('#/tareas'),
    pageHead(t.title, null, isStaff() ? h('a', { class: 'btn ghost', href: `#/tarea/${t.id}/editar` }, 'Editar') : null),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' },
        h('dl', { class: 'facts' },
          fact('Estado', statusChip(C.TASK_STATUS, t.status)), fact('Categoría', C.TASK_CATEGORIES[t.category]),
          fact('Zona', zoneName(t.zone_id)), fact('Responsable', assigneeLabel(t)),
          fact('Prioridad', sevChip(t.priority)), fact('Vence', h('span', { class: isOverdue(t) ? 'late' : '' }, fmtDate(t.due))),
          t.plan_id ? fact('Origen', `Programa (${C.FREQUENCIES[D.get(t.plan_id)?.frequency] || 'plan'})`) : null,
          t.done_at ? fact('Completada', `${fmtDate(t.done_at)} · ${D.userName(t.done_by)}`) : null,
          t.verified_at ? fact('Verificada', `${fmtDate(t.verified_at)} · ${D.userName(t.verified_by)}`) : null),
        t.description ? h('p', { class: 'desc' }, t.description) : null,
        checks.length ? h('div', {}, h('h2', {}, 'Checklist'), h('ul', { class: 'checklist' }, checks.map(c => h('li', {},
          h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: !!c.done, disabled: locked, onchange: e => { c.done = e.target.checked; } }), h('span', {}, c.t)))))) : null,
        h('h2', {}, 'Observaciones'), notes,
        h('h2', {}, 'Evidencia fotográfica'), photos,
        h('div', { class: 'actions' }, actions)),
      timeline(t.id)));
}
const fact = (k, v) => h('div', { class: 'fact' }, h('dt', {}, k), h('dd', {}, v ?? '—'));

function askText(title, label) {
  const ta = h('textarea', { rows: 3 });
  return modal(title, field(label, ta), [{ label: 'Cancelar', class: 'ghost', value: () => null }, { label: 'Aceptar', class: 'primary', value: () => ta.value.trim() || false }]);
}

function viewTaskForm(id) {
  if (!isStaff()) return main.append(empty('Solo supervisores crean tareas.'));
  const t = id ? D.get(id) : { category: 'limpieza', priority: 'media', status: 'pendiente', checklist: [] };
  if (!t) return main.append(empty('No encontrada'));
  main.dataset.form = '1';
  const f = {
    title: h('input', { required: true, value: t.title || '', placeholder: 'Ej.: Limpieza de derrame en fosa 2' }),
    category: select('category', C.TASK_CATEGORIES, t.category),
    zone: select('zone', zoneOptions('— Seleccione —'), t.zone_id || ''),
    priority: select('priority', C.PRIORITIES, t.priority),
    due: h('input', { type: 'datetime-local', value: toLocalInput(t.due || new Date(Date.now() + 8 * 36e5).toISOString()) }),
    assignType: select('at', { user: 'A una persona', role: 'A un rol (cualquiera del rol)' }, t.role && !t.assigned_to ? 'role' : 'user'),
    user: select('user', { '': '— Seleccione —', ...userOptions() }, t.assigned_to || ''),
    role: select('role', Object.fromEntries(Object.entries(C.ROLES).map(([k, v]) => [k, v.label])), t.role || 'limpieza'),
    checklist: h('textarea', { rows: 5, value: (t.checklist || []).map(c => c.t).join('\n'), placeholder: 'Un punto por línea' }),
    description: h('textarea', { rows: 3, value: t.description || '' }),
  };
  const who = h('div', {});
  const syncWho = () => who.replaceChildren(f.assignType.value === 'user' ? field('Persona', f.user) : field('Rol', f.role));
  f.assignType.onchange = syncWho; syncWho();

  main.append(backLink(id ? `#/tarea/${id}` : '#/tareas'), pageHead(id ? 'Editar tarea' : 'Nueva tarea'),
    h('form', { class: 'card form', onsubmit: async e => {
      e.preventDefault();
      if (!f.zone.value) return toast('Seleccione la zona', 'error');
      const prev = new Map((t.checklist || []).map(c => [c.t, c.done]));
      const rec = await D.save({ ...t, id: t.id || D.uid('t'), kind: 'task', title: f.title.value.trim(), category: f.category.value, zone_id: f.zone.value,
        priority: f.priority.value, due: fromLocalInput(f.due.value),
        assigned_to: f.assignType.value === 'user' ? (f.user.value || null) : null, role: f.assignType.value === 'role' ? f.role.value : (D.users().find(u => u.id === f.user.value)?.role || null),
        checklist: f.checklist.value.split('\n').map(s => s.trim()).filter(Boolean).map(s => ({ t: s, done: !!prev.get(s) })),
        description: f.description.value.trim() });
      toast(id ? 'Tarea actualizada' : 'Tarea creada', 'ok'); go(`#/tarea/${rec.id}`);
    } },
      field('Título', f.title),
      h('div', { class: 'row3' }, field('Categoría', f.category), field('Zona', f.zone), field('Prioridad', f.priority)),
      h('div', { class: 'row3' }, field('Asignar', f.assignType), who, field('Fecha límite', f.due)),
      field('Checklist', f.checklist, 'Un punto de verificación por línea'),
      field('Descripción / instrucciones', f.description),
      h('div', { class: 'actions' },
        id ? h('button', { type: 'button', class: 'btn danger-ghost', onclick: async () => {
          if (await confirmDlg('Eliminar tarea', '¿Eliminar esta tarea?', 'Eliminar')) { await D.save({ ...t, deleted: true }); go('#/tareas'); }
        } }, 'Eliminar') : null,
        h('button', { class: 'btn primary', type: 'submit' }, 'Guardar'))));
}

// ========== ALERTAS / EVENTOS ==========
// Selección de tipo de evento en dos pasos (tipo → detalle) con envío inmediato.
function startEventReport() {
  const close = () => wrap.remove();
  const body = h('div', { class: 'modal-body' });
  const wrap = h('div', { class: 'modal-wrap', onclick: e => { if (e.target === wrap) close(); } },
    h('div', { class: 'modal modal-alert', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-head hazard' }, h('h3', {}, 'Reportar alerta'), h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: close }, icon('x'))), body));
  const step1 = () => body.replaceChildren(h('p', { class: 'muted' }, 'Seleccione el tipo de evento:'), h('div', { class: 'ev-grid' }, Object.entries(C.EVENT_TYPES).map(([k, v]) =>
    h('button', { class: `ev-pick ev-${v.sev}`, onclick: () => step2(k) }, h('span', { class: 'ev-pick-i' }, v.icon), h('span', {}, v.label)))));
  const step2 = (type) => {
    const T = C.EVENT_TYPES[type];
    const sev = segmented('sev', Object.fromEntries(Object.entries(C.SEVERITY).map(([k, v]) => [k, v.label])), T.sev);
    const zone = select('zone', zoneOptions('— Zona —'), sessionStorage.lastZone || '');
    const desc = h('textarea', { rows: 3, placeholder: '¿Qué ocurre? ¿Hay personas en riesgo? ¿Qué se hizo?' });
    const photos = photoField([], { max: 3 });
    body.replaceChildren(
      h('div', { class: 'ev-sel' }, h('span', { class: 'ev-pick-i' }, T.icon), h('b', {}, T.label), h('button', { class: 'link', onclick: step1 }, 'cambiar')),
      field('Severidad', sev), field('Zona', zone), field('Descripción', desc), field('Fotos (opcional)', photos),
      h('button', { class: 'btn primary big alert-send', onclick: async () => {
        if (!zone.value) return toast('Seleccione la zona', 'error');
        sessionStorage.lastZone = zone.value;
        const rec = await D.save({ id: D.uid('e'), kind: 'event', type, severity: sev.value, zone_id: zone.value, description: desc.value.trim(), photos: photos.getPhotos(), status: 'abierta' });
        seen.add(rec.id); saveSeen();
        close();
        toast(navigator.onLine ? 'Alerta enviada al equipo' : 'Sin conexión: la alerta se enviará automáticamente al recuperar señal', navigator.onLine ? 'ok' : 'warn', 6000);
        go(`#/alerta/${rec.id}`);
      } }, icon('alert', 20), 'ENVIAR ALERTA'));
  };
  step1();
  document.body.append(wrap);
}

let evTab = 'activas';
function viewEvents() {
  const all = D.list('event').sort(byNewest);
  const sets = { activas: all.filter(e => e.status !== 'cerrada'), cerradas: all.filter(e => e.status === 'cerrada') };
  main.append(
    pageHead('Alertas y eventos', `Tiempo máx. de respuesta: crítica ${C.SLA_MIN.critica} min · alta ${C.SLA_MIN.alta} min · media ${C.SLA_MIN.media / 60} h`,
      h('button', { class: 'btn danger', onclick: startEventReport }, icon('alert', 18), 'Reportar')),
    tabs([['activas', 'Activas', sets.activas.length], ['cerradas', 'Cerradas']], evTab, k => { evTab = k; route(); }),
    sets[evTab].length ? h('div', { class: 'list' }, sets[evTab].slice(0, 200).map(eventCard)) : empty(evTab === 'activas' ? 'Sin alertas activas ✔' : 'Sin registros.'));
}

function viewEvent(id) {
  const e = D.get(id);
  if (!e) return main.append(backLink('#/alertas'), empty('Alerta no encontrada.'));
  const T = C.EVENT_TYPES[e.type] || C.EVENT_TYPES.otro;
  const sla = C.SLA_MIN[e.severity] ?? 60;
  const respMin = e.ack_at ? Math.round((new Date(e.ack_at) - new Date(e.created_at)) / 60e3) : null;
  const actions = [];
  if (e.status === 'abierta') actions.push(h('button', { class: 'btn primary big', onclick: async () => {
    const note = await askText('Atender alerta', '¿Qué acción inmediata toma? (opcional)');
    if (note === null) return;
    await D.save({ ...e, status: 'atendida', ack_by: me().id, ack_at: new Date().toISOString(), ack_note: note || '' });
    await logAction(e.id, `Alerta atendida${note ? ': ' + note : ''}`); toast('Alerta en atención', 'ok'); route();
  } }, 'ATENDER / EN CAMINO'));
  if (isStaff() && e.status !== 'cerrada') actions.push(h('button', { class: 'btn', onclick: async () => {
    const r = await askText('Cerrar alerta', 'Acciones tomadas y causa (obligatorio)');
    if (!r) return;
    await D.save({ ...e, status: 'cerrada', closed_by: me().id, closed_at: new Date().toISOString(), resolution: r, ack_by: e.ack_by || me().id, ack_at: e.ack_at || new Date().toISOString() });
    await logAction(e.id, `Cerrada: ${r}`); toast('Alerta cerrada', 'ok'); route();
  } }, 'Cerrar alerta'));
  if (canMaint() && e.status !== 'cerrada') actions.push(h('button', { class: 'btn ghost', onclick: () => {
    sessionStorage.damageFrom = JSON.stringify({ zone_id: e.zone_id, description: `${T.label}: ${e.description || ''}`, ref_event: e.id, severity: e.severity });
    go('#/dano/nuevo');
  } }, icon('wrench', 16), 'Generar reporte de daño'));

  main.append(backLink('#/alertas'),
    h('div', { class: `ev-hero ev-${e.severity}` }, h('span', { class: 'ev-hero-i' }, T.icon),
      h('div', {}, h('h1', {}, T.label), h('p', {}, zoneName(e.zone_id), ' · ', fmtDate(e.created_at), ' · ', ago(e.created_at))),
      h('div', { class: 'ev-hero-side' }, sevChip(e.severity), statusChip(C.EVENT_STATUS, e.status), pendingMark(e))),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' },
        h('dl', { class: 'facts' },
          fact('Reportado por', D.userName(e.created_by)),
          fact('Tiempo objetivo', `${sla} min`),
          fact('Respuesta', e.ack_at ? h('span', { class: respMin > sla ? 'late' : 'ok' }, `${respMin} min · ${D.userName(e.ack_by)}`) : h('span', { class: slaBreached(e) ? 'late' : '' }, `Sin atender (${Math.round(elapsedMin(e.created_at))} min)`)),
          e.synced_at && e.created_at ? fact('Recibido en servidor', `${fmtDate(e.synced_at)}${(new Date(e.synced_at) - new Date(e.created_at)) > 120e3 ? ' (reportado sin conexión)' : ''}`) : null,
          e.closed_at ? fact('Cerrada', `${fmtDate(e.closed_at)} · ${D.userName(e.closed_by)}`) : null),
        e.description ? h('p', { class: 'desc' }, e.description) : null,
        e.resolution ? h('div', { class: 'note-ok' }, h('b', {}, 'Resolución: '), e.resolution) : null,
        e.photos?.length ? photoField(e.photos, { readonly: true }) : null,
        h('div', { class: 'actions' }, actions)),
      timeline(e.id)));
}

// ========== DAÑOS DE EQUIPOS ==========
let dmTab = 'abiertos';
function viewDamages() {
  const all = D.list('damage').sort(byNewest);
  const sets = {
    abiertos: all.filter(d => !['resuelto', 'cerrado'].includes(d.status)),
    mios: all.filter(d => d.assigned_to === me().id && !['resuelto', 'cerrado'].includes(d.status)),
    resueltos: all.filter(d => d.status === 'resuelto'),
    cerrados: all.filter(d => d.status === 'cerrado'),
  };
  main.append(pageHead('Daños de equipos', 'Reporte y seguimiento hasta la reparación', btnLink('#/dano/nuevo', 'Reportar daño')),
    tabs([['abiertos', 'Abiertos', sets.abiertos.length], ...(me().role === 'mantenimiento' ? [['mios', 'Asignados a mí', sets.mios.length]] : []), ['resueltos', 'Por cerrar', sets.resueltos.length], ['cerrados', 'Cerrados']], dmTab, k => { dmTab = k; route(); }),
    sets[dmTab].length ? h('div', { class: 'list' }, sets[dmTab].slice(0, 200).map(damageCard)) : empty('Sin reportes en esta vista.'));
}

function viewDamageForm() {
  main.dataset.form = '1';
  const pre = JSON.parse(sessionStorage.damageFrom || '{}'); delete sessionStorage.damageFrom;
  const zone = select('zone', zoneOptions('— Seleccione —'), pre.zone_id || sessionStorage.lastZone || '');
  const dl = h('datalist', { id: 'eqList' });
  const fillEq = () => dl.replaceChildren(...(D.get(zone.value)?.equipment || []).map(e => h('option', { value: e })));
  zone.onchange = fillEq; fillEq();
  const equipment = h('input', { list: 'eqList', required: true, placeholder: 'Ej.: Elevador 2 – cabeza' });
  const type = select('type', C.DAMAGE_TYPES, 'mecanico');
  const sev = segmented('sev', Object.fromEntries(Object.entries(C.SEVERITY).map(([k, v]) => [k, v.label])), pre.severity || 'media');
  const stopped = segmented('stopped', { no: 'Opera normal', si: 'EQUIPO DETENIDO' }, 'no');
  const desc = h('textarea', { rows: 4, required: true, value: pre.description || '', placeholder: 'Describa la falla: síntomas, ruidos, fugas, desde cuándo…' });
  const photos = photoField([], { max: 4 });
  main.append(backLink('#/danos'), pageHead('Reportar daño de equipo'),
    h('form', { class: 'card form', onsubmit: async ev => {
      ev.preventDefault();
      if (!zone.value) return toast('Seleccione la zona', 'error');
      sessionStorage.lastZone = zone.value;
      const rec = await D.save({ id: D.uid('d'), kind: 'damage', zone_id: zone.value, equipment: equipment.value.trim(), type: type.value, severity: sev.value,
        stopped: stopped.value === 'si', description: desc.value.trim(), photos: photos.getPhotos(), status: 'reportado', ref_event: pre.ref_event || null });
      toast('Daño reportado', 'ok'); go(`#/dano/${rec.id}`);
    } },
      h('div', { class: 'row2' }, field('Zona', zone), field('Equipo', h('div', {}, equipment, dl))),
      h('div', { class: 'row2' }, field('Tipo de falla', type), field('Condición del equipo', stopped)),
      field('Severidad', sev),
      field('Descripción', desc),
      field('Fotos', photos, 'Tome fotos de la falla y de la placa del equipo'),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary big', type: 'submit' }, 'Enviar reporte'))));
}

function viewDamage(id) {
  const d = D.get(id);
  if (!d) return main.append(backLink('#/danos'), empty('Reporte no encontrado.'));
  const steps = Object.keys(C.DAMAGE_STATUS);
  const idx = steps.indexOf(d.status);
  const actions = [];
  const move = async (status, msg, extra = {}) => { await D.save({ ...d, status, ...extra }); await logAction(d.id, msg); toast(msg, 'ok'); route(); };
  if (canMaint()) {
    if (d.status === 'reportado') actions.push(h('button', { class: 'btn', onclick: () => move('en_revision', 'En revisión por mantenimiento', { assigned_to: d.assigned_to || me().id }) }, 'Tomar / Revisar'));
    if (['reportado', 'en_revision'].includes(d.status)) actions.push(h('button', { class: 'btn', onclick: () => move('en_reparacion', 'Reparación iniciada', { assigned_to: d.assigned_to || me().id }) }, 'Iniciar reparación'));
    if (['en_revision', 'en_reparacion'].includes(d.status)) actions.push(h('button', { class: 'btn primary', onclick: async () => {
      const r = await askText('Daño resuelto', 'Trabajo realizado / repuestos utilizados'); if (!r) return;
      move('resuelto', `Resuelto: ${r}`, { stopped: false, resolved_at: new Date().toISOString(), resolved_by: me().id, work_done: r });
    } }, icon('check', 18), 'Marcar resuelto'));
  }
  if (isStaff() && d.status === 'resuelto') actions.push(h('button', { class: 'btn primary', onclick: () => move('cerrado', 'Reporte cerrado y verificado', { closed_at: new Date().toISOString(), closed_by: me().id }) }, 'Verificar y cerrar'));
  if (isStaff() && d.status !== 'cerrado') {
    const sel = select('as', { '': '— Asignar técnico —', ...userOptions(u => ['mantenimiento', 'supervisor', 'admin'].includes(u.role)) }, d.assigned_to || '',
      { onchange: async e => { await D.save({ ...d, assigned_to: e.target.value || null }); await logAction(d.id, `Asignado a ${D.userName(e.target.value)}`); route(); } });
    actions.unshift(sel);
  }

  main.append(backLink('#/danos'),
    pageHead(d.equipment, `${zoneName(d.zone_id)} · ${C.DAMAGE_TYPES[d.type] || d.type}`, sevChip(d.severity), d.stopped ? h('span', { class: 'chip chip-red stop' }, 'EQUIPO DETENIDO') : null, pendingMark(d)),
    h('ol', { class: 'stepper' }, steps.map((s, i) => h('li', { class: i < idx ? 'done' : i === idx ? 'cur' : '' }, C.DAMAGE_STATUS[s]))),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' },
        h('dl', { class: 'facts' },
          fact('Reportado por', `${D.userName(d.created_by)} · ${fmtDate(d.created_at)}`),
          fact('Técnico asignado', d.assigned_to ? D.userName(d.assigned_to) : 'Sin asignar'),
          d.resolved_at ? fact('Resuelto', `${fmtDate(d.resolved_at)} · ${D.userName(d.resolved_by)}`) : null,
          d.resolved_at ? fact('Tiempo de atención', `${Math.round((new Date(d.resolved_at) - new Date(d.created_at)) / 36e5 * 10) / 10} h`) : null,
          d.ref_event ? fact('Alerta origen', h('a', { href: `#/alerta/${d.ref_event}` }, 'Ver alerta')) : null),
        h('p', { class: 'desc' }, d.description),
        d.work_done ? h('div', { class: 'note-ok' }, h('b', {}, 'Trabajo realizado: '), d.work_done) : null,
        d.photos?.length ? photoField(d.photos, { readonly: true }) : null,
        h('div', { class: 'actions' }, actions)),
      timeline(d.id)));
}

// ========== INSPECCIONES 5S ==========
function viewInspections() {
  const all = D.list('inspection').sort(byNewest);
  main.append(pageHead('Inspecciones 5S', 'Orden y limpieza por zona', isStaff() ? btnLink('#/inspeccion/nueva', 'Nueva inspección') : null),
    all.length ? h('div', { class: 'list' }, all.slice(0, 200).map(i => h('a', { class: 'card row-card', href: `#/inspeccion/${i.id}` },
      h('div', { class: `score big ${i.score >= 85 ? 'ok' : i.score >= 70 ? 'mid' : 'bad'}` }, `${i.score}%`),
      h('div', { class: 'rc-main' }, h('div', { class: 'rc-title' }, zoneName(i.zone_id)),
        h('div', { class: 'rc-meta' }, h('span', {}, fmtDate(i.created_at)), h('span', {}, D.userName(i.created_by)), h('span', {}, `${i.answers.filter(a => a.v === 0).length} no conformes`))),
      h('div', { class: 'rc-side' }, pendingMark(i))))) : empty('Aún no hay inspecciones registradas.'));
}

function viewInspectionForm() {
  if (!isStaff()) return main.append(empty('Solo supervisores registran inspecciones.'));
  main.dataset.form = '1';
  const zone = select('zone', zoneOptions('— Seleccione la zona —'), '');
  const answers = [];
  const scoreEl = h('div', { class: 'score big' }, '—');
  const recalc = () => {
    const vals = answers.filter(a => a.v != null);
    const pct = vals.length ? Math.round(vals.reduce((s, a) => s + a.v, 0) / (vals.length * 2) * 100) : null;
    scoreEl.textContent = pct == null ? '—' : `${pct}%`;
    scoreEl.className = `score big ${pct == null ? '' : pct >= 85 ? 'ok' : pct >= 70 ? 'mid' : 'bad'}`;
    return pct;
  };
  const blocks = C.CHECKLIST_5S.map(g => h('fieldset', { class: 'card s-block' }, h('legend', {}, g.s), g.items.map(item => {
    const a = { s: g.s, item, v: null }; answers.push(a);
    return h('div', { class: 's-item' }, h('span', {}, item), segmented(item, { 2: 'Cumple', 1: 'Parcial', 0: 'No cumple' }, null, v => { a.v = Number(v); recalc(); }));
  })));
  const obs = h('textarea', { rows: 3, placeholder: 'Hallazgos principales, felicitaciones, compromisos…' });
  const photos = photoField([], { max: 4 });
  const genTasks = h('input', { type: 'checkbox', checked: true });

  main.append(backLink('#/inspecciones'), pageHead('Nueva inspección 5S', 'Califique cada punto en campo'),
    h('div', { class: 'insp-top card' }, field('Zona', zone), h('div', { class: 'insp-score' }, h('small', {}, 'Puntaje'), scoreEl)),
    ...blocks,
    h('section', { class: 'card form' },
      field('Observaciones', obs), field('Fotos', photos),
      h('label', { class: 'check' }, genTasks, h('span', {}, 'Generar tareas correctivas para los puntos "No cumple" (asignadas al rol Limpieza, plazo 8 h)')),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary big', onclick: async () => {
        if (!zone.value) return toast('Seleccione la zona', 'error');
        if (answers.some(a => a.v == null)) return toast('Califique todos los puntos', 'error');
        const score = recalc();
        const insp = await D.save({ id: D.uid('i'), kind: 'inspection', zone_id: zone.value, answers, score, observations: obs.value.trim(), photos: photos.getPhotos() });
        if (genTasks.checked) {
          for (const a of answers.filter(a => a.v === 0)) {
            await D.save({ id: D.uid('t'), kind: 'task', category: 'limpieza', title: `Corrección 5S: ${a.item}`, zone_id: zone.value, role: 'limpieza', assigned_to: null,
              priority: 'alta', status: 'pendiente', due: new Date(Date.now() + 8 * 36e5).toISOString(), checklist: [{ t: a.item, done: false }], ref_inspection: insp.id,
              description: `Generada por inspección 5S (${a.s}). ${obs.value.trim()}` });
          }
        }
        toast(`Inspección guardada: ${score}%`, 'ok'); go(`#/inspeccion/${insp.id}`);
      } }, 'Guardar inspección'))));
}

function viewInspection(id) {
  const i = D.get(id);
  if (!i) return main.append(backLink('#/inspecciones'), empty('No encontrada.'));
  const corr = D.list('task', t => t.ref_inspection === i.id);
  const label = { 2: 'Cumple', 1: 'Parcial', 0: 'No cumple' };
  main.append(backLink('#/inspecciones'),
    pageHead(`5S · ${zoneName(i.zone_id)}`, `${fmtDate(i.created_at)} · ${D.userName(i.created_by)}`, h('div', { class: `score big ${i.score >= 85 ? 'ok' : i.score >= 70 ? 'mid' : 'bad'}` }, `${i.score}%`)),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' }, h('table', { class: 'tbl' }, h('tbody', {}, i.answers.map(a => h('tr', {},
        h('td', { class: 'muted' }, a.s.split(' ')[0]), h('td', {}, a.item), h('td', {}, h('span', { class: `chip v${a.v}` }, label[a.v])))))),
        i.observations ? h('p', { class: 'desc' }, i.observations) : null,
        i.photos?.length ? photoField(i.photos, { readonly: true }) : null),
      h('section', {}, h('h2', { class: 'sec' }, 'Tareas correctivas'), corr.length ? h('div', { class: 'list' }, corr.map(taskCard)) : empty('Sin tareas correctivas.'))));
}

// ========== PROGRAMA DE LIMPIEZA ==========
function viewPlan() {
  if (!isStaff()) return main.append(empty('Acceso solo para supervisores.'));
  const plans = D.list('plan');
  main.append(pageHead('Programa de limpieza', 'Las tareas se generan automáticamente en cada período', btnLink('#/plan/nuevo', 'Nueva actividad'), btnLink('#/zona/nueva', 'Nueva zona', 'ghost')),
    zones().map(z => {
      const ps = plans.filter(p => p.zone_id === z.id);
      return h('section', { class: 'card plan-zone' },
        h('div', { class: 'plan-zone-head' }, h('h2', {}, z.name, z.active === false ? ' (inactiva)' : ''), h('a', { class: 'link', href: `#/zona/${z.id}` }, 'Editar zona')),
        ps.length ? h('table', { class: 'tbl' }, h('tbody', {}, ps.map(p => h('tr', { class: p.active === false ? 'off' : '' },
          h('td', {}, h('a', { href: `#/plan/${p.id}` }, p.title)), h('td', {}, C.FREQUENCIES[p.frequency]),
          h('td', {}, p.assigned_to ? D.userName(p.assigned_to) : C.ROLES[p.role]?.label), h('td', {}, p.active === false ? 'Pausada' : 'Activa'))))) : h('p', { class: 'muted' }, 'Sin actividades programadas.'));
    }));
}

function viewPlanForm(id) {
  if (!isStaff()) return main.append(empty('Acceso solo para supervisores.'));
  const p = id === 'nuevo' ? { frequency: 'diario', role: 'limpieza', category: 'limpieza', active: true, checklist: [] } : D.get(id);
  if (!p) return main.append(empty('No encontrada'));
  main.dataset.form = '1';
  const f = {
    title: h('input', { required: true, value: p.title || '' }),
    zone: select('zone', zoneOptions('— Seleccione —'), p.zone_id || ''),
    frequency: select('freq', C.FREQUENCIES, p.frequency),
    category: select('cat', C.TASK_CATEGORIES, p.category || 'limpieza'),
    role: select('role', Object.fromEntries(Object.entries(C.ROLES).map(([k, v]) => [k, v.label])), p.role),
    user: select('user', { '': '— Cualquiera del rol —', ...userOptions() }, p.assigned_to || ''),
    priority: select('prio', C.PRIORITIES, p.priority || 'media'),
    checklist: h('textarea', { rows: 5, value: (p.checklist || []).join('\n') }),
    active: h('input', { type: 'checkbox', checked: p.active !== false }),
  };
  main.append(backLink('#/plan'), pageHead(p.id ? 'Editar actividad' : 'Nueva actividad programada'),
    h('form', { class: 'card form', onsubmit: async e => {
      e.preventDefault();
      if (!f.zone.value) return toast('Seleccione la zona', 'error');
      await D.save({ ...p, id: p.id || D.uid('p'), kind: 'plan', title: f.title.value.trim(), zone_id: f.zone.value, frequency: f.frequency.value, category: f.category.value,
        role: f.role.value, assigned_to: f.user.value || null, priority: f.priority.value, active: f.active.checked,
        checklist: f.checklist.value.split('\n').map(s => s.trim()).filter(Boolean) });
      toast('Programa actualizado. Las tareas se generarán en el próximo ciclo del servidor.', 'ok'); go('#/plan');
    } },
      field('Actividad', f.title),
      h('div', { class: 'row3' }, field('Zona', f.zone), field('Frecuencia', f.frequency), field('Categoría', f.category)),
      h('div', { class: 'row3' }, field('Rol responsable', f.role), field('Persona fija (opcional)', f.user), field('Prioridad', f.priority)),
      field('Checklist', f.checklist, 'Un punto por línea'),
      h('label', { class: 'check' }, f.active, h('span', {}, 'Actividad activa')),
      h('div', { class: 'actions' },
        p.id ? h('button', { type: 'button', class: 'btn danger-ghost', onclick: async () => {
          if (await confirmDlg('Eliminar actividad', 'Las tareas ya generadas se mantienen.', 'Eliminar')) { await D.save({ ...p, deleted: true }); go('#/plan'); }
        } }, 'Eliminar') : null,
        h('button', { class: 'btn primary', type: 'submit' }, 'Guardar'))));
}

function viewZoneForm(id) {
  if (!isStaff()) return main.append(empty('Acceso solo para supervisores.'));
  const z = id === 'nueva' ? { active: true, equipment: [] } : D.get(id);
  if (!z) return main.append(empty('No encontrada'));
  main.dataset.form = '1';
  const name = h('input', { required: true, value: z.name || '' });
  const eq = h('textarea', { rows: 6, value: (z.equipment || []).join('\n') });
  const active = h('input', { type: 'checkbox', checked: z.active !== false });
  main.append(backLink('#/plan'), pageHead(z.id ? 'Editar zona' : 'Nueva zona'),
    h('form', { class: 'card form', onsubmit: async e => {
      e.preventDefault();
      await D.save({ ...z, id: z.id || D.uid('z'), kind: 'zone', name: name.value.trim(), equipment: eq.value.split('\n').map(s => s.trim()).filter(Boolean), active: active.checked });
      toast('Zona guardada', 'ok'); go('#/plan');
    } }, field('Nombre', name), field('Equipos de la zona', eq, 'Uno por línea (se sugieren al reportar daños)'),
      h('label', { class: 'check' }, active, h('span', {}, 'Zona activa')),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'submit' }, 'Guardar'))));
}

// ========== REPORTES ==========
function viewReports() {
  if (!isStaff()) return main.append(empty('Acceso solo para supervisores.'));
  main.dataset.form = '1';
  const from = h('input', { type: 'date', value: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10) });
  const to = h('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const out = h('div', {});
  const inRange = r => { const t = new Date(r.created_at); return t >= new Date(from.value + 'T00:00') && t <= new Date(to.value + 'T23:59:59'); };
  const render = () => {
    const tasks = D.list('task', inRange), ev = D.list('event', inRange), dm = D.list('damage', inRange), insp = D.list('inspection', inRange);
    const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : '—';
    const acked = ev.filter(e => e.ack_at);
    const onTime = acked.filter(e => (new Date(e.ack_at) - new Date(e.created_at)) / 60e3 <= (C.SLA_MIN[e.severity] ?? 60));
    const resolved = dm.filter(d => d.resolved_at);
    const mttr = resolved.length ? (resolved.reduce((s, d) => s + (new Date(d.resolved_at) - new Date(d.created_at)), 0) / resolved.length / 36e5).toFixed(1) + ' h' : '—';
    out.replaceChildren(
      h('div', { class: 'kpis' },
        h('div', { class: 'card kpi' }, h('span', { class: 'kpi-label' }, 'Cumplimiento de tareas'), h('span', { class: 'kpi-val' }, pct(tasks.filter(t => DONE.includes(t.status)).length, tasks.length)), h('span', { class: 'kpi-note' }, `${tasks.length} tareas`)),
        h('div', { class: 'card kpi' }, h('span', { class: 'kpi-label' }, 'Índice 5S promedio'), h('span', { class: 'kpi-val' }, insp.length ? `${Math.round(insp.reduce((s, i) => s + i.score, 0) / insp.length)}%` : '—'), h('span', { class: 'kpi-note' }, `${insp.length} inspecciones`)),
        h('div', { class: 'card kpi' }, h('span', { class: 'kpi-label' }, 'Alertas atendidas a tiempo'), h('span', { class: 'kpi-val' }, pct(onTime.length, ev.length)), h('span', { class: 'kpi-note' }, `${ev.length} alertas`)),
        h('div', { class: 'card kpi' }, h('span', { class: 'kpi-label' }, 'Tiempo medio de reparación'), h('span', { class: 'kpi-val' }, mttr), h('span', { class: 'kpi-note' }, `${dm.length} daños · ${resolved.length} resueltos`))),
      h('section', { class: 'card' }, h('h2', {}, 'Resumen por zona'),
        h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
          h('thead', {}, h('tr', {}, ['Zona', 'Tareas', 'Cumpl.', 'Vencidas', '5S prom.', 'Alertas', 'Daños'].map(x => h('th', {}, x)))),
          h('tbody', {}, zones().map(z => {
            const tz = tasks.filter(t => t.zone_id === z.id), iz = insp.filter(i => i.zone_id === z.id);
            return h('tr', {}, h('td', {}, z.name), h('td', {}, tz.length), h('td', {}, pct(tz.filter(t => DONE.includes(t.status)).length, tz.length)),
              h('td', {}, tz.filter(isOverdue).length), h('td', {}, iz.length ? `${Math.round(iz.reduce((s, i) => s + i.score, 0) / iz.length)}%` : '—'),
              h('td', {}, ev.filter(e => e.zone_id === z.id).length), h('td', {}, dm.filter(d => d.zone_id === z.id).length));
          }))))),
      h('section', { class: 'card' }, h('h2', {}, 'Exportar a Excel (CSV)'), h('div', { class: 'actions left' },
        h('button', { class: 'btn', onclick: () => downloadCsv('tareas.csv', [['Fecha', 'Tarea', 'Categoría', 'Zona', 'Responsable', 'Estado', 'Vence', 'Completada', 'Por'],
          ...tasks.map(t => [fmtDate(t.created_at), t.title, C.TASK_CATEGORIES[t.category], zoneName(t.zone_id), assigneeLabel(t), C.TASK_STATUS[t.status], fmtDate(t.due), fmtDate(t.done_at), D.userName(t.done_by)])]) }, icon('download', 16), 'Tareas'),
        h('button', { class: 'btn', onclick: () => downloadCsv('alertas.csv', [['Fecha', 'Tipo', 'Severidad', 'Zona', 'Reportó', 'Estado', 'Min. respuesta', 'Atendió', 'Resolución'],
          ...ev.map(e => [fmtDate(e.created_at), C.EVENT_TYPES[e.type]?.label, e.severity, zoneName(e.zone_id), D.userName(e.created_by), C.EVENT_STATUS[e.status], e.ack_at ? Math.round((new Date(e.ack_at) - new Date(e.created_at)) / 60e3) : '', D.userName(e.ack_by), e.resolution])]) }, icon('download', 16), 'Alertas'),
        h('button', { class: 'btn', onclick: () => downloadCsv('danos.csv', [['Fecha', 'Equipo', 'Zona', 'Tipo', 'Severidad', 'Detenido', 'Estado', 'Técnico', 'Trabajo realizado', 'Resuelto'],
          ...dm.map(d => [fmtDate(d.created_at), d.equipment, zoneName(d.zone_id), C.DAMAGE_TYPES[d.type], d.severity, d.stopped ? 'Sí' : 'No', C.DAMAGE_STATUS[d.status], D.userName(d.assigned_to), d.work_done, fmtDate(d.resolved_at)])]) }, icon('download', 16), 'Daños'),
        h('button', { class: 'btn', onclick: () => downloadCsv('inspecciones_5s.csv', [['Fecha', 'Zona', 'Inspector', 'Puntaje', 'No conformes', 'Observaciones'],
          ...insp.map(i => [fmtDate(i.created_at), zoneName(i.zone_id), D.userName(i.created_by), i.score, i.answers.filter(a => a.v === 0).map(a => a.item).join(' | '), i.observations])]) }, icon('download', 16), 'Inspecciones 5S'),
        h('button', { class: 'btn ghost', onclick: () => window.print() }, 'Imprimir'))));
  };
  from.onchange = to.onchange = render;
  main.append(pageHead('Reportes e indicadores'), h('div', { class: 'card filters' }, field('Desde', from), field('Hasta', to)), out);
  render();
}

// ========== USUARIOS ==========
function viewUsers() {
  if (!isAdmin()) return main.append(empty('Acceso solo para el administrador.'));
  const us = D.users().sort((a, b) => a.name.localeCompare(b.name, 'es'));
  main.append(pageHead('Usuarios y roles', 'Requiere conexión para crear o modificar', h('button', { class: 'btn primary', onclick: () => editUser() }, icon('plus', 18), 'Nuevo usuario')),
    h('section', { class: 'card' }, h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['Nombre', 'Usuario', 'Rol', 'Estado', ''].map(x => h('th', {}, x)))),
      h('tbody', {}, us.map(u => h('tr', { class: u.active ? '' : 'off' }, h('td', {}, u.name), h('td', {}, u.username), h('td', {}, C.ROLES[u.role]?.label),
        h('td', {}, u.active ? 'Activo' : 'Inactivo'), h('td', {}, h('button', { class: 'btn small ghost', onclick: () => editUser(u) }, 'Editar')))))))),
    h('section', { class: 'card' }, h('h2', {}, 'Permisos por rol'), h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, ['Acción', 'Admin', 'Supervisor', 'Mantenim.', 'Operador', 'Limpieza'].map(x => h('th', {}, x)))),
      h('tbody', {}, [
        ['Reportar alertas y daños', 1, 1, 1, 1, 1], ['Atender alertas', 1, 1, 1, 1, 1], ['Ejecutar tareas asignadas', 1, 1, 1, 1, 1],
        ['Gestionar reparaciones', 1, 1, 1, 0, 0], ['Crear/verificar tareas', 1, 1, 0, 0, 0], ['Inspecciones 5S', 1, 1, 0, 0, 0],
        ['Cerrar alertas', 1, 1, 0, 0, 0], ['Programa, zonas y reportes', 1, 1, 0, 0, 0], ['Usuarios', 1, 0, 0, 0, 0],
      ].map(([a, ...v]) => h('tr', {}, h('td', {}, a), v.map(x => h('td', { class: x ? 'ok' : 'muted' }, x ? '✔' : '—')))))))));
}

async function editUser(u = { role: 'operador', active: true }) {
  const f = {
    name: h('input', { value: u.name || '' }), username: h('input', { value: u.username || '', autocapitalize: 'none' }),
    role: select('role', Object.fromEntries(Object.entries(C.ROLES).map(([k, v]) => [k, v.label])), u.role),
    password: h('input', { type: 'password', autocomplete: 'new-password', placeholder: u.id ? 'Dejar vacío para no cambiar' : 'Mínimo 6 caracteres' }),
    active: h('input', { type: 'checkbox', checked: u.active !== false }),
  };
  await modal(u.id ? 'Editar usuario' : 'Nuevo usuario', h('div', { class: 'form' }, field('Nombre completo', f.name), field('Usuario', f.username), field('Rol', f.role), field('Contraseña', f.password),
    h('label', { class: 'check' }, f.active, h('span', {}, 'Activo'))), [
    { label: 'Cancelar', class: 'ghost', value: () => null },
    { label: 'Guardar', class: 'primary', value: async () => {
      try {
        await D.api('/api/users', { id: u.id, name: f.name.value, username: f.username.value, role: f.role.value, password: f.password.value || undefined, active: f.active.checked });
        await D.sync(); toast('Usuario guardado', 'ok'); route(); return true;
      } catch (e) { toast(e.status ? e.message : 'Se requiere conexión con el servidor', 'error'); return false; }
    } }]);
}

// ========== PERFIL ==========
async function viewProfile() {
  const u = me();
  const n = await D.pendingCount();
  const st = D.syncState();
  const cur = h('input', { type: 'password', autocomplete: 'current-password' }), nxt = h('input', { type: 'password', autocomplete: 'new-password' });
  main.append(pageHead('Mi perfil'),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' }, h('dl', { class: 'facts' }, fact('Nombre', u.name), fact('Usuario', u.username), fact('Rol', C.ROLES[u.role]?.label)),
        h('div', { class: 'actions left' },
          h('button', { class: 'btn', onclick: async () => {
            if (!('Notification' in window)) return toast('Este navegador no soporta notificaciones', 'warn');
            const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Notificaciones activadas' : 'Permiso denegado', p === 'granted' ? 'ok' : 'warn'); beep(1);
          } }, icon('bell', 16), 'Activar notificaciones'),
          h('button', { class: 'btn', onclick: () => { const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = t; localStorage.setItem('silos.theme', t); } }, icon('sun', 16), 'Tema claro / oscuro'),
          h('button', { class: 'btn danger-ghost', onclick: async () => {
            if (n && !(await confirmDlg('Datos sin subir', `Hay ${n} registros sin subir. Se subirán cuando vuelva a ingresar en este dispositivo. ¿Cerrar sesión?`, 'Cerrar sesión'))) return;
            await D.logout();
          } }, icon('logout', 16), 'Cerrar sesión'))),
      h('section', { class: 'card' }, h('h2', {}, 'Sincronización'),
        h('dl', { class: 'facts' }, fact('Conexión', st.online ? 'En línea' : 'Sin conexión'), fact('Registros por subir', n), fact('Última sincronización', st.lastSyncOk ? st.lastSyncOk.toLocaleString('es-EC') : '—'), st.lastError ? fact('Último error', st.lastError) : null),
        h('div', { class: 'actions left' }, h('button', { class: 'btn', onclick: async () => { await D.sync(); toast('Sincronización completa', 'ok'); route(); } }, icon('sync', 16), 'Sincronizar ahora'))),
      h('section', { class: 'card form' }, h('h2', {}, 'Cambiar contraseña'), field('Actual', cur), field('Nueva', nxt),
        h('div', { class: 'actions left' }, h('button', { class: 'btn', onclick: async () => {
          try { await D.api('/api/password', { current: cur.value, next: nxt.value }); toast('Contraseña actualizada. Vuelva a ingresar en línea en sus otros dispositivos.', 'ok'); cur.value = nxt.value = ''; }
          catch (e) { toast(e.status ? e.message : 'Requiere conexión', 'error'); }
        } }, 'Actualizar')))));
}

// ========== LOGIN ==========
async function renderLogin() {
  shell = null; main = null;
  const user = h('input', { autocomplete: 'username', autocapitalize: 'none', required: true, placeholder: 'usuario' });
  const pass = h('input', { type: 'password', autocomplete: 'current-password', required: true, placeholder: '••••••' });
  const server = h('input', { value: localStorage.getItem('silos.server') || '', placeholder: 'https://silos.miempresa.com (vacío = este mismo sitio)' });
  const err = h('p', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn primary big', type: 'submit' }, 'INGRESAR');
  $app.replaceChildren(h('div', { class: 'login' },
    h('form', { class: 'login-card', onsubmit: async e => {
      e.preventDefault(); err.textContent = ''; btn.disabled = true;
      localStorage.setItem('silos.server', server.value.trim());
      try { const s = await D.login(user.value, pass.value); if (s.offline) toast('Modo sin conexión: sus registros se subirán al recuperar señal', 'warn', 6000); location.hash = '#/'; route(); }
      catch (ex) { err.textContent = ex.message === 'Failed to fetch' ? 'No se pudo contactar al servidor' : ex.message; }
      finally { btn.disabled = false; }
    } },
      h('div', { class: 'login-brand' }, h('span', { class: 'brand-mark big' }, icon('silo', 40)), h('div', {}, h('b', {}, 'SILOS'), h('small', {}, 'Control de Área · Almacenera de Granos'))),
      h('div', { class: 'hazard-bar' }),
      field('Usuario', user), field('Contraseña', pass), err, btn,
      h('details', { class: 'adv' }, h('summary', {}, 'Configuración del servidor'), field('Dirección del servidor', server, 'Solo necesario en la app instalada (Android/iOS) o si el servidor está en otra dirección.')),
      h('p', { class: 'muted small' }, navigator.onLine ? 'En línea' : 'Sin conexión — puede ingresar con un usuario que ya haya usado este dispositivo.'))));
}

// ---------- Alertas entrantes ----------
const seen = new Set(JSON.parse(localStorage.getItem('silos.seen') || '[]'));
const saveSeen = () => localStorage.setItem('silos.seen', JSON.stringify([...seen].slice(-500)));
function announce(rec) {
  if (seen.has(rec.id)) return;
  seen.add(rec.id); saveSeen();
  if (rec.created_by === me()?.id) return;
  const isEv = rec.kind === 'event';
  const title = isEv ? `⚠ ${C.EVENT_TYPES[rec.type]?.label || 'Alerta'}` : `🔧 Daño ${rec.stopped ? '(EQUIPO DETENIDO)' : ''}`;
  const body = `${zoneName(rec.zone_id)} · ${C.SEVERITY[rec.severity]?.label || ''}${rec.by ? ' · ' + rec.by : ''}`;
  beep(rec.severity === 'critica' ? 5 : 3);
  toast(h('a', { href: `#/${isEv ? 'alerta' : 'dano'}/${rec.id}` }, h('b', {}, title), h('br'), body), 'alert', 10000);
  notify(title, body, rec.id);
}

D.onChange(async why => {
  if (why === 'session') return route();
  if (!D.session()) return;
  if (why?.alert) announce(why.alert);
  if (why?.incoming) {
    for (const r of why.incoming) {
      const fresh = (Date.now() - new Date(r.created_at)) < 60 * 60e3;
      if (((r.kind === 'event' && r.status === 'abierta') || (r.kind === 'damage' && (r.stopped || r.severity === 'critica') && r.status === 'reportado')) && fresh) announce(r);
    }
  }
  if (why?.rejected) why.rejected.forEach(r => toast(`No se pudo guardar un registro: ${r.error}`, 'error', 7000));
  if (why?.expired) toast('Su sesión expiró. Ingrese nuevamente.', 'warn');
  updateSync();
  if (why?.incoming || why === 'local') {
    updateBanner(); updateNav();
    if (main && !main.dataset.form) route();
  }
});

// Recordatorio sonoro para supervisores cuando una alerta crítica supera el tiempo de respuesta.
setInterval(() => {
  if (!D.session() || document.hidden) return;
  updateBanner();
  if (isStaff() && openEvents().some(e => e.severity === 'critica' && slaBreached(e))) beep(2);
}, 60e3);

// ---------- Arranque ----------
(async function init() {
  const theme = localStorage.getItem('silos.theme'); if (theme) document.documentElement.dataset.theme = theme;
  await D.loadCache();
  await D.restoreSession();
  window.addEventListener('hashchange', route);
  route();
  if (D.session()) D.sync();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
