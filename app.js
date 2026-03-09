/* Pokerito — limpieza final y caché saneada */
(function(){
  const $app = document.getElementById('app');
  const $headerRight = document.getElementById('headerRight');

  // Theme (Auto/Light/Dark) — persisted
  const THEME_KEY = 'pokerito_theme';
  const THEME_VALUES = new Set(['auto','light','dark']);
  const mqDark = (window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);
  let themePref = loadThemePref();

  const APP_VERSION = '0.1.10';
  const APP_BUILD = 'json-import-stage5';
  const APP_CACHE_NAME = 'pokerito-v0.1.10-json-import-stage5';
  const SW_URL = './sw.js?v=0.1.10-json-import-stage5';

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
const PORTABLE_APP = 'Pokerito';
const PORTABLE_SCHEMA_VERSION = 2;
const IMPORT_SAFETY_BACKUP_KEY = 'pokerito_import_safety_backup_v1';
let store = loadStore();

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

  return Object.assign({}, src, {
    id,
    name: safeTrim(src.name),
    nick: safeTrim(src.nick),
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
        mergeStrategy: 'id-based-reconciliation-with-full-rebuild',
        entityKeys: {
          chips: 'id',
          players: 'id',
          sessions: 'id',
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
  return {
    id: stableEntityId(local) || stableEntityId(incoming),
    name: preferString(local.name, incoming.name, preferIncoming),
    nick: preferString(local.nick, incoming.nick, preferIncoming),
    active: preferBool(local.active, incoming.active, preferIncoming),
    stats: cloneJson(local.stats || incoming.stats || {}) || {},
    createdAt: minPositiveTs(local.createdAt, incoming.createdAt) || Date.now(),
    updatedAt: maxTs(local.updatedAt, incoming.updatedAt, local.createdAt, incoming.createdAt) || Date.now(),
  };
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

function buildImportSummaryText(summary){
  const lines = [
    'Importación completada.',
    '',
    `Jugadores agregados: ${numOrZero(summary && summary.playersAdded)}`,
    `Jugadores fusionados: ${numOrZero(summary && summary.playersMerged)}`,
    `Sesiones agregadas: ${numOrZero(summary && summary.sessionsAdded)}`,
    `Sesiones actualizadas: ${numOrZero(summary && summary.sessionsUpdated)}`,
    `Sesiones conservadas localmente: ${numOrZero(summary && summary.sessionsKeptLocal)}`,
    `Duplicados omitidos: ${numOrZero(summary && summary.duplicatesSkipped)}`,
    `Colisiones reconciliadas: ${numOrZero(summary && summary.conflictsResolved)}`,
    `Duplicados históricos colapsados: ${numOrZero(summary && summary.duplicateSessionsCollapsed)}`, 
  ];
  if (numOrZero(summary && summary.chipsAdded) > 0 || numOrZero(summary && summary.chipsMerged) > 0){
    lines.push('', `Fichas agregadas: ${numOrZero(summary && summary.chipsAdded)}`, `Fichas fusionadas: ${numOrZero(summary && summary.chipsMerged)}`);
  }
  lines.push('', 'Regla final: misma sesión + mismo contenido = duplicado; misma sesión + contenido distinto = se resuelve por updatedAt, sin degradar una cerrada a draft, y luego se recalcula todo desde sesiones cerradas reconciliadas.');
  return lines.join('\n');
}

function buildImportPreflightText(parsed){
  const normalized = normalizeStoreObject(parsed && parsed.store).store;
  const chipsN = Array.isArray(normalized.chips) ? normalized.chips.length : 0;
  const playersN = Array.isArray(normalized.players) ? normalized.players.length : 0;
  const sessionsN = Array.isArray(normalized.sessions) ? normalized.sessions.length : 0;
  const closedN = Array.isArray(normalized.sessions) ? normalized.sessions.filter(s => s && s.status === 'closed').length : 0;
  return [
    'Archivo validado.',
    '',
    `Fichas en archivo: ${chipsN}`,
    `Jugadores en archivo: ${playersN}`,
    `Sesiones en archivo: ${sessionsN}`,
    `Sesiones cerradas: ${closedN}`,
    '',
    'Se aplicará merge con reconciliación histórica y luego recálculo global completo desde datos fuente.',
  ].join('\n');
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
  const incoming = normalizeStoreObject(incomingStore).store;

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

  const summary = {
    chipsAdded: 0,
    chipsMerged: 0,
    playersAdded: 0,
    playersMerged: 0,
    sessionsAdded: 0,
    sessionsUpdated: 0,
    sessionsKeptLocal: 0,
    duplicatesSkipped: 0,
    conflictsResolved: 0,
    conflictsDetected: 0,
    duplicateSessionsCollapsed: 0,
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

  const finalSessionById = new Map();
  finalSessions.forEach(session => {
    const sid = stableEntityId(session);
    if (sid && !finalSessionById.has(sid)) finalSessionById.set(sid, session);
  });

  const requestedDraftId = firstNonEmpty(cur.draftSessionId, incoming.draftSessionId);
  let nextDraftId = '';
  if (requestedDraftId && finalSessionById.has(requestedDraftId)){
    const draftCandidate = finalSessionById.get(requestedDraftId);
    if (draftCandidate && draftCandidate.status === 'draft') nextDraftId = requestedDraftId;
  }
  if (!nextDraftId){
    const firstDraft = finalSessions.find(s => s && s.status === 'draft');
    nextDraftId = firstDraft ? stableEntityId(firstDraft) : '';
  }

  const mergedStore = normalizeStoreObject(Object.assign({}, cur, {
    chips,
    players,
    sessions: finalSessions,
    pdfSeqNext: Math.max(numOrZero(cur.pdfSeqNext), numOrZero(incoming.pdfSeqNext), 1),
    draftSessionId: nextDraftId,
    updatedAt: Date.now(),
    ui: Object.assign({}, isPlainObject(cur.ui) ? cloneJson(cur.ui) || {} : {}, {
      importLastSummary: {
        appliedAt: Date.now(),
        rule: 'same-session-same-content=duplicate; same-session-different-content=updatedAt-without-downgrading-closed-to-draft; rebuild-derived-from-source',
        playersAdded: summary.playersAdded,
        playersMerged: summary.playersMerged,
        sessionsAdded: summary.sessionsAdded,
        sessionsUpdated: summary.sessionsUpdated,
        sessionsKeptLocal: summary.sessionsKeptLocal,
        duplicatesSkipped: summary.duplicatesSkipped,
        conflictsDetected: summary.conflictsDetected,
        conflictsResolved: summary.conflictsResolved,
        duplicateSessionsCollapsed: summary.duplicateSessionsCollapsed,
        chipsAdded: summary.chipsAdded,
        chipsMerged: summary.chipsMerged,
        conflicts: summary.conflicts.slice(0, 50),
      }
    }),
  })).store;

  return { mergedStore, summary };
}


function purgeLegacyStorageResidue(){
  const keep = new Set([STORE_KEY, THEME_KEY]);

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
    '/historial': renderHistorial,
    '/historial/detalle': renderHistorialDetalle,
    '/ranking': renderRanking,
    '/configuracion': renderConfiguracion,
    '/soporte': renderSoporte,
    '/pdf': renderPdf,
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


  function onRoute(){
    const path = getRoute();
    const isPrint = (path === '/pdf');
    try{ document.body.classList.toggle('print-mode', isPrint); }catch(e){}
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
              <button class="btn" type="button" id="toHistorialBtn">Histórico</button>
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
                      <button class="btn" type="button" data-act="view">Ver</button>
                      <button class="btn" type="button" data-act="pdf">PDF</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
            ${closedSessions.length > 1 ? `<div class="small-note">Hay ${escapeHtml(String(closedSessions.length))} sesiones cerradas. Mira <b>Histórico</b> para ver todas.</div>` : ''}
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
        const btn = ev.target.closest('button[data-act]');
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        const row = ev.target.closest('.hist-item');
        if (!row) return;
        const id = row.getAttribute('data-id');
        if (!id) return;
        if (act === 'view'){
          navigate('/historial/detalle?id=' + encodeURIComponent(id));
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
        <section class="screen" aria-label="Histórico">
          <h1 class="screen-title">Histórico</h1>
          <p class="screen-sub">Sesiones cerradas. Más reciente arriba.</p>

          <div class="panel" role="region" aria-label="Listado">
            <div class="panel-head">
              <div class="panel-title" style="margin:0">Sesiones</div>
              <div class="row">
                <button class="btn" type="button" id="toRankingBtn">Ranking</button>
                <button class="btn" type="button" id="backBtn">Volver</button>
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

      document.getElementById('backBtn').addEventListener('click', () => navigate('/inicio'));
      document.getElementById('toRankingBtn').addEventListener('click', () => navigate('/ranking'));

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
                <button class="btn" type="button" data-act="view">Ver</button>
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
            navigate('/historial/detalle?id=' + encodeURIComponent(id));
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
      navigate('/historial');
      return;
    }
    ensureSessionGame(s);

    const reportName = makeReportNameResolver(s);

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
                  const who = reportName(r.id, r.display);
                  return `
                    <tr>
                      <td class="pos">${escapeHtml(String(r.pos))}</td>
                      <td class="who">${escapeHtml(String(who))}</td>
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

  
  // ===== Etapa 2: Reporte PDF (imprimible, landscape) =====
  function renderPdf(){
    const q = getHashQuery();
    const id = (q.get('id') || '').trim();
    const s = id ? getSessionById(id) : null;
    if (!s){
      const root = el(`
        <section class="print-screen" aria-label="Reporte PDF">
          <div class="print-actions">
            <button class="btn" type="button" id="backBtn">Volver</button>
          </div>
          <div class="empty">Sesión no encontrada.</div>
        </section>
      `);
      $app.innerHTML = '';
      $app.appendChild(root);
      document.getElementById('backBtn').addEventListener('click', () => navigate('/historial'));
      return;
    }

    ensureSessionGame(s);

    // Etapa 1: asegurar consecutivo PDF persistente (backfill suave)
    try{
      if (s.status === 'closed'){
        const changed = assignPdfSeqIfNeeded(s);
        if (changed) saveSession(s);
      }
    }catch(e){}

    const prevTitle = document.title;
    const ddmmyyyy = sessionDDMMYYYY(s);
    const seqNum = (Number.isFinite(s.pdfSeq) && Math.floor(s.pdfSeq) >= 1) ? Math.floor(s.pdfSeq) : 0;
    const printTitle = `${pad3(seqNum)}- Pokerito ${ddmmyyyy}`;

    function setPrintTitle(){
      try{ document.title = printTitle; }catch(e){}
    }
    function restoreTitle(){
      try{ document.title = prevTitle; }catch(e){}
    }

    // setear title antes de imprimir para sugerir nombre de archivo
    setPrintTitle();
    try{ window.addEventListener('afterprint', restoreTitle, { once: true }); }catch(e){}
    try{ window.addEventListener('focus', restoreTitle, { once: true }); }catch(e){}

    const an = analyzeSession(s);
    const sum = an.summary;
    const rows = an.rows.slice();

    const eps = 0.0001;

    const reportName = makeReportNameResolver(s);

    // Ganadores: pos === 1 (empates permitidos)
    const winners = rows.filter(r => r.pos === 1);
    const winnersLabel = winners.length ? winners.map(r => reportName(r.id, r.display)).join(', ') : '—';

    // Perdedores: chips === 0 si existen; si no, net mínimo (empates permitidos)
    const zeroChips = rows.filter(r => Math.abs(numOrZero(r.chips)) <= eps);
    let losers = [];
    if (zeroChips.length){
      losers = zeroChips;
    } else if (rows.length){
      const minNet = rows.reduce((m, r) => Math.min(m, numOrZero(r.net)), Infinity);
      losers = rows.filter(r => Math.abs(numOrZero(r.net) - minNet) <= eps);
    }
    const losersLabel = losers.length ? losers.map(r => reportName(r.id, r.display)).join(', ') : '—';

    // Rebuys totales
    const rebuysCount = rows.reduce((a, r) => a + Math.max(0, Math.floor(numOrZero(r.rebuysCount))), 0);
    const rebuysTotal = rows.reduce((a, r) => a + numOrZero(r.rebuysTotal), 0);

    // Hora de cierre
    const ts = numOrZero(s.closedAt || s.updatedAt) || Date.now();
    const d = new Date(ts);
    const closeTime = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

    // Table
    const tbody = rows.map(r => {
      const name = reportName(r.id, r.display);
      const invested = numOrZero(r.invested);
      const net = numOrZero(r.net);
      const ganado = Math.max(0, net);
      const perdido = Math.max(0, -net);
      return `
        <tr>
          <td class="who">${escapeHtml(String(name))}</td>
          <td class="num">${escapeHtml(formatMoney(invested))}</td>
          <td class="num">${escapeHtml(formatMoney(ganado))}</td>
          <td class="num">${escapeHtml(formatMoney(perdido))}</td>
        </tr>
      `;
    }).join('');

    const root = el(`
      <section class="print-screen" aria-label="Reporte PDF">
        <div class="print-actions">
          <button class="btn primary" type="button" id="printBtn">Imprimir / Guardar PDF</button>
          <button class="btn" type="button" id="backBtn">Volver</button>
        </div>

        <div class="print-head">
          <div class="print-brand">
            <img class="print-logo" src="assets/icons/icon-192.png" alt="" />
            <span>POKERITO</span>
          </div>
        </div>

        <div class="print-meta">
          <div class="print-line"><span class="k">Fecha de juego</span><span class="v">${escapeHtml(String(s.date || ''))}</span></div>
          <div class="print-line"><span class="k">Monto total jugado</span><span class="v">${escapeHtml(formatMoney(sum.totalInvested))}</span></div>
          <div class="print-line"><span class="k">Jugador ganador</span><span class="v">${escapeHtml(String(winnersLabel))}</span></div>
          <div class="print-line"><span class="k">Perdedores</span><span class="v">${escapeHtml(String(losersLabel))}</span></div>
          <div class="print-line"><span class="k">Total fichas</span><span class="v">${escapeHtml(formatMoney(sum.totalChipsValue))}</span></div>
          <div class="print-line"><span class="k">Δ</span><span class="v">${escapeHtml(formatMoney(sum.delta))}</span></div>
          <div class="print-line"><span class="k">Cantidad de jugadores</span><span class="v">${escapeHtml(String(sum.playersCount))}</span></div>
          <div class="print-line"><span class="k">Rebuys totales</span><span class="v">${escapeHtml(String(rebuysCount))} · ${escapeHtml(formatMoney(rebuysTotal))}</span></div>
          <div class="print-line"><span class="k">Hora de cierre</span><span class="v">${escapeHtml(String(closeTime))}</span></div>
        </div>

        <div class="print-table-wrap" role="region" aria-label="Tabla por jugador">
          <table class="print-table">
            <thead>
              <tr>
                <th>Jugador</th>
                <th class="num">Jugado</th>
                <th class="num">Ganado</th>
                <th class="num">Perdido</th>
              </tr>
            </thead>
            <tbody>
              ${tbody}
            </tbody>
          </table>
        </div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    document.getElementById('printBtn').addEventListener('click', () => {
      try{ setPrintTitle(); }catch(e){}
      try{ window.print(); }catch(e){}
    });
    document.getElementById('backBtn').addEventListener('click', () => {
      try{ restoreTitle(); }catch(e){}
      // si el tab fue abierto por script, intentamos cerrarlo
      try{ if (window.opener) window.close(); }catch(e){}
      navigate('/historial');
    });

    // opcional: intentar auto-print (si el browser lo permite)
    try{ setTimeout(() => { try{ setPrintTitle(); }catch(e){}; try{ window.print(); }catch(e){}; }, 350); }catch(e){}
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
              <button class="btn" type="button" id="toHistBtn">Histórico</button>
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
                  <div class="mesa-player-ident">
                    <div class="mesa-player-nick">${escapeHtml(disp || 'Sin nombre')}</div>
                    <div class="mesa-player-name">${escapeHtml((name || '').trim())}</div>
                  </div>
                  <div class="rebuy-box">
                    <button class="btn small" type="button" data-act="rebuy" ${readOnly ? 'disabled' : ''}>+ Rebuy</button>
                    <div class="rebuy-meta"><span class="k">Rebuys</span><span class="v" data-role="rebuyCount">${escapeHtml(String((st.rebuys||[]).length))}</span></div>
                  </div>
                </div>

                <div class="buyin-block">
                  <label class="field compact">
                    <span>Buy-in</span>
                    <input class="buyin" type="number" inputmode="numeric" pattern="[0-9]*" placeholder="0" value="${escapeAttr(String(numOrZero(st.buyIn) || ''))}" ${readOnly ? 'disabled' : ''} />
                  </label>
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
    if (!s || !stableEntityId(s)) return;
    if (!Array.isArray(store.sessions)) store.sessions = [];
    const idx = findIndexByStableId(store.sessions, s);
    if (idx >= 0) store.sessions[idx] = s;
    else store.sessions.push(s);
    saveStore();
  }

  function getSessionById(id){
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    return sessions.find(x => sameStableEntity(x, id)) || null;
  }

  function getClosedSessions(){
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    return sessions
      .filter(s => s && s.status === 'closed')
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

    s.status = 'closed';
    s.closedAt = Date.now();
    touchSession(s);

    // asignar consecutivo PDF una sola vez
    try{ assignPdfSeqIfNeeded(s); }catch(e){}

    if (store.draftSessionId === id) store.draftSessionId = '';
    saveSession(s);

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

      const reportName = makeReportNameResolver(s);

      // session records
      if (!maxTotalInvested || sum.totalInvested > maxTotalInvested.amount){
        maxTotalInvested = { date, amount: sum.totalInvested };
      }

      // winners: position 1 (ties allowed)
      const winners = rows.filter(r => r.pos === 1);
      const winnerIds = winners.map(w => w.id);
      const winnerLabel = winners.length ? winners.map(w => reportName(w.id, w.display)).join(' & ') : '—';
      const winnerNet = winners.length ? winners[0].net : 0;

      summaryRows.push({
        sessionId: s.id,
        date,
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
          date,
          playerId: r.id,
          player: pname,
          buyIn: r.buyIn,
          rebuysTotal: r.rebuysTotal,
          invested: r.invested,
          chips: r.chips,
          net: r.net,
          pos: r.pos,
        });

        // global gain/loss
                if (!maxGain || r.net > maxGain.amount){
          maxGain = { date, amount: r.net, sessionId: s.id, playerId: r.id, player: pname };
        }
        if (!maxLoss || r.net < maxLoss.amount){
          maxLoss = { date, amount: r.net, sessionId: s.id, playerId: r.id, player: pname };
        }

        // player aggregates
        const cur = byPlayer.get(r.id) || {
          id: r.id,
          display: pname,
          games: 0,
          wins1: 0,
          netTotal: 0,
          investedTotal: 0,
          chipsTotal: 0,
          best: null, // { net, date }
          worst: null,
        };
        cur.display = pname;

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
    // persist into players.stats (for convenience) + global block rebuilt from source sessions
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
      records: cloneJson(a.records) || {},
      ranking: a.ranking.map((row, idx) => ({
        pos: idx + 1,
        id: row.id,
        display: row.display,
        games: row.games,
        wins1: row.wins1,
        netTotal: row.netTotal,
        investedTotal: row.investedTotal,
        chipsTotal: row.chipsTotal,
        best: cloneJson(row.best) || null,
        worst: cloneJson(row.worst) || null,
      })),
      byPlayer: Array.from(a.byPlayer.values()).map(st => ({
        id: st.id,
        display: st.display,
        games: st.games,
        wins1: st.wins1,
        netTotal: st.netTotal,
        investedTotal: st.investedTotal,
        chipsTotal: st.chipsTotal,
        best: cloneJson(st.best) || null,
        worst: cloneJson(st.worst) || null,
      })),
      summaryRows: cloneJson(a.summaryRows) || [],
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

    const safetyBackup = persistImportSafetyBackupSnapshot(store);
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
      await confirmDialog({ title: 'Importación cancelada', body: 'Ocurrió un error al aplicar el merge o al recalcular. La base local quedó intacta.', okText: 'OK', cancelText: 'Cerrar', danger: true });
      return;
    }

    await confirmDialog({
      title: noNetChanges ? 'Sin novedades' : 'Importación completa',
      body: buildImportSummaryText(preview.summary, { fileMeta, safetyBackup, themeApplied, noChanges: noNetChanges, attemptedApply: true, errorsRejected: 0 }),
      okText: 'OK',
      cancelText: 'Cerrar'
    });
    navigate('/soporte');
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
              <div class="small-note" style="margin-top:0; white-space:pre-line">${escapeHtml(body || '')}</div>
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
      const safeValue = (value === undefined || value === null) ? '' : String(value);
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
      const shouldSelect = (($inp.value || '').length > 0);
      const reselect = () => {
        try{
          const len = ($inp.value || '').length;
          if (typeof $inp.setSelectionRange === 'function') $inp.setSelectionRange(0, len);
          else if (typeof $inp.select === 'function') $inp.select();
        }catch(e){}
      };
      if (shouldSelect){
        reselect();
        // Safari iPad PWA: segundo intento leve para que quede seleccionado “de verdad”
        setTimeout(reselect, 60);
      }
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
            <div class="row" style="gap:10px; flex-wrap:wrap">
              <button class="btn" type="button" id="exportJsonBtn">Exportar JSON</button>
              <button class="btn primary" type="button" id="importJsonBtn">Importar JSON</button>
            </div>
          </div>
          <input id="importFile" type="file" accept=".json,application/json" style="display:none" />
          <div class="small-note" style="margin-top:10px">Importar valida primero, muestra vista previa útil, crea un respaldo local de seguridad antes de aplicar y solo guarda si merge + recálculo terminan bien.</div>
          <div class="small-note" id="importStatusNote" style="margin-top:10px"></div>
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
        chunks.push(`Agregado ${numOrZero(last.playersAdded) + numOrZero(last.sessionsAdded) + numOrZero(last.chipsAdded)} · fusionado ${numOrZero(last.playersMerged) + numOrZero(last.chipsMerged)} · duplicado omitido ${numOrZero(last.duplicatesSkipped)} · reconciliado ${numOrZero(last.sessionsUpdated)}`);
      } else {
        chunks.push('Aún no hay imports registrados en este dispositivo.');
      }
      if (backup && numOrZero(backup.createdAt) > 0){
        chunks.push(`Último respaldo local previo: ${formatDateTimeShort(backup.createdAt)} · ${numOrZero(backup.sessions)} sesiones · ${numOrZero(backup.players)} jugadores · ${numOrZero(backup.chips)} fichas`);
      }
      $importStatusNote.textContent = chunks.join(' | ');
    }

    function setImportUiBusy(busy){
      if ($import){
        $import.disabled = !!busy;
        $import.textContent = busy ? 'Importando…' : 'Importar JSON';
      }
      if ($exportJson) $exportJson.disabled = !!busy;
    }

    if ($exportJson) $exportJson.addEventListener('click', () => exportBackupJson());
    renderImportStatusNote();

    function openPicker(){
      if ($file) { $file.value = ''; $file.click(); }
    }
    if ($import) $import.addEventListener('click', () => openPicker());

    if ($file){
      $file.addEventListener('change', async () => {
        const f = $file.files && $file.files[0];
        if (!f) return;
        setImportUiBusy(true);
        try{
          const txt = await f.text().catch(() => '');
          if (!txt){
            await confirmDialog({ title: 'Importación inválida', body: 'No se pudo leer el archivo seleccionado. La base local no se tocó.', okText: 'OK', cancelText: 'Cerrar', danger: true });
            return;
          }
          await importBackupJson({ text: txt, fileName: f.name, fileSize: f.size });
          renderImportStatusNote();
        } finally {
          setImportUiBusy(false);
          if ($file) $file.value = '';
        }
      });
    }

    // Maintenance
    document.getElementById('recalcBtn').addEventListener('click', async () => {
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
      navigator.serviceWorker.register(SW_URL, { updateViaCache: 'none' })
        .then((reg) => reg.update().catch(() => {}))
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
    // ensure default route
    if (!window.location.hash) window.location.hash = '#/inicio';
    applyTheme();
    onRoute();
  });

})();
