
const fs = require('fs');
const vm = require('vm');
let code = fs.readFileSync('/mnt/data/pokerito_work/app.js', 'utf8');

code = code.replace(/function confirmDialog\(\{ title, body, okText, cancelText, danger \}\)\{[\s\S]*?\n  \}\n\n  function numberInputDialog/, `function confirmDialog({ title, body, okText, cancelText, danger }){\n    const entry = { title: String(title || ''), body: String(body || ''), okText: String(okText || ''), cancelText: String(cancelText || ''), danger: !!danger };\n    window.__dialogs.push(entry);\n    const next = window.__confirmQueue.length ? window.__confirmQueue.shift() : true;\n    return Promise.resolve(!!next);\n  }\n\n  function numberInputDialog`);
code = code.replace('      recalcAndPersistStats();\n', '      recalcAndPersistStats();\n      if (window.__forceImportApplyError) throw new Error(\'FORCED_IMPORT_FAILURE\');\n');
code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  importBackupJson, buildPortableBackupPayload, normalizeStoreObject, computeAnalytics, readImportSafetyBackupMeta, importSummaryHasChanges,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n  setTheme: (v) => { themePref = v; try{ localStorage.setItem(THEME_KEY, v); }catch(e){} },\n  getTheme: () => themePref,\n};})();`);

function makeEl(tag='div'){
  return {
    tagName: tag.toUpperCase(),
    style: {},
    children: [],
    className: '',
    innerHTML: '',
    textContent: '',
    dataset: {},
    attributes: {},
    classList: { toggle(){}, add(){}, remove(){} },
    appendChild(child){ this.children.push(child); return child; },
    removeChild(child){ this.children = this.children.filter(x => x !== child); },
    remove(){},
    setAttribute(name, value){ this.attributes[name] = String(value); },
    getAttribute(name){ return this.attributes[name] || null; },
    addEventListener(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    blur(){},
    focus(){},
  };
}
const storage = new Map();
const document = {
  documentElement: { setAttribute(){}, removeAttribute(){}, dataset: {}, style: { setProperty(){} }, classList: { toggle(){}, add(){}, remove(){} }, clientWidth: 1024, clientHeight: 768 },
  body: Object.assign(makeEl('body'), { style: {} }),
  getElementById(id){ if (!this.__els) this.__els = {}; if (!this.__els[id]) this.__els[id] = makeEl('div'); return this.__els[id]; },
  createElement(tag){
    if (tag === 'template') return { innerHTML: '', content: { firstElementChild: makeEl('div') } };
    return makeEl(tag);
  },
  querySelector(sel){ if (sel === 'meta[name="theme-color"]') return { setAttribute(){} }; return null; },
};
const windowObj = {
  document,
  navigator: { serviceWorker: { register: async () => ({ update: async () => {} }) } },
  location: { hash: '', href: 'https://example.test/' },
  URLSearchParams,
  Blob,
  console,
  Math,
  JSON,
  Date,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  addEventListener(){},
  removeEventListener(){},
  matchMedia(){ return { matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }; },
  open(){ return null; },
  scrollTo(){},
  print(){},
  __dialogs: [],
  __confirmQueue: [],
  __forceImportApplyError: false,
};
const context = {
  window: windowObj,
  document,
  navigator: windowObj.navigator,
  location: windowObj.location,
  localStorage: {
    getItem(k){ return storage.has(k) ? storage.get(k) : null; },
    setItem(k,v){ storage.set(k, String(v)); },
    removeItem(k){ storage.delete(k); },
    key(i){ return Array.from(storage.keys())[i] || null; },
    get length(){ return storage.size; },
  },
  console,
  URLSearchParams,
  Blob,
  Math,
  JSON,
  Date,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
};
vm.createContext(context);
vm.runInContext(code, context);

const hooks = context.window.__TEST_HOOKS;
const W = context.window;
const clone = (v) => JSON.parse(JSON.stringify(v));
const counts = () => {
  const s = hooks.getStore();
  const a = hooks.computeAnalytics();
  return { players: (s.players || []).length, sessions: (s.sessions || []).length, ranking: (a.ranking || []).length };
};

const base = clone(hooks.getStore());
const chips = clone(base.chips);
const chipsSnap = chips.map((c, i) => ({ id: c.id, name: c.name, color: c.color, value: c.value, order: i, style: c.style || null }));
const mkCounts = (targetId, qty) => Object.fromEntries(chipsSnap.map(c => [c.id, c.id === targetId ? qty : 0]));

const localStore = Object.assign({}, base, {
  players: [{ id: 'p1', name: 'Mono', nick: 'Mono', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 }],
  sessions: [{
    id: 'sess_local_1',
    status: 'closed',
    date: '2026-03-01',
    createdAt: 2000,
    updatedAt: 3000,
    closedAt: 3000,
    playerIds: ['p1'],
    playersSnapshot: [{ id: 'p1', name: 'Mono', nick: 'Mono', display: 'Mono' }],
    chipsSnapshot: chipsSnap,
    game: { players: [{ id: 'p1', buyIn: 100, rebuys: [], counts: mkCounts('chip_black', 1) }] }
  }],
  draftSessionId: '',
});

hooks.setStore(localStore);
hooks.setTheme('auto');

const incomingStore = Object.assign({}, clone(localStore), {
  players: clone(localStore.players).concat([{ id: 'p2', name: 'Puercoaraña', nick: 'Puercoaraña', active: true, stats: {}, createdAt: 4000, updatedAt: 4000 }]),
  sessions: clone(localStore.sessions).concat([{
    id: 'sess_new_2',
    status: 'closed',
    date: '2026-03-08',
    createdAt: 5000,
    updatedAt: 6000,
    closedAt: 6000,
    playerIds: ['p1','p2'],
    playersSnapshot: [{ id: 'p1', name: 'Mono', nick: 'Mono', display: 'Mono' }, { id: 'p2', name: 'Puercoaraña', nick: 'Puercoaraña', display: 'Puercoaraña' }],
    chipsSnapshot: chipsSnap,
    game: { players: [{ id: 'p1', buyIn: 100, rebuys: [], counts: mkCounts('chip_red', 2) }, { id: 'p2', buyIn: 100, rebuys: [], counts: mkCounts('chip_black', 1) }] }
  }])
});
const payload = hooks.buildPortableBackupPayload(incomingStore, 'dark');

(async () => {
  W.__confirmQueue = [true, true];
  W.__dialogs = [];
  await hooks.importBackupJson({ text: JSON.stringify(payload), fileName: 'con-cambios.json', fileSize: 1234 });
  let c = counts();
  if (c.players !== 2 || c.sessions !== 2 || c.ranking < 2) throw new Error('changes case failed');
  if (!W.__dialogs.some(d => d.title === 'Importación completa')) throw new Error('success dialog missing');
  if (hooks.getTheme() !== 'dark') throw new Error('theme not applied');
  const backupMeta = hooks.readImportSafetyBackupMeta();
  if (!backupMeta || !backupMeta.createdAt || backupMeta.counts.sessions < 1) throw new Error('backup meta missing');

  W.__confirmQueue = [true, true];
  W.__dialogs = [];
  await hooks.importBackupJson({ text: JSON.stringify(payload), fileName: 'sin-cambios.json', fileSize: 1234 });
  c = counts();
  if (c.players !== 2 || c.sessions !== 2) throw new Error('no changes altered store');
  if (!W.__dialogs.some(d => d.title === 'Sin novedades')) throw new Error('no changes dialog missing');

  hooks.setStore(localStore);
  hooks.setTheme('auto');
  W.__forceImportApplyError = true;
  W.__confirmQueue = [true, true];
  W.__dialogs = [];
  await hooks.importBackupJson({ text: JSON.stringify(payload), fileName: 'forzar-error.json', fileSize: 1234 });
  W.__forceImportApplyError = false;
  c = counts();
  if (c.players !== 1 || c.sessions !== 1) throw new Error('rollback failed');
  const errDialog = W.__dialogs.find(d => d.title === 'Importación cancelada');
  if (!errDialog || !String(errDialog.body).includes('FORCED_IMPORT_FAILURE')) throw new Error('detailed error missing');

  console.log('test-valid-changes=ok');
  console.log('test-valid-nochanges=ok');
  console.log('test-real-error-rollback=ok');
  console.log('test-mocked-safari-pwa-flow=ok');
})().catch(err => { console.error(err); process.exit(1); });
