'use strict';
var SUPABASE_URL = 'https://melbzzocbenpoewlqvbr.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lbGJ6em9jYmVucG9ld2xxdmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNTk4NjcsImV4cCI6MjEwMTYzNTg2N30.bnXFTnmpKR0OTv_8_R3yI-iH0hX2pwG7kMrpyGSK56E';
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

var ESTADOS = ['Pendiente', 'Concretado', 'No concretado', 'Cancelado'];
var clienteEditando = null, clientes = [], notas = [], vista = 'tabla', sortK = 'creado', sortD = -1, arrastrando = false;
var $ = function (s) { return document.querySelector(s); };
var overlay = $('#overlay'), form = $('#form'), filas = $('#filas'), vacio = $('#vacio'), alertasEl = $('#alertas');
var CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
function ico(n) { return '<svg class="i"><use href="#i-' + n + '"/></svg>'; }
function fmt(n) { return CLP.format(Number(n) || 0); }
function fechaCL(s) { return s ? new Date(s).toLocaleDateString('es-CL') : '—'; }
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* ---------- Login ---------- */
var fallosLogin = 0, bloqueadoHasta = 0;
$('#formLogin').addEventListener('submit', async function (e) {
  e.preventDefault(); $('#loginError').textContent = '';
  var restante = Math.ceil((bloqueadoHasta - Date.now()) / 1000);
  if (restante > 0) { $('#loginError').textContent = 'Demasiados intentos. Espera ' + restante + ' segundos.'; return; }
  var r = await sb.auth.signInWithPassword({ email: $('#loginCorreo').value.trim(), password: $('#loginPass').value });
  if (r.error) {
    fallosLogin++;
    if (fallosLogin >= 5) { bloqueadoHasta = Date.now() + Math.min(30 * Math.pow(2, fallosLogin - 5), 900) * 1000; }
    $('#loginError').textContent = 'No se pudo iniciar sesión. Revisa tu correo y contraseña.';
  } else { fallosLogin = 0; $('#loginPass').value = ''; }
});
$('#btnSalir').addEventListener('click', function () { sb.auth.signOut(); });
var INACTIVIDAD_MS = 30 * 60 * 1000, temporizadorInactividad = null;
function reiniciarInactividad() {
  clearTimeout(temporizadorInactividad);
  temporizadorInactividad = setTimeout(function () { sb.auth.signOut(); }, INACTIVIDAD_MS);
}
['click', 'keydown', 'mousemove', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, reiniciarInactividad, { passive: true }); });
sb.auth.onAuthStateChange(function (ev, ses) {
  $('#login').style.display = ses ? 'none' : 'block'; $('#app').style.display = ses ? 'block' : 'none';
  if (ses) { cargarClientes(); reiniciarInactividad(); } else { clearTimeout(temporizadorInactividad); clientes = []; }
});

/* ---------- Helpers de datos ---------- */
function diasHasta(f) { if (!f) return null; var h = new Date(); h.setHours(0, 0, 0, 0); return Math.round((new Date(f + 'T00:00:00') - h) / 864e5); }
function proximoVencimiento(d) {
  return [['Mantención', d.mantencion_vencimiento], ['Hosting', d.hosting_vencimiento], ['Dominio', d.dominio_vencimiento]]
    .filter(function (x) { return x[1]; }).map(function (x) { return { tipo: x[0], f: x[1], dias: diasHasta(x[1]) }; })
    .sort(function (a, b) { return a.dias - b.dias; })[0] || null;
}
function esNuevo(d) { return d.origen === 'formulario' && d.estado === 'Pendiente' && d.creado_at && (Date.now() - new Date(d.creado_at)) < 7 * 864e5; }
function porCobrar(d) { return d.estado === 'Concretado' && d.pago_estado !== 'Pagado' ? (d.monto_pendiente || 0) : 0; }
function cobrado(d) { return d.estado !== 'Concretado' ? 0 : Math.max(0, (d.monto_total || 0) - (d.pago_estado === 'Pagado' ? 0 : (d.monto_pendiente || 0))); }
function badgeEstado(e) { var m = { Pendiente: 'b-pend', Concretado: 'b-conc', 'No concretado': 'b-noconc', Cancelado: 'b-canc' }; return '<span class="badge ' + (m[e] || 'b-pend') + '">' + escapeHtml(e || 'Pendiente') + '</span>'; }
function badgePago(p) { var m = { Pendiente: 'b-pagpend', Parcial: 'b-pagpar', Pagado: 'b-pagok' }; return '<span class="badge ' + (m[p] || 'b-pagpend') + '">' + escapeHtml(p || 'Pendiente') + '</span>'; }
function textoBusqueda(d) {
  var f = d.formulario || {};
  return [d.nombre_negocio, d.nombre_contacto, d.correo, d.whatsapp, d.plan, d.notas, d.dominio_nombre, d.hosting_proveedor, f.rubro, f.ciudad,
    (d.notas_historial || []).map(function (n) { return n.texto; }).join(' ')].join(' ').toLowerCase();
}
var SORT = {
  negocio: function (d) { return (d.nombre_negocio || '').toLowerCase(); }, contacto: function (d) { return (d.nombre_contacto || '').toLowerCase(); },
  plan: function (d) { return d.plan || ''; }, estado: function (d) { return ESTADOS.indexOf(d.estado); }, pago: function (d) { return d.pago_estado || ''; },
  monto: function (d) { return d.monto_total || 0; }, saldo: function (d) { return porCobrar(d); }, ciudad: function (d) { return ((d.formulario || {}).ciudad || '').toLowerCase(); }, venc: function (d) { var p = proximoVencimiento(d); return p ? p.dias : 1e9; }, creado: function (d) { return d.creado_at || ''; }
};
function pasaFiltros(d, fe) {
  var q = $('#buscar').value.trim().toLowerCase(), fp = $('#filtroPago').value, fpl = $('#filtroPlan').value, fo = $('#filtroOrigen').value, per = $('#filtroPeriodo').value, ex = $('#filtroExtra').value, p = proximoVencimiento(d);
  if (fe && d.estado !== fe) return false; if (fp && d.pago_estado !== fp) return false; if (fpl && (d.plan || 'Por definir') !== fpl) return false; if (fo && d.origen !== fo) return false;
  if (per && !(d.creado_at && Date.now() - new Date(d.creado_at) < per * 864e5)) return false;
  if (ex === 'venc' && !(p && p.dias <= 30)) return false; if (ex === 'mant' && !d.mantencion_activa) return false; if (ex === 'cobrar' && !porCobrar(d)) return false; if (ex === 'nuevo' && !esNuevo(d)) return false;
  return !q || textoBusqueda(d).indexOf(q) >= 0;
}
function visibles() {
  var fe = vista === 'tablero' ? '' : $('#filtroEstado').value;
  var v = clientes.filter(function (d) { return pasaFiltros(d, fe); }).sort(function (a, b) { var x = SORT[sortK](a), y = SORT[sortK](b); return (x < y ? -1 : x > y ? 1 : 0) * sortD; });
  $('#contador').textContent = v.length + ' de ' + clientes.length + ' clientes'; return v;
}
function poblarPlanes() {
  var s = $('#filtroPlan'), act = s.value, ps = [];
  clientes.forEach(function (d) { var p = d.plan || 'Por definir'; if (ps.indexOf(p) < 0) ps.push(p); });
  s.innerHTML = '<option value="">Todos los planes</option>' + ps.sort().map(function (p) { return '<option>' + escapeHtml(p) + '</option>'; }).join(''); s.value = act;
}

/* ---------- Render ---------- */
function render() {
  renderKpis(); renderAlertas();
  $('#vTabla').hidden = vista !== 'tabla'; $('#vTablero').hidden = vista !== 'tablero'; $('#vStats').hidden = vista !== 'stats';
  $('#filtroEstado').style.display = vista === 'tablero' ? 'none' : '';
  document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('act', t.dataset.vista === vista); });
  if (vista === 'tabla') renderTabla(); else if (vista === 'tablero') renderTablero(); else renderStats();
}
function renderTabla() {
  var v = visibles(); vacio.hidden = v.length > 0;
  document.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (th.dataset.sort === sortK ? (sortD > 0 ? ' ▲' : ' ▼') : '');
  });
  filas.innerHTML = v.map(function (d) {
    var p = proximoVencimiento(d);
    var pt = p ? p.tipo + ': ' + (p.dias < 0 ? 'vencido hace ' + Math.abs(p.dias) + 'd' : p.dias === 0 ? 'hoy' : 'en ' + p.dias + 'd') : '—';
    return '<tr data-id="' + escapeHtml(d.id) + '"><td>' + escapeHtml(d.nombre_negocio || '—') + (esNuevo(d) ? '<span class="badge b-nuevo">Nuevo</span>' : '') + '</td><td>' + escapeHtml(d.nombre_contacto || '—') + '</td><td>' + escapeHtml((d.formulario || {}).ciudad || '—') + '</td><td>' + escapeHtml(d.plan || '—') + '</td><td>' + badgeEstado(d.estado) + '</td><td>' + badgePago(d.pago_estado) + '</td><td>' + (d.monto_total ? fmt(d.monto_total) : '—') + '</td><td>' + (porCobrar(d) ? fmt(porCobrar(d)) : '—') + '</td><td>' + pt + '</td><td>' + fechaCL(d.creado_at) + '</td><td class="origen">' + (d.origen === 'formulario' ? ico('globe') + ' Web' : ico('pen') + ' Manual') + '</td></tr>';
  }).join('');
}
function renderTablero() {
  var v = visibles();
  $('#vTablero').innerHTML = ESTADOS.map(function (e) {
    var col = v.filter(function (d) { return d.estado === e; });
    var total = col.reduce(function (s, d) { return s + (d.monto_total || 0); }, 0);
    return '<div class="col" data-estado="' + escapeHtml(e) + '"><h3>' + escapeHtml(e) + '<span>' + col.length + ' · ' + fmt(total) + '</span></h3>' + col.map(function (d) {
      return '<div class="card" draggable="true" data-id="' + escapeHtml(d.id) + '"><b>' + escapeHtml(d.nombre_negocio || '—') + '</b>' + (esNuevo(d) ? '<span class="badge b-nuevo">Nuevo</span>' : '') +
        '<div class="sub">' + escapeHtml(d.nombre_contacto || '—') + ' · ' + escapeHtml(d.plan || '—') + '</div><div class="sub">' + (d.monto_total ? fmt(d.monto_total) + ' · ' : '') + badgePago(d.pago_estado) + '</div>' +
        '<select class="mover">' + ESTADOS.map(function (x) { return '<option' + (x === e ? ' selected' : '') + '>' + escapeHtml(x) + '</option>'; }).join('') + '</select></div>';
    }).join('') + '</div>';
  }).join('');
}
function renderKpis() {
  var ahora = Date.now(), web = clientes.filter(function (d) { return d.origen === 'formulario'; });
  var sem = web.filter(function (d) { return ahora - new Date(d.creado_at) < 7 * 864e5; }).length, mes = web.filter(function (d) { return ahora - new Date(d.creado_at) < 30 * 864e5; }).length;
  var conc = clientes.filter(function (d) { return d.estado === 'Concretado'; }), noc = clientes.filter(function (d) { return d.estado === 'No concretado'; }).length;
  var pend = clientes.filter(function (d) { return d.estado === 'Pendiente'; }).length, sum = function (a, f) { return a.reduce(function (s, d) { return s + f(d); }, 0); };
  var xc = clientes.filter(function (d) { return porCobrar(d) > 0; }), mant = clientes.filter(function (d) { return d.mantencion_activa; });
  var k = [['Leads nuevos (7 días)', sem, mes + ' en 30 días'], ['Pendientes de cerrar', pend, clientes.length + ' clientes en total'],
    ['Tasa de cierre', conc.length + noc ? Math.round(conc.length / (conc.length + noc) * 100) + '%' : '—', conc.length + ' concretados · ' + noc + ' no concretados'],
    ['Cobrado', fmt(sum(clientes, cobrado)), 'de ' + fmt(sum(conc, function (d) { return d.monto_total || 0; })) + ' cerrado'],
    ['Por cobrar', fmt(sum(clientes, porCobrar)), xc.length + ' cliente(s)'], ['Mantención mensual', fmt(sum(mant, function (d) { return d.mantencion_precio || 0; })), mant.length + ' activa(s)'],
    ['Ticket promedio', conc.length ? fmt(sum(conc, function (d) { return d.monto_total || 0; }) / conc.length) : '—', 'por proyecto concretado'],
    ['Vencen en 30 días', clientes.filter(function (d) { var p = proximoVencimiento(d); return p && p.dias <= 30; }).length, 'mantención, hosting o dominio']];
  $('#kpis').innerHTML = k.map(function (x, i) { return '<div class="kpi"><div class="kpi-ic">' + ico(['user-plus', 'clock', 'target', 'wallet', 'cash', 'repeat', 'tag', 'calendar'][i]) + '</div><small>' + escapeHtml(x[0]) + '</small><b>' + escapeHtml(x[1]) + '</b><span>' + escapeHtml(x[2]) + '</span></div>'; }).join('');
}
function barras(t, pares) {
  if (!pares.length) pares = [['Sin datos', 0, '—']];
  var max = Math.max.apply(null, [1].concat(pares.map(function (p) { return p[1]; })));
  return '<div class="stat"><h3>' + escapeHtml(t) + '</h3>' + pares.map(function (p) { return '<div class="barra"><span>' + escapeHtml(p[0]) + '</span><i style="width:' + (p[1] / max * 100) + '%"></i><em>' + escapeHtml(p[2]) + '</em></div>'; }).join('') + '</div>';
}
function conteo(L, fn, n) {
  var c = {}; L.forEach(function (d) { [].concat(fn(d) || []).forEach(function (x) { x = String(x).trim(); if (!x) return; var k = x.toLowerCase(); c[k] = c[k] || [x, 0]; c[k][1]++; }); });
  return Object.keys(c).map(function (k) { return c[k]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, n || 6).map(function (p) { return [p[0], p[1], p[1]]; });
}
function renderStats() {
  var L = visibles(), meses = [], cnt = {}, ing = {}, planes = {}, i, dt;
  for (i = 5; i >= 0; i--) { dt = new Date(); dt.setDate(1); dt.setMonth(dt.getMonth() - i); meses.push([dt.getFullYear() + '-' + dt.getMonth(), dt.toLocaleDateString('es-CL', { month: 'short', year: '2-digit' })]); }
  L.forEach(function (d) {
    var p = d.plan || 'Por definir'; planes[p] = planes[p] || [0, 0]; planes[p][0]++; if (d.estado === 'Concretado') planes[p][1] += d.monto_total || 0;
    if (!d.creado_at) return; var c = new Date(d.creado_at), k = c.getFullYear() + '-' + c.getMonth(); cnt[k] = (cnt[k] || 0) + 1; if (d.estado === 'Concretado') ing[k] = (ing[k] || 0) + (d.monto_total || 0);
  });
  var top = L.filter(function (d) { return d.estado === 'Concretado' && d.monto_total; }).sort(function (a, b) { return b.monto_total - a.monto_total; }).slice(0, 5);
  var F = function (k) { return function (d) { return (d.formulario || {})[k]; }; }, N = function (f) { return L.filter(f).length; };
  $('#vStats').innerHTML = barras('Clientes nuevos por mes', meses.map(function (m) { return [m[1], cnt[m[0]] || 0, cnt[m[0]] || 0]; })) +
    barras('Ingresos cerrados por mes', meses.map(function (m) { return [m[1], ing[m[0]] || 0, fmt(ing[m[0]] || 0)]; })) +
    barras('Por estado', ESTADOS.map(function (e) { var n = N(function (d) { return d.estado === e; }); return [e, n, n]; })) +
    barras('Por estado de pago', ['Pendiente', 'Parcial', 'Pagado'].map(function (e) { var n = N(function (d) { return d.pago_estado === e; }); return [e, n, n]; })) +
    barras('Por plan (cantidad · cerrado)', Object.keys(planes).map(function (p) { return [p, planes[p][0], planes[p][0] + ' · ' + fmt(planes[p][1])]; })) +
    barras('Origen', [['Web', N(function (d) { return d.origen === 'formulario'; })], ['Manual', N(function (d) { return d.origen !== 'formulario'; })]].map(function (x) { return [x[0], x[1], x[1]]; })) +
    barras('Top clientes concretados', top.map(function (d) { return [d.nombre_negocio || '—', d.monto_total, fmt(d.monto_total)]; })) +
    barras('Medio preferido de cotización', conteo(L, F('medio_cotizacion'))) + barras('Rubros más comunes', conteo(L, F('rubro'))) + barras('Ciudades / comunas', conteo(L, F('ciudad'))) +
    barras('Objetivos más pedidos', conteo(L, F('objetivo'))) + barras('Funciones más pedidas', conteo(L, F('funciones'))) + barras('Secciones más pedidas', conteo(L, F('secciones'))) + barras('¿Ya tienen dominio?', conteo(L, F('tiene_dominio')));
}
function renderAlertas() {
  var items = [];
  clientes.forEach(function (d) {
    [['Mantención', d.mantencion_vencimiento], ['Hosting', d.hosting_vencimiento], ['Dominio', d.dominio_vencimiento]].forEach(function (p) {
      if (!p[1]) return; var dias = diasHasta(p[1]); if (dias <= 30) items.push({ nombre: d.nombre_negocio || 'Cliente', tipo: p[0], dias: dias, f: p[1] });
    });
  });
  items.sort(function (a, b) { return a.dias - b.dias; });
  alertasEl.innerHTML = items.slice(0, 8).map(function (i) {
    var v = i.dias < 0, t = v ? 'Vencido hace ' + Math.abs(i.dias) + ' día(s)' : i.dias === 0 ? 'Vence hoy' : 'Vence en ' + i.dias + ' día(s)';
    return '<div class="alerta ' + (v ? 'vencido' : '') + '"><div><b>' + escapeHtml(i.nombre) + '</b>' + escapeHtml(i.tipo) + ' · ' + escapeHtml(i.f) + '</div><div>' + t + '</div></div>';
  }).join('');
}

/* ---------- Interacciones de lista / tablero ---------- */
document.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { vista = t.dataset.vista; render(); }); });
document.querySelectorAll('th[data-sort]').forEach(function (th) { th.addEventListener('click', function () { sortD = sortK === th.dataset.sort ? -sortD : 1; sortK = th.dataset.sort; render(); }); });
filas.addEventListener('click', function (e) { var tr = e.target.closest('tr'); var d = tr && clientes.find(function (x) { return x.id === tr.dataset.id; }); if (d) abrirModal(d); });
var tablero = $('#vTablero');
tablero.addEventListener('click', function (e) { if (e.target.closest('select')) return; var c = e.target.closest('.card'); var d = c && clientes.find(function (x) { return x.id === c.dataset.id; }); if (d) abrirModal(d); });
tablero.addEventListener('change', function (e) { var c = e.target.closest('.card'); if (c && e.target.classList.contains('mover')) cambiarEstado(c.dataset.id, e.target.value); });
tablero.addEventListener('dragstart', function (e) { var c = e.target.closest('.card'); if (!c) return; arrastrando = true; e.dataTransfer.setData('text/plain', c.dataset.id); });
tablero.addEventListener('dragend', function () { arrastrando = false; tablero.querySelectorAll('.sobre').forEach(function (x) { x.classList.remove('sobre'); }); });
tablero.addEventListener('dragover', function (e) { var col = e.target.closest('.col'); if (!col) return; e.preventDefault(); tablero.querySelectorAll('.sobre').forEach(function (x) { x.classList.remove('sobre'); }); col.classList.add('sobre'); });
tablero.addEventListener('drop', function (e) { var col = e.target.closest('.col'); if (!col) return; e.preventDefault(); arrastrando = false; cambiarEstado(e.dataTransfer.getData('text/plain'), col.dataset.estado); });
async function cambiarEstado(id, nuevo) {
  var d = clientes.find(function (x) { return x.id === id; }); if (!d || d.estado === nuevo) { render(); return; }
  var viejo = d.estado; d.estado = nuevo; render();
  var r = await sb.from('clientes').update({ estado: nuevo }).eq('id', id);
  if (r.error) { d.estado = viejo; render(); alert('No se pudo cambiar el estado: ' + r.error.message); }
}
var FILTROS = ['#filtroEstado', '#filtroPago', '#filtroPlan', '#filtroOrigen', '#filtroPeriodo', '#filtroExtra'];
['#buscar'].concat(FILTROS).forEach(function (s) { $(s).addEventListener('input', render); $(s).addEventListener('change', render); });
$('#btnLimpiar').addEventListener('click', function () { $('#buscar').value = ''; FILTROS.forEach(function (s) { $(s).value = ''; }); render(); });

/* ---------- Exportar CSV ---------- */
$('#btnCsv').addEventListener('click', function () {
  var C = [['Negocio', 'nombre_negocio'], ['Contacto', 'nombre_contacto'], ['WhatsApp', 'whatsapp'], ['Correo', 'correo'], ['Plan', 'plan'], ['Estado', 'estado'], ['Monto total', 'monto_total'], ['Estado pago', 'pago_estado'], ['Monto pendiente', 'monto_pendiente'],
    ['Mantención activa', function (d) { return d.mantencion_activa ? 'Sí' : 'No'; }], ['Precio mantención', 'mantencion_precio'], ['Venc. mantención', 'mantencion_vencimiento'], ['Hosting', 'hosting_proveedor'], ['Venc. hosting', 'hosting_vencimiento'],
    ['Dominio', 'dominio_nombre'], ['Venc. dominio', 'dominio_vencimiento'], ['Ciudad', function (d) { return (d.formulario || {}).ciudad; }], ['Rubro', function (d) { return (d.formulario || {}).rubro; }],
    ['Origen', 'origen'], ['Creado', function (d) { return fechaCL(d.creado_at); }], ['Nota general', 'notas'], ['Notas adicionales', function (d) { return (d.notas_historial || []).map(function (n) { return fechaCL(n.fecha) + ': ' + n.texto; }).join(' | '); }]];
  var cel = function (v) { var s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  var lineas = [C.map(function (c) { return cel(c[0]); }).join(';')].concat(visibles().map(function (d) { return C.map(function (c) { return cel(typeof c[1] === 'function' ? c[1](d) : d[c[1]]); }).join(';'); }));
  var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'clientes-webkrypto-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(a.href);
});

/* ---------- Modal ---------- */
var ETQ = { rubro: 'Rubro', ciudad: 'Ciudad / comuna', redes_sociales: 'Redes sociales', medio_cotizacion: 'Medio para cotización', medio_cotizacion_otro: 'Otro medio', horario_preferido: 'Horario preferido', sobre_negocio: 'Sobre el negocio', objetivo: 'Objetivo', objetivo_otro: 'Otro objetivo', secciones: 'Secciones', secciones_otra: 'Otra sección', funciones: 'Funciones', funciones_otra: 'Otra función', tiene_dominio: '¿Tiene dominio?', dominio: 'Dominio', tiene_hosting: '¿Tiene hosting?', fecha_publicacion: '¿Fecha de publicación?', fecha_publicacion_valor: 'Fecha deseada', info_adicional: 'Info adicional', acepta_politicas: 'Aceptó privacidad y términos' };
function urlSegura(u) {
  try { var x = new URL(String(u)); return x.origin === new URL(SUPABASE_URL).origin && x.pathname.indexOf('/storage/v1/object/public/adjuntos/') === 0; }
  catch (e) { return false; }
}
function correoSeguro(c) { return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(String(c || '')) && String(c).length <= 254; }
function renderNotas() {
  $('#listaNotas').innerHTML = notas.map(function (n, i) { return { n: n, i: i }; }).reverse().map(function (x) {
    return '<div class="nota"><small>' + escapeHtml(new Date(x.n.fecha).toLocaleString('es-CL')) + '</small><p>' + escapeHtml(x.n.texto) + '</p><button type="button" data-i="' + x.i + '" title="Borrar nota">' + ico('x') + '</button></div>';
  }).join('') || '<div class="meta">Aún no hay notas adicionales.</div>';
}
async function guardarNotas() {
  if (!clienteEditando) return true;
  var r = await sb.from('clientes').update({ notas_historial: notas }).eq('id', clienteEditando);
  if (r.error) { alert('No se pudo guardar la nota. ¿Ejecutaste migracion_panel.sql en Supabase?\n' + r.error.message); return false; }
  var d = clientes.find(function (x) { return x.id === clienteEditando; }); if (d) d.notas_historial = notas.slice(); render(); return true;
}
$('#btnNota').addEventListener('click', async function () {
  var t = $('#notaNueva').value.trim(); if (!t) return;
  notas.push({ fecha: new Date().toISOString(), texto: t });
  if (await guardarNotas()) { $('#notaNueva').value = ''; renderNotas(); } else notas.pop();
});
$('#listaNotas').addEventListener('click', async function (e) {
  var b = e.target.closest('button'); if (!b || !confirm('¿Borrar esta nota?')) return;
  var quitada = notas.splice(Number(b.dataset.i), 1); if (await guardarNotas()) renderNotas(); else { notas.push(quitada[0]); renderNotas(); }
});
function abrirModal(c) {
  clienteEditando = c ? c.id : null; notas = c && Array.isArray(c.notas_historial) ? c.notas_historial.slice() : [];
  $('#modalTitulo').textContent = c ? 'Editar cliente' : 'Nuevo cliente'; $('#btnEliminar').hidden = !c;
  form.reset(); $('#notaNueva').value = ''; $('#cajaAdjuntos').hidden = true; $('#cajaCrudo').hidden = true; $('#cajaForm').hidden = true;
  $('#rapidas').innerHTML = ''; $('#metaCliente').textContent = '';
  if (c) {
    var sel = form.elements.plan; if (c.plan && !Array.prototype.some.call(sel.options, function (o) { return o.value === c.plan; })) sel.add(new Option(c.plan, c.plan));
    Object.keys(c).forEach(function (k) { var el = form.elements[k]; if (!el) return; if (el.type === 'checkbox') el.checked = !!c[k]; else el.value = c[k] == null ? '' : c[k]; });
    var wa = String(c.whatsapp || '').replace(/\D/g, ''); if (wa.length === 9 && wa[0] === '9') wa = '56' + wa;
    $('#rapidas').innerHTML = (wa.length >= 8 ? '<a class="btn btn-secundario" target="_blank" rel="noopener noreferrer" href="https://wa.me/' + wa + '">' + ico('message') + ' WhatsApp</a>' : '') + (correoSeguro(c.correo) ? '<a class="btn btn-secundario" href="mailto:' + escapeHtml(encodeURIComponent(c.correo).replace(/%40/g, '@')) + '">' + ico('mail') + ' Correo</a>' : '');
    $('#metaCliente').textContent = 'Creado: ' + fechaCL(c.creado_at) + ' · Última modificación: ' + fechaCL(c.actualizado_at) + ' · Origen: ' + (c.origen === 'formulario' ? 'Web' : 'Manual');
    if (c.archivos && Object.keys(c.archivos).length) {
      $('#listaAdjuntos').innerHTML = Object.keys(c.archivos).map(function (campo) {
        var v = c.archivos[campo], urls = Array.isArray(v) ? v : [v];
        return urls.filter(urlSegura).map(function (u, i) { return '<a href="' + escapeHtml(u) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(campo) + (urls.length > 1 ? ' ' + (i + 1) : '') + '</a>'; }).join('');
      }).join(''); $('#cajaAdjuntos').hidden = false;
    }
    var f = c.formulario;
    if (f && Object.keys(f).length) {
      $('#datosForm').innerHTML = Object.keys(ETQ).filter(function (k) { var v = f[k]; return v && (!Array.isArray(v) || v.length); })
        .map(function (k) { return '<dt>' + escapeHtml(ETQ[k]) + '</dt><dd>' + escapeHtml(Array.isArray(f[k]) ? f[k].join(', ') : f[k]) + '</dd>'; }).join('');
      $('#cajaForm').hidden = !$('#datosForm').innerHTML; $('#formularioCrudo').textContent = JSON.stringify(f, null, 2); $('#cajaCrudo').hidden = false;
    }
  }
  renderNotas(); overlay.classList.add('abierto');
}
function cerrarModal() { overlay.classList.remove('abierto'); clienteEditando = null; }
$('#btnNuevo').addEventListener('click', function () { abrirModal(null); });
$('#btnCancelar').addEventListener('click', cerrarModal);
overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrarModal(); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('abierto')) cerrarModal(); });

/* ---------- Guardar / eliminar ---------- */
var CAMPOS_FORM = ['nombre_negocio', 'nombre_contacto', 'whatsapp', 'correo', 'plan', 'estado', 'monto_total', 'pago_estado', 'monto_pendiente', 'mantencion_activa', 'mantencion_precio', 'mantencion_vencimiento', 'hosting_proveedor', 'hosting_vencimiento', 'dominio_nombre', 'dominio_vencimiento', 'notas'];
form.addEventListener('submit', async function (e) {
  e.preventDefault(); var datos = {};
  CAMPOS_FORM.forEach(function (n) { var el = form.elements[n]; if (!el) return; datos[n] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? (el.value === '' ? 0 : Number(el.value)) : (el.value || null)); });
  try {
    var r = clienteEditando ? await sb.from('clientes').update(datos).eq('id', clienteEditando)
      : await sb.from('clientes').insert(Object.assign({ origen: 'manual' }, datos, notas.length ? { notas_historial: notas } : {}));
    if (r.error) throw r.error; cerrarModal(); cargarClientes();
  } catch (err) { console.error(err); alert('No se pudo guardar. Revisa los datos e inténtalo de nuevo.'); }
});
$('#btnEliminar').addEventListener('click', async function () {
  if (!clienteEditando || !confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return;
  var r = await sb.from('clientes').delete().eq('id', clienteEditando);
  if (r.error) { alert('No se pudo eliminar.'); return; } cerrarModal(); cargarClientes();
});

/* ---------- Carga ---------- */
async function cargarClientes() {
  var r = await sb.from('clientes').select('*').order('creado_at', { ascending: false }).limit(1000);
  if (r.error) { console.error(r.error); return; }
  clientes = (r.data || []).map(function (d) { d.estado = d.estado || 'Pendiente'; return d; }); poblarPlanes(); render();
}
$('#btnActualizar').addEventListener('click', cargarClientes);
setInterval(function () { if ($('#app').style.display === 'block' && !arrastrando && !overlay.classList.contains('abierto')) cargarClientes(); }, 30000);
sb.auth.getSession().then(function (r) { if (r.data && r.data.session) { $('#login').style.display = 'none'; $('#app').style.display = 'block'; cargarClientes(); } });