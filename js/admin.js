'use strict';
var SUPABASE_URL = 'https://melbzzocbenpoewlqvbr.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lbGJ6em9jYmVucG9ld2xxdmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNTk4NjcsImV4cCI6MjEwMTYzNTg2N30.bnXFTnmpKR0OTv_8_R3yI-iH0hX2pwG7kMrpyGSK56E';
var sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

var ESTADOS = ['Pendiente', 'Concretado', 'No concretado', 'Cancelado'];
var clienteEditando = null, notas = [], vista = 'tabla', sortK = 'creado', sortD = -1, arrastrando = false;
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
  if (ses) { cargarTodoSuave(); reiniciarInactividad(); } else { clearTimeout(temporizadorInactividad); resumen = []; filasPagina = []; datosStats = null; tabCols = {}; }
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
/* ---------- Datos: paginación, filtros y orden en el SERVIDOR ---------- */
// La tabla solo trae la página que estás viendo. Lo pesado (formulario, archivos y notas)
// se descarga únicamente al abrir un cliente; las estadísticas, solo al abrir esa pestaña.
var TAM_PAGINA = 20, pagina = 1, totalFilas = 0, filasPagina = [];
var resumen = [];                 // columnas livianas de todos los clientes: solo para KPIs, alertas y lista de planes
var datosStats = null;            // se carga al abrir la pestaña Estadísticas
var TABLERO_TAM = 10, tabCols = {};
var COLS_LISTA = 'id,nombre_negocio,nombre_contacto,ciudad,plan,servicio_interes,estado,pago_estado,monto_total,monto_pendiente,saldo_pendiente,mantencion_activa,mantencion_vencimiento,hosting_vencimiento,dominio_vencimiento,proximo_venc,origen,creado_at';
var COLS_RESUMEN = 'id,nombre_negocio,plan,estado,pago_estado,monto_total,monto_pendiente,mantencion_activa,mantencion_precio,mantencion_vencimiento,hosting_vencimiento,dominio_vencimiento,origen,creado_at';
var COLS_STATS = 'id,nombre_negocio,nombre_contacto,correo,whatsapp,plan,estado,pago_estado,monto_total,monto_pendiente,mantencion_activa,mantencion_precio,mantencion_vencimiento,hosting_vencimiento,dominio_vencimiento,dominio_nombre,hosting_proveedor,notas,origen,creado_at,formulario';
var COLS_CSV = 'nombre_negocio,nombre_contacto,whatsapp,correo,plan,estado,monto_total,pago_estado,monto_pendiente,mantencion_activa,mantencion_precio,mantencion_vencimiento,hosting_proveedor,hosting_vencimiento,dominio_nombre,dominio_vencimiento,ciudad,rubro,servicio_interes,origen,creado_at,notas,notas_historial';
var ORDEN = { negocio: 'nombre_negocio', contacto: 'nombre_contacto', ciudad: 'ciudad', plan: 'plan', estado: 'estado', pago: 'pago_estado', monto: 'monto_total', saldo: 'saldo_pendiente', venc: 'proximo_venc', creado: 'creado_at' };
var CAMPOS_BUSQUEDA = ['nombre_negocio', 'nombre_contacto', 'correo', 'whatsapp', 'plan', 'notas', 'dominio_nombre', 'hosting_proveedor', 'ciudad', 'rubro', 'servicio_interes'];

function isoLocal(dt) { return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2); }
// Quita los caracteres que tienen significado especial en los filtros de la API (evita "inyección" de filtros).
function limpiarBusqueda(q) { return String(q || '').replace(/[,()"'\\%*:;<>&=#?]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }

function aplicarFiltros(qb, estadoFijo) {
  var fe = estadoFijo !== undefined ? estadoFijo : (vista === 'tablero' ? '' : $('#filtroEstado').value);
  var fp = $('#filtroPago').value, fpl = $('#filtroPlan').value, fo = $('#filtroOrigen').value, per = Number($('#filtroPeriodo').value) || 0, ex = $('#filtroExtra').value;
  var q = limpiarBusqueda($('#buscar').value);
  if (fe && ESTADOS.indexOf(fe) >= 0) qb = qb.eq('estado', fe);
  if (fp) qb = qb.eq('pago_estado', fp);
  if (fpl) qb = fpl === 'Por definir' ? qb.or('plan.eq.Por definir,plan.is.null') : qb.eq('plan', fpl);
  if (fo) qb = qb.eq('origen', fo);
  if (per) qb = qb.gte('creado_at', new Date(Date.now() - per * 864e5).toISOString());
  if (ex === 'venc') { var lim = new Date(); lim.setDate(lim.getDate() + 30); qb = qb.lte('proximo_venc', isoLocal(lim)); }
  else if (ex === 'mant') qb = qb.eq('mantencion_activa', true);
  else if (ex === 'cobrar') qb = qb.gt('saldo_pendiente', 0);
  else if (ex === 'nuevo') qb = qb.eq('origen', 'formulario').eq('estado', 'Pendiente').gte('creado_at', new Date(Date.now() - 7 * 864e5).toISOString());
  if (q) qb = qb.or(CAMPOS_BUSQUEDA.map(function (c) { return c + '.ilike.*' + q + '*'; }).join(','));
  return qb;
}
function ordenar(qb) { return qb.order(ORDEN[sortK] || 'creado_at', { ascending: sortD > 0, nullsFirst: false }).order('id'); }

function planMostrado(d) { var p = d.plan || 'Por definir'; return p === 'Por definir' && d.servicio_interes ? d.servicio_interes + ' (interés)' : p; }

function errorDatos(err) {
  console.error(err);
  var m = String((err && err.message) || '');
  var falta = /column|does not exist|schema cache|42703|PGRST20/i.test(m);
  var av = $('#avisoDatos');
  av.textContent = falta ? 'Falta actualizar la base de datos: ejecuta migracion_paginacion.sql en Supabase (SQL Editor) y recarga el panel.' : 'No se pudieron cargar los datos. Revisa tu conexión y pulsa Actualizar.';
  av.hidden = false;
}
function sinError() { $('#avisoDatos').hidden = true; }

var tokenPagina = 0;
async function cargarPagina() {
  var mi = ++tokenPagina, desde = (pagina - 1) * TAM_PAGINA;
  $('#vTabla').classList.add('cargando');
  var r = await ordenar(aplicarFiltros(sb.from('clientes').select(COLS_LISTA, { count: 'exact' }))).range(desde, desde + TAM_PAGINA - 1);
  if (mi !== tokenPagina) return;
  $('#vTabla').classList.remove('cargando');
  if (r.error) { errorDatos(r.error); return; }
  sinError();
  totalFilas = r.count || 0;
  var maxPag = Math.max(1, Math.ceil(totalFilas / TAM_PAGINA));
  if (pagina > maxPag) { pagina = maxPag; return cargarPagina(); }
  filasPagina = r.data || [];
  renderTabla();
}

async function cargarColumna(e, reiniciar) {
  var c = tabCols[e] = tabCols[e] || { rows: [], total: 0 };
  var desde = reiniciar ? 0 : c.rows.length, cant = reiniciar ? Math.max(TABLERO_TAM, c.rows.length) : TABLERO_TAM;
  var r = await aplicarFiltros(sb.from('clientes').select(COLS_LISTA, { count: 'exact' }), e).order('creado_at', { ascending: false }).order('id').range(desde, desde + cant - 1);
  if (r.error) { errorDatos(r.error); return false; }
  c.total = r.count || 0; c.rows = reiniciar ? (r.data || []) : c.rows.concat(r.data || []);
  return true;
}
async function cargarTablero(reiniciar) {
  var ok = await Promise.all(ESTADOS.map(function (e) { return cargarColumna(e, reiniciar); }));
  if (ok.every(Boolean)) { sinError(); renderTablero(); }
}

async function traerTodo(cols, opciones) {
  // Baja los datos en bloques de 1000 (límite de la API). Solo lo usan KPIs, estadísticas y CSV.
  var todo = [], paso = 1000, tope = 20000;
  for (var i = 0; i < tope; i += paso) {
    var qb = sb.from('clientes').select(cols);
    if (opciones && opciones.filtrar) qb = aplicarFiltros(qb);
    qb = (opciones && opciones.ordenar) ? ordenar(qb) : qb.order('creado_at', { ascending: false }).order('id');
    var r = await qb.range(i, i + paso - 1);
    if (r.error) throw r.error;
    todo = todo.concat(r.data || []);
    if ((r.data || []).length < paso) break;
  }
  return todo;
}
async function cargarResumen() {
  try { resumen = await traerTodo(COLS_RESUMEN); } catch (err) { errorDatos(err); return; }
  renderResumen();
}
async function cargarStats(forzar) {
  if (!datosStats || forzar) {
    $('#vStats').textContent = 'Cargando estadísticas…';
    try { datosStats = await traerTodo(COLS_STATS); } catch (err) { errorDatos(err); return; }
  }
  renderStats();
}
function statsVisibles() {
  var fe = $('#filtroEstado').value;
  var v = (datosStats || []).filter(function (d) { return pasaFiltros(d, fe); });
  $('#contador').textContent = v.length + ' de ' + (datosStats || []).length + ' clientes'; return v;
}

function poblarPlanes() {
  var s = $('#filtroPlan'), act = s.value, ps = [];
  resumen.forEach(function (d) { var p = d.plan || 'Por definir'; if (ps.indexOf(p) < 0) ps.push(p); });
  s.innerHTML = '<option value="">Todos los planes</option>' + ps.sort().map(function (p) { return '<option>' + escapeHtml(p) + '</option>'; }).join(''); s.value = act;
}

// Filtro en el navegador: se usa SOLO sobre los datos de Estadísticas (la tabla y el tablero filtran en el servidor).
function pasaFiltros(d, fe) {
  var q = $('#buscar').value.trim().toLowerCase(), fp = $('#filtroPago').value, fpl = $('#filtroPlan').value, fo = $('#filtroOrigen').value, per = $('#filtroPeriodo').value, ex = $('#filtroExtra').value, p = proximoVencimiento(d);
  if (fe && d.estado !== fe) return false; if (fp && d.pago_estado !== fp) return false; if (fpl && (d.plan || 'Por definir') !== fpl) return false; if (fo && d.origen !== fo) return false;
  if (per && !(d.creado_at && Date.now() - new Date(d.creado_at) < per * 864e5)) return false;
  if (ex === 'venc' && !(p && p.dias <= 30)) return false; if (ex === 'mant' && !d.mantencion_activa) return false; if (ex === 'cobrar' && !porCobrar(d)) return false; if (ex === 'nuevo' && !esNuevo(d)) return false;
  return !q || textoBusqueda(d).indexOf(q) >= 0;
}
/* ---------- Render ---------- */
function renderResumen() { renderKpis(); renderAlertas(); poblarPlanes(); }
function mostrarVista() {
  $('#vTabla').hidden = vista !== 'tabla'; $('#vTablero').hidden = vista !== 'tablero'; $('#vStats').hidden = vista !== 'stats';
  $('#paginacion').hidden = vista !== 'tabla' || totalFilas === 0;
  $('#filtroEstado').style.display = vista === 'tablero' ? 'none' : '';
  document.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('act', t.dataset.vista === vista); });
}
function cargarVista() {
  mostrarVista();
  if (vista === 'tabla') return cargarPagina();
  if (vista === 'tablero') return cargarTablero(true);
  return cargarStats(false);
}
function cargarTodo() { datosStats = null; return Promise.all([cargarResumen(), cargarVista()]); }
var ultimaCarga = 0;
function cargarTodoSuave() { if (Date.now() - ultimaCarga < 2000) return; ultimaCarga = Date.now(); cargarTodo(); }

function renderTabla() {
  var v = filasPagina; vacio.hidden = v.length > 0;
  $('#contador').textContent = totalFilas + ' de ' + resumen.length + ' clientes';
  document.querySelectorAll('th[data-sort]').forEach(function (th) {
    th.textContent = th.textContent.replace(/ [▲▼]$/, '') + (th.dataset.sort === sortK ? (sortD > 0 ? ' ▲' : ' ▼') : '');
  });
  filas.innerHTML = v.map(function (d) {
    var p = proximoVencimiento(d);
    var pt = p ? p.tipo + ': ' + (p.dias < 0 ? 'vencido hace ' + Math.abs(p.dias) + 'd' : p.dias === 0 ? 'hoy' : 'en ' + p.dias + 'd') : '—';
    return '<tr data-id="' + escapeHtml(d.id) + '"><td>' + escapeHtml(d.nombre_negocio || '—') + (esNuevo(d) ? '<span class="badge b-nuevo">Nuevo</span>' : '') + '</td><td>' + escapeHtml(d.nombre_contacto || '—') + '</td><td>' + escapeHtml(d.ciudad || '—') + '</td><td>' + escapeHtml(planMostrado(d)) + '</td><td>' + badgeEstado(d.estado) + '</td><td>' + badgePago(d.pago_estado) + '</td><td>' + (d.monto_total ? fmt(d.monto_total) : '—') + '</td><td>' + (porCobrar(d) ? fmt(porCobrar(d)) : '—') + '</td><td>' + escapeHtml(pt) + '</td><td>' + fechaCL(d.creado_at) + '</td><td class="origen">' + (d.origen === 'formulario' ? ico('globe') + ' Web' : ico('pen') + ' Manual') + '</td></tr>';
  }).join('');
  renderPaginacion();
}
function renderPaginacion() {
  var total = Math.max(1, Math.ceil(totalFilas / TAM_PAGINA));
  var ini = totalFilas ? (pagina - 1) * TAM_PAGINA + 1 : 0, fin = Math.min(pagina * TAM_PAGINA, totalFilas);
  $('#paginacion').hidden = vista !== 'tabla' || totalFilas === 0;
  $('#pagInfo').textContent = 'Mostrando ' + ini + '–' + fin + ' de ' + totalFilas + ' · Página ' + pagina + ' de ' + total;
  var cont = $('#pagBotones'); cont.textContent = '';
  function boton(txt, p, o) {
    o = o || {}; var b = document.createElement('button'); b.type = 'button'; b.className = 'pag-btn' + (o.act ? ' act' : ''); b.textContent = txt;
    if (o.label) b.setAttribute('aria-label', o.label); if (o.act) b.setAttribute('aria-current', 'page');
    if (o.off) b.disabled = true; else b.addEventListener('click', function () { irAPagina(p); });
    cont.appendChild(b);
  }
  boton('«', 1, { off: pagina === 1, label: 'Primera página' }); boton('‹', pagina - 1, { off: pagina === 1, label: 'Página anterior' });
  var a = Math.max(1, Math.min(pagina - 2, total - 4)), z = Math.min(total, a + 4);
  for (var p = a; p <= z; p++) boton(String(p), p, { act: p === pagina, label: 'Ir a la página ' + p });
  boton('›', pagina + 1, { off: pagina === total, label: 'Página siguiente' }); boton('»', total, { off: pagina === total, label: 'Última página' });
}
function irAPagina(p) { pagina = p; cargarPagina(); $('#vTabla').scrollIntoView({ block: 'start', behavior: 'smooth' }); }

function renderTablero() {
  $('#contador').textContent = ESTADOS.reduce(function (s, e) { return s + (tabCols[e] ? tabCols[e].total : 0); }, 0) + ' de ' + resumen.length + ' clientes';
  $('#vTablero').innerHTML = ESTADOS.map(function (e) {
    var col = tabCols[e] || { rows: [], total: 0 };
    return '<div class="col" data-estado="' + escapeHtml(e) + '"><h3>' + escapeHtml(e) + '<span>' + col.rows.length + ' de ' + col.total + '</span></h3>' + col.rows.map(function (d) {
      return '<div class="card" draggable="true" data-id="' + escapeHtml(d.id) + '"><b>' + escapeHtml(d.nombre_negocio || '—') + '</b>' + (esNuevo(d) ? '<span class="badge b-nuevo">Nuevo</span>' : '') +
        '<div class="sub">' + escapeHtml(d.nombre_contacto || '—') + ' · ' + escapeHtml(planMostrado(d)) + '</div><div class="sub">' + (d.monto_total ? fmt(d.monto_total) + ' · ' : '') + badgePago(d.pago_estado) + '</div>' +
        '<select class="mover">' + ESTADOS.map(function (x) { return '<option' + (x === e ? ' selected' : '') + '>' + escapeHtml(x) + '</option>'; }).join('') + '</select></div>';
    }).join('') + (col.rows.length < col.total ? '<button type="button" class="btn btn-secundario vermas" data-estado="' + escapeHtml(e) + '">Ver más (' + (col.total - col.rows.length) + ')</button>' : '') + '</div>';
  }).join('');
}
function renderKpis() {
  var ahora = Date.now(), web = resumen.filter(function (d) { return d.origen === 'formulario'; });
  var sem = web.filter(function (d) { return ahora - new Date(d.creado_at) < 7 * 864e5; }).length, mes = web.filter(function (d) { return ahora - new Date(d.creado_at) < 30 * 864e5; }).length;
  var conc = resumen.filter(function (d) { return d.estado === 'Concretado'; }), noc = resumen.filter(function (d) { return d.estado === 'No concretado'; }).length;
  var pend = resumen.filter(function (d) { return d.estado === 'Pendiente'; }).length, sum = function (a, f) { return a.reduce(function (s, d) { return s + f(d); }, 0); };
  var xc = resumen.filter(function (d) { return porCobrar(d) > 0; }), mant = resumen.filter(function (d) { return d.mantencion_activa; });
  var k = [['Leads nuevos (7 días)', sem, mes + ' en 30 días'], ['Pendientes de cerrar', pend, resumen.length + ' clientes en total'],
    ['Tasa de cierre', conc.length + noc ? Math.round(conc.length / (conc.length + noc) * 100) + '%' : '—', conc.length + ' concretados · ' + noc + ' no concretados'],
    ['Cobrado', fmt(sum(resumen, cobrado)), 'de ' + fmt(sum(conc, function (d) { return d.monto_total || 0; })) + ' cerrado'],
    ['Por cobrar', fmt(sum(resumen, porCobrar)), xc.length + ' cliente(s)'], ['Mantención mensual', fmt(sum(mant, function (d) { return d.mantencion_precio || 0; })), mant.length + ' activa(s)'],
    ['Ticket promedio', conc.length ? fmt(sum(conc, function (d) { return d.monto_total || 0; }) / conc.length) : '—', 'por proyecto concretado'],
    ['Vencen en 30 días', resumen.filter(function (d) { var p = proximoVencimiento(d); return p && p.dias <= 30; }).length, 'mantención, hosting o dominio']];
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
  var L = statsVisibles(), meses = [], cnt = {}, ing = {}, planes = {}, i, dt;
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
    barras('Servicio de interés', conteo(L, F('servicio_interes'))) + barras('Medio preferido de cotización', conteo(L, F('medio_cotizacion'))) + barras('Rubros más comunes', conteo(L, F('rubro'))) + barras('Ciudades / comunas', conteo(L, F('ciudad'))) +
    barras('Objetivos más pedidos', conteo(L, F('objetivo'))) + barras('Funciones más pedidas', conteo(L, F('funciones'))) + barras('Secciones más pedidas', conteo(L, F('secciones'))) + barras('¿Ya tienen dominio?', conteo(L, F('tiene_dominio')));
}
function renderAlertas() {
  var items = [];
  resumen.forEach(function (d) {
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
document.querySelectorAll('.tab').forEach(function (t) { t.addEventListener('click', function () { vista = t.dataset.vista; cargarVista(); }); });
document.querySelectorAll('th[data-sort]').forEach(function (th) { th.addEventListener('click', function () { sortD = sortK === th.dataset.sort ? -sortD : 1; sortK = th.dataset.sort; pagina = 1; cargarPagina(); }); });
filas.addEventListener('click', function (e) { var tr = e.target.closest('tr'); if (tr && tr.dataset.id) abrirModalPorId(tr.dataset.id); });
var tablero = $('#vTablero');
function estadoEnTablero(id) {
  for (var k = 0; k < ESTADOS.length; k++) { var c = tabCols[ESTADOS[k]]; if (c && c.rows.some(function (x) { return x.id === id; })) return ESTADOS[k]; }
  return null;
}
tablero.addEventListener('click', async function (e) {
  var mas = e.target.closest('.vermas');
  if (mas) { mas.disabled = true; if (await cargarColumna(mas.dataset.estado, false)) renderTablero(); else mas.disabled = false; return; }
  if (e.target.closest('select')) return;
  var c = e.target.closest('.card'); if (c) abrirModalPorId(c.dataset.id);
});
tablero.addEventListener('change', function (e) { var c = e.target.closest('.card'); if (c && e.target.classList.contains('mover')) cambiarEstado(c.dataset.id, e.target.value); });
tablero.addEventListener('dragstart', function (e) { var c = e.target.closest('.card'); if (!c) return; arrastrando = true; e.dataTransfer.setData('text/plain', c.dataset.id); });
tablero.addEventListener('dragend', function () { arrastrando = false; tablero.querySelectorAll('.sobre').forEach(function (x) { x.classList.remove('sobre'); }); });
tablero.addEventListener('dragover', function (e) { var col = e.target.closest('.col'); if (!col) return; e.preventDefault(); tablero.querySelectorAll('.sobre').forEach(function (x) { x.classList.remove('sobre'); }); col.classList.add('sobre'); });
tablero.addEventListener('drop', function (e) { var col = e.target.closest('.col'); if (!col) return; e.preventDefault(); arrastrando = false; cambiarEstado(e.dataTransfer.getData('text/plain'), col.dataset.estado); });
async function cambiarEstado(id, nuevo) {
  if (ESTADOS.indexOf(nuevo) < 0 || !/^[0-9a-f-]{36}$/i.test(String(id))) return;
  if (estadoEnTablero(id) === nuevo) { renderTablero(); return; }
  var r = await sb.from('clientes').update({ estado: nuevo }).eq('id', id);
  if (r.error) { alert('No se pudo cambiar el estado: ' + r.error.message); }
  cargarTodo();
}
var FILTROS = ['#filtroEstado', '#filtroPago', '#filtroPlan', '#filtroOrigen', '#filtroPeriodo', '#filtroExtra'];
function aplicarCambioFiltro() { pagina = 1; if (vista === 'stats') { if (datosStats) renderStats(); else cargarStats(false); } else cargarVista(); }
var temporizadorBusqueda = null;
$('#buscar').addEventListener('input', function () { clearTimeout(temporizadorBusqueda); temporizadorBusqueda = setTimeout(aplicarCambioFiltro, 300); });
FILTROS.forEach(function (s) { $(s).addEventListener('change', aplicarCambioFiltro); });
$('#btnLimpiar').addEventListener('click', function () { $('#buscar').value = ''; FILTROS.forEach(function (s) { $(s).value = ''; }); aplicarCambioFiltro(); });
$('#tamPagina').addEventListener('change', function () { TAM_PAGINA = Math.min(100, Math.max(5, Number(this.value) || 20)); pagina = 1; cargarPagina(); });

/* ---------- Exportar CSV (baja TODOS los resultados del filtro actual, solo al pulsar el botón) ---------- */
$('#btnCsv').addEventListener('click', async function () {
  var btn = this, txt = btn.innerHTML; btn.disabled = true; btn.textContent = 'Exportando…';
  try {
    var datos = await traerTodo(COLS_CSV, { filtrar: true, ordenar: true });
    var C = [['Negocio', 'nombre_negocio'], ['Contacto', 'nombre_contacto'], ['WhatsApp', 'whatsapp'], ['Correo', 'correo'], ['Plan', 'plan'], ['Servicio de interés', 'servicio_interes'], ['Estado', 'estado'], ['Monto total', 'monto_total'], ['Estado pago', 'pago_estado'], ['Monto pendiente', 'monto_pendiente'],
      ['Mantención activa', function (d) { return d.mantencion_activa ? 'Sí' : 'No'; }], ['Precio mantención', 'mantencion_precio'], ['Venc. mantención', 'mantencion_vencimiento'], ['Hosting', 'hosting_proveedor'], ['Venc. hosting', 'hosting_vencimiento'],
      ['Dominio', 'dominio_nombre'], ['Venc. dominio', 'dominio_vencimiento'], ['Ciudad', 'ciudad'], ['Rubro', 'rubro'],
      ['Origen', 'origen'], ['Creado', function (d) { return fechaCL(d.creado_at); }], ['Nota general', 'notas'], ['Notas adicionales', function (d) { return (d.notas_historial || []).map(function (n) { return fechaCL(n.fecha) + ': ' + n.texto; }).join(' | '); }]];
    var cel = function (v) { var s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    var lineas = [C.map(function (c) { return cel(c[0]); }).join(';')].concat(datos.map(function (d) { return C.map(function (c) { return cel(typeof c[1] === 'function' ? c[1](d) : d[c[1]]); }).join(';'); }));
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'clientes-webkrypto-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(a.href);
  } catch (err) { errorDatos(err); }
  btn.disabled = false; btn.innerHTML = txt;
});

/* ---------- Modal ---------- */
var ETQ = { servicio_interes: 'Servicio de interés', rubro: 'Rubro', ciudad: 'Ciudad / comuna', redes_sociales: 'Redes sociales', medio_cotizacion: 'Medio para cotización', medio_cotizacion_otro: 'Otro medio', horario_preferido: 'Horario preferido', sobre_negocio: 'Sobre el negocio', objetivo: 'Objetivo', objetivo_otro: 'Otro objetivo', secciones: 'Secciones', secciones_otra: 'Otra sección', funciones: 'Funciones', funciones_otra: 'Otra función', tiene_dominio: '¿Tiene dominio?', dominio: 'Dominio', tiene_hosting: '¿Tiene hosting?', fecha_publicacion: '¿Fecha de publicación?', fecha_publicacion_valor: 'Fecha deseada', info_adicional: 'Info adicional', acepta_politicas: 'Aceptó privacidad y términos' };
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
  return true;
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
async function abrirModalPorId(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return;
  var r = await sb.from('clientes').select('*').eq('id', id).single();   // aquí sí se baja el detalle completo
  if (r.error || !r.data) { errorDatos(r.error); return; }
  abrirModal(r.data);
}
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
    $('#metaCliente').textContent = 'Creado: ' + fechaCL(c.creado_at) + ' · Última modificación: ' + fechaCL(c.actualizado_at) + ' · Origen: ' + (c.origen === 'formulario' ? 'Web' : 'Manual') + (c.servicio_interes ? ' · Servicio de interés: ' + c.servicio_interes : '');
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
    if (r.error) throw r.error; cerrarModal(); cargarTodo();
  } catch (err) { console.error(err); alert('No se pudo guardar. Revisa los datos e inténtalo de nuevo.'); }
});
$('#btnEliminar').addEventListener('click', async function () {
  if (!clienteEditando || !confirm('¿Eliminar este cliente? Esta acción no se puede deshacer.')) return;
  var r = await sb.from('clientes').delete().eq('id', clienteEditando);
  if (r.error) { alert('No se pudo eliminar.'); return; } cerrarModal(); cargarTodo();
});

/* ---------- Carga ---------- */
$('#btnActualizar').addEventListener('click', function () { cargarTodo(); });
var ticks = 0;
setInterval(function () {
  if ($('#app').style.display !== 'block' || arrastrando || overlay.classList.contains('abierto') || document.hidden) return;
  ticks++;
  if (ticks % 5 === 0) cargarResumen();              // KPIs cada ~2,5 min
  if (vista !== 'stats') cargarVista();              // solo lo que estás viendo, cada 30 s
}, 30000);
sb.auth.getSession().then(function (r) { if (r.data && r.data.session) { $('#login').style.display = 'none'; $('#app').style.display = 'block'; cargarTodoSuave(); } });
