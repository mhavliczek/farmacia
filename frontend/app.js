const API = window.FARMACIA_API || localStorage.getItem('farmacia_api') || 'http://localhost:4000';
const $ = (id) => document.getElementById(id);
const state = { token: localStorage.getItem('farmacia_token') || '', user: null, meds: [], cats: [] };

function toast(msg, ok = true) {
  $('toast-msg').textContent = msg;
  $('toast-msg').style.borderColor = ok ? '#bbf7d0' : '#fecaca';
  $('toast').classList.remove('hidden');
  setTimeout(() => $('toast').classList.add('hidden'), 2800);
}
function authHeaders(isJson = true) {
  const h = { Authorization: 'Bearer ' + state.token };
  if (isJson) h['Content-Type'] = 'application/json';
  return h;
}
async function api(path, opts = {}) {
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error ' + res.status);
  return data;
}
const fmtFecha = (f) => (!f ? '—' : new Date(f + 'T00:00:00').toLocaleDateString('es-CL'));

// ---------- Auth ----------
$('tab-login').onclick = () => { $('form-login').classList.remove('hidden'); $('form-register').classList.add('hidden'); $('tab-login').className = 'btn btn-primary flex-1'; $('tab-register').className = 'btn flex-1'; };
$('tab-register').onclick = () => { $('form-register').classList.remove('hidden'); $('form-login').classList.add('hidden'); $('tab-register').className = 'btn btn-primary flex-1'; $('tab-login').className = 'btn flex-1'; };

function showAuthError(m) { const e = $('auth-error'); e.textContent = m; e.classList.remove('hidden'); }

$('form-login').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('login-email').value.trim(), password: $('login-pass').value }) });
    loginOk(data);
  } catch (err) { showAuthError(err.message); }
};
$('form-register').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const data = await api('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre: $('reg-nombre').value.trim(), email: $('reg-email').value.trim(), password: $('reg-pass').value, rol: $('reg-rol').value }) });
    loginOk(data);
  } catch (err) { showAuthError(err.message); }
};
function loginOk(data) {
  state.token = data.token; state.user = data.user;
  localStorage.setItem('farmacia_token', data.token);
  enterApp();
}
$('btn-logout').onclick = () => { localStorage.removeItem('farmacia_token'); location.reload(); };

async function enterApp() {
  try {
    state.user = await api('/api/auth/me', { headers: authHeaders(false) });
  } catch { localStorage.removeItem('farmacia_token'); return; }
  $('view-login').classList.add('hidden');
  $('view-app').classList.remove('hidden');
  $('user-nombre').textContent = state.user.nombre + ' · ' + state.user.rol;
  $('user-email').textContent = state.user.email;
  applyRoleUI();
  buildMobileNav();
  await loadCats();
  await loadDashboard();
  await loadMeds();
}

const isAdmin = () => state.user?.rol === 'admin';
function applyRoleUI() {
  document.querySelectorAll('.admin-only').forEach((el) => {
    el.classList.toggle('hidden', !isAdmin());
  });
}

// ---------- Navegación ----------
const views = ['dashboard', 'medicamentos', 'inventario', 'recetas', 'categorias', 'usuarios'];
function buildMobileNav() {
  const visible = views.filter((v) => v !== 'usuarios' || isAdmin());
  $('mobile-nav').innerHTML = visible.map((v) => `<button class="btn btn-secondary whitespace-nowrap" data-m="${v}">${v}</button>`).join('');
  $('mobile-nav').querySelectorAll('button').forEach((b) => (b.onclick = () => showView(b.dataset.m)));
}
document.querySelectorAll('.sidebar-link').forEach((el) => (el.onclick = () => showView(el.dataset.view)));
function showView(v) {
  if ((v === 'usuarios' || v === 'categorias') && !isAdmin() && v === 'usuarios') { toast('Solo admin', false); return; }
  views.forEach((x) => { const s = $('sec-' + x); if (s) s.classList.toggle('hidden', x !== v); });
  document.querySelectorAll('.sidebar-link').forEach((el) => el.classList.toggle('active', el.dataset.view === v));
  if (v === 'dashboard') loadDashboard();
  if (v === 'medicamentos') loadMeds();
  if (v === 'inventario') loadMovs();
  if (v === 'recetas') { loadRecetas(); fillMedSelect($('r-med')); }
  if (v === 'categorias') loadCats();
  if (v === 'usuarios') loadUsers();
}

// ---------- Dashboard ----------
let alertaMostradaEnSesion = false;
async function loadDashboard() {
  try {
    const d = await api('/api/dashboard/resumen', { headers: authHeaders(false) });
    $('st-total').textContent = d.total_medicamentos ?? 0;
    $('st-pastillas').textContent = Number(d.total_pastillas || 0).toLocaleString('es-CL');
    $('st-bajo').textContent = d.bajo_stock ?? 0;
    $('st-vencidos').textContent = d.vencidos ?? 0;
    $('list-vencer').innerHTML = (d.proximos_vencer || []).map((m) =>
      `<div class="flex justify-between border rounded-lg px-3 py-2"><span>${m.nombre}${m.gramaje ? ' <span class="badge badge-gray">' + m.gramaje + '</span>' : ''}</span><span class="badge ${m.dias <= 7 ? 'badge-red' : m.dias <= 30 ? 'badge-red' : 'badge-yellow'}">${m.dias} días · ${fmtFecha(m.fecha_vencimiento)}</span></div>`
    ).join('') || '<p class="text-slate-500">Sin próximos vencimientos.</p>';
    $('list-movs').innerHTML = (d.ultimos_movimientos || []).map((m) =>
      `<div class="flex justify-between border rounded-lg px-3 py-2"><span>${m.tipo === 'entrada' ? '🟢' : '🔴'} ${m.medicamento_nombre}${m.medicamento_gramaje ? ' ' + m.medicamento_gramaje : ''} <b>x${m.cantidad}</b></span><span class="text-xs text-slate-500">${new Date(m.creado_en).toLocaleString('es-CL')}</span></div>`
    ).join('') || '<p class="text-slate-500">Sin movimientos.</p>';
    // Alerta de expiración: vencidos + vencen en ≤ 7 días. Siempre visible en dashboard
    // y modal una vez al ingresar al sistema.
    renderAlertaExpiracion(d.alerta_expiracion || []);
  } catch (e) { console.error(e); }
}

function renderAlertaExpiracion(lista) {
  const banner = $('alert-exp');
  if (!lista.length) { banner.classList.add('hidden'); return; }
  banner.classList.remove('hidden');
  $('alert-exp-count').textContent = lista.length + ' en riesgo';
  $('alert-exp-list').innerHTML = lista.map((m) => {
    const txt = m.estado_alerta === 'vencido'
      ? `<span class="badge badge-red">VENCIDO hace ${Math.abs(m.dias)}d</span>`
      : m.dias === 0 ? '<span class="badge badge-red">Vence HOY</span>'
      : `<span class="badge badge-red">Vence en ${m.dias}d</span>`;
    return `<div class="flex justify-between gap-2 border border-red-200 bg-white rounded-lg px-3 py-1.5"><span><b>${m.nombre}</b> ${m.gramaje ? '(' + m.gramaje + ') ' : ''}· ${m.cantidad_pastillas} past. · ${fmtFecha(m.fecha_vencimiento)}</span>${txt}</div>`;
  }).join('');
  // Modal una sola vez por inicio de sesión
  if (!alertaMostradaEnSesion) {
    alertaMostradaEnSesion = true;
    $('modal-alert-list').innerHTML = $('alert-exp-list').innerHTML;
    $('modal-alert').classList.remove('hidden');
  }
}
// resetear bandera al cambiar de usuario
const _loginOk = loginOk;
loginOk = function (data) { alertaMostradaEnSesion = false; _loginOk(data); };

// ---------- Categorías ----------
async function loadCats() {
  const cats = await api('/api/categorias', { headers: authHeaders(false) }).catch(() => []);
  state.cats = cats;
  $('f-cat').innerHTML = '<option value="">Todas las categorías</option>' + cats.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join('');
  $('med-cat').innerHTML = '<option value="">— Sin categoría —</option>' + cats.map((c) => `<option value="${c.id}">${c.nombre}</option>`).join('');
  $('list-cats').innerHTML = cats.map((c) =>
    `<div class="badge badge-gray !text-sm !py-1.5 !px-3">${c.nombre}${isAdmin() ? ` <button class="ml-2 text-slate-700 underline" onclick="editCat(${c.id})">editar</button> <button class="ml-1 text-red-600" onclick="delCat(${c.id})">✕</button>` : ''}</div>`
  ).join('') || '<p class="text-slate-500 text-sm">Sin categorías.</p>';
}
let catEditId = null;
function resetCatForm() {
  catEditId = null;
  $('form-cat').reset();
  $('form-cat-title').textContent = 'Nueva categoría';
  $('form-cat-submit').textContent = 'Guardar';
  $('btn-cancel-cat').classList.add('hidden');
}
window.editCat = (id) => {
  if (!isAdmin()) { toast('Solo admin puede editar', false); return; }
  const c = state.cats.find((x) => x.id === Number(id));
  if (!c) { toast('Categoría no encontrada, recarga la lista', false); return; }
  catEditId = c.id;
  $('c-nombre').value = c.nombre;
  $('c-desc').value = c.descripcion || '';
  $('form-cat-title').textContent = 'Editar categoría';
  $('form-cat-submit').textContent = 'Actualizar';
  $('btn-cancel-cat').classList.remove('hidden');
  $('c-nombre').focus();
};
$('btn-cancel-cat').onclick = resetCatForm;
$('form-cat').onsubmit = async (e) => {
  e.preventDefault();
  const body = JSON.stringify({ nombre: $('c-nombre').value.trim(), descripcion: $('c-desc').value.trim() });
  try {
    if (catEditId) {
      await api('/api/categorias/' + catEditId, { method: 'PUT', headers: authHeaders(), body });
      toast('Categoría actualizada');
    } else {
      await api('/api/categorias', { method: 'POST', headers: authHeaders(), body });
      toast('Categoría creada');
    }
    resetCatForm();
    await loadCats();
    await loadMeds();
  } catch (err) { toast(err.message, false); }
};
window.delCat = async (id) => { if (!confirm('¿Eliminar categoría?')) return; try { await api('/api/categorias/' + id, { method: 'DELETE', headers: authHeaders(false) }); loadCats(); } catch (e) { toast(e.message, false); } };

// ---------- Medicamentos ----------
function fillMedSelect(sel) {
  if (!sel) return;
  const keepFirst = sel.querySelector('option');
  sel.innerHTML = ''; if (keepFirst) sel.appendChild(keepFirst);
  state.meds.forEach((m) => { const o = document.createElement('option'); o.value = m.id; o.textContent = `${m.nombre}${m.gramaje ? ' ' + m.gramaje : ''} (${m.cantidad_pastillas})`; sel.appendChild(o); });
}
$('btn-filtrar').onclick = loadMeds;
async function loadMeds() {
  const p = new URLSearchParams();
  if ($('f-q').value.trim()) p.set('q', $('f-q').value.trim());
  if ($('f-cat').value) p.set('categoria_id', $('f-cat').value);
  if ($('f-vencidos').checked) p.set('vencidos', '1');
  if ($('f-bajo').checked) p.set('bajo_stock', '1');
  const meds = await api('/api/medicamentos?' + p.toString(), { headers: authHeaders(false) }).catch((e) => { toast(e.message, false); return []; });
  state.meds = meds;
  $('tbl-meds').innerHTML = meds.map((m) => {
    const venc = m.vencido ? '<span class="badge badge-red">Vencido</span>' : (m.dias_para_vencer <= 90 ? `<span class="badge badge-yellow">${m.dias_para_vencer}d</span>` : `<span class="badge badge-green">OK</span>`);
    const stock = m.bajo_stock ? `<b class="text-yellow-700">${m.cantidad_pastillas}</b> <span class="badge badge-yellow">Bajo</span>` : `<b>${m.cantidad_pastillas}</b>`;
    const adminBtns = isAdmin()
      ? `<button class="btn btn-secondary !px-2 !py-1 !text-xs" onclick="editMed(${m.id})">Editar</button>
         <button class="btn btn-destructive !px-2 !py-1 !text-xs" onclick="delMed(${m.id})">Borrar</button>`
      : '';
    return `<tr>
      <td><b>${m.nombre}</b><div class="text-xs text-slate-500 max-w-56 truncate">${m.descripcion || ''}</div></td>
      <td><span class="badge badge-gray">${m.gramaje || '—'}</span></td>
      <td><span class="badge badge-blue">${m.categoria_nombre || '—'}</span></td>
      <td>${stock}<div class="text-xs text-slate-400">pastillas</div></td>
      <td>${fmtFecha(m.fecha_vencimiento)} ${venc}</td>
      <td><div class="flex flex-wrap gap-1">
        <button class="btn btn-outline-green !px-2 !py-1 !text-xs" onclick="openStock(${m.id},'entrada')">+ Entrada</button>
        <button class="btn btn-outline-red !px-2 !py-1 !text-xs" onclick="openStock(${m.id},'salida')">− Salida</button>
        ${adminBtns}
      </div></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="text-center text-slate-500 py-6">Sin medicamentos.</td></tr>';
}
$('btn-nuevo-med').onclick = () => { if (!isAdmin()) { toast('Solo admin puede crear medicamentos', false); return; } $('form-med').reset(); $('med-id').value = ''; $('med-modal-title').textContent = 'Nuevo medicamento'; $('modal-med').classList.remove('hidden'); };
$('btn-cerrar-med').onclick = () => $('modal-med').classList.add('hidden');
$('form-med').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const id = $('med-id').value;
    const body = { nombre: $('med-nombre').value.trim(), gramaje: $('med-gramaje').value.trim() || null, descripcion: $('med-desc').value.trim(), cantidad_pastillas: Number($('med-cant').value), fecha_vencimiento: $('med-vence').value, categoria_id: $('med-cat').value || null, stock_minimo: Number($('med-min').value) };
    if (id) await api('/api/medicamentos/' + id, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(body) });
    else await api('/api/medicamentos', { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
    $('modal-med').classList.add('hidden'); toast('Medicamento guardado'); loadMeds();
  } catch (err) { toast(err.message, false); }
};
window.editMed = (id) => {
  if (!isAdmin()) { toast('Solo admin puede editar', false); return; }
  const m = state.meds.find((x) => x.id === Number(id));
  if (!m) { toast('Medicamento no encontrado, recarga la lista', false); return; }
  $('med-id').value = m.id; $('med-nombre').value = m.nombre; $('med-gramaje').value = m.gramaje || ''; $('med-desc').value = m.descripcion || '';
  $('med-cant').value = m.cantidad_pastillas;
  $('med-vence').value = String(m.fecha_vencimiento).slice(0, 10); $('med-cat').value = m.categoria_id || '';
  $('med-min').value = m.stock_minimo;
  $('med-modal-title').textContent = 'Editar medicamento'; $('modal-med').classList.remove('hidden');
};
window.delMed = async (id) => { if (!isAdmin()) { toast('Solo admin puede borrar', false); return; } if (!confirm('¿Eliminar medicamento y su historial?')) return; try { await api('/api/medicamentos/' + id, { method: 'DELETE', headers: authHeaders(false) }); toast('Eliminado'); loadMeds(); } catch (e) { toast(e.message, false); } };

// stock
window.openStock = (id, tipo) => { $('stock-id').value = id; $('stock-tipo').value = tipo; $('stock-title').textContent = tipo === 'entrada' ? 'Registrar entrada' : 'Registrar salida'; $('modal-stock').classList.remove('hidden'); };
$('btn-cerrar-stock').onclick = () => $('modal-stock').classList.add('hidden');
$('form-stock').onsubmit = async (e) => {
  e.preventDefault();
  const id = $('stock-id').value, tipo = $('stock-tipo').value;
  try {
    await api(`/api/medicamentos/${id}/${tipo}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ cantidad: Number($('stock-cant').value), motivo: $('stock-motivo').value }) });
    $('modal-stock').classList.add('hidden'); toast(tipo === 'entrada' ? 'Entrada registrada' : 'Salida registrada'); loadMeds();
  } catch (err) { toast(err.message, false); }
};

// ---------- Movimientos ----------
$('btn-movs').onclick = loadMovs;
async function loadMovs() {
  const t = $('m-tipo').value;
  const rows = await api('/api/movimientos' + (t ? '?tipo=' + t : ''), { headers: authHeaders(false) }).catch(() => []);
  $('tbl-movs').innerHTML = rows.map((m) =>
    `<tr><td class="text-xs">${new Date(m.creado_en).toLocaleString('es-CL')}</td><td><b>${m.medicamento_nombre}</b></td>
    <td>${m.tipo === 'entrada' ? '<span class="badge badge-green">entrada</span>' : '<span class="badge badge-red">salida</span>'}</td>
    <td><b>x${m.cantidad}</b></td><td class="text-slate-500">${m.motivo || '—'}</td><td class="text-xs">${m.usuario_nombre || '—'}</td></tr>`
  ).join('') || '<tr><td colspan="6" class="text-center text-slate-500 py-6">Sin movimientos.</td></tr>';
}

async function limpiarMovimientos() {
  if (!isAdmin()) { toast('Solo admin puede limpiar movimientos', false); return; }
  if (!confirm('¿Borrar todo el historial de movimientos? El stock de los medicamentos no cambia.')) return;
  try {
    const r = await api('/api/movimientos', { method: 'DELETE', headers: authHeaders(false) });
    toast(`Historial limpiado (${r.eliminados} registros)`);
    loadDashboard(); loadMovs();
  } catch (e) { toast(e.message, false); }
}
$('btn-limpiar-movs').onclick = limpiarMovimientos;
$('btn-limpiar-dash').onclick = limpiarMovimientos;

// ---------- Recetas ----------
$('btn-recetas').onclick = loadRecetas;
$('r-filtro').onchange = loadRecetas;
$('form-receta').onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData();
  fd.append('paciente_nombre', $('r-paciente').value.trim());
  fd.append('medico_nombre', $('r-medico').value.trim());
  if ($('r-med').value) fd.append('medicamento_id', $('r-med').value);
  fd.append('observaciones', $('r-obs').value.trim());
  if ($('r-archivo').files[0]) fd.append('archivo', $('r-archivo').files[0]);
  try {
    const res = await fetch(API + '/api/recetas', { method: 'POST', headers: { Authorization: 'Bearer ' + state.token }, body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al subir');
    toast('Receta subida'); $('form-receta').reset(); loadRecetas();
  } catch (err) { toast(err.message, false); }
};
async function loadRecetas() {
  const f = $('r-filtro').value;
  const rows = await api('/api/recetas' + (f ? '?estado=' + f : ''), { headers: authHeaders(false) }).catch(() => []);
  $('list-recetas').innerHTML = rows.map((r) => `
    <div class="border rounded-lg p-3 flex flex-wrap gap-3 items-center">
      <div class="flex-1 min-w-52">
        <div class="font-medium">${r.paciente_nombre} <span class="badge ${r.estado === 'pendiente' ? 'badge-yellow' : r.estado === 'dispensada' ? 'badge-green' : 'badge-red'}">${r.estado}</span></div>
        <div class="text-xs text-slate-500">Dr: ${r.medico_nombre || '—'} · Med: ${r.medicamento_nombre || '—'} · Por: ${r.subido_por || '—'} · ${new Date(r.creado_en).toLocaleString('es-CL')}</div>
        ${r.observaciones ? `<div class="text-xs mt-1">${r.observaciones}</div>` : ''}
      </div>
      <div class="flex gap-1 flex-wrap">
        <a class="btn btn-secondary !py-1 !text-xs" target="_blank" href="${API}/${r.archivo_path}">Ver archivo</a>
        <button class="btn btn-outline-green !py-1 !text-xs" onclick="setReceta(${r.id},'dispensada')">Dispensar</button>
        <button class="btn btn-outline-red !py-1 !text-xs" onclick="setReceta(${r.id},'rechazada')">Rechazar</button>
        ${isAdmin() ? `<button class="btn btn-destructive !py-1 !text-xs" onclick="delReceta(${r.id})">Borrar</button>` : ''}
      </div>
    </div>`).join('') || '<p class="text-slate-500 text-sm">Sin recetas.</p>';
}
window.setReceta = async (id, estado) => { try { await api('/api/recetas/' + id, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ estado }) }); toast('Receta ' + estado); loadRecetas(); } catch (e) { toast(e.message, false); } };
window.delReceta = async (id) => { if (!isAdmin()) { toast('Solo admin puede borrar recetas', false); return; } if (!confirm('¿Borrar receta?')) return; try { await api('/api/recetas/' + id, { method: 'DELETE', headers: authHeaders(false) }); loadRecetas(); } catch (e) { toast(e.message, false); } };

// ---------- Usuarios (solo admin) ----------
async function loadUsers() {
  if (!isAdmin()) return;
  const rows = await api('/api/auth/usuarios', { headers: authHeaders(false) }).catch((e) => { toast(e.message, false); return []; });
  $('tbl-users').innerHTML = rows.map((u) => `
    <tr><td><b>${u.nombre}</b></td><td class="text-xs">${u.email}</td>
    <td><span class="badge ${u.rol === 'admin' ? 'badge-red' : 'badge-blue'}">${u.rol}</span></td>
    <td><select class="select !w-36 !py-1 !text-xs" onchange="setUserRol(${u.id},this.value)">
      <option value="">Cambiar rol…</option><option value="admin">admin</option><option value="farmaceutico">farmacéutico</option><option value="cajero">cajero</option>
    </select></td></tr>`).join('') || '<tr><td colspan="4" class="text-center text-slate-500">Sin usuarios.</td></tr>';
}
$('form-user').onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api('/api/auth/usuarios', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ nombre: $('u-nombre').value.trim(), email: $('u-email').value.trim(), password: $('u-pass').value, rol: $('u-rol').value }) });
    toast('Usuario creado'); $('form-user').reset(); loadUsers();
  } catch (err) { toast(err.message, false); }
};
window.setUserRol = async (id, rol) => {
  if (!rol) return;
  try { await api('/api/auth/usuarios/' + id, { method: 'PATCH', headers: authHeaders(), body: JSON.stringify({ rol }) }); toast('Rol actualizado'); loadUsers(); }
  catch (e) { toast(e.message, false); }
};

// ---------- Cambiar clave (usuario logueado) ----------
$('btn-abrir-clave').onclick = () => { $('form-clave').reset(); $('modal-clave').classList.remove('hidden'); };
$('btn-cerrar-clave').onclick = () => $('modal-clave').classList.add('hidden');
$('form-clave').onsubmit = async (e) => {
  e.preventDefault();
  if ($('cl-nueva').value !== $('cl-repetir').value) { toast('Las claves nuevas no coinciden', false); return; }
  try {
    await api('/api/auth/me/password', {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ password_actual: $('cl-actual').value, password_nueva: $('cl-nueva').value }),
    });
    $('modal-clave').classList.add('hidden');
    toast('Clave actualizada');
  } catch (err) { toast(err.message, false); }
};

// ---------- Modal alerta vencimiento ----------
$('btn-alert-cerrar').onclick = () => $('modal-alert').classList.add('hidden');
$('btn-alert-ver').onclick = () => { $('modal-alert').classList.add('hidden'); showView('medicamentos'); };

// init
if (state.token) enterApp();
