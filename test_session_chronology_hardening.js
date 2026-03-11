const fs = require('fs');
const vm = require('vm');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/function confirmDialog\(\{ title, body, okText, cancelText, danger \}\)\{[\s\S]*?\n  \}\n\n  function numberInputDialog/, `function confirmDialog({ title, body, okText, cancelText, danger }){\n    const entry = { title: String(title || ''), body: String(body || ''), okText: String(okText || ''), cancelText: String(cancelText || ''), danger: !!danger };\n    window.__dialogs.push(entry);\n    const next = window.__confirmQueue.length ? window.__confirmQueue.shift() : true;\n    return Promise.resolve(!!next);\n  }\n\n  function numberInputDialog`);
code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  normalizeStoreObject, sortSessionsForAnalytics, getSessionChronology,\n  computeAnalytics, resolveSessionHistoricalImpact, buildPdfImpactSections, recalcAndPersistStats,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

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

function mkSession(id, date, tsByField, payoutsById, opts={}){
  const playerIds = players.map(p => p.id);
  const fields = tsByField || {};
  const out = {
    id,
    status: 'closed',
    date,
    playerIds,
    playersSnapshot: players.map(p => ({ id: p.id, name: p.name, nick: p.nick, display: p.nick })),
    chipsSnapshot: chipsSnap,
    game: {
      players: playerIds.map(pid => ({ id: pid, buyIn: 100, rebuys: [], counts: countsForValue(payoutsById[pid] || 0) }))
    },
    ...opts,
  };
  ['createdAt', 'updatedAt', 'closedAt'].forEach((key) => {
    if (Number.isFinite(fields[key])) out[key] = fields[key];
  });
  return out;
}

const localLater = mkSession('s_local_later', '2026-03-10', { createdAt: 2000, updatedAt: 2000, closedAt: 2000 }, { p_a: 300, p_b: 0 });
const importedOldDateOnly = mkSession('s_import_old', '2026-03-01', { createdAt: 9000, updatedAt: 9000 }, { p_a: 0, p_b: 200 });
const legacyNoClosedAt = mkSession('s_legacy', '', { createdAt: 1000, updatedAt: 9500 }, { p_a: 0, p_b: 200 });
const recentWithClosedAt = mkSession('s_recent', '2026-03-05', { createdAt: 5000, updatedAt: 5000, closedAt: 5000 }, { p_a: 300, p_b: 0 });

(() => {
  const ordered1 = hooks.sortSessionsForAnalytics([localLater, importedOldDateOnly]).map(s => s.id);
  if (ordered1.join('|') !== 's_import_old|s_local_later') {
    throw new Error(`date-based chronology should place imported old session first, got ${ordered1.join(' > ')}`);
  }

  const chronoImported = hooks.getSessionChronology(importedOldDateOnly);
  if (chronoImported.effectiveDate !== '2026-03-01') throw new Error(`expected effectiveDate=2026-03-01, got ${chronoImported.effectiveDate}`);
  if (chronoImported.precision !== 'date-only') throw new Error(`expected date-only precision for imported old session, got ${chronoImported.precision}`);

  const ordered2 = hooks.sortSessionsForAnalytics([recentWithClosedAt, legacyNoClosedAt]).map(s => s.id);
  if (ordered2.join('|') !== 's_legacy|s_recent') {
    throw new Error(`legacy session without closedAt should rely on earliest timestamp, got ${ordered2.join(' > ')}`);
  }

  hooks.setStore({ ...base, players: clone(players), sessions: [clone(localLater), clone(importedOldDateOnly)], draftSessionId: '' });
  hooks.recalcAndPersistStats();
  const store = hooks.getStore();
  const target = store.sessions.find(s => s.id === 's_local_later');
  const impact = hooks.resolveSessionHistoricalImpact(target, { persist: true });
  const ana = (impact.players || []).find(p => p.id === 'p_a');
  const bet = (impact.players || []).find(p => p.id === 'p_b');
  if (!ana || !bet) throw new Error('impact players missing after chronology hardening');
  if (ana.beforeRankLabel !== '#2' || ana.afterRankLabel !== '#1') throw new Error(`Ana should be #2 -> #1 after old import ordering, got ${ana.beforeRankLabel} -> ${ana.afterRankLabel}`);
  if (bet.beforeRankLabel !== '#1' || bet.afterRankLabel !== '#2') throw new Error(`Beto should be #1 -> #2 after old import ordering, got ${bet.beforeRankLabel} -> ${bet.afterRankLabel}`);

  const pdfSection = hooks.buildPdfImpactSections(impact);
  if (!String(pdfSection).includes('#2 → #1')) throw new Error('pdf impact should include #2 → #1 after chronology hardening');
  if (!String(pdfSection).includes('#1 → #2')) throw new Error('pdf impact should include #1 → #2 after chronology hardening');

  console.log('test-imported-old-date-order=ok');
  console.log('test-date-only-chronology-metadata=ok');
  console.log('test-legacy-earliest-ts-fallback=ok');
  console.log('test-impact-uses-robust-chronology=ok');
})();
