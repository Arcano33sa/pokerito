/* Pokerito — Etapa 1: Router simple + Pantallas placeholder + PWA básico */
(function(){
  const $app = document.getElementById('app');

  const routes = {
    '/inicio': renderInicio,
    '/juego': () => renderPlaceholder('Juego'),
    '/configuracion': () => renderPlaceholder('Configuración'),
    '/soporte': () => renderPlaceholder('Soporte'),
  };

  function getRoute(){
    const hash = window.location.hash || '#/inicio';
    const path = hash.startsWith('#') ? hash.slice(1) : hash;
    return path || '/inicio';
  }

  function navigate(path){
    if (!path.startsWith('/')) path = '/' + path;
    window.location.hash = '#' + path;
  }

  function onRoute(){
    const path = getRoute();
    const fn = routes[path] || routes['/inicio'];
    fn();
    // keep header fixed and scroll main to top per navigation
    try { $app.parentElement.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch(e){ $app.parentElement.scrollTop = 0; }
  }

  function el(html){
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function renderInicio(){
    const root = el(`
      <section class="screen" aria-label="Inicio">
        <h1 class="screen-title">Inicio</h1>
        <p class="screen-sub">Toca una tarjeta para entrar. (Sí, es grande a propósito. Tus dedos no son agujas.)</p>

        <div class="cards">
          <button class="card" data-go="/juego" type="button">
            <div class="card-left">
              <div class="card-title">Juego <span class="badge">Mesa</span><span class="card-arrow">→</span></div>
              <p class="card-desc">Entrar al juego. Aquí vive el poker, las fichas y las decisiones cuestionables.</p>
            </div>
            <div class="card-art" aria-hidden="true">
              <img src="assets/cards/juego.svg" alt="" />
            </div>
          </button>

          <button class="card" data-go="/configuracion" type="button">
            <div class="card-left">
              <div class="card-title">Configuración <span class="badge">Jugadores</span><span class="card-arrow">→</span></div>
              <p class="card-desc">Fichas, jugadores, estadísticas y exportación a Excel (llega en próximas etapas).</p>
            </div>
            <div class="card-art" aria-hidden="true">
              <img src="assets/cards/configuracion.svg" alt="" />
            </div>
          </button>

          <button class="card" data-go="/soporte" type="button">
            <div class="card-left">
              <div class="card-title">Soporte <span class="badge">Herramientas</span><span class="card-arrow">→</span></div>
              <p class="card-desc">Modo oscuro, exportar/importar y mantenimiento general. El “cajón de sastre” elegante.</p>
            </div>
            <div class="card-art" aria-hidden="true">
              <img src="assets/cards/soporte.svg" alt="" />
            </div>
          </button>
        </div>

        <div class="small-note">PWA lista para instalar. En iPad: Compartir → “Añadir a pantalla de inicio”.</div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    // tap handlers
    $app.querySelectorAll('[data-go]').forEach(btn => {
      btn.addEventListener('click', () => navigate(btn.getAttribute('data-go')));
    });
  }

  function renderPlaceholder(title){
    const root = el(`
      <section class="screen" aria-label="${title}">
        <h1 class="screen-title">${title}</h1>
        <p class="screen-sub">Pantalla placeholder — contenido llega en próximas etapas.</p>
        <div class="row">
          <button class="btn primary" type="button" id="backBtn">Volver</button>
        </div>
      </section>
    `);
    $app.innerHTML = '';
    $app.appendChild(root);
    document.getElementById('backBtn').addEventListener('click', () => navigate('/inicio'));
  }

  // PWA: register Service Worker (offline mínimo)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  window.addEventListener('hashchange', onRoute);
  window.addEventListener('DOMContentLoaded', () => {
    // ensure default route
    if (!window.location.hash) window.location.hash = '#/inicio';
    onRoute();
  });

})();
