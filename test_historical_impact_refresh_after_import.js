const fs = require('fs');
const vm = require('vm');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/function confirmDialog\(\{ title, body, okText, cancelText, danger \}\)\{[\s\S]*?\n  \}\n\n  function numberInputDialog/, `function confirmDialog({ title, body, okText, cancelText, danger }){\n    const entry = { title: String(title || ''), body: String(body || ''), okText: String(okText || ''), cancelText: String(cancelText || ''), danger: !!danger };\n    window.__dialogs.push(entry);\n    const next = window.__confirmQueue.length ? window.__confirmQueue.shift() : true;\n    return Promise.resolve(!!next);\n  }\n\n  function numberInputDialog`);
code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  importBackupJson, buildPortableBackupPayload, normalizeStoreObject, computeAnalytics, buildMergedStoreNonDestructive,\n  resolveSessionHistoricalImpact, buildSessionHistoricalImpactSnapshot, buildPdfImpactSections,\n  getHistoricalImpactContextKey, isHistoricalImpactSnapshotFresh, recalcAndPersistStats,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

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
const chipBlack = chips.find(c => c.id === 'chip_black');
if (!chipBlack) throw new Error('missing chip_black');
const countsForValue = (amount) => Object.fromEntries(chipsSnap.map(c => [c.id, c.id === 'chip_black' ? Math.floor(amount / chipBlack.value) : 0]));

const players = [
  { id: 'p_a', name: 'Ana', nick: 'A', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
  { id: 'p_b', name: 'Beto', nick: 'B', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 },
];

function mkSession(id, date, ts, payoutsById, opts={}){
  const playerIds = players.map(p => p.id);
  return {
    id,
    status: 'closed',
    date,
    createdAt: ts,
    updatedAt: ts,
    closedAt: ts,
    playerIds,
    playersSnapshot: players.map(p => ({ id: p.id, name: p.name, nick: p.nick, display: p.nick })),
    chipsSnapshot: chipsSnap,
    game: {
      players: playerIds.map(pid => ({ id: pid, buyIn: 100, rebuys: [], counts: countsForValue(payoutsById[pid] || 0) }))
    },
    ...opts,
  };
}

(async () => {
  const session1 = mkSession('s1', '2026-03-01', 1000, { p_a: 0, p_b: 200 });
  const session2Fresh = mkSession('s2', '2026-03-10', 2000, { p_a: 300, p_b: 0 });

  // Caso 1: primera sesión realmente sin ranking previo.
  hooks.setStore({ ...base, players: clone(players), sessions: [clone(session1)], draftSessionId: '' });
  hooks.recalcAndPersistStats();
  let store = hooks.getStore();
  let first = store.sessions.find(s => s.id === 's1');
  let impact1 = hooks.resolveSessionHistoricalImpact(first, { persist: true });
  const a1 = (impact1.players || []).find(p => p.id === 'p_a');
  const b1 = (impact1.players || []).find(p => p.id === 'p_b');
  if (!a1 || !b1) throw new Error('case1 players missing');
  if (a1.beforeRankLabel !== 'Sin ranking previo' || b1.beforeRankLabel !== 'Sin ranking previo') throw new Error('case1 should keep sin ranking previo on first session');

  // Caso 2: sesión nueva con ranking previo real.
  hooks.setStore({ ...base, players: clone(players), sessions: [clone(session1), clone(session2Fresh)], draftSessionId: '' });
  hooks.recalcAndPersistStats();
  store = hooks.getStore();
  let second = store.sessions.find(s => s.id === 's2');
  let impact2 = hooks.resolveSessionHistoricalImpact(second, { persist: true });
  const a2 = (impact2.players || []).find(p => p.id === 'p_a');
  const b2 = (impact2.players || []).find(p => p.id === 'p_b');
  if (!a2 || !b2) throw new Error('case2 players missing');
  if (a2.beforeRankLabel !== '#2' || a2.afterRankLabel !== '#1') throw new Error(`case2 Ana expected #2 -> #1, got ${a2.beforeRankLabel} -> ${a2.afterRankLabel}`);
  if (b2.beforeRankLabel !== '#1' || b2.afterRankLabel !== '#2') throw new Error(`case2 Beto expected #1 -> #2, got ${b2.beforeRankLabel} -> ${b2.afterRankLabel}`);

  // Preparar local con snapshot viejo congelado para la sesión 2.
  const staleLocalImpact = {
    version: 3,
    contextKey: 'foreign-stale-context',
    sessionId: 's2',
    sessionRef: 'S2',
    summary: { participants: 2 },
    players: [
      { id: 'p_a', display: 'Ana', beforeRank: 0, afterRank: 1, beforeRankLabel: 'Sin ranking previo', afterRankLabel: '#1', moveMeta: { tone: 'up', label: 'Debut histórico' } },
      { id: 'p_b', display: 'Beto', beforeRank: 0, afterRank: 2, beforeRankLabel: 'Sin ranking previo', afterRankLabel: '#2', moveMeta: { tone: 'up', label: 'Debut histórico' } },
    ],
    computedAt: 123,
  };
  const localStore = { ...base, players: clone(players), sessions: [mkSession('s2', '2026-03-10', 2000, { p_a: 300, p_b: 0 }, { historicalImpact: staleLocalImpact })], draftSessionId: '' };
  hooks.setStore(localStore);

  // Caso 3 y 4: importar sesión anterior que cambia el contexto y trae historicalImpact ajeno.
  const importedForeignImpact = {
    version: 3,
    contextKey: 'foreign-imported-context',
    sessionId: 's1',
    sessionRef: 'IMPORTADA',
    summary: { participants: 99 },
    players: [{ id: 'p_a', display: 'Dato Ajeno', beforeRankLabel: 'XXX', afterRankLabel: 'YYY' }],
    computedAt: 999,
  };
  const incomingStore = { ...base, players: clone(players), sessions: [mkSession('s1', '2026-03-01', 1000, { p_a: 0, p_b: 200 }, { historicalImpact: importedForeignImpact })], draftSessionId: '' };

  W.__confirmQueue = [true, true];
  W.__dialogs = [];
  await hooks.importBackupJson({ text: JSON.stringify(hooks.buildPortableBackupPayload(clone(incomingStore), 'incoming')), fileName: 'impact-refresh.json', fileSize: 777 });

  store = hooks.getStore();
  const importedS1 = store.sessions.find(s => s.id === 's1');
  const updatedS2 = store.sessions.find(s => s.id === 's2');
  if (!importedS1 || !updatedS2) throw new Error('imported sessions missing after import');

  if (!hooks.isHistoricalImpactSnapshotFresh(importedS1, importedS1.historicalImpact)) throw new Error('case4 imported session historicalImpact should be rebuilt in current context');
  if (!hooks.isHistoricalImpactSnapshotFresh(updatedS2, updatedS2.historicalImpact)) throw new Error('case3 local later session historicalImpact should be refreshed after import');
  if (updatedS2.historicalImpact.contextKey === 'foreign-stale-context') throw new Error('case3 stale local contextKey should not survive');
  if (importedS1.historicalImpact.contextKey === 'foreign-imported-context') throw new Error('case4 imported foreign contextKey should not survive');

  const aAfterImport = (updatedS2.historicalImpact.players || []).find(p => p.id === 'p_a');
  const bAfterImport = (updatedS2.historicalImpact.players || []).find(p => p.id === 'p_b');
  if (!aAfterImport || !bAfterImport) throw new Error('case3 refreshed players missing');
  if (aAfterImport.beforeRankLabel !== '#2' || aAfterImport.afterRankLabel !== '#1') throw new Error(`case3 Ana expected refreshed #2 -> #1, got ${aAfterImport.beforeRankLabel} -> ${aAfterImport.afterRankLabel}`);
  if (bAfterImport.beforeRankLabel !== '#1' || bAfterImport.afterRankLabel !== '#2') throw new Error(`case3 Beto expected refreshed #1 -> #2, got ${bAfterImport.beforeRankLabel} -> ${bAfterImport.afterRankLabel}`);

  const pdfSection = hooks.buildPdfImpactSections(updatedS2.historicalImpact);
  if (!String(pdfSection).includes('#2 → #1')) throw new Error('pdf impact section should show previo → nuevo after import refresh');
  if (!String(pdfSection).includes('#1 → #2')) throw new Error('pdf impact section should show counter-move after import refresh');
  if (String(pdfSection).includes('Dato Ajeno')) throw new Error('pdf should not reuse imported foreign impact text');

  const success = W.__dialogs.find(d => d.title === 'Importación completa');
  if (!success) throw new Error('import success dialog missing');

  console.log('test-case1-first-session-without-prior-ranking=ok');
  console.log('test-case2-session-with-real-prior-ranking=ok');
  console.log('test-case3-import-refreshes-later-historical-impact=ok');
  console.log('test-case4-imported-foreign-historical-impact-not-trusted=ok');
  console.log('test-pdf-impact-shows-previo-nuevo-after-refresh=ok');
})().catch(err => { console.error(err); process.exit(1); });
