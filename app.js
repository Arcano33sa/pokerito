/* Pokerito — limpieza final y caché saneada */
(function(){
  const $app = document.getElementById('app');
  const $printRoot = document.getElementById('printRoot');
  const $headerNav = document.getElementById('headerNav');
  const $headerTitle = document.getElementById('headerTitle');
  const $headerRight = document.getElementById('headerRight');

  // Theme (Auto/Light/Dark) — persisted
  const THEME_KEY = 'pokerito_theme';
  const THEME_VALUES = new Set(['auto','light','dark']);
  const mqDark = (window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);
  let themePref = loadThemePref();

  const APP_VERSION = '0.1.51';
  const APP_BUILD = 'pdf-route2-final-stage4';
  const APP_CACHE_NAME = 'pokerito-v0.1.51-pdf-route2-final-stage4';
  const SW_URL = './sw.js?v=0.1.51-pdf-route2-final-stage4';
  const UPDATE_UI_KEY = 'pokerito_update_ui';
  const UPDATE_BOOT_KEY = 'pokerito_update_boot';
  const UPDATE_ACTIVATION_TIMEOUT_MS = 8000;


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
  const ICON_HOME = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M3 10.8 12 3l9 7.8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M5.5 9.8V20h13V9.8" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
      <path d="M10 20v-5.2h4V20" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
    </svg>
  `;
  const ICON_BACK = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M15 5 8 12l7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const HEADER_ROUTE_META = {
    '/inicio': { level: 0, title: 'Inicio', fallbackBack: '/inicio' },
    '/juego': { level: 1, title: 'Juego', fallbackBack: '/inicio' },
    '/administracion': { level: 1, title: 'Administración', fallbackBack: '/inicio' },
    '/configuracion': { level: 1, title: 'Administración', fallbackBack: '/inicio' },
    '/archivo': { level: 1, title: 'Archivo', fallbackBack: '/inicio' },
    '/juego/mesa': { level: 2, title: 'Mesa', fallbackBack: '/juego' },
    '/juego/sesion': { level: 2, title: 'Mesa', fallbackBack: '/juego' },
    '/archivo/historial': { level: 2, title: 'Archivo · Historial', fallbackBack: '/archivo' },
    '/archivo/ranking': { level: 2, title: 'Archivo · Ranking', fallbackBack: '/archivo' },
    '/archivo/perfiles': { level: 2, title: 'Archivo · Perfiles', fallbackBack: '/archivo' },
    '/archivo/perfiles/detalle': { level: 3, title: 'Archivo · Perfil', fallbackBack: '/archivo/perfiles' },
    '/archivo/historial/detalle': { level: 3, title: 'Archivo · Historial detalle', fallbackBack: '/archivo/historial' },
    '/pdf': { level: 3, title: 'PDF', fallbackBack: '/archivo/historial' },
  };
  const headerNavTrail = [];
  let currentHeaderRouteHref = '/inicio';
  let pendingHeaderNavIntent = null;
  let updateUiState = loadUpdateUiState();
  let updateCheckInFlight = false;
  let updateApplyInFlight = false;
  let swRegistrationRef = null;
  let swLifecycleBound = false;

  const $themeToggle = createThemeToggle();
  if ($headerRight && $themeToggle) $headerRight.appendChild($themeToggle);


  const $root = document.documentElement;

  let viewportSyncTimer = 0;

  function queueViewportSync(delay){
    if (viewportSyncTimer) clearTimeout(viewportSyncTimer);
    if (delay > 0){
      viewportSyncTimer = setTimeout(() => {
        viewportSyncTimer = 0;
        syncViewportProfile();
      }, delay);
      return;
    }
    syncViewportProfile();
  }

  syncViewportProfile();
  window.addEventListener('resize', () => queueViewportSync(0), { passive: true });
  window.addEventListener('orientationchange', () => {
    requestAnimationFrame(() => queueViewportSync(0));
    queueViewportSync(180);
  }, { passive: true });
  if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function'){
    window.visualViewport.addEventListener('resize', () => queueViewportSync(0), { passive: true });
  }

  function coerceViewportNumber(value, fallback){
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
  }

  function readViewportBox(){
    const vv = window.visualViewport;
    const width = coerceViewportNumber(vv && vv.width, coerceViewportNumber(window.innerWidth, coerceViewportNumber($root && $root.clientWidth, 1024)));
    const height = coerceViewportNumber(vv && vv.height, coerceViewportNumber(window.innerHeight, coerceViewportNumber($root && $root.clientHeight, 768)));
    return { width, height };
  }

  function getViewportBucket(width, height){
    const safeWidth = coerceViewportNumber(width, 0);
    const safeHeight = coerceViewportNumber(height, 0);
    const shortEdge = Math.min(safeWidth, safeHeight);
    const longEdge = Math.max(safeWidth, safeHeight);
    if (shortEdge >= 900 || longEdge >= 1366) return 'wide';
    if (shortEdge >= 700 || longEdge >= 1024) return 'regular';
    return 'compact';
  }

  function syncViewportProfile(){
    if (!$root) return;
    const box = readViewportBox();
    const width = Math.max(1, box.width);
    const height = Math.max(1, box.height);
    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);
    const orientation = height > width ? 'portrait' : 'landscape';
    const bucket = getViewportBucket(width, height);
    $root.dataset.vpOrientation = orientation;
    $root.dataset.vpWidth = bucket;
    $root.style.setProperty('--app-vw', `${width}px`);
    $root.style.setProperty('--app-vh', `${height}px`);
    $root.style.setProperty('--app-short-edge', `${shortEdge}px`);
    $root.style.setProperty('--app-long-edge', `${longEdge}px`);
  }


// Storage (versioned) — local only for now
const STORE_KEY = 'pokerito_store_v1';
const STORE_VERSION = 1;
const PORTABLE_APP = 'Pokerito';
const PORTABLE_SCHEMA_VERSION = 2;
const IMPORT_SAFETY_BACKUP_KEY = 'pokerito_import_safety_backup_v1';
let store = loadStore();
store = applyStartupForensicSelfHeal(store);

// Chips defaults (Etapa 3)
function defaultChips(){
  const now = Date.now();
  return [
    { id: 'chip_white', name: 'Blanca', value: 1,   color: '#ffffff', active: true, createdAt: now, updatedAt: now },
    { id: 'chip_red',   name: 'Roja',   value: 5,   color: '#d94141', active: true, createdAt: now, updatedAt: now },
    { id: 'chip_green', name: 'Verde',  value: 25,  color: '#2cbf6e', active: true, createdAt: now, updatedAt: now },
    { id: 'chip_black', name: 'Negra',  value: 100, color: '#111116', active: true, createdAt: now, updatedAt: now },
    { id: 'chip_blue',  name: 'Azul',   value: 500, color: '#2f6fff', active: true, createdAt: now, updatedAt: now },
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

function isPlainObject(v){
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function safeTrim(v){
  return String(v == null ? '' : v).trim();
}

function stripAccentsLoose(value){
  const str = String(value == null ? '' : value);
  try{ return str.normalize('NFD').replace(/[̀-ͯ]/g, ''); }catch(e){ return str; }
}

function normalizeIdentityText(value){
  return stripAccentsLoose(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cloneJson(v){
  try{ return JSON.parse(JSON.stringify(v)); }catch(e){ return null; }
}

function stableEntityId(entity){
  if (typeof entity === 'string') return safeTrim(entity);
  if (!isPlainObject(entity)) return '';
  return firstNonEmpty(entity.id, entity.playerId, entity.sessionId, entity.chipId, entity.uuid);
}

function sameStableEntity(a, b){
  const aid = stableEntityId(a);
  const bid = stableEntityId(b);
  return !!aid && aid === bid;
}

function findIndexByStableId(arr, entityOrId){
  const id = stableEntityId(entityOrId);
  if (!id) return -1;
  const safe = Array.isArray(arr) ? arr : [];
  for (let i = 0; i < safe.length; i++){
    if (sameStableEntity(safe[i], id)) return i;
  }
  return -1;
}

function firstNonEmpty(){
  for (let i = 0; i < arguments.length; i++){
    const v = safeTrim(arguments[i]);
    if (v) return v;
  }
  return '';
}

function uniqStrings(values){
  const out = [];
  const seen = new Set();
  (Array.isArray(values) ? values : []).forEach(v => {
    const s = safeTrim(v);
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  });
  return out;
}

function hashTiny(input){
  const str = String(input || '');
  let h = 2166136261;
  for (let i = 0; i < str.length; i++){
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(36);
}

function deterministicBackfillId(prefix, seed, usedIds){
  const root = `${prefix}_${hashTiny(seed || `${prefix}_${Date.now()}`)}`;
  let out = root;
  let n = 2;
  while (usedIds && usedIds.has(out)) out = `${root}_${n++}`;
  if (usedIds) usedIds.add(out);
  return out;
}

function buildPlayerIdentity(player){
  const src = isPlainObject(player) ? player : {};
  const normalizedName = normalizeIdentityText(src.name);
  const normalizedNick = normalizeIdentityText(src.nick);
  const aliasValues = uniqStrings([normalizedName, normalizedNick].filter(Boolean));
  const pairKey = (normalizedName && normalizedNick && normalizedName !== normalizedNick)
    ? `pair:${normalizedName}|${normalizedNick}`
    : '';
  const simpleKey = (!pairKey && aliasValues.length === 1)
    ? `simple:${aliasValues[0]}`
    : '';
  const nameKey = normalizedName ? `name:${normalizedName}` : '';
  const nickKey = normalizedNick ? `nick:${normalizedNick}` : '';
  return {
    v: 1,
    structure: pairKey ? 'pair' : (simpleKey ? 'simple' : ((nameKey || nickKey) ? 'partial' : 'empty')),
    canonicalKey: pairKey || simpleKey || '',
    normalized: {
      name: normalizedName,
      nick: normalizedNick,
    },
    keys: {
      pair: pairKey,
      simple: simpleKey,
      name: nameKey,
      nick: nickKey,
    }
  };
}

function getPlayerIdentity(player){
  const src = isPlainObject(player) ? player : {};
  const identity = isPlainObject(src.identity) ? src.identity : null;
  if (identity && identity.v === 1 && isPlainObject(identity.keys) && isPlainObject(identity.normalized)) return identity;
  return buildPlayerIdentity(src);
}

function playerIdentityDisplay(player){
  return firstNonEmpty(playerDisplayName(player), safeTrim(player && player.name), safeTrim(player && player.nick), stableEntityId(player), 'Sin nombre');
}

function buildPlayerIdentityDiagnostics(players){
  const list = Array.isArray(players) ? players : [];
  const strongGroups = [];
  const doubtfulGroups = [];
  const assignedStrongIds = new Set();
  const pushGroup = (target, type, key, reason, members) => {
    const rows = (Array.isArray(members) ? members : []).filter(Boolean);
    if (rows.length < 2) return;
    const ids = uniqStrings(rows.map(item => stableEntityId(item)).filter(Boolean));
    if (ids.length < 2) return;
    target.push({
      type,
      key,
      reason,
      playerIds: ids,
      labels: rows.map(item => playerIdentityDisplay(item)),
    });
  };

  const pairGroups = new Map();
  const simpleGroups = new Map();
  const nameGroups = new Map();
  const nickGroups = new Map();

  list.forEach(player => {
    const identity = getPlayerIdentity(player);
    if (identity.keys.pair){
      if (!pairGroups.has(identity.keys.pair)) pairGroups.set(identity.keys.pair, []);
      pairGroups.get(identity.keys.pair).push(player);
    }
    if (identity.keys.simple){
      if (!simpleGroups.has(identity.keys.simple)) simpleGroups.set(identity.keys.simple, []);
      simpleGroups.get(identity.keys.simple).push(player);
    }
    if (identity.keys.name){
      if (!nameGroups.has(identity.keys.name)) nameGroups.set(identity.keys.name, []);
      nameGroups.get(identity.keys.name).push(player);
    }
    if (identity.keys.nick){
      if (!nickGroups.has(identity.keys.nick)) nickGroups.set(identity.keys.nick, []);
      nickGroups.get(identity.keys.nick).push(player);
    }
  });

  pairGroups.forEach((members, key) => {
    if ((members || []).length < 2) return;
    members.forEach(item => {
      const id = stableEntityId(item);
      if (id) assignedStrongIds.add(id);
    });
    pushGroup(strongGroups, 'pair', key, 'exact-normalized-name+nick', members);
  });

  simpleGroups.forEach((members, key) => {
    const rows = (members || []).filter(item => {
      const id = stableEntityId(item);
      return !(id && assignedStrongIds.has(id));
    });
    if (rows.length < 2) return;
    pushGroup(doubtfulGroups, 'simple', key, 'exact-single-identity-without-full-pair', rows);
  });

  const pushOverlapGroups = (map, type, reason) => {
    map.forEach((members, key) => {
      const rows = (members || []).filter(item => {
        const id = stableEntityId(item);
        return !(id && assignedStrongIds.has(id));
      });
      if (rows.length < 2) return;
      const distinctShapes = uniqStrings(rows.map(item => {
        const identity = getPlayerIdentity(item);
        return firstNonEmpty(identity.keys.pair, identity.keys.simple, identity.keys.name, identity.keys.nick);
      }));
      if (distinctShapes.length < 2) return;
      pushGroup(doubtfulGroups, type, key, reason, rows);
    });
  };

  pushOverlapGroups(nameGroups, 'name', 'same-normalized-name-different-identity-shape');
  pushOverlapGroups(nickGroups, 'nick', 'same-normalized-nick-different-identity-shape');

  const strongPlayerIds = uniqStrings([].concat.apply([], strongGroups.map(group => group.playerIds || [])));
  const doubtfulPlayerIds = uniqStrings([].concat.apply([], doubtfulGroups.map(group => group.playerIds || [])));
  const lastTouchedAt = maxTs.apply(null, list.map(player => maxTs(player && player.updatedAt, player && player.createdAt)).filter(Boolean));

  return {
    v: 1,
    updatedAt: lastTouchedAt || 0,
    counts: {
      strongGroups: strongGroups.length,
      strongPlayers: strongPlayerIds.length,
      doubtfulGroups: doubtfulGroups.length,
      doubtfulPlayers: doubtfulPlayerIds.length,
    },
    strongGroups: strongGroups.slice(0, 100),
    doubtfulGroups: doubtfulGroups.slice(0, 100),
  };
}

function detectCrossStorePlayerIdentity(localPlayers, incomingPlayers){
  const local = Array.isArray(localPlayers) ? localPlayers : [];
  const incoming = Array.isArray(incomingPlayers) ? incomingPlayers : [];
  const localByPair = new Map();
  const localBySimple = new Map();
  const localByName = new Map();
  const localByNick = new Map();
  const add = (map, key, player) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(player);
  };

  local.forEach(player => {
    const identity = getPlayerIdentity(player);
    add(localByPair, identity.keys.pair, player);
    add(localBySimple, identity.keys.simple, player);
    add(localByName, identity.keys.name, player);
    add(localByNick, identity.keys.nick, player);
  });

  const strong = [];
  const doubtful = [];
  const seen = new Set();
  const push = (target, type, reason, localPlayer, incomingPlayer, key) => {
    const localId = stableEntityId(localPlayer);
    const incomingId = stableEntityId(incomingPlayer);
    if (!localId || !incomingId || localId === incomingId) return;
    const token = `${type}|${reason}|${localId}|${incomingId}|${key}`;
    if (seen.has(token)) return;
    seen.add(token);
    target.push({
      type,
      reason,
      key,
      localId,
      localLabel: playerIdentityDisplay(localPlayer),
      incomingId,
      incomingLabel: playerIdentityDisplay(incomingPlayer),
    });
  };

  incoming.forEach(player => {
    const incomingId = stableEntityId(player);
    const identity = getPlayerIdentity(player);
    if (!incomingId) return;

    const strongMatches = localByPair.get(identity.keys.pair) || [];
    strongMatches.forEach(localPlayer => push(strong, 'pair', 'exact-normalized-name+nick', localPlayer, player, identity.keys.pair));

    if (!strongMatches.length){
      const simpleMatches = localBySimple.get(identity.keys.simple) || [];
      simpleMatches.forEach(localPlayer => push(doubtful, 'simple', 'exact-single-identity-without-full-pair', localPlayer, player, identity.keys.simple));

      const nameMatches = localByName.get(identity.keys.name) || [];
      nameMatches.forEach(localPlayer => {
        const localIdentity = getPlayerIdentity(localPlayer);
        if (localIdentity.keys.pair && identity.keys.pair && localIdentity.keys.pair === identity.keys.pair) return;
        push(doubtful, 'name', 'same-normalized-name', localPlayer, player, identity.keys.name);
      });

      const nickMatches = localByNick.get(identity.keys.nick) || [];
      nickMatches.forEach(localPlayer => {
        const localIdentity = getPlayerIdentity(localPlayer);
        if (localIdentity.keys.pair && identity.keys.pair && localIdentity.keys.pair === identity.keys.pair) return;
        push(doubtful, 'nick', 'same-normalized-nick', localPlayer, player, identity.keys.nick);
      });
    }
  });

  return {
    strong,
    doubtful,
    counts: {
      strong: strong.length,
      doubtful: doubtful.length,
    }
  };
}


function buildPlayerCanonicalMergePlan(localPlayers, incomingPlayers){
  const local = Array.isArray(localPlayers) ? localPlayers : [];
  const incoming = Array.isArray(incomingPlayers) ? incomingPlayers : [];
  const localById = new Map();
  const localByPair = new Map();
  const localBySimple = new Map();
  const localByName = new Map();
  const localByNick = new Map();
  const add = (map, key, player) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(player);
  };

  local.forEach(player => {
    const id = stableEntityId(player);
    const identity = getPlayerIdentity(player);
    if (id && !localById.has(id)) localById.set(id, player);
    add(localByPair, identity.keys.pair, player);
    add(localBySimple, identity.keys.simple, player);
    add(localByName, identity.keys.name, player);
    add(localByNick, identity.keys.nick, player);
  });

  const canonicalByIncomingId = new Map();
  const recognized = [];
  const doubtful = [];
  const created = [];

  incoming.forEach(player => {
    const incomingId = stableEntityId(player);
    const incomingIdentity = getPlayerIdentity(player);
    if (!incomingId) return;

    const localSameId = localById.get(incomingId) || null;
    if (localSameId){
      canonicalByIncomingId.set(incomingId, incomingId);
      recognized.push({
        mode: 'same-id',
        incomingId,
        canonicalId: incomingId,
        incomingLabel: playerIdentityDisplay(player),
        canonicalLabel: playerIdentityDisplay(localSameId),
      });
      return;
    }

    const pairMatches = incomingIdentity.keys.pair ? (localByPair.get(incomingIdentity.keys.pair) || []) : [];
    if (pairMatches.length === 1){
      const canonical = pairMatches[0];
      const canonicalId = stableEntityId(canonical);
      if (canonicalId){
        canonicalByIncomingId.set(incomingId, canonicalId);
        recognized.push({
          mode: 'canonical-pair',
          reason: 'exact-normalized-name+nick',
          incomingId,
          canonicalId,
          incomingLabel: playerIdentityDisplay(player),
          canonicalLabel: playerIdentityDisplay(canonical),
        });
        return;
      }
    }

    const doubtfulReasons = [];
    const simpleMatches = incomingIdentity.keys.simple ? (localBySimple.get(incomingIdentity.keys.simple) || []) : [];
    const nameMatches = incomingIdentity.keys.name ? (localByName.get(incomingIdentity.keys.name) || []) : [];
    const nickMatches = incomingIdentity.keys.nick ? (localByNick.get(incomingIdentity.keys.nick) || []) : [];
    if (pairMatches.length > 1) doubtfulReasons.push('multiple-strong-local-candidates');
    if (simpleMatches.length) doubtfulReasons.push('exact-single-identity-without-full-pair');
    if (nameMatches.length) doubtfulReasons.push('same-normalized-name');
    if (nickMatches.length) doubtfulReasons.push('same-normalized-nick');

    if (doubtfulReasons.length){
      doubtful.push({
        incomingId,
        incomingLabel: playerIdentityDisplay(player),
        reasons: uniqStrings(doubtfulReasons),
      });
      return;
    }

    created.push({
      incomingId,
      incomingLabel: playerIdentityDisplay(player),
    });
  });

  return {
    canonicalByIncomingId,
    recognized,
    doubtful,
    created,
    counts: {
      recognizedExisting: recognized.length,
      canonicalReconciled: recognized.filter(item => item && item.mode === 'canonical-pair').length,
      sameIdExisting: recognized.filter(item => item && item.mode === 'same-id').length,
      doubtful: doubtful.length,
      newReal: created.length,
    }
  };
}

function mergeSessionSnapshotEntry(baseEntry, extraEntry, masterPlayer){
  const base = isPlainObject(baseEntry) ? baseEntry : {};
  const extra = isPlainObject(extraEntry) ? extraEntry : {};
  const master = isPlainObject(masterPlayer) ? masterPlayer : {};
  const id = stableEntityId(base) || stableEntityId(extra) || stableEntityId(master);
  const name = preferString(base.name, extra.name, false) || safeTrim(master.name);
  const nick = preferString(base.nick, extra.nick, false) || safeTrim(master.nick);
  const display = preferString(base.display, extra.display, false) || nick || name || playerDisplayName(master) || 'Sin nombre';
  return Object.assign({}, extra, base, {
    id,
    name,
    nick,
    display,
  });
}

function mergeSessionPlayerState(baseState, extraState, chipIds){
  const base = isPlainObject(baseState) ? baseState : {};
  const extra = isPlainObject(extraState) ? extraState : {};
  const mergedCounts = {};
  const allChipIds = uniqStrings([].concat(Array.isArray(chipIds) ? chipIds : [], Object.keys(isPlainObject(base.counts) ? base.counts : {}), Object.keys(isPlainObject(extra.counts) ? extra.counts : {})));
  allChipIds.forEach(cid => {
    mergedCounts[cid] = Math.max(0, Math.floor(numOrZero(base.counts && base.counts[cid]) + numOrZero(extra.counts && extra.counts[cid])));
  });
  return Object.assign({}, extra, base, {
    id: stableEntityId(base) || stableEntityId(extra),
    buyIn: numOrZero(base.buyIn) + numOrZero(extra.buyIn),
    rebuys: [].concat(Array.isArray(base.rebuys) ? base.rebuys.map(numOrZero).filter(v => v > 0) : [], Array.isArray(extra.rebuys) ? extra.rebuys.map(numOrZero).filter(v => v > 0) : []),
    counts: mergedCounts,
  });
}

function remapSessionPlayerReferences(session, canonicalByIncomingId, playerById, opts){
  const src = cloneJson(session) || session || {};
  const map = (canonicalByIncomingId instanceof Map) ? canonicalByIncomingId : new Map();
  const masterById = (playerById instanceof Map) ? playerById : new Map();
  const options = isPlainObject(opts) ? opts : {};
  const touchedIds = new Set();
  const touchedStructures = new Set();

  const remapId = (rawId, structure) => {
    const incomingId = stableEntityId(rawId);
    if (!incomingId) return '';
    const mappedId = map.get(incomingId) || incomingId;
    if (mappedId !== incomingId){
      touchedIds.add(incomingId);
      if (structure) touchedStructures.add(String(structure));
    }
    return mappedId;
  };

  const sourceIds = uniqStrings([
    ...(Array.isArray(src.playerIds) ? src.playerIds.map(pid => remapId(pid, 'playerIds')) : []),
    ...(Array.isArray(src.playersSnapshot) ? src.playersSnapshot.map(entry => remapId(entry, 'playersSnapshot')) : []),
    ...((src.game && Array.isArray(src.game.players)) ? src.game.players.map(entry => remapId(entry, 'game.players')) : []),
  ].filter(Boolean));

  const mappedIds = sourceIds.slice();
  const chipIds = uniqStrings((Array.isArray(src.chipsSnapshot) ? src.chipsSnapshot : []).map(stableEntityId).filter(Boolean));

  const snapshotMap = new Map();
  (Array.isArray(src.playersSnapshot) ? src.playersSnapshot : []).forEach(entry => {
    const mappedId = remapId(entry, 'playersSnapshot');
    if (!mappedId) return;
    const master = masterById.get(mappedId) || null;
    const nextEntry = Object.assign({}, entry, { id: mappedId });
    const prev = snapshotMap.get(mappedId) || null;
    snapshotMap.set(mappedId, mergeSessionSnapshotEntry(prev, nextEntry, master));
  });
  mappedIds.forEach(pid => {
    if (snapshotMap.has(pid)) return;
    const master = masterById.get(pid) || {};
    snapshotMap.set(pid, mergeSessionSnapshotEntry(null, { id: pid }, master));
  });

  const gameMap = new Map();
  const rawGamePlayers = (src && src.game && Array.isArray(src.game.players)) ? src.game.players : [];
  rawGamePlayers.forEach(entry => {
    const mappedId = remapId(entry, 'game.players');
    if (!mappedId) return;
    const nextEntry = Object.assign({}, entry, { id: mappedId });
    const prev = gameMap.get(mappedId) || null;
    gameMap.set(mappedId, mergeSessionPlayerState(prev, nextEntry, chipIds));
  });
  mappedIds.forEach(pid => {
    if (gameMap.has(pid)) return;
    gameMap.set(pid, mergeSessionPlayerState(null, { id: pid, buyIn: 0, rebuys: [], counts: {} }, chipIds));
  });

  const out = Object.assign({}, src, {
    playerIds: mappedIds,
    playersSnapshot: mappedIds.map(pid => snapshotMap.get(pid)).filter(Boolean),
    game: Object.assign({}, isPlainObject(src.game) ? src.game : {}, {
      players: mappedIds.map(pid => gameMap.get(pid)).filter(Boolean),
    }),
  });

  if ((options.invalidateDerived !== false) && touchedIds.size){
    delete out.historicalImpact;
  }

  return {
    session: out,
    changed: touchedIds.size > 0,
    touchedIds: uniqStrings(Array.from(touchedIds)),
    touchedStructures: uniqStrings(Array.from(touchedStructures)),
  };
}

function remapIncomingSessionPlayers(session, canonicalByIncomingId, localPlayerById){
  return remapSessionPlayerReferences(session, canonicalByIncomingId, localPlayerById, { invalidateDerived: false }).session;
}

function countPlayerReferencesAcrossSessions(sessions){
  const stats = new Map();
  const touch = (pid, bucket) => {
    const id = stableEntityId(pid);
    if (!id) return;
    if (!stats.has(id)){
      stats.set(id, {
        rawRefs: 0,
        sessionRefs: 0,
        closedSessionRefs: 0,
        buckets: new Set(),
      });
    }
    const row = stats.get(id);
    row.rawRefs += 1;
    if (bucket) row.buckets.add(String(bucket));
  };

  (Array.isArray(sessions) ? sessions : []).forEach(session => {
    const s = isPlainObject(session) ? session : {};
    const status = safeTrim(s.status);
    const uniqueInSession = new Set();
    (Array.isArray(s.playerIds) ? s.playerIds : []).forEach(pid => {
      const id = stableEntityId(pid);
      if (!id) return;
      touch(id, 'playerIds');
      uniqueInSession.add(id);
    });
    (Array.isArray(s.playersSnapshot) ? s.playersSnapshot : []).forEach(entry => {
      const id = stableEntityId(entry);
      if (!id) return;
      touch(id, 'playersSnapshot');
      uniqueInSession.add(id);
    });
    ((s.game && Array.isArray(s.game.players)) ? s.game.players : []).forEach(entry => {
      const id = stableEntityId(entry);
      if (!id) return;
      touch(id, 'game.players');
      uniqueInSession.add(id);
    });

    uniqueInSession.forEach(id => {
      const row = stats.get(id) || { rawRefs: 0, sessionRefs: 0, closedSessionRefs: 0, buckets: new Set() };
      row.sessionRefs += 1;
      if (status === 'closed') row.closedSessionRefs += 1;
      stats.set(id, row);
    });
  });

  return stats;
}

function chooseCanonicalLocalPlayer(players, refStats){
  const list = (Array.isArray(players) ? players : []).filter(Boolean).slice();
  const getRef = (player, key) => {
    const row = refStats.get(stableEntityId(player));
    return numOrZero(row && row[key]);
  };
  const identityCompleteness = (player) => {
    const identity = getPlayerIdentity(player);
    return [
      !!(identity && identity.keys && identity.keys.pair),
      !!safeTrim(player && player.name),
      !!safeTrim(player && player.nick),
    ].filter(Boolean).length;
  };
  list.sort((a, b) => {
    const byClosedRefs = getRef(b, 'closedSessionRefs') - getRef(a, 'closedSessionRefs');
    if (byClosedRefs) return byClosedRefs;
    const bySessionRefs = getRef(b, 'sessionRefs') - getRef(a, 'sessionRefs');
    if (bySessionRefs) return bySessionRefs;
    const byRawRefs = getRef(b, 'rawRefs') - getRef(a, 'rawRefs');
    if (byRawRefs) return byRawRefs;
    const byGames = numOrZero(b && b.stats && b.stats.games) - numOrZero(a && a.stats && a.stats.games);
    if (byGames) return byGames;
    const byActive = (b && b.active ? 1 : 0) - (a && a.active ? 1 : 0);
    if (byActive) return byActive;
    const byCreated = minPositiveTs(a && a.createdAt, a && a.updatedAt) - minPositiveTs(b && b.createdAt, b && b.updatedAt);
    if (byCreated) return byCreated;
    const byCompleteness = identityCompleteness(b) - identityCompleteness(a);
    if (byCompleteness) return byCompleteness;
    return String(stableEntityId(a) || '').localeCompare(String(stableEntityId(b) || ''), 'es', { sensitivity: 'base' });
  });
  return list[0] || null;
}

function buildLocalCanonicalReferencePlan(players, sessions){
  const list = Array.isArray(players) ? players : [];
  const sessionList = Array.isArray(sessions) ? sessions : [];
  const refStats = countPlayerReferencesAcrossSessions(sessionList);
  const groupsByPair = new Map();

  list.forEach(player => {
    const id = stableEntityId(player);
    const identity = getPlayerIdentity(player);
    if (!id || !(identity && identity.keys && identity.keys.pair)) return;
    if (!groupsByPair.has(identity.keys.pair)) groupsByPair.set(identity.keys.pair, []);
    groupsByPair.get(identity.keys.pair).push(player);
  });

  const canonicalByDuplicateId = new Map();
  const groups = [];

  groupsByPair.forEach((members, pairKey) => {
    const rows = (members || []).filter(Boolean);
    if (rows.length < 2) return;
    const canonicalPlayer = chooseCanonicalLocalPlayer(rows, refStats);
    const canonicalId = stableEntityId(canonicalPlayer);
    if (!canonicalId) return;
    const duplicates = rows
      .map(player => stableEntityId(player))
      .filter(pid => !!pid && pid !== canonicalId);

    if (!duplicates.length) return;

    duplicates.forEach(pid => canonicalByDuplicateId.set(pid, canonicalId));
    groups.push({
      pairKey,
      canonicalId,
      canonicalLabel: playerIdentityDisplay(canonicalPlayer),
      duplicateIds: duplicates.slice(),
      duplicateLabels: rows
        .filter(player => stableEntityId(player) !== canonicalId)
        .map(player => playerIdentityDisplay(player)),
      criteria: {
        closedSessionRefs: numOrZero(refStats.get(canonicalId) && refStats.get(canonicalId).closedSessionRefs),
        sessionRefs: numOrZero(refStats.get(canonicalId) && refStats.get(canonicalId).sessionRefs),
        rawRefs: numOrZero(refStats.get(canonicalId) && refStats.get(canonicalId).rawRefs),
      }
    });
  });

  return {
    canonicalByDuplicateId,
    groups,
    counts: {
      strongGroups: groups.length,
      duplicatePlayers: canonicalByDuplicateId.size,
    },
  };
}

function remapStoreCanonicalPlayerReferences(inputStore){
  const base = normalizeStoreObject(inputStore).store;
  const plan = buildLocalCanonicalReferencePlan(base.players, base.sessions);
  if (!(plan && plan.canonicalByDuplicateId instanceof Map) || !plan.canonicalByDuplicateId.size){
    return {
      store: base,
      plan,
      summary: {
        groups: 0,
        duplicatePlayers: 0,
        sessionsTouched: 0,
        refsChanged: 0,
        structuresTouched: [],
        playersCollapsed: 0,
        canonicalPlayersKept: Array.isArray(base.players) ? base.players.length : 0,
      }
    };
  }

  const playerById = new Map((Array.isArray(base.players) ? base.players : []).filter(p => stableEntityId(p)).map(p => [stableEntityId(p), p]));
  const sessionResults = (Array.isArray(base.sessions) ? base.sessions : []).map(session => remapSessionPlayerReferences(session, plan.canonicalByDuplicateId, playerById, { invalidateDerived: true }));
  const structuresTouched = uniqStrings([].concat.apply([], sessionResults.map(item => item && item.touchedStructures ? item.touchedStructures : [])));
  const refsChanged = uniqStrings([].concat.apply([], sessionResults.map(item => item && item.touchedIds ? item.touchedIds : []))).length;
  const sessionsTouched = sessionResults.filter(item => item && item.changed).length;

  const groupIdsByCanonical = new Map();
  (Array.isArray(plan && plan.groups) ? plan.groups : []).forEach(group => {
    const canonicalId = stableEntityId(group && group.canonicalId);
    if (!canonicalId) return;
    const ids = uniqStrings([canonicalId].concat(Array.isArray(group && group.duplicateIds) ? group.duplicateIds : []));
    if (ids.length) groupIdsByCanonical.set(canonicalId, ids);
  });

  const nextPlayers = [];
  const seenCanonicalIds = new Set();
  (Array.isArray(base.players) ? base.players : []).forEach(player => {
    const pid = stableEntityId(player);
    if (!pid || seenCanonicalIds.has(pid)) return;
    if (plan.canonicalByDuplicateId.has(pid)) return;
    const groupIds = groupIdsByCanonical.get(pid) || [pid];
    const groupPlayers = groupIds.map(id => playerById.get(id)).filter(Boolean);
    const mergedPlayer = groupPlayers.length > 1 ? mergePlayerEntityGroup(player, groupPlayers) : (cloneJson(player) || player);
    nextPlayers.push(mergedPlayer);
    seenCanonicalIds.add(pid);
  });

  const nextUi = Object.assign({}, isPlainObject(base.ui) ? cloneJson(base.ui) || {} : {}, {
    forensicCanonicalConsolidation: {
      appliedAt: Date.now(),
      groups: numOrZero(plan && plan.counts && plan.counts.strongGroups),
      duplicatePlayers: numOrZero(plan && plan.counts && plan.counts.duplicatePlayers),
      playersCollapsed: Math.max(0, (Array.isArray(base.players) ? base.players.length : 0) - nextPlayers.length),
      groupsDetail: cloneJson(Array.isArray(plan && plan.groups) ? plan.groups.slice(0, 50) : []) || [],
    }
  });

  const nextStore = normalizeStoreObject(Object.assign({}, base, {
    players: nextPlayers,
    sessions: sessionResults.map(item => item && item.session ? item.session : item),
    ui: nextUi,
    updatedAt: (sessionsTouched || nextPlayers.length !== (Array.isArray(base.players) ? base.players.length : 0)) ? Date.now() : numOrZero(base.updatedAt),
  })).store;

  return {
    store: nextStore,
    plan,
    summary: {
      groups: numOrZero(plan && plan.counts && plan.counts.strongGroups),
      duplicatePlayers: numOrZero(plan && plan.counts && plan.counts.duplicatePlayers),
      sessionsTouched,
      refsChanged,
      structuresTouched,
      playersCollapsed: Math.max(0, (Array.isArray(base.players) ? base.players.length : 0) - nextPlayers.length),
      canonicalPlayersKept: nextPlayers.length,
    }
  };
}

function rebuildStoreDerivedData(baseStore){
  const priorStore = store;
  const normalized = normalizeStoreObject(baseStore).store;
  store = normalized;
  const analytics = computeAnalytics();
  const currentPlayers = Array.isArray(normalized.players) ? normalized.players : [];
  const closedSessionsOrdered = sortSessionsForAnalytics(Array.isArray(normalized.sessions) ? normalized.sessions : []);
  const historicalImpactBaseSeed = buildHistoricalImpactContextBaseSeed(closedSessionsOrdered, currentPlayers);
  const nextPlayers = getPlayers().map(p => {
    const st = analytics.byPlayer.get(p.id) || null;
    const next = Object.assign({}, p);
    next.stats = st ? {
      netTotal: st.netTotal,
      games: st.games,
      wins1: st.wins1,
      podiums: st.podiums,
      best: st.best,
      worst: st.worst,
      lastSession: st.lastSession,
      buyInsCount: st.buyInsCount,
      buyInsTotal: st.buyInsTotal,
      rebuysCount: st.rebuysCount,
      rebuysTotal: st.rebuysTotal,
      itmCount: st.itmCount,
      investedTotal: st.investedTotal,
      chipsTotal: st.chipsTotal,
      payoutsTotal: st.payoutsTotal,
      roiGlobal: st.roiGlobal,
      avgNet: st.avgNet,
      bestWinStreak: cloneJson(st.bestWinStreak) || { length: 0, start: null, end: null },
      bestItmStreak: cloneJson(st.bestItmStreak) || { length: 0, start: null, end: null },
    } : {
      netTotal: 0, games: 0, wins1: 0, podiums: 0, best: null, worst: null, lastSession: null, buyInsCount: 0, buyInsTotal: 0, rebuysCount: 0, rebuysTotal: 0, itmCount: 0, investedTotal: 0, chipsTotal: 0, payoutsTotal: 0, roiGlobal: 0, avgNet: 0, bestWinStreak: { length: 0, start: null, end: null }, bestItmStreak: { length: 0, start: null, end: null },
    };
    return next;
  });
  const nextSessions = (Array.isArray(normalized.sessions) ? normalized.sessions : []).map(session => {
    if (!session || session.status !== 'closed') return session;
    if (isHistoricalImpactSnapshotFresh(session, session.historicalImpact, { closedSessions: closedSessionsOrdered, players: currentPlayers, baseSeed: historicalImpactBaseSeed })) return session;
    const rebuiltImpact = buildSessionHistoricalImpactSnapshot(session, { closedSessions: closedSessionsOrdered, players: currentPlayers, baseSeed: historicalImpactBaseSeed });
    return Object.assign({}, session, { historicalImpact: rebuiltImpact });
  });
  const nextStore = normalizeStoreObject(Object.assign({}, normalized, {
    players: nextPlayers,
    sessions: nextSessions,
    statsGlobal: {
      updatedAt: Date.now(),
      records: cloneJson(analytics.records) || {},
      ranking: analytics.ranking.map(row => ({
        pos: row.rankPos,
        id: row.id,
        display: row.display,
        games: row.games,
        wins1: row.wins1,
        podiums: row.podiums,
        buyInsCount: row.buyInsCount,
        buyInsTotal: row.buyInsTotal,
        rebuysCount: row.rebuysCount,
        rebuysTotal: row.rebuysTotal,
        itmCount: row.itmCount,
        netTotal: row.netTotal,
        investedTotal: row.investedTotal,
        chipsTotal: row.chipsTotal,
        payoutsTotal: row.payoutsTotal,
        avgNet: row.avgNet,
        roiGlobal: row.roiGlobal,
        best: cloneJson(row.best) || null,
        worst: cloneJson(row.worst) || null,
        lastSession: cloneJson(row.lastSession) || null,
        bestWinStreak: cloneJson(row.bestWinStreak) || { length: 0, start: null, end: null },
        bestItmStreak: cloneJson(row.bestItmStreak) || { length: 0, start: null, end: null },
      })),
      byPlayer: Array.from(analytics.byPlayer.values()).map(st => ({
        id: st.id,
        display: st.display,
        games: st.games,
        wins1: st.wins1,
        podiums: st.podiums,
        buyInsCount: st.buyInsCount,
        buyInsTotal: st.buyInsTotal,
        rebuysCount: st.rebuysCount,
        rebuysTotal: st.rebuysTotal,
        itmCount: st.itmCount,
        netTotal: st.netTotal,
        investedTotal: st.investedTotal,
        chipsTotal: st.chipsTotal,
        payoutsTotal: st.payoutsTotal,
        avgNet: st.avgNet,
        roiGlobal: st.roiGlobal,
        best: cloneJson(st.best) || null,
        worst: cloneJson(st.worst) || null,
        lastSession: cloneJson(st.lastSession) || null,
        bestWinStreak: cloneJson(st.bestWinStreak) || { length: 0, start: null, end: null },
        bestItmStreak: cloneJson(st.bestItmStreak) || { length: 0, start: null, end: null },
      })),
      summaryRows: cloneJson(analytics.summaryRows) || [],
    }
  })).store;
  store = priorStore;
  return nextStore;
}

function applyStartupForensicSelfHeal(baseStore){
  const normalized = normalizeStoreObject(baseStore).store;
  const consolidated = remapStoreCanonicalPlayerReferences(normalized);
  const summary = isPlainObject(consolidated && consolidated.summary) ? consolidated.summary : {};
  const changed = [
    'groups',
    'duplicatePlayers',
    'sessionsTouched',
    'refsChanged',
    'playersCollapsed',
  ].some(key => numOrZero(summary[key]) > 0);
  if (!changed) return normalized;
  const nextStore = rebuildStoreDerivedData(consolidated.store);
  const nextUi = Object.assign({}, isPlainObject(nextStore.ui) ? cloneJson(nextStore.ui) || {} : {}, {
    startupForensicSelfHeal: {
      appliedAt: Date.now(),
      groups: numOrZero(summary.groups),
      duplicatePlayers: numOrZero(summary.duplicatePlayers),
      sessionsTouched: numOrZero(summary.sessionsTouched),
      refsChanged: numOrZero(summary.refsChanged),
      playersCollapsed: numOrZero(summary.playersCollapsed),
      structuresTouched: cloneJson(summary.structuresTouched) || [],
    }
  });
  const finalStore = normalizeStoreObject(Object.assign({}, nextStore, { ui: nextUi, updatedAt: Date.now() })).store;
  persistStore(finalStore);
  return finalStore;
}

function remapIncomingStorePlayersByCanonical(currentStore, incomingStore){
  const cur = normalizeStoreObject(currentStore).store;
  const incoming = normalizeStoreObject(incomingStore).store;
  const localPlayers = Array.isArray(cur.players) ? cur.players : [];
  const localPlayerById = new Map(localPlayers.filter(p => stableEntityId(p)).map(p => [stableEntityId(p), p]));
  const plan = buildPlayerCanonicalMergePlan(localPlayers, incoming.players);
  const canonicalMap = plan.canonicalByIncomingId;

  const remappedPlayerList = (Array.isArray(incoming.players) ? incoming.players : []).map(player => {
    const incomingId = stableEntityId(player);
    const canonicalId = canonicalMap.get(incomingId) || incomingId;
    if (!canonicalId || canonicalId === incomingId) return cloneJson(player) || player;
    const localCanonical = localPlayerById.get(canonicalId) || null;
    const next = Object.assign({}, cloneJson(player) || player, { id: canonicalId });
    next.identity = buildPlayerIdentity(Object.assign({}, localCanonical || {}, next, { id: canonicalId }));
    return next;
  });
  const remappedPlayers = [];
  const remappedPlayerById = new Map();
  remappedPlayerList.forEach(player => {
    const pid = stableEntityId(player);
    if (!pid) return;
    const existing = remappedPlayerById.get(pid) || null;
    if (!existing){
      const added = cloneJson(player) || player;
      remappedPlayers.push(added);
      remappedPlayerById.set(pid, added);
      return;
    }
    const merged = mergePlayerEntity(existing, player);
    const idx = remappedPlayers.indexOf(existing);
    if (idx >= 0) remappedPlayers[idx] = merged;
    remappedPlayerById.set(pid, merged);
  });

  const remappedSessions = (Array.isArray(incoming.sessions) ? incoming.sessions : []).map(session => remapIncomingSessionPlayers(session, canonicalMap, localPlayerById));

  const remappedStore = normalizeStoreObject(Object.assign({}, incoming, {
    players: remappedPlayers,
    sessions: remappedSessions,
  })).store;

  return {
    store: remappedStore,
    plan,
  };
}

function normalizeTimestampPair(createdRaw, updatedRaw, fallbackTs){
  const fb = numOrZero(fallbackTs) || Date.now();
  let createdAt = numOrZero(createdRaw);
  let updatedAt = numOrZero(updatedRaw);
  if (!createdAt) createdAt = updatedAt || fb;
  if (!updatedAt) updatedAt = createdAt || fb;
  if (updatedAt < createdAt) updatedAt = createdAt;
  return { createdAt, updatedAt };
}

function ymdFromTimestamp(ts){
  const d = new Date(numOrZero(ts) || Date.now());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function normalizeYmdLoose(value){
  const str = safeTrim(value);
  const m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return '';
  return `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
}

function formatDateTimeShort(ts){
  const n = numOrZero(ts);
  if (!n) return '—';
  const d = new Date(n);
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth() + 1).padStart(2,'0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function getDefaultUpdateUiState(){
  return {
    currentVersion: APP_VERSION,
    currentBuild: APP_BUILD,
    state: 'idle',
    checkedAt: 0,
    latestVersion: '',
    latestBuild: '',
    errorCode: ''
  };
}

function normalizeUpdateUiState(input){
  const base = getDefaultUpdateUiState();
  const src = isPlainObject(input) ? input : {};
  const state = safeTrim(src.state);
  const out = Object.assign({}, base, {
    state: ['idle','checking','current','available','updating','updated','unsupported','error'].includes(state) ? state : 'idle',
    checkedAt: numOrZero(src.checkedAt),
    latestVersion: safeTrim(src.latestVersion),
    latestBuild: safeTrim(src.latestBuild),
    errorCode: safeTrim(src.errorCode),
  });
  if (safeTrim(src.currentVersion) !== APP_VERSION || safeTrim(src.currentBuild) !== APP_BUILD){
    return base;
  }
  if (out.state === 'checking') out.state = 'idle';
  if (!['available','error','unsupported'].includes(out.state)) out.errorCode = '';
  if (out.state === 'available' && sameReleaseMeta(out, { version: APP_VERSION, build: APP_BUILD })) {
    out.state = 'current';
    out.errorCode = '';
  }
  if (out.state === 'updated') out.state = 'current';
  return out;
}

function loadUpdateUiState(){
  try{
    const raw = localStorage.getItem(UPDATE_UI_KEY);
    if (!raw) return getDefaultUpdateUiState();
    return normalizeUpdateUiState(JSON.parse(raw));
  }catch(e){
    return getDefaultUpdateUiState();
  }
}

function persistUpdateUiState(nextState){
  try{
    localStorage.setItem(UPDATE_UI_KEY, JSON.stringify(normalizeUpdateUiState(nextState)));
  }catch(e){}
}

function persistUpdateBootMark(meta){
  try{
    sessionStorage.setItem(UPDATE_BOOT_KEY, JSON.stringify({
      version: safeTrim(meta && meta.version),
      build: safeTrim(meta && meta.build),
      checkedAt: numOrZero(meta && meta.checkedAt) || Date.now(),
    }));
  }catch(e){}
}

function consumeUpdateBootMark(){
  try{
    const raw = sessionStorage.getItem(UPDATE_BOOT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(UPDATE_BOOT_KEY);
    const parsed = JSON.parse(raw);
    const version = safeTrim(parsed && parsed.version);
    const build = safeTrim(parsed && parsed.build);
    if (!version || !build) return null;
    if (version !== APP_VERSION || build !== APP_BUILD) return null;
    return {
      version,
      build,
      checkedAt: numOrZero(parsed && parsed.checkedAt) || Date.now(),
    };
  }catch(e){
    return null;
  }
}

function hydratePostUpdateUiState(){
  const mark = consumeUpdateBootMark();
  if (!mark) return;
  updateUiState = normalizeUpdateUiState({
    currentVersion: APP_VERSION,
    currentBuild: APP_BUILD,
    state: 'current',
    checkedAt: mark.checkedAt,
    latestVersion: mark.version,
    latestBuild: mark.build,
    errorCode: ''
  });
  persistUpdateUiState(updateUiState);
}

function buildReleaseDisplayLabel(version){
  const value = safeTrim(version);
  return value ? `v${value}` : '—';
}

function humanizeBuildLabel(build){
  const raw = safeTrim(build);
  if (!raw) return '';
  const normalized = raw
    .replace(/[_-]+/g, ' ')
    .replace(/\bstage\s*(\d+)/ig, 'etapa $1')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return '';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function sameReleaseMeta(a, b){
  return safeTrim(a && a.version) === safeTrim(b && b.version)
    && safeTrim(a && a.build) === safeTrim(b && b.build);
}

function getUpdateErrorMessage(code){
  const normalized = safeTrim(code).toUpperCase();
  if (normalized === 'SW_UNAVAILABLE' || normalized === 'SW_REG_MISSING') {
    return 'Esta instalación no permite aplicar la actualización desde este panel.';
  }
  if (normalized === 'HTTP_0' || normalized === 'HTTP_503' || normalized === 'HTTP_504' || normalized === 'ABORTERROR') {
    return 'No se pudo revisar si hay una versión nueva en este momento. Revisa conexión y vuelve a intentar.';
  }
  if (normalized === 'ACTIVATE_NOT_READY' || normalized === 'SW_WAITING_MISSING') {
    return 'La versión nueva ya apareció, pero todavía no terminó de quedar lista. Vuelve a intentarlo en unos segundos.';
  }
  if (normalized === 'SW_ACTIVATE_TIMEOUT') {
    return 'La actualización tardó demasiado y la app evitó una recarga dudosa. Intenta nuevamente.';
  }
  if (normalized === 'SW_REDUNDANT') {
    return 'La actualización cambió mientras se aplicaba. Vuelve a revisar y repite el intento.';
  }
  if (normalized === 'META_PARSE_FAIL') {
    return 'La revisión respondió, pero no devolvió datos válidos de versión.';
  }
  return 'No se pudo completar la operación en este momento. Intenta otra vez.';
}

function getUpdateUiCopy(stateObj){
  const state = safeTrim(stateObj && stateObj.state) || 'idle';
  if (state === 'checking') {
    return {
      pill: 'Revisando…',
      tone: 'loading',
      body: 'Revisando si ya existe una versión más reciente para esta instalación.',
      button: 'Revisando…'
    };
  }
  if (state === 'current') {
    return {
      pill: 'App al día',
      tone: 'success',
      body: 'Esta instalación ya está corriendo la versión más reciente disponible.',
      button: 'Buscar actualización'
    };
  }
  if (state === 'available') {
    return {
      pill: 'Nueva versión lista',
      tone: 'warn',
      body: 'Hay una versión más reciente lista para aplicarse. Este mismo botón la instala sin salir de Administración.',
      button: 'Actualizar ahora'
    };
  }
  if (state === 'updating') {
    return {
      pill: 'Aplicando actualización',
      tone: 'loading',
      body: 'Aplicando la nueva versión del PWA y preparando la recarga controlada de la app.',
      button: 'Aplicando…'
    };
  }
  if (state === 'updated') {
    return {
      pill: 'Actualización aplicada',
      tone: 'success',
      body: 'La nueva versión quedó aplicada. La app se está recargando para abrir ya con esa edición.',
      button: 'Buscar actualización'
    };
  }
  if (state === 'unsupported') {
    return {
      pill: 'Actualización no disponible',
      tone: 'error',
      body: 'Esta instalación no permite aplicar la actualización desde este panel. Aquí solo queda reintentar la revisión.',
      button: 'Buscar actualización'
    };
  }
  if (state === 'error') {
    return {
      pill: 'No se pudo completar',
      tone: 'error',
      body: getUpdateErrorMessage(stateObj && stateObj.errorCode),
      button: 'Buscar actualización'
    };
  }
  return {
    pill: 'Listo para revisar',
    tone: 'neutral',
    body: 'Consulta si esta instalación visible está al día o si ya hay una versión nueva lista para aplicarse.',
    button: 'Buscar actualización'
  };
}

function renderAdminUpdateUi(){
  const $version = document.getElementById('adminVisibleVersion');
  if (!$version) return;
  const $build = document.getElementById('adminVisibleBuild');
  const $pill = document.getElementById('adminUpdateStatusPill');
  const $copy = document.getElementById('adminUpdateStatusText');
  const $compare = document.getElementById('adminUpdateCompare');
  const $checked = document.getElementById('adminUpdateCheckedAt');
  const $btn = document.getElementById('checkUpdateBtn');
  const stateObj = normalizeUpdateUiState(updateUiState);
  const copy = getUpdateUiCopy(stateObj);
  const buildLabel = humanizeBuildLabel(APP_BUILD);

  $version.textContent = buildReleaseDisplayLabel(APP_VERSION);
  if ($build) {
    $build.textContent = buildLabel ? `Edición visible: ${buildLabel}` : '';
    $build.style.display = buildLabel ? '' : 'none';
  }

  if ($pill){
    $pill.textContent = copy.pill;
    $pill.classList.remove('is-neutral', 'is-loading', 'is-success', 'is-warn', 'is-error');
    $pill.classList.add(`is-${copy.tone}`);
  }
  if ($copy) $copy.textContent = copy.body;

  if ($compare){
    let compareText = '';
    if (stateObj.state === 'available') {
      const latestVersion = safeTrim(stateObj.latestVersion);
      const latestBuild = humanizeBuildLabel(stateObj.latestBuild);
      compareText = latestVersion
        ? `Instalada ${buildReleaseDisplayLabel(APP_VERSION)} · Disponible ${buildReleaseDisplayLabel(latestVersion)}${latestBuild ? ` · ${latestBuild}` : ''}`
        : `Instalada ${buildReleaseDisplayLabel(APP_VERSION)} · Hay una versión más reciente lista para aplicarse.`;
    } else if (stateObj.state === 'current' && stateObj.checkedAt) {
      compareText = `Instalada ${buildReleaseDisplayLabel(APP_VERSION)} · Sin cambios pendientes.`;
    } else if (stateObj.state === 'updating' || stateObj.state === 'updated') {
      const targetVersion = safeTrim(stateObj.latestVersion);
      compareText = targetVersion
        ? `Instalada ${buildReleaseDisplayLabel(APP_VERSION)} · Aplicando ${buildReleaseDisplayLabel(targetVersion)}.`
        : `Instalada ${buildReleaseDisplayLabel(APP_VERSION)} · Aplicando nueva edición.`;
    }
    $compare.textContent = compareText;
    $compare.style.display = compareText ? '' : 'none';
  }

  if ($checked){
    const checkedText = stateObj.checkedAt ? `Última revisión: ${formatDateTimeShort(stateObj.checkedAt)}` : '';
    $checked.textContent = checkedText;
    $checked.style.display = checkedText ? '' : 'none';
  }

  if ($btn){
    const busy = !!updateCheckInFlight || !!updateApplyInFlight || stateObj.state === 'checking' || stateObj.state === 'updating';
    $btn.textContent = copy.button;
    $btn.disabled = busy;
    $btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  }
}

function setUpdateUiState(patch, options){
  const opts = options || {};
  updateUiState = normalizeUpdateUiState(Object.assign({}, updateUiState, patch || {}, {
    currentVersion: APP_VERSION,
    currentBuild: APP_BUILD,
  }));
  if (opts.persist !== false) persistUpdateUiState(updateUiState);
  renderAdminUpdateUi();
}

async function getUpdateRegistration(options){
  if (!('serviceWorker' in navigator)) return null;
  const opts = options || {};
  let reg = swRegistrationRef;
  if (!reg) {
    try{
      reg = await navigator.serviceWorker.getRegistration();
    }catch(e){
      reg = null;
    }
  }
  if (!reg) return null;
  swRegistrationRef = reg;
  bindServiceWorkerLifecycle(reg);
  if (opts.refresh === true) {
    try{ await reg.update(); }catch(e){}
  }
  return reg;
}

function bindServiceWorkerLifecycle(reg){
  if (!reg || swLifecycleBound) return;
  swLifecycleBound = true;

  const markAvailableFromWorker = (worker) => {
    if (!worker) return;
    const applyAvailableState = async () => {
      if (!navigator.serviceWorker.controller) return;
      const latest = await fetchLatestReleaseMeta().catch(() => null);
      setUpdateUiState({
        state: 'available',
        checkedAt: Date.now(),
        latestVersion: safeTrim(latest && latest.version),
        latestBuild: safeTrim(latest && latest.build),
        errorCode: ''
      });
    };

    if (worker.state === 'installed') {
      applyAvailableState().catch(() => {});
      return;
    }

    worker.addEventListener('statechange', () => {
      const state = safeTrim(worker.state);
      if (state === 'installed') applyAvailableState().catch(() => {});
    });
  };

  if (reg.waiting) markAvailableFromWorker(reg.waiting);
  if (reg.installing) markAvailableFromWorker(reg.installing);

  reg.addEventListener('updatefound', () => {
    markAvailableFromWorker(reg.installing || null);
  });
}

async function getServiceWorkerUpdateHint(reg){
  const targetReg = reg || await getUpdateRegistration();
  if (!targetReg) return { available: false, supported: ('serviceWorker' in navigator), waiting: false, installingState: '' };
  const installingState = safeTrim(targetReg.installing && targetReg.installing.state);
  return {
    available: !!targetReg.waiting || installingState === 'installed' || installingState === 'activating',
    installingState,
    waiting: !!targetReg.waiting,
    supported: true,
  };
}

async function fetchLatestReleaseMeta(){
  const controller = (typeof AbortController === 'function') ? new AbortController() : null;
  const timer = controller ? setTimeout(() => {
    try{ controller.abort(); }catch(e){}
  }, 7000) : 0;
  try{
    const cacheBust = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const res = await fetch(`./app.js?update-check=${cacheBust}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
      signal: controller ? controller.signal : undefined,
    });
    if (!res || !res.ok) throw new Error(`HTTP_${res ? res.status : 0}`);
    const body = await res.text();
    const versionMatch = body.match(/const\s+APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    const buildMatch = body.match(/const\s+APP_BUILD\s*=\s*['"]([^'"]+)['"]/);
    const version = safeTrim(versionMatch && versionMatch[1]);
    const build = safeTrim(buildMatch && buildMatch[1]);
    if (!version || !build) throw new Error('META_PARSE_FAIL');
    return { version, build };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function delay(ms){
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForWaitingWorker(reg, timeoutMs){
  const limit = Math.max(800, numOrZero(timeoutMs) || 0);
  const startedAt = Date.now();
  while ((Date.now() - startedAt) < limit) {
    if (reg && reg.waiting) return reg.waiting;
    const installing = reg && reg.installing;
    const state = safeTrim(installing && installing.state);
    if (installing && state === 'installed') return reg.waiting || installing;
    await delay(250);
  }
  return reg && reg.waiting ? reg.waiting : null;
}

async function activateWaitingWorkerAndReload(worker, nextMeta){
  if (!worker) throw new Error('SW_WAITING_MISSING');

  return new Promise((resolve, reject) => {
    let done = false;
    let timeoutId = 0;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      try{ navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange); }catch(e){}
      try{ worker.removeEventListener('statechange', onStateChange); }catch(e){}
    };

    const settle = (type, error) => {
      if (done) return;
      done = true;
      cleanup();
      if (type === 'resolve') resolve();
      else reject(error instanceof Error ? error : new Error(String(error || 'UPDATE_APPLY_FAIL')));
    };

    const onControllerChange = () => {
      persistUpdateBootMark({
        version: safeTrim(nextMeta && nextMeta.version),
        build: safeTrim(nextMeta && nextMeta.build),
        checkedAt: Date.now(),
      });
      setUpdateUiState({
        state: 'updated',
        checkedAt: Date.now(),
        latestVersion: safeTrim(nextMeta && nextMeta.version),
        latestBuild: safeTrim(nextMeta && nextMeta.build),
        errorCode: ''
      }, { persist: false });
      try{ window.location.reload(); }catch(e){}
      settle('resolve');
    };

    const onStateChange = () => {
      const state = safeTrim(worker.state);
      if (state === 'redundant') settle('reject', new Error('SW_REDUNDANT'));
    };

    timeoutId = setTimeout(() => {
      settle('reject', new Error('SW_ACTIVATE_TIMEOUT'));
    }, UPDATE_ACTIVATION_TIMEOUT_MS);

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: false });
    worker.addEventListener('statechange', onStateChange);

    try{
      worker.postMessage({ type: 'POKERITO_SKIP_WAITING' });
    }catch(e){
      settle('reject', e);
    }
  });
}

async function checkForAppUpdate(){
  if (updateCheckInFlight || updateApplyInFlight) return;
  updateCheckInFlight = true;
  setUpdateUiState({ state: 'checking', errorCode: '' }, { persist: false });
  const checkedAt = Date.now();
  try{
    const reg = await getUpdateRegistration({ refresh: true });
    if (!('serviceWorker' in navigator) || !reg) {
      setUpdateUiState({
        state: 'unsupported',
        checkedAt,
        latestVersion: '',
        latestBuild: '',
        errorCode: 'SW_UNAVAILABLE'
      });
      return;
    }

    const swHint = await getServiceWorkerUpdateHint(reg);
    const latest = await fetchLatestReleaseMeta();
    const same = sameReleaseMeta(latest, { version: APP_VERSION, build: APP_BUILD });
    setUpdateUiState({
      state: (same && !swHint.available) ? 'current' : 'available',
      checkedAt,
      latestVersion: latest.version,
      latestBuild: latest.build,
      errorCode: ''
    });
    return;
  } catch (err) {
    const reg = await getUpdateRegistration();
    const swHint = await getServiceWorkerUpdateHint(reg || null);
    if (swHint && swHint.available){
      setUpdateUiState({
        state: 'available',
        checkedAt,
        latestVersion: '',
        latestBuild: '',
        errorCode: ''
      });
      return;
    }
    setUpdateUiState({
      state: reg ? 'error' : 'unsupported',
      checkedAt,
      latestVersion: '',
      latestBuild: '',
      errorCode: safeTrim(err && err.message) || (reg ? 'UPDATE_CHECK_FAIL' : 'SW_UNAVAILABLE')
    });
  } finally {
    updateCheckInFlight = false;
    renderAdminUpdateUi();
  }
}

async function applyAppUpdate(){
  if (updateCheckInFlight || updateApplyInFlight) return;
  updateApplyInFlight = true;
  setUpdateUiState({ state: 'updating', errorCode: '' }, { persist: false });
  const checkedAt = Date.now();
  try{
    const reg = await getUpdateRegistration({ refresh: true });
    if (!reg) throw new Error('SW_REG_MISSING');

    let targetWorker = reg.waiting || null;
    if (!targetWorker && reg.installing) {
      targetWorker = await waitForWaitingWorker(reg, 4000);
    }
    if (!targetWorker) {
      try{ await reg.update(); }catch(e){}
      targetWorker = await waitForWaitingWorker(reg, 4000);
    }
    if (!targetWorker) {
      const latest = await fetchLatestReleaseMeta().catch(() => null);
      const same = latest ? sameReleaseMeta(latest, { version: APP_VERSION, build: APP_BUILD }) : false;
      if (same) {
        setUpdateUiState({
          state: 'current',
          checkedAt,
          latestVersion: safeTrim(latest && latest.version),
          latestBuild: safeTrim(latest && latest.build),
          errorCode: ''
        });
        return;
      }
      throw new Error('ACTIVATE_NOT_READY');
    }

    const nextMeta = {
      version: safeTrim(updateUiState.latestVersion),
      build: safeTrim(updateUiState.latestBuild)
    };
    if (!nextMeta.version || !nextMeta.build) {
      const fetchedMeta = await fetchLatestReleaseMeta().catch(() => null);
      nextMeta.version = safeTrim(fetchedMeta && fetchedMeta.version);
      nextMeta.build = safeTrim(fetchedMeta && fetchedMeta.build);
    }

    setUpdateUiState({
      state: 'updating',
      checkedAt,
      latestVersion: nextMeta.version,
      latestBuild: nextMeta.build,
      errorCode: ''
    }, { persist: false });
    await activateWaitingWorkerAndReload(targetWorker, nextMeta);
  } catch (err) {
    const code = safeTrim(err && err.message) || 'UPDATE_APPLY_FAIL';
    setUpdateUiState({
      state: code === 'SW_REG_MISSING' ? 'unsupported' : 'error',
      checkedAt,
      errorCode: code
    });
  } finally {
    updateApplyInFlight = false;
    renderAdminUpdateUi();
  }
}

function normalizeChipEntity(chip, index, usedIds, ctx){
  const src = isPlainObject(chip) ? chip : {};
  if (!isPlainObject(chip)) ctx.changed = true;

  const fallbackTs = numOrZero(src.createdAt) || numOrZero(src.updatedAt) || ctx.now;
  let id = stableEntityId(src);
  if (!id || usedIds.has(id)){
    id = deterministicBackfillId('chip', `chip|${safeTrim(src.name).toLowerCase()}|${safeTrim(src.value)}|${safeTrim(src.color).toLowerCase()}|${fallbackTs}|${index}`, usedIds);
    ctx.changed = true;
  } else usedIds.add(id);

  const pair = normalizeTimestampPair(src.createdAt, src.updatedAt, fallbackTs);
  if (pair.createdAt !== numOrZero(src.createdAt) || pair.updatedAt !== numOrZero(src.updatedAt)) ctx.changed = true;

  const color = normHex(src.color) || '#808080';
  if (color !== normHex(src.color)) ctx.changed = true;

  const active = ('active' in src) ? !!src.active : true;
  if (!('active' in src)) ctx.changed = true;

  const value = (src.value === '') ? '' : Math.round(numOrZero(src.value));
  if (value !== src.value && !(src.value === '' && value === '')) ctx.changed = true;

  return Object.assign({}, src, {
    id,
    name: safeTrim(src.name),
    value,
    color,
    active,
    createdAt: pair.createdAt,
    updatedAt: pair.updatedAt,
  });
}

function normalizeChipList(list, ctx){
  if (!Array.isArray(list) || !list.length){
    ctx.changed = true;
    return defaultChips();
  }
  const usedIds = new Set();
  const out = list.map((chip, idx) => normalizeChipEntity(chip, idx, usedIds, ctx)).filter(Boolean);
  return out.length ? out : defaultChips();
}

function normalizePlayerEntity(player, index, usedIds, ctx){
  const src = isPlainObject(player) ? player : {};
  if (!isPlainObject(player)) ctx.changed = true;

  const fallbackTs = numOrZero(src.createdAt) || numOrZero(src.updatedAt) || ctx.now;
  let id = stableEntityId(src);
  if (!id || usedIds.has(id)){
    id = deterministicBackfillId('player', `player|${safeTrim(src.name).toLowerCase()}|${safeTrim(src.nick).toLowerCase()}|${fallbackTs}|${index}`, usedIds);
    ctx.changed = true;
  } else usedIds.add(id);

  const pair = normalizeTimestampPair(src.createdAt, src.updatedAt, fallbackTs);
  if (pair.createdAt !== numOrZero(src.createdAt) || pair.updatedAt !== numOrZero(src.updatedAt)) ctx.changed = true;

  const active = ('active' in src) ? !!src.active : true;
  if (!('active' in src)) ctx.changed = true;

  const stats = isPlainObject(src.stats) ? cloneJson(src.stats) : {};
  if (!isPlainObject(src.stats)) ctx.changed = true;

  const identity = buildPlayerIdentity(Object.assign({}, src, {
    id,
    name: safeTrim(src.name),
    nick: safeTrim(src.nick),
  }));
  const priorIdentity = isPlainObject(src.identity) ? cloneJson(src.identity) : null;
  if (canonicalJson(identity) !== canonicalJson(priorIdentity)) ctx.changed = true;

  return Object.assign({}, src, {
    id,
    name: safeTrim(src.name),
    nick: safeTrim(src.nick),
    identity,
    active,
    stats: stats || {},
    createdAt: pair.createdAt,
    updatedAt: pair.updatedAt,
  });
}

function normalizePlayerList(list, ctx){
  if (!Array.isArray(list)){
    ctx.changed = true;
    return defaultPlayers();
  }
  const usedIds = new Set();
  return list.map((player, idx) => normalizePlayerEntity(player, idx, usedIds, ctx)).filter(Boolean);
}

function normalizeSessionPlayersSnapshot(rawList, playerIds, playerMap, ctx){
  const list = Array.isArray(rawList) ? rawList : [];
  if (!Array.isArray(rawList) && playerIds.length) ctx.changed = true;

  const out = playerIds.map((pid, index) => {
    const exact = list.find(item => sameStableEntity(item, pid));
    const src = isPlainObject(exact) ? exact : (isPlainObject(list[index]) ? list[index] : {});
    const master = playerMap.get(pid) || {};
    const id = pid || stableEntityId(src);
    const name = safeTrim(src.name) || safeTrim(master.name);
    const nick = safeTrim(src.nick) || safeTrim(master.nick);
    const display = safeTrim(src.display) || nick || name || playerDisplayName(master) || 'Sin nombre';
    return Object.assign({}, src, { id, name, nick, display });
  });

  if (list.length !== out.length) ctx.changed = true;
  return out;
}

function normalizeSessionChipsSnapshot(rawList, chipMap, ctx){
  let list = Array.isArray(rawList) ? rawList : [];
  if (!Array.isArray(rawList)) ctx.changed = true;
  if (!list.length){
    ctx.changed = true;
    list = Array.from(chipMap.values()).map((chip, index) => ({
      id: chip.id,
      name: chip.name,
      color: chip.color,
      value: chip.value,
      order: (typeof chip.order === 'number' ? chip.order : index),
      style: (chip.style && typeof chip.style === 'object') ? cloneJson(chip.style) : null,
    }));
  }

  const usedIds = new Set();
  return list.map((chip, index) => {
    const src = isPlainObject(chip) ? chip : {};
    if (!isPlainObject(chip)) ctx.changed = true;
    let id = stableEntityId(src);
    if (!id || usedIds.has(id)){
      id = deterministicBackfillId('chip', `session_chip|${safeTrim(src.name).toLowerCase()}|${safeTrim(src.value)}|${safeTrim(src.color).toLowerCase()}|${index}`, usedIds);
      ctx.changed = true;
    } else usedIds.add(id);

    const master = chipMap.get(id) || {};
    const color = normHex(src.color) || normHex(master.color) || '#808080';
    return Object.assign({}, src, {
      id,
      name: safeTrim(src.name) || safeTrim(master.name),
      color,
      value: (src.value === '') ? '' : ((src.value != null && src.value !== '') ? numOrZero(src.value) : numOrZero(master.value)),
      order: (typeof src.order === 'number') ? src.order : ((typeof master.order === 'number') ? master.order : index),
      style: (src.style && typeof src.style === 'object') ? cloneJson(src.style) : ((master.style && typeof master.style === 'object') ? cloneJson(master.style) : null),
    });
  });
}

function normalizeSessionGameState(rawGame, playerIds, chipIds, ctx){
  const game = isPlainObject(rawGame) ? rawGame : {};
  if (!isPlainObject(rawGame)) ctx.changed = true;

  const rawPlayers = Array.isArray(game.players) ? game.players : [];
  if (!Array.isArray(game.players) && playerIds.length) ctx.changed = true;

  const map = new Map();
  rawPlayers.forEach(item => {
    const id = stableEntityId(item);
    if (id && !map.has(id)) map.set(id, isPlainObject(item) ? item : {});
  });

  const players = playerIds.map(pid => {
    const src = map.get(pid) || {};
    const countsSrc = (src.counts && typeof src.counts === 'object') ? src.counts : {};
    const counts = {};
    chipIds.forEach(cid => { counts[cid] = Math.max(0, Math.floor(numOrZero(countsSrc[cid]))); });
    const rebuys = (Array.isArray(src.rebuys) ? src.rebuys : []).map(v => numOrZero(v)).filter(v => v > 0);
    return Object.assign({}, src, {
      id: pid,
      buyIn: numOrZero(src.buyIn),
      rebuys,
      counts,
    });
  });

  if (rawPlayers.length !== players.length) ctx.changed = true;
  return Object.assign({}, game, { players });
}

function buildSessionLegacySeed(src, playerIds, playersSnapshot, fallbackTs){
  const snapKey = (Array.isArray(playersSnapshot) ? playersSnapshot : [])
    .map(p => `${stableEntityId(p)}|${safeTrim(p && p.name).toLowerCase()}|${safeTrim(p && p.nick).toLowerCase()}`)
    .join('~');
  const gamePlayers = (src && src.game && Array.isArray(src.game.players)) ? src.game.players : [];
  const gameKey = gamePlayers
    .map(p => `${stableEntityId(p)}|${numOrZero(p && p.buyIn)}|${(Array.isArray(p && p.rebuys) ? p.rebuys : []).map(numOrZero).join(',')}`)
    .join('~');
  return [
    'session',
    normalizeYmdLoose(src && src.date) || '',
    numOrZero(src && src.createdAt) || '',
    numOrZero(src && src.closedAt) || '',
    numOrZero(src && src.updatedAt) || '',
    playerIds.join('|'),
    snapKey,
    gameKey,
    numOrZero(fallbackTs) || '',
  ].join('::');
}

function normalizeSessionEntity(session, index, refs, usedIds, ctx){
  const src = isPlainObject(session) ? session : {};
  if (!isPlainObject(session)) ctx.changed = true;

  const fallbackTs = numOrZero(src.createdAt) || numOrZero(src.updatedAt) || numOrZero(src.closedAt) || ctx.now;

  const candidatePlayerIds = uniqStrings([
    ...(Array.isArray(src.playerIds) ? src.playerIds.map(stableEntityId) : []),
    ...(Array.isArray(src.playersSnapshot) ? src.playersSnapshot.map(stableEntityId) : []),
    ...((src.game && Array.isArray(src.game.players)) ? src.game.players.map(stableEntityId) : []),
  ]);
  if (!Array.isArray(src.playerIds)) ctx.changed = true;

  let playersSnapshot = normalizeSessionPlayersSnapshot(src.playersSnapshot, candidatePlayerIds, refs.playerMap, ctx);
  const playerIds = uniqStrings(playersSnapshot.map(p => stableEntityId(p)).filter(Boolean));
  if (playerIds.join('|') !== candidatePlayerIds.join('|')) ctx.changed = true;
  playersSnapshot = normalizeSessionPlayersSnapshot(playersSnapshot, playerIds, refs.playerMap, ctx);

  const chipsSnapshot = normalizeSessionChipsSnapshot(src.chipsSnapshot, refs.chipMap, ctx);
  const chipIds = uniqStrings(chipsSnapshot.map(c => stableEntityId(c)).filter(Boolean));
  const game = normalizeSessionGameState(src.game, playerIds, chipIds, ctx);

  let id = stableEntityId(src);
  if (!id || usedIds.has(id)){
    id = deterministicBackfillId('sess', `${buildSessionLegacySeed(src, playerIds, playersSnapshot, fallbackTs)}|${index}`, usedIds);
    ctx.changed = true;
  } else usedIds.add(id);

  const pair = normalizeTimestampPair(src.createdAt, src.updatedAt, fallbackTs);
  if (pair.createdAt !== numOrZero(src.createdAt) || pair.updatedAt !== numOrZero(src.updatedAt)) ctx.changed = true;

  const status = (src.status === 'closed') ? 'closed' : 'draft';
  if (status !== safeTrim(src.status)) ctx.changed = true;

  const date = normalizeYmdLoose(src.date) || ymdFromTimestamp(pair.createdAt || fallbackTs);
  if (date !== safeTrim(src.date)) ctx.changed = true;

  let closedAt = numOrZero(src.closedAt);
  if (status === 'closed' && !closedAt){
    closedAt = numOrZero(src.updatedAt) || pair.updatedAt || fallbackTs;
    ctx.changed = true;
  }
  if (status !== 'closed' && closedAt && closedAt < pair.createdAt) {
    closedAt = pair.createdAt;
    ctx.changed = true;
  }

  return Object.assign({}, src, {
    id,
    status,
    date,
    createdAt: pair.createdAt,
    updatedAt: pair.updatedAt,
    closedAt: closedAt || undefined,
    playerIds,
    playersSnapshot,
    chipsSnapshot,
    game,
  });
}

function normalizeSessionList(list, refs, ctx){
  if (!Array.isArray(list)){
    ctx.changed = true;
    return defaultSessions();
  }
  const usedIds = new Set();
  return list.map((session, idx) => normalizeSessionEntity(session, idx, refs, usedIds, ctx)).filter(Boolean);
}

function normalizePdfSeqNext(rawNext, sessions, ctx){
  let next = Number.isFinite(rawNext) ? Math.floor(rawNext) : 1;
  if (!Number.isFinite(rawNext) || rawNext < 1) ctx.changed = true;
  let maxSeq = 0;
  (Array.isArray(sessions) ? sessions : []).forEach(s => {
    const n = Number.isFinite(s && s.pdfSeq) ? Math.floor(s.pdfSeq) : 0;
    if (n > maxSeq) maxSeq = n;
  });
  if (next <= maxSeq){
    next = maxSeq + 1;
    ctx.changed = true;
  }
  return next;
}

function normalizeStoreObject(input){
  const src = isPlainObject(input) ? input : {};
  const ctx = { changed: !isPlainObject(input), now: Date.now() };

  const chips = normalizeChipList(src.chips, ctx);
  const players = normalizePlayerList(src.players, ctx);
  const identityDiagnostics = buildPlayerIdentityDiagnostics(players);
  const playerMap = new Map(players.filter(p => stableEntityId(p)).map(p => [stableEntityId(p), p]));
  const chipMap = new Map(chips.filter(c => stableEntityId(c)).map(c => [stableEntityId(c), c]));
  const sessions = normalizeSessionList(src.sessions, { playerMap, chipMap }, ctx);

  let draftSessionId = firstNonEmpty(src.draftSessionId);
  if (draftSessionId){
    const ds = sessions.find(x => sameStableEntity(x, draftSessionId)) || null;
    if (!ds || ds.status !== 'draft'){
      draftSessionId = '';
      ctx.changed = true;
    }
  }

  const ui = isPlainObject(src.ui) ? (cloneJson(src.ui) || {}) : {};
  if (!isPlainObject(src.ui)) ctx.changed = true;
  if (!isPlainObject(ui.juego)){
    ui.juego = {};
    ctx.changed = true;
  }
  if (canonicalJson(ui.identityDiagnostics || null) !== canonicalJson(identityDiagnostics || null)){
    ui.identityDiagnostics = identityDiagnostics;
    ctx.changed = true;
  }

  const pair = normalizeTimestampPair(src.createdAt, src.updatedAt, ctx.now);
  if (pair.createdAt !== numOrZero(src.createdAt) || pair.updatedAt !== numOrZero(src.updatedAt)) ctx.changed = true;

  const out = Object.assign({}, src, {
    v: STORE_VERSION,
    chips,
    players,
    sessions,
    pdfSeqNext: normalizePdfSeqNext(src.pdfSeqNext, sessions, ctx),
    draftSessionId,
    ui,
    createdAt: pair.createdAt,
    updatedAt: pair.updatedAt,
  });

  return { store: out, changed: ctx.changed || src.v !== STORE_VERSION };
}

function loadStore(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return initStore();
    const obj = JSON.parse(raw);
    if (!isPlainObject(obj)) return initStore();
    const normalized = normalizeStoreObject(obj);
    if (normalized.changed) persistStore(normalized.store);
    return normalized.store;
  }catch(e){
    return initStore();
  }
}

function initStore(){
  const now = Date.now();
  const obj = {
    v: STORE_VERSION,
    chips: defaultChips(),
    players: defaultPlayers(),
    sessions: defaultSessions(),
    pdfSeqNext: 1,
    draftSessionId: '',
    ui: { juego: {} },
    createdAt: now,
    updatedAt: now
  };
  persistStore(obj);
  return obj;
}

function persistStore(obj){
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(obj)); }catch(e){}
}

function saveStore(){
  const normalized = normalizeStoreObject(Object.assign({}, store, { updatedAt: Date.now() }));
  store = normalized.store;
  persistStore(store);
}

function buildPortableSourceStore(baseStore){
  const normalized = normalizeStoreObject(baseStore || store).store;
  return {
    store: {
      v: STORE_VERSION,
      chips: cloneJson(normalized.chips) || [],
      players: cloneJson(normalized.players) || [],
      sessions: cloneJson(normalized.sessions) || [],
      draftSessionId: firstNonEmpty(normalized.draftSessionId),
      pdfSeqNext: normalizePdfSeqNext(normalized.pdfSeqNext, normalized.sessions, { changed: false }),
      createdAt: numOrZero(normalized.createdAt) || Date.now(),
      updatedAt: numOrZero(normalized.updatedAt) || Date.now(),
    }
  };
}

function buildPortableSettingsData(){
  return {
    themePref,
  };
}

function buildPortableBackupPayload(baseStore, baseThemePref, extraMeta){
  const normalized = normalizeStoreObject(baseStore || store).store;
  const settingsTheme = THEME_VALUES.has(baseThemePref) ? baseThemePref : themePref;
  return {
    app: PORTABLE_APP,
    schemaVersion: PORTABLE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    version: APP_VERSION,
    build: APP_BUILD,
    meta: Object.assign({
      format: 'portable-backup',
      authority: {
        source: 'authoritative',
        derived: 'excluded-from-export',
      },
      reconciliation: {
        mergeStrategy: 'canonical-player-aware-reconciliation-with-full-rebuild',
        entityKeys: {
          chips: 'id',
          players: 'id+canonical-identity',
          sessions: 'id',
        },
        playerIdentity: {
          mode: 'canonical-player-identity-v1',
          strongMatch: 'exact-normalized-name+nick',
          doubtfulMatch: 'single-field-or-alias-overlap',
        },
      },
      counts: {
        chips: Array.isArray(normalized.chips) ? normalized.chips.length : 0,
        players: Array.isArray(normalized.players) ? normalized.players.length : 0,
        sessions: Array.isArray(normalized.sessions) ? normalized.sessions.length : 0,
      },
    }, isPlainObject(extraMeta) ? extraMeta : {}),
    data: {
      source: buildPortableSourceStore(normalized),
      settings: {
        themePref: settingsTheme,
      },
    }
  };
}

function hasOwn(obj, key){
  return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
}

function validatePortableSourceShape(rawStore){
  if (!isPlainObject(rawStore)) return { ok: false, message: 'La sección fuente del respaldo no es un objeto válido.' };
  if (!hasOwn(rawStore, 'chips') || !Array.isArray(rawStore.chips)) return { ok: false, message: 'El respaldo está incompleto: falta chips[] en la fuente.' };
  if (!hasOwn(rawStore, 'players') || !Array.isArray(rawStore.players)) return { ok: false, message: 'El respaldo está incompleto: falta players[] en la fuente.' };
  if (!hasOwn(rawStore, 'sessions') || !Array.isArray(rawStore.sessions)) return { ok: false, message: 'El respaldo está incompleto: falta sessions[] en la fuente.' };
  return { ok: true };
}

function parsePortableBackupPayload(obj){
  if (!isPlainObject(obj)) return null;

  if (obj.schemaVersion === 1 && isPlainObject(obj.data) && isPlainObject(obj.data.store)){
    return {
      store: normalizeStoreObject(obj.data.store).store,
      themePref: (typeof obj.data.themePref === 'string') ? obj.data.themePref : null,
      schemaVersion: 1,
    };
  }

  if (safeTrim(obj.app).toLowerCase() !== PORTABLE_APP.toLowerCase()) return null;
  if (!Number.isFinite(obj.schemaVersion) || obj.schemaVersion < PORTABLE_SCHEMA_VERSION || obj.schemaVersion > PORTABLE_SCHEMA_VERSION) return null;
  if (!isPlainObject(obj.data) || !isPlainObject(obj.data.source)) return null;

  const sourceStore = isPlainObject(obj.data.source.store) ? obj.data.source.store : obj.data.source;
  const settings = isPlainObject(obj.data.settings) ? obj.data.settings : {};
  const derived = isPlainObject(obj.data.derived) ? obj.data.derived : {};

  return {
    store: normalizeStoreObject(sourceStore).store,
    themePref: (typeof settings.themePref === 'string') ? settings.themePref : ((typeof derived.themePref === 'string') ? derived.themePref : null),
    schemaVersion: obj.schemaVersion,
  };
}


function inspectPortableBackupPayload(obj){
  if (!isPlainObject(obj)) return { ok: false, message: 'El archivo no contiene un objeto JSON válido.' };

  const schemaVersion = Number.isFinite(obj.schemaVersion) ? Math.floor(obj.schemaVersion) : null;
  if (schemaVersion === 1){
    if (!isPlainObject(obj.data) || !isPlainObject(obj.data.store)) return { ok: false, message: 'Falta la estructura mínima del respaldo legado.' };
    const legacyShape = validatePortableSourceShape(obj.data.store);
    if (!legacyShape.ok) return legacyShape;
    const parsed = parsePortableBackupPayload(obj);
    if (!parsed || !parsed.store) return { ok: false, message: 'No se pudo normalizar el respaldo legado.' };
    return { ok: true, parsed };
  }

  if (safeTrim(obj.app).toLowerCase() !== PORTABLE_APP.toLowerCase()){
    return { ok: false, message: 'El archivo no pertenece a Pokerito.' };
  }

  if (!Number.isFinite(schemaVersion)){
    return { ok: false, message: 'schemaVersion ausente o inválido.' };
  }

  if (schemaVersion < PORTABLE_SCHEMA_VERSION){
    return { ok: false, message: `schemaVersion ${schemaVersion} ya no es compatible.` };
  }

  if (schemaVersion > PORTABLE_SCHEMA_VERSION){
    return { ok: false, message: `schemaVersion ${schemaVersion} todavía no es manejable en esta versión.` };
  }

  if (!isPlainObject(obj.data) || !isPlainObject(obj.data.source)){
    return { ok: false, message: 'Falta la estructura mínima esperada (data/source).' };
  }

  const rawSourceStore = isPlainObject(obj.data.source.store) ? obj.data.source.store : obj.data.source;
  const shape = validatePortableSourceShape(rawSourceStore);
  if (!shape.ok) return shape;

  const parsed = parsePortableBackupPayload(obj);
  if (!parsed || !parsed.store) return { ok: false, message: 'La estructura del respaldo no se pudo interpretar.' };
  return { ok: true, parsed };
}

function summarizeStoreCounts(baseStore){
  const normalized = normalizeStoreObject(baseStore).store;
  return {
    chips: Array.isArray(normalized.chips) ? normalized.chips.length : 0,
    players: Array.isArray(normalized.players) ? normalized.players.length : 0,
    sessions: Array.isArray(normalized.sessions) ? normalized.sessions.length : 0,
  };
}

function readImportSafetyBackupMeta(){
  try{
    const raw = localStorage.getItem(IMPORT_SAFETY_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    const counts = isPlainObject(parsed.counts) ? parsed.counts : summarizeStoreCounts(parsed.store);
    return {
      createdAt: numOrZero(parsed.createdAt),
      counts: {
        chips: numOrZero(counts && counts.chips),
        players: numOrZero(counts && counts.players),
        sessions: numOrZero(counts && counts.sessions),
      },
      fileName: safeTrim(parsed.fileName),
    };
  }catch(e){
    return null;
  }
}

function persistImportSafetyBackupSnapshot(baseStore, fileMeta){
  try{
    const createdAt = Date.now();
    const normalized = normalizeStoreObject(baseStore || store).store;
    const counts = summarizeStoreCounts(normalized);
    const payload = {
      createdAt,
      fileName: safeTrim(fileMeta && fileMeta.name),
      counts,
      store: buildPortableSourceStore(normalized).store,
    };
    localStorage.setItem(IMPORT_SAFETY_BACKUP_KEY, JSON.stringify(payload));
    return { ok: true, createdAt, counts, fileName: payload.fileName };
  }catch(e){
    return { ok: false, createdAt: 0, counts: summarizeStoreCounts(baseStore || store), fileName: safeTrim(fileMeta && fileMeta.name), error: safeTrim(e && e.message) };
  }
}

function importSummaryHasChanges(summary){
  const s = isPlainObject(summary) ? summary : {};
  return [
    'chipsAdded',
    'chipsMerged',
    'playersAdded',
    'playersMerged',
    'sessionsAdded',
    'sessionsUpdated',
    'duplicateSessionsCollapsed',
    'sourceCanonicalReferenceGroups',
    'sourceDuplicatePlayersRemapped',
    'sourceSessionsRemapped',
    'sourcePlayerRefsRemapped',
    'sourcePlayerCardsConsolidated',
  ].some((key) => numOrZero(s[key]) > 0);
}

function minPositiveTs(){
  const vals = Array.from(arguments).map(numOrZero).filter(v => Number.isFinite(v) && v > 0);
  return vals.length ? Math.min.apply(null, vals) : 0;
}

function maxTs(){
  const vals = Array.from(arguments).map(numOrZero).filter(v => Number.isFinite(v) && v > 0);
  return vals.length ? Math.max.apply(null, vals) : 0;
}

function deepSortJson(value){
  if (Array.isArray(value)) return value.map(deepSortJson);
  if (!isPlainObject(value)) return value;
  const out = {};
  Object.keys(value).sort().forEach(key => { out[key] = deepSortJson(value[key]); });
  return out;
}

function canonicalJson(value){
  return JSON.stringify(deepSortJson(value));
}

function preferString(localValue, incomingValue, preferIncoming){
  const localText = safeTrim(localValue);
  const incomingText = safeTrim(incomingValue);
  if (!localText && incomingText) return incomingText;
  if (localText && !incomingText) return localText;
  if (!localText && !incomingText) return '';
  return preferIncoming ? incomingText : localText;
}

function preferBool(localValue, incomingValue, preferIncoming){
  if (typeof localValue !== 'boolean' && typeof incomingValue === 'boolean') return incomingValue;
  if (typeof localValue === 'boolean' && typeof incomingValue !== 'boolean') return localValue;
  if (typeof localValue !== 'boolean' && typeof incomingValue !== 'boolean') return !!localValue;
  return preferIncoming ? !!incomingValue : !!localValue;
}

function preferNumber(localValue, incomingValue, preferIncoming, fallback){
  const hasLocal = Number.isFinite(localValue);
  const hasIncoming = Number.isFinite(incomingValue);
  if (!hasLocal && hasIncoming) return incomingValue;
  if (hasLocal && !hasIncoming) return localValue;
  if (!hasLocal && !hasIncoming) return fallback;
  return preferIncoming ? incomingValue : localValue;
}

function mergeChipEntity(localChip, incomingChip){
  const local = isPlainObject(localChip) ? localChip : {};
  const incoming = isPlainObject(incomingChip) ? incomingChip : {};
  const preferIncoming = numOrZero(incoming.updatedAt) > numOrZero(local.updatedAt);
  return {
    id: stableEntityId(local) || stableEntityId(incoming),
    name: preferString(local.name, incoming.name, preferIncoming),
    value: preferNumber(numOrZero(local.value), numOrZero(incoming.value), preferIncoming, 0),
    color: preferString(local.color, incoming.color, preferIncoming) || '#808080',
    active: preferBool(local.active, incoming.active, preferIncoming),
    order: preferNumber(local.order, incoming.order, preferIncoming, undefined),
    style: cloneJson(preferIncoming ? (incoming.style || local.style || null) : (local.style || incoming.style || null)),
    createdAt: minPositiveTs(local.createdAt, incoming.createdAt) || Date.now(),
    updatedAt: maxTs(local.updatedAt, incoming.updatedAt, local.createdAt, incoming.createdAt) || Date.now(),
  };
}

function mergePlayerEntity(localPlayer, incomingPlayer){
  const local = isPlainObject(localPlayer) ? localPlayer : {};
  const incoming = isPlainObject(incomingPlayer) ? incomingPlayer : {};
  const preferIncoming = numOrZero(incoming.updatedAt) > numOrZero(local.updatedAt);
  const merged = {
    id: stableEntityId(local) || stableEntityId(incoming),
    name: preferString(local.name, incoming.name, preferIncoming),
    nick: preferString(local.nick, incoming.nick, preferIncoming),
    active: preferBool(local.active, incoming.active, preferIncoming),
    stats: cloneJson(local.stats || incoming.stats || {}) || {},
    createdAt: minPositiveTs(local.createdAt, incoming.createdAt) || Date.now(),
    updatedAt: maxTs(local.updatedAt, incoming.updatedAt, local.createdAt, incoming.createdAt) || Date.now(),
  };
  merged.identity = buildPlayerIdentity(merged);
  return merged;
}

function mergePlayerEntityGroup(canonicalPlayer, groupPlayers){
  const canonical = isPlainObject(canonicalPlayer) ? canonicalPlayer : {};
  const rows = (Array.isArray(groupPlayers) ? groupPlayers : []).filter(Boolean);
  let merged = cloneJson(canonical) || canonical;
  rows.forEach(player => {
    merged = mergePlayerEntity(merged, player);
  });
  merged.id = stableEntityId(canonical) || stableEntityId(merged);
  merged.createdAt = minPositiveTs.apply(null, rows.map(player => minPositiveTs(player && player.createdAt, player && player.updatedAt)).concat([merged.createdAt])) || Date.now();
  merged.updatedAt = maxTs.apply(null, rows.map(player => maxTs(player && player.updatedAt, player && player.createdAt)).concat([merged.updatedAt, merged.createdAt])) || Date.now();
  merged.identity = buildPlayerIdentity(merged);
  return merged;
}

function sessionMergeComparable(session){
  const s = isPlainObject(session) ? session : {};
  const playerIds = uniqStrings(Array.isArray(s.playerIds) ? s.playerIds.map(stableEntityId) : []).slice().sort();
  const chips = (Array.isArray(s.chipsSnapshot) ? s.chipsSnapshot : []).map((chip) => ({
    id: stableEntityId(chip),
    value: numOrZero(chip && chip.value),
    color: safeTrim(chip && chip.color),
    name: safeTrim(chip && chip.name),
  })).sort((a,b) => String(a.id).localeCompare(String(b.id), 'es', { sensitivity: 'base' }));
  const gamePlayers = (s.game && Array.isArray(s.game.players) ? s.game.players : []).map((player) => ({
    id: stableEntityId(player),
    buyIn: numOrZero(player && player.buyIn),
    rebuys: (Array.isArray(player && player.rebuys) ? player.rebuys : []).map(numOrZero),
    counts: deepSortJson(isPlainObject(player && player.counts) ? player.counts : {}),
  })).sort((a,b) => String(a.id).localeCompare(String(b.id), 'es', { sensitivity: 'base' }));
  return {
    date: normalizeYmdLoose(s.date) || '',
    status: safeTrim(s.status) === 'closed' ? 'closed' : 'draft',
    createdAt: numOrZero(s.createdAt),
    closedAt: numOrZero(s.closedAt),
    playerIds,
    chips,
    gamePlayers,
  };
}

function sessionMergeSignature(session){
  return canonicalJson(sessionMergeComparable(session));
}

function buildImportSummaryText(summary, opts){
  const options = isPlainObject(opts) ? opts : {};
  const noChanges = !!options.noChanges;
  const attemptedApply = !!options.attemptedApply;
  const safetyBackup = isPlainObject(options.safetyBackup) ? options.safetyBackup : null;
  const fileMeta = isPlainObject(options.fileMeta) ? options.fileMeta : null;
  const errorsRejected = numOrZero(options.errorsRejected);
  const themeApplied = !!options.themeApplied;
  const lines = [
    noChanges ? 'No se encontraron novedades para aplicar.' : (attemptedApply ? 'Importación completada.' : 'Vista previa preparada.'),
  ];
  if (fileMeta && safeTrim(fileMeta.name)) lines.push('', `Archivo: ${safeTrim(fileMeta.name)}`);
  lines.push(
    '',
    `Jugadores nuevos reales: ${numOrZero(summary && summary.playersAdded)}`,
    `Jugadores reconocidos como ya existentes: ${numOrZero(summary && summary.playersRecognizedExisting)}`,
    `Reconciliados con canónico local (ID distinto): ${numOrZero(summary && summary.playersReconciledCanonical)}`,
    `Coincidencias dudosas no auto-fusionadas: ${numOrZero(summary && summary.playersDoubtfulDeferred)}`,
    `Jugadores fusionados en maestro local: ${numOrZero(summary && summary.playersMerged)}`,
    `Sesiones agregadas: ${numOrZero(summary && summary.sessionsAdded)}`,
    `Sesiones actualizadas: ${numOrZero(summary && summary.sessionsUpdated)}`,
    `Sesiones conservadas localmente: ${numOrZero(summary && summary.sessionsKeptLocal)}`,
    `Duplicados omitidos: ${numOrZero(summary && summary.duplicatesSkipped)}`,
    `Colisiones reconciliadas: ${numOrZero(summary && summary.conflictsResolved)}`,
    `Duplicados históricos colapsados: ${numOrZero(summary && summary.duplicateSessionsCollapsed)}`,
    `Grupos históricos remapeados al canónico: ${numOrZero(summary && summary.sourceCanonicalReferenceGroups)}`,
    `Sesiones históricas remapeadas: ${numOrZero(summary && summary.sourceSessionsRemapped)}`,
    `Referencias de jugador corregidas en fuente: ${numOrZero(summary && summary.sourcePlayerRefsRemapped)}`,
    `Fichas duplicadas consolidadas en Jugadores: ${numOrZero(summary && summary.sourcePlayerCardsConsolidated)}`,
  );
  if (numOrZero(summary && summary.chipsAdded) > 0 || numOrZero(summary && summary.chipsMerged) > 0){
    lines.push('', `Fichas agregadas: ${numOrZero(summary && summary.chipsAdded)}`, `Fichas fusionadas: ${numOrZero(summary && summary.chipsMerged)}`);
  }
  if (numOrZero(summary && summary.identityStrongCandidates) > 0 || numOrZero(summary && summary.identityDoubtfulCandidates) > 0){
    lines.push(
      '',
      `Coincidencias canónicas fuertes detectadas: ${numOrZero(summary && summary.identityStrongCandidates)}`,
      `Coincidencias canónicas dudosas detectadas: ${numOrZero(summary && summary.identityDoubtfulCandidates)}`,
    );
  }
  if (attemptedApply && safetyBackup && safetyBackup.ok && numOrZero(safetyBackup.createdAt) > 0){
    lines.push('', `Respaldo local previo: ${formatDateTimeShort(safetyBackup.createdAt)} · ${numOrZero(safetyBackup.counts && safetyBackup.counts.sessions)} sesiones · ${numOrZero(safetyBackup.counts && safetyBackup.counts.players)} jugadores · ${numOrZero(safetyBackup.counts && safetyBackup.counts.chips)} fichas`);
  }
  if (attemptedApply && themeApplied){
    lines.push('', 'También se aplicó la preferencia de tema incluida en el respaldo.');
  }
  if (errorsRejected > 0){
    lines.push('', `Registros descartados por error: ${errorsRejected}`);
  }
  lines.push('', 'Regla final: si el jugador importado ya existe por ID se fusiona directo; si llega con ID distinto pero coincide fuerte por nombre+nick normalizados se reconcilia con el canónico local; si la coincidencia es dudosa, no se auto-fusiona.');
  lines.push('Las sesiones siguen la misma regla: misma sesión + mismo contenido = duplicado; misma sesión + contenido distinto = se resuelve por updatedAt, sin degradar una cerrada a draft, y luego se recalcula todo desde sesiones cerradas reconciliadas.');
  return lines.join('\n');
}

function buildImportPreflightText(parsed, summary, opts){
  const normalized = normalizeStoreObject(parsed && parsed.store).store;
  const preview = isPlainObject(summary) ? summary : {};
  const options = isPlainObject(opts) ? opts : {};
  const fileMeta = isPlainObject(options.fileMeta) ? options.fileMeta : null;
  const chipsN = Array.isArray(normalized.chips) ? normalized.chips.length : 0;
  const playersN = Array.isArray(normalized.players) ? normalized.players.length : 0;
  const sessionsN = Array.isArray(normalized.sessions) ? normalized.sessions.length : 0;
  const closedN = Array.isArray(normalized.sessions) ? normalized.sessions.filter(s => s && s.status === 'closed').length : 0;
  const lines = ['Archivo validado.'];
  if (fileMeta && safeTrim(fileMeta.name)) lines.push('', `Archivo: ${safeTrim(fileMeta.name)}`);
  lines.push(
    '',
    `Fichas en archivo: ${chipsN}`,
    `Jugadores en archivo: ${playersN}`,
    `Sesiones en archivo: ${sessionsN}`,
    `Sesiones cerradas: ${closedN}`,
    '',
    `Jugadores nuevos reales a crear: ${numOrZero(preview.playersAdded)}`,
    `Jugadores importados reconocidos como ya existentes: ${numOrZero(preview.playersRecognizedExisting)}`,
    `Reconciliaciones fuertes con canónico local por identidad: ${numOrZero(preview.playersReconciledCanonical)}`,
    `Coincidencias dudosas que NO se auto-fusionarán: ${numOrZero(preview.playersDoubtfulDeferred)}`,
    `Sesiones nuevas a insertar: ${numOrZero(preview.sessionsAdded)}`,
    `Sesiones existentes a actualizar: ${numOrZero(preview.sessionsUpdated)}`,
    `Duplicados de sesión a omitir: ${numOrZero(preview.duplicatesSkipped)}`,
    `Grupos históricos locales remapeados al canónico: ${numOrZero(preview.sourceCanonicalReferenceGroups)}`,
    `Sesiones históricas/locales tocadas por remapeo: ${numOrZero(preview.sourceSessionsRemapped)}`,
    `Fichas duplicadas locales a consolidar en Jugadores: ${numOrZero(preview.sourcePlayerCardsConsolidated)}`,
    '',
    'Decisión del merge: mismo ID = jugador existente; distinto ID + match fuerte nombre+nick normalizados = reconciliar con el canónico local; match dudoso = no fusionar automático.',
    'Luego se mantiene el merge no destructivo, se remapean referencias históricas fuertes al canónico, se colapsan fichas duplicadas seguras y se recalculan ranking, récords y estadísticas desde datos fuente.',
  );
  if (numOrZero(preview.identityStrongCandidates) > 0 || numOrZero(preview.identityDoubtfulCandidates) > 0){
    lines.push(
      '',
      `Diagnóstico de identidad local · fuertes: ${numOrZero(preview.identityStrongCandidates)} · dudosas: ${numOrZero(preview.identityDoubtfulCandidates)}.`,
      'Las coincidencias fuertes seguras sí se consolidan forensemente en esta importación; las dudosas siguen sin auto-fusionarse.',
    );
  }
  if (options.themeWillChange) lines.push('La preferencia de tema del respaldo también cambiará en este dispositivo.');
  return lines.join('\n');
}

function sessionHasMeaningfulActivity(session){
  const s = isPlainObject(session) ? session : {};
  const players = (s.game && Array.isArray(s.game.players)) ? s.game.players : [];
  let activity = 0;
  players.forEach(st => {
    if (numOrZero(st && st.buyIn) > 0) activity += 1;
    if (Array.isArray(st && st.rebuys) && st.rebuys.some(v => numOrZero(v) > 0)) activity += 1;
    const counts = isPlainObject(st && st.counts) ? st.counts : {};
    if (Object.values(counts).some(v => numOrZero(v) > 0)) activity += 1;
  });
  return activity > 0;
}

function sessionCompletenessScore(session){
  const s = isPlainObject(session) ? session : {};
  const playersSnapshot = Array.isArray(s.playersSnapshot) ? s.playersSnapshot : [];
  const chipsSnapshot = Array.isArray(s.chipsSnapshot) ? s.chipsSnapshot : [];
  const gamePlayers = (s.game && Array.isArray(s.game.players)) ? s.game.players : [];
  let score = 0;
  if (safeTrim(s.status) === 'closed') score += 80;
  if (numOrZero(s.closedAt) > 0) score += 20;
  if (numOrZero(s.updatedAt) > 0) score += 10;
  if (numOrZero(s.createdAt) > 0) score += 5;
  score += Math.min(playersSnapshot.length, 12);
  score += Math.min(chipsSnapshot.length, 8);
  if (gamePlayers.length === playersSnapshot.length && playersSnapshot.length > 0) score += 10;
  if (gamePlayers.length > 0) score += Math.min(gamePlayers.length, 12);
  if (sessionHasMeaningfulActivity(s)) score += 30;
  return score;
}

function sessionRevisionTs(session){
  const s = isPlainObject(session) ? session : {};
  return maxTs(s.updatedAt, s.closedAt, s.createdAt);
}

function buildResolvedSession(localSession, incomingSession, preferIncoming){
  const primary = cloneJson(preferIncoming ? incomingSession : localSession) || {};
  const secondary = cloneJson(preferIncoming ? localSession : incomingSession) || {};
  const resolved = Object.assign({}, primary);
  const resolvedStatus = safeTrim(primary.status) === 'closed' ? 'closed' : 'draft';

  resolved.id = stableEntityId(localSession) || stableEntityId(incomingSession) || stableEntityId(primary) || stableEntityId(secondary);
  resolved.status = resolvedStatus;
  resolved.date = normalizeYmdLoose(primary.date || secondary.date) || '';
  resolved.createdAt = minPositiveTs(primary.createdAt, secondary.createdAt) || sessionRevisionTs(primary) || sessionRevisionTs(secondary) || Date.now();
  resolved.updatedAt = numOrZero(primary.updatedAt) || numOrZero(primary.closedAt) || numOrZero(primary.createdAt) || Date.now();

  if (!Array.isArray(resolved.playersSnapshot) || !resolved.playersSnapshot.length){
    resolved.playersSnapshot = cloneJson(Array.isArray(secondary.playersSnapshot) ? secondary.playersSnapshot : []) || [];
  }
  if (!Array.isArray(resolved.playerIds) || !resolved.playerIds.length){
    resolved.playerIds = uniqStrings((Array.isArray(resolved.playersSnapshot) ? resolved.playersSnapshot : []).map(stableEntityId));
  }
  if (!Array.isArray(resolved.chipsSnapshot) || !resolved.chipsSnapshot.length){
    resolved.chipsSnapshot = cloneJson(Array.isArray(secondary.chipsSnapshot) ? secondary.chipsSnapshot : []) || [];
  }
  if (!isPlainObject(resolved.game) || !Array.isArray(resolved.game.players) || !resolved.game.players.length){
    resolved.game = cloneJson(isPlainObject(secondary.game) ? secondary.game : { players: [] }) || { players: [] };
  }

  const localPdfSeq = Number.isFinite(localSession && localSession.pdfSeq) ? Math.floor(localSession.pdfSeq) : 0;
  const incomingPdfSeq = Number.isFinite(incomingSession && incomingSession.pdfSeq) ? Math.floor(incomingSession.pdfSeq) : 0;
  if (localPdfSeq >= 1) resolved.pdfSeq = localPdfSeq;
  else if (incomingPdfSeq >= 1) resolved.pdfSeq = incomingPdfSeq;

  if (resolvedStatus === 'closed') resolved.closedAt = maxTs(primary.closedAt, secondary.closedAt, primary.updatedAt, primary.createdAt) || undefined;
  else delete resolved.closedAt;

  return resolved;
}

function resolveSessionConflict(localSession, incomingSession){
  const local = isPlainObject(localSession) ? localSession : {};
  const incoming = isPlainObject(incomingSession) ? incomingSession : {};
  const localStatus = safeTrim(local.status) === 'closed' ? 'closed' : 'draft';
  const incomingStatus = safeTrim(incoming.status) === 'closed' ? 'closed' : 'draft';
  const localTs = sessionRevisionTs(local);
  const incomingTs = sessionRevisionTs(incoming);
  const localScore = sessionCompletenessScore(local);
  const incomingScore = sessionCompletenessScore(incoming);

  let decision = 'keep-local';
  let reason = 'tie-keep-local';

  if (localStatus === 'closed' && incomingStatus === 'draft'){
    decision = 'keep-local';
    reason = 'closed-beats-draft';
  } else if (localStatus === 'draft' && incomingStatus === 'closed'){
    if ((incomingTs && !localTs) || (incomingTs && localTs && incomingTs >= localTs) || incomingScore >= localScore){
      decision = 'replace-local';
      reason = 'draft-promoted-to-closed';
    } else {
      decision = 'keep-local';
      reason = 'local-draft-newer';
    }
  } else if (incomingTs && localTs && incomingTs !== localTs){
    if (incomingTs > localTs){
      decision = 'replace-local';
      reason = 'incoming-newer';
    } else {
      decision = 'keep-local';
      reason = 'incoming-older';
    }
  } else if (incomingTs && !localTs){
    decision = 'replace-local';
    reason = 'incoming-has-timestamp';
  } else if (!incomingTs && localTs){
    decision = 'keep-local';
    reason = 'local-has-timestamp';
  } else if (incomingScore > localScore){
    decision = 'replace-local';
    reason = 'incoming-more-complete';
  } else if (incomingScore < localScore){
    decision = 'keep-local';
    reason = 'local-more-complete';
  }

  return {
    decision,
    reason,
    resolvedSession: buildResolvedSession(local, incoming, decision === 'replace-local'),
    localTs,
    incomingTs,
    localScore,
    incomingScore,
  };
}

function compareSessionPreference(a, b){
  const aClosed = safeTrim(a && a.status) === 'closed';
  const bClosed = safeTrim(b && b.status) === 'closed';
  if (aClosed !== bClosed) return aClosed ? 1 : -1;

  const aTs = sessionRevisionTs(a);
  const bTs = sessionRevisionTs(b);
  if (aTs !== bTs) return aTs > bTs ? 1 : -1;

  const aScore = sessionCompletenessScore(a);
  const bScore = sessionCompletenessScore(b);
  if (aScore !== bScore) return aScore > bScore ? 1 : -1;

  const aPdf = Number.isFinite(a && a.pdfSeq) ? Math.floor(a.pdfSeq) : 0;
  const bPdf = Number.isFinite(b && b.pdfSeq) ? Math.floor(b.pdfSeq) : 0;
  if (aPdf !== bPdf) return aPdf > bPdf ? 1 : -1;

  return 0;
}

function dedupeSessionsBySignature(list){
  const input = Array.isArray(list) ? list : [];
  const out = [];
  const indexBySignature = new Map();
  let removed = 0;

  input.forEach(session => {
    const sig = sessionMergeSignature(session);
    if (!sig){
      out.push(session);
      return;
    }

    if (!indexBySignature.has(sig)){
      indexBySignature.set(sig, out.length);
      out.push(session);
      return;
    }

    const idx = indexBySignature.get(sig);
    const existing = out[idx];
    const preferIncoming = compareSessionPreference(session, existing) > 0;
    out[idx] = buildResolvedSession(existing, session, preferIncoming);
    removed += 1;
  });

  return { sessions: out, removed };
}

function buildMergedStoreNonDestructive(currentStore, incomingStore){
  const cur = normalizeStoreObject(currentStore).store;
  const remapped = remapIncomingStorePlayersByCanonical(cur, incomingStore);
  const incoming = remapped.store;
  const canonicalPlan = remapped.plan;

  const chips = Array.isArray(cur.chips) ? cur.chips.map(ch => cloneJson(ch) || ch) : [];
  const players = Array.isArray(cur.players) ? cur.players.map(pl => cloneJson(pl) || pl) : [];
  const sessions = Array.isArray(cur.sessions) ? cur.sessions.map(ss => cloneJson(ss) || ss) : [];

  const chipById = new Map();
  chips.forEach(chip => {
    const id = stableEntityId(chip);
    if (id && !chipById.has(id)) chipById.set(id, chip);
  });

  const playerById = new Map();
  players.forEach(player => {
    const id = stableEntityId(player);
    if (id && !playerById.has(id)) playerById.set(id, player);
  });

  const sessionById = new Map();
  const sessionBySignature = new Map();
  sessions.forEach(session => {
    const id = stableEntityId(session);
    const signature = sessionMergeSignature(session);
    if (id && !sessionById.has(id)) sessionById.set(id, session);
    if (signature && !sessionBySignature.has(signature)) sessionBySignature.set(signature, session);
  });

  const identityPreview = detectCrossStorePlayerIdentity(players, incoming.players);

  const summary = {
    chipsAdded: 0,
    chipsMerged: 0,
    playersAdded: 0,
    playersMerged: 0,
    playersRecognizedExisting: numOrZero(canonicalPlan && canonicalPlan.counts && canonicalPlan.counts.recognizedExisting),
    playersReconciledCanonical: numOrZero(canonicalPlan && canonicalPlan.counts && canonicalPlan.counts.canonicalReconciled),
    playersExistingSameId: numOrZero(canonicalPlan && canonicalPlan.counts && canonicalPlan.counts.sameIdExisting),
    playersDoubtfulDeferred: numOrZero(canonicalPlan && canonicalPlan.counts && canonicalPlan.counts.doubtful),
    playersNewRealDetected: numOrZero(canonicalPlan && canonicalPlan.counts && canonicalPlan.counts.newReal),
    sessionsAdded: 0,
    sessionsUpdated: 0,
    sessionsKeptLocal: 0,
    duplicatesSkipped: 0,
    conflictsResolved: 0,
    conflictsDetected: 0,
    duplicateSessionsCollapsed: 0,
    identityStrongCandidates: numOrZero(identityPreview && identityPreview.counts && identityPreview.counts.strong),
    identityDoubtfulCandidates: numOrZero(identityPreview && identityPreview.counts && identityPreview.counts.doubtful),
    identityStrongPairs: Array.isArray(identityPreview && identityPreview.strong) ? identityPreview.strong.slice(0, 50) : [],
    identityDoubtfulPairs: Array.isArray(identityPreview && identityPreview.doubtful) ? identityPreview.doubtful.slice(0, 50) : [],
    playerRecognitionPairs: Array.isArray(canonicalPlan && canonicalPlan.recognized) ? (cloneJson(canonicalPlan.recognized) || []).slice(0, 50) : [],
    playerDoubtfulPairs: Array.isArray(canonicalPlan && canonicalPlan.doubtful) ? (cloneJson(canonicalPlan.doubtful) || []).slice(0, 50) : [],
    conflicts: [],
  };

  (Array.isArray(incoming.chips) ? incoming.chips : []).forEach(inChip => {
    const id = stableEntityId(inChip);
    if (!id) return;
    const local = chipById.get(id);
    if (!local){
      const added = cloneJson(inChip) || inChip;
      chips.push(added);
      chipById.set(id, added);
      summary.chipsAdded += 1;
      return;
    }
    const merged = mergeChipEntity(local, inChip);
    if (canonicalJson(merged) === canonicalJson(local)) return;
    const idx = chips.indexOf(local);
    if (idx >= 0) chips[idx] = merged;
    chipById.set(id, merged);
    summary.chipsMerged += 1;
  });

  (Array.isArray(incoming.players) ? incoming.players : []).forEach(inPlayer => {
    const id = stableEntityId(inPlayer);
    if (!id) return;
    const local = playerById.get(id);
    if (!local){
      const added = cloneJson(inPlayer) || inPlayer;
      players.push(added);
      playerById.set(id, added);
      summary.playersAdded += 1;
      return;
    }
    const merged = mergePlayerEntity(local, inPlayer);
    if (canonicalJson(merged) === canonicalJson(local)) return;
    const idx = players.indexOf(local);
    if (idx >= 0) players[idx] = merged;
    playerById.set(id, merged);
    summary.playersMerged += 1;
  });

  (Array.isArray(incoming.sessions) ? incoming.sessions : []).forEach(inSession => {
    const candidate = cloneJson(inSession) || inSession;
    if (candidate && typeof candidate === 'object' && candidate.historicalImpact) delete candidate.historicalImpact;
    const id = stableEntityId(candidate);
    const signature = sessionMergeSignature(candidate);
    const localById = id ? sessionById.get(id) : null;
    const localBySignature = signature ? sessionBySignature.get(signature) : null;

    if (localById){
      const localSignature = sessionMergeSignature(localById);
      if (localSignature === signature){
        summary.duplicatesSkipped += 1;
        return;
      }

      const resolution = resolveSessionConflict(localById, candidate);
      const resolved = resolution.resolvedSession;
      const idx = sessions.indexOf(localById);
      if (idx >= 0) sessions[idx] = resolved;

      if (localSignature && sessionBySignature.get(localSignature) === localById) sessionBySignature.delete(localSignature);
      if (id) sessionById.set(id, resolved);
      const nextSignature = sessionMergeSignature(resolved);
      if (nextSignature) sessionBySignature.set(nextSignature, resolved);

      summary.conflictsDetected += 1;
      summary.conflictsResolved += 1;
      if (resolution.decision === 'replace-local') summary.sessionsUpdated += 1;
      else summary.sessionsKeptLocal += 1;
      summary.conflicts.push({
        id: id || stableEntityId(localById) || '',
        date: resolved.date || candidate.date || localById.date || '',
        decision: resolution.decision,
        reason: resolution.reason,
      });
      return;
    }

    if (localBySignature){
      summary.duplicatesSkipped += 1;
      return;
    }

    sessions.push(candidate);
    if (id) sessionById.set(id, candidate);
    if (signature) sessionBySignature.set(signature, candidate);
    summary.sessionsAdded += 1;
  });

  const dedupedSessions = dedupeSessionsBySignature(sessions);
  if (dedupedSessions.removed > 0){
    summary.duplicatesSkipped += dedupedSessions.removed;
    summary.duplicateSessionsCollapsed += dedupedSessions.removed;
  }
  const finalSessions = dedupedSessions.sessions;
  const sourceReferenceRemap = remapStoreCanonicalPlayerReferences({
    chips,
    players,
    sessions: finalSessions,
    pdfSeqNext: Math.max(numOrZero(cur.pdfSeqNext), numOrZero(incoming.pdfSeqNext), 1),
    draftSessionId: firstNonEmpty(cur.draftSessionId, incoming.draftSessionId),
    updatedAt: Date.now(),
    ui: Object.assign({}, isPlainObject(cur.ui) ? cloneJson(cur.ui) || {} : {}),
  });
  const canonicalizedStore = sourceReferenceRemap.store;
  const remapSummary = isPlainObject(sourceReferenceRemap && sourceReferenceRemap.summary) ? sourceReferenceRemap.summary : {};
  const remapPlan = sourceReferenceRemap && sourceReferenceRemap.plan ? sourceReferenceRemap.plan : null;

  summary.sourceCanonicalReferenceGroups = numOrZero(remapSummary.groups);
  summary.sourceDuplicatePlayersRemapped = numOrZero(remapSummary.duplicatePlayers);
  summary.sourceSessionsRemapped = numOrZero(remapSummary.sessionsTouched);
  summary.sourcePlayerRefsRemapped = numOrZero(remapSummary.refsChanged);
  summary.sourcePlayerCardsConsolidated = numOrZero(remapSummary.playersCollapsed);
  summary.sourceStructuresRemapped = uniqStrings(remapSummary.structuresTouched || []);
  summary.sourceReferenceRemapGroups = Array.isArray(remapPlan && remapPlan.groups) ? (cloneJson(remapPlan.groups) || []).slice(0, 50) : [];

  const finalSessionsCanonical = Array.isArray(canonicalizedStore.sessions) ? canonicalizedStore.sessions : [];
  const finalSessionById = new Map();
  finalSessionsCanonical.forEach(session => {
    const sid = stableEntityId(session);
    if (sid && !finalSessionById.has(sid)) finalSessionById.set(sid, session);
  });

  const requestedDraftId = firstNonEmpty(cur.draftSessionId, incoming.draftSessionId, canonicalizedStore.draftSessionId);
  let nextDraftId = '';
  if (requestedDraftId && finalSessionById.has(requestedDraftId)){
    const draftCandidate = finalSessionById.get(requestedDraftId);
    if (draftCandidate && draftCandidate.status === 'draft') nextDraftId = requestedDraftId;
  }
  if (!nextDraftId){
    const firstDraft = finalSessionsCanonical.find(s => s && s.status === 'draft');
    nextDraftId = firstDraft ? stableEntityId(firstDraft) : '';
  }

  const mergedStore = normalizeStoreObject(Object.assign({}, cur, canonicalizedStore, {
    pdfSeqNext: Math.max(numOrZero(cur.pdfSeqNext), numOrZero(incoming.pdfSeqNext), numOrZero(canonicalizedStore.pdfSeqNext), 1),
    draftSessionId: nextDraftId,
    updatedAt: Date.now(),
    ui: Object.assign({}, isPlainObject(cur.ui) ? cloneJson(cur.ui) || {} : {}, isPlainObject(canonicalizedStore.ui) ? cloneJson(canonicalizedStore.ui) || {} : {}, {
      importLastSummary: {
        appliedAt: Date.now(),
        rule: 'same-session-same-content=duplicate; same-session-different-content=updatedAt-without-downgrading-closed-to-draft; strong-canonical-remap-on-source-before-derived-rebuild',
        playersAdded: summary.playersAdded,
        playersMerged: summary.playersMerged,
        playersRecognizedExisting: summary.playersRecognizedExisting,
        playersReconciledCanonical: summary.playersReconciledCanonical,
        playersExistingSameId: summary.playersExistingSameId,
        playersDoubtfulDeferred: summary.playersDoubtfulDeferred,
        playersNewRealDetected: summary.playersNewRealDetected,
        sessionsAdded: summary.sessionsAdded,
        sessionsUpdated: summary.sessionsUpdated,
        sessionsKeptLocal: summary.sessionsKeptLocal,
        duplicatesSkipped: summary.duplicatesSkipped,
        conflictsDetected: summary.conflictsDetected,
        conflictsResolved: summary.conflictsResolved,
        duplicateSessionsCollapsed: summary.duplicateSessionsCollapsed,
        chipsAdded: summary.chipsAdded,
        chipsMerged: summary.chipsMerged,
        identityStrongCandidates: summary.identityStrongCandidates,
        identityDoubtfulCandidates: summary.identityDoubtfulCandidates,
        sourceCanonicalReferenceGroups: summary.sourceCanonicalReferenceGroups,
        sourceDuplicatePlayersRemapped: summary.sourceDuplicatePlayersRemapped,
        sourceSessionsRemapped: summary.sourceSessionsRemapped,
        sourcePlayerRefsRemapped: summary.sourcePlayerRefsRemapped,
        sourcePlayerCardsConsolidated: summary.sourcePlayerCardsConsolidated,
        sourceStructuresRemapped: cloneJson(summary.sourceStructuresRemapped) || [],
        identityStrongPairs: cloneJson(summary.identityStrongPairs) || [],
        identityDoubtfulPairs: cloneJson(summary.identityDoubtfulPairs) || [],
        playerRecognitionPairs: cloneJson(summary.playerRecognitionPairs) || [],
        playerDoubtfulPairs: cloneJson(summary.playerDoubtfulPairs) || [],
        sourceReferenceRemapGroups: cloneJson(summary.sourceReferenceRemapGroups) || [],
        conflicts: summary.conflicts.slice(0, 50),
      }
    }),
  })).store;

  return { mergedStore, summary };
}


function purgeLegacyStorageResidue(){
  const keep = new Set([STORE_KEY, THEME_KEY, UPDATE_UI_KEY, UPDATE_BOOT_KEY]);

  try{
    const keys = [];
    for (let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if (!key || keep.has(key)) continue;
      keys.push(key);
    }
    keys.forEach(key => localStorage.removeItem(key));
  }catch(e){}

  try{
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++){
      const key = sessionStorage.key(i);
      if (!key || keep.has(key)) continue;
      keys.push(key);
    }
    keys.forEach(key => sessionStorage.removeItem(key));
  }catch(e){}
}

async function purgeLegacyCaches(){
  if (!('caches' in window)) return;

  try{
    const names = await caches.keys();
    await Promise.all(names.map((name) => {
      if (name !== APP_CACHE_NAME) return caches.delete(name);
      return Promise.resolve();
    }));
  }catch(e){}
}

function purgeLegacyClientResidue(){
  purgeLegacyStorageResidue();
  purgeLegacyCaches();
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
  if (!Array.isArray(store.chips)) store.chips = [];
  const idx = findIndexByStableId(store.chips, chip);
  if (idx >= 0) store.chips[idx] = chip;
  else store.chips.push(chip);
  saveStore();
}

function setChipActive(id, active){
  const c = (store.chips || []).find(x => sameStableEntity(x, id));
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


// Reportes/documentos: usar NOMBRE real con prioridad:
// 1) playersSnapshot de la sesión
// 2) maestro (store.players)
// 3) fallback (display/nick/id)
function makeReportNameResolver(session){
  const s = session || {};
  const snapsArr = Array.isArray(s.playersSnapshot) ? s.playersSnapshot : [];
  const snapMap = new Map(snapsArr.filter(p => p && p.id).map(p => [String(p.id), p]));
  const masterMap = new Map(getPlayers().filter(p => p && p.id).map(p => [String(p.id), p]));

  return function reportName(pid, fallbackDisplay){
    const key = String(pid || '').trim();
    const sp = snapMap.get(key);
    const mp = masterMap.get(key);

    const snapName = (sp && typeof sp.name === 'string') ? sp.name.trim() : '';
    const masterName = (mp && typeof mp.name === 'string') ? mp.name.trim() : '';
    if (snapName) return snapName;
    if (masterName) return masterName;

    const fb = (fallbackDisplay != null ? String(fallbackDisplay).trim() : '')
      || (sp && (String(sp.display || sp.name || sp.nick || '').trim()))
      || (mp && (String(mp.name || mp.nick || '').trim()))
      || key;

    return fb || 'Sin nombre';
  };
}


function upsertPlayer(player){
  if (!store.players) store.players = [];
  const idx = findIndexByStableId(store.players, player);
  if (idx >= 0) store.players[idx] = player;
  else store.players.push(player);
  saveStore();
}

function setPlayerActive(id, active){
  const p = (store.players || []).find(x => sameStableEntity(x, id));
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
    '/archivo/historial': renderHistorial,
    '/archivo/historial/detalle': renderHistorialDetalle,
    '/archivo/ranking': renderRanking,
    '/archivo/perfiles': renderPerfiles,
    '/archivo/perfiles/detalle': renderPerfilDetalle,
    '/administracion': renderAdministracion,
    '/configuracion': renderAdministracion,
    '/archivo': renderArchivo,
    '/pdf': renderPdf,
  };

  function canonicalizeRoutePath(path){
    const raw = safeTrim(path) || '/inicio';
    const clean = raw.split('?')[0] || '/inicio';
    if (clean === '/configuracion' || clean === '/soporte') return '/administracion';
    if (clean === '/ranking') return '/archivo/ranking';
    if (clean === '/historial') return '/archivo/historial';
    if (clean === '/historial/detalle') return '/archivo/historial/detalle';
    if (clean === '/perfiles') return '/archivo/perfiles';
    if (clean === '/perfiles/detalle') return '/archivo/perfiles/detalle';
    return clean || '/inicio';
  }

  function getRoute(){
    const hash = window.location.hash || '#/inicio';
    const path = hash.startsWith('#') ? hash.slice(1) : hash;
    return canonicalizeRoutePath(path || '/inicio');
  }

  function getHashQuery(){
    const hash = window.location.hash || '';
    const q = hash.includes('?') ? hash.split('?').slice(1).join('?') : '';
    try{ return new URLSearchParams(q); }catch(e){ return new URLSearchParams(''); }
  }

  function normalizeNavigationHref(path){
    const raw = safeTrim(path) || '/inicio';
    const href = raw.startsWith('/') ? raw : ('/' + raw);
    if (href === '/configuracion' || href === '/soporte') return '/administracion';
    if (href === '/ranking') return '/archivo/ranking';
    if (href === '/historial') return '/archivo/historial';
    if (href === '/historial/detalle') return '/archivo/historial/detalle';
    if (href === '/perfiles') return '/archivo/perfiles';
    if (href === '/perfiles/detalle') return '/archivo/perfiles/detalle';
    if (href.startsWith('/configuracion?')) return '/administracion' + href.slice('/configuracion'.length);
    if (href.startsWith('/soporte?')) return '/administracion' + href.slice('/soporte'.length);
    if (href.startsWith('/ranking?')) return '/archivo/ranking' + href.slice('/ranking'.length);
    if (href.startsWith('/historial?')) return '/archivo/historial' + href.slice('/historial'.length);
    if (href.startsWith('/historial/detalle?')) return '/archivo/historial/detalle' + href.slice('/historial/detalle'.length);
    if (href.startsWith('/perfiles?')) return '/archivo/perfiles' + href.slice('/perfiles'.length);
    if (href.startsWith('/perfiles/detalle?')) return '/archivo/perfiles/detalle' + href.slice('/perfiles/detalle'.length);
    return href;
  }

  function navigate(path, options){
    const href = normalizeNavigationHref(path);
    const stackMode = safeTrim(options && options.stackMode) || 'push';
    pendingHeaderNavIntent = { kind: stackMode, href };
    if (getRouteHref() === href){
      applyHeaderNavigationState(href);
      updateHeaderControls(getRoute());
      return;
    }
    window.location.hash = '#' + href;
  }

  // ===== Etapa 2: Export PDF (sin dependencias) =====
  function exportSessionPDF(sessionId){
    const id = String(sessionId || '').trim();
    if (!id) return;
    const base = (window.location.href || '').split('#')[0] || './';
    const url = base + '#/pdf?id=' + encodeURIComponent(id);
    let w = null;
    try{ w = window.open(url, '_blank'); }catch(e){ w = null; }
    if (!w){
      // Fallback: mismo tab (por si el navegador bloquea popups)
      navigate('/pdf?id=' + encodeURIComponent(id));
      return;
    }
    try{ w.focus(); }catch(e){}
  }


  let pdfRenderSerial = 0;

  function invalidatePrintRender(){
    pdfRenderSerial += 1;
  }

  function resetPrintSurface(){
    if (!$printRoot) return;
    try{ $printRoot.innerHTML = ''; }catch(e){}
  }

  function createAbortError(){
    const err = new Error('PRINT_PREP_ABORTED');
    err.name = 'AbortError';
    return err;
  }

  function isAbortError(err){
    return !!(err && (err.name === 'AbortError' || err.message === 'PRINT_PREP_ABORTED'));
  }

  function throwIfAborted(signal){
    if (signal && signal.aborted) throw createAbortError();
  }

  function waitMs(ms, signal){
    return new Promise((resolve, reject) => {
      throwIfAborted(signal);
      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, Math.max(0, Math.floor(numOrZero(ms))));
      function onAbort(){
        cleanup();
        reject(createAbortError());
      }
      function cleanup(){
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
      }
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  function nextPaint(signal){
    return new Promise((resolve, reject) => {
      throwIfAborted(signal);
      const done = () => {
        try{ throwIfAborted(signal); resolve(); }
        catch(err){ reject(err); }
      };
      try{
        requestAnimationFrame(() => requestAnimationFrame(done));
      }catch(e){
        setTimeout(done, 34);
      }
    });
  }

  async function waitForDocumentFonts(signal){
    throwIfAborted(signal);
    try{
      if (document.fonts && document.fonts.ready){
        await Promise.race([document.fonts.ready, waitMs(1200, signal)]);
      }
    }catch(e){}
  }

  async function waitForPrintImages(root, signal){
    throwIfAborted(signal);
    const imgs = Array.from((root && root.querySelectorAll) ? root.querySelectorAll('img') : []);
    if (!imgs.length) return;
    await Promise.all(imgs.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, 1500);
        const cleanup = () => {
          clearTimeout(timer);
          img.removeEventListener('load', onDone);
          img.removeEventListener('error', onDone);
          if (signal) signal.removeEventListener('abort', onAbort);
        };
        const onDone = () => { cleanup(); resolve(); };
        const onAbort = () => { cleanup(); reject(createAbortError()); };
        img.addEventListener('load', onDone, { once: true });
        img.addEventListener('error', onDone, { once: true });
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
      });
    }));
  }

  async function waitForPrintLayout(root, signal){
    throwIfAborted(signal);
    const target = root || $printRoot;
    if (!target) return;
    let stablePasses = 0;
    let prevHeight = -1;
    let prevSections = -1;
    const startedAt = Date.now();
    while ((Date.now() - startedAt) < 2600){
      await nextPaint(signal);
      throwIfAborted(signal);
      const height = Math.max(Math.round(numOrZero(target.scrollHeight)), Math.round(numOrZero(target.getBoundingClientRect && target.getBoundingClientRect().height)));
      const sections = target.querySelectorAll ? target.querySelectorAll('.print-section, .print-rank-card, .print-impact-card, .print-table tbody tr').length : 0;
      if (height > 0 && sections > 0 && height == prevHeight && sections == prevSections) stablePasses += 1;
      else stablePasses = 0;
      prevHeight = height;
      prevSections = sections;
      if (stablePasses >= 2) break;
    }
    await nextPaint(signal);
  }

  async function waitForPrintReady(root, signal){
    throwIfAborted(signal);
    await nextPaint(signal);
    await waitForDocumentFonts(signal);
    await waitForPrintImages(root, signal);
    await waitForPrintLayout(root, signal);
    await nextPaint(signal);
  }

  const PDF_PRINT_INNER_WIDTH_MM = 337;
  const PDF_PRINT_INNER_HEIGHT_MM = 198;
  const PDF_PRINT_HEIGHT_RATIO = PDF_PRINT_INNER_HEIGHT_MM / PDF_PRINT_INNER_WIDTH_MM;
  // Etapa 4/4 — cierre final de la Ruta 2: se mantiene la reserva de seguridad,
  // pero se agrega una segunda pasada de compactación para recuperar aire útil sin reabrir cortes indignos.

  function clearSemanticPdfPagination(root){
    const target = root || $printRoot;
    if (!target || !target.querySelectorAll) return;
    Array.from(target.querySelectorAll('.pdf-break-before-semantic')).forEach(node => {
      try{ node.classList.remove('pdf-break-before-semantic'); }catch(e){}
      try{
        if (node.dataset && safeTrim(node.dataset.pdfBreakReason)) delete node.dataset.pdfBreakReason;
      }catch(e){}
      try{
        if (node.classList && node.classList.contains('pdf-break-before') && (!node.dataset || !safeTrim(node.dataset.pdfBreakSticky))) node.classList.remove('pdf-break-before');
      }catch(e){}
    });
  }

  function markSemanticPdfBreak(node, reason){
    if (!node || !node.classList) return false;
    if (node.classList.contains('pdf-break-before-semantic')) return false;
    try{ node.classList.add('pdf-break-before', 'pdf-break-before-semantic'); }catch(e){ return false; }
    try{
      if (node.dataset){
        node.dataset.pdfBreakReason = safeTrim(reason) || 'semantic';
      }
    }catch(e){}
    return true;
  }

  function getSemanticPrintMetrics(root){
    const target = root || $printRoot;
    if (!target || !target.querySelector) return null;
    const screen = target.querySelector('.pdf-document-sheet, .print-screen') || target;
    const content = target.querySelector('.pdf-document-content, .print-content') || screen;
    if (!screen || !content || !screen.getBoundingClientRect || !content.getBoundingClientRect) return null;
    const contentRect = content.getBoundingClientRect();
    const screenRect = screen.getBoundingClientRect();
    const width = Math.max(0, numOrZero(contentRect.width) || numOrZero(screenRect.width));
    if (width <= 0) return null;
    const pageHeight = Math.max(320, Math.round(width * PDF_PRINT_HEIGHT_RATIO));
    const pageBuffer = Math.max(10, Math.round(pageHeight * 0.028));
    return {
      target,
      screen,
      rootTop: numOrZero(screenRect.top),
      pageHeight,
      pageBuffer,
      maxAtomicHeight: pageHeight * 0.93,
    };
  }

  function getRelativeRect(node, metrics){
    if (!node || !metrics || !node.getBoundingClientRect) return null;
    const rect = node.getBoundingClientRect();
    const top = numOrZero(rect.top) - numOrZero(metrics.rootTop);
    const bottom = numOrZero(rect.bottom) - numOrZero(metrics.rootTop);
    const height = Math.max(0, numOrZero(rect.height) || (bottom - top));
    return { top, bottom, height };
  }

  function getRemainingPageSpace(offsetTop, metrics){
    const pageHeight = numOrZero(metrics && metrics.pageHeight);
    if (pageHeight <= 0) return 0;
    const pageIndex = Math.max(0, Math.floor(Math.max(0, numOrZero(offsetTop)) / pageHeight));
    const pageEnd = (pageIndex + 1) * pageHeight;
    return pageEnd - Math.max(0, numOrZero(offsetTop));
  }

  function shouldPushSemanticUnit(node, metrics){
    const rect = getRelativeRect(node, metrics);
    if (!rect || rect.height <= 0) return false;
    if (rect.top <= numOrZero(metrics.pageBuffer)) return false;
    if (rect.height > numOrZero(metrics.maxAtomicHeight)) return false;
    const remaining = getRemainingPageSpace(rect.top, metrics);
    if (remaining <= 0) return false;
    return (rect.height + numOrZero(metrics.pageBuffer)) > remaining;
  }

  function isSemanticSupportBlock(node){
    if (!node || !node.classList) return false;
    return node.classList.contains('print-note')
      || node.classList.contains('print-meta')
      || node.classList.contains('print-impact-summary')
      || node.classList.contains('print-archive-banner')
      || node.classList.contains('print-rank-podium')
      || node.classList.contains('print-record-seal');
  }

  function getSectionBodyDirectChildren(section){
    const body = section && section.querySelector ? section.querySelector('.print-section-body') : null;
    if (!body) return [];
    return Array.from(body.children || []).filter(Boolean);
  }

  function getSectionHeadNode(section){
    if (!section || !section.children) return null;
    return Array.from(section.children).find(child => child && child.classList && child.classList.contains('print-section-head')) || null;
  }

  function getEditorialCompanionNode(node){
    const parent = node && node.parentElement;
    if (!parent || !parent.children) return null;
    const siblings = Array.from(parent.children || []).filter(Boolean);
    const index = siblings.indexOf(node);
    for (let i = index + 1; i < siblings.length; i += 1){
      const candidate = siblings[i];
      if (!candidate || !candidate.classList) continue;
      if (candidate.classList.contains('print-section') || candidate.classList.contains('print-opening')) return candidate;
    }
    return null;
  }

  function getTopLevelPdfFragments(container){
    if (!container || !container.querySelectorAll) return [];
    const all = Array.from(container.querySelectorAll('[data-pdf-fragment]')).filter(Boolean);
    return all.filter(node => {
      let current = node && node.parentElement;
      while (current && current !== container){
        if (current.nodeType === 1 && current.hasAttribute && current.hasAttribute('data-pdf-fragment')) return false;
        current = current.parentElement;
      }
      return current === container;
    });
  }

  function getCombinedRect(nodes, metrics){
    const list = Array.isArray(nodes) ? nodes : [];
    let top = null;
    let bottom = null;
    list.forEach(node => {
      const rect = getRelativeRect(node, metrics);
      if (!rect || rect.height <= 0) return;
      if (top == null || rect.top < top) top = rect.top;
      if (bottom == null || rect.bottom > bottom) bottom = rect.bottom;
    });
    if (top == null || bottom == null || bottom <= top) return null;
    return { top, bottom, height: bottom - top };
  }

  function shouldPushCombinedRect(rect, metrics){
    if (!rect || !metrics || rect.height <= 0) return false;
    if (rect.top <= numOrZero(metrics.pageBuffer)) return false;
    if (rect.height > (numOrZero(metrics.pageHeight) * 0.92)) return false;
    const remaining = getRemainingPageSpace(rect.top, metrics);
    if (remaining <= 0) return false;
    return (rect.height + numOrZero(metrics.pageBuffer)) > remaining;
  }

  function getSectionSemanticUnits(section){
    const bodyChildren = getSectionBodyDirectChildren(section);
    if (!bodyChildren.length) return [];
    const body = section && section.querySelector ? section.querySelector('.print-section-body') : null;
    const explicitFragments = getTopLevelPdfFragments(body);
    if (explicitFragments.length){
      return explicitFragments.map((node, idx) => ({
        anchor: node,
        node,
        reason: (node.dataset && safeTrim(node.dataset.pdfFragment)) || `fragment-${idx + 1}`,
      }));
    }
    const units = [];
    const first = bodyChildren[0] || null;
    if (first) units.push({ anchor: section, node: first, reason: 'section-lead' });
    for (let i = 1; i < bodyChildren.length; i += 1){
      const child = bodyChildren[i];
      if (!child || child === first) continue;
      if (child.classList && (child.classList.contains('print-impact-list') || child.classList.contains('print-rank-list'))){
        const cards = Array.from(child.children || []).filter(Boolean);
        if (cards.length){
          const prev = bodyChildren[i - 1] || null;
          if (prev && prev.classList && prev.classList.contains('print-note')){
            units.push({ anchor: prev, node: cards[0], reason: 'continuation-with-card' });
          }
          cards.forEach((card, idx) => {
            if (idx === 0 && prev && prev.classList && prev.classList.contains('print-note')) return;
            units.push({ anchor: card, node: card, reason: child.classList.contains('print-impact-list') ? 'impact-card' : 'rank-card' });
          });
          continue;
        }
      }
      const prev = bodyChildren[i - 1] || null;
      if (prev && prev.classList && prev.classList.contains('print-note') && !isSemanticSupportBlock(child)){
        units.push({ anchor: prev, node: child, reason: 'note-with-following-block' });
        continue;
      }
      units.push({ anchor: child, node: child, reason: isSemanticSupportBlock(child) ? 'support-block' : 'body-block' });
    }
    return units;
  }

  async function prepareSemanticPdfPagination(root, signal){
    const target = root || $printRoot;
    if (!target || !target.querySelectorAll) return;
    clearSemanticPdfPagination(target);
    const maxPasses = 16;
    for (let pass = 0; pass < maxPasses; pass += 1){
      throwIfAborted(signal);
      await nextPaint(signal);
      const metrics = getSemanticPrintMetrics(target);
      if (!metrics) return;
      let changed = false;
      const primaryUnits = Array.from(target.querySelectorAll('.print-opening, .print-editorial-head, .print-section'));
      for (const unit of primaryUnits){
        if (!unit || !unit.classList) continue;
        if (unit.classList.contains('print-section')){
          const rect = getRelativeRect(unit, metrics);
          if (!rect || rect.height <= 0) continue;
          const semanticUnits = getSectionSemanticUnits(unit);
          const sectionHead = getSectionHeadNode(unit);
          const firstSemanticAnchor = semanticUnits[0] && semanticUnits[0].anchor ? semanticUnits[0].anchor : null;
          const openingRect = getCombinedRect([sectionHead, firstSemanticAnchor], metrics);
          if (openingRect && shouldPushCombinedRect(openingRect, metrics)){
            changed = markSemanticPdfBreak(unit, 'section-head-with-first-unit');
            if (changed) break;
          }
          if (rect.height <= metrics.maxAtomicHeight){
            if (shouldPushSemanticUnit(unit, metrics)){
              changed = markSemanticPdfBreak(unit, 'section');
              if (changed) break;
            }
            continue;
          }
          for (const entry of semanticUnits){
            const anchor = entry && entry.anchor;
            if (!anchor || anchor === unit) continue;
            if (shouldPushSemanticUnit(anchor, metrics)){
              changed = markSemanticPdfBreak(anchor, entry.reason || 'section-unit');
              if (changed) break;
            }
          }
          if (changed) break;
          continue;
        }
        if (unit.classList.contains('print-editorial-head')){
          const companion = getEditorialCompanionNode(unit);
          const combinedRect = getCombinedRect([unit, companion], metrics);
          if (combinedRect && shouldPushCombinedRect(combinedRect, metrics)){
            changed = markSemanticPdfBreak(unit, 'editorial-head-with-next-block');
            if (changed) break;
          }
        }
        if (shouldPushSemanticUnit(unit, metrics)){
          changed = markSemanticPdfBreak(unit, unit.classList.contains('print-opening') ? 'opening' : 'editorial-head');
          if (changed) break;
        }
      }
      if (!changed) break;
      await waitForPrintLayout(target, signal);
    }
    await nextPaint(signal);
  }

  function setPrintStatus(root, message, tone){
    const node = root && root.querySelector ? root.querySelector('#printStatus') : null;
    if (!node) return;
    node.textContent = String(message || '');
    node.dataset.tone = safeTrim(tone) || 'muted';
  }

  function onRoute(){
    const path = getRoute();
    const href = getRouteHref();
    const isPrint = (path === '/pdf');
    try{ document.body.classList.toggle('print-mode', isPrint); }catch(e){}
    if (!isPrint){
      invalidatePrintRender();
      resetPrintSurface();
    }
    const fn = routes[path] || routes['/inicio'];
    fn();
    applyHeaderNavigationState(href);
    updateHeaderControls(path);
    syncAppModalState();
    if (!isPrint){
      // keep header fixed and scroll main to top per navigation
      try { $app.parentElement.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch(e){ $app.parentElement.scrollTop = 0; }
    } else if ($printRoot){
      try{ window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }catch(e){ try{ window.scrollTo(0,0); }catch(_e){} }
    }
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

          <button class="card home-card home-card--admin" data-go="/administracion" type="button">
            <div class="card-hero" aria-hidden="true">
              <div class="card-hero-slot">
                <img class="card-hero-img" data-hero="admin" alt="" decoding="async" loading="lazy" />
                <img class="card-hero-fallback" src="assets/hero/admin.svg" alt="" decoding="async" loading="lazy" />
              </div>
            </div>
            <div class="home-body">
              <div class="home-title">Administración</div>
              <p class="home-desc">Jugadores, fichas y control operativo del sistema sin mezclar archivo con la mesa.</p>
            </div>
          </button>


          <button class="card home-card home-card--archivo" data-go="/archivo" type="button">
            <div class="card-hero" aria-hidden="true">
              <div class="card-hero-slot">
                <img class="card-hero-img" data-hero="archivo" alt="" decoding="async" loading="lazy" />
                <img class="card-hero-fallback" src="assets/hero/archivo.svg" alt="" decoding="async" loading="lazy" />
              </div>
            </div>
            <div class="home-body">
              <div class="home-title">Archivo</div>
              <p class="home-desc">Historial, memoria de partidas y base preparada para crecer sin romper nada.</p>
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
    const defaultDate = draft ? String(draft.date || todayYMD()) : todayYMD();

    const closedSessions = getClosedSessions();

    const root = el(`
      <section class="screen screen--juego" aria-label="Crear/Continuar Partida">
        <h1 class="screen-title">Juego</h1>
        <p class="screen-sub">Crea una partida del día o retoma el borrador. (Tu “yo del futuro” te lo agradecerá.)</p>

        ${draft ? `
          <div class="panel" role="region" aria-label="Partida en borrador">
            <div class="panel-head">
              <div class="panel-title" style="margin:0">Partida en borrador</div>
              <div class="row panel-actions game-actions">
                <button class="btn primary" type="button" id="continueDraftBtn">Continuar</button>
                <button class="btn danger" type="button" id="discardDraftBtn">Descartar</button>
              </div>
            </div>

            <div class="draft-meta">
              <div class="draft-pill"><span class="k">Fecha</span><span class="v">${escapeHtml(draft.date || '')}</span></div>
              <div class="draft-pill"><span class="k">Jugadores</span><span class="v">${escapeHtml(String((draft.playersSnapshot||[]).length))}</span></div>
              <div class="draft-pill"><span class="k">Fichas (snapshot)</span><span class="v">${escapeHtml(String((draft.chipsSnapshot||[]).length))}</span></div>
            </div>
            <div class="small-note">Tip: aunque cambies fichas en Administración, esta sesión ya tiene su snapshot blindado.</div>
          </div>
        ` : ''}

        <div class="panel" role="region" aria-label="Crear partida" style="margin-top:${draft ? '14px' : '0'}">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Crear partida</div>
            <button class="btn" type="button" id="toAdminBtn">Ir a Administración</button>
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

          <div class="row panel-actions game-actions" style="margin-top:14px">
            <button class="btn primary" type="button" id="startSessionBtn">Iniciar Partida</button>
          </div>

          ${draft ? `<div class="small-note">Hay un borrador activo. Para crear una nueva partida, descártalo primero (sí, duele, pero es sano).</div>` : ''}
        </div>

        <div class="panel" role="region" aria-label="Historial" style="margin-top:14px">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Historial</div>
            <div class="row panel-actions" style="gap:10px">
              <div class="small-note" style="margin:0">Sesiones cerradas (solo lectura).</div>
              <button class="btn" type="button" id="toHistorialBtn">Historial</button>
            </div>
          </div>

          ${closedSessions.length ? `
            <div class="hist-list" id="histList" aria-live="polite">
              ${[closedSessions[0]].map(s => {
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
                      <button class="btn" type="button" data-act="view">Leer</button>
                      <button class="btn" type="button" data-act="pdf">PDF</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            ${closedSessions.length > 1 ? `<div class="small-note">Hay ${escapeHtml(String(closedSessions.length))} sesiones cerradas. Mira <b>Historial</b> para ver todas.</div>` : ''}
            <div class="small-note">Tip: <b>Leer</b> abre la vista corrida premium y <b>PDF</b> conserva la salida oficial exportable.</div>
          ` : `<div class="empty">Aún no hay sesiones cerradas. Tu historial está más limpio que tu conciencia (por ahora).</div>`}
        </div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    document.getElementById('toAdminBtn').addEventListener('click', () => navigate('/administracion'));
    const $toHist = document.getElementById('toHistorialBtn');
    if ($toHist) $toHist.addEventListener('click', () => navigate('/archivo/historial'));

    const $grid = document.getElementById('playerPickGrid');
    const $start = document.getElementById('startSessionBtn');
    const $date = document.getElementById('sessionDate');
    let startBusy = false;
    let discardBusy = false;

    function renderPickGrid(){
      if (!activePlayers.length){
        $grid.innerHTML = `<div class="empty">No hay jugadores activos. Activa o crea jugadores en Administración.</div>`;
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
      if (!$date.value) $date.value = todayYMD();
    });

    $start.addEventListener('click', () => {
      if (draft || startBusy) return;
      const date = ($date.value || '').trim() || todayYMD();
      const ids = Array.from(selected);
      if (!ids.length) return;

      startBusy = true;
      $start.disabled = true;
      const session = createDraftSession({ date, playerIds: ids });
      store.sessions = store.sessions || [];
      store.sessions.push(session);
      store.draftSessionId = session.id;
      if (!store.ui) store.ui = {};
      if (!store.ui.juego) store.ui.juego = {};
      store.ui.juego.lastPlayerIds = ids;
      saveStore();
      navigate('/juego/mesa');
    });

    if (draft){
      const $continue = document.getElementById('continueDraftBtn');
      const $discard = document.getElementById('discardDraftBtn');
      if ($continue) $continue.addEventListener('click', () => navigate('/juego/mesa'));
      if ($discard) $discard.addEventListener('click', async () => {
        if (discardBusy) return;
        discardBusy = true;
        try{
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
        } finally {
          discardBusy = false;
        }
      });
    }

    // historial
    const $hist = document.getElementById('histList');
    if ($hist){
      $hist.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-act]');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        const row = ev.target.closest('.hist-item');
        if (!row) return;
        const id = row.getAttribute('data-id');
        if (!id) return;
        if (act === 'view'){
          navigate('/archivo/historial/detalle?id=' + encodeURIComponent(id));
        } else if (act === 'pdf'){
          exportSessionPDF(id);
        }
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
      const masterMap = new Map(getPlayers().map(p => [p.id, p]));

      function stripAccents(s){
        s = String(s || '');
        try{ return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }catch(e){ return s; }
      }

      function normSearch(s){
        return stripAccents(String(s || '')).toLowerCase();
      }

      function winnersForSearch(s){
        try{
          ensureSessionGame(s);
          const players = Array.isArray(s.playersSnapshot) ? s.playersSnapshot : [];
          const chips = Array.isArray(s.chipsSnapshot) ? s.chipsSnapshot : [];
          const chipValueMap = new Map(chips.map(c => [c.id, numOrZero(c.value)]));
          const pStateMap = new Map((s.game && Array.isArray(s.game.players) ? s.game.players : []).map(p => [p.id, p]));
          const eps = 0.0001;
          let maxNet = -Infinity;
          const tmp = [];
          players.forEach(p => {
            const st = pStateMap.get(p.id) || { id: p.id, buyIn: 0, rebuys: [], counts: {} };
            const t = calcPlayerTotals(st, chipValueMap);
            const mp = masterMap.get(p.id);
            const display = mp ? playerDisplayName(mp) : (p.display || p.nick || p.name || p.id);
            const name = (mp && typeof mp.name === 'string') ? mp.name.trim() : (typeof p.name === 'string' ? p.name.trim() : '');
            const nick = (mp && typeof mp.nick === 'string') ? mp.nick.trim() : (typeof p.nick === 'string' ? p.nick.trim() : '');
            const bits = [display, name, nick].filter(Boolean).join(' ');
            const net = numOrZero(t.neto);
            tmp.push({ bits, net });
            if (net > maxNet) maxNet = net;
          });
          return tmp.filter(x => Math.abs(x.net - maxNet) <= eps).map(x => x.bits);
        }catch(e){
          return [];
        }
      }

      const items = sessions.map(s => {
        const sum = calcSessionSummary(s);
        const winners = winnersForSearch(s);
        const winnersText = winners.join(' ');

        const snaps = Array.isArray(s.playersSnapshot) ? s.playersSnapshot : [];
        const playersBits = [];
        snaps.forEach(p => {
          playersBits.push(p.name || '');
          playersBits.push(p.nick || '');
          const mp = masterMap.get(p.id);
          if (mp){
            playersBits.push(mp.name || '');
            playersBits.push(mp.nick || '');
          }
        });

        const blob = normSearch([s.date || '', playersBits.join(' '), winnersText].join(' '));
        return { id: s.id, s, sum, blob };
      });

      const root = el(`
        <section class="screen screen--historial" aria-label="Historial">
          <h1 class="screen-title">Historial</h1>
          <p class="screen-sub">Archivo · sesiones cerradas en orden cronológico descendente. La más reciente manda y va arriba. <b>Leer</b> abre la lectura corrida; <b>PDF</b> exporta la salida oficial.</p>

          <div class="panel" role="region" aria-label="Listado">
            <div class="panel-head">
              <div class="panel-title" style="margin:0">Sesiones</div>
              <div class="row panel-actions">
                <button class="btn" type="button" id="toRankingBtn">Ranking</button>
              </div>
            </div>

            <div class="hist-search" aria-label="Búsqueda">
              <div class="search-wrap">
                <input class="search-input" id="histSearch" type="search" placeholder="Buscar por fecha, jugador o ganador…" ${sessions.length ? '' : 'disabled'} autocomplete="off" spellcheck="false" />
                <button class="btn small" type="button" id="histClearBtn" ${sessions.length ? '' : 'disabled'} aria-label="Limpiar">✕</button>
              </div>
            </div>

            <div class="hist-list" id="histList" aria-live="polite"></div>
          </div>
        </section>
      `);

      $app.innerHTML = '';
      $app.appendChild(root);

      document.getElementById('toRankingBtn').addEventListener('click', () => navigate('/archivo/ranking'));

      const $list = document.getElementById('histList');
      const $search = document.getElementById('histSearch');
      const $clear = document.getElementById('histClearBtn');

      function renderList(list, emptyLabel){
        if (!$list) return;
        if (!list.length){
          const msg = emptyLabel || (sessions.length ? 'Sin resultados.' : 'Aún no hay sesiones cerradas.');
          $list.innerHTML = `<div class="empty">${escapeHtml(msg)}</div>`;
          return;
        }

        $list.innerHTML = list.map(it => {
          const s = it.s;
          const sum = it.sum;
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
                <button class="btn" type="button" data-act="view">Leer</button>
                <button class="btn" type="button" data-act="pdf">PDF</button>
              </div>
            </div>
          `;
        }).join('');
      }

      renderList(items);

      if ($list){
        $list.addEventListener('click', (ev) => {
          const btn = ev.target.closest('button[data-act]');
          if (!btn) return;
          const act = btn.getAttribute('data-act');
          const row = ev.target.closest('.hist-item');
          if (!row) return;
          const id = row.getAttribute('data-id');
          if (!id) return;
          if (act === 'view'){
            navigate('/archivo/historial/detalle?id=' + encodeURIComponent(id));
          } else if (act === 'pdf'){
            exportSessionPDF(id);
          }
        });
      }

      function applyFilter(){
        if (!$search){
          renderList(items);
          return;
        }
        const q = normSearch($search.value).trim();
        if (!q){
          renderList(items);
          return;
        }
        const filtered = items.filter(it => it.blob.includes(q));
        renderList(filtered, 'Sin resultados');
      }

      if ($search){
        $search.addEventListener('input', applyFilter);
        $search.addEventListener('keydown', (ev) => {
          if (ev.key === 'Escape'){
            ev.preventDefault();
            $search.value = '';
            applyFilter();
          }
        });
      }

      if ($clear){
        $clear.addEventListener('click', () => {
          if (!$search) return;
          $search.value = '';
          applyFilter();
          try{ $search.focus(); }catch(e){}
        });
      }
    }

function renderHistorialDetalle(){
    const q = getHashQuery();
    const id = (q.get('id') || '').trim();
    const s = id ? getSessionById(id) : null;
    if (!s || s.status !== 'closed'){
      navigate('/archivo/historial');
      return;
    }
    ensureSessionGame(s);

    try{
      const changed = assignPdfSeqIfNeeded(s);
      if (changed) saveSession(s);
    }catch(e){}

    const model = buildPdfDocumentModel(s);
    const root = buildScreenReportReaderRoot(model);

    $app.innerHTML = '';
    $app.appendChild(root);

    const $toMesa = document.getElementById('screenReportMesaBtn');
    if ($toMesa) $toMesa.addEventListener('click', () => navigate('/juego/sesion?id=' + encodeURIComponent(s.id)));

    const $toPdf = document.getElementById('screenReportPdfBtn');
    if ($toPdf) $toPdf.addEventListener('click', () => exportSessionPDF(s.id));
  }

  

  function chunkList(arr, size){
    const list = Array.isArray(arr) ? arr : [];
    const out = [];
    const chunkSize = Math.max(1, Math.floor(numOrZero(size) || 1));
    for (let i = 0; i < list.length; i += chunkSize) out.push(list.slice(i, i + chunkSize));
    return out;
  }

  function formatDateTimeForPdf(ts){
    const n = numOrZero(ts);
    if (!n) return '—';
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return '—';
    try{
      return new Intl.DateTimeFormat('es-NI', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    }catch(e){
      return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    }
  }

  function pdfSessionReferenceLabel(session){
    const s = session || {};
    const seqNum = (Number.isFinite(s.pdfSeq) && Math.floor(s.pdfSeq) >= 1) ? Math.floor(s.pdfSeq) : 0;
    const seqLabel = seqNum ? `PDF ${pad3(seqNum)}` : 'PDF s/n';
    const dateLabel = safeTrim(s.date) || formatDateTimeForPdf(numOrZero(s.closedAt || s.updatedAt || s.createdAt));
    const idLabel = stableEntityId(s) ? String(stableEntityId(s)).slice(-8) : 'sin-id';
    return `${seqLabel} · ${dateLabel} · ${idLabel}`;
  }

  function buildPdfMetaLines(items){
    const list = Array.isArray(items) ? items : [];
    return list.map(item => {
      const label = escapeHtml(String(item && item.label != null ? item.label : ''));
      const value = escapeHtml(String(item && item.value != null ? item.value : '—'));
      return `<div class="print-line"><span class="k">${label}</span><span class="v">${value}</span></div>`;
    }).join('');
  }

  function toPdfFamilySlug(value){
    return safeTrim(String(value || ''))
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function buildPdfSection(opts){
    const title = escapeHtml(String(opts && opts.title != null ? opts.title : ''));
    const rawTitle = String(opts && opts.title != null ? opts.title : '');
    const subtitle = safeTrim(opts && opts.subtitle);
    const body = String(opts && opts.body != null ? opts.body : '');
    const extraClass = safeTrim(opts && opts.className);
    const classes = ['print-section'];
    if (opts && opts.tight) classes.push('print-section--tight');
    if (opts && opts.subtle) classes.push('print-section--subtle');
    if (extraClass) classes.push(extraClass);
    if (opts && opts.breakBefore) classes.push('pdf-break-before');
    if ((opts && opts.avoidBreak) !== false) classes.push('pdf-avoid-break');
    const familyKey = safeTrim(opts && opts.familyKey) || toPdfFamilySlug(`${rawTitle} ${subtitle}`) || '';
    const familyLabel = safeTrim(opts && opts.familyLabel) || safeTrim(rawTitle) || familyKey;
    const attrs = [];
    if (familyKey) attrs.push(`data-pdf-family-key="${escapeAttr(familyKey)}"`);
    if (familyLabel) attrs.push(`data-pdf-family-label="${escapeAttr(familyLabel)}"`);
    return `
      <section class="${classes.join(' ')}" ${attrs.join(' ')}>
        <div class="print-section-head">
          <div class="print-section-title">${title}</div>
          ${subtitle ? `<div class="print-section-sub">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        <div class="print-section-body">${body}</div>
      </section>
    `;
  }

  function buildPdfFragment(body, opts){
    const options = opts && typeof opts === 'object' ? opts : {};
    const classes = ['print-fragment'];
    const extraClass = safeTrim(options.className);
    if (extraClass) classes.push(extraClass);
    if (options.avoidBreak !== false) classes.push('pdf-avoid-break');
    const fragmentKey = safeTrim(options.fragment) || 'fragment';
    const label = safeTrim(options.label);
    const attrs = [`data-pdf-fragment="${escapeAttr(fragmentKey)}"`];
    if (label) attrs.push(`data-pdf-fragment-label="${escapeAttr(label)}"`);
    return `<div class="${classes.join(' ')}" ${attrs.join(' ')}>${body != null ? String(body) : ''}</div>`;
  }

  function buildPdfFragmentHead(opts){
    const options = opts && typeof opts === 'object' ? opts : {};
    const kicker = safeTrim(options.kicker);
    const title = safeTrim(options.title);
    const copy = safeTrim(options.copy);
    if (!kicker && !title && !copy) return '';
    return `
      <div class="print-fragment-head">
        ${kicker ? `<div class="print-fragment-kicker">${escapeHtml(kicker)}</div>` : ''}
        ${title ? `<div class="print-fragment-title">${escapeHtml(title)}</div>` : ''}
        ${copy ? `<div class="print-fragment-copy">${escapeHtml(copy)}</div>` : ''}
      </div>
    `;
  }

  function buildPdfInlineTable(opts){
    const options = opts && typeof opts === 'object' ? opts : {};
    const columns = Array.isArray(options.columns) ? options.columns : [];
    const rows = Array.isArray(options.rows) ? options.rows : [];
    const noteHtml = String(options.noteHtml != null ? options.noteHtml : '');
    const colHtml = columns.map(col => {
      const label = escapeHtml(String(col && col.label != null ? col.label : ''));
      const klass = safeTrim(col && col.className);
      return `<th${klass ? ` class="${escapeAttr(klass)}"` : ''}>${label}</th>`;
    }).join('');

    const rowHtml = rows.length ? rows.map(row => {
      const cells = Array.isArray(row) ? row : [];
      return `<tr>${cells.map((cell, idx) => {
        const col = columns[idx] || {};
        const klass = safeTrim(col.className);
        return `<td${klass ? ` class="${escapeAttr(klass)}"` : ''}>${cell != null ? String(cell) : ''}</td>`;
      }).join('')}</tr>`;
    }).join('') : `<tr><td colspan="${Math.max(1, columns.length)}">—</td></tr>`;

    return `
      ${noteHtml}
      <div class="print-table-wrap" role="region" aria-label="${escapeAttr(String(options.ariaLabel != null ? options.ariaLabel : 'Tabla del PDF'))}">
        <table class="print-table${options.tableClassName ? ` ${escapeAttr(String(options.tableClassName))}` : ''}">
          <thead><tr>${colHtml}</tr></thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
    `;
  }

  function buildPdfTableSection(opts){
    const columns = Array.isArray(opts && opts.columns) ? opts.columns : [];
    const rows = Array.isArray(opts && opts.rows) ? opts.rows : [];
    const table = buildPdfInlineTable({
      columns,
      rows,
      noteHtml: String(opts && opts.noteHtml != null ? opts.noteHtml : ''),
      ariaLabel: String(opts && opts.ariaLabel != null ? opts.ariaLabel : 'Tabla del PDF'),
      tableClassName: safeTrim(opts && opts.tableClassName),
    });

    return buildPdfSection({
      title: (opts && opts.title) || 'Tabla',
      subtitle: (opts && opts.subtitle) || '',
      body: table,
      tight: true,
      subtle: !!(opts && opts.subtle),
      className: safeTrim(opts && opts.className),
      breakBefore: !!(opts && opts.breakBefore),
      avoidBreak: !!rows.length && rows.length <= 12,
    });
  }

  const PDF_GLOBAL_RANKING_CRITERION = 'Orden oficial: ganancia neta global, ROI global, victorias y sesiones jugadas.';
  const ROI_RECORD_MIN_GAMES = 3;
  const HISTORICAL_IMPACT_VERSION = 5;
  const PDF_RESULTS_ROWS_PER_SECTION = 6;
  const PDF_RESULTS_ROWS_PER_FRAGMENT = 3;
  const PDF_RECORD_ROWS_PER_FRAGMENT = 2;
  const PDF_IMPACT_CARDS_PER_SECTION = 1;
  const PDF_RANK_CARDS_PER_SECTION = 1;

  const PDF_EDITORIAL_GROUPS = Object.freeze({
    OPENING: Object.freeze({ key: 'opening-premium', label: 'Apertura premium', showHeader: false }),
    SESSION: Object.freeze({
      key: 'session',
      label: 'Sesión',
      kicker: 'Bloque de sesión',
      lead: 'La sesión se presenta en orden editorial: resumen ejecutivo, podio y detalle completo.',
      copy: 'Así el documento abre fuerte, baja a los hechos y conserva todas las tripas útiles del cierre sin perder claridad.',
      showHeader: true,
    }),
    IMPACT: Object.freeze({
      key: 'historical-impact',
      label: 'Impacto histórico',
      kicker: 'Lectura histórica',
      lead: 'Aquí se mide qué cambió realmente en el archivo global gracias a esta noche.',
      copy: 'El previo y el después se comparan sin mezclar sesiones locales, importadas o legacy, para que el giro histórico quede limpio.',
      showHeader: true,
      breakBefore: true,
    }),
    ARCHIVE: Object.freeze({
      key: 'global-archive',
      label: 'Archivo global',
      kicker: 'Cierre del documento',
      lead: 'El documento remata con la fotografía histórica completa: base global, ranking y récords.',
      copy: 'Ese cierre deja una salida más oficial, más estable y más coherente con el archivo real de la mesa.',
      showHeader: true,
      breakBefore: true,
    }),
  });

  function calcGlobalRoi(net, invested){
    const base = numOrZero(invested);
    if (Math.abs(base) <= 0.0001) return 0;
    return (numOrZero(net) / base) * 100;
  }

  function formatPercent(n){
    const x = numOrZero(n);
    try{
      const nf = new Intl.NumberFormat('es-NI', { maximumFractionDigits: 2, minimumFractionDigits: (Math.abs(x % 1) < 0.0001 ? 0 : 2) });
      return nf.format(x) + '%';
    }catch(e){
      return `${Math.round(x * 100) / 100}%`;
    }
  }

  function formatSessionDateLabel(rawDate, ts){
    const txt = safeTrim(rawDate);
    let m = txt.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${pad2(m[3])}/${pad2(m[2])}/${m[1]}`;
    m = txt.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (m) return `${m[1]}/${m[2]}/${m[3]}`;
    if (txt) return txt;
    const n = numOrZero(ts);
    if (!n) return '—';
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return '—';
    return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()}`;
  }


  function joinNamesWithY(values){
    const list = uniqStrings(values);
    if (!list.length) return '—';
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} y ${list[1]}`;
    return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
  }

  function buildPdfSessionDisplayTitle(session){
    const seqNum = (Number.isFinite(session && session.pdfSeq) && Math.floor(session.pdfSeq) >= 1) ? Math.floor(session.pdfSeq) : 0;
    return seqNum ? `Sesión ${pad3(seqNum)}` : 'Sesión sin consecutivo';
  }

  function buildPdfContinuationLabel(parts, currentIndex, total){
    const tokens = uniqStrings(Array.isArray(parts) ? parts : []);
    const idx = Math.max(1, Math.floor(numOrZero(currentIndex) || 1));
    const count = Math.max(1, Math.floor(numOrZero(total) || 1));
    if (count > 1) tokens.push(`${Math.min(idx, count)}/${count}`);
    return tokens.join(' · ') || 'Continuación';
  }

  function buildPdfContinuationNote(opts){
    const label = safeTrim(opts && opts.label) || 'Continuación';
    const copy = safeTrim(opts && opts.copy);
    return `
      <div class="print-note print-note--continuation">
        <span class="print-note-pill">${escapeHtml(label)}</span>
        ${copy ? `<span class="print-note-copy">${escapeHtml(copy)}</span>` : ''}
      </div>
    `;
  }


  function compareGlobalRanking(a, b){
    const dn = numOrZero(b && b.netTotal) - numOrZero(a && a.netTotal);
    if (Math.abs(dn) > 0.0001) return dn;
    const dr = numOrZero(b && b.roiGlobal) - numOrZero(a && a.roiGlobal);
    if (Math.abs(dr) > 0.0001) return dr;
    const dw = numOrZero(b && b.wins1) - numOrZero(a && a.wins1);
    if (dw) return dw;
    const dg = numOrZero(b && b.games) - numOrZero(a && a.games);
    if (dg) return dg;
    return String(a && a.display || '').localeCompare(String(b && b.display || ''), 'es', { sensitivity: 'base' });
  }

  function sameGlobalRankingPosition(a, b){
    if (!a || !b) return false;
    return Math.abs(numOrZero(a.netTotal) - numOrZero(b.netTotal)) <= 0.0001
      && Math.abs(numOrZero(a.roiGlobal) - numOrZero(b.roiGlobal)) <= 0.0001
      && numOrZero(a.wins1) === numOrZero(b.wins1)
      && numOrZero(a.games) === numOrZero(b.games);
  }


  function ymdToDayStartTs(ymd){
    const txt = normalizeYmdLoose(ymd);
    if (!txt) return 0;
    const m = txt.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return 0;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
    const ts = d.getTime();
    return Number.isFinite(ts) ? ts : 0;
  }

  function getSessionChronology(session){
    const s = session || {};
    const explicitDate = normalizeYmdLoose(s.date);
    const closedAt = numOrZero(s.closedAt);
    const createdAt = numOrZero(s.createdAt);
    const updatedAt = numOrZero(s.updatedAt);
    const earliestTs = minPositiveTs(closedAt, createdAt, updatedAt);
    const fallbackRevisionTs = maxTs(updatedAt, closedAt, createdAt);
    const candidates = [
      { key: 'closedAt', ts: closedAt, ymd: closedAt ? ymdFromTimestamp(closedAt) : '', weight: 30 },
      { key: 'createdAt', ts: createdAt, ymd: createdAt ? ymdFromTimestamp(createdAt) : '', weight: 20 },
      { key: 'updatedAt', ts: updatedAt, ymd: updatedAt ? ymdFromTimestamp(updatedAt) : '', weight: 10 },
    ].filter(item => item.ts > 0);

    const derivedDate = explicitDate || (earliestTs ? ymdFromTimestamp(earliestTs) : '');
    const effectiveDate = explicitDate || derivedDate || '';
    const dayTs = ymdToDayStartTs(effectiveDate) || earliestTs || fallbackRevisionTs || 0;

    const sameDayCandidate = effectiveDate
      ? candidates
        .filter(item => item.ymd === effectiveDate)
        .sort((a, b) => {
          const dw = numOrZero(b.weight) - numOrZero(a.weight);
          if (dw) return dw;
          const dt = a.ts - b.ts;
          if (Math.abs(dt) > 0.0001) return dt;
          return String(a.key).localeCompare(String(b.key), 'es', { sensitivity: 'base' });
        })[0] || null
      : null;

    const exactTs = numOrZero(sameDayCandidate && sameDayCandidate.ts);
    const anchorTs = exactTs || (dayTs ? (dayTs + (12 * 60 * 60 * 1000)) : 0) || earliestTs || fallbackRevisionTs || 0;
    const precision = exactTs ? (explicitDate ? 'date+timestamp' : 'timestamp-derived') : (effectiveDate ? 'date-only' : (fallbackRevisionTs ? 'timestamp-fallback' : 'undated'));
    const sortTs = anchorTs || fallbackRevisionTs || 0;
    const compareTs = exactTs || fallbackRevisionTs || sortTs;

    return {
      effectiveDate,
      dayTs,
      sortTs,
      compareTs,
      exactTs,
      precision,
      source: safeTrim(sameDayCandidate && sameDayCandidate.key) || (explicitDate ? 'date' : (earliestTs ? 'timestamp' : 'fallback')),
    };
  }

  function getSessionSortTs(session){
    return numOrZero(getSessionChronology(session).sortTs);
  }

  function compactRecordLabels(labels, maxItems){
    const uniq = uniqStrings(labels);
    if (!uniq.length) return '—';
    const max = Math.max(1, Math.floor(numOrZero(maxItems) || 3));
    if (uniq.length <= max) return uniq.join(' · ');
    return `${uniq.slice(0, max).join(' · ')} +${uniq.length - max} más`;
  }

  function formatRecordSessionContext(entry){
    if (!entry) return '—';
    const dateLabel = formatSessionDateLabel(entry.date, entry.ts);
    const refLabel = safeTrim(entry.sessionRef);
    if (dateLabel !== '—' && refLabel) return `${dateLabel} · ${refLabel}`;
    return refLabel || dateLabel || '—';
  }

  function formatRecordCount(value, singular, plural){
    const n = Math.max(0, Math.floor(numOrZero(value)));
    const label = (n === 1 ? singular : (plural || `${singular}s`));
    return `${n} ${label}`;
  }

  function collectRecordLeaders(list, getValue, mode){
    const safe = Array.isArray(list) ? list : [];
    const pickMin = safeTrim(mode).toLowerCase() === 'min';
    let bestValue = null;
    let holders = [];
    safe.forEach(item => {
      const value = Number(getValue ? getValue(item) : 0);
      if (!Number.isFinite(value)) return;
      if (bestValue == null){
        bestValue = value;
        holders = [item];
        return;
      }
      const delta = value - bestValue;
      if (Math.abs(delta) <= 0.0001){
        holders.push(item);
        return;
      }
      if ((pickMin && delta < -0.0001) || (!pickMin && delta > 0.0001)){
        bestValue = value;
        holders = [item];
      }
    });
    return { value: bestValue, items: holders };
  }

  function calcBestStreak(history, predicate){
    const list = (Array.isArray(history) ? history : []).slice().sort((a, b) => {
      const dt = numOrZero(a && a.ts) - numOrZero(b && b.ts);
      if (Math.abs(dt) > 0.0001) return dt;
      return String(a && a.sessionId || '').localeCompare(String(b && b.sessionId || ''), 'es', { sensitivity: 'base' });
    });

    let best = { length: 0, start: null, end: null };
    let curLength = 0;
    let curStart = null;
    let curEnd = null;

    list.forEach(item => {
      if (predicate && predicate(item)){
        if (!curLength) curStart = item;
        curLength += 1;
        curEnd = item;
        if (curLength > best.length){
          best = { length: curLength, start: curStart, end: curEnd };
        }
      } else {
        curLength = 0;
        curStart = null;
        curEnd = null;
      }
    });

    return best;
  }

  function formatStreakContextLabel(streak){
    if (!streak || !numOrZero(streak.length) || !streak.start || !streak.end) return '—';
    const startLabel = formatRecordSessionContext(streak.start);
    const endLabel = formatRecordSessionContext(streak.end);
    if (startLabel === endLabel) return startLabel;
    return `${startLabel} → ${endLabel}`;
  }

  function buildGlobalRecordItems(payload){
    const players = Array.isArray(payload && payload.players) ? payload.players : [];
    const detailed = Array.isArray(payload && payload.detailed) ? payload.detailed : [];
    const summaryRows = Array.isArray(payload && payload.summaryRows) ? payload.summaryRows : [];

    function emptyRecord(key, label, reason, eligibleNote, valueRaw){
      return {
        key,
        label,
        playerLabel: '—',
        valueLabel: 'No aplica aún',
        contextLabel: reason || 'Histórico insuficiente todavía.',
        eligibleLabel: eligibleNote || '',
        holderIds: [],
        valueRaw: (valueRaw != null ? valueRaw : null),
        isEmpty: true,
      };
    }

    function makeRecord(key, label, holders, valueLabel, contextLabel, eligibleLabel, valueRaw){
      const safeHolders = Array.isArray(holders) ? holders : [];
      if (!safeHolders.length) return emptyRecord(key, label, 'Histórico insuficiente todavía.', eligibleLabel, valueRaw);
      return {
        key,
        label,
        playerLabel: compactRecordLabels(safeHolders.map(item => safeTrim(item && item.playerLabel)), 3),
        valueLabel: valueLabel || '—',
        contextLabel: contextLabel || 'Histórico acumulado al cierre',
        eligibleLabel: eligibleLabel || '',
        holderIds: uniqStrings(safeHolders.map(item => stableEntityId(item && item.playerId)).filter(Boolean)),
        valueRaw: (valueRaw != null ? valueRaw : null),
        isEmpty: false,
      };
    }

    const maxInvestedLegacy = collectRecordLeaders(summaryRows.filter(r => numOrZero(r && r.totalInvested) > 0.0001), r => numOrZero(r && r.totalInvested), 'max');
    const maxGainSet = collectRecordLeaders(detailed.filter(r => numOrZero(r && r.net) > 0.0001), r => numOrZero(r && r.net), 'max');
    const maxLossSet = collectRecordLeaders(detailed.filter(r => numOrZero(r && r.net) < -0.0001), r => numOrZero(r && r.net), 'min');

    const legacyMaxTotalInvested = (maxInvestedLegacy.items && maxInvestedLegacy.items[0]) ? {
      date: maxInvestedLegacy.items[0].date || '',
      amount: numOrZero(maxInvestedLegacy.value),
      sessionId: maxInvestedLegacy.items[0].sessionId || '',
      sessionRef: maxInvestedLegacy.items[0].sessionRef || '',
    } : null;
    const legacyMaxGain = (maxGainSet.items && maxGainSet.items[0]) ? {
      date: maxGainSet.items[0].date || '',
      amount: numOrZero(maxGainSet.value),
      sessionId: maxGainSet.items[0].sessionId || '',
      sessionRef: maxGainSet.items[0].sessionRef || '',
      playerId: maxGainSet.items[0].playerId || '',
      player: maxGainSet.items[0].player || '',
    } : null;
    const legacyMaxLoss = (maxLossSet.items && maxLossSet.items[0]) ? {
      date: maxLossSet.items[0].date || '',
      amount: numOrZero(maxLossSet.value),
      sessionId: maxLossSet.items[0].sessionId || '',
      sessionRef: maxLossSet.items[0].sessionRef || '',
      playerId: maxLossSet.items[0].playerId || '',
      player: maxLossSet.items[0].player || '',
    } : null;

    const items = [];

    items.push(maxGainSet.items.length
      ? makeRecord('maxGainSession', 'Mayor ganancia en una sola sesión', maxGainSet.items.map(item => ({ playerLabel: item.player, playerId: item.playerId })), formatMoney(maxGainSet.value), compactRecordLabels(maxGainSet.items.map(item => formatRecordSessionContext(item)), 3), '', maxGainSet.value)
      : emptyRecord('maxGainSession', 'Mayor ganancia en una sola sesión', 'Todavía no hay ganancias positivas registradas.'));

    items.push(maxLossSet.items.length
      ? makeRecord('maxLossSession', 'Mayor pérdida en una sola sesión', maxLossSet.items.map(item => ({ playerLabel: item.player, playerId: item.playerId })), formatMoney(maxLossSet.value), compactRecordLabels(maxLossSet.items.map(item => formatRecordSessionContext(item)), 3), '', maxLossSet.value)
      : emptyRecord('maxLossSession', 'Mayor pérdida en una sola sesión', 'Todavía no hay pérdidas registradas.'));

    const winsSet = collectRecordLeaders(players.filter(row => numOrZero(row && row.wins1) > 0), row => numOrZero(row && row.wins1), 'max');
    items.push(winsSet.items.length
      ? makeRecord('mostWins', 'Más victorias históricas', winsSet.items.map(item => ({ playerLabel: item.display, playerId: item.id })), formatRecordCount(winsSet.value, 'victoria'), 'Histórico acumulado al cierre', '', winsSet.value)
      : emptyRecord('mostWins', 'Más victorias históricas', 'Aún no hay victorias históricas registradas.'));

    const gamesSet = collectRecordLeaders(players.filter(row => numOrZero(row && row.games) > 0), row => numOrZero(row && row.games), 'max');
    items.push(gamesSet.items.length
      ? makeRecord('mostGames', 'Más sesiones jugadas', gamesSet.items.map(item => ({ playerLabel: item.display, playerId: item.id })), formatRecordCount(gamesSet.value, 'sesión'), 'Histórico acumulado al cierre', '', gamesSet.value)
      : emptyRecord('mostGames', 'Más sesiones jugadas', 'Aún no hay sesiones cerradas suficientes.'));

    const rebuysSet = collectRecordLeaders(players.filter(row => numOrZero(row && row.rebuysCount) > 0), row => numOrZero(row && row.rebuysCount), 'max');
    items.push(rebuysSet.items.length
      ? makeRecord('mostRebuys', 'Más rebuys históricos', rebuysSet.items.map(item => ({ playerLabel: item.display, playerId: item.id })), formatRecordCount(rebuysSet.value, 'rebuy'), 'Histórico acumulado al cierre', '', rebuysSet.value)
      : emptyRecord('mostRebuys', 'Más rebuys históricos', 'Todavía no se registran rebuys en el histórico.'));

    const buyInsSet = collectRecordLeaders(players.filter(row => numOrZero(row && row.buyInsCount) > 0), row => numOrZero(row && row.buyInsCount), 'max');
    const buyInsEligibleNote = 'Se cuenta cada buy-in inicial registrado en una sesión válida.';
    items.push(buyInsSet.items.length
      ? makeRecord('mostBuyIns', 'Más buy-ins históricos', buyInsSet.items.map(item => ({ playerLabel: item.display, playerId: item.id })), formatRecordCount(buyInsSet.value, 'buy-in'), 'Histórico acumulado al cierre', buyInsEligibleNote, buyInsSet.value)
      : emptyRecord('mostBuyIns', 'Más buy-ins históricos', 'Todavía no hay buy-ins históricos suficientes.', buyInsEligibleNote));

    const payoutsSet = collectRecordLeaders(players.filter(row => numOrZero(row && row.payoutsTotal) > 0.0001), row => numOrZero(row && row.payoutsTotal), 'max');
    items.push(payoutsSet.items.length
      ? makeRecord('maxPayouts', 'Mayor premio acumulado', payoutsSet.items.map(item => ({ playerLabel: item.display, playerId: item.id })), formatMoney(payoutsSet.value), 'Histórico acumulado al cierre', '', payoutsSet.value)
      : emptyRecord('maxPayouts', 'Mayor premio acumulado', 'Todavía no hay cobros acumulados suficientes.'));

    const investedSet = collectRecordLeaders(players.filter(row => numOrZero(row && row.investedTotal) > 0.0001), row => numOrZero(row && row.investedTotal), 'max');
    items.push(investedSet.items.length
      ? makeRecord('maxInvested', 'Mayor inversión acumulada', investedSet.items.map(item => ({ playerLabel: item.display, playerId: item.id })), formatMoney(investedSet.value), 'Histórico acumulado al cierre', '', investedSet.value)
      : emptyRecord('maxInvested', 'Mayor inversión acumulada', 'Todavía no hay inversión acumulada suficiente.'));

    const roiEligible = players.filter(row => numOrZero(row && row.games) >= ROI_RECORD_MIN_GAMES && numOrZero(row && row.investedTotal) > 0.0001);
    const roiEligibleNote = `Elegible solo con mínimo ${ROI_RECORD_MIN_GAMES} sesiones e inversión acumulada mayor a 0.`;
    const bestRoiSet = collectRecordLeaders(roiEligible, row => numOrZero(row && row.roiGlobal), 'max');
    items.push(bestRoiSet.items.length
      ? makeRecord('bestRoi', 'Mejor ROI global', bestRoiSet.items.map(item => ({ playerLabel: item.display, playerId: item.id })), formatPercent(bestRoiSet.value), 'Histórico acumulado al cierre', roiEligibleNote, bestRoiSet.value)
      : emptyRecord('bestRoi', 'Mejor ROI global', `Nadie cumple todavía el mínimo de ${ROI_RECORD_MIN_GAMES} sesiones para competir por ROI.`, roiEligibleNote));

    const worstRoiSet = collectRecordLeaders(roiEligible, row => numOrZero(row && row.roiGlobal), 'min');
    items.push(worstRoiSet.items.length
      ? makeRecord('worstRoi', 'Peor ROI global', worstRoiSet.items.map(item => ({ playerLabel: item.display, playerId: item.id })), formatPercent(worstRoiSet.value), 'Histórico acumulado al cierre', roiEligibleNote, worstRoiSet.value)
      : emptyRecord('worstRoi', 'Peor ROI global', `Nadie cumple todavía el mínimo de ${ROI_RECORD_MIN_GAMES} sesiones para competir por ROI.`, roiEligibleNote));

    const itmSet = collectRecordLeaders(players.filter(row => numOrZero(row && row.itmCount) > 0), row => numOrZero(row && row.itmCount), 'max');
    const itmNote = 'Se cuenta cada sesión con neto positivo.';
    items.push(itmSet.items.length
      ? makeRecord('mostItm', 'Más cobros / ITM', itmSet.items.map(item => ({ playerLabel: item.display, playerId: item.id })), formatRecordCount(itmSet.value, 'cobro'), 'Histórico acumulado al cierre', itmNote, itmSet.value)
      : emptyRecord('mostItm', 'Más cobros / ITM', 'Todavía no hay cobros / ITM positivos en el histórico.', itmNote));

    const winStreakSet = collectRecordLeaders(players.filter(row => numOrZero(row && row.bestWinStreak && row.bestWinStreak.length) > 0), row => numOrZero(row && row.bestWinStreak && row.bestWinStreak.length), 'max');
    items.push(winStreakSet.items.length
      ? makeRecord('bestWinStreak', 'Mejor racha de victorias', winStreakSet.items.map(item => ({ playerLabel: item.display, playerId: item.id })), formatRecordCount(winStreakSet.value, 'victoria seguida', 'victorias seguidas'), compactRecordLabels(winStreakSet.items.map(item => formatStreakContextLabel(item.bestWinStreak)), 3), '', winStreakSet.value)
      : emptyRecord('bestWinStreak', 'Mejor racha de victorias', 'Todavía no hay rachas de victorias registradas.'));

    const itmStreakSet = collectRecordLeaders(players.filter(row => numOrZero(row && row.bestItmStreak && row.bestItmStreak.length) > 0), row => numOrZero(row && row.bestItmStreak && row.bestItmStreak.length), 'max');
    const itmStreakNote = 'Se cuenta cada sesión consecutiva con neto positivo.';
    items.push(itmStreakSet.items.length
      ? makeRecord('bestItmStreak', 'Mejor racha de cobros', itmStreakSet.items.map(item => ({ playerLabel: item.display, playerId: item.id })), formatRecordCount(itmStreakSet.value, 'cobro seguido', 'cobros seguidos'), compactRecordLabels(itmStreakSet.items.map(item => formatStreakContextLabel(item.bestItmStreak)), 3), itmStreakNote, itmStreakSet.value)
      : emptyRecord('bestItmStreak', 'Mejor racha de cobros', 'Todavía no hay rachas de cobro registradas.', itmStreakNote));

    return {
      roiMinGames: ROI_RECORD_MIN_GAMES,
      items,
      maxTotalInvested: legacyMaxTotalInvested,
      maxGain: legacyMaxGain,
      maxLoss: legacyMaxLoss,
    };
  }

  function buildPdfRecordRows(items){
    const list = Array.isArray(items) ? items : [];
    return list.map(item => {
      const contextBits = [`<div class="print-record-context">${escapeHtml(item.contextLabel || '—')}</div>`];
      if (item.eligibleLabel) contextBits.push(`<div class="print-record-note">${escapeHtml(item.eligibleLabel)}</div>`);
      return [
        `<div class="print-record-title">${escapeHtml(item.label || '—')}</div>`,
        `<div class="print-record-player${item.isEmpty ? ' is-empty' : ''}">${escapeHtml(item.playerLabel || '—')}</div>`,
        `<div class="print-record-value${item.isEmpty ? ' is-empty' : ''}">${escapeHtml(item.valueLabel || '—')}</div>`,
        contextBits.join(''),
      ];
    });
  }

  function buildPdfRankingOverview(list){
    const rows = Array.isArray(list) ? list : [];
    const leaders = rows.filter(item => Math.floor(numOrZero(item && item.rankPos)) === 1);
    const positive = rows.filter(item => numOrZero(item && item.netTotal) > 0.0001);
    const neutral = rows.filter(item => Math.abs(numOrZero(item && item.netTotal)) <= 0.0001);
    const negative = rows.filter(item => numOrZero(item && item.netTotal) < -0.0001);
    const roiEligible = rows.filter(item => numOrZero(item && item.games) >= ROI_RECORD_MIN_GAMES && numOrZero(item && item.investedTotal) > 0.0001);
    const leadLabel = leaders.length ? compactRecordLabels(leaders.map(item => item.display), 3) : '—';
    const leadNet = leaders.length ? formatMoney(numOrZero(leaders[0] && leaders[0].netTotal)) : '—';
    const podium = rows.slice(0, 3);

    const summaryCards = [
      { label: 'Jugadores rankeados', value: String(rows.length), note: rows.length === 1 ? 'Solo un perfil con histórico válido.' : 'Con historial válido al cierre.' },
      { label: leaders.length > 1 ? 'Liderato compartido' : 'Líder actual', value: leadLabel, note: leaders.length > 1 ? `${leaders.length} jugadores comparten el puesto #1.` : `Neto global líder: ${leadNet}.` },
      { label: 'Jugadores en verde', value: String(positive.length), note: `${neutral.length} neutros · ${negative.length} en rojo.` },
      { label: 'Elegibles para ROI', value: String(roiEligible.length), note: `Mínimo ${ROI_RECORD_MIN_GAMES} sesiones e inversión acumulada mayor a 0.` },
    ];

    const podiumHtml = podium.length ? `
      <div class="print-rank-podium">
        <div class="print-rank-podium-title">Podio histórico actual</div>
        <div class="print-rank-podium-grid">
          ${podium.map(item => `
            <article class="print-rank-podium-card pdf-avoid-break">
              <div class="print-rank-podium-pos">#${escapeHtml(String(item.rankPos || '—'))}</div>
              <div class="print-rank-podium-name">${escapeHtml(String(item.display || 'Sin nombre'))}</div>
              <div class="print-rank-podium-net ${getPdfNetTone(numOrZero(item.netTotal))}">${escapeHtml(formatMoney(numOrZero(item.netTotal)))}</div>
              <div class="print-rank-podium-sub">ROI ${escapeHtml(formatPercent(numOrZero(item.roiGlobal)))} · Victorias ${escapeHtml(String(numOrZero(item.wins1)))} · Sesiones ${escapeHtml(String(numOrZero(item.games)))}</div>
            </article>
          `).join('')}
        </div>
      </div>
    ` : '';

    return `
      <div class="print-archive-banner print-archive-banner--ranking">
        <div class="print-archive-banner-kicker">Archivo global</div>
        <div class="print-archive-banner-lead">El ranking global cierra el documento como fotografía oficial del estado histórico de la mesa.</div>
        <div class="print-archive-banner-copy">Lidera ${escapeHtml(leadLabel)}. ${escapeHtml(PDF_GLOBAL_RANKING_CRITERION)} Si dos jugadores empatan exactamente en esos cuatro criterios, comparten puesto global.</div>
        <div class="print-archive-banner-grid">
          ${summaryCards.map(card => `
            <div class="print-archive-banner-card">
              <div class="k">${escapeHtml(card.label)}</div>
              <div class="v">${escapeHtml(card.value)}</div>
              <div class="s">${escapeHtml(card.note)}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ${podiumHtml}
    `;
  }

  function buildPdfRecordsOverview(records){
    const rec = records || {};
    const items = Array.isArray(rec.items) ? rec.items : [];
    const findItem = (key) => items.find(item => item && item.key === key) || null;
    const highlights = [
      { label: 'Mayor ganancia', item: findItem('maxGainSession'), fallback: 'Todavía sin ganancia positiva registrada.' },
      { label: 'Mayor pérdida', item: findItem('maxLossSession'), fallback: 'Todavía sin pérdida registrada.' },
      { label: 'Más victorias', item: findItem('mostWins'), fallback: 'Aún no hay victorias registradas.' },
      { label: 'Mejor ROI global', item: findItem('bestRoi'), fallback: `Requiere mínimo ${rec.roiMinGames || ROI_RECORD_MIN_GAMES} sesiones.` },
    ];

    return `
      <div class="print-archive-banner print-archive-banner--records">
        <div class="print-archive-banner-kicker">Récords globales</div>
        <div class="print-archive-banner-lead">Las marcas históricas quedan presentadas como cierre oficial del archivo, sin recortar contexto ni elegibilidad.</div>
        <div class="print-archive-banner-copy">Empates exactos comparten récord. Para ROI global se exige mínimo ${escapeHtml(String(rec.roiMinGames || ROI_RECORD_MIN_GAMES))} sesiones e inversión acumulada mayor a 0.</div>
        <div class="print-record-summary-grid">
          ${highlights.map(entry => {
            const item = entry.item;
            const valueLabel = item ? (item.valueLabel || '—') : '—';
            const holderLabel = item ? (item.playerLabel || '—') : '—';
            const contextLabel = item ? (item.contextLabel || entry.fallback || '—') : (entry.fallback || '—');
            const emptyClass = !item || item.isEmpty ? ' is-empty' : '';
            return `
              <div class="print-record-summary-card${emptyClass}">
                <div class="k">${escapeHtml(entry.label)}</div>
                <div class="v">${escapeHtml(valueLabel)}</div>
                <div class="p">${escapeHtml(holderLabel)}</div>
                <div class="s">${escapeHtml(contextLabel)}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function buildPdfRecordsSections(records){
    const rec = records || {};
    const items = Array.isArray(rec.items) ? rec.items : [];
    if (!items.length){
      return buildPdfSection({
        title: 'Récords globales',
        subtitle: 'Fotografía histórica al momento del cierre.',
        body: `<div class="empty">Aún no hay histórico suficiente para calcular récords globales.</div>`,
        subtle: true,
      });
    }

    const byKey = new Map(items.map(item => [safeTrim(item && item.key), item]));
    const columns = [
      { label: 'Récord' },
      { label: 'Jugador / jugadores' },
      { label: 'Valor', className: 'num' },
      { label: 'Fecha / sesión / contexto' },
    ];

    const groups = [
      {
        title: 'Récords globales',
        subtitle: 'Golpes de una sola noche',
        intro: 'Picos individuales registrados en una sesión cerrada válida.',
        keys: ['maxGainSession', 'maxLossSession'],
      },
      {
        title: 'Récords globales',
        subtitle: 'Palmarés competitivo',
        intro: 'Resultados sostenidos que describen constancia y presencia en mesa.',
        keys: ['mostWins', 'mostGames', 'mostItm'],
      },
      {
        title: 'Récords globales',
        subtitle: 'Movimiento e inversión histórica',
        intro: 'Volumen acumulado de entradas, rebuys, cobros e inversión.',
        keys: ['mostRebuys', 'mostBuyIns', 'maxPayouts', 'maxInvested'],
      },
      {
        title: 'Récords globales',
        subtitle: 'Rentabilidad global',
        intro: 'Comparativo de eficiencia histórica bajo la regla oficial de elegibilidad para ROI.',
        keys: ['bestRoi', 'worstRoi'],
      },
      {
        title: 'Récords globales',
        subtitle: 'Rachas registradas',
        intro: 'Tramos consecutivos que dejaron huella dentro del archivo.',
        keys: ['bestWinStreak', 'bestItmStreak'],
      },
    ];

    return groups.map((group, idx) => {
      const groupItems = group.keys.map(key => byKey.get(key)).filter(Boolean);
      const rowSegments = chunkList(buildPdfRecordRows(groupItems), PDF_RECORD_ROWS_PER_FRAGMENT);
      const introParts = [];
      if (idx === 0) introParts.push(buildPdfRecordsOverview(rec));
      if (idx > 0){
        introParts.push(buildPdfContinuationNote({
          label: buildPdfContinuationLabel(['Archivo global', 'Récords'], idx + 1, groups.length),
          copy: 'El bloque sigue corrido dentro del mismo cierre histórico, sin cambiar elegibilidad ni criterio.',
        }));
      }
      introParts.push(`<div class="print-note print-record-group-intro">${escapeHtml(group.intro)}</div>`);
      const fragments = [buildPdfFragment(introParts.join(''), {
        className: 'print-records-fragment',
        fragment: idx === 0 ? 'records-opening-intro' : 'records-continuation-intro',
        label: group.subtitle,
      })];
      rowSegments.forEach((segment, segIdx) => {
        const segmentBody = [
          buildPdfFragmentHead({
            kicker: rowSegments.length > 1 ? `Subtramo ${segIdx + 1} de ${rowSegments.length}` : 'Tramo cerrado',
            title: rowSegments.length > 1 ? `Registros ${segIdx * PDF_RECORD_ROWS_PER_FRAGMENT + 1}–${segIdx * PDF_RECORD_ROWS_PER_FRAGMENT + segment.length}` : 'Registros del bloque',
            copy: 'Cabecera protegida y subtabla cerrada para evitar cortes a mitad de fila.',
          }),
          buildPdfInlineTable({
            columns,
            rows: segment,
            ariaLabel: `Tabla de ${group.subtitle.toLowerCase()} · tramo ${segIdx + 1}`,
          }),
        ];
        if (idx === groups.length - 1 && segIdx === rowSegments.length - 1){
          segmentBody.push(`<div class="print-record-seal">Cierre histórico del documento: ranking global y récords globales quedan congelados con el contexto vigente de esta exportación.</div>`);
        }
        fragments.push(buildPdfFragment(segmentBody.join(''), {
          className: 'print-records-fragment',
          fragment: segIdx === 0 ? 'records-table-opening' : 'records-table-continuation',
          label: `${group.subtitle} · tramo ${segIdx + 1}`,
        }));
      });
      return buildPdfSection({
        title: group.title,
        subtitle: group.subtitle,
        body: fragments.join(''),
        tight: true,
        className: idx === 0 ? 'print-section--records-major' : 'print-section--records-cont print-section--continuation',
        familyKey: `global-records-${toPdfFamilySlug(group.subtitle) || idx + 1}`,
        familyLabel: `${group.title} · ${group.subtitle}`,
        breakBefore: false,
        avoidBreak: false,
      });
    }).join('');
  }

  function buildPdfRankingSections(ranking){
    const list = Array.isArray(ranking) ? ranking : [];
    if (!list.length){
      return buildPdfSection({
        title: 'Ranking global',
        subtitle: 'Fotografía histórica al momento del cierre.',
        body: `<div class="empty">Aún no hay jugadores con historial válido para el ranking global.</div>`,
        subtle: true,
        familyKey: 'global-ranking',
        familyLabel: 'Ranking global',
      });
    }

    const rankCounts = new Map();
    list.forEach(row => {
      const key = Math.floor(numOrZero(row && row.rankPos));
      rankCounts.set(key, (rankCounts.get(key) || 0) + 1);
    });

    const chunks = chunkList(list, PDF_RANK_CARDS_PER_SECTION);
    return chunks.map((chunk, idx) => {
      const cards = chunk.map(r => {
        const net = numOrZero(r && r.netTotal);
        const netClass = Math.abs(net) < 0.0001 ? 'ok' : (net > 0 ? 'pos' : 'neg');
        const lastNet = (r && r.lastSession) ? numOrZero(r.lastSession.net) : 0;
        const lastNetClass = Math.abs(lastNet) < 0.0001 ? 'ok' : (lastNet > 0 ? 'pos' : 'neg');
        const sharedRank = (rankCounts.get(Math.floor(numOrZero(r && r.rankPos))) || 0) > 1;
        const bestLabel = (r && r.best) ? `${formatMoney(r.best.net)} · ${formatSessionDateLabel(r.best.date, r.best.ts)}` : '—';
        const worstLabel = (r && r.worst) ? `${formatMoney(r.worst.net)} · ${formatSessionDateLabel(r.worst.date, r.worst.ts)}` : '—';
        const lastLabel = (r && r.lastSession)
          ? `${escapeHtml(formatSessionDateLabel(r.lastSession.date, r.lastSession.ts))} · <span class="net ${lastNetClass}">${escapeHtml(formatMoney(lastNet))}</span>`
          : '—';
        const criteriaStats = [
          { label: 'ROI global', value: formatPercent(numOrZero(r.roiGlobal)) },
          { label: 'Victorias', value: String(numOrZero(r.wins1)) },
          { label: 'Sesiones', value: String(numOrZero(r.games)) },
          { label: 'Podios', value: String(numOrZero(r.podiums)) },
        ];
        const supportStats = [
          { label: 'Buy-ins / Rebuys', value: `${numOrZero(r.buyInsCount)} · ${numOrZero(r.rebuysCount)}` },
          { label: 'Inversión total', value: formatMoney(numOrZero(r.investedTotal)) },
          { label: 'Cobros acumulados', value: formatMoney(numOrZero(r.payoutsTotal)) },
          { label: 'Promedio neto / sesión', value: formatMoney(numOrZero(r.avgNet)) },
        ];

        return `
          <article class="print-rank-card pdf-avoid-break" data-rank="${escapeAttr(String(r.rankPos || ''))}">
            <div class="print-rank-top">
              <div class="print-rank-who">
                <div class="print-rank-pos">#${escapeHtml(String(r.rankPos || '—'))}</div>
                <div>
                  <div class="print-rank-name">${escapeHtml(String(r.display || 'Sin nombre'))}</div>
                  <div class="print-rank-sub">${sharedRank ? 'Puesto compartido por empate exacto en el criterio oficial.' : 'Puesto individual consolidado en el criterio oficial.'}</div>
                </div>
              </div>
              <div class="print-rank-balance ${netClass}">
                <div class="print-rank-balance-k">Neto global</div>
                <div class="print-rank-balance-v">${escapeHtml(formatMoney(net))}</div>
                <div class="print-rank-balance-s">Archivo acumulado al cierre</div>
              </div>
            </div>

            <div class="print-rank-grid print-rank-grid--criteria">
              ${criteriaStats.map(stat => `
                <div class="print-rank-stat print-rank-stat--criterion">
                  <span class="k">${escapeHtml(stat.label)}</span>
                  <span class="v">${escapeHtml(stat.value)}</span>
                </div>
              `).join('')}
            </div>

            <div class="print-rank-grid print-rank-grid--support">
              ${supportStats.map(stat => `
                <div class="print-rank-stat">
                  <span class="k">${escapeHtml(stat.label)}</span>
                  <span class="v">${escapeHtml(stat.value)}</span>
                </div>
              `).join('')}
            </div>

            <div class="print-rank-trail">
              <div class="print-rank-event">
                <span class="k">Mejor sesión histórica</span>
                <span class="v">${escapeHtml(bestLabel)}</span>
              </div>
              <div class="print-rank-event">
                <span class="k">Peor sesión histórica</span>
                <span class="v">${escapeHtml(worstLabel)}</span>
              </div>
              <div class="print-rank-event">
                <span class="k">Última sesión jugada</span>
                <span class="v">${lastLabel}</span>
              </div>
            </div>
          </article>
        `;
      }).join('');

      const continuation = idx === 0
        ? ''
        : buildPdfContinuationNote({
            label: buildPdfContinuationLabel(['Archivo global', 'Ranking'], idx + 1, chunks.length),
            copy: 'Mismo orden oficial, mismo criterio histórico y continuación natural de la fotografía global.',
          });

      return buildPdfSection({
        title: 'Ranking global',
        subtitle: idx === 0
          ? 'Fotografía histórica completa al momento del cierre.'
          : 'Continuación natural del mismo ranking global oficial.',
        body: buildPdfFragment(`${idx === 0 ? buildPdfRankingOverview(list) : continuation}${buildPdfFragmentHead({
          kicker: chunks.length > 1 ? `Ficha ${idx + 1} de ${chunks.length}` : 'Ficha de ranking',
          title: chunk[0] ? `${safeTrim(chunk[0].display) || 'Jugador'} · puesto ${Math.max(1, Math.floor(numOrZero(chunk[0].rankPos) || 0))}°` : 'Ficha histórica del ranking',
          copy: 'Se repite el contexto justo antes de la ficha para que el ranking continúe sin parecer un bloque nuevo accidental.',
        })}<div class="print-rank-list">${cards}</div>`, {
          className: 'print-ranking-fragment',
          fragment: idx === 0 ? 'ranking-opening' : 'ranking-continuation',
          label: `Ranking tramo ${idx + 1}`,
        }),
        className: idx === 0 ? 'print-section--ranking-major' : 'print-section--ranking-cont print-section--continuation',
        familyKey: 'global-ranking',
        familyLabel: 'Ranking global',
        avoidBreak: false,
      });
    }).join('');
  }


  function formatSignedMoney(n){
    const x = numOrZero(n);
    return `${x > 0.0001 ? '+' : ''}${formatMoney(x)}`;
  }

  function formatSignedPercent(n){
    const x = numOrZero(n);
    return `${x > 0.0001 ? '+' : ''}${formatPercent(x)}`;
  }

  function findAnalyticsPlayerRow(analytics, playerId){
    if (!analytics || !stableEntityId(playerId)) return null;
    const map = analytics.byPlayer instanceof Map ? analytics.byPlayer : null;
    if (map && map.has(playerId)) return map.get(playerId) || null;
    const ranking = Array.isArray(analytics.ranking) ? analytics.ranking : [];
    return ranking.find(row => sameStableEntity(row, playerId)) || null;
  }

  function getImpactBeforeRankLabel(rankPos){
    const n = Math.floor(numOrZero(rankPos));
    return n >= 1 ? `#${n}` : 'Sin ranking previo';
  }

  function getImpactAfterRankLabel(rankPos){
    const n = Math.floor(numOrZero(rankPos));
    return n >= 1 ? `#${n}` : 'Fuera del ranking';
  }

  function getImpactMoveMeta(beforeRank, afterRank){
    const prev = Math.floor(numOrZero(beforeRank));
    const next = Math.floor(numOrZero(afterRank));
    if (!prev && next) return { tone: 'up', label: 'Debut histórico', detail: 'Entró al ranking histórico.' };
    if (!next) return { tone: 'flat', label: 'Sin ranking', detail: 'No quedó con posición global.' };
    if (!prev && !next) return { tone: 'flat', label: 'Sin ranking', detail: 'Sin cambio visible en ranking.' };
    if (next < prev) return { tone: 'up', label: `Sube ${prev - next} puesto${(prev - next) === 1 ? '' : 's'}`, detail: `${getImpactBeforeRankLabel(prev)} → ${getImpactAfterRankLabel(next)}` };
    if (next > prev) return { tone: 'down', label: `Baja ${next - prev} puesto${(next - prev) === 1 ? '' : 's'}`, detail: `${getImpactBeforeRankLabel(prev)} → ${getImpactAfterRankLabel(next)}` };
    return { tone: 'flat', label: 'Se mantiene', detail: `${getImpactBeforeRankLabel(prev)} → ${getImpactAfterRankLabel(next)}` };
  }


  function buildHistoricalImpactContextBaseSeed(inputSessions, inputPlayers){
    const closedSessions = sortSessionsForAnalytics(inputSessions || getClosedSessions());
    const players = (Array.isArray(inputPlayers) ? inputPlayers : getPlayers())
      .map(player => ({
        id: stableEntityId(player),
        name: safeTrim(player && player.name),
        nick: safeTrim(player && player.nick),
        updatedAt: numOrZero(player && player.updatedAt),
      }))
      .filter(row => row.id)
      .sort((a, b) => String(a.id).localeCompare(String(b.id), 'es', { sensitivity: 'base' }));
    const timeline = closedSessions.map(session => {
      const chronology = getSessionChronology(session);
      return {
        id: stableEntityId(session),
        signature: sessionMergeSignature(session),
        date: normalizeYmdLoose(session && session.date),
        effectiveDate: chronology.effectiveDate,
        sortTs: chronology.sortTs,
        compareTs: chronology.compareTs,
        precision: chronology.precision,
        source: chronology.source,
        updatedAt: numOrZero(session && session.updatedAt),
        closedAt: numOrZero(session && session.closedAt),
        createdAt: numOrZero(session && session.createdAt),
        pdfSeq: Math.floor(numOrZero(session && session.pdfSeq)),
      };
    });
    return { players, timeline };
  }

  function getHistoricalImpactContextKey(session, options){
    const opts = options && typeof options === 'object' ? options : {};
    const baseSeed = opts.baseSeed || buildHistoricalImpactContextBaseSeed(opts.closedSessions, opts.players);
    const targetId = stableEntityId(session) || '';
    return `hix_${HISTORICAL_IMPACT_VERSION}_${hashTiny(canonicalJson({ targetId, baseSeed }))}`;
  }

  function isHistoricalImpactSnapshotFresh(session, snapshot, options){
    if (!session || !isPlainObject(snapshot)) return false;
    if (numOrZero(snapshot.version) !== HISTORICAL_IMPACT_VERSION) return false;
    if (!Array.isArray(snapshot.players)) return false;
    if (stableEntityId(snapshot.sessionId) !== stableEntityId(session)) return false;
    const currentKey = getHistoricalImpactContextKey(session, options);
    return safeTrim(snapshot.contextKey) === currentKey;
  }

  function getRecordItemMap(records){
    const items = Array.isArray(records && records.items) ? records.items : [];
    const out = new Map();
    items.forEach(item => {
      if (!item || !item.key) return;
      out.set(item.key, item);
    });
    return out;
  }

  function getNewRecordLabelsForPlayer(playerId, preRecords, postRecords){
    const pid = stableEntityId(playerId);
    if (!pid) return [];
    const eps = 0.0001;
    const preMap = getRecordItemMap(preRecords);
    const postItems = Array.isArray(postRecords && postRecords.items) ? postRecords.items : [];
    return uniqStrings(postItems.map(item => {
      if (!item || item.isEmpty) return '';
      const holderIds = uniqStrings(Array.isArray(item.holderIds) ? item.holderIds.map(stableEntityId).filter(Boolean) : []);
      if (!holderIds.includes(pid)) return '';
      const prev = preMap.get(item.key) || null;
      const prevHolderIds = uniqStrings(Array.isArray(prev && prev.holderIds) ? prev.holderIds.map(stableEntityId).filter(Boolean) : []);
      const wasHolder = prevHolderIds.includes(pid);
      const prevValueRaw = (prev && prev.valueRaw != null) ? Number(prev.valueRaw) : null;
      const nextValueRaw = (item.valueRaw != null) ? Number(item.valueRaw) : null;
      const valueChanged = Number.isFinite(prevValueRaw) && Number.isFinite(nextValueRaw)
        ? Math.abs(nextValueRaw - prevValueRaw) > eps
        : String(prev && prev.valueLabel || '') !== String(item.valueLabel || '');
      if (!wasHolder || valueChanged) return safeTrim(item.label);
      return '';
    }).filter(Boolean));
  }

  function getImpactMilestones(preRow, postRow, totalTrackedPlayers){
    const labels = [];
    const totalPlayers = Math.max(0, Math.floor(numOrZero(totalTrackedPlayers)));
    const beforeRank = Math.floor(numOrZero(preRow && preRow.rankPos));
    const afterRank = Math.floor(numOrZero(postRow && postRow.rankPos));
    if (!preRow && postRow) labels.push('Debutó en el ranking histórico');
    if (totalPlayers >= 3 && (!beforeRank || beforeRank > 3) && afterRank >= 1 && afterRank <= 3) labels.push('Entró por primera vez al Top 3 histórico');
    else if (totalPlayers >= 5 && (!beforeRank || beforeRank > 5) && afterRank >= 1 && afterRank <= 5) labels.push('Entró por primera vez al Top 5 histórico');
    return uniqStrings(labels);
  }

  function buildPlayerImpactNarrative(entry){
    if (!entry) return 'Sin datos de impacto histórico.';
    const bits = [];
    if (entry.recordLabels && entry.recordLabels.length){
      bits.push(`Rompió ${entry.recordLabels.length === 1 ? '1 récord global' : `${entry.recordLabels.length} récords globales`}.`);
    }
    if (entry.milestoneLabels && entry.milestoneLabels.length){
      bits.push(entry.milestoneLabels[0] + '.');
    }
    if (!bits.length){
      if (entry.moveMeta && entry.moveMeta.tone === 'up') bits.push('Mejoró su posición histórica sin abrir un récord nuevo.');
      else if (entry.moveMeta && entry.moveMeta.tone === 'down') bits.push('La sesión actualizó sus acumulados, pero perdió terreno en el ranking.');
      else bits.push('La sesión actualizó sus acumulados sin cambiar de forma fuerte su posición ni abrir récord nuevo.');
    }
    return bits.join(' ');
  }

  function buildSessionHistoricalImpactSnapshot(session, options){
    const opts = options && typeof options === 'object' ? options : {};
    const targetId = stableEntityId(session);
    const reportName = makeReportNameResolver(session);
    const ordered = sortSessionsForAnalytics(opts.closedSessions || getClosedSessions());
    const contextKey = getHistoricalImpactContextKey(session, {
      closedSessions: ordered,
      players: opts.players,
      baseSeed: opts.baseSeed,
    });
    const idx = ordered.findIndex(item => sameStableEntity(item, targetId));
    if (idx < 0){
      return {
        version: HISTORICAL_IMPACT_VERSION,
        contextKey,
        sessionId: targetId || '',
        sessionRef: pdfSessionReferenceLabel(session),
        summary: {
          participants: 0,
          movedUp: 0,
          movedDown: 0,
          unchanged: 0,
          debuts: 0,
          recordBreakers: 0,
          recordLabelsTotal: 0,
        },
        players: [],
        computedAt: Date.now(),
      };
    }

    const target = ordered[idx];
    const preAnalytics = computeAnalyticsFromSessions(ordered.slice(0, idx));
    const postAnalytics = computeAnalyticsFromSessions(ordered.slice(0, idx + 1));
    const an = analyzeSession(target);
    const players = an.rows.map(row => {
      const preRow = findAnalyticsPlayerRow(preAnalytics, row.id);
      const postRow = findAnalyticsPlayerRow(postAnalytics, row.id);
      const beforeRank = Math.floor(numOrZero(preRow && preRow.rankPos));
      const afterRank = Math.floor(numOrZero(postRow && postRow.rankPos));
      const moveMeta = getImpactMoveMeta(beforeRank, afterRank);
      const netBefore = numOrZero(preRow && preRow.netTotal);
      const netAfter = numOrZero(postRow && postRow.netTotal);
      const roiBefore = numOrZero(preRow && preRow.roiGlobal);
      const roiAfter = numOrZero(postRow && postRow.roiGlobal);
      const recordLabels = getNewRecordLabelsForPlayer(row.id, preAnalytics.records, postAnalytics.records);
      const milestoneLabels = getImpactMilestones(preRow, postRow, postAnalytics && postAnalytics.ranking ? postAnalytics.ranking.length : 0);
      const entry = {
        id: row.id,
        display: reportName(row.id, row.display),
        sessionPos: row.pos,
        sessionNet: row.net,
        beforeRank,
        afterRank,
        beforeRankLabel: getImpactBeforeRankLabel(beforeRank),
        afterRankLabel: getImpactAfterRankLabel(afterRank),
        moveMeta,
        netBefore,
        netAfter,
        netDelta: netAfter - netBefore,
        roiBefore,
        roiAfter,
        roiDelta: roiAfter - roiBefore,
        recordLabels,
        milestoneLabels,
      };
      entry.narrative = buildPlayerImpactNarrative(entry);
      return entry;
    }).sort((a, b) => {
      const dp = numOrZero(a.sessionPos) - numOrZero(b.sessionPos);
      if (dp) return dp;
      const dr = numOrZero(a.afterRank) - numOrZero(b.afterRank);
      if (dr) return dr;
      return String(a.display || '').localeCompare(String(b.display || ''), 'es', { sensitivity: 'base' });
    });

    return {
      version: HISTORICAL_IMPACT_VERSION,
      contextKey,
      sessionId: stableEntityId(target) || '',
      sessionRef: pdfSessionReferenceLabel(target),
      summary: {
        participants: players.length,
        movedUp: players.filter(item => item.moveMeta && item.moveMeta.tone === 'up' && item.beforeRank).length,
        movedDown: players.filter(item => item.moveMeta && item.moveMeta.tone === 'down').length,
        unchanged: players.filter(item => item.moveMeta && item.moveMeta.tone === 'flat').length,
        debuts: players.filter(item => !item.beforeRank && item.afterRank).length,
        recordBreakers: players.filter(item => item.recordLabels && item.recordLabels.length).length,
        recordLabelsTotal: players.reduce((acc, item) => acc + (Array.isArray(item.recordLabels) ? item.recordLabels.length : 0), 0),
      },
      players,
      computedAt: Date.now(),
    };
  }

  function resolveSessionHistoricalImpact(session, options){
    const opts = options && typeof options === 'object' ? options : {};
    const stored = session && session.historicalImpact;
    if (isHistoricalImpactSnapshotFresh(session, stored, opts)) return stored;
    const rebuilt = buildSessionHistoricalImpactSnapshot(session, opts);
    if (session && typeof session === 'object' && opts.persist){
      session.historicalImpact = rebuilt;
      try{ saveSession(session); }catch(e){}
    }
    return rebuilt;
  }

  function buildPdfImpactSummaryLead(summary, players){
    const movedUp = numOrZero(summary && summary.movedUp);
    const movedDown = numOrZero(summary && summary.movedDown);
    const debuts = numOrZero(summary && summary.debuts);
    const recordBreakers = numOrZero(summary && summary.recordBreakers);
    const topEntries = (Array.isArray(players) ? players : []).filter(item => (Array.isArray(item && item.milestoneLabels) ? item.milestoneLabels : []).some(label => /Top\s*[35]/i.test(String(label || '')))).length;
    const bits = [];
    if (movedUp || movedDown) bits.push(`${movedUp} subidas y ${movedDown} bajadas reales en el ranking.`);
    if (debuts) bits.push(`${debuts} debut${debuts === 1 ? '' : 's'} en la historia registrada.`);
    if (recordBreakers) bits.push(`${recordBreakers} jugador${recordBreakers === 1 ? '' : 'es'} abrió récord o rompió marca.`);
    if (topEntries) bits.push(`${topEntries} entrada${topEntries === 1 ? '' : 's'} nueva${topEntries === 1 ? '' : 's'} al Top 3 o Top 5.`);
    if (!bits.length) bits.push('La sesión ajustó acumulados sin provocar un giro histórico fuerte.');
    return bits.join(' ');
  }

  function buildPdfImpactSections(impact){
    const data = impact || {};
    const players = Array.isArray(data.players) ? data.players : [];
    if (!players.length){
      return buildPdfSection({
        title: 'Impacto de esta Sesión',
        subtitle: 'Comparación del histórico inmediatamente antes y después del cierre.',
        body: `<div class="empty">Todavía no hay suficiente histórico para mostrar impacto comparativo de esta sesión.</div>`,
        subtle: true,
        className: 'print-section--impact-major',
        familyKey: 'historical-impact-summary',
        familyLabel: 'Impacto de esta Sesión · resumen',
      });
    }

    const summary = data.summary || {};
    const topEntries = players.filter(item => (Array.isArray(item && item.milestoneLabels) ? item.milestoneLabels : []).some(label => /Top\s*[35]/i.test(String(label || '')))).length;
    const noExtraMilestone = players.filter(item => !(Array.isArray(item && item.recordLabels) && item.recordLabels.length) && !(Array.isArray(item && item.milestoneLabels) && item.milestoneLabels.length)).length;
    const summaryLead = buildPdfImpactSummaryLead(summary, players);
    const summaryHtml = buildPdfFragment(`
      <div class="print-impact-summary">
        <div class="print-impact-summary-top">
          <div class="print-impact-summary-kicker">Puente entre la noche y la historia</div>
          <div class="print-impact-summary-lead">${escapeHtml(summaryLead)}</div>
          <div class="print-impact-summary-copy">Se compara el tablero histórico justo antes del cierre contra el tablero que quedó inmediatamente después. Así el previo → nuevo se mantiene limpio, incluso con sesiones locales, importadas o legacy.</div>
        </div>
        <div class="print-impact-summary-grid">
          <article class="print-impact-summary-card">
            <div class="k">Participantes analizados</div>
            <div class="v">${escapeHtml(String(numOrZero(summary.participants)))}</div>
            <div class="s">Lectura histórica individual de toda la mesa cerrada.</div>
          </article>
          <article class="print-impact-summary-card">
            <div class="k">Balance de movimiento</div>
            <div class="v">${escapeHtml(String(numOrZero(summary.movedUp)))} ↑ · ${escapeHtml(String(numOrZero(summary.movedDown)))} ↓</div>
            <div class="s">${escapeHtml(String(numOrZero(summary.debuts)))} debuts · ${escapeHtml(String(numOrZero(summary.unchanged)))} sin giro fuerte.</div>
          </article>
          <article class="print-impact-summary-card">
            <div class="k">Récords y aperturas</div>
            <div class="v">${escapeHtml(String(numOrZero(summary.recordLabelsTotal)))}</div>
            <div class="s">${escapeHtml(String(numOrZero(summary.recordBreakers)))} jugadores activaron récord nuevo.</div>
          </article>
          <article class="print-impact-summary-card">
            <div class="k">Otros giros relevantes</div>
            <div class="v">${escapeHtml(String(topEntries))} entrada${topEntries === 1 ? '' : 's'}</div>
            <div class="s">Top 3 / Top 5 tocados · ${escapeHtml(String(noExtraMilestone))} sin hito extra.</div>
          </article>
        </div>
      </div>
    `, { className: 'print-impact-fragment', fragment: 'impact-summary' });

    const renderImpactCard = (item) => {
      const sessionNet = numOrZero(item.sessionNet);
      const sessionNetClass = Math.abs(sessionNet) < 0.0001 ? 'ok' : (sessionNet > 0 ? 'pos' : 'neg');
      const deltaNetClass = Math.abs(numOrZero(item.netDelta)) < 0.0001 ? 'ok' : (numOrZero(item.netDelta) > 0 ? 'pos' : 'neg');
      const deltaRoiClass = Math.abs(numOrZero(item.roiDelta)) < 0.0001 ? 'ok' : (numOrZero(item.roiDelta) > 0 ? 'pos' : 'neg');
      const tags = [];
      (Array.isArray(item.recordLabels) ? item.recordLabels : []).forEach(label => tags.push({ tone: 'gold', text: `Récord: ${label}` }));
      (Array.isArray(item.milestoneLabels) ? item.milestoneLabels : []).forEach(label => tags.push({ tone: 'blue', text: label }));
      if (!tags.length) tags.push({ tone: 'muted', text: 'Sin hito extra en esta sesión' });
      const tagsHtml = tags.map(tag => `<span class="print-impact-tag ${escapeAttr(tag.tone)}">${escapeHtml(tag.text)}</span>`).join('');
      return `
        <article class="print-impact-card pdf-avoid-break">
          <div class="print-impact-top">
            <div class="print-impact-who">
              <div class="print-impact-name">${escapeHtml(String(item.display || 'Sin nombre'))}</div>
              <div class="print-impact-sub">Terminó ${escapeHtml(String(numOrZero(item.sessionPos) || '—'))}° en la sesión · Resultado <span class="net ${sessionNetClass}">${escapeHtml(formatMoney(sessionNet))}</span></div>
            </div>
            <div class="print-impact-move ${escapeAttr(item.moveMeta && item.moveMeta.tone || 'flat')}">
              <div class="print-impact-move-k">Movimiento histórico</div>
              <div class="print-impact-move-v">${escapeHtml(item.beforeRankLabel || '—')} → ${escapeHtml(item.afterRankLabel || '—')}</div>
              <div class="print-impact-move-s">${escapeHtml(item.moveMeta && item.moveMeta.label || 'Sin cambio')}</div>
            </div>
          </div>
          <div class="print-impact-grid">
            <div class="print-impact-stat">
              <span class="k">Puesto global</span>
              <span class="v">${escapeHtml(item.beforeRankLabel || '—')} → ${escapeHtml(item.afterRankLabel || '—')}</span>
              <span class="sub">${escapeHtml(item.moveMeta && item.moveMeta.detail || 'Sin variación visible.')}</span>
            </div>
            <div class="print-impact-stat">
              <span class="k">Neto global</span>
              <span class="v">${escapeHtml(formatMoney(numOrZero(item.netBefore)))} → ${escapeHtml(formatMoney(numOrZero(item.netAfter)))}</span>
              <span class="sub delta ${deltaNetClass}">${escapeHtml(formatSignedMoney(numOrZero(item.netDelta)))}</span>
            </div>
            <div class="print-impact-stat">
              <span class="k">ROI global</span>
              <span class="v">${escapeHtml(formatPercent(numOrZero(item.roiBefore)))} → ${escapeHtml(formatPercent(numOrZero(item.roiAfter)))}</span>
              <span class="sub delta ${deltaRoiClass}">${escapeHtml(formatSignedPercent(numOrZero(item.roiDelta)))}</span>
            </div>
          </div>
          <div class="print-impact-narrative"><span class="label">Lectura histórica:</span> ${escapeHtml(item.narrative || 'La sesión actualizó sus acumulados.')}</div>
          <div class="print-impact-tags">${tagsHtml}</div>
        </article>
      `;
    };

    const sections = [buildPdfSection({
      title: 'Impacto de esta Sesión',
      subtitle: 'Qué cambió en la historia general de la mesa gracias a este cierre.',
      body: summaryHtml,
      className: 'print-section--impact-major',
      familyKey: 'historical-impact-summary',
      familyLabel: 'Impacto de esta Sesión · resumen',
      avoidBreak: false,
    })];

    const impactChunks = chunkList(players, PDF_IMPACT_CARDS_PER_SECTION);
    impactChunks.forEach((chunk, idx) => {
      const continuation = idx === 0
        ? '<div class="print-note">Cada ficha histórica conserva el mismo orden editorial del reporte y agrupa a los jugadores en tramos para que la lectura impresa respire mejor.</div>'
        : buildPdfContinuationNote({
            label: buildPdfContinuationLabel(['Impacto histórico'], idx + 1, impactChunks.length),
            copy: 'Sigue la misma lectura histórica individual, con el mismo previo → nuevo y sin cambiar criterio comparativo.',
          });
      sections.push(buildPdfSection({
        title: 'Impacto de esta Sesión',
        subtitle: idx === 0
          ? 'Lectura histórica individual de toda la mesa cerrada.'
          : 'Continuación natural de la lectura histórica individual, con el mismo previo → nuevo.',
        body: buildPdfFragment(`${continuation}${buildPdfFragmentHead({
          kicker: impactChunks.length > 1 ? `Ficha ${idx + 1} de ${impactChunks.length}` : 'Ficha histórica',
          title: chunk[0] ? `${safeTrim(chunk[0].display) || 'Jugador'} · sesión ${Math.max(1, Math.floor(numOrZero(chunk[0].sessionPos) || 0))}°` : 'Ficha histórica individual',
          copy: 'Se repite el contexto mínimo para que el bloque continúe entre páginas sin sentirse cortado ni reiniciado.',
        })}<div class="print-impact-list">${chunk.map(renderImpactCard).join('')}</div>`, {
          className: 'print-impact-fragment',
          fragment: idx === 0 ? 'impact-cards-opening' : 'impact-cards-continuation',
          label: `Impacto tramo ${idx + 1}`,
        }),
        className: 'print-section--impact-cont print-section--continuation',
        familyKey: 'historical-impact-cards',
        familyLabel: 'Impacto de esta Sesión',
        avoidBreak: false,
      }));
    });

    return sections.join('');
  }

  function getPdfGlobalBaseData(session, analytics){
    const s = session || {};
    const currentAnalytics = analytics || computeAnalytics();
    const closedSessions = getClosedSessions();
    const registeredPlayers = getPlayers();
    const trackedPlayersTotal = Math.max(numOrZero(currentAnalytics && currentAnalytics.ranking ? currentAnalytics.ranking.length : 0), numOrZero(registeredPlayers.length));
    const exportedAt = Date.now();
    const closedAt = numOrZero(s.closedAt || s.updatedAt || s.createdAt);
    return {
      exportedAt,
      closedAt,
      sessionRef: pdfSessionReferenceLabel(s),
      totalClosedSessions: closedSessions.length,
      totalTrackedPlayers: trackedPlayersTotal,
      rankingCriterion: PDF_GLOBAL_RANKING_CRITERION,
      roiMinGames: ROI_RECORD_MIN_GAMES,
      rankingTieNote: 'Empates exactos comparten puesto en ranking y récords globales.',
    };
  }


  function resolvePdfSessionSummary(session, analysis, reportName){
    const s = session || {};
    const an = analysis || {};
    const sum = an.summary || {};
    const rows = Array.isArray(an.rows) ? an.rows.slice() : [];
    const eps = 0.0001;
    const resolveName = typeof reportName === 'function'
      ? reportName
      : ((id, display) => safeTrim(display) || safeTrim(id) || '—');

    const winners = rows.filter(r => numOrZero(r && r.pos) === 1).map(r => ({
      id: r.id,
      display: resolveName(r.id, r.display),
      net: numOrZero(r && r.net),
      chips: numOrZero(r && r.chips),
      invested: numOrZero(r && r.invested),
      pos: Math.floor(numOrZero(r && r.pos)),
    }));
    const winnersLabel = winners.length ? joinNamesWithY(winners.map(r => r.display)) : '—';

    const zeroChips = rows.filter(r => Math.abs(numOrZero(r && r.chips)) <= eps);
    let losers = [];
    if (zeroChips.length){
      losers = zeroChips;
    } else if (rows.length){
      const minNet = rows.reduce((minValue, row) => Math.min(minValue, numOrZero(row && row.net)), Infinity);
      losers = rows.filter(r => Math.abs(numOrZero(r && r.net) - minNet) <= eps);
    }
    const losersLabel = losers.length ? joinNamesWithY(losers.map(r => resolveName(r.id, r.display))) : '—';
    const lowestNet = losers.length ? numOrZero(losers[0] && losers[0].net) : 0;

    const playerOfDayPool = rows.length ? rows.filter(r => Math.abs(numOrZero(r && r.net) - numOrZero(rows[0] && rows[0].net)) <= eps) : [];
    const playerOfDayCandidates = playerOfDayPool.map(r => ({
      id: r.id,
      display: resolveName(r.id, r.display),
      net: numOrZero(r && r.net),
      chips: numOrZero(r && r.chips),
      invested: numOrZero(r && r.invested),
      pos: Math.floor(numOrZero(r && r.pos)),
    }));
    const playerOfDayLabel = playerOfDayCandidates.length ? joinNamesWithY(playerOfDayCandidates.map(r => r.display)) : '—';
    const playerOfDayPrimary = playerOfDayCandidates[0] || winners[0] || null;
    const playerOfDay = {
      id: stableEntityId(playerOfDayPrimary),
      display: safeTrim(playerOfDayPrimary && playerOfDayPrimary.display) || '—',
      net: numOrZero(playerOfDayPrimary && playerOfDayPrimary.net),
      chips: numOrZero(playerOfDayPrimary && playerOfDayPrimary.chips),
      invested: numOrZero(playerOfDayPrimary && playerOfDayPrimary.invested),
      candidates: playerOfDayCandidates,
      label: playerOfDayLabel,
      isTie: playerOfDayCandidates.length > 1,
      tieNote: playerOfDayCandidates.length > 1 ? 'Empate técnico en la mayor ganancia; el reconocimiento se comparte sin romper el cierre.' : '',
      source: playerOfDayCandidates.length ? 'max-gain' : (winners.length ? 'winner-fallback' : 'safe-fallback'),
    };

    const rebuysCount = rows.reduce((acc, row) => acc + Math.max(0, Math.floor(numOrZero(row && row.rebuysCount))), 0);
    const rebuysTotal = rows.reduce((acc, row) => acc + numOrZero(row && row.rebuysTotal), 0);
    const closedTs = numOrZero(s.closedAt || s.updatedAt || s.createdAt) || Date.now();
    const closedDate = new Date(closedTs);
    const closeTime = `${pad2(closedDate.getHours())}:${pad2(closedDate.getMinutes())}`;
    const sessionDateLabel = formatSessionDateLabel(s.date, closedTs);
    const sessionTitle = buildPdfSessionDisplayTitle(s);

    return {
      session: s,
      summary: sum,
      rows,
      winners,
      losers,
      lowestNet,
      playerOfDay,
      sessionTitle,
      sessionDateLabel,
      sessionRef: pdfSessionReferenceLabel(s),
      winnersLabel,
      losersLabel,
      rebuysCount,
      rebuysTotal,
      closedTs,
      closeTime,
      closeDateTime: formatDateTimeForPdf(closedTs),
    };
  }

  function getPdfNetTone(value){
    const net = numOrZero(value);
    return Math.abs(net) < 0.0001 ? 'ok' : (net > 0 ? 'pos' : 'neg');
  }

  function buildPdfNetValue(value, signed){
    const tone = getPdfNetTone(value);
    return `<span class="net ${tone}">${escapeHtml(signed ? formatSignedMoney(numOrZero(value)) : formatMoney(numOrZero(value)))}</span>`;
  }

  function formatPdfRebuyCell(row){
    const count = Math.max(0, Math.floor(numOrZero(row && row.rebuysCount)));
    const total = numOrZero(row && row.rebuysTotal);
    if (!count) return '0';
    return `${count} · ${formatMoney(total)}`;
  }

  function buildPdfOpeningChronicle(summaryData){
    const data = summaryData || {};
    const sum = data.summary || {};
    const pod = data.playerOfDay || {};
    const maxGainLabel = formatMoney(numOrZero(pod.net));
    const playersLabel = formatRecordCount(sum.playersCount, 'jugador');
    const rebuysText = numOrZero(data.rebuysCount) > 0
      ? ` Hubo ${formatRecordCount(data.rebuysCount, 'rebuy')} por ${formatMoney(data.rebuysTotal)}.`
      : '';
    const closeText = safeTrim(data.closeTime) && safeTrim(data.closeTime) !== '—'
      ? ` El cierre quedó registrado a las ${data.closeTime}.`
      : '';
    const leadText = pod.isTie
      ? `${pod.label || 'La mesa'} compartieron la mayor ganancia del cierre con ${maxGainLabel} cada uno.`
      : `${pod.display || 'La mesa'} firmó la mayor ganancia del cierre con ${maxGainLabel}.`;
    return `La ${String(data.sessionTitle || 'sesión').toLowerCase()} del ${data.sessionDateLabel || 'día registrado'} quedó encabezada por ${leadText} La mesa movió ${formatMoney(sum.totalInvested)} entre ${playersLabel}.${rebuysText}${closeText}`;
  }

  function buildPdfPremiumOpeningSection(summaryData){
    const data = summaryData || {};
    const s = data.session || {};
    const sum = data.summary || {};
    const winners = Array.isArray(data.winners) ? data.winners : [];
    const winnerNet = winners.length ? numOrZero(winners[0].net) : 0;
    const pod = data.playerOfDay || {};
    const chronicle = buildPdfOpeningChronicle(data);
    const winnerNetClass = getPdfNetTone(winnerNet);
    const podNetClass = getPdfNetTone(numOrZero(pod.net));
    const stats = [
      { label: 'Fecha de la sesión', value: data.sessionDateLabel || '—' },
      { label: 'Cierre registrado', value: data.closeDateTime || '—' },
      { label: 'Jugadores', value: String(sum.playersCount != null ? sum.playersCount : '—') },
      { label: 'Mesa movida', value: formatMoney(sum.totalInvested) },
      { label: 'Rebuys', value: `${numOrZero(data.rebuysCount)} · ${formatMoney(data.rebuysTotal)}` },
      { label: 'Total en fichas', value: formatMoney(sum.totalChipsValue) },
    ];

    return `
      <section class="print-opening pdf-avoid-break" aria-label="Apertura premium del PDF">
        <div class="print-opening-shell">
          <div class="print-opening-top">
            <div class="print-opening-headcopy">
              <div class="print-opening-kicker">Cierre oficial de sesión</div>
              <div class="print-opening-title">${escapeHtml(data.sessionTitle || 'Sesión')}</div>
              <div class="print-opening-sub">${escapeHtml(data.sessionRef || pdfSessionReferenceLabel(s))}</div>
            </div>
            <div class="print-opening-stamp">
              <div class="print-opening-stamp-k">Documento</div>
              <div class="print-opening-stamp-v">Pokerito PDF</div>
            </div>
          </div>

          <div class="print-opening-grid">
            <article class="print-opening-card print-opening-card--hero">
              <div class="print-opening-card-k">Ganador</div>
              <div class="print-opening-card-v">${escapeHtml(data.winnersLabel || '—')}</div>
              <div class="print-opening-card-s ${winnerNetClass}">Resultado neto <span class="net ${winnerNetClass}">${escapeHtml(formatMoney(winnerNet))}</span>${winners.length > 1 ? ' · empate en 1er lugar' : ''}</div>
            </article>

            <article class="print-opening-card">
              <div class="print-opening-card-k">Jugador del día</div>
              <div class="print-opening-card-v">${escapeHtml((pod.isTie ? pod.label : pod.display) || '—')}</div>
              <div class="print-opening-card-s ${podNetClass}">${pod.isTie ? 'Mayor ganancia compartida' : 'Mayor ganancia'} <span class="net ${podNetClass}">${escapeHtml(formatMoney(numOrZero(pod.net)))}</span></div>
              ${pod.tieNote ? `<div class="print-opening-card-note">${escapeHtml(pod.tieNote)}</div>` : ''}
            </article>

            <article class="print-opening-card print-opening-card--chronicle">
              <div class="print-opening-card-k">Crónica breve</div>
              <div class="print-opening-chronicle">${escapeHtml(chronicle)}</div>
            </article>
          </div>

          <div class="print-opening-stats">
            ${stats.map(item => `
              <div class="print-opening-stat">
                <div class="print-opening-stat-k">${escapeHtml(item.label)}</div>
                <div class="print-opening-stat-v">${escapeHtml(item.value)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
    `;
  }

  function buildPdfSessionExecutiveSection(summaryData){
    const data = summaryData || {};
    const sum = data.summary || {};
    const winners = Array.isArray(data.winners) ? data.winners : [];
    const winnerNet = winners.length ? numOrZero(winners[0].net) : 0;
    const delta = numOrZero(sum.delta);
    const losingTone = getPdfNetTone(numOrZero(data.lowestNet));
    const stats = [
      { label: 'Total jugado', value: formatMoney(sum.totalInvested) },
      { label: 'Total de fichas', value: formatMoney(sum.totalChipsValue) },
      { label: 'Delta de la sesión', valueHtml: buildPdfNetValue(delta, true), tone: getPdfNetTone(delta) },
      { label: 'Cantidad de jugadores', value: String(sum.playersCount != null ? sum.playersCount : '—') },
      { label: 'Ganador', value: data.winnersLabel || '—' },
      { label: 'Perdedores', value: data.losersLabel || '—' },
      { label: 'Rebuys', value: `${numOrZero(data.rebuysCount)} · ${formatMoney(data.rebuysTotal)}` },
      { label: 'Hora de cierre', value: data.closeTime || '—' },
    ];

    const body = `
      <div class="print-executive-shell">
        <div class="print-executive-leads">
          <article class="print-executive-card print-executive-card--hero">
            <div class="print-executive-k">Ganador oficial</div>
            <div class="print-executive-v">${escapeHtml(data.winnersLabel || '—')}</div>
            <div class="print-executive-s">Neto final ${buildPdfNetValue(winnerNet, true)}${winners.length > 1 ? ' · empate técnico en la cima' : ''}</div>
          </article>

          <article class="print-executive-card">
            <div class="print-executive-k">Perdedores del cierre</div>
            <div class="print-executive-v">${escapeHtml(data.losersLabel || '—')}</div>
            <div class="print-executive-s ${losingTone}">Menor neto ${buildPdfNetValue(numOrZero(data.lowestNet), true)}</div>
          </article>

          <article class="print-executive-card">
            <div class="print-executive-k">Balance de la mesa</div>
            <div class="print-executive-v">${buildPdfNetValue(delta, true)}</div>
            <div class="print-executive-s">Diferencia entre el total jugado y el valor final en fichas.</div>
          </article>
        </div>

        <div class="print-executive-grid">
          ${stats.map(item => `
            <div class="print-executive-stat${item.tone ? ` ${escapeAttr(item.tone)}` : ''}">
              <div class="print-executive-stat-k">${escapeHtml(item.label)}</div>
              <div class="print-executive-stat-v">${item.valueHtml || escapeHtml(String(item.value != null ? item.value : '—'))}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    return buildPdfSection({
      title: 'Resumen ejecutivo',
      subtitle: 'La noche en una sola mirada: contexto, balance y piezas clave antes del podio.',
      body,
      className: 'print-section--session-executive',
      familyKey: 'session-executive',
      familyLabel: 'Resumen ejecutivo',
      avoidBreak: true,
    });
  }

  function buildPdfSessionPodium(summaryData){
    const rows = Array.isArray(summaryData && summaryData.rows) ? summaryData.rows : [];
    const resolveName = makeReportNameResolver(summaryData && summaryData.session);
    const eps = 0.0001;
    const groups = [];
    rows.forEach(row => {
      const net = numOrZero(row && row.net);
      const current = groups[groups.length - 1];
      const item = {
        id: stableEntityId(row),
        display: resolveName(row && row.id, row && row.display),
        net,
        chips: numOrZero(row && row.chips),
        invested: numOrZero(row && row.invested),
        pos: Math.floor(numOrZero(row && row.pos)),
      };
      if (!current || Math.abs(net - numOrZero(current.net)) > eps){
        groups.push({ net, players: [item], officialPos: item.pos || (groups.length + 1) });
      } else {
        current.players.push(item);
      }
    });

    return [0,1,2].map(idx => {
      const group = groups[idx] || null;
      if (!group){
        return {
          place: idx + 1,
          empty: true,
          label: 'Sin lugar definido',
          net: 0,
          note: 'No hubo suficientes resultados distintos para ocupar este escalón.',
          officialPos: idx + 1,
        };
      }
      const players = Array.isArray(group.players) ? group.players : [];
      const label = joinNamesWithY(players.map(player => player.display));
      const invested = players.reduce((acc, player) => acc + numOrZero(player && player.invested), 0);
      const chips = players.reduce((acc, player) => acc + numOrZero(player && player.chips), 0);
      const note = players.length > 1
        ? `Empate técnico por neto final entre ${formatRecordCount(players.length, 'jugador')}.`
        : `Fichas finales ${formatMoney(chips)} · Jugado ${formatMoney(invested)}.`;
      return {
        place: idx + 1,
        empty: false,
        label,
        net: numOrZero(group.net),
        players,
        invested,
        chips,
        note,
        officialPos: Math.max(1, Math.floor(numOrZero(group.officialPos) || (idx + 1))),
      };
    });
  }

  function buildPdfSessionPodiumSection(summaryData){
    const podium = buildPdfSessionPodium(summaryData);
    const body = `
      <div class="print-podium-grid">
        ${podium.map(item => {
          const tone = getPdfNetTone(item.net);
          const officialNote = item.empty
            ? ''
            : (item.officialPos !== item.place ? ` · Puesto oficial ${item.officialPos}°` : '');
          return `
            <article class="print-podium-card print-podium-card--${item.place}${item.empty ? ' is-empty' : ''}">
              <div class="print-podium-place">${escapeHtml(String(item.place))}°</div>
              <div class="print-podium-k">Podio por neto final</div>
              <div class="print-podium-name">${escapeHtml(item.label || '—')}</div>
              <div class="print-podium-net ${tone}">${buildPdfNetValue(item.net, true)}</div>
              <div class="print-podium-sub">${escapeHtml(item.note || '—')}${escapeHtml(officialNote)}</div>
            </article>
          `;
        }).join('')}
      </div>
    `;

    return buildPdfSection({
      title: 'Podio de la sesión',
      subtitle: 'Escalera oficial del cierre ordenada por neto final.',
      body,
      className: 'print-section--session-podium',
      familyKey: 'session-podium',
      familyLabel: 'Podio de la sesión',
      avoidBreak: true,
    });
  }

  function buildPdfSessionPlayerRows(rows, reportName){
    const list = Array.isArray(rows) ? rows : [];
    const resolveName = typeof reportName === 'function'
      ? reportName
      : ((id, display) => safeTrim(display) || safeTrim(id) || '—');
    return list.map(row => {
      const invested = numOrZero(row && row.invested);
      const chips = numOrZero(row && row.chips);
      const net = numOrZero(row && row.net);
      const gained = Math.max(0, net);
      const lost = Math.max(0, -net);
      return {
        id: stableEntityId(row),
        pos: Math.max(1, Math.floor(numOrZero(row && row.pos) || 0)),
        display: String(resolveName(row && row.id, row && row.display)),
        invested,
        chips,
        net,
        gained,
        lost,
        rebuysCount: Math.max(0, Math.floor(numOrZero(row && row.rebuysCount))),
        rebuysTotal: numOrZero(row && row.rebuysTotal),
        netTone: getPdfNetTone(net),
      };
    });
  }

  function buildPdfPlayerDetailSections(playerRows){
    const rows = Array.isArray(playerRows) ? playerRows : [];
    const chunks = chunkList(rows, PDF_RESULTS_ROWS_PER_SECTION);
    const columns = [
      { label: 'Pos.', className: 'num' },
      { label: 'Jugador' },
      { label: 'Jugado', className: 'num' },
      { label: 'Fichas finales', className: 'num' },
      { label: 'Neto final', className: 'num' },
      { label: 'Ganado', className: 'num' },
      { label: 'Perdido', className: 'num' },
      { label: 'Rebuys', className: 'num' },
    ];

    const renderRows = (chunk) => {
      if (!chunk.length) return [[ '—', '—', '—', '—', '—', '—', '—', '—' ]];
      return chunk.map(row => {
        const rowClass = ['print-results-row', `tone-${row.netTone}`];
        if (row.pos === 1) rowClass.push('is-winner');
        if (row.lost > 0.0001 && row.pos >= 3) rowClass.push('is-loss');
        const rowClassName = rowClass.join(' ');
        return [
          `<div class="${rowClassName} print-results-rowcell num">${escapeHtml(String(row.pos))}°</div>`,
          `<div class="${rowClassName} print-results-rowcell"><div class="print-results-player"><span class="print-results-name">${escapeHtml(row.display)}</span>${row.pos <= 3 ? `<span class="print-results-badge">Podio</span>` : ''}</div></div>`,
          `<div class="${rowClassName} print-results-rowcell num">${escapeHtml(formatMoney(row.invested))}</div>`,
          `<div class="${rowClassName} print-results-rowcell num">${escapeHtml(formatMoney(row.chips))}</div>`,
          `<div class="${rowClassName} print-results-rowcell num">${buildPdfNetValue(row.net, true)}</div>`,
          `<div class="${rowClassName} print-results-rowcell num">${escapeHtml(formatMoney(row.gained))}</div>`,
          `<div class="${rowClassName} print-results-rowcell num">${escapeHtml(formatMoney(row.lost))}</div>`,
          `<div class="${rowClassName} print-results-rowcell num">${escapeHtml(formatPdfRebuyCell(row))}</div>`,
        ];
      });
    };

    const buildResultFragment = (outerIdx, segment, segIdx, totalSegments) => {
      const firstPos = segment[0] ? segment[0].pos : '—';
      const lastPos = segment.length ? segment[segment.length - 1].pos : '—';
      const rangeLabel = segment.length
        ? `Posiciones ${firstPos}°${segment.length > 1 ? `–${lastPos}°` : ''}`
        : 'Sin resultados';
      const intro = segIdx === 0
        ? (outerIdx === 0
          ? '<div class="print-note">Se conserva el detalle completo por jugador y se presenta después del resumen ejecutivo y del podio para contar mejor la noche.</div>'
          : buildPdfContinuationNote({ label: buildPdfContinuationLabel(['Sesión', 'Resultados'], outerIdx + 1, chunks.length), copy: 'Mismo orden por neto final, misma tabla oficial del cierre y continuación natural del bloque.' }))
        : '';
      return buildPdfFragment(`
        ${intro}
        ${buildPdfFragmentHead({
          kicker: totalSegments > 1 ? `Subtramo ${segIdx + 1} de ${totalSegments}` : 'Tramo cerrado',
          title: rangeLabel,
          copy: 'Cabecera repetida y tramo cerrado para que el PDF continúe limpio sin cortar filas ni medias líneas.',
        })}
        ${buildPdfInlineTable({
          columns,
          rows: renderRows(segment),
          ariaLabel: `Resultados completos de la sesión · ${rangeLabel}`,
          tableClassName: 'print-results-table',
        })}
      `, {
        className: 'print-results-fragment',
        fragment: segIdx === 0 ? 'results-opening-segment' : 'results-continuation-segment',
        label: rangeLabel,
      });
    };

    if (!chunks.length){
      return buildPdfSection({
        title: 'Resultados completos de la sesión',
        subtitle: 'Detalle individual completo, todavía con todas las tripas útiles del cierre.',
        body: buildPdfFragment(buildPdfInlineTable({
          columns,
          rows: renderRows([]),
          ariaLabel: 'Resultados completos de la sesión',
          tableClassName: 'print-results-table',
        }), {
          className: 'print-results-fragment',
          fragment: 'results-empty',
          label: 'Sin resultados',
        }),
        className: 'print-section--session-detail',
        familyKey: 'session-results',
        familyLabel: 'Resultados completos de la sesión',
      });
    }

    return chunks.map((chunk, idx) => {
      const segments = chunkList(chunk, PDF_RESULTS_ROWS_PER_FRAGMENT);
      return buildPdfSection({
        title: 'Resultados completos de la sesión',
        subtitle: idx === 0
          ? 'Detalle individual completo, ordenado por neto final.'
          : 'Continuación natural del mismo orden oficial, sin perder filas ni contexto.',
        body: segments.map((segment, segIdx) => buildResultFragment(idx, segment, segIdx, segments.length)).join(''),
        className: idx === 0 ? 'print-section--session-detail' : 'print-section--session-detail-cont print-section--continuation',
        familyKey: 'session-results',
        familyLabel: 'Resultados completos de la sesión',
        avoidBreak: false,
      });
    }).join('');
  }

  function buildPdfGlobalBaseSection(globalBase, fallbackCloseDateTime){
    const data = globalBase || {};
    const body = `
      <div class="print-meta print-meta--compact">
        ${buildPdfMetaLines([
          { label: 'Exportado el', value: data.exportedAt ? formatDateTimeForPdf(data.exportedAt) : '—' },
          { label: 'Sesión cerrada', value: data.sessionRef || '—' },
          { label: 'Cierre registrado', value: data.closedAt ? formatDateTimeForPdf(data.closedAt) : (fallbackCloseDateTime || '—') },
          { label: 'Total histórico de sesiones cerradas', value: String(data.totalClosedSessions != null ? data.totalClosedSessions : '—') },
          { label: 'Total histórico de jugadores con registro', value: String(data.totalTrackedPlayers != null ? data.totalTrackedPlayers : '—') },
          { label: 'Criterio oficial del ranking global', value: data.rankingCriterion || '—' },
          { label: 'ROI para récords globales', value: `Mínimo ${data.roiMinGames || ROI_RECORD_MIN_GAMES} sesiones e inversión acumulada mayor a 0` },
          { label: 'Manejo de empates', value: data.rankingTieNote || '—' },
        ])}
      </div>
    `;
    return buildPdfSection({
      title: 'Base global del histórico',
      subtitle: 'Referencia histórica usada para el cierre, el ranking global y los récords.',
      body,
      subtle: true,
      className: 'print-section--global-base',
    });
  }

  function buildPdfDocumentModel(session){
    const s = session || {};
    const analysis = analyzeSession(s);
    const analytics = computeAnalytics();
    const reportName = makeReportNameResolver(s);
    const summary = resolvePdfSessionSummary(s, analysis, reportName);
    const globalBase = getPdfGlobalBaseData(s, analytics);
    const impactData = resolveSessionHistoricalImpact(s, { persist: true });
    const playerRows = buildPdfSessionPlayerRows(summary.rows, reportName);

    const sections = {
      opening: buildPdfPremiumOpeningSection(summary),
      executive: buildPdfSessionExecutiveSection(summary),
      podium: buildPdfSessionPodiumSection(summary),
      session: buildPdfPlayerDetailSections(playerRows),
      impact: buildPdfImpactSections(impactData),
      globalBase: buildPdfGlobalBaseSection(globalBase, summary.closeDateTime),
      ranking: buildPdfRankingSections(analytics.ranking || []),
      records: buildPdfRecordsSections(analytics.records || {}),
    };

    const editorialGroups = [
      { ...PDF_EDITORIAL_GROUPS.OPENING, sections: [sections.opening] },
      { ...PDF_EDITORIAL_GROUPS.SESSION, sections: [sections.executive, sections.podium, sections.session] },
      { ...PDF_EDITORIAL_GROUPS.IMPACT, sections: [sections.impact] },
      { ...PDF_EDITORIAL_GROUPS.ARCHIVE, sections: [sections.globalBase, sections.ranking, sections.records] },
    ];

    return {
      session: s,
      analysis,
      analytics,
      reportName,
      summary,
      globalBase,
      impactData,
      sections,
      editorialGroups,
    };
  }

  function buildSharedEditorialGroupMarkup(opts, shellClassName, headClassName){
    const key = safeTrim(opts && opts.key) || 'group';
    const label = safeTrim(opts && opts.label) || key;
    const kicker = safeTrim(opts && opts.kicker);
    const lead = safeTrim(opts && opts.lead);
    const copy = safeTrim(opts && opts.copy);
    const showHeader = !!(opts && opts.showHeader) && (!!kicker || !!lead || !!copy);
    const sections = Array.isArray(opts && opts.sections) ? opts.sections.filter(Boolean) : [];
    const classes = String(shellClassName || '').split(/\s+/).filter(Boolean);
    if (opts && opts.breakBefore) classes.push('pdf-break-before');
    if (showHeader) classes.push('print-editorial-group--with-head');
    const headClasses = String(headClassName || '').split(/\s+/).filter(Boolean);
    const headHtml = showHeader ? `
      <div class="${headClasses.join(' ')} pdf-avoid-break">
        ${kicker ? `<div class="print-editorial-kicker">${escapeHtml(kicker)}</div>` : ''}
        <div class="print-editorial-title">${escapeHtml(label)}</div>
        ${lead ? `<div class="print-editorial-lead">${escapeHtml(lead)}</div>` : ''}
        ${copy ? `<div class="print-editorial-copy">${escapeHtml(copy)}</div>` : ''}
      </div>
    ` : '';
    return `
      <article class="${classes.join(' ')}" data-pdf-group="${escapeAttr(key)}" data-pdf-group-label="${escapeAttr(label)}">
        ${headHtml}
        ${sections.join('')}
      </article>
    `;
  }

  function buildPdfEditorialGroup(opts){
    return buildSharedEditorialGroupMarkup(opts, 'pdf-document-group print-editorial-group', 'pdf-document-group-head print-editorial-head');
  }

  function buildScreenEditorialGroup(opts){
    return buildSharedEditorialGroupMarkup(opts, 'report-reader-group print-editorial-group', 'report-reader-group-head print-editorial-head');
  }

  function buildPdfPrintDocumentSections(model){
    const groups = Array.isArray(model && model.editorialGroups) ? model.editorialGroups : [];
    return groups.map(group => buildPdfEditorialGroup(group)).join('');
  }

  function buildScreenReportSections(model){
    const groups = Array.isArray(model && model.editorialGroups) ? model.editorialGroups : [];
    return groups.map(group => buildScreenEditorialGroup(group)).join('');
  }

  function buildPdfDocumentSections(model, mode){
    const modeKey = safeTrim(mode).toLowerCase() === 'screen' ? 'screen' : 'pdf';
    return modeKey === 'screen' ? buildScreenReportSections(model) : buildPdfPrintDocumentSections(model);
  }

  function getReportModeMeta(model, mode){
    const currentModel = model && typeof model === 'object' ? model : {};
    const summary = currentModel.summary || {};
    const session = currentModel.session || {};
    const modeKey = safeTrim(mode).toLowerCase() === 'pdf' ? 'pdf' : 'screen';
    const sessionTitle = safeTrim(summary.sessionTitle) || buildPdfSessionDisplayTitle(session);
    const sessionDateLabel = safeTrim(summary.sessionDateLabel) || safeTrim(session.date) || '—';
    const sessionRef = safeTrim(summary.sessionRef) || pdfSessionReferenceLabel(session);
    const kicker = modeKey === 'pdf' ? 'PDF exportable oficial' : 'Vista corrida premium';
    const lead = modeKey === 'pdf'
      ? 'Documento oficial listo para impresión o guardado, con la misma narrativa base de la vista corrida.'
      : 'Lectura en pantalla, continua y editorial. El PDF oficial sigue aparte para exportación.';
    const copy = modeKey === 'pdf'
      ? 'Este modo prioriza cortes limpios, paginación más sobria y una salida estable al guardar o descargar.'
      : 'Toda la narrativa premium corre seguida, sin cortes visuales de página y sin perder el archivo histórico completo.';
    const tags = modeKey === 'pdf'
      ? ['PDF exportable', 'Impresión / guardado']
      : ['Pantalla corrida', 'PDF oficial aparte'];
    return { sessionTitle, sessionDateLabel, sessionRef, kicker, lead, copy, tags, modeKey };
  }

  function buildReportModePanelMarkup(meta, title){
    const currentMeta = meta && typeof meta === 'object' ? meta : {};
    const heading = safeTrim(title) || 'Modo del reporte';
    const tags = Array.isArray(currentMeta.tags) ? currentMeta.tags.filter(Boolean) : [];
    return `
      <div class="panel report-reader-mode-panel print-mode-panel" role="region" aria-label="${escapeAttr(heading)}">
        <div class="panel-head">
          <div class="panel-title" style="margin:0">${escapeHtml(heading)}</div>
          <div class="row panel-actions report-reader-mode-actions print-mode-actions">
            ${tags.map(tag => `<span class="report-reader-tag print-mode-tag">${escapeHtml(String(tag))}</span>`).join('')}
          </div>
        </div>
        <div class="report-reader-mode-copy print-mode-copy">
          <p class="report-reader-mode-lead print-mode-lead">${escapeHtml(safeTrim(currentMeta.copy) || '—')}</p>
          <p class="report-reader-mode-sub print-mode-sub">Referencia de sesión: ${escapeHtml(safeTrim(currentMeta.sessionRef) || '—')}.</p>
        </div>
      </div>
    `;
  }

  function buildPdfDocumentHeadMarkup(meta){
    const currentMeta = meta && typeof meta === 'object' ? meta : {};
    return `
      <div class="pdf-document-head">
        <div class="print-head print-head--report-mode pdf-document-brandbar">
          <div class="print-brand">
            <img class="print-logo" src="assets/icons/icon-192.png" alt="" />
            <span>POKERITO</span>
          </div>
          <div class="pdf-document-chip">PDF oficial</div>
        </div>

        <div class="print-reader-head pdf-document-reader-head">
          <div class="print-reader-kicker">${escapeHtml(safeTrim(currentMeta.kicker) || 'PDF exportable oficial')}</div>
          <div class="print-reader-title">${escapeHtml(safeTrim(currentMeta.sessionTitle) || 'Sesión')} <span class="badge">${escapeHtml(safeTrim(currentMeta.sessionDateLabel) || '—')}</span></div>
          <div class="print-reader-sub">${escapeHtml(safeTrim(currentMeta.lead) || 'Documento oficial listo para impresión o guardado.')}</div>
        </div>

        ${buildReportModePanelMarkup(currentMeta, 'Exportación PDF')}
      </div>
    `;
  }

  function buildPdfPageShell(meta, pageNumber, totalPages){
    const currentMeta = meta && typeof meta === 'object' ? meta : {};
    const currentPage = Math.max(1, Math.floor(numOrZero(pageNumber) || 1));
    const pageTotal = Math.max(currentPage, Math.floor(numOrZero(totalPages) || currentPage));
    return el(`
      <section class="pdf-page" data-pdf-page="${escapeAttr(String(currentPage))}">
        <div class="pdf-page-frame">
          <header class="pdf-page-header">
            <div class="pdf-page-brand">
              <div class="print-brand">
                <img class="print-logo" src="assets/icons/icon-192.png" alt="" />
                <span>POKERITO</span>
              </div>
              <div class="pdf-page-kicker">Documento oficial</div>
            </div>
            <div class="pdf-page-session-meta">
              <div class="pdf-page-session-title">${escapeHtml(safeTrim(currentMeta.sessionTitle) || 'Sesión')}</div>
              <div class="pdf-page-session-ref">${escapeHtml(safeTrim(currentMeta.sessionRef) || '—')}</div>
            </div>
            <div class="pdf-page-counter">Página ${escapeHtml(String(currentPage))}/${escapeHtml(String(pageTotal))}</div>
          </header>
          <div class="pdf-page-body"></div>
          <footer class="pdf-page-footer">
            <div class="pdf-page-footer-left">${escapeHtml(safeTrim(currentMeta.sessionDateLabel) || '—')}</div>
            <div class="pdf-page-footer-center">Pokerito · PDF oficial</div>
            <div class="pdf-page-footer-right">${escapeHtml(String(currentPage))}/${escapeHtml(String(pageTotal))}</div>
          </footer>
        </div>
      </section>
    `);
  }

  function clonePdfNode(node){
    if (!node) return null;
    try{ return node.cloneNode(true); }catch(e){}
    try{
      const html = safeTrim(node.outerHTML) || `<div>${escapeHtml(node.textContent || '')}</div>`;
      return el(html);
    }catch(e){
      return null;
    }
  }

  function createPdfBlockWrapper(className, sourceNodes, meta){
    const wrapper = document.createElement('div');
    wrapper.className = ['pdf-page-unit', safeTrim(className)].filter(Boolean).join(' ');
    const sourceList = Array.isArray(sourceNodes) ? sourceNodes : [sourceNodes];
    if (meta && meta.groupKey) wrapper.dataset.pdfGroup = meta.groupKey;
    if (meta && meta.groupLabel) wrapper.dataset.pdfGroupLabel = meta.groupLabel;
    if (meta && meta.blockKey) wrapper.dataset.pdfBlockKey = meta.blockKey;
    if (meta && meta.blockKind) wrapper.dataset.pdfBlockKind = meta.blockKind;
    if (meta && meta.fragmentLabel) wrapper.dataset.pdfFragmentLabel = meta.fragmentLabel;
    sourceList.forEach(node => {
      const clone = clonePdfNode(node);
      if (clone) wrapper.appendChild(clone);
    });
    return wrapper;
  }

  function buildPdfSectionBlockNode(section, bodyNodes, options){
    if (!section) return null;
    const opts = options && typeof options === 'object' ? options : {};
    const clone = document.createElement('section');
    clone.className = safeTrim(section.className) || 'print-section';
    clone.classList.add('pdf-page-block-section');
    if (opts.continuation){
      clone.classList.add('print-section--paged-continuation', 'print-section--continuation');
    }
    if (Number.isFinite(opts.fragmentIndex)) clone.dataset.pdfSectionFragmentIndex = String(Math.max(0, Math.floor(opts.fragmentIndex)));
    if (Number.isFinite(opts.fragmentTotal)) clone.dataset.pdfSectionFragmentTotal = String(Math.max(1, Math.floor(opts.fragmentTotal)));
    if (safeTrim(opts.reason)) clone.dataset.pdfSectionFragmentReason = safeTrim(opts.reason);
    const head = getSectionHeadNode(section);
    if (head){
      const headClone = clonePdfNode(head);
      if (headClone) clone.appendChild(headClone);
    }
    const body = document.createElement('div');
    body.className = 'print-section-body';
    const nodes = Array.isArray(bodyNodes) ? bodyNodes.filter(Boolean) : [];
    if (!nodes.length){
      const originalBody = section.querySelector ? section.querySelector('.print-section-body') : null;
      if (originalBody){
        const bodyClone = clonePdfNode(originalBody);
        if (bodyClone) return bodyClone.tagName === 'DIV' ? (clone.appendChild(bodyClone), clone) : (body.appendChild(bodyClone), clone.appendChild(body), clone);
      }
    }
    nodes.forEach(node => {
      const bodyClone = clonePdfNode(node);
      if (bodyClone) body.appendChild(bodyClone);
    });
    clone.appendChild(body);
    return clone;
  }

  function getPdfSectionBlockGroups(section){
    const body = section && section.querySelector ? section.querySelector('.print-section-body') : null;
    if (!body) return [{ wholeSection: true, nodes: [], reason: 'section' }];
    const explicitFragments = getTopLevelPdfFragments(body);
    if (explicitFragments.length){
      return explicitFragments.map((node, idx) => ({
        nodes: [node],
        reason: (node.dataset && safeTrim(node.dataset.pdfFragment)) || `fragment-${idx + 1}`,
        fragmentLabel: (node.dataset && safeTrim(node.dataset.pdfFragmentLabel)) || '',
      }));
    }

    const bodyChildren = getSectionBodyDirectChildren(section);
    if (bodyChildren.length <= 1) return [{ wholeSection: true, nodes: bodyChildren, reason: 'section' }];

    const groups = [];
    const consumed = new Set();
    for (let i = 0; i < bodyChildren.length; i += 1){
      if (consumed.has(i)) continue;
      const child = bodyChildren[i];
      if (!child) continue;
      const next = bodyChildren[i + 1] || null;

      if (child.classList && child.classList.contains('print-note') && next && next.classList){
        if (next.classList.contains('print-impact-list') || next.classList.contains('print-rank-list')){
          const cards = Array.from(next.children || []).filter(Boolean);
          if (cards.length){
            groups.push({ nodes: [child, cards[0]], reason: 'note-with-first-card' });
            cards.slice(1).forEach(card => {
              groups.push({ nodes: [card], reason: next.classList.contains('print-impact-list') ? 'impact-card' : 'rank-card' });
            });
            consumed.add(i);
            consumed.add(i + 1);
            continue;
          }
        }
        if (!isSemanticSupportBlock(next)){
          groups.push({ nodes: [child, next], reason: 'note-with-following-block' });
          consumed.add(i);
          consumed.add(i + 1);
          continue;
        }
      }

      if (child.classList && (child.classList.contains('print-impact-list') || child.classList.contains('print-rank-list'))){
        const cards = Array.from(child.children || []).filter(Boolean);
        if (cards.length){
          cards.forEach(card => {
            groups.push({ nodes: [card], reason: child.classList.contains('print-impact-list') ? 'impact-card' : 'rank-card' });
          });
          consumed.add(i);
          continue;
        }
      }

      groups.push({
        nodes: [child],
        reason: isSemanticSupportBlock(child) ? 'support-block' : 'body-block',
      });
      consumed.add(i);
    }

    return groups.length ? groups : [{ wholeSection: true, nodes: bodyChildren, reason: 'section' }];
  }

  function getPdfSectionTitleText(section){
    const node = section && section.querySelector ? section.querySelector('.print-section-title') : null;
    return safeTrim(node && node.textContent) || '';
  }

  function getPdfSectionSubtitleText(section){
    const node = section && section.querySelector ? section.querySelector('.print-section-sub') : null;
    return safeTrim(node && node.textContent) || '';
  }

  function getPdfSectionFamilyMeta(section, options){
    const sectionTitle = getPdfSectionTitleText(section) || 'Sección';
    const sectionSubtitle = getPdfSectionSubtitleText(section);
    const dataFamilyKey = safeTrim(section && section.dataset && section.dataset.pdfFamilyKey);
    const dataFamilyLabel = safeTrim(section && section.dataset && section.dataset.pdfFamilyLabel);
    const familyKey = dataFamilyKey || `${safeTrim(options && options.groupKey) || 'group'}-${toPdfFamilySlug(sectionTitle) || 'section'}`;
    return {
      familyKey,
      familyLabel: dataFamilyLabel || sectionTitle,
      sectionTitle,
      sectionSubtitle,
    };
  }

  function createPdfPageBlockDescriptor(node, meta){
    return {
      node,
      blockKey: safeTrim(meta && meta.blockKey) || '',
      kind: safeTrim(meta && meta.blockKind) || 'content',
      groupKey: safeTrim(meta && meta.groupKey) || '',
      groupLabel: safeTrim(meta && meta.groupLabel) || '',
      forceBreakBefore: !!(meta && meta.forceBreakBefore),
      fragmentable: !!(meta && meta.fragmentable),
      fragmentLabel: safeTrim(meta && meta.fragmentLabel) || '',
      renderMode: safeTrim(meta && meta.renderMode) || 'atomic',
      sectionFamilyKey: safeTrim(meta && meta.sectionFamilyKey) || '',
      sectionFamilyLabel: safeTrim(meta && meta.sectionFamilyLabel) || '',
      sectionTitle: safeTrim(meta && meta.sectionTitle) || '',
      sectionSubtitle: safeTrim(meta && meta.sectionSubtitle) || '',
      sectionNode: meta && meta.sectionNode ? meta.sectionNode : null,
      bodySourceNodes: Array.isArray(meta && meta.bodySourceNodes) ? meta.bodySourceNodes.filter(Boolean) : [],
      groupLeadNode: meta && meta.groupLeadNode ? meta.groupLeadNode : null,
      sectionContinuation: !!(meta && meta.sectionContinuation),
      fragmentIndex: Math.max(0, Math.floor(numOrZero(meta && meta.fragmentIndex) || 0)),
      fragmentTotal: Math.max(1, Math.floor(numOrZero(meta && meta.fragmentTotal) || 1)),
      bodyHeightPx: 0,
      heightPx: 0,
    };
  }

  function buildPdfSectionBlockDescriptors(section, meta){
    const options = meta && typeof meta === 'object' ? meta : {};
    const sectionIndex = Math.max(1, Math.floor(numOrZero(options.sectionIndex) || 1));
    const groups = getPdfSectionBlockGroups(section);
    const familyMeta = getPdfSectionFamilyMeta(section, options);
    const firstBlockNodes = [];
    if (options.groupLead) firstBlockNodes.push(options.groupLead);

    if (groups.length === 1 && groups[0] && groups[0].wholeSection){
      firstBlockNodes.push(section);
      return [createPdfPageBlockDescriptor(
        createPdfBlockWrapper(options.groupLead ? 'pdf-page-unit--group-opening pdf-page-unit--section' : 'pdf-page-unit--section', firstBlockNodes, {
          groupKey: options.groupKey,
          groupLabel: options.groupLabel,
          blockKey: `${options.groupKey || 'group'}-section-${sectionIndex}`,
          blockKind: options.groupLead ? 'group-opening-section' : 'section',
          fragmentLabel: groups[0].fragmentLabel || '',
        }),
        {
          groupKey: options.groupKey,
          groupLabel: options.groupLabel,
          blockKey: `${options.groupKey || 'group'}-section-${sectionIndex}`,
          blockKind: options.groupLead ? 'group-opening-section' : 'section',
          forceBreakBefore: !!(section.classList && section.classList.contains('pdf-break-before')),
          fragmentable: false,
          renderMode: 'atomic',
          sectionFamilyKey: familyMeta.familyKey,
          sectionFamilyLabel: familyMeta.familyLabel,
          sectionTitle: familyMeta.sectionTitle,
          sectionSubtitle: familyMeta.sectionSubtitle,
        }
      )];
    }

    return groups.map((group, idx) => {
      const sourceNodes = [];
      if (idx === 0 && options.groupLead) sourceNodes.push(options.groupLead);
      const sectionBlock = buildPdfSectionBlockNode(section, group.nodes, {
        continuation: idx > 0,
        fragmentIndex: idx,
        fragmentTotal: groups.length,
        reason: group.reason,
      });
      if (sectionBlock) sourceNodes.push(sectionBlock);
      const blockKey = `${options.groupKey || 'group'}-section-${sectionIndex}-part-${idx + 1}`;
      return createPdfPageBlockDescriptor(
        createPdfBlockWrapper(idx === 0 && options.groupLead ? 'pdf-page-unit--group-opening pdf-page-unit--section' : 'pdf-page-unit--section', sourceNodes, {
          groupKey: options.groupKey,
          groupLabel: options.groupLabel,
          blockKey,
          blockKind: idx === 0 ? (options.groupLead ? 'group-opening-section-fragment' : 'section-fragment') : 'section-continuation',
          fragmentLabel: group.fragmentLabel || '',
        }),
        {
          groupKey: options.groupKey,
          groupLabel: options.groupLabel,
          blockKey,
          blockKind: idx === 0 ? (options.groupLead ? 'group-opening-section-fragment' : 'section-fragment') : 'section-continuation',
          forceBreakBefore: idx === 0 && !!(section.classList && section.classList.contains('pdf-break-before')),
          fragmentable: true,
          fragmentLabel: group.fragmentLabel || '',
          renderMode: 'section-fragment',
          sectionFamilyKey: familyMeta.familyKey,
          sectionFamilyLabel: familyMeta.familyLabel,
          sectionTitle: familyMeta.sectionTitle,
          sectionSubtitle: familyMeta.sectionSubtitle,
          sectionNode: section,
          bodySourceNodes: group.nodes,
          groupLeadNode: idx === 0 ? options.groupLead : null,
          sectionContinuation: idx > 0,
          fragmentIndex: idx,
          fragmentTotal: groups.length,
        }
      );
    }).filter(Boolean);
  }

  function createPdfAtomicBlockDescriptor(node, meta){
    const options = meta && typeof meta === 'object' ? meta : {};
    const sourceNodes = [];
    if (options.groupLead) sourceNodes.push(options.groupLead);
    if (node) sourceNodes.push(node);
    const blockKey = safeTrim(options.blockKey) || `${options.groupKey || 'group'}-content-${Math.max(1, Math.floor(numOrZero(options.contentIndex) || 1))}`;
    return createPdfPageBlockDescriptor(
      createPdfBlockWrapper(options.groupLead ? 'pdf-page-unit--group-opening pdf-page-unit--content' : 'pdf-page-unit--content', sourceNodes, {
        groupKey: options.groupKey,
        groupLabel: options.groupLabel,
        blockKey,
        blockKind: options.groupLead ? 'group-opening-content' : 'content',
      }),
      {
        groupKey: options.groupKey,
        groupLabel: options.groupLabel,
        blockKey,
        blockKind: options.groupLead ? 'group-opening-content' : 'content',
        forceBreakBefore: !!(node && node.classList && node.classList.contains('pdf-break-before')),
        fragmentable: false,
      }
    );
  }

  function collectPdfPageBlocksFromFlow(flowRoot){
    const blocks = [];
    if (!flowRoot || !flowRoot.querySelector) return blocks;
    const head = flowRoot.querySelector('.pdf-document-head');
    if (head){
      blocks.push(createPdfPageBlockDescriptor(
        createPdfBlockWrapper('pdf-page-unit--document-head', head, {
          groupKey: 'document-head',
          groupLabel: 'Documento oficial',
          blockKey: 'document-head',
          blockKind: 'document-head',
        }),
        {
          groupKey: 'document-head',
          groupLabel: 'Documento oficial',
          blockKey: 'document-head',
          blockKind: 'document-head',
          fragmentable: false,
        }
      ));
    }

    const content = flowRoot.querySelector('.pdf-document-content');
    const groups = Array.from(content && content.children ? content.children : []).filter(Boolean);
    groups.forEach((group, groupIndex) => {
      const groupKey = safeTrim(group.dataset && group.dataset.pdfGroup) || `group-${groupIndex + 1}`;
      const groupLabel = safeTrim(group.dataset && group.dataset.pdfGroupLabel) || `Grupo ${groupIndex + 1}`;
      const children = Array.from(group.children || []).filter(Boolean);
      let pendingGroupLead = null;
      let sectionCounter = 0;
      let contentCounter = 0;

      children.forEach(child => {
        if (!child || !child.classList) return;
        if (child.classList.contains('print-editorial-head')){
          pendingGroupLead = child;
          return;
        }
        if (child.classList.contains('print-section')){
          sectionCounter += 1;
          const sectionBlocks = buildPdfSectionBlockDescriptors(child, {
            groupKey,
            groupLabel,
            groupLead: pendingGroupLead,
            sectionIndex: sectionCounter,
          });
          sectionBlocks.forEach(block => blocks.push(block));
          pendingGroupLead = null;
          return;
        }
        contentCounter += 1;
        blocks.push(createPdfAtomicBlockDescriptor(child, {
          groupKey,
          groupLabel,
          groupLead: pendingGroupLead,
          contentIndex: contentCounter,
        }));
        pendingGroupLead = null;
      });

      if (pendingGroupLead){
        contentCounter += 1;
        blocks.push(createPdfAtomicBlockDescriptor(pendingGroupLead, {
          groupKey,
          groupLabel,
          contentIndex: contentCounter,
          blockKey: `${groupKey}-lead-${contentCounter}`,
        }));
      }
    });
    return blocks;
  }

  function createPdfMeasureLab(root, meta){
    if (!root) return null;
    let lab = root.querySelector('#pdfPagingLab');
    if (lab) return lab;
    lab = document.createElement('div');
    lab.className = 'pdf-paging-lab';
    lab.id = 'pdfPagingLab';
    try{ lab.setAttribute('aria-hidden', 'true'); }catch(e){}
    const page = buildPdfPageShell(meta, 1, 1);
    try{ page.classList.add('pdf-page--measure'); }catch(e){}
    const body = page.querySelector('.pdf-page-body');
    if (body) body.id = 'pdfPageMeasureBody';
    lab.appendChild(page);
    root.appendChild(lab);
    return lab;
  }

  function getPdfPageBodyGapPx(body){
    if (!body || !window.getComputedStyle) return 8;
    try{
      const styles = window.getComputedStyle(body);
      const raw = parseFloat(styles.rowGap || styles.gap || '8');
      return Number.isFinite(raw) && raw >= 0 ? raw : 8;
    }catch(e){
      return 8;
    }
  }

  function getPdfSectionBodyGapPx(measureBody){
    if (!measureBody || !window.getComputedStyle) return 8;
    const probe = document.createElement('div');
    probe.className = 'print-section-body';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    measureBody.innerHTML = '';
    measureBody.appendChild(probe);
    try{
      const styles = window.getComputedStyle(probe);
      const raw = parseFloat(styles.rowGap || styles.gap || '8');
      return Number.isFinite(raw) && raw >= 0 ? raw : 8;
    }catch(e){
      return 8;
    }finally{
      try{ measureBody.innerHTML = ''; }catch(err){}
    }
  }

  async function measurePdfUnitHeight(unit, measureBody, signal){
    if (!unit || !measureBody) return 0;
    measureBody.innerHTML = '';
    const clone = clonePdfNode(unit);
    if (!clone) return 0;
    measureBody.appendChild(clone);
    await nextPaint(signal);
    const rect = clone.getBoundingClientRect ? clone.getBoundingClientRect() : null;
    return Math.max(
      1,
      Math.round(numOrZero(rect && rect.height)),
      Math.round(numOrZero(clone.scrollHeight)),
      Math.round(numOrZero(clone.offsetHeight))
    );
  }

  function buildPdfSectionBodyMeasureNode(block){
    if (!block || !Array.isArray(block.bodySourceNodes) || !block.bodySourceNodes.length) return block && block.node ? block.node : null;
    const body = document.createElement('div');
    body.className = 'print-section-body pdf-page-merge-measure';
    block.bodySourceNodes.forEach(node => {
      const clone = clonePdfNode(node);
      if (clone) body.appendChild(clone);
    });
    return body;
  }

  function buildPdfPageBudget(measureBody){
    if (!measureBody) return null;
    const page = measureBody.closest ? measureBody.closest('.pdf-page') : null;
    const frame = page && page.querySelector ? page.querySelector('.pdf-page-frame') : null;
    const header = page && page.querySelector ? page.querySelector('.pdf-page-header') : null;
    const footer = page && page.querySelector ? page.querySelector('.pdf-page-footer') : null;
    const bodyRect = measureBody.getBoundingClientRect ? measureBody.getBoundingClientRect() : null;
    const frameRect = frame && frame.getBoundingClientRect ? frame.getBoundingClientRect() : null;
    const headerRect = header && header.getBoundingClientRect ? header.getBoundingClientRect() : null;
    const footerRect = footer && footer.getBoundingClientRect ? footer.getBoundingClientRect() : null;
    const bodyHeightPx = Math.max(
      1,
      Math.round(numOrZero(bodyRect && bodyRect.height)),
      Math.round(numOrZero(measureBody.clientHeight)),
      Math.round(numOrZero(measureBody.scrollHeight))
    );
    const gapPx = getPdfPageBodyGapPx(measureBody);
    const bottomReservePx = Math.max(gapPx + 4, Math.round(bodyHeightPx * 0.028));
    return {
      frameHeightPx: Math.max(1, Math.round(numOrZero(frameRect && frameRect.height))),
      headerHeightPx: Math.max(0, Math.round(numOrZero(headerRect && headerRect.height))),
      footerHeightPx: Math.max(0, Math.round(numOrZero(footerRect && footerRect.height))),
      bodyHeightPx,
      gapPx,
      sectionBodyGapPx: getPdfSectionBodyGapPx(measureBody),
      topReservePx: Math.max(gapPx, Math.round(bodyHeightPx * 0.014)),
      bottomReservePx,
      softBottomReservePx: Math.max(8, Math.round(bodyHeightPx * 0.012)),
      rebalanceBottomReservePx: Math.max(gapPx + 2, Math.round(bottomReservePx * 0.72)),
      oversizedTolerancePx: Math.max(10, Math.round(bodyHeightPx * 0.018)),
    };
  }

  function createPdfPageBucket(pageNumber){
    return {
      pageNumber: Math.max(1, Math.floor(numOrZero(pageNumber) || 1)),
      entries: [],
      usedPx: 0,
    };
  }

  function canMergePdfBlockWithPageEntry(entry, block){
    if (!entry || !block) return false;
    if (safeTrim(entry.renderMode) !== 'section-fragment' || safeTrim(block.renderMode) !== 'section-fragment') return false;
    if (block.forceBreakBefore || entry.hasGroupLead || !!block.groupLeadNode) return false;
    const entryFamily = safeTrim(entry.sectionFamilyKey);
    const blockFamily = safeTrim(block.sectionFamilyKey);
    return !!entryFamily && entryFamily === blockFamily;
  }

  function createPdfPageEntryFromBlock(block){
    return {
      renderMode: safeTrim(block && block.renderMode) || 'atomic',
      sectionFamilyKey: safeTrim(block && block.sectionFamilyKey) || '',
      sectionFamilyLabel: safeTrim(block && block.sectionFamilyLabel) || '',
      blocks: [block],
      heightPx: Math.max(1, numOrZero(block && block.heightPx)),
      hasGroupLead: !!(block && block.groupLeadNode),
    };
  }

  function canMergePdfPageEntries(entry, incomingEntry){
    if (!entry || !incomingEntry) return false;
    if (safeTrim(entry.renderMode) !== 'section-fragment' || safeTrim(incomingEntry.renderMode) !== 'section-fragment') return false;
    if (entry.hasGroupLead || incomingEntry.hasGroupLead) return false;
    const entryFamily = safeTrim(entry.sectionFamilyKey);
    const incomingFamily = safeTrim(incomingEntry.sectionFamilyKey);
    return !!entryFamily && entryFamily === incomingFamily;
  }

  function getPdfMergedEntryAddedHeight(entry, budget){
    if (!entry || !budget) return 0;
    return (Array.isArray(entry.blocks) ? entry.blocks : []).reduce((sum, block) => {
      const blockHeight = Math.max(1, numOrZero(block && block.bodyHeightPx) || numOrZero(block && block.heightPx));
      return sum + Math.max(0, numOrZero(budget.sectionBodyGapPx)) + blockHeight;
    }, 0);
  }

  function getPdfPageEntryAddedHeight(pageBucket, entry, budget){
    if (!pageBucket || !entry || !budget) return 0;
    const lastEntry = pageBucket.entries[pageBucket.entries.length - 1] || null;
    if (canMergePdfPageEntries(lastEntry, entry)) return getPdfMergedEntryAddedHeight(entry, budget);
    const gapPx = pageBucket.entries.length ? numOrZero(budget.gapPx) : 0;
    return gapPx + Math.max(1, numOrZero(entry.heightPx));
  }

  function canFitPdfPageEntryOnPage(pageBucket, entry, budget){
    if (!pageBucket || !entry || !budget) return false;
    const reservePx = pageBucket.entries.length
      ? Math.max(numOrZero(budget.softBottomReservePx), numOrZero(budget.rebalanceBottomReservePx) || numOrZero(budget.bottomReservePx))
      : numOrZero(budget.softBottomReservePx);
    const addedHeight = getPdfPageEntryAddedHeight(pageBucket, entry, budget);
    return (numOrZero(pageBucket.usedPx) + addedHeight) <= (numOrZero(budget.bodyHeightPx) - reservePx);
  }

  function addPdfEntryToPage(pageBucket, entry, budget){
    if (!pageBucket || !entry || !budget) return;
    const lastEntry = pageBucket.entries[pageBucket.entries.length - 1] || null;
    if (canMergePdfPageEntries(lastEntry, entry)) {
      const addedHeight = getPdfMergedEntryAddedHeight(entry, budget);
      lastEntry.blocks.push(...(Array.isArray(entry.blocks) ? entry.blocks : []));
      lastEntry.heightPx += addedHeight;
      pageBucket.usedPx += addedHeight;
      return;
    }
    const extraGap = pageBucket.entries.length ? numOrZero(budget.gapPx) : 0;
    pageBucket.entries.push(entry);
    pageBucket.usedPx += extraGap + Math.max(1, numOrZero(entry.heightPx));
  }

  function recalcPdfPageBucketUsage(pageBucket, budget){
    if (!pageBucket || !budget) return 0;
    let used = 0;
    const entries = Array.isArray(pageBucket.entries) ? pageBucket.entries : [];
    entries.forEach((entry, idx) => {
      used += (idx ? numOrZero(budget.gapPx) : 0) + Math.max(1, numOrZero(entry && entry.heightPx));
    });
    pageBucket.usedPx = used;
    return used;
  }

  function rebalancePdfPages(pages, budget){
    if (!Array.isArray(pages) || pages.length < 2 || !budget) return 0;
    let moved = 0;
    const maxPasses = Math.max(2, pages.length * 3);
    for (let pass = 0; pass < maxPasses; pass += 1){
      let changed = false;
      for (let i = 1; i < pages.length; i += 1){
        const prevPage = pages[i - 1];
        const page = pages[i];
        if (!prevPage || !page || !Array.isArray(page.entries) || !page.entries.length) continue;
        while (page.entries.length){
          const entry = page.entries[0];
          const primary = entry && Array.isArray(entry.blocks) ? entry.blocks[0] : null;
          if (!entry || entry.hasGroupLead || (primary && primary.forceBreakBefore)) break;
          if (!canFitPdfPageEntryOnPage(prevPage, entry, budget)) break;
          page.entries.shift();
          recalcPdfPageBucketUsage(page, budget);
          addPdfEntryToPage(prevPage, entry, budget);
          moved += 1;
          changed = true;
        }
        if (!page.entries.length){
          pages.splice(i, 1);
          i -= 1;
        }
      }
      if (!changed) break;
    }
    pages.forEach((page, idx) => {
      if (page) page.pageNumber = idx + 1;
    });
    return moved;
  }

  function getPdfBlockAddedHeight(pageBucket, block, budget){
    if (!pageBucket || !block || !budget) return 0;
    const lastEntry = pageBucket.entries[pageBucket.entries.length - 1] || null;
    if (canMergePdfBlockWithPageEntry(lastEntry, block)){
      return Math.max(0, numOrZero(budget.sectionBodyGapPx)) + Math.max(1, numOrZero(block.bodyHeightPx) || numOrZero(block.heightPx));
    }
    const gapPx = pageBucket.entries.length ? numOrZero(budget.gapPx) : 0;
    return gapPx + Math.max(1, numOrZero(block.heightPx));
  }

  function canFitPdfBlockOnPage(pageBucket, block, budget){
    if (!pageBucket || !block || !budget) return false;
    const reservePx = pageBucket.entries.length ? numOrZero(budget.bottomReservePx) : numOrZero(budget.softBottomReservePx);
    const addedHeight = getPdfBlockAddedHeight(pageBucket, block, budget);
    return (numOrZero(pageBucket.usedPx) + addedHeight) <= (numOrZero(budget.bodyHeightPx) - reservePx);
  }

  function addPdfBlockToPage(pageBucket, block, budget){
    if (!pageBucket || !block || !budget) return;
    const lastEntry = pageBucket.entries[pageBucket.entries.length - 1] || null;
    if (canMergePdfBlockWithPageEntry(lastEntry, block)){
      const addedHeight = Math.max(0, numOrZero(budget.sectionBodyGapPx)) + Math.max(1, numOrZero(block.bodyHeightPx) || numOrZero(block.heightPx));
      lastEntry.blocks.push(block);
      lastEntry.heightPx += addedHeight;
      pageBucket.usedPx += addedHeight;
      return;
    }
    const extraGap = pageBucket.entries.length ? numOrZero(budget.gapPx) : 0;
    const entry = createPdfPageEntryFromBlock(block);
    pageBucket.entries.push(entry);
    pageBucket.usedPx += extraGap + entry.heightPx;
  }

  function buildPdfMergedSectionEntryNode(entry){
    const primary = entry && Array.isArray(entry.blocks) ? entry.blocks[0] : null;
    if (!primary || !primary.sectionNode) return primary ? clonePdfNode(primary.node) : null;
    const wrapper = document.createElement('div');
    wrapper.className = ['pdf-page-unit', primary.groupLeadNode ? 'pdf-page-unit--group-opening pdf-page-unit--section' : 'pdf-page-unit--section'].join(' ');
    if (primary.groupKey) wrapper.dataset.pdfGroup = primary.groupKey;
    if (primary.groupLabel) wrapper.dataset.pdfGroupLabel = primary.groupLabel;
    if (primary.blockKey) wrapper.dataset.pdfBlockKey = primary.blockKey;
    wrapper.dataset.pdfBlockKind = 'section-family';
    if (entry.sectionFamilyKey) wrapper.dataset.pdfContinuationFamily = entry.sectionFamilyKey;
    if (entry.sectionFamilyLabel) wrapper.dataset.pdfContinuationLabel = entry.sectionFamilyLabel;
    if (primary.groupLeadNode){
      const leadClone = clonePdfNode(primary.groupLeadNode);
      if (leadClone) wrapper.appendChild(leadClone);
    }
    const sectionBlock = buildPdfSectionBlockNode(primary.sectionNode, primary.bodySourceNodes, {
      continuation: !!primary.sectionContinuation,
      fragmentIndex: primary.fragmentIndex,
      fragmentTotal: primary.fragmentTotal,
      reason: primary.kind || 'section-fragment',
    });
    if (!sectionBlock) return clonePdfNode(primary.node);
    if (entry.sectionFamilyKey) sectionBlock.dataset.pdfContinuationFamily = entry.sectionFamilyKey;
    if (entry.sectionFamilyLabel) sectionBlock.dataset.pdfContinuationLabel = entry.sectionFamilyLabel;
    if (entry.blocks.length > 1){
      sectionBlock.classList.add('pdf-page-block-section--merged');
      sectionBlock.dataset.pdfMergedFragments = String(entry.blocks.length);
      const body = sectionBlock.querySelector('.print-section-body');
      entry.blocks.slice(1).forEach(block => {
        (Array.isArray(block.bodySourceNodes) ? block.bodySourceNodes : []).forEach(node => {
          const clone = clonePdfNode(node);
          if (clone && body) body.appendChild(clone);
        });
      });
    }
    wrapper.appendChild(sectionBlock);
    return wrapper;
  }

  function buildPdfPageEntryNode(entry){
    if (!entry) return null;
    if (safeTrim(entry.renderMode) === 'section-fragment') return buildPdfMergedSectionEntryNode(entry);
    const primary = Array.isArray(entry.blocks) ? entry.blocks[0] : null;
    return primary ? clonePdfNode(primary.node) : null;
  }

  async function buildDomPagedPdf(root, model, signal){
    const host = root && root.querySelector ? root.querySelector('#pdfPageStage') : null;
    const flow = root && root.querySelector ? root.querySelector('#pdfFlowMeasure') : null;
    if (!host || !flow) return false;
    const meta = getReportModeMeta(model, 'pdf');
    const lab = createPdfMeasureLab(root, meta);
    const measureBody = lab && lab.querySelector ? (lab.querySelector('#pdfPageMeasureBody') || lab.querySelector('.pdf-page-body')) : null;
    if (!measureBody) return false;

    setPrintStatus(root, 'Midiendo bloques editoriales…', 'loading');
    await waitForPrintReady(flow, signal);
    await nextPaint(signal);

    const budget = buildPdfPageBudget(measureBody);
    if (!budget) return false;
    const blocks = collectPdfPageBlocksFromFlow(flow);
    for (const block of blocks){
      throwIfAborted(signal);
      block.heightPx = await measurePdfUnitHeight(block.node, measureBody, signal);
      block.bodyHeightPx = safeTrim(block.renderMode) === 'section-fragment'
        ? await measurePdfUnitHeight(buildPdfSectionBodyMeasureNode(block), measureBody, signal)
        : numOrZero(block.heightPx);
    }

    setPrintStatus(root, 'Tejiendo continuidades editoriales entre páginas DOM…', 'loading');
    const pages = [];
    let currentPage = createPdfPageBucket(1);

    for (const block of blocks){
      throwIfAborted(signal);
      if (block.forceBreakBefore && currentPage.entries.length){
        pages.push(currentPage);
        currentPage = createPdfPageBucket(pages.length + 1);
      }
      if (currentPage.entries.length && !canFitPdfBlockOnPage(currentPage, block, budget)){
        pages.push(currentPage);
        currentPage = createPdfPageBucket(pages.length + 1);
      }
      addPdfBlockToPage(currentPage, block, budget);
    }
    if (currentPage.entries.length || !pages.length) pages.push(currentPage);

    setPrintStatus(root, 'Ajustando densidad editorial y remates finales…', 'loading');
    const rebalancedMoves = rebalancePdfPages(pages, budget);

    host.innerHTML = '';
    const totalPages = Math.max(1, pages.length);
    pages.forEach((pageBucket, pageIndex) => {
      const page = buildPdfPageShell(meta, pageIndex + 1, totalPages);
      const body = page.querySelector('.pdf-page-body');
      if (body){
        pageBucket.entries.forEach(entry => {
          const clone = buildPdfPageEntryNode(entry);
          if (clone) body.appendChild(clone);
        });
      }
      host.appendChild(page);
    });

    root.dataset.pdfPaged = 'ready';
    root.dataset.pdfPageCount = String(totalPages);
    root.dataset.pdfPagingEngine = 'route2-final-stage4';
    root.dataset.pdfRebalancedMoves = String(Math.max(0, Math.floor(numOrZero(rebalancedMoves))));
    root.dataset.pdfPageBudgetPx = String(Math.max(1, Math.floor(numOrZero(budget.bodyHeightPx))));
    root.dataset.pdfPageGapPx = String(Math.max(0, Math.floor(numOrZero(budget.gapPx))));
    root.dataset.pdfSectionGapPx = String(Math.max(0, Math.floor(numOrZero(budget.sectionBodyGapPx))));
    root.dataset.pdfHeaderReservePx = String(Math.max(0, Math.floor(numOrZero(budget.headerHeightPx))));
    root.dataset.pdfFooterReservePx = String(Math.max(0, Math.floor(numOrZero(budget.footerHeightPx))));
    root.dataset.pdfRebalanceReservePx = String(Math.max(0, Math.floor(numOrZero(budget.rebalanceBottomReservePx))));

    measureBody.innerHTML = '';
    setPrintStatus(root, rebalancedMoves ? `Documento repartido por páginas DOM con compactación editorial (${rebalancedMoves} ajuste${rebalancedMoves === 1 ? '' : 's'}).` : 'Documento repartido por páginas DOM con presupuesto real.', 'loading');
    await waitForPrintReady(host, signal);
    return true;
  }

  function mountPdfRoot(root){
    resetPrintSurface();
    $app.innerHTML = '';
    if ($printRoot) $printRoot.appendChild(root);
    else $app.appendChild(root);
  }

  function renderPdfNotFound(){
    const root = el(`
      <section class="pdf-document-shell print-screen" aria-label="Reporte PDF oficial" data-pdf-layout="dom-pages">
        <div class="pdf-document-stage pdf-page-stage">
          <section class="pdf-page" data-pdf-page="1">
            <div class="pdf-page-frame">
              <header class="pdf-page-header">
                <div class="pdf-page-brand">
                  <div class="print-brand">
                    <img class="print-logo" src="assets/icons/icon-192.png" alt="" />
                    <span>POKERITO</span>
                  </div>
                  <div class="pdf-page-kicker">Documento oficial</div>
                </div>
                <div class="pdf-page-session-meta">
                  <div class="pdf-page-session-title">Sesión no encontrada</div>
                  <div class="pdf-page-session-ref">PDF oficial</div>
                </div>
                <div class="pdf-page-counter">Página 1/1</div>
              </header>
              <div class="pdf-page-body"><div class="empty">Sesión no encontrada.</div></div>
              <footer class="pdf-page-footer">
                <div class="pdf-page-footer-left">—</div>
                <div class="pdf-page-footer-center">Pokerito · PDF oficial</div>
                <div class="pdf-page-footer-right">1/1</div>
              </footer>
            </div>
          </section>
        </div>
      </section>
    `);
    mountPdfRoot(root);
  }

  function buildPdfScreenRoot(model){
    const meta = getReportModeMeta(model, 'pdf');
    const content = buildPdfDocumentSections(model, 'pdf');
    return el(`
      <section class="pdf-document-shell print-screen" aria-label="Reporte PDF oficial" data-pdf-layout="dom-pages">
        <div class="print-actions">
          <div class="print-status" id="printStatus" role="status" aria-live="polite" data-tone="muted">Preparando páginas oficiales…</div>
          <div class="print-action-buttons">
            <button class="btn primary" type="button" id="printBtn" disabled>Imprimir / Guardar PDF oficial</button>
          </div>
        </div>

        <div class="pdf-document-stage pdf-page-stage" id="pdfPageStage"></div>

        <div class="pdf-document-flow-sandbox" id="pdfFlowSandbox" aria-hidden="true">
          <div class="pdf-document-sheet pdf-document-flow" id="pdfFlowMeasure">
            ${buildPdfDocumentHeadMarkup(meta)}
            <div class="pdf-document-content print-content">${content}</div>
          </div>
        </div>
      </section>
    `);
  }


  function buildScreenReportReaderRoot(model){
    const meta = getReportModeMeta(model, 'screen');
    const content = buildPdfDocumentSections(model, 'screen');
    return el(`
      <section class="screen screen--historial-detail screen--report-reader" aria-label="Reporte premium en pantalla">
        <div class="mesa-head report-reader-head">
          <div class="mesa-title">
            <div class="report-reader-kicker">${escapeHtml(meta.kicker)}</div>
            <div class="mesa-h1">${escapeHtml(meta.sessionTitle)} <span class="badge">${escapeHtml(meta.sessionDateLabel)}</span></div>
            <div class="mesa-sub">${escapeHtml(meta.lead)}</div>
          </div>
          <div class="row panel-actions history-detail-actions report-reader-actions">
            <button class="btn primary" type="button" id="screenReportPdfBtn">Exportar PDF oficial</button>
            <button class="btn" type="button" id="screenReportMesaBtn">Ver mesa</button>
          </div>
        </div>

        ${buildReportModePanelMarkup(meta, 'Lectura en pantalla')}

        <div class="report-reader-shell" aria-label="Reporte premium continuo">
          <div class="report-reader-brandbar">
            <div class="print-brand">
              <img class="print-logo" src="assets/icons/icon-192.png" alt="" />
              <span>POKERITO</span>
            </div>
            <div class="report-reader-chip">Modo pantalla</div>
          </div>

          <div class="report-reader-content print-content">${content}</div>
        </div>
      </section>
    `);
  }

  function bindPdfPrintFlow(root, opts){
    const options = opts && typeof opts === 'object' ? opts : {};
    const printBtn = root && root.querySelector ? root.querySelector('#printBtn') : null;
    const signal = options.signal;
    const isStalePrintRender = typeof options.isStalePrintRender === 'function' ? options.isStalePrintRender : (() => false);
    const setPrintTitle = typeof options.setPrintTitle === 'function' ? options.setPrintTitle : (() => {});
    let printInFlight = null;
    let lastPrintAt = 0;

    async function runPrintFlow(){
      if (printInFlight) return printInFlight;
      printInFlight = (async () => {
        try{
          setPrintStatus(root, 'Preparando páginas oficiales…', 'loading');
          if (printBtn) printBtn.disabled = true;
          await buildDomPagedPdf(root, options.model || null, signal);
          if (isStalePrintRender()) return false;
          setPrintStatus(root, 'Documento listo en páginas DOM presupuestadas.', 'loading');
          await waitForPrintReady(root, signal);
          if (isStalePrintRender()) return false;
          try{ window.scrollTo(0, 0); }catch(e){}
          await nextPaint(signal);
          if (isStalePrintRender()) return false;
          setPrintStatus(root, 'Documento listo para imprimir.', 'ready');
          if (printBtn) printBtn.disabled = false;
          const now = Date.now();
          if ((now - lastPrintAt) < 1200) return false;
          lastPrintAt = now;
          try{ setPrintTitle(); }catch(e){}
          try{ window.print(); }catch(err){
            setPrintStatus(root, 'No se pudo abrir la impresión del navegador.', 'error');
            throw err;
          }
          return true;
        }catch(err){
          if (isAbortError(err) || isStalePrintRender()) return false;
          setPrintStatus(root, 'Hubo un problema preparando el PDF.', 'error');
          throw err;
        }finally{
          printInFlight = null;
          if (printBtn && !isStalePrintRender()) printBtn.disabled = false;
        }
      })();
      return printInFlight;
    }

    if (printBtn){
      printBtn.addEventListener('click', () => {
        runPrintFlow().catch(() => {});
      });
    }

    runPrintFlow().catch(() => {});
  }

  // ===== Etapa 2: Reporte PDF (imprimible, landscape) =====
  function renderPdf(){
    const q = getHashQuery();
    const id = (q.get('id') || '').trim();
    const s = id ? getSessionById(id) : null;
    if (!s){
      renderPdfNotFound();
      return;
    }

    ensureSessionGame(s);

    try{
      if (s.status === 'closed'){
        const changed = assignPdfSeqIfNeeded(s);
        if (changed) saveSession(s);
      }
    }catch(e){}

    const prevTitle = document.title;
    const ddmmyyyy = sessionDDMMYYYY(s);
    const seqNum = (Number.isFinite(s.pdfSeq) && Math.floor(s.pdfSeq) >= 1) ? Math.floor(s.pdfSeq) : 0;
    const printTitle = `${pad3(seqNum)}_Pokerito_${ddmmyyyy}`;
    const renderSerial = ++pdfRenderSerial;
    const printAbort = (typeof AbortController !== 'undefined') ? new AbortController() : { signal: { aborted: false }, abort(){ this.signal.aborted = true; } };

    function isStalePrintRender(){
      return renderSerial !== pdfRenderSerial || !!(printAbort.signal && printAbort.signal.aborted);
    }

    function setPrintTitle(){
      try{ document.title = printTitle; }catch(e){}
    }
    function restoreTitle(){
      try{ clearSemanticPdfPagination($printRoot || document.getElementById('printRoot')); }catch(e){}
      try{ document.title = prevTitle; }catch(e){}
    }

    setPrintTitle();
    try{ window.addEventListener('afterprint', restoreTitle, { once: true }); }catch(e){}
    try{ window.addEventListener('focus', restoreTitle, { once: true }); }catch(e){}

    const model = buildPdfDocumentModel(s);
    const root = buildPdfScreenRoot(model);
    mountPdfRoot(root);

    bindPdfPrintFlow(root, {
      signal: printAbort.signal,
      isStalePrintRender,
      setPrintTitle,
      model,
    });
  }

// ===== Etapa 7: Ranking global (sin tiempo) =====
  function renderRanking(){
    const a = computeAnalytics();
    const root = el(`
      <section class="screen screen--ranking" aria-label="Ranking">
        <h1 class="screen-title">Ranking</h1>
        <p class="screen-sub">Archivo · comparativo histórico entre jugadores. Orden oficial: neto acumulado, ROI, victorias y sesiones jugadas.</p>

        <div class="panel" role="region" aria-label="Ranking">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Comparativo entre jugadores</div>
            <div class="row panel-actions">
              <button class="btn" type="button" id="toHistBtn">Historial</button>
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
                      <div class="rank-pos">#${escapeHtml(String(r.rankPos || (idx + 1)))}</div>
                      <div class="rank-who">
                        <div class="rank-name">${escapeHtml(r.display)}</div>
                        <div class="rank-sub">Partidas: ${escapeHtml(String(r.games))} · Veces #1: ${escapeHtml(String(r.wins1))} · Podios: ${escapeHtml(String(numOrZero(r.podiums)))}</div>
                      </div>
                    </div>
                    <div class="rank-right">
                      <div class="rank-net net ${netClass}">${escapeHtml(formatMoney(r.netTotal))}</div>
                      <div class="rank-mini">ROI: <b>${escapeHtml(formatPercent(numOrZero(r.roiGlobal)))}</b> · Promedio: <b>${escapeHtml(formatMoney(numOrZero(r.avgNet)))}</b></div>
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

    document.getElementById('toHistBtn').addEventListener('click', () => navigate('/archivo/historial'));
  }

  function renderMesaSession(session, { readOnly, backPath, badge }){
    const s = ensureSessionRosterIntegrity(session);
    const players = Array.isArray(s.playersSnapshot) ? s.playersSnapshot : [];
    const chips = Array.isArray(s.chipsSnapshot) ? s.chipsSnapshot : [];
    const chipValueMap = new Map(chips.map(c => [c.id, numOrZero(c.value)]));
    const pStateMap = new Map((s.game && Array.isArray(s.game.players) ? s.game.players : []).map(p => [p.id, p]));
    const canMutateSession = !readOnly && safeTrim(s.status) !== 'closed';

    const sum = calcSessionSummary(s);
    const deltaClass = Math.abs(sum.delta) < 0.0001 ? 'ok' : (sum.delta > 0 ? 'pos' : 'neg');

    const root = el(`
      <section class="screen screen--mesa mesa-screen" aria-label="Mesa">
        <div class="mesa-head mesa-head-active">
          <div class="mesa-title">
            <div class="mesa-h1">Mesa <span class="badge">${escapeHtml(badge || '')}</span></div>
            <div class="mesa-sub">${escapeHtml(String(s.date || ''))} · ${escapeHtml(String(players.length))} jugadores · snapshot ${escapeHtml(String(chips.length))} fichas</div>
          </div>
          ${canMutateSession ? `
            <div class="row mesa-head-actions">
              <button class="btn" type="button" id="lateJoinBtn">Agregar jugador</button>
              <button class="btn danger" type="button" id="closeBtn">Cerrar Partida</button>
            </div>
          ` : ''}
        </div>

        <div class="panel mesa-summary-panel" role="region" aria-label="Cuadre">
          <div class="kpi-row mesa-kpi-row">
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

        <div class="mesa-grid mesa-active-grid" aria-live="polite" style="margin-top:14px">
          ${players.length ? players.map(p => {
            const disp = (p && p.display) ? String(p.display) : playerDisplayName(p);
            const name = (p && p.name) ? String(p.name) : '';
            const st = pStateMap.get(p.id) || { id: p.id, buyIn: 0, rebuys: [], counts: {} };
            const totals = calcPlayerTotals(st, chipValueMap);
            const netClass = Math.abs(totals.neto) < 0.0001 ? 'ok' : (totals.neto > 0 ? 'pos' : 'neg');
            return `
              <article class="mesa-player mesa-player-card" data-pid="${escapeAttr(p.id)}">
                <div class="mesa-player-top">
                  <div class="mesa-player-ident">
                    <div class="mesa-player-nick">${escapeHtml(disp || 'Sin nombre')}</div>
                    <div class="mesa-player-name">${escapeHtml((name || '').trim())}</div>
                  </div>
                  <div class="rebuy-box mesa-rebuy-box">
                    <button class="btn small" type="button" data-act="rebuy" ${canMutateSession ? '' : 'disabled'}>+ Rebuy</button>
                    <div class="rebuy-meta"><span class="k">Rebuys</span><span class="v" data-role="rebuyCount">${escapeHtml(String((st.rebuys||[]).length))}</span></div>
                  </div>
                </div>

                <div class="buyin-block mesa-buyin-block">
                  <label class="field compact">
                    <span>Buy-in</span>
                    <input class="buyin" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="done" placeholder="0" value="${escapeAttr(String(numOrZero(st.buyIn) || ''))}" ${canMutateSession ? '' : 'disabled'} />
                  </label>
                </div>

                <div class="chips-block mesa-chips-block">
                  ${chips.length ? chips.map(c => {
                    const color = normHex(c.color) || '#888888';
                    const value = numOrZero(c.value);
                    const count = numOrZero((st.counts||{})[c.id]);
                    return `
                      <div class="chip-row mesa-chip-row" data-cid="${escapeAttr(c.id)}">
                        <div class="chip-mini">
                          <div class="chip-mini-ico">${chipIconSvg(color, 28)}</div>
                          <div class="chip-mini-meta">
                            <div class="chip-mini-name">${escapeHtml(String(c.name || ''))}</div>
                            <div class="chip-mini-val">${escapeHtml(formatMoney(value))}</div>
                          </div>
                        </div>
                        <div class="counter mesa-counter">
                          <button class="num-btn" type="button" data-act="dec" ${canMutateSession ? '' : 'disabled'}>−</button>
                          <button class="num" type="button" data-act="edit" ${canMutateSession ? '' : 'disabled'}>${escapeHtml(String(count))}</button>
                          <button class="num-btn" type="button" data-act="inc" ${canMutateSession ? '' : 'disabled'}>+</button>
                        </div>
                      </div>
                    `;
                  }).join('') : `<div class="empty">No hay fichas en el snapshot.</div>`}
                </div>

                <div class="totals-block mesa-totals-block">
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

    const $close = document.getElementById('closeBtn');
    if ($close){
      $close.addEventListener('click', async () => {
        if (!canMutateSession || closeBusy) return;
        closeBusy = true;
        try{
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
        } finally {
          closeBusy = false;
        }
      });
    }

    const $lateJoin = document.getElementById('lateJoinBtn');
    let lateJoinBusy = false;
    let closeBusy = false;
    let sessionDialogBusy = false;
    if ($lateJoin){
      $lateJoin.addEventListener('click', async () => {
        if (!canMutateSession || lateJoinBusy) return;
        lateJoinBusy = true;
        $lateJoin.disabled = true;

        try{
          const liveSession = getSessionById(s.id);
          if (!liveSession || safeTrim(liveSession.status) === 'closed') {
            showToast({ tone: 'error', title: 'No disponible', body: lateJoinReasonMessage(liveSession ? 'closed' : 'missing-session', { session: liveSession || s }) });
            return;
          }

          const pid = await lateJoinPlayerDialog({ session: liveSession });
          if (!pid) return;

          const player = getPlayers().find(p => sameStableEntity(p, pid)) || null;
          const playerName = playerDisplayName(player || { id: pid, name: '', nick: '' }) || 'Ese jugador';
          const ok = await confirmDialog({
            title: 'Confirmar agregado',
            body: `Se agregará ${playerName} a la partida ${lateJoinSessionLabel(liveSession)}. Entrará con buy-in 0, sin rebuys y sin fichas cargadas.`,
            okText: 'Agregar',
            cancelText: 'Cancelar',
          });
          if (!ok) return;

          const result = addExistingActivePlayerToDraftSession(liveSession.id, pid);
          if (!result.ok) {
            showToast({ tone: (result.reason === 'no-candidates' ? 'info' : 'error'), title: 'No se agregó', body: lateJoinReasonMessage(result.reason, { session: result.session || liveSession, playerName }) });
            return;
          }

          const nextSession = result.session || getSessionById(liveSession.id) || liveSession;
          showToast({ tone: 'success', title: 'Jugador agregado', body: `${playerName} ya forma parte de ${lateJoinSessionLabel(nextSession)}.` });
          renderMesaSession(nextSession, { readOnly, backPath, badge });
        } finally {
          lateJoinBusy = false;
          const freshBtn = document.getElementById('lateJoinBtn');
          if (freshBtn) freshBtn.disabled = false;
        }
      });
    }

    // buyin change
    root.querySelectorAll('input.buyin').forEach(inp => {
      hardenNumericInput(inp, { selectOnFocus: true });
      inp.addEventListener('input', () => {
        if (!canMutateSession) return;
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
        if (!canMutateSession) return;
        const act = btn.getAttribute('data-act');
        const card = btn.closest('.mesa-player');
        if (!card) return;
        const pid = card.getAttribute('data-pid');
        if (!pid) return;

        if (act === 'rebuy'){
          if (sessionDialogBusy) return;
          sessionDialogBusy = true;
          try{
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
          } finally {
            sessionDialogBusy = false;
          }
        }

        const row = btn.closest('.chip-row');
        const cid = row ? row.getAttribute('data-cid') : '';
        if (!cid) return;
        const st = ensurePlayerState(s, pid);
        if (!st.counts || typeof st.counts !== 'object') st.counts = {};
        const raw = Object.prototype.hasOwnProperty.call(st.counts, cid) ? st.counts[cid] : undefined;
        const exists = (raw !== undefined && raw !== null);
        const cur = exists ? numOrZero(raw) : 0;

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
          if (sessionDialogBusy) return;
          sessionDialogBusy = true;
          try{
            const amt = await numberInputDialog({
              title: 'Cantidad de fichas',
              body: 'Escribe la cantidad exacta',
              value: (exists ? String(cur) : ''),
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
          } finally {
            sessionDialogBusy = false;
          }
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

  
function renderAdministracion(){
    const analytics = computeAnalytics();
    const players = getPlayers();
    const chips = getChips();
    const totalPlayers = players.length;
    const activePlayers = players.filter(player => player && player.active !== false).length;
    const totalChips = chips.length;
    const activeChips = chips.filter(chip => chip && chip.active !== false).length;
    const closedSessionsCount = Array.isArray(analytics && analytics.summaryRows) ? analytics.summaryRows.length : 0;

    const root = el(`
      <section class="screen screen--config" aria-label="Administración">
        <div class="panel module-hero module-hero--admin" role="region" aria-label="Hero de Administración">
          <div class="module-hero__layout">
            <div class="module-hero__copy">
              <div class="module-hero__eyebrow">Casa operativa</div>
              <h1 class="screen-title module-hero__title">Administración</h1>
              <p class="screen-sub module-hero__sub">Casa operativa del sistema: gestión clara de jugadores, fichas y mantenimiento local, sin mezclar archivo con mesa.</p>
              <div class="module-hero__stats" aria-label="Resumen operativo">
                <article class="module-hero__stat">
                  <div class="module-hero__stat-label">Jugadores</div>
                  <div class="module-hero__stat-value">${escapeHtml(String(totalPlayers))}</div>
                  <div class="module-hero__stat-note">${escapeHtml(String(activePlayers))} activo${activePlayers === 1 ? '' : 's'} en mesa.</div>
                </article>
                <article class="module-hero__stat">
                  <div class="module-hero__stat-label">Fichas</div>
                  <div class="module-hero__stat-value">${escapeHtml(String(totalChips))}</div>
                  <div class="module-hero__stat-note">${escapeHtml(String(activeChips))} activa${activeChips === 1 ? '' : 's'} para juego.</div>
                </article>
                <article class="module-hero__stat">
                  <div class="module-hero__stat-label">Sesiones cerradas</div>
                  <div class="module-hero__stat-value">${escapeHtml(String(closedSessionsCount))}</div>
                  <div class="module-hero__stat-note">Base histórica lista para estadísticas y PDF.</div>
                </article>
              </div>
              <div class="row panel-actions module-hero__actions" style="gap:10px; flex-wrap:wrap; margin-top:14px">
                <button class="btn" type="button" data-admin-jump="adminPlayersSection">Jugadores</button>
                <button class="btn" type="button" data-admin-jump="adminChipsSection">Fichas</button>
                <button class="btn" type="button" data-admin-jump="adminBackupSection">Respaldo</button>
                <button class="btn" type="button" data-admin-jump="adminAppearanceSection">Apariencia</button>
              </div>
            </div>
            <div class="module-hero__media" aria-hidden="true">
              <div class="module-hero__media-shell">
                <img class="module-hero__img module-hero__img--cover module-hero__img--admin" src="assets/hero/hero_admin.png" alt="" decoding="async" loading="lazy" />
              </div>
              <div class="module-hero__caption">Administración concentra lo operativo: aquí se ajusta la mesa de hoy sin contaminar la lectura histórica que vive en Archivo.</div>
            </div>
          </div>
        </div>

        <div class="panel" role="region" aria-label="Mapa operativo">
          <div class="panel-title">Estructura operativa</div>
          <div class="small-note" style="margin-top:10px">Administración queda cerrada como casa interna del sistema. <b>Archivo</b> conserva historial, detalle de sesiones cerradas, ranking y PDF.</div>
          <div class="row panel-actions" style="gap:10px; flex-wrap:wrap; margin-top:12px">
            <button class="btn" type="button" data-admin-jump="adminPlayersSection">Jugadores</button>
            <button class="btn" type="button" data-admin-jump="adminChipsSection">Fichas</button>
            <button class="btn" type="button" data-admin-jump="adminAppearanceSection">Apariencia</button>
            <button class="btn" type="button" data-admin-jump="adminBackupSection">Respaldo / Importación</button>
            <button class="btn" type="button" data-admin-jump="adminRecalcSection">Recalcular</button>
            <button class="btn danger" type="button" data-admin-jump="adminClearSection">Borrar</button>
          </div>
        </div>

        <div class="panel" id="adminPlayersSection" role="region" aria-label="Jugadores" style="margin-top:14px">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Jugadores</div>
            <button class="btn primary" type="button" id="addPlayerBtn">Agregar jugador</button>
          </div>
          <div class="small-note" style="margin-top:10px">Alta, edición y estado de jugadores. La mini ficha actual de estadísticas se mantiene como vista rápida de gestión.</div>

          <div class="player-grid" id="playerGrid" aria-live="polite"></div>

          <div class="small-note">En <b>Juego</b> se mostrará el <b>Apodo</b>. Si está vacío, se usa el nombre. Estadísticas calculadas desde sesiones cerradas.</div>
        </div>

        <div class="panel" id="adminChipsSection" role="region" aria-label="Fichas" style="margin-top:14px">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Fichas</div>
            <button class="btn primary" type="button" id="addChipBtn">Agregar ficha</button>
          </div>
          <div class="small-note" style="margin-top:10px">Catálogo operativo de fichas para la mesa. Puedes editar, activar o desactivar sin romper el historial futuro.</div>

          <div class="chip-grid" id="chipGrid" aria-live="polite"></div>

          <div class="small-note">“Desactivar” no borra: solo la saca del uso operativo.</div>
        </div>

        <div class="panel admin-utility-panel" id="adminAppearanceSection" role="region" aria-label="Apariencia" style="margin-top:14px">
          <div class="panel-title">Apariencia</div>
          <div class="small-note" style="margin-top:10px">Preferencia visual local para trabajar cómodo dentro de la app.</div>
          <div class="segmented" role="radiogroup" aria-label="Tema">
            <button class="seg" type="button" data-theme="auto" aria-checked="false" role="radio">Automático</button>
            <button class="seg" type="button" data-theme="light" aria-checked="false" role="radio">Claro</button>
            <button class="seg" type="button" data-theme="dark" aria-checked="false" role="radio">Oscuro</button>
          </div>
          <div class="small-note" style="margin-top:10px">Automático sigue el tema del sistema. Claro/Oscuro lo fuerzan.</div>
        </div>

        <div class="panel admin-utility-panel" id="adminBackupSection" role="region" aria-label="Respaldo e importación" style="margin-top:14px">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Respaldo / Importación</div>
            <div class="row panel-actions admin-utility-actions" style="gap:10px; flex-wrap:wrap">
              <button class="btn" type="button" id="exportExcelBtn">Exportar Excel</button>
              <button class="btn" type="button" id="exportJsonBtn">Exportar JSON</button>
              <label class="btn primary file-trigger" id="importJsonBtn" for="importFile">
                <span id="importJsonBtnText">Importar JSON</span>
                <input id="importFile" class="file-native" type="file" accept=".json,application/json" />
              </label>
            </div>
          </div>
          <div class="small-note" style="margin-top:10px">Exporta respaldo local, comparte base en JSON o saca un Excel para revisión externa. La importación valida primero, muestra vista previa útil y protege la base antes de aplicar cambios.</div>
          <div class="small-note" id="importStatusNote" style="margin-top:10px"></div>
        </div>

        <div class="panel admin-utility-panel" id="adminRecalcSection" role="region" aria-label="Recalcular estadísticas" style="margin-top:14px">
          <div class="panel-title">Recalcular estadísticas</div>
          <div class="small-note" style="margin-top:10px">Reconstruye ranking, récords y estadísticas usando las sesiones cerradas como fuente.</div>
          <div class="row panel-actions admin-utility-actions" style="gap:10px; flex-wrap:wrap; margin-top:12px">
            <button class="btn" type="button" id="recalcBtn">Recalcular estadísticas</button>
          </div>
        </div>

        <div class="panel admin-utility-panel" id="adminClearSection" role="region" aria-label="Borrar datos locales" style="margin-top:14px">
          <div class="panel-title">Borrar datos locales</div>
          <div class="small-note" style="margin-top:10px">Limpieza total de esta instalación local. No toca otros dispositivos, pero aquí sí borra jugadores, fichas y sesiones.</div>
          <div class="row panel-actions admin-utility-actions" style="gap:10px; flex-wrap:wrap; margin-top:12px">
            <button class="btn danger" type="button" id="clearBtn">Borrar datos locales</button>
          </div>
        </div>

        <div class="panel admin-utility-panel admin-update-panel" id="adminUpdateSection" role="region" aria-label="Versión y actualización" style="margin-top:14px">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Versión y actualización</div>
            <button class="btn secondary" type="button" id="checkUpdateBtn">Buscar actualización</button>
          </div>
          <div class="small-note" style="margin-top:10px">Confirma qué edición visible está abierta, revisa si ya hay una más reciente y aplícala desde este mismo flujo cuando esté lista.</div>
          <div class="admin-update-strip">
            <div class="admin-update-card admin-update-card--version">
              <div class="admin-update-kicker">Versión visible</div>
              <div class="admin-update-version" id="adminVisibleVersion">—</div>
              <div class="admin-update-build" id="adminVisibleBuild"></div>
            </div>
            <div class="admin-update-card admin-update-card--status">
              <div class="admin-update-status-head">
                <span class="pill admin-update-pill is-neutral" id="adminUpdateStatusPill">Pendiente</span>
              </div>
              <div class="small-note admin-update-copy" id="adminUpdateStatusText" style="margin-top:10px"></div>
              <div class="small-note admin-update-compare" id="adminUpdateCompare" style="margin-top:8px; display:none"></div>
              <div class="small-note admin-update-checked" id="adminUpdateCheckedAt" style="margin-top:8px; display:none"></div>
            </div>
          </div>
        </div>

      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    root.querySelectorAll('[data-admin-jump]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-admin-jump');
        const target = targetId ? document.getElementById(targetId) : null;
        if (!target) return;
        try{
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (e) {
          try{ target.scrollIntoView(); }catch(_e){}
        }
      });
    });

    document.getElementById('exportExcelBtn').addEventListener('click', () => exportExcel());
    wireAdminUtilities();
    renderAdminUpdateUi();

    // Players
    const $pgrid = document.getElementById('playerGrid');

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

    // Chips
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

    renderPlayers();
    renderChips();
  }


  function formatArchiveJoin(names){
    const list = (Array.isArray(names) ? names : []).map(v => safeTrim(v)).filter(Boolean);
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    if (list.length === 2) return `${list[0]} y ${list[1]}`;
    return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
  }

  function getArchiveRegisteredPlayersCount(analytics){
    const ids = new Set();
    getPlayers().forEach(player => {
      const id = stableEntityId(player);
      if (id) ids.add(id);
    });
    if (analytics && analytics.byPlayer instanceof Map){
      analytics.byPlayer.forEach((_, id) => {
        const key = safeTrim(id);
        if (key) ids.add(key);
      });
    }
    return ids.size;
  }

  function getArchiveLeaderLabel(analytics){
    const ranking = Array.isArray(analytics && analytics.ranking) ? analytics.ranking : [];
    if (!ranking.length) return '—';
    const leaders = ranking
      .filter(row => Math.floor(numOrZero(row && row.rankPos)) === 1)
      .map(row => safeTrim(row && row.display))
      .filter(Boolean);
    if (!leaders.length) return '—';
    if (leaders.length === 1) return leaders[0];
    return `Empate: ${formatArchiveJoin(leaders)}`;
  }

  function getArchiveLatestSummary(analytics){
    const summaryRows = Array.isArray(analytics && analytics.summaryRows) ? analytics.summaryRows.slice() : [];
    summaryRows.sort((a, b) => {
      const delta = numOrZero(b && b.ts) - numOrZero(a && a.ts);
      if (Math.abs(delta) > 0.0001) return delta;
      return String(b && b.date || '').localeCompare(String(a && a.date || ''), 'es', { sensitivity: 'base' });
    });
    const latest = summaryRows[0] || null;
    if (!latest) return { date: '—', winner: '—', caption: 'Sin sesiones cerradas todavía.' };

    const date = safeTrim(latest && latest.date) || '—';
    const winnerIds = Array.isArray(latest && latest.winnerIds) ? latest.winnerIds.filter(Boolean) : [];
    const winnerLabel = safeTrim(latest && latest.winner);
    let winner = 'Ganador no determinable';
    let caption = 'Dato leído desde la sesión cerrada más reciente.';

    if (winnerIds.length > 1 && winnerLabel){
      winner = `Empate: ${winnerLabel}`;
      caption = 'Empate detectado en la sesión cerrada más reciente.';
    }else if (winnerIds.length === 1 && winnerLabel){
      winner = winnerLabel;
    }else if (!winnerIds.length && winnerLabel && winnerLabel !== '—'){
      winner = winnerLabel;
      caption = 'Resultado importado/legacy con salida prudente.';
    }else if (numOrZero(latest && latest.playersCount) <= 0.0001){
      winner = 'Sin jugadores válidos';
      caption = 'La sesión más reciente no expone un ganador seguro.';
    }

    return { date, winner, caption };
  }

  function getArchiveProfileRows(analytics){
    const byPlayer = analytics && analytics.byPlayer instanceof Map ? analytics.byPlayer : new Map();
    const ranking = Array.isArray(analytics && analytics.ranking) ? analytics.ranking : [];
    const rankingMap = new Map(ranking.map(row => [safeTrim(row && row.id), row]));
    const masterMap = new Map(getPlayers().filter(p => stableEntityId(p)).map(p => [stableEntityId(p), p]));
    const ids = uniqStrings([
      ...getPlayers().map(stableEntityId),
      ...Array.from(byPlayer.keys()).map(id => safeTrim(id)),
    ]);

    return ids.map(id => {
      const master = masterMap.get(id) || null;
      const hist = byPlayer.get(id) || null;
      const rankingRow = rankingMap.get(id) || null;
      const display = safeTrim((master && playerDisplayName(master)) || (hist && hist.display) || id || 'Jugador');
      const legalName = safeTrim(master && master.name);
      const nick = safeTrim(master && master.nick);
      const identity = legalName && nick && legalName.localeCompare(nick, 'es', { sensitivity: 'base' }) !== 0
        ? `${legalName} · ${nick}`
        : (legalName || nick || (master ? 'Sin detalle adicional' : 'Detectado desde historial'));
      const games = Math.floor(numOrZero(hist && hist.games));
      const wins = Math.floor(numOrZero(hist && hist.wins1));
      const net = numOrZero(hist && hist.netTotal);
      const managed = !!master;
      const active = !!(master && master.active);
      const primaryName = legalName || display;
      const nickLabel = nick && primaryName && nick.localeCompare(primaryName, 'es', { sensitivity: 'base' }) === 0 ? '—' : (nick || '—');
      return {
        id,
        display,
        legalName,
        nick,
        primaryName,
        nickLabel,
        identity,
        managed,
        active,
        statusLabel: managed ? (active ? 'Activo' : 'Inactivo') : 'Solo historial',
        games,
        wins,
        podiums: Math.floor(numOrZero(hist && hist.podiums)),
        net,
        avgNet: numOrZero(hist && hist.avgNet),
        roiGlobal: numOrZero(hist && hist.roiGlobal),
        rankPos: Math.floor(numOrZero(rankingRow && rankingRow.rankPos)),
        lastSessionDate: safeTrim(hist && hist.lastSession && hist.lastSession.date) || 'Sin sesiones cerradas',
        lastSessionRef: safeTrim(hist && hist.lastSession && hist.lastSession.sessionRef) || '',
        bestNet: numOrZero(hist && hist.best && hist.best.net),
        bestDate: safeTrim(hist && hist.best && hist.best.date) || '—',
        bestSessionRef: safeTrim(hist && hist.best && hist.best.sessionRef) || '',
        worstNet: numOrZero(hist && hist.worst && hist.worst.net),
        worstDate: safeTrim(hist && hist.worst && hist.worst.date) || '—',
        worstSessionRef: safeTrim(hist && hist.worst && hist.worst.sessionRef) || '',
      };
    }).sort((a, b) => {
      const bucketA = a.managed ? (a.active ? 0 : 1) : 2;
      const bucketB = b.managed ? (b.active ? 0 : 1) : 2;
      if (bucketA !== bucketB) return bucketA - bucketB;
      const nameCmp = a.display.localeCompare(b.display, 'es', { sensitivity: 'base' });
      if (nameCmp) return nameCmp;
      return String(a.id).localeCompare(String(b.id), 'es', { sensitivity: 'base' });
    });
  }

  function getArchiveProfileHistoricalSnapshots(profileId){
    const id = safeTrim(profileId);
    if (!id) return [];
    const closed = sortSessionsForAnalytics(getClosedSessions());
    const snapshots = [];

    closed.forEach((session, idx) => {
      const slice = closed.slice(0, idx + 1);
      const partial = computeAnalyticsFromSessions(slice);
      const ranking = Array.isArray(partial && partial.ranking) ? partial.ranking : [];
      const rankRow = ranking.find(item => sameStableEntity(item && item.id, id)) || null;
      const histRow = partial && partial.byPlayer instanceof Map ? (partial.byPlayer.get(id) || null) : null;
      if (!rankRow && !histRow) return;
      snapshots.push({
        sessionId: safeTrim(session && session.id),
        sessionRef: pdfSessionReferenceLabel(session),
        date: safeTrim(session && session.date),
        ts: getSessionSortTs(session),
        rankPos: Math.floor(numOrZero(rankRow && rankRow.rankPos)),
        games: Math.floor(numOrZero((rankRow && rankRow.games) || (histRow && histRow.games))),
        netTotal: numOrZero((rankRow && rankRow.netTotal) || (histRow && histRow.netTotal)),
        roiGlobal: numOrZero((rankRow && rankRow.roiGlobal) || (histRow && histRow.roiGlobal)),
      });
    });

    return snapshots;
  }

  function buildArchiveProfileCurrentStreak(timeline){
    const list = (Array.isArray(timeline) ? timeline : []).slice().sort((a, b) => {
      const dt = numOrZero(a && a.ts) - numOrZero(b && b.ts);
      if (Math.abs(dt) > 0.0001) return dt;
      return String(a && a.sessionId || '').localeCompare(String(b && b.sessionId || ''), 'es', { sensitivity: 'base' });
    });
    if (!list.length){
      return { tone: 'flat', length: 0, label: 'Sin racha todavía', note: 'Todavía no hay sesiones cerradas para este jugador.' };
    }

    const eps = 0.0001;
    const last = list[list.length - 1];
    const lastNet = numOrZero(last && last.net);
    let tone = 'flat';
    let type = 'flat';
    let predicate = item => Math.abs(numOrZero(item && item.net)) <= eps;

    if (last && last.isWin){
      tone = 'up';
      type = 'win';
      predicate = item => !!(item && item.isWin);
    }else if (last && last.isItm){
      tone = 'up';
      type = 'itm';
      predicate = item => !!(item && item.isItm);
    }else if (lastNet < -eps){
      tone = 'down';
      type = 'loss';
      predicate = item => numOrZero(item && item.net) < -eps;
    }

    let length = 0;
    for (let idx = list.length - 1; idx >= 0; idx -= 1){
      if (!predicate(list[idx])) break;
      length += 1;
    }

    const context = formatRecordSessionContext(last);
    if (type === 'win') return { tone, length, label: `${length} ${length === 1 ? 'victoria seguida' : 'victorias seguidas'}`, note: `La racha llega hasta ${context}.` };
    if (type === 'itm') return { tone, length, label: `${length} ${length === 1 ? 'cobro seguido' : 'cobros seguidos'}`, note: `Viene cobrando desde ${formatRecordSessionContext(list[list.length - length])}.` };
    if (type === 'loss') return { tone, length, label: `${length} ${length === 1 ? 'sesión en rojo' : 'sesiones en rojo'}`, note: `El tramo reciente viene bajo presión hasta ${context}.` };
    return { tone, length, label: `${length} ${length === 1 ? 'sesión pareja' : 'sesiones parejas'}`, note: `El cierre más reciente quedó prácticamente en equilibrio (${context}).` };
  }

  function buildArchiveProfileTrend(row, timeline, snapshots){
    const list = (Array.isArray(timeline) ? timeline : []).slice().sort((a, b) => {
      const dt = numOrZero(a && a.ts) - numOrZero(b && b.ts);
      if (Math.abs(dt) > 0.0001) return dt;
      return String(a && a.sessionId || '').localeCompare(String(b && b.sessionId || ''), 'es', { sensitivity: 'base' });
    });
    const recent = list.slice(-3);
    const recentAvg = recent.length ? (recent.reduce((acc, item) => acc + numOrZero(item && item.net), 0) / recent.length) : 0;
    const positives = recent.filter(item => numOrZero(item && item.net) > 0.0001).length;
    const negatives = recent.filter(item => numOrZero(item && item.net) < -0.0001).length;
    const currentRank = Math.floor(numOrZero(row && row.rankPos));
    const previousRank = snapshots.length >= 2 ? Math.floor(numOrZero(snapshots[snapshots.length - 2] && snapshots[snapshots.length - 2].rankPos)) : 0;
    const lastRef = recent.length ? formatRecordSessionContext(recent[recent.length - 1]) : 'la última sesión';

    if (currentRank && previousRank && currentRank < previousRank){
      return { tone: 'up', label: 'Subiendo', note: `Ganó terreno en ranking: pasó de #${previousRank} a #${currentRank} en ${lastRef}.` };
    }
    if (currentRank && previousRank && currentRank > previousRank){
      return { tone: 'down', label: 'Cediendo', note: `Perdió terreno en ranking: pasó de #${previousRank} a #${currentRank} en ${lastRef}.` };
    }
    if (currentRank && !previousRank && snapshots.length){
      return { tone: 'up', label: 'Debutando', note: `Entró al ranking histórico en ${lastRef}.` };
    }
    if (recent.length >= 2 && positives >= 2 && recentAvg > 0.0001){
      return { tone: 'up', label: 'En alza', note: `${positives} de sus últimas ${recent.length} sesiones cerraron en verde.` };
    }
    if (recent.length >= 2 && negatives >= 2 && recentAvg < -0.0001){
      return { tone: 'down', label: 'Bajo presión', note: `${negatives} de sus últimas ${recent.length} sesiones cerraron en rojo.` };
    }
    if (!recent.length){
      return { tone: 'flat', label: 'Sin lectura', note: 'Todavía no hay tramo reciente para comparar.' };
    }
    return { tone: 'flat', label: 'Estable', note: 'Su momento reciente no muestra una ruptura clara respecto al promedio histórico.' };
  }

  function buildArchiveProfileRecentForm(timeline){
    const list = (Array.isArray(timeline) ? timeline : []).slice().sort((a, b) => {
      const dt = numOrZero(a && a.ts) - numOrZero(b && b.ts);
      if (Math.abs(dt) > 0.0001) return dt;
      return String(a && a.sessionId || '').localeCompare(String(b && b.sessionId || ''), 'es', { sensitivity: 'base' });
    }).slice(-5).reverse();

    return list.map(item => {
      const net = numOrZero(item && item.net);
      if (item && item.isWin){
        return { tone: 'up', shortLabel: 'W', title: `Victoria · ${formatRecordSessionContext(item)}`, note: formatMoney(net) };
      }
      if (item && item.isItm){
        return { tone: 'up', shortLabel: '+', title: `Cobró · ${formatRecordSessionContext(item)}`, note: formatMoney(net) };
      }
      if (Math.abs(net) <= 0.0001){
        return { tone: 'flat', shortLabel: '0', title: `Empate técnico · ${formatRecordSessionContext(item)}`, note: formatMoney(net) };
      }
      return { tone: 'down', shortLabel: '−', title: `Sesión en rojo · ${formatRecordSessionContext(item)}`, note: formatMoney(net) };
    });
  }

  function getArchiveProfileLiveModel(analytics, profileId){
    const row = getArchiveProfileById(analytics, profileId);
    if (!row) return null;
    const byPlayer = analytics && analytics.byPlayer instanceof Map ? analytics.byPlayer : new Map();
    const hist = byPlayer.get(row.id) || null;
    const timeline = Array.isArray(hist && hist.timeline) ? hist.timeline.slice() : [];
    const snapshots = getArchiveProfileHistoricalSnapshots(row.id);
    const bestRankSnap = snapshots
      .filter(item => Math.floor(numOrZero(item && item.rankPos)) > 0)
      .sort((a, b) => {
        const rankDelta = Math.floor(numOrZero(a && a.rankPos)) - Math.floor(numOrZero(b && b.rankPos));
        if (rankDelta) return rankDelta;
        const tsDelta = numOrZero(a && a.ts) - numOrZero(b && b.ts);
        if (Math.abs(tsDelta) > 0.0001) return tsDelta;
        return String(a && a.sessionId || '').localeCompare(String(b && b.sessionId || ''), 'es', { sensitivity: 'base' });
      })[0] || null;

    const streak = buildArchiveProfileCurrentStreak(timeline);
    const trend = buildArchiveProfileTrend(row, timeline, snapshots);
    const recentForm = buildArchiveProfileRecentForm(timeline);
    const bestHistoricalRank = Math.floor(numOrZero(bestRankSnap && bestRankSnap.rankPos));
    const bestHistoricalRankNote = bestHistoricalRank
      ? `Pico detectado en ${formatSessionDateLabel(bestRankSnap.date, bestRankSnap.ts)}${bestRankSnap.sessionRef ? ` · ${bestRankSnap.sessionRef}` : ''}.`
      : 'Todavía no tiene ranking histórico registrado.';
    const latest = timeline.slice().sort((a, b) => {
      const dt = numOrZero(b && b.ts) - numOrZero(a && a.ts);
      if (Math.abs(dt) > 0.0001) return dt;
      return String(b && b.sessionId || '').localeCompare(String(a && a.sessionId || ''), 'es', { sensitivity: 'base' });
    })[0] || null;
    const recentAvg = timeline.length ? timeline.slice().sort((a, b) => {
      const dt = numOrZero(a && a.ts) - numOrZero(b && b.ts);
      if (Math.abs(dt) > 0.0001) return dt;
      return String(a && a.sessionId || '').localeCompare(String(b && b.sessionId || ''), 'es', { sensitivity: 'base' });
    }).slice(-3).reduce((acc, item) => acc + numOrZero(item && item.net), 0) / Math.min(3, timeline.length) : 0;

    return {
      ...row,
      bestHistoricalRank,
      bestHistoricalRankNote,
      currentStreak: streak,
      trend,
      recentForm,
      timelineCount: timeline.length,
      recentAvg,
      lastNet: numOrZero(latest && latest.net),
      latestContext: latest ? formatRecordSessionContext(latest) : 'Sin sesiones cerradas',
      latestSessionId: safeTrim(latest && latest.sessionId),
      latestSessionRef: safeTrim(latest && latest.sessionRef),
      bestWinStreak: hist && hist.bestWinStreak ? hist.bestWinStreak : { length: 0, start: null, end: null },
      bestItmStreak: hist && hist.bestItmStreak ? hist.bestItmStreak : { length: 0, start: null, end: null },
      snapshots,
    };
  }

  function getArchiveProfileById(analytics, profileId){
    const id = safeTrim(profileId);
    if (!id) return null;
    return getArchiveProfileRows(analytics).find(row => sameStableEntity(row && row.id, id)) || null;
  }

  function renderPerfiles(){
    const analytics = computeAnalytics();
    const rows = getArchiveProfileRows(analytics);
    const historyCount = analytics && analytics.byPlayer instanceof Map ? analytics.byPlayer.size : 0;

    const root = el(`
      <section class="screen screen--archivo screen--archivo-perfiles" aria-label="Perfiles">
        <h1 class="screen-title">Perfiles</h1>
        <p class="screen-sub">Archivo · lectura individual e histórica de jugadores. Administración gestiona; Perfiles cuenta la historia viva sin mezclar operación con archivo.</p>

        <div class="panel archive-profiles-hero" role="region" aria-label="Resumen de perfiles">
          <div>
            <div class="archive-kicker">Perfil vivo</div>
            <div class="panel-title archive-module-title">Lectura individual cerrada</div>
            <div class="small-note archive-module-note">Los datos vienen de jugadores reales y del histórico consolidado. Aquí se lee la trayectoria; en Administración se sigue creando, editando y activando.</div>
          </div>
          <div class="stats-mini-grid stats-extended archive-profiles-stats">
            <div class="stat-mini"><span class="k">Registrados</span><span class="v">${escapeHtml(String(getArchiveRegisteredPlayersCount(analytics)))}</span></div>
            <div class="stat-mini"><span class="k">Con historial</span><span class="v">${escapeHtml(String(historyCount))}</span></div>
            <div class="stat-mini"><span class="k">Perfiles vivos</span><span class="v">${escapeHtml(String(rows.length))}</span></div>
          </div>
        </div>

        <div class="archive-split-grid" aria-label="Separación entre gestión y lectura">
          <article class="panel archive-split-card">
            <div class="archive-kicker">Administración &gt; Jugadores</div>
            <div class="panel-title archive-module-title">Gestión operativa</div>
            <div class="small-note archive-module-note">Altas, edición, activación e inactivación siguen viviendo en la casa operativa. La mini ficha actual se conserva allí.</div>
          </article>
          <article class="panel archive-split-card archive-split-card--focus">
            <div class="archive-kicker">Archivo &gt; Perfiles</div>
            <div class="panel-title archive-module-title">Lectura individual</div>
            <div class="small-note archive-module-note">Listado táctil para abrir la ficha viva de cada jugador y leer rendimiento, ranking, rachas y momento reciente sin meter mano donde no toca.</div>
          </article>
        </div>

        <div class="archive-profile-preview-grid" aria-label="Listado de perfiles vivos">
          ${rows.length ? rows.map(row => {
            const netClass = Math.abs(numOrZero(row.net)) < 0.0001 ? 'ok' : (numOrZero(row.net) > 0 ? 'pos' : 'neg');
            return `
              <article class="panel archive-profile-preview-card" data-profile-id="${escapeAttr(row.id)}">
                <div class="archive-profile-preview-top">
                  <div>
                    <div class="panel-title archive-profile-preview-title">${escapeHtml(row.display)}</div>
                    <div class="small-note archive-profile-meta-line">${escapeHtml(row.identity)}</div>
                  </div>
                  <div class="archive-profile-badges">
                    ${row.managed ? `<span class="pill ${row.active ? 'on' : 'off'}">${escapeHtml(row.statusLabel)}</span>` : `<span class="badge">${escapeHtml(row.statusLabel)}</span>`}
                    <span class="badge">${row.rankPos ? ('#' + escapeHtml(String(row.rankPos))) : 'Sin ranking'}</span>
                  </div>
                </div>
                <div class="stats-mini-grid stats-extended" style="margin-top:12px">
                  <div class="stat-mini"><span class="k">Sesiones</span><span class="v">${escapeHtml(String(row.games))}</span></div>
                  <div class="stat-mini"><span class="k">Victorias</span><span class="v">${escapeHtml(String(row.wins))}</span></div>
                  <div class="stat-mini"><span class="k">Neto</span><span class="v net ${netClass}">${escapeHtml(formatMoney(row.net))}</span></div>
                  <div class="stat-mini stack"><span class="k">Última sesión</span><span class="v">${escapeHtml(row.lastSessionDate)}</span><span class="sub">${escapeHtml(row.lastSessionRef || (row.rankPos ? ('Ranking #' + row.rankPos) : 'Sin ref.'))}</span></div>
                </div>
                <div class="small-note archive-profile-preview-foot">${escapeHtml(row.managed ? 'La ficha individual ya vive aquí. Para editar datos operativos, la puerta correcta sigue siendo Administración > Jugadores.' : 'Perfil detectado desde historial/importaciones. Puede leerse completo aunque todavía no exista ficha operativa en Gestión.')}</div>
                <div class="archive-profile-actions">
                  <button class="btn" type="button" data-profile-open="${escapeAttr(row.id)}">Abrir perfil</button>
                </div>
              </article>
            `;
          }).join('') : `
            <div class="empty">Todavía no hay jugadores para mostrar aquí.</div>
          `}
        </div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    root.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-profile-open]');
      if (btn){
        const id = safeTrim(btn.getAttribute('data-profile-open'));
        if (id) navigate('/archivo/perfiles/detalle?id=' + encodeURIComponent(id));
        return;
      }
    });
  }

  function renderPerfilDetalle(){
    const analytics = computeAnalytics();
    const q = getHashQuery();
    const id = safeTrim(q.get('id'));
    const row = getArchiveProfileLiveModel(analytics, id);
    if (!row){
      navigate('/archivo/perfiles', { stackMode: 'back' });
      return;
    }

    const netClass = Math.abs(numOrZero(row.net)) < 0.0001 ? 'ok' : (numOrZero(row.net) > 0 ? 'pos' : 'neg');
    const avgClass = Math.abs(numOrZero(row.avgNet)) < 0.0001 ? 'ok' : (numOrZero(row.avgNet) > 0 ? 'pos' : 'neg');
    const roiClass = Math.abs(numOrZero(row.roiGlobal)) < 0.0001 ? 'ok' : (numOrZero(row.roiGlobal) > 0 ? 'pos' : 'neg');
    const recentAvgClass = Math.abs(numOrZero(row.recentAvg)) < 0.0001 ? 'ok' : (numOrZero(row.recentAvg) > 0 ? 'pos' : 'neg');
    const streakToneClass = row.currentStreak && row.currentStreak.tone === 'up' ? 'archive-tone-pill--up' : (row.currentStreak && row.currentStreak.tone === 'down' ? 'archive-tone-pill--down' : 'archive-tone-pill--flat');
    const trendToneClass = row.trend && row.trend.tone === 'up' ? 'archive-tone-pill--up' : (row.trend && row.trend.tone === 'down' ? 'archive-tone-pill--down' : 'archive-tone-pill--flat');
    const detailNote = row.managed
      ? 'Separación cerrada: esta ficha lee la historia individual sin tocar la gestión. Cualquier cambio operativo sigue en Administración > Jugadores.'
      : 'Esta ficha nace desde histórico/importaciones. Hay lectura individual aunque el jugador no tenga hoy una ficha operativa activa en Gestión.';

    const root = el(`
      <section class="screen screen--archivo screen--archivo-perfil" aria-label="Perfil individual">
        <h1 class="screen-title">${escapeHtml(row.display)}</h1>
        <p class="screen-sub">Archivo · Perfil vivo individual. Aquí vive la lectura histórica del jugador: nombre, apodo, ranking, rachas, tendencia y sus mejores y peores noches.</p>

        <div class="panel archive-profile-detail-hero" role="region" aria-label="Cabecera del perfil">
          <div class="archive-profile-detail-head">
            <div>
              <div class="archive-kicker">Perfil vivo</div>
              <div class="panel-title archive-module-title">${escapeHtml(row.identity)}</div>
              <div class="small-note archive-module-note">${escapeHtml(detailNote)}</div>
            </div>
            <div class="archive-profile-badges">
              ${row.managed ? `<span class="pill ${row.active ? 'on' : 'off'}">${escapeHtml(row.statusLabel)}</span>` : `<span class="badge">${escapeHtml(row.statusLabel)}</span>`}
              <span class="badge">${row.rankPos ? ('Ranking #' + escapeHtml(String(row.rankPos))) : 'Sin ranking vigente'}</span>
              <span class="archive-tone-pill ${trendToneClass}">${escapeHtml((row.trend && row.trend.label) || 'Estable')}</span>
            </div>
          </div>
        </div>

        <div class="archive-summary-grid archive-profile-detail-grid" aria-label="Identidad y base del jugador">
          <article class="archive-summary-card">
            <div class="archive-summary-label">Nombre</div>
            <div class="archive-summary-value archive-summary-value--text">${escapeHtml(row.primaryName || row.display)}</div>
            <div class="archive-summary-note">Ficha principal leída desde jugadores o histórico consolidado.</div>
          </article>
          <article class="archive-summary-card">
            <div class="archive-summary-label">Apodo</div>
            <div class="archive-summary-value archive-summary-value--text">${escapeHtml(row.nickLabel || '—')}</div>
            <div class="archive-summary-note">Si no hay alias distinto, se muestra prudencia y no se inventa uno.</div>
          </article>
          <article class="archive-summary-card">
            <div class="archive-summary-label">Sesiones jugadas</div>
            <div class="archive-summary-value">${escapeHtml(String(row.games))}</div>
            <div class="archive-summary-note">Sesiones cerradas reconocidas para este jugador.</div>
          </article>
          <article class="archive-summary-card archive-summary-card--latest">
            <div class="archive-summary-label">Balance acumulado</div>
            <div class="archive-summary-value archive-summary-value--text net ${netClass}">${escapeHtml(formatMoney(row.net))}</div>
            <div class="archive-summary-note">Última lectura: ${escapeHtml(row.latestContext)}</div>
          </article>
        </div>

        <div class="archive-summary-grid archive-profile-vitals-grid" aria-label="Métricas principales del perfil vivo">
          <article class="archive-summary-card">
            <div class="archive-summary-label">Promedio por sesión</div>
            <div class="archive-summary-value archive-summary-value--text net ${avgClass}">${escapeHtml(formatMoney(row.avgNet))}</div>
            <div class="archive-summary-note">Promedio global del balance por cierre.</div>
          </article>
          <article class="archive-summary-card">
            <div class="archive-summary-label">Mejor sesión</div>
            <div class="archive-summary-value archive-summary-value--text net ${Math.abs(numOrZero(row.bestNet)) < 0.0001 ? 'ok' : (numOrZero(row.bestNet) > 0 ? 'pos' : 'neg')}">${escapeHtml(formatMoney(row.bestNet))}</div>
            <div class="archive-summary-note">${escapeHtml(row.bestDate)}${row.bestSessionRef ? ` · ${escapeHtml(row.bestSessionRef)}` : ''}</div>
          </article>
          <article class="archive-summary-card">
            <div class="archive-summary-label">Peor sesión</div>
            <div class="archive-summary-value archive-summary-value--text net ${Math.abs(numOrZero(row.worstNet)) < 0.0001 ? 'ok' : (numOrZero(row.worstNet) > 0 ? 'pos' : 'neg')}">${escapeHtml(formatMoney(row.worstNet))}</div>
            <div class="archive-summary-note">${escapeHtml(row.worstDate)}${row.worstSessionRef ? ` · ${escapeHtml(row.worstSessionRef)}` : ''}</div>
          </article>
          <article class="archive-summary-card">
            <div class="archive-summary-label">Ranking actual</div>
            <div class="archive-summary-value">${row.rankPos ? ('#' + escapeHtml(String(row.rankPos))) : 'Sin ranking'}</div>
            <div class="archive-summary-note">Mejor ranking histórico: ${row.bestHistoricalRank ? ('#' + escapeHtml(String(row.bestHistoricalRank))) : 'Sin dato'}.</div>
          </article>
        </div>

        <div class="archive-map-grid archive-profile-detail-panels" aria-label="Lectura viva del jugador">
          <article class="panel archive-lane archive-lane--profile-momentum">
            <div class="archive-lane-top">
              <div>
                <div class="archive-lane-eyebrow">Momento reciente</div>
                <div class="panel-title archive-lane-title">Racha y tendencia</div>
              </div>
              <span class="archive-tone-pill ${streakToneClass}">${escapeHtml((row.currentStreak && row.currentStreak.label) || 'Sin racha')}</span>
            </div>
            <div class="archive-profile-detail-stack">
              <div class="archive-profile-highlight-row">
                <div class="archive-profile-highlight">
                  <span class="k">Tendencia actual</span>
                  <span class="v">${escapeHtml((row.trend && row.trend.label) || 'Estable')}</span>
                  <span class="sub">${escapeHtml((row.trend && row.trend.note) || 'Sin lectura reciente.')}</span>
                </div>
                <div class="archive-profile-highlight">
                  <span class="k">Promedio últimas 3</span>
                  <span class="v net ${recentAvgClass}">${escapeHtml(formatMoney(row.recentAvg))}</span>
                  <span class="sub">${escapeHtml((row.currentStreak && row.currentStreak.note) || 'Sin tramo reciente.')}</span>
                </div>
              </div>
              <div class="archive-profile-form-block">
                <div class="archive-profile-form-head">
                  <span class="k">Racha reciente</span>
                  <span class="sub">Últimas ${escapeHtml(String(row.recentForm.length || 0))} sesiones</span>
                </div>
                <div class="archive-form-strip">${row.recentForm.length ? row.recentForm.map(item => `<span class="archive-form-pill archive-form-pill--${escapeAttr(item.tone)}" title="${escapeAttr(item.title)}">${escapeHtml(item.shortLabel)}<small>${escapeHtml(item.note)}</small></span>`).join('') : '<span class="small-note">Sin cierres recientes.</span>'}</div>
              </div>
            </div>
          </article>

          <article class="panel archive-lane">
            <div class="archive-lane-top">
              <div>
                <div class="archive-lane-eyebrow">Lectura histórica</div>
                <div class="panel-title archive-lane-title">Ranking y consistencia</div>
              </div>
              <span class="badge">${row.bestHistoricalRank ? ('Mejor #' + escapeHtml(String(row.bestHistoricalRank))) : 'Sin pico'}</span>
            </div>
            <div class="stats-mini-grid stats-extended">
              <div class="stat-mini stack"><span class="k">Mejor ranking histórico</span><span class="v">${row.bestHistoricalRank ? ('#' + escapeHtml(String(row.bestHistoricalRank))) : 'Sin ranking'}</span><span class="sub">${escapeHtml(row.bestHistoricalRankNote)}</span></div>
              <div class="stat-mini"><span class="k">Victorias</span><span class="v">${escapeHtml(String(row.wins))}</span></div>
              <div class="stat-mini"><span class="k">Podios</span><span class="v">${escapeHtml(String(row.podiums))}</span></div>
              <div class="stat-mini"><span class="k">ROI global</span><span class="v net ${roiClass}">${escapeHtml(formatPercent(row.roiGlobal))}</span></div>
              <div class="stat-mini stack"><span class="k">Mejor racha de victorias</span><span class="v">${escapeHtml(formatRecordCount(row.bestWinStreak && row.bestWinStreak.length, 'victoria seguida', 'victorias seguidas'))}</span><span class="sub">${escapeHtml(formatStreakContextLabel(row.bestWinStreak))}</span></div>
              <div class="stat-mini stack"><span class="k">Mejor racha de cobros</span><span class="v">${escapeHtml(formatRecordCount(row.bestItmStreak && row.bestItmStreak.length, 'cobro seguido', 'cobros seguidos'))}</span><span class="sub">${escapeHtml(formatStreakContextLabel(row.bestItmStreak))}</span></div>
            </div>
          </article>

          <article class="panel archive-lane archive-lane--future">
            <div class="archive-lane-top">
              <div>
                <div class="archive-lane-eyebrow">Puentes</div>
                <div class="panel-title archive-lane-title">Navegación coherente</div>
              </div>
            </div>
            <div class="small-note archive-lane-copy">Perfiles lee la historia individual. Ranking sigue siendo el comparativo global. Historial conserva las sesiones cerradas y el PDF. Cada cosa en su altar; nada de mezclar santos con diablos.</div>
            <div class="archive-lane-actions archive-lane-actions--stack">
              ${row.latestSessionId ? `<button class="btn" type="button" id="goLatestSessionFromProfileBtn">Ver última sesión</button>` : ''}
              <button class="btn secondary" type="button" id="goRankingFromProfileBtn">Abrir Ranking</button>
              <button class="btn secondary" type="button" id="goHistorialFromProfileBtn">Abrir Historial</button>
              <button class="btn secondary" type="button" id="goAdminPlayersFromProfileBtn">Ir a Jugadores</button>
            </div>
          </article>
        </div>

        <div class="row archive-actions" style="margin-top:16px">
          <button class="btn secondary" type="button" id="backToArchivoBtn">Volver a Archivo</button>
          <button class="btn" type="button" id="backToPerfilesBtn">Volver a Perfiles</button>
        </div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    const $back = document.getElementById('backToPerfilesBtn');
    if ($back) $back.addEventListener('click', () => navigate('/archivo/perfiles', { stackMode: 'back' }));
    const $backArchivo = document.getElementById('backToArchivoBtn');
    if ($backArchivo) $backArchivo.addEventListener('click', () => navigate('/archivo', { stackMode: 'back' }));
    const $admin = document.getElementById('goAdminPlayersFromProfileBtn');
    if ($admin) $admin.addEventListener('click', () => navigate('/administracion'));
    const $ranking = document.getElementById('goRankingFromProfileBtn');
    if ($ranking) $ranking.addEventListener('click', () => navigate('/archivo/ranking'));
    const $historial = document.getElementById('goHistorialFromProfileBtn');
    if ($historial) $historial.addEventListener('click', () => navigate('/archivo/historial'));
    const $latest = document.getElementById('goLatestSessionFromProfileBtn');
    if ($latest) $latest.addEventListener('click', () => navigate('/archivo/historial/detalle?id=' + encodeURIComponent(row.latestSessionId)));
  }


  function renderArchivo(){
    const analytics = computeAnalytics();
    const sessionsCount = Array.isArray(analytics && analytics.summaryRows) ? analytics.summaryRows.length : 0;
    const registeredPlayersCount = getArchiveRegisteredPlayersCount(analytics);
    const leaderLabel = getArchiveLeaderLabel(analytics);
    const latestSummary = getArchiveLatestSummary(analytics);
    const latestClosedSession = getClosedSessions()[0] || null;
    const latestDetailHref = latestClosedSession ? ('/archivo/historial/detalle?id=' + encodeURIComponent(latestClosedSession.id)) : '';

    const root = el(`
      <section class="screen screen--archivo screen--archivo-home" aria-label="Archivo">
        <div class="panel module-hero module-hero--archivo" role="region" aria-label="Hero de Archivo">
          <div class="module-hero__layout">
            <div class="module-hero__copy">
              <div class="module-hero__eyebrow">Memoria histórica</div>
              <h1 class="screen-title module-hero__title">Archivo</h1>
              <p class="screen-sub module-hero__sub">Memoria histórica de la mesa, lectura competitiva y acceso claro a lo que ya pasó. Sobrio, útil y sin mezclar operación con archivo.</p>
              <div class="module-hero__stats" aria-label="Resumen histórico">
                <article class="module-hero__stat">
                  <div class="module-hero__stat-label">Sesiones cerradas</div>
                  <div class="module-hero__stat-value">${escapeHtml(String(sessionsCount))}</div>
                  <div class="module-hero__stat-note">Cronología consolidada lista para explorar.</div>
                </article>
                <article class="module-hero__stat">
                  <div class="module-hero__stat-label">Perfiles vivos</div>
                  <div class="module-hero__stat-value">${escapeHtml(String(registeredPlayersCount))}</div>
                  <div class="module-hero__stat-note">Lectura individual disponible desde Perfiles.</div>
                </article>
                <article class="module-hero__stat">
                  <div class="module-hero__stat-label">Líder actual</div>
                  <div class="module-hero__stat-value module-hero__stat-value--text">${escapeHtml(leaderLabel)}</div>
                  <div class="module-hero__stat-note">Tomado del ranking global vigente.</div>
                </article>
                <article class="module-hero__stat">
                  <div class="module-hero__stat-label">Última sesión</div>
                  <div class="module-hero__stat-value module-hero__stat-value--text">${escapeHtml(latestSummary.date)}</div>
                  <div class="module-hero__stat-note">${escapeHtml(latestSummary.winner)}</div>
                </article>
              </div>
              <div class="row panel-actions module-hero__actions" style="gap:10px; flex-wrap:wrap; margin-top:14px">
                <button class="btn" type="button" data-go-route="/archivo/perfiles">Perfiles</button>
                <button class="btn" type="button" data-go-route="/archivo/ranking">Ranking</button>
                <button class="btn" type="button" data-go-route="/archivo/historial">Historial</button>
                ${latestDetailHref ? `<button class="btn" type="button" data-go-route="${escapeHtml(latestDetailHref)}">Última sesión</button>` : ''}
              </div>
            </div>
            <div class="module-hero__media" aria-hidden="true">
              <div class="module-hero__media-shell">
                <img class="module-hero__img module-hero__img--cover module-hero__img--archivo" src="assets/hero/hero_archivo.png" alt="" decoding="async" loading="lazy" />
              </div>
              <div class="module-hero__caption">Archivo reúne la historia completa: Perfiles para leer a cada jugador, Ranking para comparar y Historial para regresar a cada cierre con su salida PDF.</div>
            </div>
          </div>
        </div>

        <div class="panel archive-overview-panel" role="region" aria-label="Resumen superior de archivo">
          <div class="archive-overview-head">
            <div>
              <div class="archive-kicker">Portada propia</div>
              <div class="panel-title archive-overview-title">Resumen actual de la mesa</div>
            </div>
            <span class="badge">Archivo activo</span>
          </div>

          <div class="archive-summary-grid" aria-label="Datos principales del archivo">
            <article class="archive-summary-card">
              <div class="archive-summary-label">Sesiones cerradas</div>
              <div class="archive-summary-value">${escapeHtml(String(sessionsCount))}</div>
              <div class="archive-summary-note">Cierre histórico disponible en el sistema.</div>
            </article>

            <article class="archive-summary-card">
              <div class="archive-summary-label">Jugadores registrados</div>
              <div class="archive-summary-value">${escapeHtml(String(registeredPlayersCount))}</div>
              <div class="archive-summary-note">Maestro de jugadores con fallback al histórico importado.</div>
            </article>

            <article class="archive-summary-card">
              <div class="archive-summary-label">Líder actual</div>
              <div class="archive-summary-value archive-summary-value--text">${escapeHtml(leaderLabel)}</div>
              <div class="archive-summary-note">Tomado del ranking global vigente.</div>
            </article>

            <article class="archive-summary-card archive-summary-card--latest">
              <div class="archive-summary-label">Última sesión</div>
              <div class="archive-summary-value archive-summary-value--text">${escapeHtml(latestSummary.date)}</div>
              <div class="archive-summary-note">Ganador: ${escapeHtml(latestSummary.winner)}</div>
            </article>
          </div>

          <div class="small-note archive-overview-foot">${escapeHtml(latestSummary.caption)}</div>
        </div>

        <div class="archive-portal-grid" aria-label="Accesos principales de archivo">
          <button class="card archive-portal-card archive-portal-card--perfiles" type="button" id="openPerfilesBtn">
            <div class="archive-lane-eyebrow">Perfiles</div>
            <div class="archive-portal-title">Lectura individual</div>
            <p class="archive-portal-copy">Entrada a la ficha viva de cada jugador para revisar su huella histórica, su momento reciente y su lectura individual completa.</p>
            <div class="archive-portal-meta">${escapeHtml(String(registeredPlayersCount))} jugador${registeredPlayersCount === 1 ? '' : 'es'} listo${registeredPlayersCount === 1 ? '' : 's'} para lectura</div>
            <span class="archive-portal-cta">Abrir perfiles</span>
          </button>

          <button class="card archive-portal-card archive-portal-card--ranking" type="button" id="openRankingBtn">
            <div class="archive-lane-eyebrow">Ranking</div>
            <div class="archive-portal-title">Comparativo histórico</div>
            <p class="archive-portal-copy">Consulta la tabla global vigente, movimientos y posiciones entre jugadores desde la nueva casa competitiva de Archivo.</p>
            <div class="archive-portal-meta">Líder actual: ${escapeHtml(leaderLabel)}</div>
            <span class="archive-portal-cta">Abrir ranking</span>
          </button>

          <button class="card archive-portal-card archive-portal-card--historial" type="button" id="openHistorialBtn">
            <div class="archive-lane-eyebrow">Historial</div>
            <div class="archive-portal-title">Memoria de sesiones</div>
            <p class="archive-portal-copy">Recorre cierres anteriores, entra al detalle y conserva la salida PDF sin romper la cronología.</p>
            <div class="archive-portal-meta">${escapeHtml(latestSummary.date)} · ${escapeHtml(latestSummary.winner)}</div>
            <span class="archive-portal-cta">Abrir historial</span>
          </button>
        </div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    root.querySelectorAll('[data-go-route]').forEach(btn => {
      btn.addEventListener('click', () => {
        const href = btn.getAttribute('data-go-route');
        if (!href) return;
        navigate(href);
      });
    });

    const $openPerfilesBtn = document.getElementById('openPerfilesBtn');
    if ($openPerfilesBtn) $openPerfilesBtn.addEventListener('click', () => navigate('/archivo/perfiles'));

    const $openRankingBtn = document.getElementById('openRankingBtn');
    if ($openRankingBtn) $openRankingBtn.addEventListener('click', () => navigate('/archivo/ranking'));

    const $openHistorialBtn = document.getElementById('openHistorialBtn');
    if ($openHistorialBtn) $openHistorialBtn.addEventListener('click', () => navigate('/archivo/historial'));
  }

  function openChipModal({ mode, chip, onSave }){
    if (hasOpenOverlay()) return null;
    const previousActive = rememberFocusable();
    const isEdit = (mode === 'edit');
    const base = chip || { id: uid('chip'), name: '', value: '', color: '#808080', active: true };

    const overlay = el(`
      <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="${isEdit ? 'Editar ficha' : 'Agregar ficha'}">
        <div class="modal modal--form">
          <div class="modal-head">
            <div class="modal-title-wrap">
              <div class="modal-title">${isEdit ? 'Editar ficha' : 'Agregar ficha'}</div>
            </div>
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
                <input id="chipValue" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" enterkeyhint="done" placeholder="Ej. 250" value="${escapeAttr((base.value===0||base.value)?String(base.value):'')}" />
              </label>

              <div class="field">
                <span>Color</span>
                <div class="color-row">
                  <input id="chipColor" class="color" type="color" value="${escapeAttr(normHex(base.color) || '#808080')}" />
                  <input id="chipColorHex" class="text" type="text" maxlength="7" placeholder="#RRGGBB" value="${escapeAttr(normHex(base.color) || '#808080')}" autocapitalize="none" autocomplete="off" spellcheck="false" />
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
    hardenNumericInput($value, { selectOnFocus: isEdit });

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
    let closed = false;
    let saveBusy = false;
    function close(){
      if (closed) return;
      closed = true;
      overlay.remove();
      try{ document.body.style.overflow = ''; }catch(e){}
      syncAppModalState(false);
      restoreFocusSafe(previousActive);
    }
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) close();
    });
    overlay.querySelectorAll('[data-act="close"],[data-act="cancel"]').forEach(b => {
      b.addEventListener('click', close);
    });

    overlay.querySelector('[data-act="save"]').addEventListener('click', () => {
      if (saveBusy || closed) return;
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

      saveBusy = true;
      upsertChip(payload);
      if (typeof onSave === 'function') onSave();
      close();
    });

    overlay.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); close(); return; }
      if (ev.key === 'Enter' && ev.target !== $color) {
        ev.preventDefault();
        const saveBtn = overlay.querySelector('[data-act="save"]');
        if (saveBtn) saveBtn.click();
      }
    });

    // Mount
    document.body.appendChild(overlay);
    try{ document.body.style.overflow = 'hidden'; }catch(e){}
    syncAppModalState(true);
    setPreview(normHex(base.color) || '#808080');
    focusFieldForTouch($name, { selectIfFilled: isEdit });
    return overlay;
  }

  
  function openPlayerModal({ mode, player, onSave }){
    if (hasOpenOverlay()) return null;
    const previousActive = rememberFocusable();
    const isEdit = (mode === 'edit');
    const base = player || { id: uid('player'), name: '', nick: '', active: true, stats: {} };

    const overlay = el(`
      <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="${isEdit ? 'Editar jugador' : 'Agregar jugador'}">
        <div class="modal modal--form">
          <div class="modal-head">
            <div class="modal-title-wrap">
              <div class="modal-title">${isEdit ? 'Editar jugador' : 'Agregar jugador'}</div>
            </div>
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

    let closed = false;
    let saveBusy = false;
    function close(){
      if (closed) return;
      closed = true;
      overlay.remove();
      try{ document.body.style.overflow = ''; }catch(e){}
      syncAppModalState(false);
      restoreFocusSafe(previousActive);
    }

    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) close();
    });

    overlay.querySelectorAll('[data-act="close"],[data-act="cancel"]').forEach(b => {
      b.addEventListener('click', close);
    });

    overlay.querySelector('[data-act="save"]').addEventListener('click', () => {
      if (saveBusy || closed) return;
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

      saveBusy = true;
      upsertPlayer(payload);
      if (typeof onSave === 'function') onSave();
      close();
    });

    overlay.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { ev.preventDefault(); close(); return; }
      if (ev.key === 'Enter') {
        ev.preventDefault();
        const saveBtn = overlay.querySelector('[data-act="save"]');
        if (saveBtn) saveBtn.click();
      }
    });

    document.body.appendChild(overlay);
    try{ document.body.style.overflow = 'hidden'; }catch(e){}
    syncAppModalState(true);
    focusFieldForTouch($name, { selectIfFilled: isEdit });
    return overlay;
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

  function rememberFocusable(){
  const el = document.activeElement;
  if (!el || el === document.body || typeof el.focus !== 'function') return null;
  return el;
}

function restoreFocusSafe(el){
  if (!el || !document.contains(el) || typeof el.focus !== 'function') return;
  try{ el.focus({ preventScroll: true }); }catch(e){
    try{ el.focus(); }catch(e2){}
  }
}

function hasOpenOverlay(){
  return !!document.querySelector('.modal-overlay');
}

function syncAppModalState(forceOpen){
  const open = (typeof forceOpen === 'boolean') ? forceOpen : hasOpenOverlay();
  try{ document.documentElement.classList.toggle('has-modal-open', open); }catch(e){}
  try{ document.body.classList.toggle('has-modal-open', open); }catch(e){}
  return open;
}

function sanitizeUnsignedIntInput(value){
  return String(value == null ? '' : value).replace(/[^0-9]/g, '');
}

function hardenNumericInput(input, { selectOnFocus } = {}){
  if (!input || input.dataset.numericHardened === '1') return input;
  input.dataset.numericHardened = '1';
  try{ input.setAttribute('inputmode', 'numeric'); }catch(e){}
  try{ input.setAttribute('pattern', '[0-9]*'); }catch(e){}
  try{ input.setAttribute('autocomplete', 'off'); }catch(e){}
  try{ input.setAttribute('autocorrect', 'off'); }catch(e){}
  try{ input.setAttribute('spellcheck', 'false'); }catch(e){}
  try{ input.setAttribute('enterkeyhint', 'done'); }catch(e){}

  const normalize = () => {
    const before = String(input.value || '');
    const after = sanitizeUnsignedIntInput(before);
    if (after === before) return;
    const end = (typeof input.selectionEnd === 'number') ? input.selectionEnd : before.length;
    const removed = before.slice(0, end).length - sanitizeUnsignedIntInput(before.slice(0, end)).length;
    input.value = after;
    try{
      const nextPos = Math.max(0, end - removed);
      if (typeof input.setSelectionRange === 'function') input.setSelectionRange(nextPos, nextPos);
    }catch(e){}
  };

  input.addEventListener('input', normalize);
  input.addEventListener('blur', normalize);
  if (selectOnFocus){
    input.addEventListener('focus', () => {
      const val = String(input.value || '');
      if (!val) return;
      try{
        if (typeof input.setSelectionRange === 'function') input.setSelectionRange(0, val.length);
        else if (typeof input.select === 'function') input.select();
      }catch(e){}
    });
  }
  return input;
}

function focusFieldForTouch(input, { selectIfFilled } = {}){
  if (!input || typeof input.focus !== 'function') return;
  try{ input.focus({ preventScroll: true }); }catch(e){
    try{ input.focus(); }catch(e2){}
  }
  if (!selectIfFilled) return;
  const val = String(input.value || '');
  if (!val) return;
  try{
    if (typeof input.setSelectionRange === 'function') input.setSelectionRange(0, val.length);
    else if (typeof input.select === 'function') input.select();
  }catch(e){}
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
  function pad3(n){ return String(n).padStart(3,'0'); }

  function ymdToDDMMYYYY(ymd){
    const str = String(ymd || '').trim();
    const m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m){
      const yyyy = m[1];
      const mm = pad2(m[2]);
      const dd = pad2(m[3]);
      return dd + mm + yyyy;
    }
    // si ya viene como DDMMYYYY
    if (/^\d{8}$/.test(str)) return str;
    return '';
  }

  function dateToDDMMYYYY(ts){
    const d = new Date(numOrZero(ts) || Date.now());
    return pad2(d.getDate()) + pad2(d.getMonth()+1) + String(d.getFullYear());
  }

  function sessionDDMMYYYY(s){
    const v = ymdToDDMMYYYY(s && s.date);
    if (v) return v;
    if (s){
      if (s.closedAt) return dateToDDMMYYYY(s.closedAt);
      if (s.createdAt) return dateToDDMMYYYY(s.createdAt);
      if (s.updatedAt) return dateToDDMMYYYY(s.updatedAt);
    }
    return dateToDDMMYYYY(Date.now());
  }


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

  function snapshotPlayerEntry(player){
    const p = player || {};
    return {
      id: stableEntityId(p),
      name: p.name || '',
      nick: p.nick || '',
      display: playerDisplayName(p),
    };
  }

  function ensureSessionRosterIntegrity(session){
    const s = session;
    if (!s || typeof s !== 'object') return s;

    if (!Array.isArray(s.playerIds)) s.playerIds = [];
    if (!Array.isArray(s.playersSnapshot)) s.playersSnapshot = [];
    if (!s.game || typeof s.game !== 'object') s.game = {};
    if (!Array.isArray(s.game.players)) s.game.players = [];

    const masterMap = new Map(getPlayers().filter(p => stableEntityId(p)).map(p => [stableEntityId(p), p]));
    const snapshotMap = new Map((Array.isArray(s.playersSnapshot) ? s.playersSnapshot : []).filter(p => stableEntityId(p)).map(p => [stableEntityId(p), p]));
    const stateMap = new Map((Array.isArray(s.game.players) ? s.game.players : []).filter(p => stableEntityId(p)).map(p => [stableEntityId(p), p]));

    const orderedIds = uniqStrings([
      ...(Array.isArray(s.playersSnapshot) ? s.playersSnapshot.map(stableEntityId) : []),
      ...(Array.isArray(s.playerIds) ? s.playerIds.map(stableEntityId) : []),
      ...(Array.isArray(s.game.players) ? s.game.players.map(stableEntityId) : []),
    ]);

    s.playerIds = orderedIds.slice();
    s.playersSnapshot = orderedIds.map(pid => {
      const snap = snapshotMap.get(pid) || null;
      const master = masterMap.get(pid) || null;
      const ref = snap || master || { id: pid, name: '', nick: '' };
      const name = safeTrim((snap && snap.name) || (master && master.name));
      const nick = safeTrim((snap && snap.nick) || (master && master.nick));
      const display = safeTrim((snap && snap.display) || playerDisplayName(master || ref));
      return {
        id: pid,
        name,
        nick,
        display: display || pid,
      };
    });

    const chipIds = Array.isArray(s.chipsSnapshot) ? s.chipsSnapshot.map(c => stableEntityId(c)).filter(Boolean) : [];
    const nextPlayers = orderedIds.map(pid => {
      const prev = stateMap.get(pid) || buildEmptySessionPlayerState(s, pid);
      const counts = (prev && prev.counts && typeof prev.counts === 'object') ? prev.counts : {};
      const nextCounts = {};
      chipIds.forEach(cid => {
        nextCounts[cid] = Math.max(0, Math.floor(numOrZero(counts[cid])));
      });
      return {
        id: pid,
        buyIn: numOrZero(prev && prev.buyIn),
        rebuys: (Array.isArray(prev && prev.rebuys) ? prev.rebuys : []).map(numOrZero).filter(v => v > 0),
        counts: nextCounts,
      };
    });

    s.game.players = nextPlayers;
    if (!s.status) s.status = 'draft';
    if (s.status === 'closed' && !s.closedAt) s.closedAt = numOrZero(s.updatedAt) || Date.now();
    return s;
  }

  function buildEmptySessionPlayerState(session, pid){
    const chipIds = Array.isArray(session && session.chipsSnapshot) ? session.chipsSnapshot.map(c => stableEntityId(c)).filter(Boolean) : [];
    const counts = {};
    chipIds.forEach(cid => {
      counts[cid] = 0;
    });
    return { id: pid, buyIn: 0, rebuys: [], counts };
  }

  function getLateJoinEligiblePlayers(session){
    const s = ensureSessionRosterIntegrity(session || {});
    if (safeTrim(s.status) === 'closed') return [];
    const inSession = new Set(uniqStrings([
      ...(Array.isArray(s.playerIds) ? s.playerIds.map(stableEntityId) : []),
      ...(Array.isArray(s.playersSnapshot) ? s.playersSnapshot.map(stableEntityId) : []),
      ...((s.game && Array.isArray(s.game.players)) ? s.game.players.map(stableEntityId) : []),
    ]));
    return getPlayers()
      .filter(p => !!(p && p.active))
      .filter(p => !!stableEntityId(p))
      .filter(p => !inSession.has(stableEntityId(p)))
      .slice()
      .sort((a, b) => playerDisplayName(a).localeCompare(playerDisplayName(b), 'es', { sensitivity: 'base' }));
  }

  function lateJoinSessionLabel(session){
    const s = session || {};
    return safeTrim(s.date) || 'sesión activa';
  }

  function lateJoinReasonMessage(reason, ctx){
    const sessionLabel = lateJoinSessionLabel(ctx && ctx.session);
    const playerName = safeTrim(ctx && ctx.playerName);
    switch (safeTrim(reason)) {
      case 'duplicate':
        return playerName ? `${playerName} ya está dentro de ${sessionLabel}.` : 'Ese jugador ya está dentro de la partida.';
      case 'not-eligible':
        return playerName ? `${playerName} ya no está disponible para agregar. Solo se permiten jugadores activos que aún no estén en la partida.` : 'Solo puedes agregar jugadores activos que aún no estén en la partida.';
      case 'no-candidates':
        return `No quedan jugadores activos elegibles para agregar en ${sessionLabel}.`;
      case 'closed':
        return `La partida ${sessionLabel} ya está cerrada.`;
      case 'missing-session':
        return 'No hay una partida abierta válida para completar esta acción.';
      case 'invalid':
        return 'La selección no es válida. Intenta de nuevo.';
      case 'clone-failed':
      case 'mutation-failed':
      case 'save-failed':
        return 'No se pudo guardar el cambio. La partida quedó intacta.';
      default:
        return 'No se pudo agregar el jugador. La partida quedó intacta.';
    }
  }

  function commitSessionMutation(sessionId, mutateDraft){
    const sid = stableEntityId(sessionId);
    if (!sid) return { ok: false, reason: 'missing-session' };

    const liveSession = getSessionById(sid);
    if (!liveSession) return { ok: false, reason: 'missing-session' };
    if (safeTrim(liveSession.status) === 'closed') return { ok: false, reason: 'closed', session: liveSession };

    const draft = cloneJson(liveSession);
    if (!draft || typeof draft !== 'object') return { ok: false, reason: 'clone-failed', session: liveSession };
    ensureSessionRosterIntegrity(draft);

    let mutation = null;
    try{
      mutation = (typeof mutateDraft === 'function') ? (mutateDraft(draft) || {}) : {};
    }catch(error){
      return { ok: false, reason: 'mutation-failed', error, session: liveSession };
    }

    if (mutation && mutation.ok === false) {
      return Object.assign({}, mutation, { session: liveSession });
    }

    try{
      saveSession(draft);
    }catch(error){
      return { ok: false, reason: 'save-failed', error, session: liveSession };
    }

    const committed = getSessionById(sid) || draft;
    return Object.assign({}, mutation || {}, { ok: true, session: committed });
  }

  function addExistingActivePlayerToDraftSession(session, playerId){
    const sessionId = stableEntityId(session);
    const pid = stableEntityId(playerId);
    if (!sessionId || !pid) return { ok: false, reason: 'invalid' };

    return commitSessionMutation(sessionId, (draft) => {
      ensureSessionGame(draft);
      const eligible = getLateJoinEligiblePlayers(draft);
      if (!eligible.length) return { ok: false, reason: 'no-candidates' };

      const player = getPlayers().find(p => sameStableEntity(p, pid)) || null;
      if (!player || !player.active) return { ok: false, reason: 'not-eligible' };
      if (!eligible.some(p => sameStableEntity(p, pid))) {
        const alreadyInSession = (Array.isArray(draft.playerIds) ? draft.playerIds : []).some(id => sameStableEntity(id, pid))
          || (Array.isArray(draft.playersSnapshot) ? draft.playersSnapshot : []).some(p => sameStableEntity(p, pid))
          || ((draft.game && Array.isArray(draft.game.players)) ? draft.game.players.some(p => sameStableEntity(p, pid)) : false);
        return { ok: false, reason: alreadyInSession ? 'duplicate' : 'not-eligible' };
      }

      if (!Array.isArray(draft.playerIds)) draft.playerIds = [];
      if (!Array.isArray(draft.playersSnapshot)) draft.playersSnapshot = [];
      if (!draft.game || typeof draft.game !== 'object') draft.game = {};
      if (!Array.isArray(draft.game.players)) draft.game.players = [];

      draft.playerIds.push(pid);
      draft.playersSnapshot.push(snapshotPlayerEntry(player));
      draft.game.players.push(buildEmptySessionPlayerState(draft, pid));
      touchSession(draft);
      ensureSessionGame(draft);
      return { ok: true, player: snapshotPlayerEntry(player) };
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
    ensureSessionRosterIntegrity(s);
    return s;
  }

  function touchSession(s){
    if (!s || typeof s !== 'object') return;
    s.updatedAt = Date.now();
  }

  function saveSession(s){
    if (!s || !stableEntityId(s)) return;
    ensureSessionRosterIntegrity(s);
    if (!Array.isArray(store.sessions)) store.sessions = [];
    const idx = findIndexByStableId(store.sessions, s);
    if (idx >= 0) store.sessions[idx] = s;
    else store.sessions.push(s);
    saveStore();
  }

  function getSessionById(id){
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    const found = sessions.find(x => sameStableEntity(x, id)) || null;
    return found ? ensureSessionRosterIntegrity(found) : null;
  }

  function getClosedSessions(){
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    return sessions
      .filter(s => s && s.status === 'closed')
      .map(s => ensureSessionRosterIntegrity(s))
      .slice()
      .sort((a,b) => numOrZero(b.closedAt || b.updatedAt) - numOrZero(a.closedAt || a.updatedAt));
  }


  // ===== Etapa 1: PDF consecutivo persistente (por sesión cerrada) =====
  function ensurePdfSeqNext(){
    let next = store.pdfSeqNext;
    if (!Number.isFinite(next) || next < 1) next = 1;
    next = Math.floor(next);

    let maxSeq = 0;
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    sessions.forEach(s => {
      const n = (s && Number.isFinite(s.pdfSeq)) ? Math.floor(s.pdfSeq) : 0;
      if (n > maxSeq) maxSeq = n;
    });

    if (next <= maxSeq) next = maxSeq + 1;
    store.pdfSeqNext = next;
  }

  function assignPdfSeqIfNeeded(s){
    if (!s || typeof s !== 'object') return false;
    if (s.status !== 'closed') return false;

    const cur = s.pdfSeq;
    if (Number.isFinite(cur) && Math.floor(cur) >= 1){
      s.pdfSeq = Math.floor(cur);
      return false;
    }

    ensurePdfSeqNext();
    const n = Math.floor(store.pdfSeqNext);
    s.pdfSeq = n;
    store.pdfSeqNext = n + 1;
    touchSession(s);
    return true;
  }


  function closeSession(id){
    const s = getSessionById(id);
    if (!s) return;
    if (s.status === 'closed') return;

    ensureSessionRosterIntegrity(s);
    s.status = 'closed';
    s.closedAt = Date.now();
    touchSession(s);

    // asignar consecutivo PDF una sola vez
    try{ assignPdfSeqIfNeeded(s); }catch(e){}

    if (store.draftSessionId === id) store.draftSessionId = '';
    saveSession(s);

    try{
      s.historicalImpact = buildSessionHistoricalImpactSnapshot(s);
      saveSession(s);
    }catch(e){}

    // keep stats fresh
    try{ recalcAndPersistStats(); }catch(e){}
  }

  function ensurePlayerState(session, pid){
    ensureSessionRosterIntegrity(session);
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
    ensureSessionRosterIntegrity(s);
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
    ensureSessionRosterIntegrity(s);
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

  function sortSessionsForAnalytics(list){
    return (Array.isArray(list) ? list : [])
      .filter(s => s && s.status === 'closed')
      .map(s => ensureSessionRosterIntegrity(s))
      .slice()
      .sort((a, b) => {
        const ca = getSessionChronology(a);
        const cb = getSessionChronology(b);
        const dayDt = numOrZero(ca.dayTs) - numOrZero(cb.dayTs);
        if (Math.abs(dayDt) > 0.0001) return dayDt;
        const dt = numOrZero(ca.sortTs) - numOrZero(cb.sortTs);
        if (Math.abs(dt) > 0.0001) return dt;
        const cmpDt = numOrZero(ca.compareTs) - numOrZero(cb.compareTs);
        if (Math.abs(cmpDt) > 0.0001) return cmpDt;
        const pdfDt = Math.floor(numOrZero(a && a.pdfSeq)) - Math.floor(numOrZero(b && b.pdfSeq));
        if (pdfDt) return pdfDt;
        return String(stableEntityId(a)).localeCompare(String(stableEntityId(b)), 'es', { sensitivity: 'base' });
      });
  }

  function computeAnalyticsFromSessions(inputSessions){
    const closed = sortSessionsForAnalytics(inputSessions);
    const byPlayer = new Map();
    const eps = 0.0001;

    const detailed = [];
    const summaryRows = [];

    closed.forEach(s => {
      const date = String(s.date || '');
      const sessionTs = getSessionSortTs(s);
      const sessionRef = pdfSessionReferenceLabel(s);
      const an = analyzeSession(s);
      const rows = an.rows;
      const sum = an.summary;
      const podiumCut = Math.min(3, Math.max(0, rows.length));
      const reportName = makeReportNameResolver(s);

      const winners = rows.filter(r => r.pos === 1);
      const winnerIds = winners.map(w => w.id);
      const winnerLabel = winners.length ? winners.map(w => reportName(w.id, w.display)).join(' & ') : '—';
      const winnerNet = winners.length ? winners[0].net : 0;

      summaryRows.push({
        sessionId: s.id,
        sessionRef,
        date,
        ts: sessionTs,
        playersCount: rows.length,
        totalInvested: sum.totalInvested,
        totalChips: sum.totalChipsValue,
        delta: sum.delta,
        winner: winnerLabel,
        winnerNet,
        winnerIds,
      });

      rows.forEach(r => {
        const pname = reportName(r.id, r.display);
        detailed.push({
          sessionId: s.id,
          sessionRef,
          date,
          ts: sessionTs,
          playerId: r.id,
          player: pname,
          buyIn: r.buyIn,
          rebuysCount: r.rebuysCount,
          rebuysTotal: r.rebuysTotal,
          invested: r.invested,
          chips: r.chips,
          net: r.net,
          pos: r.pos,
        });

        const cur = byPlayer.get(r.id) || {
          id: r.id,
          display: pname,
          games: 0,
          wins1: 0,
          podiums: 0,
          buyInsCount: 0,
          buyInsTotal: 0,
          rebuysCount: 0,
          rebuysTotal: 0,
          itmCount: 0,
          netTotal: 0,
          investedTotal: 0,
          chipsTotal: 0,
          payoutsTotal: 0,
          avgNet: 0,
          roiGlobal: 0,
          best: null,
          worst: null,
          lastSession: null,
          bestWinStreak: { length: 0, start: null, end: null },
          bestItmStreak: { length: 0, start: null, end: null },
          timeline: [],
        };
        cur.display = pname;

        cur.games += 1;
        if (r.pos === 1) cur.wins1 += 1;
        if (podiumCut && r.pos <= podiumCut) cur.podiums += 1;
        if (numOrZero(r.buyIn) > eps) cur.buyInsCount += 1;
        cur.buyInsTotal += r.buyIn;
        cur.rebuysCount += r.rebuysCount;
        cur.rebuysTotal += r.rebuysTotal;
        if (numOrZero(r.net) > eps) cur.itmCount += 1;
        cur.netTotal += r.net;
        cur.investedTotal += r.invested;
        cur.chipsTotal += r.chips;
        cur.payoutsTotal += r.chips;

        if (!cur.best || r.net > cur.best.net) cur.best = { net: r.net, date, ts: sessionTs, sessionId: s.id, sessionRef };
        if (!cur.worst || r.net < cur.worst.net) cur.worst = { net: r.net, date, ts: sessionTs, sessionId: s.id, sessionRef };
        if (!cur.lastSession || sessionTs > numOrZero(cur.lastSession.ts)){
          cur.lastSession = { date, ts: sessionTs, sessionId: s.id, sessionRef, net: r.net };
        }
        cur.timeline.push({
          sessionId: s.id,
          sessionRef,
          date,
          ts: sessionTs,
          pos: r.pos,
          net: r.net,
          isWin: r.pos === 1,
          isItm: numOrZero(r.net) > eps,
        });

        byPlayer.set(r.id, cur);
      });
    });

    const playersFlat = Array.from(byPlayer.values()).map(row => {
      row.avgNet = row.games ? (row.netTotal / row.games) : 0;
      row.roiGlobal = calcGlobalRoi(row.netTotal, row.investedTotal);
      row.bestWinStreak = calcBestStreak(row.timeline, item => !!(item && item.isWin));
      row.bestItmStreak = calcBestStreak(row.timeline, item => !!(item && item.isItm));
      return row;
    });

    const ranking = playersFlat.slice().sort(compareGlobalRanking);

    let currentRank = 0;
    ranking.forEach((row, idx) => {
      if (idx === 0){
        currentRank = 1;
        row.rankPos = 1;
        return;
      }
      const prev = ranking[idx - 1];
      if (sameGlobalRankingPosition(row, prev)) row.rankPos = prev.rankPos;
      else {
        currentRank = idx + 1;
        row.rankPos = currentRank;
      }
    });

    return {
      byPlayer,
      ranking,
      records: buildGlobalRecordItems({ players: playersFlat, detailed, summaryRows }),
      detailed,
      summaryRows,
    };
  }

  function computeAnalytics(){
    return computeAnalyticsFromSessions(getClosedSessions());
  }

  function recalcAndPersistStats(){
    store = rebuildStoreDerivedData(store);
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
    const payload = buildPortableBackupPayload();
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2,'0');
    const d = String(now.getDate()).padStart(2,'0');
    const hh = String(now.getHours()).padStart(2,'0');
    const mm = String(now.getMinutes()).padStart(2,'0');
    const filename = `Pokerito_Backup_${y}-${m}-${d}_${hh}-${mm}.json`;
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filename);
  }

  async function importBackupJson(input){
    const fileMeta = isPlainObject(input) ? {
      name: safeTrim(input.fileName),
      size: Number.isFinite(input.fileSize) ? input.fileSize : -1,
    } : { name: '', size: -1 };
    const text = isPlainObject(input) ? String(input.text || '') : String(input || '');

    let obj = null;
    try{ obj = JSON.parse(text); }catch(e){ obj = null; }
    if (!obj || typeof obj !== 'object'){
      await confirmDialog({ title: 'Importación inválida', body: 'El archivo no es JSON válido. La base local no se tocó.', okText: 'OK', cancelText: 'Cerrar', danger: true });
      return;
    }

    const inspected = inspectPortableBackupPayload(obj);
    if (!inspected.ok || !inspected.parsed || !inspected.parsed.store){
      await confirmDialog({ title: 'Importación inválida', body: (inspected.message || 'No se pudo validar el archivo.') + '\n\nLa base local no se tocó.', okText: 'OK', cancelText: 'Cerrar', danger: true });
      return;
    }

    const parsed = inspected.parsed;
    const incomingTheme = (typeof parsed.themePref === 'string' && THEME_VALUES.has(parsed.themePref)) ? parsed.themePref : null;
    const themeWillChange = !!incomingTheme && incomingTheme !== themePref;

    let preview = null;
    try{
      preview = buildMergedStoreNonDestructive(store, parsed.store);
    }catch(e){
      preview = null;
    }

    if (!preview || !preview.mergedStore || !preview.summary){
      await confirmDialog({ title: 'Importación cancelada', body: 'No se pudo preparar el merge sin riesgo. La base local quedó intacta.', okText: 'OK', cancelText: 'Cerrar', danger: true });
      return;
    }

    const ok = await confirmDialog({
      title: 'Importar JSON',
      body: buildImportPreflightText(parsed, preview.summary, { fileMeta, themeWillChange }),
      okText: 'Importar',
      cancelText: 'Cancelar',
    });
    if (!ok) return;

    const noDataChanges = !importSummaryHasChanges(preview.summary);
    const noNetChanges = noDataChanges && !themeWillChange;
    if (noNetChanges){
      await confirmDialog({
        title: 'Sin novedades',
        body: buildImportSummaryText(preview.summary, { fileMeta, noChanges: true, attemptedApply: false, errorsRejected: 0 }),
        okText: 'OK',
        cancelText: 'Cerrar'
      });
      return;
    }

    const safetyBackup = persistImportSafetyBackupSnapshot(store, fileMeta);
    const previousStore = cloneJson(store) || store;
    const previousTheme = themePref;
    let themeApplied = false;

    try{
      const candidateStore = normalizeStoreObject(cloneJson(preview.mergedStore) || preview.mergedStore).store;
      const priorSummary = isPlainObject(candidateStore.ui && candidateStore.ui.importLastSummary) ? candidateStore.ui.importLastSummary : {};
      candidateStore.ui = Object.assign({}, isPlainObject(candidateStore.ui) ? candidateStore.ui : {}, {
        importLastSummary: Object.assign({}, priorSummary, {
          fileName: fileMeta.name || '',
          fileSize: Number.isFinite(fileMeta.size) ? fileMeta.size : -1,
          noChanges: false,
          themeApplied: themeWillChange,
          safetyBackupAt: safetyBackup && safetyBackup.ok ? safetyBackup.createdAt : 0,
        }),
        importSafetyBackup: safetyBackup && safetyBackup.ok ? {
          createdAt: safetyBackup.createdAt,
          counts: cloneJson(safetyBackup.counts) || { chips: 0, players: 0, sessions: 0 },
        } : (isPlainObject(candidateStore.ui && candidateStore.ui.importSafetyBackup) ? candidateStore.ui.importSafetyBackup : null),
      });

      store = candidateStore;
      persistStore(store);
      recalcAndPersistStats();

      if (themeWillChange){
        themePref = incomingTheme;
        try{ localStorage.setItem(THEME_KEY, themePref); }catch(e){}
        applyTheme();
        themeApplied = true;
      }
    }catch(e){
      store = previousStore;
      persistStore(store);
      themePref = previousTheme;
      try{ localStorage.setItem(THEME_KEY, themePref); }catch(err){}
      applyTheme();
      const reason = safeTrim(e && e.message) || 'Error desconocido.';
      await confirmDialog({ title: 'Importación cancelada', body: `Ocurrió un error al aplicar el merge o al recalcular.\n\nDetalle: ${reason}\n\nLa base local quedó intacta.`, okText: 'OK', cancelText: 'Cerrar', danger: true });
      return;
    }

    await confirmDialog({
      title: noNetChanges ? 'Sin novedades' : 'Importación completa',
      body: buildImportSummaryText(preview.summary, { fileMeta, safetyBackup, themeApplied, noChanges: noNetChanges, attemptedApply: true, errorsRejected: 0 }),
      okText: 'OK',
      cancelText: 'Cerrar'
    });
    navigate('/administracion');
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
    return s ? ensureSessionRosterIntegrity(s) : null;
  }

  function discardDraftSession(){
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    const id = store.draftSessionId;
    if (!id) return;
    store.sessions = sessions.filter(s => !(s && s.id === id));
    store.draftSessionId = '';
    saveStore();
  }

  function showToast({ title, body, tone, duration }){
    const safeTone = ['success','error','info'].includes(tone) ? tone : 'info';
    const ttl = Math.max(1800, Math.min(4800, Math.floor(numOrZero(duration) || 2400)));
    let host = document.getElementById('toastStack');
    if (!host){
      host = el(`<div class="toast-stack" id="toastStack" aria-live="polite" aria-atomic="false"></div>`);
      document.body.appendChild(host);
    }

    const item = el(`
      <div class="toast ${safeTone}" role="status">
        ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
        ${body ? `<div class="toast-body">${escapeHtml(body)}</div>` : ''}
      </div>
    `);

    let closed = false;
    let hideTimer = 0;
    function close(){
      if (closed) return;
      closed = true;
      item.classList.remove('show');
      setTimeout(() => {
        try{ item.remove(); }catch(e){}
        if (host && !host.children.length) {
          try{ host.remove(); }catch(e){}
        }
      }, 180);
    }

    item.addEventListener('click', close);
    host.appendChild(item);
    setTimeout(() => item.classList.add('show'), 10);
    hideTimer = setTimeout(close, ttl);
    return () => {
      clearTimeout(hideTimer);
      close();
    };
  }

  function confirmDialog({ title, body, okText, cancelText, danger }){
    if (hasOpenOverlay()) return Promise.resolve(false);
    return new Promise(resolve => {
      const previousActive = rememberFocusable();
      const overlay = el(`
        <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="Confirmación">
          <div class="modal modal--confirm">
            <div class="modal-head">
              <div class="modal-title-wrap">
                <div class="modal-title">${escapeHtml(title || 'Confirmar')}</div>
              </div>
              <button class="icon-btn" type="button" data-act="close" aria-label="Cerrar">×</button>
            </div>
            <div class="modal-body">
              <div class="small-note" style="margin-top:0; white-space:pre-line">${escapeHtml(body || '')}</div>
            </div>
            <div class="modal-foot">
              <button class="btn" type="button" data-act="cancel">${escapeHtml(cancelText || 'Cancelar')}</button>
              <button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-act="ok">${escapeHtml(okText || 'OK')}</button>
            </div>
          </div>
        </div>
      `);

      let closed = false;
      function close(val){
        if (closed) return;
        closed = true;
        overlay.remove();
        try{ document.body.style.overflow = ''; }catch(e){}
        syncAppModalState(false);
        restoreFocusSafe(previousActive);
        resolve(!!val);
      }

      overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) close(false);
      });
      overlay.querySelectorAll('[data-act="close"],[data-act="cancel"]').forEach(b => b.addEventListener('click', () => close(false)));
      overlay.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
      overlay.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); close(false); }
        if (ev.key === 'Enter') { ev.preventDefault(); close(true); }
      });

      document.body.appendChild(overlay);
      try{ document.body.style.overflow = 'hidden'; }catch(e){}
      syncAppModalState(true);
    });
  }

  function numberInputDialog({ title, body, value, placeholder, okText, cancelText }){
    if (hasOpenOverlay()) return Promise.resolve(null);
    return new Promise(resolve => {
      const previousActive = rememberFocusable();
      const safeValue = sanitizeUnsignedIntInput((value === undefined || value === null) ? '' : String(value));
      const overlay = el(`
        <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="Número">
          <div class="modal modal--compact">
            <div class="modal-head">
              <div class="modal-title-wrap">
                <div class="modal-title">${escapeHtml(title || 'Número')}</div>
              </div>
              <button class="icon-btn" type="button" data-act="close" aria-label="Cerrar">×</button>
            </div>
            <div class="modal-body">
              ${body ? `<div class="small-note" style="margin-top:0">${escapeHtml(body)}</div>` : ''}
              <label class="field" style="margin-top:10px">
                <span>Cantidad</span>
                <input id="numInput" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="${escapeAttr(placeholder || '')}" value="${escapeAttr(safeValue)}" />
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
      hardenNumericInput($inp, { selectOnFocus: true });

      let closed = false;
      function close(val){
        if (closed) return;
        closed = true;
        overlay.remove();
        try{ document.body.style.overflow = ''; }catch(e){}
        syncAppModalState(false);
        restoreFocusSafe(previousActive);
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
      syncAppModalState(true);

      // iPad Safari: el teclado SOLO se abre si el focus ocurre dentro del mismo gesto (tap/click).
      focusFieldForTouch($inp, { selectIfFilled: true });
    });
  }



  function lateJoinPlayerDialog({ session }){
    if (hasOpenOverlay()) return Promise.resolve(null);
    return new Promise(resolve => {
      if (!session || safeTrim(session.status) === 'closed') {
        resolve(null);
        return;
      }
      const previousActive = rememberFocusable();
      const eligible = getLateJoinEligiblePlayers(session);
      const sessionLabel = lateJoinSessionLabel(session);
      const overlay = el(`
        <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="Agregar jugador tardío">
          <div class="modal modal--selector">
            <div class="modal-head">
              <div class="modal-title-wrap">
                <div class="modal-title">Agregar jugador</div>
                <div class="modal-subtitle">Partida ${escapeHtml(sessionLabel)} · ${escapeHtml(String(numOrZero((session.playersSnapshot || []).length)))} jugadores actuales</div>
              </div>
              <button class="icon-btn" type="button" data-act="close" aria-label="Cerrar">×</button>
            </div>
            <div class="modal-body">
              <div class="small-note" style="margin-top:0">Solo aparecen jugadores activos que ya existen y aún no están dentro de esta partida.</div>
              ${eligible.length ? `
                <div class="pick-grid late-join-grid" style="margin-top:12px">
                  ${eligible.map(p => `
                    <button class="pick late-join-pick" type="button" data-act="pick" data-id="${escapeAttr(String(stableEntityId(p)))}">
                      <div class="pick-nick">${escapeHtml(playerDisplayName(p))}</div>
                      <div class="pick-name">${escapeHtml(String(p.name || '').trim())}</div>
                    </button>
                  `).join('')}
                </div>
              ` : `<div class="empty" style="margin-top:12px">No hay jugadores activos elegibles para agregar a esta partida.</div>`}
            </div>
            <div class="modal-foot">
              <button class="btn" type="button" data-act="cancel">${eligible.length ? 'Cancelar' : 'Entendido'}</button>
            </div>
          </div>
        </div>
      `);

      let closed = false;
      function close(val){
        if (closed) return;
        closed = true;
        overlay.remove();
        try{ document.body.style.overflow = ''; }catch(e){}
        syncAppModalState(false);
        restoreFocusSafe(previousActive);
        resolve(val || null);
      }

      overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) close(null);
      });
      overlay.querySelectorAll('[data-act="close"],[data-act="cancel"]').forEach(b => b.addEventListener('click', () => close(null)));
      overlay.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-act="pick"]');
        if (!btn || btn.disabled) return;
        overlay.querySelectorAll('button[data-act="pick"]').forEach(node => { node.disabled = true; });
        close((btn.getAttribute('data-id') || '').trim());
      });
      overlay.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); close(null); }
      });

      document.body.appendChild(overlay);
      try{ document.body.style.overflow = 'hidden'; }catch(e){}
      syncAppModalState(true);
    });
  }

  function wireAdminUtilities(){
    // wire theme selector
    $app.querySelectorAll('.seg[data-theme]').forEach(b => {
      b.addEventListener('click', () => setThemePref(b.getAttribute('data-theme')));
    });
    syncSupportThemeUI();
    renderAdminUpdateUi();

    const $checkUpdateBtn = document.getElementById('checkUpdateBtn');
    if ($checkUpdateBtn){
      $checkUpdateBtn.addEventListener('click', () => {
        const stateObj = normalizeUpdateUiState(updateUiState);
        const job = stateObj.state === 'available' ? applyAppUpdate() : checkForAppUpdate();
        Promise.resolve(job).catch(() => {});
      });
    }

    // Backup
    const $file = document.getElementById('importFile');
    const $import = document.getElementById('importJsonBtn');
    const $importText = document.getElementById('importJsonBtnText');
    const $exportJson = document.getElementById('exportJsonBtn');
    const $importStatusNote = document.getElementById('importStatusNote');

    function renderImportStatusNote(){
      if (!$importStatusNote) return;
      const last = isPlainObject(store.ui && store.ui.importLastSummary) ? store.ui.importLastSummary : null;
      const backupRaw = isPlainObject(store.ui && store.ui.importSafetyBackup) ? store.ui.importSafetyBackup : readImportSafetyBackupMeta();
      const backup = backupRaw ? {
        createdAt: numOrZero(backupRaw.createdAt),
        sessions: numOrZero(backupRaw.sessions || (backupRaw.counts && backupRaw.counts.sessions)),
        players: numOrZero(backupRaw.players || (backupRaw.counts && backupRaw.counts.players)),
        chips: numOrZero(backupRaw.chips || (backupRaw.counts && backupRaw.counts.chips)),
      } : null;
      const chunks = [];
      if (last && numOrZero(last.appliedAt) > 0){
        const label = safeTrim(last.fileName) || 'respaldo sin nombre';
        chunks.push(`Último import: ${formatDateTimeShort(last.appliedAt)} · ${label}`);
        chunks.push(`Nuevo ${numOrZero(last.playersAdded) + numOrZero(last.sessionsAdded) + numOrZero(last.chipsAdded)} · existente ${numOrZero(last.playersRecognizedExisting)} · canónico ${numOrZero(last.playersReconciledCanonical)} · fusionado ${numOrZero(last.playersMerged) + numOrZero(last.chipsMerged)} · duplicado omitido ${numOrZero(last.duplicatesSkipped)} · sesión reconciliada ${numOrZero(last.sessionsUpdated)}`);
      } else {
        chunks.push('Aún no hay imports registrados en este dispositivo.');
      }
      if (backup && numOrZero(backup.createdAt) > 0){
        chunks.push(`Último respaldo local previo: ${formatDateTimeShort(backup.createdAt)} · ${numOrZero(backup.sessions)} sesiones · ${numOrZero(backup.players)} jugadores · ${numOrZero(backup.chips)} fichas`);
      }
      $importStatusNote.textContent = chunks.join(' | ');
    }

    function setImportUiBusy(busy){
      const isBusy = !!busy;
      if ($import){
        $import.classList.toggle('is-disabled', isBusy);
        $import.setAttribute('aria-disabled', isBusy ? 'true' : 'false');
      }
      if ($importText) $importText.textContent = isBusy ? 'Importando…' : 'Importar JSON';
      if ($file) {
        $file.disabled = isBusy;
        if (isBusy) {
          try{ $file.blur(); }catch(e){}
        }
      }
      if ($exportJson) $exportJson.disabled = isBusy;
    }

    if ($exportJson) $exportJson.addEventListener('click', () => exportBackupJson());
    renderImportStatusNote();

    if ($file){
      const resetImportSelection = () => {
        try{ $file.value = ''; }catch(e){}
      };

      $file.addEventListener('click', () => {
        if ($file.disabled) return;
        resetImportSelection();
      });
      $file.addEventListener('cancel', () => {
        resetImportSelection();
      });
      $file.addEventListener('change', async () => {
        const f = $file.files && $file.files[0];
        if (!f) {
          resetImportSelection();
          return;
        }
        setImportUiBusy(true);
        try{
          const txt = await f.text().catch(() => '');
          if (!txt){
            await confirmDialog({ title: 'Importación inválida', body: 'No se pudo leer el archivo seleccionado. La base local no se tocó.', okText: 'OK', cancelText: 'Cerrar', danger: true });
            return;
          }
          await importBackupJson({ text: txt, fileName: f.name, fileSize: f.size });
          renderImportStatusNote();
        } catch (e) {
          const reason = safeTrim(e && e.message) || 'Error desconocido.';
          await confirmDialog({ title: 'Importación cancelada', body: `El flujo de importación se interrumpió antes de terminar.

Detalle: ${reason}

La base local quedó intacta.`, okText: 'OK', cancelText: 'Cerrar', danger: true });
        } finally {
          setImportUiBusy(false);
          resetImportSelection();
        }
      });
    }

    // Maintenance
    const $recalcBtn = document.getElementById('recalcBtn');
    if ($recalcBtn) $recalcBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Recalcular estadísticas',
        body: 'Reconstruye ranking, récords y estadísticas desde todas las sesiones cerradas.',
        okText: 'Recalcular',
        cancelText: 'Cancelar',
      });
      if (!ok) return;
      recalcAndPersistStats();
      await confirmDialog({ title: 'Listo', body: 'Ranking, récords y estadísticas recalculados desde datos fuente.', okText: 'OK', cancelText: 'Cerrar' });
    });

    const $clearBtn = document.getElementById('clearBtn');
    if ($clearBtn) $clearBtn.addEventListener('click', async () => {
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
      navigate('/inicio', { stackMode: 'home' });
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
    document.getElementById('backBtn').addEventListener('click', () => navigate('/inicio', { stackMode: 'home' }));
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

  function installTouchZoomGuard(){
    const doc = document;
    if (!doc || !doc.documentElement) return;
    const root = doc.documentElement;
    root.setAttribute('data-touch-zoom-guard', 'on');

    let lastTouchAt = 0;
    let lastX = 0;
    let lastY = 0;
    let lastGuardTarget = null;
    let gestureMoved = false;
    let startX = 0;
    let startY = 0;

    const interactiveSelector = [
      'button',
      'a',
      'label',
      'summary',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '.btn',
      '.icon-btn',
      '.card',
      '.seg',
      '.list-row',
      '.player-row',
      '.rank-row',
      '.session-row',
      '.table-row',
      '.clickable',
      '.tap-target'
    ].join(',');

    function labelTargetsEditable(el){
      if (!el || !el.closest) return false;
      const label = el.closest('label');
      if (!label) return false;
      if (label.querySelector('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true;
      const forId = safeTrim(label.getAttribute('for'));
      if (!forId) return false;
      const control = document.getElementById(forId);
      return !!(control && control.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
    }

    function isEditableTarget(node){
      const el = (node && node.nodeType === 1) ? node : null;
      if (!el) return false;
      if (el.closest('input, textarea, select, option, [contenteditable=""], [contenteditable="true"]')) return true;
      if (labelTargetsEditable(el)) return true;
      return false;
    }

    function resolveGuardTarget(node){
      const el = (node && node.nodeType === 1) ? node : null;
      if (!el || !el.closest) return null;
      return el.closest(interactiveSelector) || el;
    }

    function sameGuardZone(a, b){
      if (!a || !b) return false;
      return a === b || a.contains(b) || b.contains(a);
    }

    function fireSyntheticClick(target){
      if (!target || typeof target.click === 'function'){
        try{ if (target) target.click(); return; }catch(e){}
      }
      try{
        const evt = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        target.dispatchEvent(evt);
      }catch(e){}
    }

    doc.addEventListener('touchstart', (ev) => {
      if (document.body && document.body.classList.contains('print-mode')) return;
      if (!ev || !ev.touches || ev.touches.length !== 1){
        lastTouchAt = 0;
        lastGuardTarget = null;
        gestureMoved = false;
        return;
      }
      const touch = ev.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      gestureMoved = false;
    }, { passive: true, capture: true });

    doc.addEventListener('touchmove', (ev) => {
      if (!ev || !ev.touches || ev.touches.length !== 1) return;
      const touch = ev.touches[0];
      if (Math.abs(touch.clientX - startX) > 10 || Math.abs(touch.clientY - startY) > 10){
        gestureMoved = true;
      }
    }, { passive: true, capture: true });

    doc.addEventListener('touchend', (ev) => {
      if (document.body && document.body.classList.contains('print-mode')) return;
      const touches = ev && ev.changedTouches;
      if (!touches || touches.length !== 1) return;
      if (gestureMoved){
        lastTouchAt = 0;
        lastGuardTarget = null;
        gestureMoved = false;
        return;
      }

      const touch = touches[0];
      const target = (ev.target && ev.target.nodeType === 1) ? ev.target : null;
      const guardTarget = resolveGuardTarget(target);
      const now = Date.now();
      const elapsed = now - lastTouchAt;
      const closeInTime = elapsed > 0 && elapsed < 320;
      const closeInSpace = Math.abs(touch.clientX - lastX) < 24 && Math.abs(touch.clientY - lastY) < 24;
      const repeatedZone = sameGuardZone(guardTarget, lastGuardTarget);
      const shouldBlockZoom = !!guardTarget && closeInTime && closeInSpace && repeatedZone && !isEditableTarget(target);

      lastTouchAt = now;
      lastX = touch.clientX;
      lastY = touch.clientY;
      lastGuardTarget = guardTarget;
      gestureMoved = false;

      if (!shouldBlockZoom) return;
      try{ ev.preventDefault(); }catch(e){}
      fireSyntheticClick(guardTarget);
    }, { passive: false, capture: true });
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

  function getRouteHref(){
    const hash = window.location.hash || '#/inicio';
    const clean = hash.startsWith('#') ? hash.slice(1) : hash;
    const href = safeTrim(clean) || '/inicio';
    if (href === '/configuracion' || href === '/soporte') return '/administracion';
    if (href === '/ranking') return '/archivo/ranking';
    if (href === '/historial') return '/archivo/historial';
    if (href === '/historial/detalle') return '/archivo/historial/detalle';
    if (href === '/perfiles') return '/archivo/perfiles';
    if (href === '/perfiles/detalle') return '/archivo/perfiles/detalle';
    if (href.startsWith('/configuracion?')) return '/administracion' + href.slice('/configuracion'.length);
    if (href.startsWith('/soporte?')) return '/administracion' + href.slice('/soporte'.length);
    if (href.startsWith('/ranking?')) return '/archivo/ranking' + href.slice('/ranking'.length);
    if (href.startsWith('/historial?')) return '/archivo/historial' + href.slice('/historial'.length);
    if (href.startsWith('/historial/detalle?')) return '/archivo/historial/detalle' + href.slice('/historial/detalle'.length);
    if (href.startsWith('/perfiles?')) return '/archivo/perfiles' + href.slice('/perfiles'.length);
    if (href.startsWith('/perfiles/detalle?')) return '/archivo/perfiles/detalle' + href.slice('/perfiles/detalle'.length);
    return href || '/inicio';
  }

  function resolveHeaderRoute(path){
    const cleanPath = normalizeNavigationHref(path);
    const routeKey = canonicalizeRoutePath((cleanPath || '').split('?')[0] || cleanPath || '/inicio');
    const key = HEADER_ROUTE_META[routeKey] ? routeKey : '/inicio';
    const meta = HEADER_ROUTE_META[key] || HEADER_ROUTE_META['/inicio'];
    const q = getHashQuery();
    let title = meta.title;
    if (key === '/archivo/historial/detalle'){
      const id = safeTrim(q.get('id'));
      const session = id ? getSessionById(id) : null;
      if (session && safeTrim(session.date)) title = `Archivo · Historial · ${safeTrim(session.date)}`;
    }
    if (key === '/archivo/perfiles/detalle'){
      const id = safeTrim(q.get('id'));
      const row = id ? getArchiveProfileById(computeAnalytics(), id) : null;
      if (row && safeTrim(row.display)) title = `Archivo · Perfil · ${safeTrim(row.display)}`;
    }
    if (key === '/pdf'){
      const id = safeTrim(q.get('id'));
      const session = id ? getSessionById(id) : null;
      title = session && safeTrim(session.date) ? `PDF · ${safeTrim(session.date)}` : 'PDF';
    }
    let fallbackBack = meta.fallbackBack || '/inicio';
    if (key === '/juego/sesion'){
      const id = safeTrim(q.get('id'));
      const session = id ? getSessionById(id) : null;
      if (session && safeTrim(session.status) === 'closed'){
        fallbackBack = `/archivo/historial/detalle?id=${encodeURIComponent(id)}`;
      }
    }
    if (key === '/pdf'){
      const id = safeTrim(q.get('id'));
      fallbackBack = id ? `/archivo/historial/detalle?id=${encodeURIComponent(id)}` : '/archivo/historial';
    }
    return {
      key,
      path: key,
      title,
      level: numOrZero(meta.level),
      fallbackBack,
      showHome: numOrZero(meta.level) >= 1,
      showBack: numOrZero(meta.level) >= 2,
      isPrint: (key === '/pdf'),
    };
  }

  function applyHeaderNavigationState(href){
    const clean = normalizeNavigationHref(href);
    const current = headerNavTrail.length ? safeTrim(headerNavTrail[headerNavTrail.length - 1]) : '';
    const previous = headerNavTrail.length > 1 ? safeTrim(headerNavTrail[headerNavTrail.length - 2]) : '';
    const intent = pendingHeaderNavIntent;
    pendingHeaderNavIntent = null;

    if (!headerNavTrail.length){
      headerNavTrail.push(clean);
      currentHeaderRouteHref = clean;
      return;
    }

    const pushIfNeeded = () => {
      if (current !== clean) headerNavTrail.push(clean);
    };

    switch (safeTrim(intent && intent.kind)){
      case 'home':
        headerNavTrail.splice(0, headerNavTrail.length, clean);
        break;
      case 'replace':
        headerNavTrail.splice(Math.max(0, headerNavTrail.length - 1), 1, clean);
        break;
      case 'back': {
        if (previous && previous === clean){
          headerNavTrail.pop();
        } else {
          const idx = headerNavTrail.lastIndexOf(clean);
          if (idx >= 0) headerNavTrail.splice(idx + 1);
          else pushIfNeeded();
        }
        break;
      }
      case 'push':
        pushIfNeeded();
        break;
      default: {
        if (previous && previous === clean){
          headerNavTrail.pop();
        } else {
          const idx = headerNavTrail.lastIndexOf(clean);
          if (idx >= 0 && idx < (headerNavTrail.length - 1)) headerNavTrail.splice(idx + 1);
          else pushIfNeeded();
        }
        break;
      }
    }

    if (!headerNavTrail.length) headerNavTrail.push(clean);
    if (headerNavTrail.length > 24) headerNavTrail.splice(0, headerNavTrail.length - 24);
    currentHeaderRouteHref = safeTrim(headerNavTrail[headerNavTrail.length - 1]) || clean;
  }

  function findHeaderBackTarget(ctx){
    const previous = headerNavTrail.length > 1 ? safeTrim(headerNavTrail[headerNavTrail.length - 2]) : '';
    if (previous && previous !== safeTrim(currentHeaderRouteHref)) return previous;
    return safeTrim(ctx && ctx.fallbackBack) || '/inicio';
  }

  function createHeaderIconButton(kind, label, onClick){
    const icon = (kind === 'back') ? ICON_BACK : ICON_HOME;
    const btn = el(`<button class="icon-btn" type="button" aria-label="${escapeAttr(label)}" title="${escapeAttr(label)}">${icon}</button>`);
    btn.addEventListener('click', onClick);
    return btn;
  }

  function syncLegacyNavButtons(ctx){
    if (!$app || !ctx || ctx.isPrint) return;
    $app.querySelectorAll('#backBtn, #toInicioBtn').forEach(node => {
      node.classList.add('legacy-nav-hide');
      const wrap = node.closest('.row, .panel-actions, .mesa-head-actions, .history-detail-actions');
      if (!wrap) return;
      const visibleButtons = Array.from(wrap.querySelectorAll('button, a')).filter(elm => !elm.classList.contains('legacy-nav-hide') && !elm.hidden && getComputedStyle(elm).display !== 'none');
      const visibleNonButtons = Array.from(wrap.children).filter(elm => !elm.matches('button, a') && !elm.classList.contains('legacy-nav-hide') && !elm.hidden && getComputedStyle(elm).display !== 'none');
      wrap.classList.toggle('legacy-nav-wrap-hide', !visibleButtons.length && !visibleNonButtons.length);
    });
  }

  function updateHeaderControls(path){
    const ctx = resolveHeaderRoute(path);
    if ($app){
      $app.dataset.route = ctx.key;
      $app.dataset.routeLevel = String(ctx.level || 0);
    }
    if ($headerTitle) $headerTitle.textContent = ctx.title || 'Pokerito';
    if ($headerNav){
      $headerNav.innerHTML = '';
      if (ctx.showBack){
        const backHref = findHeaderBackTarget(ctx);
        $headerNav.appendChild(createHeaderIconButton('back', 'Volver', () => navigate(backHref, { stackMode: 'back' })));
      }
      if (ctx.showHome){
        $headerNav.appendChild(createHeaderIconButton('home', 'Ir a inicio', () => navigate('/inicio', { stackMode: 'home' })));
      }
    }
    if ($themeToggle){
      $themeToggle.classList.toggle('hide', !!ctx.isPrint);
      if (!ctx.isPrint) updateThemeToggleIcon();
    }
    syncLegacyNavButtons(ctx);
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
      navigator.serviceWorker.register(SW_URL, { updateViaCache: 'none' })
        .then((reg) => {
          swRegistrationRef = reg;
          bindServiceWorkerLifecycle(reg);
          return reg.update().catch(() => {});
        })
        .catch(() => {});
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
    purgeLegacyClientResidue();
    installTouchZoomGuard();
    // ensure default route
    if (!window.location.hash) window.location.hash = '#/inicio';
    applyTheme();
    hydratePostUpdateUiState();
    onRoute();
  });

})();
