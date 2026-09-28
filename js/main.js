'use strict';
var STORAGE_KEY = 'webkrypto_form_v1';
var SUPABASE_URL = 'https://melbzzocbenpoewlqvbr.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1lbGJ6em9jYmVucG9ld2xxdmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNTk4NjcsImV4cCI6MjEwMTYzNTg2N30.bnXFTnmpKR0OTv_8_R3yI-iH0hX2pwG7kMrpyGSK56E';
var MAX_MB = 10;

/* ---------- Menú móvil ---------- */
var navToggle = document.getElementById('navToggle');
var navMenu = document.getElementById('navMenu');

navToggle.addEventListener('click', function () {
    var abierto = navMenu.classList.toggle('abierto');
    navToggle.classList.toggle('activo', abierto);
    navToggle.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    document.body.style.overflow = abierto ? 'hidden' : '';
});

navMenu.querySelectorAll('a').forEach(function (enlace) {
    enlace.addEventListener('click', function () {
        navMenu.classList.remove('abierto');
        navToggle.classList.remove('activo');
        navToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
    });
});

/* ---------- Carrusel de banners ---------- */
(function () {
    var carrusel = document.querySelector('.hero-carousel');
    if (!carrusel) return;

    var track = carrusel.querySelector('.hero-carousel-track');
    var slides = Array.from(carrusel.querySelectorAll('.hero-slide'));
    var puntosCont = document.getElementById('heroPuntos');
    var btnAnterior = document.getElementById('heroAnterior');
    var btnSiguiente = document.getElementById('heroSiguiente');
    var INTERVALO_MS = 8000;
    var indice = 0;
    var temporizador = null;

    if (slides.length < 2) {
        if (btnAnterior) btnAnterior.hidden = true;
        if (btnSiguiente) btnSiguiente.hidden = true;
        return;
    }

    slides.forEach(function (_, i) {
        var punto = document.createElement('button');
        punto.type = 'button';
        punto.className = 'hero-punto' + (i === 0 ? ' activo' : '');
        punto.setAttribute('aria-label', 'Ir al banner ' + (i + 1));
        punto.addEventListener('click', function () {
            irA(i);
            reiniciarAuto();
        });
        puntosCont.appendChild(punto);
    });
    var puntos = Array.from(puntosCont.children);

    function irA(i) {
        indice = (i + slides.length) % slides.length;
        track.style.transform = 'translateX(-' + (indice * 100) + '%)';
        puntos.forEach(function (p, j) { p.classList.toggle('activo', j === indice); });
    }

    function siguiente() { irA(indice + 1); }
    function anterior() { irA(indice - 1); }

    function iniciarAuto() { temporizador = setInterval(siguiente, INTERVALO_MS); }
    function detenerAuto() { clearInterval(temporizador); }
    function reiniciarAuto() { detenerAuto(); iniciarAuto(); }

    btnSiguiente.addEventListener('click', function () { siguiente(); reiniciarAuto(); });
    btnAnterior.addEventListener('click', function () { anterior(); reiniciarAuto(); });

    carrusel.addEventListener('mouseenter', detenerAuto);
    carrusel.addEventListener('mouseleave', iniciarAuto);

    iniciarAuto();
})();

/* ---------- Animaciones al hacer scroll ---------- */
(function () {
    var gruposConDesfase = [
        '.container .card',
        '.planes .plan',
        '.proceso .proceso-paso',
        '.faq-item'
    ];
    var titulosSinDesfase = [
        '.servicios-titulo', '.servicios-subtitulo',
        '.cta-title', '.cta-aviso',
        '.faq-titulo'
    ];

    gruposConDesfase.forEach(function (selector) {
        document.querySelectorAll(selector).forEach(function (el, i) {
            el.classList.add('reveal');
            el.style.transitionDelay = (i % 4) * 0.12 + 's';
        });
    });

    titulosSinDesfase.forEach(function (selector) {
        document.querySelectorAll(selector).forEach(function (el) {
            el.classList.add('reveal');
        });
    });

    if ('IntersectionObserver' in window) {
        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

        document.querySelectorAll('.reveal').forEach(function (el) {
            observer.observe(el);
        });
    } else {
        document.querySelectorAll('.reveal').forEach(function (el) {
            el.classList.add('visible');
        });
    }
})();

var modal = document.getElementById('modalFormulario');
var form = document.getElementById('formInicio');
var pasos = Array.from(form.querySelectorAll('.paso'));
var btnAtras = document.getElementById('btnAtras');
var btnSiguiente = document.getElementById('btnSiguiente');
var btnEnviar = document.getElementById('btnEnviar');
var barra = document.getElementById('progresoBarra');
var textoPaso = document.getElementById('progresoTexto');
var avisoBorrador = document.getElementById('avisoBorrador');
var actual = 0;
var tAbierto = Date.now();

function abrirFormulario() {
    tAbierto = Date.now();
    modal.classList.add('activo');
    document.body.style.overflow = 'hidden';
}

function cerrarFormulario() {
    modal.classList.remove('activo');
    document.body.style.overflow = '';
}

document.getElementById('btnAbrirForm').addEventListener('click', abrirFormulario);
document.getElementById('btnCerrarForm').addEventListener('click', cerrarFormulario);

modal.addEventListener('click', function (e) {
    if (e.target === modal) cerrarFormulario();
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('activo')) cerrarFormulario();
});

/* ---------- Wizard ---------- */
function mostrarPaso(n) {
    actual = n;
    pasos.forEach(function (p, i) { p.classList.toggle('activo', i === n); });
    textoPaso.textContent = 'Paso ' + (n + 1) + ' de ' + pasos.length;
    barra.style.width = ((n + 1) / pasos.length * 100) + '%';
    btnAtras.hidden = n === 0;
    btnSiguiente.hidden = n === pasos.length - 1;
    btnEnviar.hidden = n !== pasos.length - 1;
    modal.querySelector('.modal-box').scrollTop = 0;
    guardar();
}

/* ---------- Validación ---------- */
function normalizarWhatsapp(v) {
    var s = v.replace(/[\s\-().]/g, '');
    var m = s.match(/^(?:\+?56)?(9\d{8})$/);
    if (m) return '+56 9 ' + m[1].slice(1, 5) + ' ' + m[1].slice(5);
    if (/^\+(?!56)\d{8,15}$/.test(s)) return s;
    return null;
}

function validarContacto() {
    var w = form.elements.whatsapp;
    var c = form.elements.correo;
    w.setCustomValidity('');
    if (!w.value.trim() && !c.value.trim()) {
        w.setCustomValidity('Ingresa un WhatsApp o un correo para poder contactarte.');
    } else if (w.value.trim() && !normalizarWhatsapp(w.value.trim())) {
        w.setCustomValidity('Ingresa un número válido, por ejemplo +56 9 1234 5678.');
    }
}

function validarPaso(i) {
    if (pasos[i].dataset.paso === 'contacto') validarContacto();
    var campos = pasos[i].querySelectorAll('input, textarea');
    for (var k = 0; k < campos.length; k++) {
        if (!campos[k].checkValidity()) {
            campos[k].reportValidity();
            return false;
        }
    }
    return true;
}

form.elements.whatsapp.addEventListener('input', validarContacto);
form.elements.correo.addEventListener('input', validarContacto);
form.elements.whatsapp.addEventListener('change', function () {
    var n = normalizarWhatsapp(this.value.trim());
    if (n) this.value = n;
});

form.querySelectorAll('input[type="file"]').forEach(function (f) {
    f.addEventListener('change', function () {
        var muyGrande = Array.from(f.files).some(function (a) { return a.size > MAX_MB * 1024 * 1024; });
        f.setCustomValidity(muyGrande ? 'Cada archivo debe pesar menos de ' + MAX_MB + ' MB.' : '');
        if (muyGrande) f.reportValidity();
    });
});

btnSiguiente.addEventListener('click', function () {
    if (validarPaso(actual)) mostrarPaso(actual + 1);
});
btnAtras.addEventListener('click', function () { mostrarPaso(actual - 1); });

/* ---------- Borrador en localStorage ---------- */
function guardar() {
    try {
        var d = { paso: actual, t: Date.now(), v: {} };
        var hayDatos = false;
        Array.from(form.elements).forEach(function (el) {
            if (!el.name || el.type === 'file' || el.name === 'sitio_web') return;
            if (el.type === 'checkbox' || el.type === 'radio') {
                if (el.checked) { (d.v[el.name] = d.v[el.name] || []).push(el.value); hayDatos = true; }
            } else {
                d.v[el.name] = el.value;
                if (el.value) hayDatos = true;
            }
        });
        if (hayDatos) localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
        else localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
}

function restaurar() {
    try {
        var d = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (!d || typeof d !== 'object' || !d.v || typeof d.v !== 'object') return false;
        if (!d.t || Date.now() - d.t > 7 * 24 * 3600 * 1000) { localStorage.removeItem(STORAGE_KEY); return false; }
        Array.from(form.elements).forEach(function (el) {
            if (!el.name || el.type === 'file' || el.name === 'sitio_web' || !Object.prototype.hasOwnProperty.call(d.v, el.name)) return;
            var guardado = d.v[el.name];
            if (el.type === 'checkbox' || el.type === 'radio') el.checked = Array.isArray(guardado) && guardado.indexOf(el.value) > -1;
            else el.value = String(guardado).slice(0, 1500);
        });
        actual = Math.min(Math.max(parseInt(d.paso, 10) || 0, 0), pasos.length - 1);
        return true;
    } catch (e) { return false; }
}

function borrarBorrador() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
}

form.addEventListener('input', guardar);
form.addEventListener('change', guardar);

document.getElementById('btnBorrar').addEventListener('click', function () {
    form.reset();
    avisoBorrador.hidden = true;
    mostrarPaso(0);
    borrarBorrador();
});

/* ---------- Seguridad: saneo y validación de lo que se envía ---------- */
var MAX_CAMPO = { correo: 254, whatsapp: 20, dominio: 253, sobre_negocio: 1500, info_adicional: 1500 };
var MAX_CAMPO_DEF = 100;
var TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
var EXT_OK = /\.(jpe?g|png|webp|gif|pdf)$/i;
var MAX_ARCHIVOS = 5;
var ESPERA_ENTRE_ENVIOS_MS = 60 * 1000;      // mínimo entre un envío y otro
var MAX_ENVIOS_POR_HORA = 3;                  // máximo de envíos por hora desde este navegador
var CLAVE_ENVIOS = 'webkrypto_envios';
var CAMPOS_CONOCIDOS = {};
var VALORES_OK = {};
Array.from(form.elements).forEach(function (el) {
    if (!el.name) return;
    CAMPOS_CONOCIDOS[el.name] = true;
    if (el.type === 'checkbox' || el.type === 'radio') (VALORES_OK[el.name] = VALORES_OK[el.name] || []).push(el.value);
});

function limpiar(v, max) {
    // Quita caracteres de control y de dirección de texto (trucos de spoofing) y limita el largo.
    // No se "escapa" HTML aquí: eso se hace al mostrar los datos (ver admin.js).
    return String(v == null ? '' : v)
        .normalize('NFC')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
        .trim()
        .slice(0, max);
}

function valorPermitido(nombre, valor) {
    return (VALORES_OK[nombre] || []).indexOf(valor) > -1;
}

function nombreSeguro(n) {
    var base = String(n || 'archivo').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').replace(/_+/g, '_');
    var m = base.match(/\.([A-Za-z0-9]{1,5})$/);
    var ext = m ? m[0].toLowerCase() : '';
    return (base.slice(0, base.length - ext.length).slice(0, 60) || 'archivo') + ext;
}

function uuid4() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.from(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
}

function enviosRecientes() {
    try {
        var lista = JSON.parse(localStorage.getItem(CLAVE_ENVIOS)) || [];
        var desde = Date.now() - 3600 * 1000;
        return Array.isArray(lista) ? lista.filter(function (t) { return typeof t === 'number' && t > desde; }) : [];
    } catch (e) { return []; }
}

// Devuelve un texto explicando la espera si se superó el límite, o '' si puede enviar.
function mensajeLimite() {
    var lista = enviosRecientes();
    if (!lista.length) return '';
    var ultimo = Math.max.apply(null, lista);
    var espera = ESPERA_ENTRE_ENVIOS_MS - (Date.now() - ultimo);
    if (espera > 0) {
        return 'Ya enviaste un formulario hace un momento. Espera ' + Math.ceil(espera / 1000) + ' segundos antes de enviar otro.';
    }
    if (lista.length >= MAX_ENVIOS_POR_HORA) {
        var minutos = Math.ceil((Math.min.apply(null, lista) + 3600 * 1000 - Date.now()) / 60000);
        return 'Alcanzaste el máximo de ' + MAX_ENVIOS_POR_HORA + ' formularios por hora. Inténtalo de nuevo en ' + minutos + ' minuto(s) o escríbenos por Instagram (@web_krypto).';
    }
    return '';
}

function registrarEnvio() {
    try {
        var lista = enviosRecientes();
        lista.push(Date.now());
        localStorage.setItem(CLAVE_ENVIOS, JSON.stringify(lista));
    } catch (e) {}
}

var sbPublico = null;
function getSb() {
    // Formulario público: no necesita guardar sesión de usuario en el navegador.
    if (!sbPublico) sbPublico = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    return sbPublico;
}

/* ---------- Envío a Supabase ---------- */
var CAMPOS_PRINCIPALES = ['nombre_negocio', 'nombre_contacto', 'whatsapp', 'correo'];

async function enviarFormulario() {
    var sb = getSb();

    var formulario = {};
    var camposArchivo = [];
    Array.from(form.elements).forEach(function (el) {
        if (!el.name || el.name === 'sitio_web' || !CAMPOS_CONOCIDOS[el.name]) return;
        if (el.type === 'file') { camposArchivo.push(el); return; }
        if (el.type === 'checkbox') {
            if (el.checked && valorPermitido(el.name, el.value)) {
                (formulario[el.name] = formulario[el.name] || []).push(limpiar(el.value, 100));
            }
            return;
        }
        if (el.type === 'radio') {
            if (el.checked && valorPermitido(el.name, el.value)) formulario[el.name] = limpiar(el.value, 100);
            return;
        }
        var v = limpiar(el.value, MAX_CAMPO[el.name] || MAX_CAMPO_DEF);
        if (v) formulario[el.name] = v;
    });
    if (formulario.whatsapp) formulario.whatsapp = normalizarWhatsapp(formulario.whatsapp) || '';

    var idNuevo = uuid4();
    var archivos = {};

    for (var i = 0; i < camposArchivo.length; i++) {
        var el = camposArchivo[i];
        if (!el.files || !el.files.length) continue;
        var lista = Array.from(el.files).slice(0, MAX_ARCHIVOS);
        var urls = [];
        for (var j = 0; j < lista.length; j++) {
            var f = lista[j];
            if (f.size > MAX_MB * 1024 * 1024 || TIPOS_OK.indexOf(f.type) < 0 || !EXT_OK.test(f.name)) {
                throw new Error('archivo_no_permitido');
            }
            var ruta = idNuevo + '/' + nombreSeguro(el.name) + '-' + Date.now() + '-' + nombreSeguro(f.name);
            var subida = await sb.storage.from('adjuntos').upload(ruta, f, { contentType: f.type });
            if (subida.error) throw subida.error;
            urls.push(sb.storage.from('adjuntos').getPublicUrl(ruta).data.publicUrl);
        }
        archivos[el.name] = el.multiple ? urls : urls[0];
    }

    var fila = { id: idNuevo, formulario: formulario, archivos: archivos, origen: 'formulario' };
    CAMPOS_PRINCIPALES.forEach(function (c) { fila[c] = formulario[c] || ''; });

    var insercion = await sb.from('clientes').insert(fila);
    if (insercion.error) throw insercion.error;
    registrarEnvio();
}

/* ---------- Envío ---------- */
form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (actual < pasos.length - 1) { btnSiguiente.click(); return; }

    for (var i = 0; i < pasos.length; i++) {
        if (!validarPaso(i)) {
            mostrarPaso(i);
            validarPaso(i);
            return;
        }
    }

    var limite = mensajeLimite();
    if (limite) { alert(limite); return; }

    btnEnviar.disabled = true;
    try {
        var esBot = (form.elements['sitio_web'] && form.elements['sitio_web'].value) || (Date.now() - tAbierto < 5000);
        if (esBot) {
            // Probablemente un bot (campo trampa, demasiado rápido o envío repetido): no guardamos nada, pero mostramos éxito para no delatar el filtro.
        } else if (SUPABASE_URL && SUPABASE_ANON_KEY) {
            await enviarFormulario();
        } else {
            console.warn('Config de Supabase vacía: el formulario no se está enviando a ningún servidor.');
        }
        alert('¡Gracias! Recibimos tu información y te contactaremos pronto.');
        form.reset();
        avisoBorrador.hidden = true;
        mostrarPaso(0);
        borrarBorrador();
        cerrarFormulario();
    } catch (err) {
        console.error(err); // el detalle técnico queda solo en la consola, no se muestra al visitante
        if (err && /demasiados env/i.test(String(err.message || ''))) {
            alert('Hemos recibido muchos envíos desde tu conexión. Inténtalo de nuevo más tarde o escríbenos por Instagram (@web_krypto).');
            return;
        }
        alert('No pudimos enviar el formulario. Inténtalo de nuevo en unos minutos o escríbenos por Instagram (@web_krypto).');
    } finally {
        btnEnviar.disabled = false;
    }
});

avisoBorrador.hidden = !restaurar();
mostrarPaso(actual);