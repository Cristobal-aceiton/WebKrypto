/* WebKrypto · Google Analytics 4 con consentimiento.
   - No carga nada de Google hasta que la persona pulsa "Aceptar".
   - Mientras GA_ID sea el de ejemplo, este archivo no hace nada (ni muestra aviso).
   Pasos: crea una propiedad GA4, copia su "ID de medición" (G-XXXXXXXXXX) y pégalo abajo. */
(function () {
    'use strict';
    var GA_ID = 'G-XXXXXXXXXX';   // <-- REEMPLAZA por tu ID de medición de GA4

    var KEY = 'webkrypto_cookies';
    var cargado = false;

    // Siempre existe, para que el resto del sitio pueda llamarla sin revisar nada.
    window.wkTrack = function (nombre, params) {
        if (cargado && window.gtag) window.gtag('event', nombre, params || {});
    };

    if (GA_ID === 'G-XXXXXXXXXX' || !/^G-[A-Z0-9]{6,}$/.test(GA_ID)) return;

    function leer() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    function guardar(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* sin almacenamiento: se vuelve a preguntar */ } }
    function borrar() { try { localStorage.removeItem(KEY); } catch (e) { /* nada */ } }

    function cargarGA() {
        if (cargado) return;
        cargado = true;
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
        window.gtag('js', new Date());
        window.gtag('config', GA_ID);
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
        document.head.appendChild(s);
    }

    // Eventos útiles: solo se envían si la persona aceptó.
    document.addEventListener('click', function (e) {
        var el = e.target.closest ? e.target.closest('a,button') : null;
        if (!el) return;
        var href = el.getAttribute('href') || '';
        if (el.id === 'btnAbrirForm') window.wkTrack('abrir_formulario');
        else if (/instagram\.com|ig\.me/.test(href)) window.wkTrack('click_instagram');
        else if (/^mailto:/.test(href)) window.wkTrack('click_correo');
        else if (/wa\.me|whatsapp\.com/.test(href)) window.wkTrack('click_whatsapp');
    }, true);

    function quitarAviso() { var b = document.querySelector('.cookie-banner'); if (b) b.remove(); }

    function mostrarAviso() {
        if (document.querySelector('.cookie-banner')) return;
        var box = document.createElement('div');
        box.className = 'cookie-banner';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', 'Preferencias de cookies');

        var p = document.createElement('p');
        p.appendChild(document.createTextNode('Usamos Google Analytics para entender cómo se usa el sitio y mejorarlo. Solo se activa si lo aceptas. Más información en nuestra '));
        var a = document.createElement('a');
        a.href = 'privacidad.html#cookies';
        a.textContent = 'Política de Privacidad';
        p.appendChild(a);
        p.appendChild(document.createTextNode('.'));
        box.appendChild(p);

        var acc = document.createElement('div');
        acc.className = 'cookie-acciones';
        var no = document.createElement('button');
        no.type = 'button'; no.textContent = 'Rechazar';
        var si = document.createElement('button');
        si.type = 'button'; si.className = 'cookie-aceptar'; si.textContent = 'Aceptar';
        acc.appendChild(no); acc.appendChild(si);
        box.appendChild(acc);

        no.addEventListener('click', function () {
            var estabaAceptado = cargado;
            guardar('no'); quitarAviso();
            if (estabaAceptado) location.reload();   // así se descarga el script de Google
        });
        si.addEventListener('click', function () { guardar('si'); quitarAviso(); cargarGA(); });
        document.body.appendChild(box);
    }

    // Botón "Cookies" del footer: permite cambiar la decisión.
    document.querySelectorAll('[data-cookies]').forEach(function (b) {
        b.hidden = false;
        b.addEventListener('click', function () { borrar(); mostrarAviso(); });
    });

    var decision = leer();
    if (decision === 'si') cargarGA();
    else if (decision !== 'no') mostrarAviso();
})();
