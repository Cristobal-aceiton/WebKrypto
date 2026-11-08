'use strict';

/* ---------- Menú móvil ---------- */
(function () {
    var toggle = document.getElementById('navToggle');
    var menu = document.getElementById('navMenu');
    if (!toggle || !menu) return;

    function cerrar() {
        menu.classList.remove('abierto');
        toggle.classList.remove('activo');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Abrir menú');
        document.body.style.overflow = '';
    }

    toggle.addEventListener('click', function () {
        var abierto = menu.classList.toggle('abierto');
        toggle.classList.toggle('activo', abierto);
        toggle.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        toggle.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
        document.body.style.overflow = abierto ? 'hidden' : '';
    });

    menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', cerrar); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrar(); });
    window.addEventListener('resize', function () { if (window.innerWidth > 860) cerrar(); });
})();

/* ---------- Sombra del nav al hacer scroll + enlace activo ---------- */
(function () {
    var nav = document.getElementById('nav');
    if (nav) {
        var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
    }

    if (!('IntersectionObserver' in window)) return;
    var enlaces = {};
    document.querySelectorAll('.nav-links a[data-sec]').forEach(function (a) { enlaces[a.dataset.sec] = a; });

    var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            Object.keys(enlaces).forEach(function (k) { enlaces[k].classList.toggle('activo', k === en.target.id); });
        });
    }, { rootMargin: '-45% 0px -50% 0px' });

    Object.keys(enlaces).forEach(function (id) {
        var sec = document.getElementById(id);
        if (sec) obs.observe(sec);
    });
})();

/* ---------- Animaciones al hacer scroll ---------- */
(function () {
    var grupos = ['.beneficios-grid .card', '.planes .plan', '.proceso .proceso-paso', '.faq-item'];
    var sueltos = ['.servicios-titulo', '.servicios-subtitulo', '.cta-title', '.cta-aviso', '.faq-titulo'];

    grupos.forEach(function (sel) {
        document.querySelectorAll(sel).forEach(function (el, i) {
            el.classList.add('reveal');
            el.style.transitionDelay = (i % 4) * 0.12 + 's';
        });
    });
    sueltos.forEach(function (sel) {
        document.querySelectorAll(sel).forEach(function (el) { el.classList.add('reveal'); });
    });

    if (!('IntersectionObserver' in window)) {
        document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('visible'); });
        return;
    }
    var obs = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
            if (en.isIntersecting) { en.target.classList.add('visible'); obs.unobserve(en.target); }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    document.querySelectorAll('.reveal').forEach(function (el) { obs.observe(el); });
})();

/* ---------- Botones "Cotizar": abren el DM de Instagram ----------
   Instagram no permite pre-escribir el mensaje en el chat, así que lo copiamos
   al portapapeles para que la persona solo tenga que pegarlo. */
(function () {
    var toast = document.getElementById('toast');
    var t = null;

    function avisar(texto) {
        if (!toast) return;
        toast.textContent = texto;
        toast.classList.add('visible');
        clearTimeout(t);
        t = setTimeout(function () { toast.classList.remove('visible'); }, 5000);
    }

    document.querySelectorAll('[data-plan]').forEach(function (a) {
        a.addEventListener('click', function () {
            var msg = 'Hola WebKrypto, quiero cotizar ' + a.dataset.plan + '.';
            try {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(msg).then(function () {
                        avisar('Copiamos tu mensaje: pégalo en el chat de Instagram.');
                    }, function () {});
                }
            } catch (e) { /* si no se puede copiar, el enlace abre Instagram igual */ }
        });
    });
})();
