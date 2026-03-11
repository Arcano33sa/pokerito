
const fs = require('fs');
const vm = require('vm');
let code = fs.readFileSync('/mnt/data/pokerito_work/app.js', 'utf8');

code = code.replace(/function confirmDialog\(\{ title, body, okText, cancelText, danger \}\)\{[\s\S]*?\n  \}\n\n  function numberInputDialog/, `function confirmDialog({ title, body, okText, cancelText, danger }){\n    const entry = { title: String(title || ''), body: String(body || ''), okText: String(okText || ''), cancelText: String(cancelText || ''), danger: !!danger };\n    window.__dialogs.push(entry);\n    const next = window.__confirmQueue.length ? window.__confirmQueue.shift() : true;\n    return Promise.resolve(!!next);\n  }\n\n  function numberInputDialog`);
code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  importBackupJson, buildPortableBackupPayload, normalizeStoreObject, computeAnalytics, readImportSafetyBackupMeta, importSummaryHasChanges, buildMergedStoreNonDestructive,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

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

const localBrokenStore = Object.assign({}, base, {
  players: [
    { id: 'p_canon', name: 'José Mono', nick: 'Mono', active: true, stats: {}, createdAt: 1000, updatedAt: 2000 },
    { id: 'p_dup', name: 'Jose Mono', nick: 'Mono', active: true, stats: {}, createdAt: 3000, updatedAt: 4000 }
  ],
  sessions: [
    {
      id: 'sess_old_canon', status: 'closed', date: '2026-03-01', createdAt: 2000, updatedAt: 3000, closedAt: 3000,
      playerIds: ['p_canon'],
      playersSnapshot: [{ id: 'p_canon', name: 'José Mono', nick: 'Mono', display: 'Mono' }],
      chipsSnapshot: chipsSnap,
      game: { players: [{ id: 'p_canon', buyIn: 100, rebuys: [], counts: mkCounts('chip_black', 1) }] }
    },
    {
      id: 'sess_old_dup', status: 'closed', date: '2026-03-08', createdAt: 5000, updatedAt: 6000, closedAt: 6000,
      playerIds: ['p_dup'],
      playersSnapshot: [{ id: 'p_dup', name: 'Jose Mono', nick: 'Mono', display: 'Mono' }],
      chipsSnapshot: chipsSnap,
      game: { players: [{ id: 'p_dup', buyIn: 100, rebuys: [50], counts: mkCounts('chip_red', 2) }] },
      historicalImpact: { version: 1, players: [{ id: 'p_dup', display: 'Mono' }] }
    }
  ],
  draftSessionId: '',
});

hooks.setStore(localBrokenStore);

(async () => {
  const preview = hooks.buildMergedStoreNonDestructive(hooks.getStore(), clone(hooks.getStore()));
  if (preview.summary.sourceCanonicalReferenceGroups !== 1) throw new Error('should detect one strong local canonical remap group');
  if (preview.summary.sourceDuplicatePlayersRemapped !== 1) throw new Error('should remap one duplicate player id');
  if (preview.summary.sourceSessionsRemapped !== 1) throw new Error('should touch one historical session');
  if (!hooks.importSummaryHasChanges(preview.summary)) throw new Error('source remap must count as import change');

  W.__confirmQueue = [true, true];
  W.__dialogs = [];
  await hooks.importBackupJson({ text: JSON.stringify(hooks.buildPortableBackupPayload(clone(hooks.getStore()), 'auto')), fileName: 'self-heal.json', fileSize: 444 });

  const store = hooks.getStore();
  const sessDup = (store.sessions || []).find(s => s.id === 'sess_old_dup');
  if (!sessDup) throw new Error('duplicate historical session missing');
  if (String(sessDup.playerIds[0]) !== 'p_canon') throw new Error('historical playerIds not remapped');
  if (String(sessDup.playersSnapshot[0].id) !== 'p_canon') throw new Error('historical playersSnapshot not remapped');
  if (String(sessDup.game.players[0].id) !== 'p_canon') throw new Error('historical game.players not remapped');
  if (sessDup.historicalImpact && sessDup.historicalImpact.players && sessDup.historicalImpact.players.length) throw new Error('stale historicalImpact should be invalidated on touched session');

  const analytics = hooks.computeAnalytics();
  if ((analytics.ranking || []).length !== 1) throw new Error('ranking should consolidate into one player after source remap');
  const row = (analytics.ranking || [])[0];
  if (!row || row.id !== 'p_canon' || row.games !== 2) throw new Error('ranking row should use canonical id with combined games');

  const preflight = W.__dialogs.find(d => d.title === 'Importar JSON');
  if (!preflight || !String(preflight.body).includes('Grupos históricos locales remapeados al canónico: 1')) throw new Error('preflight should mention local source remap');
  const success = W.__dialogs.find(d => d.title === 'Importación completa');
  if (!success || !String(success.body).includes('Sesiones históricas remapeadas: 1')) throw new Error('success summary should mention historical remap');

  console.log('test-local-historical-session-remap=ok');
  console.log('test-ranking-consolidated-after-source-remap=ok');
  console.log('test-import-self-heal-is-visible=ok');
})().catch(err => { console.error(err); process.exit(1); });
