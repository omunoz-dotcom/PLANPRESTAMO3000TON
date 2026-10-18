// Utilidades de interfaz: creación de elementos, íconos, avisos, fotos y notificaciones.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const P = {
  home: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  tasks: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  check: 'M5 12l5 5L20 7',
  wrench: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z',
  alert: 'M12 3l10 18H2zM12 10v4M12 17.5v.5',
  bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
  plan: 'M8 3v4M16 3v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z',
  users: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  camera: 'M3 8h3l2-3h8l2 3h3v12H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
  plus: 'M12 5v14M5 12h14',
  x: 'M6 6l12 12M18 6L6 18',
  back: 'M15 18l-6-6 6-6',
  sync: 'M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5',
  logout: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3',
  sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  silo: 'M5 21V8a7 4 0 0 1 14 0v13M5 21h14M5 12h14M5 16h14',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18',
};
export function icon(name, size = 20) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', P[name] || P.alert);
  s.append(p); return s;
}

export function toast(msg, kind = 'info', ms = 4000) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: `toast toast-${kind}`, role: 'status' }, msg);
  box.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

export function modal(title, body, actions = []) {
  return new Promise(resolve => {
    const close = v => { wrap.remove(); resolve(v); };
    const wrap = h('div', { class: 'modal-wrap', onclick: e => { if (e.target === wrap) close(null); } },
      h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
        h('div', { class: 'modal-head' }, h('h3', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Cerrar', onclick: () => close(null) }, icon('x'))),
        h('div', { class: 'modal-body' }, body),
        actions.length ? h('div', { class: 'modal-foot' }, actions.map(a =>
          h('button', { class: `btn ${a.class || ''}`, onclick: async () => { const v = a.value ? await a.value() : a.label; if (v !== false) close(v); } }, a.label))) : null));
    document.body.append(wrap);
    wrap.querySelector('input,textarea,select')?.focus();
  });
}

export const confirmDlg = (title, text, okLabel = 'Confirmar') =>
  modal(title, h('p', {}, text), [{ label: 'Cancelar', class: 'ghost', value: () => null }, { label: okLabel, class: 'primary', value: () => true }]);

// ---------- Fotos: se comprimen en el dispositivo antes de guardar ----------
export function compressImage(file, max = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagen no válida')); };
    img.src = url;
  });
}

export function photoField(photos = [], { max = 4, readonly = false } = {}) {
  const list = [...photos];
  const grid = h('div', { class: 'photos' });
  const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', multiple: true, hidden: true,
    onchange: async () => {
      for (const f of [...input.files].slice(0, max - list.length)) {
        try { list.push(await compressImage(f)); } catch (e) { toast(e.message, 'error'); }
      }
      input.value = ''; render();
    } });
  function render() {
    grid.replaceChildren(...[
      ...list.map((src, i) => h('div', { class: 'photo' },
        h('img', { src, alt: `Foto ${i + 1}`, onclick: () => viewPhoto(src) }),
        readonly ? null : h('button', { class: 'photo-del', type: 'button', 'aria-label': 'Quitar foto', onclick: () => { list.splice(i, 1); render(); } }, icon('x', 14)))),
      !readonly && list.length < max ? h('button', { type: 'button', class: 'photo-add', onclick: () => input.click() }, icon('camera', 26), h('span', {}, 'Foto')) : null,
      input].filter(Boolean));
  }
  render();
  grid.getPhotos = () => list;
  return grid;
}
export const viewPhoto = src => modal('Foto', h('img', { src, class: 'photo-full', alt: 'Foto ampliada' }));

// ---------- Formato ----------
export const fmtDate = iso => iso ? new Date(iso).toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const fmtDay = iso => iso ? new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export function ago(iso) {
  const m = Math.round((Date.now() - new Date(iso)) / 60e3);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const hh = Math.floor(m / 60);
  if (hh < 24) return `hace ${hh} h ${m % 60} min`;
  return `hace ${Math.floor(hh / 24)} d`;
}
export const isToday = iso => iso && new Date(iso).toDateString() === new Date().toDateString();

// ---------- Avisos sonoros y notificaciones del sistema ----------
let actx;
export function beep(times = 3) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i++) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square'; o.frequency.value = i % 2 ? 660 : 880;
      g.gain.value = 0.08;
      o.connect(g); g.connect(actx.destination);
      const t = actx.currentTime + i * 0.35;
      o.start(t); o.stop(t + 0.25);
    }
  } catch {}
  navigator.vibrate?.([300, 120, 300, 120, 300]);
}

export async function notify(title, body, tag) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', renotify: true, requireInteraction: true });
    else new Notification(title, { body, tag });
  } catch {}
}

export function downloadCsv(name, rows) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = '﻿' + rows.map(r => r.map(esc).join(';')).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: name });
  document.body.append(a); a.click(); a.remove();
}
