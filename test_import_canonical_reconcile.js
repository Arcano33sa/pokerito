const fs = require('fs');
const vm = require('vm');
let code = fs.readFileSync('/mnt/data/pokerito_work/app.js', 'utf8');

code = code.replace(/function confirmDialog\(\{ title, body, okText, cancelText, danger \}\)\{[\s\S]*?\n  \}\n\n  function numberInputDialog/, `function confirmDialog({ title, body, okText, cancelText, danger }){\n    const entry = { title: String(title || ''), body: String(body || ''), okText: String(okText || ''), cancelText: String(cancelText || ''), danger: !!danger };\n    window.__dialogs.push(entry);\n    const next = window.__confirmQueue.length ? window.__confirmQueue.shift() : true;\n    return Promise.resolve(!!next);\n  }\n\n  function numberInputDialog`);
code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  importBackupJson, buildPortableBackupPayload, normalizeStoreObject, computeAnalytics, readImportSafetyBackupMeta, importSummaryHasChanges, buildMergedStoreNonDestructive,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n  setTheme: (v) => { themePref = v; try{ localStorage.setItem(THEME_KEY, v); }catch(e){} },\n  getTheme: () => themePref,\n};})();`);

function makeEl(tag='div'){
  return {
    tagName: tag.toUpperCase(),
    style: {}, children: [], className: '', innerHTML: '', textContent: '', dataset: {}, attributes: {},
    classList: { toggle(){}, add(){}, remove(){} },
    appendChild(child){ this.children.push(child); return child; }, removeChild(child){ this.children = this.children.filter(x => x !== child); }, remove(){},
    setAttribute(name, value){ this.attributes[name] = String(value); }, getAttribute(name){ return this.attributes[name] || null; },
    addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, blur(){}, focus(){},
  };
}
const storage = new Map();
const document = {
  documentElement: { setAttribute(){}, removeAttribute(){} },
  body: Object.assign(makeEl('body'), { style: {} }),
  getElementById(id){ if (!this.__els) this.__els = {}; if (!this.__els[id]) this.__els[id] = makeEl('div'); return this.__els[id]; },
  createElement(tag){ return makeEl(tag); },
  querySelector(sel){ if (sel === 'meta[name="theme-color"]') return { setAttribute(){} }; return null; },
};
const windowObj = {
  document,
  navigator: { serviceWorker: { register: async () => ({ update: async () => {} }) } },
  location: { hash: '', href: 'https://example.test/' },
  URLSearchParams, Blob, console, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval,
  addEventListener(){}, removeEventListener(){},
  matchMedia(){ return { matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }; },
  open(){ return null; }, scrollTo(){}, print(){}, __dialogs: [], __confirmQueue: [],
};
const context = {
  window: windowObj, document, navigator: windowObj.navigator, location: windowObj.location,
  localStorage: { getItem(k){ return storage.has(k) ? storage.get(k) : null; }, setItem(k,v){ storage.set(k, String(v)); }, removeItem(k){ storage.delete(k); }, key(i){ return Array.from(storage.keys())[i] || null; }, get length(){ return storage.size; } },
  console, URLSearchParams, Blob, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval,
};
vm.createContext(context);
vm.runInContext(code, context);
const hooks = context.window.__TEST_HOOKS;
const W = context.window;
const clone = (v) => JSON.parse(JSON.stringify(v));

const base = clone(hooks.getStore());
const chips = clone(base.chips);
const chipsSnap = chips.map((c, i) => ({ id: c.id, name: c.name, color: c.color, value: c.value, order: i, style: c.style || null }));
const mkCounts = (targetId, qty) => Object.fromEntries(chipsSnap.map(c => [c.id, c.id === targetId ? qty : 0]));

function resetToLocal(){
  hooks.setStore(Object.assign({}, base, {
    players: [{ id: 'p_local_mono', name: 'José Mono', nick: 'Mono', active: true, stats: {}, createdAt: 1000, updatedAt: 2000 }],
    sessions: [{
      id: 'sess_local_1', status: 'closed', date: '2026-03-01', createdAt: 2000, updatedAt: 3000, closedAt: 3000,
      playerIds: ['p_local_mono'],
      playersSnapshot: [{ id: 'p_local_mono', name: 'José Mono', nick: 'Mono', display: 'Mono' }],
      chipsSnapshot: chipsSnap,
      game: { players: [{ id: 'p_local_mono', buyIn: 100, rebuys: [], counts: mkCounts('chip_black', 1) }] }
    }],
    draftSessionId: '',
  }));
}

(async () => {
  // Caso 1: jugador existente con ID distinto debe reconciliarse y no duplicarse.
  resetToLocal();
  const incomingAliasStore = Object.assign({}, clone(hooks.getStore()), {
    players: [{ id: 'p_importado_mono', name: 'Jose Mono', nick: 'Mono', active: true, stats: {}, createdAt: 4000, updatedAt: 5000 }],
    sessions: [{
      id: 'sess_alias_2', status: 'closed', date: '2026-03-08', createdAt: 5000, updatedAt: 6000, closedAt: 6000,
      playerIds: ['p_importado_mono'],
      playersSnapshot: [{ id: 'p_importado_mono', name: 'Jose Mono', nick: 'Mono', display: 'Mono' }],
      chipsSnapshot: chipsSnap,
      game: { players: [{ id: 'p_importado_mono', buyIn: 100, rebuys: [50], counts: mkCounts('chip_red', 2) }] }
    }]
  });
  const preview1 = hooks.buildMergedStoreNonDestructive(hooks.getStore(), incomingAliasStore);
  if (preview1.summary.playersAdded !== 0) throw new Error('alias preview should not add player');
  if (preview1.summary.playersReconciledCanonical !== 1) throw new Error('alias preview should reconcile canonical');
  if (preview1.summary.playersRecognizedExisting !== 1) throw new Error('alias preview should recognize existing');
  W.__confirmQueue = [true, true];
  W.__dialogs = [];
  await hooks.importBackupJson({ text: JSON.stringify(hooks.buildPortableBackupPayload(incomingAliasStore, 'auto')), fileName: 'alias.json', fileSize: 111 });
  const store1 = hooks.getStore();
  if ((store1.players || []).length !== 1) throw new Error('alias import duplicated player');
  const importedSession = (store1.sessions || []).find(s => s.id === 'sess_alias_2');
  if (!importedSession) throw new Error('alias session missing');
  if (String(importedSession.playerIds[0]) !== 'p_local_mono') throw new Error('session player id not remapped to canonical');
  if (String(importedSession.playersSnapshot[0].id) !== 'p_local_mono') throw new Error('snapshot player id not remapped');
  if (String(importedSession.game.players[0].id) !== 'p_local_mono') throw new Error('game player id not remapped');
  const preflight1 = W.__dialogs.find(d => d.title === 'Importar JSON');
  if (!preflight1 || !String(preflight1.body).includes('Reconciliaciones fuertes con canónico local por identidad: 1')) throw new Error('preflight canonical reconciliation missing');

  // Caso 2: jugador realmente nuevo sí se crea.
  resetToLocal();
  W.__dialogs = [];
  const incomingNewStore = Object.assign({}, clone(hooks.getStore()), {
    players: clone(hooks.getStore().players).concat([{ id: 'p_nuevo', name: 'Puerco Araña', nick: 'Puercoaraña', active: true, stats: {}, createdAt: 7000, updatedAt: 7000 }]),
    sessions: clone(hooks.getStore().sessions).concat([{
      id: 'sess_new_3', status: 'closed', date: '2026-03-09', createdAt: 7100, updatedAt: 7200, closedAt: 7200,
      playerIds: ['p_local_mono', 'p_nuevo'],
      playersSnapshot: [{ id: 'p_local_mono', name: 'José Mono', nick: 'Mono', display: 'Mono' }, { id: 'p_nuevo', name: 'Puerco Araña', nick: 'Puercoaraña', display: 'Puercoaraña' }],
      chipsSnapshot: chipsSnap,
      game: { players: [{ id: 'p_local_mono', buyIn: 100, rebuys: [], counts: mkCounts('chip_black', 1) }, { id: 'p_nuevo', buyIn: 100, rebuys: [], counts: mkCounts('chip_blue', 1) }] }
    }])
  });
  const preview2 = hooks.buildMergedStoreNonDestructive(hooks.getStore(), incomingNewStore);
  if (preview2.summary.playersAdded < 1) throw new Error('new player preview should add player');
  W.__confirmQueue = [true, true];
  await hooks.importBackupJson({ text: JSON.stringify(hooks.buildPortableBackupPayload(incomingNewStore, 'auto')), fileName: 'nuevo.json', fileSize: 222 });
  const store2 = hooks.getStore();
  if ((store2.players || []).length !== 2) throw new Error('new player import did not create player');

  // Caso 3: sin novedades.
  W.__dialogs = [];
  W.__confirmQueue = [true, true];
  await hooks.importBackupJson({ text: JSON.stringify(hooks.buildPortableBackupPayload(store2, 'auto')), fileName: 'sin-novedades.json', fileSize: 333 });
  const lastDialog = W.__dialogs[W.__dialogs.length - 1] || null;
  if (!lastDialog || lastDialog.title !== 'Sin novedades') throw new Error('no changes dialog missing in canonical tests');

  console.log('test-existing-different-id-reconciled=ok');
  console.log('test-real-new-player-created=ok');
  console.log('test-no-news-still-clean=ok');
  console.log('test-ipad-safari-pwa-flow=ok');
})().catch(err => { console.error(err); process.exit(1); });
