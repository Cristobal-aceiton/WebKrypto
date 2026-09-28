/* WebKrypto · Protección anti-clickjacking.
   Si alguien intenta cargar esta página dentro de un <iframe> en otro sitio,
   se oculta el contenido y se intenta sacarla del marco. */
(function () {
    if (window.top !== window.self) {
        document.documentElement.style.display = 'none';
        try { window.top.location.href = window.self.location.href; } catch (e) { /* bloqueado: queda oculta */ }
    }
})();
