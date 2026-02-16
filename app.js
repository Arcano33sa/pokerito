/* Pokerito — v0.1.0 — Etapa 7: Historial + Ranking + Stats + Excel + Respaldo */
(function(){
  const $app = document.getElementById('app');
  const $headerRight = document.getElementById('headerRight');

  // Theme (Auto/Light/Dark) — persisted
  const THEME_KEY = 'pokerito_theme';
  const THEME_VALUES = new Set(['auto','light','dark']);
  const mqDark = (window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);
  let themePref = loadThemePref();

  const ICON_SUN = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z" stroke="currentColor" stroke-width="2" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;
  const ICON_MOON = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M21 13.2A7.4 7.4 0 0 1 10.8 3a8.9 8.9 0 1 0 10.2 10.2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    </svg>
  `;

  const $themeToggle = createThemeToggle();
  if ($headerRight && $themeToggle) $headerRight.appendChild($themeToggle);


// Storage (versioned) — local only for now
const STORE_KEY = 'pokerito_store_v1';
const STORE_VERSION = 1;
let store = loadStore();

// Chips defaults (Etapa 3)
function defaultChips(){
  return [
    { id: 'chip_white', name: 'Blanca', value: 1,   color: '#ffffff', active: true, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'chip_red',   name: 'Roja',   value: 5,   color: '#d94141', active: true, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'chip_green', name: 'Verde',  value: 25,  color: '#2cbf6e', active: true, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'chip_black', name: 'Negra',  value: 100, color: '#111116', active: true, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'chip_blue',  name: 'Azul',   value: 500, color: '#2f6fff', active: true, createdAt: Date.now(), updatedAt: Date.now() },
  ];
}


// Players defaults (Etapa 4)
function defaultPlayers(){
  return [];
}

// Sessions defaults (Etapa 5)
function defaultSessions(){
  return [];
}

function loadStore(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return initStore();
    const obj = JSON.parse(raw);
    if (!obj || obj.v !== STORE_VERSION) return initStore();
    if (!Array.isArray(obj.chips) || !obj.chips.length){
      obj.chips = defaultChips();
      obj.updatedAt = Date.now();
      persistStore(obj);
    }
    if (!Array.isArray(obj.players)){
      obj.players = defaultPlayers();
      obj.updatedAt = Date.now();
      persistStore(obj);
    }
    if (!Array.isArray(obj.sessions)){
      obj.sessions = defaultSessions();
      obj.updatedAt = Date.now();
      persistStore(obj);
    }

    // Etapa 6: asegurar forma de sesiones existentes (migración suave)
    if (Array.isArray(obj.sessions)){
      let changed = false;
      obj.sessions.forEach(s => {
        const before = JSON.stringify(s);
        try{ ensureSessionGame(s); }catch(e){}
        if (JSON.stringify(s) !== before) changed = true;
      });
      // si el draft apuntado ya no es draft, limpiar
      if (obj.draftSessionId){
        const ds = obj.sessions.find(x => x && x.id === obj.draftSessionId) || null;
        if (ds && ds.status !== 'draft') { obj.draftSessionId = ''; changed = true; }
      }
      if (changed){
        obj.updatedAt = Date.now();
        persistStore(obj);
      }
    }
    if (!obj.ui || typeof obj.ui !== 'object'){
      obj.ui = {};
      obj.updatedAt = Date.now();
      persistStore(obj);
    }
    if (!obj.ui.juego || typeof obj.ui.juego !== 'object'){
      obj.ui.juego = {};
      obj.updatedAt = Date.now();
      persistStore(obj);
    }
    if (typeof obj.draftSessionId !== 'string'){
      obj.draftSessionId = '';
      obj.updatedAt = Date.now();
      persistStore(obj);
    }
    return obj;
  }catch(e){
    return initStore();
  }
}

function initStore(){
  const obj = {
    v: STORE_VERSION,
    chips: defaultChips(),
    players: defaultPlayers(),
    sessions: defaultSessions(),
    draftSessionId: '',
    ui: { juego: {} },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  persistStore(obj);
  return obj;
}

function persistStore(obj){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(obj)); }catch(e){}
}

function saveStore(){
  store.updatedAt = Date.now();
  persistStore(store);
}

function uid(prefix){
  return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(16).slice(2, 8);
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function normHex(hex){
  if (!hex) return null;
  hex = String(hex).trim();
  if (!hex.startsWith('#')) hex = '#' + hex;
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toLowerCase();
  return null;
}

function hexToRgb(hex){
  const h = normHex(hex);
  if (!h) return null;
  const n = parseInt(h.slice(1), 16);
  return { r: (n>>16)&255, g: (n>>8)&255, b: n&255 };
}

function mixRgb(a, b, t){
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function rgbToHex(rgb){
  const to = (x) => x.toString(16).padStart(2,'0');
  return '#' + to(clamp(rgb.r,0,255)) + to(clamp(rgb.g,0,255)) + to(clamp(rgb.b,0,255));
}

function relLuma(rgb){
  // simple sRGB luma, good enough for contrast choice
  return (0.2126*rgb.r + 0.7152*rgb.g + 0.0722*rgb.b) / 255;
}

function chipIconSvg(colorHex, size){
  const color = normHex(colorHex) || '#888888';
  const rgb = hexToRgb(color) || {r:136,g:136,b:136};
  const l = relLuma(rgb);

  const dark = rgbToHex(mixRgb(rgb, {r:0,g:0,b:0}, 0.35));
  const light = rgbToHex(mixRgb(rgb, {r:255,g:255,b:255}, 0.30));
  const rim = (l > 0.62) ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.40)';
  const mark = (l > 0.62) ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)';
  const inner = (l > 0.62) ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.12)';

  const s = size || 44;
  const gid = 'g' + Math.random().toString(16).slice(2, 8);

  return `
    <svg viewBox="0 0 64 64" width="${s}" height="${s}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <radialGradient id="${gid}" cx="30%" cy="25%" r="70%">
          <stop offset="0%" stop-color="${light}"/>
          <stop offset="55%" stop-color="${color}"/>
          <stop offset="100%" stop-color="${dark}"/>
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="29" fill="url(#${gid})" stroke="${rim}" stroke-width="2"/>
      <circle cx="32" cy="32" r="21.5" fill="none" stroke="${rim}" stroke-width="2"/>
      <g fill="${mark}">
        <rect x="29.5" y="3.8" width="5" height="10.2" rx="2.2" transform="rotate(0 32 32)"/>
        <rect x="29.5" y="3.8" width="5" height="10.2" rx="2.2" transform="rotate(45 32 32)"/>
        <rect x="29.5" y="3.8" width="5" height="10.2" rx="2.2" transform="rotate(90 32 32)"/>
        <rect x="29.5" y="3.8" width="5" height="10.2" rx="2.2" transform="rotate(135 32 32)"/>
        <rect x="29.5" y="3.8" width="5" height="10.2" rx="2.2" transform="rotate(180 32 32)"/>
        <rect x="29.5" y="3.8" width="5" height="10.2" rx="2.2" transform="rotate(225 32 32)"/>
        <rect x="29.5" y="3.8" width="5" height="10.2" rx="2.2" transform="rotate(270 32 32)"/>
        <rect x="29.5" y="3.8" width="5" height="10.2" rx="2.2" transform="rotate(315 32 32)"/>
      </g>
      <circle cx="32" cy="32" r="12.5" fill="${inner}" stroke="${rim}" stroke-width="1.5"/>
    </svg>
  `;
}

function getChips(){
  return Array.isArray(store.chips) ? store.chips : [];
}

function upsertChip(chip){
  const idx = store.chips.findIndex(c => c.id === chip.id);
  if (idx >= 0) store.chips[idx] = chip;
  else store.chips.push(chip);
  saveStore();
}

function setChipActive(id, active){
  const c = store.chips.find(x => x.id === id);
  if (!c) return;
  c.active = !!active;
  c.updatedAt = Date.now();
  saveStore();
}


function getPlayers(){
  return Array.isArray(store.players) ? store.players : [];
}

function playerDisplayName(p){
  const nick = (p && p.nick ? String(p.nick).trim() : '');
  const name = (p && p.name ? String(p.name).trim() : '');
  return nick || name || 'Sin nombre';
}

function upsertPlayer(player){
  if (!store.players) store.players = [];
  const idx = store.players.findIndex(p => p.id === player.id);
  if (idx >= 0) store.players[idx] = player;
  else store.players.push(player);
  saveStore();
}

function setPlayerActive(id, active){
  const p = (store.players || []).find(x => x.id === id);
  if (!p) return;
  p.active = !!active;
  p.updatedAt = Date.now();
  saveStore();
}


  const routes = {
    '/inicio': renderInicio,
    '/juego': renderJuego,
    '/juego/mesa': renderJuegoMesa,
    '/juego/sesion': renderJuegoSesion,
    '/historial': renderHistorial,
    '/historial/detalle': renderHistorialDetalle,
    '/ranking': renderRanking,
    '/configuracion': renderConfiguracion,
    '/soporte': renderSoporte,
  };

  function getRoute(){
    const hash = window.location.hash || '#/inicio';
    const path = hash.startsWith('#') ? hash.slice(1) : hash;
    const clean = (path || '/inicio').split('?')[0];
    return clean || '/inicio';
  }

  function getHashQuery(){
    const hash = window.location.hash || '';
    const q = hash.includes('?') ? hash.split('?').slice(1).join('?') : '';
    try{ return new URLSearchParams(q); }catch(e){ return new URLSearchParams(''); }
  }

  function navigate(path){
    if (!path.startsWith('/')) path = '/' + path;
    window.location.hash = '#' + path;
  }

  function onRoute(){
    const path = getRoute();
    const fn = routes[path] || routes['/inicio'];
    fn();
    updateHeaderControls(path);
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

        <div class="cards home-grid" aria-label="Navegación principal">
          <button class="card home-card home-card--juego" data-go="/juego" type="button">
            <div class="card-hero" aria-hidden="true">
              <div class="card-hero-slot">
                <img class="card-hero-img" data-hero="juego" alt="" decoding="async" loading="lazy" />
                <img class="card-hero-fallback" src="assets/hero/juego.svg" alt="" decoding="async" loading="lazy" />
              </div>
            </div>
            <div class="home-body">
              <div class="home-title">Juego</div>
              <p class="home-desc">Entrar al juego. Aquí viven las fichas y las decisiones cuestionables.</p>
            </div>
          </button>

          <button class="card home-card home-card--config" data-go="/configuracion" type="button">
            <div class="card-hero" aria-hidden="true">
              <div class="card-hero-slot">
                <img class="card-hero-img" data-hero="config" alt="" decoding="async" loading="lazy" />
                <img class="card-hero-fallback" src="assets/hero/configuracion.svg" alt="" decoding="async" loading="lazy" />
              </div>
            </div>
            <div class="home-body">
              <div class="home-title">Configuración</div>
              <p class="home-desc">Fichas, jugadores, estadísticas, ranking global y exportación a Excel.</p>
            </div>
          </button>

          <button class="card home-card home-card--soporte" data-go="/soporte" type="button">
            <div class="card-hero" aria-hidden="true">
              <div class="card-hero-slot">
                <img class="card-hero-img" data-hero="soporte" alt="" decoding="async" loading="lazy" />
                <img class="card-hero-fallback" src="assets/hero/soporte.svg" alt="" decoding="async" loading="lazy" />
              </div>
            </div>
            <div class="home-body">
              <div class="home-title">Soporte</div>
              <p class="home-desc">Modo oscuro, exportar/importar y mantenimiento general.</p>
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

    // HERO slots (robust fallback): try assets/hero/hero_<key>.(webp|png|jpg|jpeg|svg)
    setupHomeHeroSlots(root);
  }

  function setupHomeHeroSlots(root){
    const list = Array.from(root.querySelectorAll('.card-hero'));
    if (!list.length) return;

    const exts = ['webp','png','jpg','jpeg','svg'];
    const base = 'assets/hero/hero_';

    list.forEach(heroEl => {
      const img = heroEl.querySelector('.card-hero-img');
      if (!img) return;

      const key = (img.dataset && img.dataset.hero) ? String(img.dataset.hero) : '';
      if (!key) return;

      let i = 0;
      let done = false;

      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
      };

      const tryNext = () => {
        if (done) return;
        if (i >= exts.length) {
          // keep fallback visible and prevent broken-image chrome
          try { img.removeAttribute('src'); } catch(e){}
          cleanup();
          return;
        }
        const src = `${base}${key}.${exts[i++]}`;
        img.src = src;
      };

      img.onload = () => {
        if (done) return;
        done = true;
        heroEl.classList.add('is-loaded');
        cleanup();
      };

      img.onerror = () => {
        if (done) return;
        tryNext();
      };

      tryNext();
    });
  }

  function renderJuego(){
    const draft = getDraftSession();
    const activePlayers = getPlayers().filter(p => !!p.active);
    const lastIds = (store.ui && store.ui.juego && Array.isArray(store.ui.juego.lastPlayerIds)) ? store.ui.juego.lastPlayerIds : [];
    const selected = new Set(lastIds.filter(id => activePlayers.some(p => p.id === id)));
    const defaultDate = (store.ui && store.ui.juego && typeof store.ui.juego.lastDate === 'string' && store.ui.juego.lastDate) ? store.ui.juego.lastDate : todayYMD();

    const closedSessions = getClosedSessions();

    const root = el(`
      <section class="screen" aria-label="Crear/Continuar Partida">
        <h1 class="screen-title">Juego</h1>
        <p class="screen-sub">Crea una partida del día o retoma el borrador. (Tu “yo del futuro” te lo agradecerá.)</p>

        ${draft ? `
          <div class="panel" role="region" aria-label="Partida en borrador">
            <div class="panel-head">
              <div class="panel-title" style="margin:0">Partida en borrador</div>
              <div class="row">
                <button class="btn primary" type="button" id="continueDraftBtn">Continuar</button>
                <button class="btn danger" type="button" id="discardDraftBtn">Descartar</button>
              </div>
            </div>

            <div class="draft-meta">
              <div class="draft-pill"><span class="k">Fecha</span><span class="v">${escapeHtml(draft.date || '')}</span></div>
              <div class="draft-pill"><span class="k">Jugadores</span><span class="v">${escapeHtml(String((draft.playersSnapshot||[]).length))}</span></div>
              <div class="draft-pill"><span class="k">Fichas (snapshot)</span><span class="v">${escapeHtml(String((draft.chipsSnapshot||[]).length))}</span></div>
            </div>
            <div class="small-note">Tip: aunque cambies fichas en Configuración, esta sesión ya tiene su snapshot blindado.</div>
          </div>
        ` : ''}

        <div class="panel" role="region" aria-label="Crear partida" style="margin-top:${draft ? '14px' : '0'}">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Crear partida</div>
            <button class="btn" type="button" id="toConfigBtn">Ir a Configuración</button>
          </div>

          <div class="form" style="margin-top:12px">
            <label class="field">
              <span>Fecha</span>
              <input id="sessionDate" type="date" value="${escapeAttr(defaultDate)}" ${draft ? 'disabled' : ''} />
            </label>
          </div>

          <div class="pick-wrap" aria-label="Selector de jugadores">
            <div class="pick-head">
              <div class="pick-title">Jugadores activos del día</div>
              <div class="pick-sub">Toca para seleccionar (multi).</div>
            </div>
            <div class="pick-grid" id="playerPickGrid" aria-live="polite"></div>
          </div>

          <div class="row" style="margin-top:14px">
            <button class="btn primary" type="button" id="startSessionBtn">Iniciar Partida</button>
            <button class="btn" type="button" id="backBtn">Volver</button>
          </div>

          ${draft ? `<div class="small-note">Hay un borrador activo. Para crear una nueva partida, descártalo primero (sí, duele, pero es sano).</div>` : ''}
        </div>

        <div class="panel" role="region" aria-label="Historial" style="margin-top:14px">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Historial</div>
            <div class="row" style="gap:10px">
              <div class="small-note" style="margin:0">Sesiones cerradas (solo lectura).</div>
              <button class="btn" type="button" id="toHistorialBtn">Ver todo</button>
            </div>
          </div>

          ${closedSessions.length ? `
            <div class="hist-list" id="histList" aria-live="polite">
              ${closedSessions.map(s => {
                const sum = calcSessionSummary(s);
                const delta = sum.delta;
                const deltaClass = Math.abs(delta) < 0.0001 ? 'ok' : (delta > 0 ? 'pos' : 'neg');
                return `
                  <div class="hist-item" data-id="${escapeAttr(s.id)}">
                    <div class="hist-main">
                      <div class="hist-title">${escapeHtml(String(s.date || ''))}</div>
                      <div class="hist-sub">${escapeHtml(String(sum.playersCount))} jugadores · Invertido ${escapeHtml(formatMoney(sum.totalInvested))} · Fichas ${escapeHtml(formatMoney(sum.totalChipsValue))}</div>
                    </div>
                    <div class="hist-right">
                      <div class="delta-pill ${deltaClass}">Δ ${escapeHtml(formatMoney(delta))}</div>
                      <button class="btn" type="button" data-act="view">Ver</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            <div class="small-note">Tip: el detalle rápido abre una tabla por jugador (invertido, fichas, neto, posición).</div>
          ` : `<div class="empty">Aún no hay sesiones cerradas. Tu historial está más limpio que tu conciencia (por ahora).</div>`}
        </div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    document.getElementById('backBtn').addEventListener('click', () => navigate('/inicio'));
    document.getElementById('toConfigBtn').addEventListener('click', () => navigate('/configuracion'));
    const $toHist = document.getElementById('toHistorialBtn');
    if ($toHist) $toHist.addEventListener('click', () => navigate('/historial'));

    const $grid = document.getElementById('playerPickGrid');
    const $start = document.getElementById('startSessionBtn');
    const $date = document.getElementById('sessionDate');

    function renderPickGrid(){
      if (!activePlayers.length){
        $grid.innerHTML = `<div class="empty">No hay jugadores activos. Activa o crea jugadores en Configuración.</div>`;
        return;
      }

      $grid.innerHTML = activePlayers
        .slice()
        .sort((a,b) => playerDisplayName(a).localeCompare(playerDisplayName(b), 'es', { sensitivity: 'base' }))
        .map(p => {
          const disp = playerDisplayName(p);
          const name = (p.name || '').trim();
          const sel = selected.has(p.id);
          return `
            <button class="pick ${sel ? 'selected' : ''}" type="button" data-id="${p.id}" ${draft ? 'disabled' : ''}>
              <div class="pick-nick">${escapeHtml(disp)}</div>
              <div class="pick-name">${escapeHtml(name || '')}</div>
            </button>
          `;
        }).join('');
    }

    function syncStartDisabled(){
      const can = !draft && selected.size > 0 && activePlayers.length > 0;
      $start.disabled = !can;
    }

    $grid.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button.pick');
      if (!btn || btn.disabled) return;
      const id = btn.getAttribute('data-id');
      if (!id) return;
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      btn.classList.toggle('selected', selected.has(id));
      syncStartDisabled();
    });

    $date.addEventListener('change', () => {
      const v = ($date.value || '').trim();
      if (!store.ui) store.ui = {};
      if (!store.ui.juego) store.ui.juego = {};
      store.ui.juego.lastDate = v;
      saveStore();
    });

    $start.addEventListener('click', () => {
      if (draft) return;
      const date = ($date.value || '').trim() || todayYMD();
      const ids = Array.from(selected);
      if (!ids.length) return;

      const session = createDraftSession({ date, playerIds: ids });
      store.sessions = store.sessions || [];
      store.sessions.push(session);
      store.draftSessionId = session.id;
      if (!store.ui) store.ui = {};
      if (!store.ui.juego) store.ui.juego = {};
      store.ui.juego.lastPlayerIds = ids;
      store.ui.juego.lastDate = date;
      saveStore();
      navigate('/juego/mesa');
    });

    if (draft){
      const $continue = document.getElementById('continueDraftBtn');
      const $discard = document.getElementById('discardDraftBtn');
      if ($continue) $continue.addEventListener('click', () => navigate('/juego/mesa'));
      if ($discard) $discard.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Descartar borrador',
          body: 'Esto eliminará la sesión en borrador. No hay “Ctrl+Z” (aún).',
          okText: 'Descartar',
          cancelText: 'Cancelar',
          danger: true,
        });
        if (!ok) return;
        discardDraftSession();
        onRoute();
      });
    }

    // historial
    const $hist = document.getElementById('histList');
    if ($hist){
      $hist.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-act="view"]');
        if (!btn) return;
        const row = ev.target.closest('.hist-item');
        if (!row) return;
        const id = row.getAttribute('data-id');
        if (!id) return;
        navigate('/historial/detalle?id=' + encodeURIComponent(id));
      });
    }

    renderPickGrid();
    syncStartDisabled();
  }

  function renderJuegoMesa(){
    const s = getDraftSession();
    if (!s){
      navigate('/juego');
      return;
    }
    ensureSessionGame(s);
    renderMesaSession(s, { readOnly: false, backPath: '/juego', badge: 'Draft' });
  }

  function renderJuegoSesion(){
    const q = getHashQuery();
    const id = (q.get('id') || '').trim();
    const s = id ? getSessionById(id) : null;
    if (!s){
      navigate('/juego');
      return;
    }
    ensureSessionGame(s);
    renderMesaSession(s, { readOnly: (s.status === 'closed'), backPath: '/juego', badge: (s.status === 'closed' ? 'Cerrada' : 'Draft') });
  }

  // ===== Etapa 7: Historial (navegable) =====
  function renderHistorial(){
    const sessions = getClosedSessions();
    const root = el(`
      <section class="screen" aria-label="Historial">
        <h1 class="screen-title">Historial</h1>
        <p class="screen-sub">Sesiones cerradas. Navega por fecha y abre el detalle. (Aquí vive la verdad.)</p>

        <div class="panel" role="region" aria-label="Listado">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Sesiones</div>
            <div class="row">
              <button class="btn" type="button" id="toRankingBtn">Ranking</button>
              <button class="btn" type="button" id="backBtn">Volver</button>
            </div>
          </div>

          ${sessions.length ? `
            <div class="hist-list" id="histList" aria-live="polite">
              ${sessions.map(s => {
                const sum = calcSessionSummary(s);
                const delta = sum.delta;
                const deltaClass = Math.abs(delta) < 0.0001 ? 'ok' : (delta > 0 ? 'pos' : 'neg');
                return `
                  <div class="hist-item" data-id="${escapeAttr(s.id)}">
                    <div class="hist-main">
                      <div class="hist-title">${escapeHtml(String(s.date || ''))}</div>
                      <div class="hist-sub">${escapeHtml(String(sum.playersCount))} jugadores · Invertido ${escapeHtml(formatMoney(sum.totalInvested))} · Fichas ${escapeHtml(formatMoney(sum.totalChipsValue))}</div>
                    </div>
                    <div class="hist-right">
                      <div class="delta-pill ${deltaClass}">Δ ${escapeHtml(formatMoney(delta))}</div>
                      <button class="btn" type="button" data-act="view">Ver</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `<div class="empty">Aún no hay sesiones cerradas.</div>`}
        </div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    document.getElementById('backBtn').addEventListener('click', () => navigate('/inicio'));
    document.getElementById('toRankingBtn').addEventListener('click', () => navigate('/ranking'));

    const $list = document.getElementById('histList');
    if ($list){
      $list.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-act="view"]');
        if (!btn) return;
        const row = ev.target.closest('.hist-item');
        if (!row) return;
        const id = row.getAttribute('data-id');
        if (!id) return;
        navigate('/historial/detalle?id=' + encodeURIComponent(id));
      });
    }
  }

  function renderHistorialDetalle(){
    const q = getHashQuery();
    const id = (q.get('id') || '').trim();
    const s = id ? getSessionById(id) : null;
    if (!s || s.status !== 'closed'){
      navigate('/historial');
      return;
    }
    ensureSessionGame(s);

    const analysis = analyzeSession(s);
    const sum = analysis.summary;
    const deltaClass = Math.abs(sum.delta) < 0.0001 ? 'ok' : (sum.delta > 0 ? 'pos' : 'neg');

    const root = el(`
      <section class="screen" aria-label="Detalle de sesión">
        <div class="mesa-head">
          <div class="mesa-title">
            <div class="mesa-h1">Historial <span class="badge">${escapeHtml(String(s.date || ''))}</span></div>
            <div class="mesa-sub">${escapeHtml(String(analysis.rows.length))} jugadores · sesión cerrada</div>
          </div>
          <div class="row">
            <button class="btn" type="button" id="backBtn">Volver</button>
            <button class="btn" type="button" id="toMesaBtn">Ver mesa</button>
          </div>
        </div>

        <div class="panel" role="region" aria-label="Resumen">
          <div class="kpi-row">
            <div class="kpi">
              <div class="k">Total invertido</div>
              <div class="v">${escapeHtml(formatMoney(sum.totalInvested))}</div>
            </div>
            <div class="kpi">
              <div class="k">Total fichas</div>
              <div class="v">${escapeHtml(formatMoney(sum.totalChipsValue))}</div>
            </div>
            <div class="kpi">
              <div class="k">Delta</div>
              <div class="v delta ${deltaClass}">${escapeHtml(formatMoney(sum.delta))}</div>
            </div>
          </div>
        </div>

        <div class="panel" role="region" aria-label="Tabla" style="margin-top:14px">
          <div class="panel-title">Por jugador</div>
          <div class="table-wrap" role="region" aria-label="Tabla de jugadores">
            <table class="table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Jugador</th>
                  <th class="num">Invertido</th>
                  <th class="num">Fichas</th>
                  <th class="num">Neto</th>
                </tr>
              </thead>
              <tbody>
                ${analysis.rows.map(r => {
                  const netClass = Math.abs(r.net) < 0.0001 ? 'ok' : (r.net > 0 ? 'pos' : 'neg');
                  return `
                    <tr>
                      <td class="pos">${escapeHtml(String(r.pos))}</td>
                      <td class="who">${escapeHtml(r.display)}</td>
                      <td class="num">${escapeHtml(formatMoney(r.invested))}</td>
                      <td class="num">${escapeHtml(formatMoney(r.chips))}</td>
                      <td class="num net ${netClass}">${escapeHtml(formatMoney(r.net))}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="small-note" style="margin-top:10px">Posición ordenada por neto (desc). Empates comparten #1.</div>
        </div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    document.getElementById('backBtn').addEventListener('click', () => navigate('/historial'));
    document.getElementById('toMesaBtn').addEventListener('click', () => navigate('/juego/sesion?id=' + encodeURIComponent(s.id)));
  }

  // ===== Etapa 7: Ranking global (sin tiempo) =====
  function renderRanking(){
    const a = computeAnalytics();
    const root = el(`
      <section class="screen" aria-label="Ranking">
        <h1 class="screen-title">Ranking global</h1>
        <p class="screen-sub">Ordenado por neto acumulado. Sin fechas, sin excusas.</p>

        <div class="panel" role="region" aria-label="Ranking">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Jugadores</div>
            <div class="row">
              <button class="btn" type="button" id="toHistBtn">Historial</button>
              <button class="btn" type="button" id="backBtn">Volver</button>
            </div>
          </div>

          ${a.ranking.length ? `
            <div class="rank-list" id="rankList" aria-live="polite">
              ${a.ranking.map((r, idx) => {
                const netClass = Math.abs(r.netTotal) < 0.0001 ? 'ok' : (r.netTotal > 0 ? 'pos' : 'neg');
                const best = (r.best && Number.isFinite(r.best.net)) ? formatMoney(r.best.net) : '—';
                const bestDate = (r.best && r.best.date) ? r.best.date : '—';
                const worst = (r.worst && Number.isFinite(r.worst.net)) ? formatMoney(r.worst.net) : '—';
                const worstDate = (r.worst && r.worst.date) ? r.worst.date : '—';
                return `
                  <article class="rank-item" data-pid="${escapeAttr(r.id)}">
                    <div class="rank-left">
                      <div class="rank-pos">#${idx+1}</div>
                      <div class="rank-who">
                        <div class="rank-name">${escapeHtml(r.display)}</div>
                        <div class="rank-sub">Partidas: ${escapeHtml(String(r.games))} · Veces #1: ${escapeHtml(String(r.wins1))}</div>
                      </div>
                    </div>
                    <div class="rank-right">
                      <div class="rank-net net ${netClass}">${escapeHtml(formatMoney(r.netTotal))}</div>
                      <div class="rank-mini">Mejor: <b>${escapeHtml(best)}</b> · ${escapeHtml(bestDate)}</div>
                      <div class="rank-mini">Peor: <b>${escapeHtml(worst)}</b> · ${escapeHtml(worstDate)}</div>
                    </div>
                  </article>
                `;
              }).join('')}
            </div>
          ` : `<div class="empty">No hay datos todavía. Cierra una sesión y aquí empieza el drama.</div>`}
        </div>

        <div class="panel" role="region" aria-label="Records" style="margin-top:14px">
          <div class="panel-title">Records globales</div>
          <div class="records-grid">
            <div class="record">
              <div class="k">Mayor inversión total</div>
              <div class="v">${escapeHtml(a.records.maxTotalInvested ? formatMoney(a.records.maxTotalInvested.amount) : '—')}</div>
              <div class="s">${escapeHtml(a.records.maxTotalInvested ? (a.records.maxTotalInvested.date || '—') : '—')}</div>
            </div>
            <div class="record">
              <div class="k">Mayor ganancia individual</div>
              <div class="v">${escapeHtml(a.records.maxGain ? formatMoney(a.records.maxGain.amount) : '—')}</div>
              <div class="s">${escapeHtml(a.records.maxGain ? `${a.records.maxGain.date || '—'} · ${a.records.maxGain.player || '—'}` : '—')}</div>
            </div>
            <div class="record">
              <div class="k">Mayor pérdida individual</div>
              <div class="v">${escapeHtml(a.records.maxLoss ? formatMoney(a.records.maxLoss.amount) : '—')}</div>
              <div class="s">${escapeHtml(a.records.maxLoss ? `${a.records.maxLoss.date || '—'} · ${a.records.maxLoss.player || '—'}` : '—')}</div>
            </div>
          </div>
        </div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    document.getElementById('backBtn').addEventListener('click', () => navigate('/inicio'));
    document.getElementById('toHistBtn').addEventListener('click', () => navigate('/historial'));
  }

  function renderMesaSession(session, { readOnly, backPath, badge }){
    const s = session;
    const players = Array.isArray(s.playersSnapshot) ? s.playersSnapshot : [];
    const chips = Array.isArray(s.chipsSnapshot) ? s.chipsSnapshot : [];
    const chipValueMap = new Map(chips.map(c => [c.id, numOrZero(c.value)]));
    const pStateMap = new Map((s.game && Array.isArray(s.game.players) ? s.game.players : []).map(p => [p.id, p]));

    const sum = calcSessionSummary(s);
    const deltaClass = Math.abs(sum.delta) < 0.0001 ? 'ok' : (sum.delta > 0 ? 'pos' : 'neg');

    const root = el(`
      <section class="screen" aria-label="Mesa">
        <div class="mesa-head">
          <div class="mesa-title">
            <div class="mesa-h1">Mesa <span class="badge">${escapeHtml(badge || '')}</span></div>
            <div class="mesa-sub">${escapeHtml(String(s.date || ''))} · ${escapeHtml(String(players.length))} jugadores · snapshot ${escapeHtml(String(chips.length))} fichas</div>
          </div>
          <div class="row">
            <button class="btn" type="button" id="backBtn">Volver</button>
            ${readOnly ? `<button class="btn primary" type="button" id="toInicioBtn">Inicio</button>` : `<button class="btn danger" type="button" id="closeBtn">Cerrar Partida</button>`}
          </div>
        </div>

        <div class="panel" role="region" aria-label="Cuadre">
          <div class="kpi-row">
            <div class="kpi">
              <div class="k">Total invertido</div>
              <div class="v" id="kpiInvested">${escapeHtml(formatMoney(sum.totalInvested))}</div>
            </div>
            <div class="kpi">
              <div class="k">Total fichas</div>
              <div class="v" id="kpiChips">${escapeHtml(formatMoney(sum.totalChipsValue))}</div>
            </div>
            <div class="kpi">
              <div class="k">Delta</div>
              <div class="v delta ${deltaClass}" id="kpiDelta">${escapeHtml(formatMoney(sum.delta))}</div>
            </div>
          </div>
          <div class="small-note" style="margin-top:10px">Δ = fichas − invertido. Idealmente: 0. Si no: alguien está “creando valor” (spoiler: no es el mercado).</div>
        </div>

        <div class="mesa-grid" aria-live="polite" style="margin-top:14px">
          ${players.length ? players.map(p => {
            const disp = (p && p.display) ? String(p.display) : playerDisplayName(p);
            const name = (p && p.name) ? String(p.name) : '';
            const st = pStateMap.get(p.id) || { id: p.id, buyIn: 0, rebuys: [], counts: {} };
            const totals = calcPlayerTotals(st, chipValueMap);
            const netClass = Math.abs(totals.neto) < 0.0001 ? 'ok' : (totals.neto > 0 ? 'pos' : 'neg');
            return `
              <article class="mesa-player" data-pid="${escapeAttr(p.id)}">
                <div class="mesa-player-top">
                  <div class="mesa-player-nick">${escapeHtml(disp || 'Sin nombre')}</div>
                  <div class="mesa-player-name">${escapeHtml((name || '').trim())}</div>
                </div>

                <div class="buyin-block">
                  <label class="field compact">
                    <span>Buy-in</span>
                    <input class="buyin" type="number" inputmode="numeric" pattern="[0-9]*" placeholder="0" value="${escapeAttr(String(numOrZero(st.buyIn) || ''))}" ${readOnly ? 'disabled' : ''} />
                  </label>
                  <div class="rebuy-box">
                    <button class="btn small" type="button" data-act="rebuy" ${readOnly ? 'disabled' : ''}>+ Rebuy</button>
                    <div class="rebuy-meta"><span class="k">Rebuys</span><span class="v" data-role="rebuyCount">${escapeHtml(String((st.rebuys||[]).length))}</span></div>
                  </div>
                </div>

                <div class="chips-block">
                  ${chips.length ? chips.map(c => {
                    const color = normHex(c.color) || '#888888';
                    const value = numOrZero(c.value);
                    const count = numOrZero((st.counts||{})[c.id]);
                    return `
                      <div class="chip-row" data-cid="${escapeAttr(c.id)}">
                        <div class="chip-mini">
                          <div class="chip-mini-ico">${chipIconSvg(color, 28)}</div>
                          <div class="chip-mini-meta">
                            <div class="chip-mini-name">${escapeHtml(String(c.name || ''))}</div>
                            <div class="chip-mini-val">${escapeHtml(formatMoney(value))}</div>
                          </div>
                        </div>
                        <div class="counter">
                          <button class="num-btn" type="button" data-act="dec" ${readOnly ? 'disabled' : ''}>−</button>
                          <button class="num" type="button" data-act="edit" ${readOnly ? 'disabled' : ''}>${escapeHtml(String(count))}</button>
                          <button class="num-btn" type="button" data-act="inc" ${readOnly ? 'disabled' : ''}>+</button>
                        </div>
                      </div>
                    `;
                  }).join('') : `<div class="empty">No hay fichas en el snapshot.</div>`}
                </div>

                <div class="totals-block">
                  <div class="pillstat"><span class="k">Total fichas</span><span class="v" data-role="chipsValue">${escapeHtml(formatMoney(totals.totalChipsValue))}</span></div>
                  <div class="pillstat"><span class="k">Invertido</span><span class="v" data-role="invested">${escapeHtml(formatMoney(totals.totalBuyIn))}</span></div>
                  <div class="pillstat"><span class="k">Neto</span><span class="v net ${netClass}" data-role="neto">${escapeHtml(formatMoney(totals.neto))}</span></div>
                </div>
              </article>
            `;
          }).join('') : `<div class="empty">No hay jugadores en esta sesión.</div>`}
        </div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    document.getElementById('backBtn').addEventListener('click', () => navigate(backPath || '/juego'));
    const $toInicio = document.getElementById('toInicioBtn');
    if ($toInicio) $toInicio.addEventListener('click', () => navigate('/inicio'));

    const $close = document.getElementById('closeBtn');
    if ($close){
      $close.addEventListener('click', async () => {
        if (readOnly) return;
        const sum = calcSessionSummary(s);
        const ok = await confirmDialog({
          title: 'Cerrar Partida',
          body: `Se guardará en historial como sesión cerrada (inmutable).\n\nTotal invertido: ${formatMoney(sum.totalInvested)}\nTotal fichas: ${formatMoney(sum.totalChipsValue)}\nDelta: ${formatMoney(sum.delta)}`,
          okText: 'Cerrar',
          cancelText: 'Cancelar',
          danger: true,
        });
        if (!ok) return;
        closeSession(s.id);
        navigate('/juego');
      });
    }

    // buyin change
    root.querySelectorAll('input.buyin').forEach(inp => {
      inp.addEventListener('focus', () => { try{ inp.select(); }catch(e){} });
      inp.addEventListener('input', () => {
        if (readOnly) return;
        const card = inp.closest('.mesa-player');
        const pid = card ? card.getAttribute('data-pid') : '';
        if (!pid) return;
        const st = ensurePlayerState(s, pid);
        st.buyIn = numOrZero(inp.value);
        touchSession(s);
        saveSession(s);
        refreshTotalsForPlayer(card, st, chipValueMap);
        refreshKpis(s);
      });
    });

    // click actions
    const $grid = root.querySelector('.mesa-grid');
    if ($grid){
      $grid.addEventListener('click', async (ev) => {
        const btn = ev.target.closest('button[data-act]');
        if (!btn) return;
        if (readOnly) return;
        const act = btn.getAttribute('data-act');
        const card = btn.closest('.mesa-player');
        if (!card) return;
        const pid = card.getAttribute('data-pid');
        if (!pid) return;

        if (act === 'rebuy'){
          const st = ensurePlayerState(s, pid);
          const def = lastRebuyOrBuyIn(st);
          const amt = await numberInputDialog({
            title: 'Rebuy',
            body: 'Monto del rebuy para este jugador',
            value: (def ? String(def) : ''),
            placeholder: '0',
            okText: 'Agregar',
            cancelText: 'Cancelar'
          });
          if (amt === null) return;
          const n = numOrZero(amt);
          if (n <= 0) return;
          if (!Array.isArray(st.rebuys)) st.rebuys = [];
          st.rebuys.push(n);
          touchSession(s);
          saveSession(s);
          const $rc = card.querySelector('[data-role="rebuyCount"]');
          if ($rc) $rc.textContent = String(st.rebuys.length);
          refreshTotalsForPlayer(card, st, chipValueMap);
          refreshKpis(s);
          return;
        }

        const row = btn.closest('.chip-row');
        const cid = row ? row.getAttribute('data-cid') : '';
        if (!cid) return;
        const st = ensurePlayerState(s, pid);
        if (!st.counts || typeof st.counts !== 'object') st.counts = {};
        const cur = numOrZero(st.counts[cid]);

        if (act === 'inc' || act === 'dec'){
          const next = (act === 'inc') ? (cur + 1) : Math.max(0, cur - 1);
          st.counts[cid] = next;
          const $num = row.querySelector('button.num[data-act="edit"]');
          if ($num) $num.textContent = String(next);
          touchSession(s);
          saveSession(s);
          refreshTotalsForPlayer(card, st, chipValueMap);
          refreshKpis(s);
          return;
        }

        if (act === 'edit'){
          const amt = await numberInputDialog({
            title: 'Cantidad de fichas',
            body: 'Escribe la cantidad exacta',
            value: String(cur),
            placeholder: '0',
            okText: 'OK',
            cancelText: 'Cancelar'
          });
          if (amt === null) return;
          const next = Math.max(0, Math.floor(numOrZero(amt)));
          st.counts[cid] = next;
          btn.textContent = String(next);
          touchSession(s);
          saveSession(s);
          refreshTotalsForPlayer(card, st, chipValueMap);
          refreshKpis(s);
          return;
        }
      });
    }

    function refreshTotalsForPlayer(card, st, chipValueMap){
      const t = calcPlayerTotals(st, chipValueMap);
      const $chipsValue = card.querySelector('[data-role="chipsValue"]');
      const $invested = card.querySelector('[data-role="invested"]');
      const $neto = card.querySelector('[data-role="neto"]');
      if ($chipsValue) $chipsValue.textContent = formatMoney(t.totalChipsValue);
      if ($invested) $invested.textContent = formatMoney(t.totalBuyIn);
      if ($neto){
        $neto.textContent = formatMoney(t.neto);
        $neto.classList.toggle('ok', Math.abs(t.neto) < 0.0001);
        $neto.classList.toggle('pos', t.neto > 0.0001);
        $neto.classList.toggle('neg', t.neto < -0.0001);
      }
    }

    function refreshKpis(s){
      const sum = calcSessionSummary(s);
      const $i = document.getElementById('kpiInvested');
      const $c = document.getElementById('kpiChips');
      const $d = document.getElementById('kpiDelta');
      if ($i) $i.textContent = formatMoney(sum.totalInvested);
      if ($c) $c.textContent = formatMoney(sum.totalChipsValue);
      if ($d){
        $d.textContent = formatMoney(sum.delta);
        $d.classList.remove('ok','pos','neg');
        $d.classList.add(Math.abs(sum.delta) < 0.0001 ? 'ok' : (sum.delta > 0 ? 'pos' : 'neg'));
      }
    }
  }

  
function renderConfiguracion(){
    const root = el(`
      <section class="screen" aria-label="Configuración">
        <h1 class="screen-title">Configuración</h1>
        <p class="screen-sub">Configuras una vez y luego solo juegas. (Ok, también discutes. Pero con estilo.)</p>

        <div class="panel" role="region" aria-label="Ranking global">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Ranking global</div>
            <div class="row">
              <button class="btn" type="button" id="toRankingBtn">Ver ranking</button>
              <button class="btn" type="button" id="toHistorialBtn">Historial</button>
            </div>
          </div>
          <div class="rank-mini-list" id="rankMini"></div>
          <div class="small-note">Ordenado por neto acumulado (todas las sesiones cerradas).</div>
        </div>

        <div class="panel" role="region" aria-label="Exportación" style="margin-top:14px">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Exportación</div>
            <button class="btn primary" type="button" id="exportExcelBtn">Exportar Excel</button>
          </div>
          <div class="small-note" style="margin-top:0">Genera un archivo con 4 hojas: Jugadores, RecordsGlobales, HistorialDetallado y ResumenPartidas.</div>
        </div>

        <div class="panel" role="region" aria-label="Jugadores">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Jugadores</div>
            <button class="btn primary" type="button" id="addPlayerBtn">Agregar jugador</button>
          </div>

          <div class="player-grid" id="playerGrid" aria-live="polite"></div>

          <div class="small-note">En <b>Juego</b> se mostrará el <b>Apodo</b>. Si está vacío, se usa el nombre. Estadísticas calculadas desde sesiones cerradas.</div>
        </div>

        <div class="panel" role="region" aria-label="Fichas" style="margin-top:14px">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Fichas</div>
            <button class="btn primary" type="button" id="addChipBtn">Agregar ficha</button>
          </div>

          <div class="chip-grid" id="chipGrid" aria-live="polite"></div>

          <div class="small-note">“Desactivar” no borra: solo la saca del uso (historial futuro intacto).</div>
        </div>

        <div class="row" style="margin-top:14px">
          <button class="btn" type="button" id="backBtn">Volver</button>
        </div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    // Ranking mini + export
    document.getElementById('toRankingBtn').addEventListener('click', () => navigate('/ranking'));
    document.getElementById('toHistorialBtn').addEventListener('click', () => navigate('/historial'));
    document.getElementById('exportExcelBtn').addEventListener('click', () => exportExcel());

    renderRankingMini();

    // Players
    const $pgrid = document.getElementById('playerGrid');

    function renderRankingMini(){
      const $mini = document.getElementById('rankMini');
      if (!$mini) return;
      const a = computeAnalytics();
      if (!a.ranking.length){
        $mini.innerHTML = `<div class="empty" style="padding:12px">Aún no hay ranking. Cierra una sesión y lo armamos.</div>`;
        return;
      }
      const top = a.ranking.slice(0, 5);
      $mini.innerHTML = top.map((r, idx) => {
        const netClass = Math.abs(r.netTotal) < 0.0001 ? 'ok' : (r.netTotal > 0 ? 'pos' : 'neg');
        return `
          <div class="rank-mini-row">
            <div class="rank-mini-pos">#${idx+1}</div>
            <div class="rank-mini-name">${escapeHtml(r.display)}</div>
            <div class="rank-mini-net net ${netClass}">${escapeHtml(formatMoney(r.netTotal))}</div>
          </div>
        `;
      }).join('');
    }

    function renderPlayers(){
      const a = computeAnalytics();
      const statsMap = a.byPlayer || new Map();
      const players = getPlayers().slice().sort((a,b) => {
        if (!!a.active !== !!b.active) return (a.active ? -1 : 1);
        return playerDisplayName(a).localeCompare(playerDisplayName(b), 'es', { sensitivity: 'base' });
      });

      if (!players.length){
        $pgrid.innerHTML = `<div class="empty">No hay jugadores. Agrega el primero y empieza el caos organizado.</div>`;
        return;
      }

      $pgrid.innerHTML = players.map(p => {
        const status = p.active ? 'Activo' : 'Inactivo';
        const statusClass = p.active ? 'on' : 'off';
        const actionLabel = p.active ? 'Desactivar' : 'Activar';

        const name = (p.name || '').trim();
        const display = playerDisplayName(p);

        const st = statsMap.get(p.id) || { netTotal: 0, games: 0, wins1: 0, best: null, worst: null };
        const netClass = Math.abs(st.netTotal) < 0.0001 ? 'ok' : (st.netTotal > 0 ? 'pos' : 'neg');
        const bestAmt = st.best ? formatMoney(st.best.net) : '—';
        const bestDate = st.best ? (st.best.date || '—') : '—';
        const worstAmt = st.worst ? formatMoney(st.worst.net) : '—';
        const worstDate = st.worst ? (st.worst.date || '—') : '—';

        return `
          <article class="player-card ${p.active ? '' : 'inactive'}" data-id="${p.id}">
            <div class="player-top">
              <div class="player-meta">
                <div class="player-nick">${escapeHtml(display)}</div>
                <div class="player-name">${escapeHtml(name || '')}</div>
              </div>
              <div class="player-status">
                <span class="pill ${statusClass}">${status}</span>
              </div>
            </div>

            <div class="player-stats">
              <div class="player-stats-title">Estadísticas</div>
              <div class="stats-mini-grid stats-extended">
                <div class="stat-mini"><span class="k">Neto</span><span class="v net ${netClass}">${escapeHtml(formatMoney(st.netTotal))}</span></div>
                <div class="stat-mini"><span class="k">Partidas</span><span class="v">${escapeHtml(String(st.games||0))}</span></div>
                <div class="stat-mini"><span class="k">Veces #1</span><span class="v">${escapeHtml(String(st.wins1||0))}</span></div>
                <div class="stat-mini stack"><span class="k">Mejor noche</span><span class="v">${escapeHtml(bestAmt)}</span><span class="sub">${escapeHtml(bestDate)}</span></div>
                <div class="stat-mini stack"><span class="k">Peor noche</span><span class="v">${escapeHtml(worstAmt)}</span><span class="sub">${escapeHtml(worstDate)}</span></div>
              </div>
            </div>

            <div class="player-actions">
              <button class="btn" type="button" data-act="edit">Editar</button>
              <button class="btn" type="button" data-act="toggle">${actionLabel}</button>
            </div>
          </article>
        `;
      }).join('');
    }

    $pgrid.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      const card = ev.target.closest('.player-card');
      if (!card) return;
      const id = card.getAttribute('data-id');
      const act = btn.getAttribute('data-act');

      if (act === 'edit'){
        const player = getPlayers().find(x => x.id === id);
        if (player) openPlayerModal({ mode: 'edit', player, onSave: renderPlayers });
        return;
      }

      if (act === 'toggle'){
        const p = getPlayers().find(x => x.id === id);
        if (!p) return;
        setPlayerActive(id, !p.active);
        renderPlayers();
      }
    });

    document.getElementById('addPlayerBtn').addEventListener('click', () => {
      openPlayerModal({ mode: 'add', onSave: renderPlayers });
    });

    // Chips (Etapa 3)
    const $cgrid = document.getElementById('chipGrid');

    function renderChips(){
      const chips = getChips().slice().sort((a,b) => {
        if (!!a.active !== !!b.active) return (a.active ? -1 : 1);
        return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
      });

      if (!chips.length){
        $cgrid.innerHTML = `<div class="empty">No hay fichas. (Eso sí sería un poker… raro.)</div>`;
        return;
      }

      $cgrid.innerHTML = chips.map(c => {
        const status = c.active ? 'Activa' : 'Inactiva';
        const statusClass = c.active ? 'on' : 'off';
        const actionLabel = c.active ? 'Desactivar' : 'Activar';
        const value = (c.value === 0 || c.value) ? String(c.value) : '';
        const color = normHex(c.color) || '#888888';

        return `
          <article class="chip-card ${c.active ? '' : 'inactive'}" data-id="${c.id}">
            <div class="chip-card-top">
              <div class="chip-icon">${chipIconSvg(color, 46)}</div>
              <div class="chip-meta">
                <div class="chip-name">${escapeHtml(c.name || 'Sin nombre')}</div>
                <div class="chip-sub">
                  <span class="chip-color-dot" style="background:${color}"></span>
                  <span class="chip-color-hex">${color.toUpperCase()}</span>
                </div>
              </div>
              <div class="chip-status">
                <span class="pill ${statusClass}">${status}</span>
              </div>
            </div>

            <div class="chip-value">
              <span class="chip-value-label">Valor</span>
              <span class="chip-value-num">${escapeHtml(value)}</span>
            </div>

            <div class="chip-actions">
              <button class="btn" type="button" data-act="edit">Editar</button>
              <button class="btn" type="button" data-act="toggle">${actionLabel}</button>
            </div>
          </article>
        `;
      }).join('');
    }

    $cgrid.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-act]');
      if (!btn) return;
      const card = ev.target.closest('.chip-card');
      if (!card) return;
      const id = card.getAttribute('data-id');
      const act = btn.getAttribute('data-act');

      if (act === 'edit'){
        const chip = getChips().find(x => x.id === id);
        if (chip) openChipModal({ mode: 'edit', chip, onSave: renderChips });
        return;
      }

      if (act === 'toggle'){
        const chip = getChips().find(x => x.id === id);
        if (!chip) return;
        setChipActive(id, !chip.active);
        renderChips();
      }
    });

    document.getElementById('addChipBtn').addEventListener('click', () => {
      openChipModal({ mode: 'add', onSave: renderChips });
    });

    document.getElementById('backBtn').addEventListener('click', () => navigate('/inicio'));

    renderPlayers();
    renderChips();
  }

  function openChipModal({ mode, chip, onSave }){
    const isEdit = (mode === 'edit');
    const base = chip || { id: uid('chip'), name: '', value: '', color: '#808080', active: true };

    const overlay = el(`
      <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="${isEdit ? 'Editar ficha' : 'Agregar ficha'}">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">${isEdit ? 'Editar ficha' : 'Agregar ficha'}</div>
            <button class="icon-btn" type="button" data-act="close" aria-label="Cerrar">×</button>
          </div>

          <div class="modal-body">
            <div class="form">
              <label class="field">
                <span>Nombre</span>
                <input id="chipName" type="text" maxlength="24" placeholder="Ej. Gris" value="${escapeAttr(base.name || '')}" autocomplete="off" />
              </label>

              <label class="field">
                <span>Valor</span>
                <input id="chipValue" type="number" inputmode="numeric" pattern="[0-9]*" placeholder="Ej. 250" value="${escapeAttr((base.value===0||base.value)?String(base.value):'')}" />
              </label>

              <div class="field">
                <span>Color</span>
                <div class="color-row">
                  <input id="chipColor" class="color" type="color" value="${escapeAttr(normHex(base.color) || '#808080')}" />
                  <input id="chipColorHex" class="text" type="text" maxlength="7" placeholder="#RRGGBB" value="${escapeAttr(normHex(base.color) || '#808080')}" autocapitalize="none" spellcheck="false" />
                  <div class="chip-preview" id="chipPreview" aria-hidden="true"></div>
                </div>
                <div class="hint">Tip: escribe el hex (#RRGGBB) o usa el selector.</div>
              </div>

              <div class="field" style="margin-top:4px">
                <label class="switch">
                  <input id="chipActive" type="checkbox" ${base.active ? 'checked' : ''} />
                  <span class="switch-ui" aria-hidden="true"></span>
                  <span class="switch-text">Activa</span>
                </label>
              </div>
            </div>
          </div>

          <div class="modal-foot">
            <button class="btn" type="button" data-act="cancel">Cancelar</button>
            <button class="btn primary" type="button" data-act="save">${isEdit ? 'Guardar' : 'Crear'}</button>
          </div>
        </div>
      </div>
    `);

    const $name = overlay.querySelector('#chipName');
    const $value = overlay.querySelector('#chipValue');
    const $color = overlay.querySelector('#chipColor');
    const $hex = overlay.querySelector('#chipColorHex');
    const $preview = overlay.querySelector('#chipPreview');
    const $active = overlay.querySelector('#chipActive');

    function setPreview(hex){
      const h = normHex(hex) || '#808080';
      $preview.innerHTML = chipIconSvg(h, 44);
    }

    function syncColorFromHex(){
      const h = normHex($hex.value);
      if (h){
        $color.value = h;
        $hex.value = h;
        setPreview(h);
      }else{
        setPreview('#808080');
      }
    }

    function syncHexFromColor(){
      const h = normHex($color.value) || '#808080';
      $hex.value = h;
      setPreview(h);
    }

    $hex.addEventListener('input', syncColorFromHex);
    $color.addEventListener('input', syncHexFromColor);

    // Close handlers
    function close(){
      overlay.remove();
      try{ document.body.style.overflow = ''; }catch(e){}
    }
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) close();
    });
    overlay.querySelectorAll('[data-act="close"],[data-act="cancel"]').forEach(b => {
      b.addEventListener('click', close);
    });

    overlay.querySelector('[data-act="save"]').addEventListener('click', () => {
      const name = ($name.value || '').trim();
      const color = normHex($hex.value) || normHex($color.value);
      const valRaw = ($value.value || '').trim();
      const valueNum = (valRaw === '') ? '' : Number(valRaw);

      // Simple validation (no drama)
      if (!name){
        $name.classList.add('bad'); $name.focus();
        return;
      }else $name.classList.remove('bad');

      if (valRaw !== '' && (!Number.isFinite(valueNum) || valueNum < 0)){
        $value.classList.add('bad'); $value.focus();
        return;
      }else $value.classList.remove('bad');

      if (!color){
        $hex.classList.add('bad'); $hex.focus();
        return;
      }else $hex.classList.remove('bad');

      const payload = {
        id: base.id,
        name,
        value: (valRaw === '' ? '' : Math.round(valueNum)),
        color,
        active: !!$active.checked,
        createdAt: base.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      upsertChip(payload);
      if (typeof onSave === 'function') onSave();
      close();
    });

    // Mount
    document.body.appendChild(overlay);
    try{ document.body.style.overflow = 'hidden'; }catch(e){}
    setPreview(normHex(base.color) || '#808080');

    // autofocus
    setTimeout(() => {
      try{ $name.focus(); }catch(e){}
    }, 0);
  }

  
  function openPlayerModal({ mode, player, onSave }){
    const isEdit = (mode === 'edit');
    const base = player || { id: uid('player'), name: '', nick: '', active: true, stats: {} };

    const overlay = el(`
      <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="${isEdit ? 'Editar jugador' : 'Agregar jugador'}">
        <div class="modal">
          <div class="modal-head">
            <div class="modal-title">${isEdit ? 'Editar jugador' : 'Agregar jugador'}</div>
            <button class="icon-btn" type="button" data-act="close" aria-label="Cerrar">×</button>
          </div>

          <div class="modal-body">
            <div class="form">
              <label class="field">
                <span>Nombre</span>
                <input id="playerName" type="text" maxlength="32" placeholder="Ej. Alejandro" value="${escapeAttr(base.name || '')}" autocomplete="off" />
              </label>

              <label class="field">
                <span>Apodo (opcional)</span>
                <input id="playerNick" type="text" maxlength="24" placeholder="Ej. El Mago" value="${escapeAttr(base.nick || '')}" autocomplete="off" />
              </label>

              <div class="field" style="margin-top:4px">
                <label class="switch">
                  <input id="playerActive" type="checkbox" ${base.active ? 'checked' : ''} />
                  <span class="switch-ui" aria-hidden="true"></span>
                  <span class="switch-text">Activo</span>
                </label>
              </div>

              <div class="field">
                <span>Estadísticas</span>
                <div class="empty" style="padding:12px">Placeholder listo — se llena en Etapa 6/7.</div>
              </div>
            </div>
          </div>

          <div class="modal-foot">
            <button class="btn" type="button" data-act="cancel">Cancelar</button>
            <button class="btn primary" type="button" data-act="save">${isEdit ? 'Guardar' : 'Crear'}</button>
          </div>
        </div>
      </div>
    `);

    const $name = overlay.querySelector('#playerName');
    const $nick = overlay.querySelector('#playerNick');
    const $active = overlay.querySelector('#playerActive');

    function close(){
      overlay.remove();
      try{ document.body.style.overflow = ''; }catch(e){}
    }

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) close();
    });

    overlay.querySelectorAll('[data-act="close"],[data-act="cancel"]').forEach(b => {
      b.addEventListener('click', close);
    });

    overlay.querySelector('[data-act="save"]').addEventListener('click', () => {
      const name = ($name.value || '').trim();
      const nick = ($nick.value || '').trim();

      if (!name){
        $name.classList.add('bad'); $name.focus();
        return;
      }else $name.classList.remove('bad');

      const payload = {
        id: base.id,
        name,
        nick,
        active: !!$active.checked,
        stats: (base.stats && typeof base.stats === 'object') ? base.stats : {},
        createdAt: base.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      upsertPlayer(payload);
      if (typeof onSave === 'function') onSave();
      close();
    });

    document.body.appendChild(overlay);
    try{ document.body.style.overflow = 'hidden'; }catch(e){}

    setTimeout(() => {
      try{ $name.focus(); }catch(e){}
    }, 0);
  }


  function escapeHtml(s){
    return String(s || '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }

  function escapeAttr(s){
    return escapeHtml(s).replaceAll('`','&#96;');
  }

  function numOrZero(v){
    const n = (typeof v === 'number') ? v : parseFloat(String(v || '').replace(',', '.'));
    return (Number.isFinite(n) ? n : 0);
  }

  function formatMoney(n){
    const x = numOrZero(n);
    // sin moneda fija: cada quien juega su “economía”
    try{
      const nf = new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2, minimumFractionDigits: (Math.abs(x % 1) < 0.0001 ? 0 : 2) });
      return nf.format(x);
    }catch(e){
      return String(Math.round(x * 100) / 100);
    }
  }

  // ===== Etapa 6 helpers: Sesiones (draft/closed) =====
  function pad2(n){ return String(n).padStart(2,'0'); }

  function todayYMD(){
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }

  function snapshotActiveChips(){
    const chips = getChips().filter(c => !!c.active);
    return chips.map((c, i) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      value: c.value,
      order: (typeof c.order === 'number' ? c.order : i),
      style: (c.style && typeof c.style === 'object') ? JSON.parse(JSON.stringify(c.style)) : null,
    }));
  }

  function snapshotPlayers(playerIds){
    const map = new Map(getPlayers().map(p => [p.id, p]));
    return (playerIds || []).map(id => {
      const p = map.get(id) || { id, name: '', nick: '' };
      return {
        id,
        name: p.name || '',
        nick: p.nick || '',
        display: playerDisplayName(p),
      };
    });
  }

  function createDraftSession({ date, playerIds }){
    const now = Date.now();
    const chipsSnapshot = snapshotActiveChips();
    const playersSnapshot = snapshotPlayers(playerIds);

    const s = {
      id: uid('sess'),
      status: 'draft',
      date: String(date || todayYMD()),
      createdAt: now,
      updatedAt: now,
      playerIds: (playerIds || []).slice(),
      playersSnapshot,
      chipsSnapshot,
      game: { players: [] },
    };
    ensureSessionGame(s);
    return s;
  }

  function touchSession(s){
    if (!s || typeof s !== 'object') return;
    s.updatedAt = Date.now();
  }

  function saveSession(s){
    if (!s || !s.id) return;
    if (!Array.isArray(store.sessions)) store.sessions = [];
    const idx = store.sessions.findIndex(x => x && x.id === s.id);
    if (idx >= 0) store.sessions[idx] = s;
    else store.sessions.push(s);
    saveStore();
  }

  function getSessionById(id){
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    return sessions.find(x => x && x.id === id) || null;
  }

  function getClosedSessions(){
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    return sessions
      .filter(s => s && s.status === 'closed')
      .slice()
      .sort((a,b) => numOrZero(b.closedAt || b.updatedAt) - numOrZero(a.closedAt || a.updatedAt));
  }

  function closeSession(id){
    const s = getSessionById(id);
    if (!s) return;
    if (s.status === 'closed') return;
    s.status = 'closed';
    s.closedAt = Date.now();
    touchSession(s);
    saveSession(s);
    if (store.draftSessionId === id) store.draftSessionId = '';
    saveStore();
    // keep stats fresh
    try{ recalcAndPersistStats(); }catch(e){}
  }

  function ensurePlayerState(session, pid){
    ensureSessionGame(session);
    const arr = session.game.players;
    let st = arr.find(x => x && x.id === pid);
    if (!st){
      st = { id: pid, buyIn: 0, rebuys: [], counts: {} };
      arr.push(st);
    }
    if (typeof st.buyIn !== 'number') st.buyIn = numOrZero(st.buyIn);
    if (!Array.isArray(st.rebuys)) st.rebuys = [];
    if (!st.counts || typeof st.counts !== 'object') st.counts = {};
    return st;
  }

  function ensureSessionGame(s){
    if (!s || typeof s !== 'object') return;
    if (!s.game || typeof s.game !== 'object') s.game = {};
    if (!Array.isArray(s.game.players)) s.game.players = [];

    const pids = (Array.isArray(s.playersSnapshot) ? s.playersSnapshot : []).map(p => p.id);
    const cids = (Array.isArray(s.chipsSnapshot) ? s.chipsSnapshot : []).map(c => c.id);

    const oldMap = new Map(s.game.players.map(p => [p.id, p]));
    const next = [];
    pids.forEach(pid => {
      let st = oldMap.get(pid);
      if (!st || typeof st !== 'object') st = { id: pid, buyIn: 0, rebuys: [], counts: {} };
      if (typeof st.buyIn !== 'number') st.buyIn = numOrZero(st.buyIn);
      if (!Array.isArray(st.rebuys)) st.rebuys = [];
      st.rebuys = st.rebuys.map(x => numOrZero(x)).filter(x => x > 0);
      if (!st.counts || typeof st.counts !== 'object') st.counts = {};
      cids.forEach(cid => {
        st.counts[cid] = Math.max(0, Math.floor(numOrZero(st.counts[cid])));
      });
      next.push(st);
    });
    s.game.players = next;
    if (!s.status) s.status = 'draft';
    if (s.status === 'closed' && !s.closedAt) s.closedAt = numOrZero(s.updatedAt) || Date.now();
  }

  function calcPlayerTotals(st, chipValueMap){
    const buyIn = numOrZero(st.buyIn);
    const rebuys = Array.isArray(st.rebuys) ? st.rebuys : [];
    const totalBuyIn = buyIn + rebuys.reduce((a,b) => a + numOrZero(b), 0);
    const counts = (st.counts && typeof st.counts === 'object') ? st.counts : {};
    let totalChipsValue = 0;
    for (const [cid, val] of chipValueMap.entries()){
      const n = Math.max(0, Math.floor(numOrZero(counts[cid])));
      totalChipsValue += n * numOrZero(val);
    }
    const neto = totalChipsValue - totalBuyIn;
    return { totalBuyIn, totalChipsValue, neto };
  }

  function calcSessionSummary(s){
    ensureSessionGame(s);
    const players = Array.isArray(s.playersSnapshot) ? s.playersSnapshot : [];
    const chips = Array.isArray(s.chipsSnapshot) ? s.chipsSnapshot : [];
    const chipValueMap = new Map(chips.map(c => [c.id, numOrZero(c.value)]));
    const pStateMap = new Map((s.game && Array.isArray(s.game.players) ? s.game.players : []).map(p => [p.id, p]));

    let totalInvested = 0;
    let totalChipsValue = 0;
    players.forEach(p => {
      const st = pStateMap.get(p.id) || { id: p.id, buyIn: 0, rebuys: [], counts: {} };
      const t = calcPlayerTotals(st, chipValueMap);
      totalInvested += t.totalBuyIn;
      totalChipsValue += t.totalChipsValue;
    });
    const delta = totalChipsValue - totalInvested;
    return { playersCount: players.length, totalInvested, totalChipsValue, delta };
  }

  // ===== Etapa 7: Analytics (ranking/stats/records/excel) =====
  function analyzeSession(s){
    ensureSessionGame(s);
    const playersSnap = Array.isArray(s.playersSnapshot) ? s.playersSnapshot : [];
    const chipsSnap = Array.isArray(s.chipsSnapshot) ? s.chipsSnapshot : [];
    const chipValueMap = new Map(chipsSnap.map(c => [c.id, numOrZero(c.value)]));
    const pStateMap = new Map((s.game && Array.isArray(s.game.players) ? s.game.players : []).map(p => [p.id, p]));

    const masterPlayers = new Map(getPlayers().map(p => [p.id, p]));
    const rows = playersSnap.map(p => {
      const pid = p.id;
      const st = pStateMap.get(pid) || { id: pid, buyIn: 0, rebuys: [], counts: {} };
      const totals = calcPlayerTotals(st, chipValueMap);
      const mp = masterPlayers.get(pid);
      const display = mp ? playerDisplayName(mp) : (p.display || p.nick || p.name || pid);
      return {
        id: pid,
        display: String(display || pid),
        buyIn: numOrZero(st.buyIn),
        rebuysCount: (Array.isArray(st.rebuys) ? st.rebuys.length : 0),
        rebuysTotal: (Array.isArray(st.rebuys) ? st.rebuys.reduce((a,b) => a + numOrZero(b), 0) : 0),
        invested: totals.totalBuyIn,
        chips: totals.totalChipsValue,
        net: totals.neto,
        pos: 0,
      };
    });

    // position: net desc, chips desc, invested asc, name
    const eps = 0.0001;
    rows.sort((a,b) => {
      const dn = b.net - a.net;
      if (Math.abs(dn) > eps) return dn;
      const dc = b.chips - a.chips;
      if (Math.abs(dc) > eps) return dc;
      const di = a.invested - b.invested;
      if (Math.abs(di) > eps) return di;
      return a.display.localeCompare(b.display, 'es', { sensitivity: 'base' });
    });

    // assign positions (ties share the same position)
    let curPos = 1;
    rows.forEach((r, idx) => {
      if (idx === 0){ r.pos = 1; return; }
      const prev = rows[idx-1];
      if (Math.abs(r.net - prev.net) <= eps) r.pos = prev.pos;
      else { curPos = idx + 1; r.pos = curPos; }
    });

    return { rows, summary: calcSessionSummary(s) };
  }

  function computeAnalytics(){
    const closed = getClosedSessions();
    const byPlayer = new Map();

    let maxTotalInvested = null; // { date, amount }
    let maxGain = null; // { date, amount, player }
    let maxLoss = null; // { date, amount, player }

    const detailed = [];
    const summaryRows = [];

    closed.slice().reverse().forEach(s => {
      // reverse so export can naturally be chronological
      const date = String(s.date || '');
      const an = analyzeSession(s);
      const rows = an.rows;
      const sum = an.summary;

      // session records
      if (!maxTotalInvested || sum.totalInvested > maxTotalInvested.amount){
        maxTotalInvested = { date, amount: sum.totalInvested };
      }

      // winners: position 1 (ties allowed)
      const winners = rows.filter(r => r.pos === 1);
      const winnerLabel = winners.length ? winners.map(w => w.display).join(' & ') : '—';
      const winnerNet = winners.length ? winners[0].net : 0;

      summaryRows.push({
        date,
        playersCount: rows.length,
        totalInvested: sum.totalInvested,
        totalChips: sum.totalChipsValue,
        delta: sum.delta,
        winner: winnerLabel,
        winnerNet,
      });

      rows.forEach(r => {
        detailed.push({
          date,
          playerId: r.id,
          player: r.display,
          buyIn: r.buyIn,
          rebuysTotal: r.rebuysTotal,
          invested: r.invested,
          chips: r.chips,
          net: r.net,
          pos: r.pos,
        });

        // global gain/loss
        if (!maxGain || r.net > maxGain.amount){
          maxGain = { date, amount: r.net, player: r.display };
        }
        if (!maxLoss || r.net < maxLoss.amount){
          maxLoss = { date, amount: r.net, player: r.display };
        }

        // player aggregates
        const cur = byPlayer.get(r.id) || {
          id: r.id,
          display: r.display,
          games: 0,
          wins1: 0,
          netTotal: 0,
          investedTotal: 0,
          chipsTotal: 0,
          best: null, // { net, date }
          worst: null,
        };

        cur.games += 1;
        if (r.pos === 1) cur.wins1 += 1;
        cur.netTotal += r.net;
        cur.investedTotal += r.invested;
        cur.chipsTotal += r.chips;

        if (!cur.best || r.net > cur.best.net) cur.best = { net: r.net, date };
        if (!cur.worst || r.net < cur.worst.net) cur.worst = { net: r.net, date };

        byPlayer.set(r.id, cur);
      });
    });

    const ranking = Array.from(byPlayer.values()).sort((a,b) => {
      const dn = b.netTotal - a.netTotal;
      if (Math.abs(dn) > 0.0001) return dn;
      const dg = b.games - a.games;
      if (dg) return dg;
      return String(a.display).localeCompare(String(b.display), 'es', { sensitivity: 'base' });
    });

    return {
      byPlayer,
      ranking,
      records: {
        maxTotalInvested: maxTotalInvested,
        maxGain: maxGain,
        maxLoss: maxLoss,
      },
      detailed,
      summaryRows,
    };
  }

  function recalcAndPersistStats(){
    const a = computeAnalytics();
    // persist into players.stats (for convenience) + global block
    const players = getPlayers();
    players.forEach(p => {
      const st = a.byPlayer.get(p.id) || null;
      p.stats = st ? {
        netTotal: st.netTotal,
        games: st.games,
        wins1: st.wins1,
        best: st.best,
        worst: st.worst,
        investedTotal: st.investedTotal,
        chipsTotal: st.chipsTotal,
        avgNet: (st.games ? (st.netTotal / st.games) : 0),
      } : {
        netTotal: 0, games: 0, wins1: 0, best: null, worst: null, investedTotal: 0, chipsTotal: 0, avgNet: 0,
      };
    });
    store.players = players;
    store.statsGlobal = {
      updatedAt: Date.now(),
      records: a.records,
    };
    saveStore();
  }

  function ymdCompact(ymd){
    return String(ymd || '').replace(/[^0-9]/g,'').slice(0,8);
  }

  function todayYmd(){
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const da = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${da}`;
  }

  function downloadBlob(blob, filename){
    try{
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { try{ URL.revokeObjectURL(url); }catch(e){} }, 3000);
    }catch(e){}
  }

  function exportExcel(){
    const a = computeAnalytics();
    const date = todayYmd();
    const ymd = ymdCompact(date);
    const filename = `POKERITO_Ranking_Global_${ymd}.xlsx`;

    // Sheet 1: Jugadores
    const jugadoresRows = [[
      'Nombre','Apodo','Partidas','Neto acumulado','Veces #1','Mejor noche (monto)','Fecha mejor noche','Peor noche (monto)','Fecha peor noche','Total invertido histórico','Total fichas histórico','Promedio por partida'
    ]];

    const masterPlayers = new Map(getPlayers().map(p => [p.id, p]));
    const all = a.ranking.slice();
    all.forEach(r => {
      const mp = masterPlayers.get(r.id);
      const nombre = mp ? (mp.name || '') : (r.display || '');
      const apodo = mp ? (mp.nick || '') : '';
      const avg = r.games ? (r.netTotal / r.games) : 0;
      jugadoresRows.push([
        nombre,
        apodo,
        r.games,
        round2(r.netTotal),
        r.wins1,
        r.best ? round2(r.best.net) : '',
        r.best ? (r.best.date || '') : '',
        r.worst ? round2(r.worst.net) : '',
        r.worst ? (r.worst.date || '') : '',
        round2(r.investedTotal || 0),
        round2(r.chipsTotal || 0),
        round2(avg),
      ]);
    });

    // Sheet 2: RecordsGlobales
    const rec = a.records || {};
    const recRows = [['Record','Fecha','Monto','Jugador']];
    recRows.push(['Fecha mayor inversión total', rec.maxTotalInvested ? (rec.maxTotalInvested.date || '') : '', rec.maxTotalInvested ? round2(rec.maxTotalInvested.amount) : '', '']);
    recRows.push(['Mayor ganancia individual', rec.maxGain ? (rec.maxGain.date || '') : '', rec.maxGain ? round2(rec.maxGain.amount) : '', rec.maxGain ? (rec.maxGain.player || '') : '']);
    recRows.push(['Mayor pérdida individual', rec.maxLoss ? (rec.maxLoss.date || '') : '', rec.maxLoss ? round2(rec.maxLoss.amount) : '', rec.maxLoss ? (rec.maxLoss.player || '') : '']);

    // Sheet 3: HistorialDetallado
    const detRows = [['Fecha','Jugador','Buy-in inicial','Total rebuys','Total invertido','Total fichas','Neto','Posición']];
    a.detailed.forEach(r => {
      detRows.push([
        r.date,
        r.player,
        round2(r.buyIn),
        round2(r.rebuysTotal),
        round2(r.invested),
        round2(r.chips),
        round2(r.net),
        r.pos,
      ]);
    });

    // Sheet 4: ResumenPartidas
    const sumRows = [['Fecha','Total jugadores','Total invertido global','Total fichas global','Diferencia','Ganador','Neto ganador']];
    a.summaryRows.forEach(r => {
      sumRows.push([
        r.date,
        r.playersCount,
        round2(r.totalInvested),
        round2(r.totalChips),
        round2(r.delta),
        r.winner,
        round2(r.winnerNet),
      ]);
    });

    const wb = buildXlsx([
      { name: 'Jugadores', rows: jugadoresRows },
      { name: 'RecordsGlobales', rows: recRows },
      { name: 'HistorialDetallado', rows: detRows },
      { name: 'ResumenPartidas', rows: sumRows },
    ]);

    downloadBlob(wb, filename);
  }

  function exportBackupJson(){
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        store: store,
        themePref: themePref,
      }
    };
    const ymd = ymdCompact(todayYmd());
    const hh = String(new Date().getHours()).padStart(2,'0');
    const mm = String(new Date().getMinutes()).padStart(2,'0');
    const filename = `POKERITO_Respaldo_${ymd}_${hh}${mm}.json`;
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filename);
  }

  async function importBackupJson(text, { mode }){
    let obj = null;
    try{ obj = JSON.parse(text); }catch(e){ obj = null; }
    if (!obj || typeof obj !== 'object'){
      await confirmDialog({ title: 'Respaldo inválido', body: 'El archivo no es JSON válido.', okText: 'OK', cancelText: 'Cerrar', danger: true });
      return;
    }
    if (obj.schemaVersion !== 1 || !obj.data || typeof obj.data !== 'object'){
      await confirmDialog({ title: 'Respaldo inválido', body: 'schemaVersion o estructura no reconocida.', okText: 'OK', cancelText: 'Cerrar', danger: true });
      return;
    }
    const incomingStore = obj.data.store;
    if (!incomingStore || typeof incomingStore !== 'object'){
      await confirmDialog({ title: 'Respaldo inválido', body: 'No se encontró data.store.', okText: 'OK', cancelText: 'Cerrar', danger: true });
      return;
    }
    // normalize to our store shape
    const normalized = normalizeIncomingStore(incomingStore);

    const chipsN = (Array.isArray(normalized.chips) ? normalized.chips.length : 0);
    const playersN = (Array.isArray(normalized.players) ? normalized.players.length : 0);
    const sessionsN = (Array.isArray(normalized.sessions) ? normalized.sessions.length : 0);
    const closedN = (Array.isArray(normalized.sessions) ? normalized.sessions.filter(s => s && s.status === 'closed').length : 0);

    const sumBody = `Resumen del respaldo:\n\n• Fichas: ${chipsN}\n• Jugadores: ${playersN}\n• Partidas: ${sessionsN} (cerradas: ${closedN})\n\nModo: ${mode === 'merge' ? 'Fusionar' : 'Reemplazar'}`;

    const ok = await confirmDialog({
      title: 'Importar respaldo',
      body: sumBody + (mode === 'merge' ? '\n\nFusionar solo agrega IDs nuevos (no pisa datos existentes).' : '\n\nReemplazar borrará los datos actuales en este dispositivo.'),
      okText: mode === 'merge' ? 'Fusionar' : 'Reemplazar',
      cancelText: 'Cancelar',
      danger: (mode !== 'merge'),
    });
    if (!ok) return;

    const incomingTheme = (typeof obj.data.themePref === 'string') ? obj.data.themePref : null;
    if (mode === 'merge'){
      mergeStore(normalized);
    } else {
      store = normalized;
      persistStore(store);
    }
    if (incomingTheme){
      themePref = (incomingTheme === 'auto' || incomingTheme === 'light' || incomingTheme === 'dark') ? incomingTheme : themePref;
      try{ localStorage.setItem(THEME_KEY, themePref); }catch(e){}
      applyTheme();
    }
    try{ recalcAndPersistStats(); }catch(e){}
    await confirmDialog({ title: 'Importación completa', body: 'Respaldo aplicado.', okText: 'OK', cancelText: 'Cerrar' });
    navigate('/inicio');
  }

  function normalizeIncomingStore(obj){
    // keep our v/version; avoid destructive migrations
    const out = {
      v: STORE_VERSION,
      chips: Array.isArray(obj.chips) ? obj.chips : defaultChips(),
      players: Array.isArray(obj.players) ? obj.players : defaultPlayers(),
      sessions: Array.isArray(obj.sessions) ? obj.sessions : [],
      draftSessionId: (typeof obj.draftSessionId === 'string') ? obj.draftSessionId : '',
      ui: (obj.ui && typeof obj.ui === 'object') ? obj.ui : { juego: {} },
      createdAt: numOrZero(obj.createdAt) || Date.now(),
      updatedAt: Date.now(),
    };
    // soft migration: ensure sessions shape
    if (Array.isArray(out.sessions)){
      out.sessions.forEach(s => { try{ ensureSessionGame(s); }catch(e){} });
      if (out.draftSessionId){
        const ds = out.sessions.find(x => x && x.id === out.draftSessionId) || null;
        if (ds && ds.status !== 'draft') out.draftSessionId = '';
      }
    }
    return out;
  }

  function mergeStore(incoming){
    // Safe merge: keep current on conflicts, only add missing IDs
    const cur = store;
    const byId = (arr) => {
      const m = new Map();
      (Array.isArray(arr) ? arr : []).forEach(x => { if (x && x.id) m.set(x.id, x); });
      return m;
    };

    const chips = byId(cur.chips);
    (Array.isArray(incoming.chips) ? incoming.chips : []).forEach(c => {
      if (c && c.id && !chips.has(c.id)) chips.set(c.id, c);
    });

    const players = byId(cur.players);
    (Array.isArray(incoming.players) ? incoming.players : []).forEach(p => {
      if (p && p.id && !players.has(p.id)) players.set(p.id, p);
    });

    const sessions = byId(cur.sessions);
    (Array.isArray(incoming.sessions) ? incoming.sessions : []).forEach(s => {
      if (s && s.id && !sessions.has(s.id)) sessions.set(s.id, s);
    });

    cur.chips = Array.from(chips.values());
    cur.players = Array.from(players.values());
    cur.sessions = Array.from(sessions.values());
    cur.updatedAt = Date.now();
    persistStore(cur);
  }

  function resetAllData(){
    try{ localStorage.removeItem(STORE_KEY); }catch(e){}
    try{ localStorage.removeItem(THEME_KEY); }catch(e){}
    themePref = 'auto';
    store = initStore();
    applyTheme();
  }

  function round2(n){
    n = numOrZero(n);
    return Math.round(n * 100) / 100;
  }

  // ===== Minimal XLSX builder (no deps) =====
  function buildXlsx(sheets){
    const safeSheets = (Array.isArray(sheets) ? sheets : []).slice(0, 20);
    const zip = new SimpleZip();
    const now = new Date();

    // workbook + rels
    const wbRels = [];
    const wbSheets = [];
    safeSheets.forEach((sh, i) => {
      const idx = i + 1;
      const name = String(sh.name || `Sheet${idx}`).slice(0, 31);
      wbSheets.push(`<sheet name="${xmlEsc(name)}" sheetId="${idx}" r:id="rId${idx}"/>`);
      wbRels.push(`<Relationship Id="rId${idx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${idx}.xml"/>`);
    });
    wbRels.push(`<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`);
    wbRels.push(`<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`);

    const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheets>${wbSheets.join('')}</sheets>
      </workbook>`;

    const wbRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        ${wbRels.join('')}
      </Relationships>`;

    const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
        <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
        <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
        <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
      </Relationships>`;

    const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
        <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
        <Default Extension="xml" ContentType="application/xml"/>
        <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
        ${safeSheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
        <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
        <Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
        <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
        <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
      </Types>`;

    const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <dc:title>Pokerito</dc:title>
        <dc:creator>Pokerito</dc:creator>
        <cp:lastModifiedBy>Pokerito</cp:lastModifiedBy>
        <dcterms:created xsi:type="dcterms:W3CDTF">${xmlEsc(now.toISOString())}</dcterms:created>
        <dcterms:modified xsi:type="dcterms:W3CDTF">${xmlEsc(now.toISOString())}</dcterms:modified>
      </cp:coreProperties>`;

    const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
        <Application>Pokerito</Application>
      </Properties>`;

    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
        <fonts count="1"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font></fonts>
        <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
        <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
        <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
        <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
        <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
      </styleSheet>`;

    const themeXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">
        <a:themeElements>
          <a:clrScheme name="Office">
            <a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>
            <a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>
            <a:dk2><a:srgbClr val="1F497D"/></a:dk2>
            <a:lt2><a:srgbClr val="EEECE1"/></a:lt2>
            <a:accent1><a:srgbClr val="4F81BD"/></a:accent1>
            <a:accent2><a:srgbClr val="C0504D"/></a:accent2>
            <a:accent3><a:srgbClr val="9BBB59"/></a:accent3>
            <a:accent4><a:srgbClr val="8064A2"/></a:accent4>
            <a:accent5><a:srgbClr val="4BACC6"/></a:accent5>
            <a:accent6><a:srgbClr val="F79646"/></a:accent6>
            <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
            <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
          </a:clrScheme>
          <a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri"/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>
          <a:fmtScheme name="Office"><a:fillStyleLst/><a:lnStyleLst/><a:effectStyleLst/><a:bgFillStyleLst/></a:fmtScheme>
        </a:themeElements>
      </a:theme>`;

    zip.addText('[Content_Types].xml', contentTypesXml);
    zip.addText('_rels/.rels', relsXml);
    zip.addText('docProps/core.xml', coreXml);
    zip.addText('docProps/app.xml', appXml);
    zip.addText('xl/workbook.xml', workbookXml);
    zip.addText('xl/_rels/workbook.xml.rels', wbRelsXml);
    zip.addText('xl/styles.xml', stylesXml);
    zip.addText('xl/theme/theme1.xml', themeXml);

    safeSheets.forEach((sh, i) => {
      const idx = i + 1;
      const rows = Array.isArray(sh.rows) ? sh.rows : [];
      zip.addText(`xl/worksheets/sheet${idx}.xml`, sheetXml(rows));
    });

    return new Blob([zip.build()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function sheetXml(rows){
    const data = rowsToSheetData(rows);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
        <sheetData>${data}</sheetData>
      </worksheet>`;
  }

  function rowsToSheetData(rows){
    const out = [];
    for (let r = 0; r < rows.length; r++){
      const row = Array.isArray(rows[r]) ? rows[r] : [];
      const cells = [];
      for (let c = 0; c < row.length; c++){
        const v = row[c];
        if (v === null || typeof v === 'undefined' || v === '') continue;
        const ref = colLetter(c+1) + String(r+1);
        if (typeof v === 'number' && Number.isFinite(v)){
          cells.push(`<c r="${ref}"><v>${String(v)}</v></c>`);
        } else {
          cells.push(`<c r="${ref}" t="inlineStr"><is><t>${xmlEsc(String(v))}</t></is></c>`);
        }
      }
      out.push(`<row r="${r+1}">${cells.join('')}</row>`);
    }
    return out.join('');
  }

  function colLetter(n){
    let s = '';
    while (n > 0){
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function xmlEsc(s){
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&apos;');
  }

  // ZIP (store method 0) + CRC32
  function SimpleZip(){
    this.files = [];
  }
  SimpleZip.prototype.addText = function(name, text){
    const data = utf8Bytes(String(text || ''));
    this.files.push({ name: String(name), data });
  };
  SimpleZip.prototype.build = function(){
    const parts = [];
    const central = [];
    let offset = 0;
    const dt = zipDosDateTime(new Date());
    for (const f of this.files){
      const nameBytes = utf8Bytes(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;

      const local = new Uint8Array(30 + nameBytes.length);
      writeU32(local, 0, 0x04034b50);
      writeU16(local, 4, 20);
      writeU16(local, 6, 0);
      writeU16(local, 8, 0);
      writeU16(local, 10, dt.time);
      writeU16(local, 12, dt.date);
      writeU32(local, 14, crc);
      writeU32(local, 18, size);
      writeU32(local, 22, size);
      writeU16(local, 26, nameBytes.length);
      writeU16(local, 28, 0);
      local.set(nameBytes, 30);
      parts.push(local, f.data);

      const cen = new Uint8Array(46 + nameBytes.length);
      writeU32(cen, 0, 0x02014b50);
      writeU16(cen, 4, 20);
      writeU16(cen, 6, 20);
      writeU16(cen, 8, 0);
      writeU16(cen, 10, 0);
      writeU16(cen, 12, dt.time);
      writeU16(cen, 14, dt.date);
      writeU32(cen, 16, crc);
      writeU32(cen, 20, size);
      writeU32(cen, 24, size);
      writeU16(cen, 28, nameBytes.length);
      writeU16(cen, 30, 0);
      writeU16(cen, 32, 0);
      writeU16(cen, 34, 0);
      writeU16(cen, 36, 0);
      writeU32(cen, 38, 0);
      writeU32(cen, 42, offset);
      cen.set(nameBytes, 46);
      central.push(cen);

      offset += local.length + size;
    }

    const centralStart = offset;
    let centralSize = 0;
    central.forEach(c => { centralSize += c.length; });
    parts.push(...central);
    offset += centralSize;

    const eocd = new Uint8Array(22);
    writeU32(eocd, 0, 0x06054b50);
    writeU16(eocd, 4, 0);
    writeU16(eocd, 6, 0);
    writeU16(eocd, 8, this.files.length);
    writeU16(eocd, 10, this.files.length);
    writeU32(eocd, 12, centralSize);
    writeU32(eocd, 16, centralStart);
    writeU16(eocd, 20, 0);
    parts.push(eocd);

    const total = parts.reduce((a,p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let pos = 0;
    parts.forEach(p => { out.set(p, pos); pos += p.length; });
    return out;
  };

  function utf8Bytes(str){
    return new TextEncoder().encode(str);
  }

  function writeU16(buf, off, v){
    buf[off] = v & 255;
    buf[off+1] = (v >>> 8) & 255;
  }

  function writeU32(buf, off, v){
    buf[off] = v & 255;
    buf[off+1] = (v >>> 8) & 255;
    buf[off+2] = (v >>> 16) & 255;
    buf[off+3] = (v >>> 24) & 255;
  }

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++){
      let c = i;
      for (let k = 0; k < 8; k++){
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(data){
    let c = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++){
      c = CRC_TABLE[(c ^ data[i]) & 255] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function zipDosDateTime(d){
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const hours = d.getHours();
    const mins = d.getMinutes();
    const secs = Math.floor(d.getSeconds() / 2);
    const dosTime = (hours << 11) | (mins << 5) | secs;
    const dosDate = ((year - 1980) << 9) | (month << 5) | day;
    return { time: dosTime, date: dosDate };
  }

  function lastRebuyOrBuyIn(st){
    if (!st) return 0;
    const r = Array.isArray(st.rebuys) ? st.rebuys : [];
    if (r.length) return numOrZero(r[r.length - 1]);
    return numOrZero(st.buyIn);
  }

  function getDraftSession(){
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    let s = null;
    if (store.draftSessionId){
      s = sessions.find(x => x && x.id === store.draftSessionId && x.status === 'draft') || null;
    }
    if (!s){
      s = sessions.find(x => x && x.status === 'draft') || null;
      if (s && s.id && s.id !== store.draftSessionId){
        store.draftSessionId = s.id;
        saveStore();
      }
    }
    return s;
  }

  function discardDraftSession(){
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    const id = store.draftSessionId;
    if (!id) return;
    store.sessions = sessions.filter(s => !(s && s.id === id));
    store.draftSessionId = '';
    saveStore();
  }

  function confirmDialog({ title, body, okText, cancelText, danger }){
    return new Promise(resolve => {
      const overlay = el(`
        <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="Confirmación">
          <div class="modal">
            <div class="modal-head">
              <div class="modal-title">${escapeHtml(title || 'Confirmar')}</div>
              <button class="icon-btn" type="button" data-act="close" aria-label="Cerrar">×</button>
            </div>
            <div class="modal-body">
              <div class="small-note" style="margin-top:0">${escapeHtml(body || '')}</div>
            </div>
            <div class="modal-foot">
              <button class="btn" type="button" data-act="cancel">${escapeHtml(cancelText || 'Cancelar')}</button>
              <button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-act="ok">${escapeHtml(okText || 'OK')}</button>
            </div>
          </div>
        </div>
      `);

      function close(val){
        overlay.remove();
        try{ document.body.style.overflow = ''; }catch(e){}
        resolve(!!val);
      }

      overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) close(false);
      });
      overlay.querySelectorAll('[data-act="close"],[data-act="cancel"]').forEach(b => b.addEventListener('click', () => close(false)));
      overlay.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));

      document.body.appendChild(overlay);
      try{ document.body.style.overflow = 'hidden'; }catch(e){}
    });
  }

  function numberInputDialog({ title, body, value, placeholder, okText, cancelText }){
    return new Promise(resolve => {
      const overlay = el(`
        <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="Número">
          <div class="modal">
            <div class="modal-head">
              <div class="modal-title">${escapeHtml(title || 'Número')}</div>
              <button class="icon-btn" type="button" data-act="close" aria-label="Cerrar">×</button>
            </div>
            <div class="modal-body">
              ${body ? `<div class="small-note" style="margin-top:0">${escapeHtml(body)}</div>` : ''}
              <label class="field" style="margin-top:10px">
                <span>Cantidad</span>
                <input id="numInput" type="number" inputmode="numeric" pattern="[0-9]*" placeholder="${escapeAttr(placeholder || '')}" value="${escapeAttr(String(value || ''))}" />
              </label>
            </div>
            <div class="modal-foot">
              <button class="btn" type="button" data-act="cancel">${escapeHtml(cancelText || 'Cancelar')}</button>
              <button class="btn primary" type="button" data-act="ok">${escapeHtml(okText || 'OK')}</button>
            </div>
          </div>
        </div>
      `);

      const $inp = overlay.querySelector('#numInput');

      function close(val){
        overlay.remove();
        try{ document.body.style.overflow = ''; }catch(e){}
        resolve(val);
      }

      overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) close(null);
      });
      overlay.querySelectorAll('[data-act="close"],[data-act="cancel"]').forEach(b => b.addEventListener('click', () => close(null)));
      overlay.querySelector('[data-act="ok"]').addEventListener('click', () => close(($inp.value || '').trim()));
      overlay.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); close(null); }
        if (ev.key === 'Enter') { ev.preventDefault(); close(($inp.value || '').trim()); }
      });

      document.body.appendChild(overlay);
      try{ document.body.style.overflow = 'hidden'; }catch(e){}

      // iPad Safari: el teclado SOLO se abre si el focus ocurre dentro del mismo gesto (tap/click).
      // Evitar setTimeout/requestAnimationFrame aquí.
      try{
        // preventScroll no existe en todos los browsers
        $inp.focus({ preventScroll: true });
      }catch(e){
        try{ $inp.focus(); }catch(e2){}
      }
      try{
        // select() a veces falla en type=number; setSelectionRange es más consistente
        const len = ($inp.value || '').length;
        if (typeof $inp.setSelectionRange === 'function') $inp.setSelectionRange(0, len);
        else if (typeof $inp.select === 'function') $inp.select();
      }catch(e){}
    });
  }

  function renderSoporte(){
    const root = el(`
      <section class="screen" aria-label="Soporte">
        <h1 class="screen-title">Soporte</h1>
        <p class="screen-sub">Herramientas y ajustes generales. (Sí, aquí vive el “modo oscuro”.)</p>

        <div class="panel" role="region" aria-label="Apariencia">
          <div class="panel-title">Apariencia</div>
          <div class="segmented" role="radiogroup" aria-label="Tema">
            <button class="seg" type="button" data-theme="auto" aria-checked="false" role="radio">Automático</button>
            <button class="seg" type="button" data-theme="light" aria-checked="false" role="radio">Claro</button>
            <button class="seg" type="button" data-theme="dark" aria-checked="false" role="radio">Oscuro</button>
          </div>
          <div class="small-note" style="margin-top:10px">
            Automático sigue el tema del sistema. Claro/Oscuro lo fuerzan.
          </div>
        </div>

        <div class="panel" role="region" aria-label="Respaldo" style="margin-top:14px">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Respaldo</div>
            <button class="btn" type="button" id="exportJsonBtn">Exportar JSON</button>
          </div>
          <div class="row" style="margin-top:10px; gap:10px; flex-wrap:wrap">
            <button class="btn primary" type="button" id="importJsonBtn">Importar (Reemplazar)</button>
            <button class="btn" type="button" id="importMergeJsonBtn">Importar (Fusionar)</button>
            <input id="importFile" type="file" accept="application/json" style="display:none" />
          </div>
          <div class="small-note" style="margin-top:10px">Importar muestra un resumen (fichas/jugadores/partidas) antes de aplicar. Fusionar solo agrega IDs nuevos (modo seguro).</div>
        </div>

        <div class="panel" role="region" aria-label="Mantenimiento" style="margin-top:14px">
          <div class="panel-title">Mantenimiento</div>
          <div class="row" style="gap:10px; flex-wrap:wrap">
            <button class="btn" type="button" id="recalcBtn">Recalcular estadísticas</button>
            <button class="btn danger" type="button" id="clearBtn">Borrar datos locales</button>
          </div>
          <div class="small-note" style="margin-top:10px">“Borrar” elimina jugadores, fichas y sesiones guardadas en este dispositivo.</div>
        </div>

        <div class="row" style="margin-top:14px">
          <button class="btn primary" type="button" id="backBtn">Volver</button>
        </div>
      </section>
    `);
    $app.innerHTML = '';
    $app.appendChild(root);

    // wire theme selector
    $app.querySelectorAll('.seg[data-theme]').forEach(b => {
      b.addEventListener('click', () => setThemePref(b.getAttribute('data-theme')));
    });
    syncSupportThemeUI();
    document.getElementById('backBtn').addEventListener('click', () => navigate('/inicio'));

    // Backup
    const $file = document.getElementById('importFile');
    const $import = document.getElementById('importJsonBtn');
    const $importMerge = document.getElementById('importMergeJsonBtn');
    let importMode = 'replace';

    document.getElementById('exportJsonBtn').addEventListener('click', () => exportBackupJson());

    function openPicker(mode){
      importMode = mode;
      if ($file) { $file.value = ''; $file.click(); }
    }
    if ($import) $import.addEventListener('click', () => openPicker('replace'));
    if ($importMerge) $importMerge.addEventListener('click', () => openPicker('merge'));

    if ($file){
      $file.addEventListener('change', async () => {
        const f = $file.files && $file.files[0];
        if (!f) return;
        const txt = await f.text().catch(() => '');
        if (!txt) return;
        await importBackupJson(txt, { mode: importMode });
      });
    }

    // Maintenance
    document.getElementById('recalcBtn').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Recalcular estadísticas',
        body: 'Reconstruye stats desde todas las sesiones cerradas.',
        okText: 'Recalcular',
        cancelText: 'Cancelar',
      });
      if (!ok) return;
      recalcAndPersistStats();
      await confirmDialog({ title: 'Listo', body: 'Estadísticas recalculadas.', okText: 'OK', cancelText: 'Cerrar' });
    });

    document.getElementById('clearBtn').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Borrar datos locales',
        body: 'Esto elimina TODO en este dispositivo (jugadores, fichas, sesiones). No hay undo.',
        okText: 'Borrar',
        cancelText: 'Cancelar',
        danger: true,
      });
      if (!ok) return;
      resetAllData();
      await confirmDialog({ title: 'Hecho', body: 'Datos locales borrados.', okText: 'OK', cancelText: 'Cerrar' });
      navigate('/inicio');
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

  function loadThemePref(){
    try{
      const v = localStorage.getItem(THEME_KEY);
      if (THEME_VALUES.has(v)) return v;
    }catch(e){}
    return 'auto';
  }

  function persistThemePref(v){
    try{ localStorage.setItem(THEME_KEY, v); }catch(e){}
  }

  function getEffectiveTheme(){
    if (themePref === 'dark') return 'dark';
    if (themePref === 'light') return 'light';
    return (mqDark && mqDark.matches) ? 'dark' : 'light';
  }

  function applyTheme(){
    const html = document.documentElement;
    if (themePref === 'auto') html.removeAttribute('data-theme');
    else html.setAttribute('data-theme', themePref);
    updateThemeColorMeta();
    updateThemeToggleIcon();
    syncSupportThemeUI();
  }

  function setThemePref(v){
    if (!THEME_VALUES.has(v)) v = 'auto';
    themePref = v;
    persistThemePref(v);
    applyTheme();
  }

  function updateThemeColorMeta(){
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    const eff = getEffectiveTheme();
    meta.setAttribute('content', eff === 'dark' ? '#0f0f14' : '#f6f7fb');
  }

  function createThemeToggle(){
    if (!$headerRight) return null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'icon-btn hide';
    btn.id = 'themeToggle';
    btn.addEventListener('click', () => {
      const eff = getEffectiveTheme();
      // If user was in Auto, toggling means: switch to the opposite of the CURRENT effective theme.
      // Otherwise just flip Light/Dark.
      if (themePref === 'auto') setThemePref(eff === 'dark' ? 'light' : 'dark');
      else setThemePref(themePref === 'dark' ? 'light' : 'dark');
    });
    return btn;
  }

  function updateThemeToggleIcon(){
    if (!$themeToggle) return;
    const eff = getEffectiveTheme();
    // Show the "target" icon (dark -> show sun = go light; light -> show moon = go dark)
    if (eff === 'dark') {
      $themeToggle.innerHTML = ICON_SUN;
      $themeToggle.title = 'Cambiar a tema claro';
      $themeToggle.setAttribute('aria-label', 'Cambiar a tema claro');
    } else {
      $themeToggle.innerHTML = ICON_MOON;
      $themeToggle.title = 'Cambiar a tema oscuro';
      $themeToggle.setAttribute('aria-label', 'Cambiar a tema oscuro');
    }
  }

  function updateHeaderControls(path){
    if (!$themeToggle) return;
    const show = (path === '/juego' || path === '/juego/mesa' || path === '/juego/sesion' || path.startsWith('/historial') || path === '/ranking');
    $themeToggle.classList.toggle('hide', !show);
    if (show) updateThemeToggleIcon();
  }

  function syncSupportThemeUI(){
    const segs = $app.querySelectorAll('.seg[data-theme]');
    if (!segs || !segs.length) return;
    segs.forEach(b => {
      const v = b.getAttribute('data-theme');
      const active = (v === themePref);
      b.classList.toggle('active', active);
      b.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  // PWA: register Service Worker (offline mínimo)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  // If user is on Auto, keep meta + icon aligned when system theme changes
  if (mqDark) {
    const onSysThemeChange = () => {
      if (themePref === 'auto') {
        updateThemeColorMeta();
        updateThemeToggleIcon();
      }
    };
    try { mqDark.addEventListener('change', onSysThemeChange); }
    catch(e){ try { mqDark.addListener(onSysThemeChange); } catch(e2){} }
  }

  window.addEventListener('hashchange', onRoute);
  window.addEventListener('DOMContentLoaded', () => {
    // ensure default route
    if (!window.location.hash) window.location.hash = '#/inicio';
    applyTheme();
    onRoute();
  });

})();
