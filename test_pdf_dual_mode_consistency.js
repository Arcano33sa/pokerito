const fs = require('fs');
const vm = require('vm');
const path = require('path');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {\n  buildPdfDocumentModel, getReportModeMeta,\n  getStore: () => store,\n  setStore: (next) => { store = normalizeStoreObject(next).store; persistStore(store); return store; },\n};})();`);

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
  documentElement: { setAttribute(){}, removeAttribute(){}, dataset: {}, style: { setProperty(){} }, classList: { toggle(){}, add(){}, remove(){} }, clientWidth: 1280, clientHeight: 800 },
  body: Object.assign(makeEl('body'), { style: {} }),
  getElementById(id){ if (!this.__els) this.__els = {}; if (!this.__els[id]) this.__els[id] = makeEl('div'); return this.__els[id]; },
  createElement(tag){ if (tag === 'template') return { innerHTML: '', content: { firstElementChild: makeEl('div') } }; return makeEl(tag); },
  querySelector(sel){ if (sel === 'meta[name="theme-color"]') return { setAttribute(){} }; return null; },
  querySelectorAll(){ return []; },
  contains(){ return true; },
  addEventListener(){},
};
const windowObj = {
  document,
  navigator: { serviceWorker: { register: async () => ({ update: async () => {} }) } },
  location: { hash: '', href: 'https://example.test/' },
  visualViewport: null,
  innerWidth: 1280,
  innerHeight: 800,
  URLSearchParams, Blob, console, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval,
  addEventListener(){}, removeEventListener(){},
  matchMedia(){ return { matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} }; },
  requestAnimationFrame(cb){ return setTimeout(cb, 0); },
  open(){ return null; }, scrollTo(){}, print(){},
};
const context = {
  window: windowObj, document, navigator: windowObj.navigator, location: windowObj.location,
  localStorage: { getItem(k){ return storage.has(k) ? storage.get(k) : null; }, setItem(k,v){ storage.set(k, String(v)); }, removeItem(k){ storage.delete(k); }, key(i){ return Array.from(storage.keys())[i] || null; }, get length(){ return storage.size; } },
  console, URLSearchParams, Blob, Math, JSON, Date, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame: windowObj.requestAnimationFrame,
};
vm.createContext(context);
vm.runInContext(code, context);
const hooks = context.window.__TEST_HOOKS;
const clone = (v) => JSON.parse(JSON.stringify(v));

const base = clone(hooks.getStore());
const player = { id: 'p1', name: 'Ana', nick: 'Ana', active: true, stats: {}, createdAt: 1000, updatedAt: 1000 };
const chips = clone(base.chips);
const chipBlack = chips.find(c => c.id === 'chip_black') || chips[0];
const counts = Object.fromEntries(chips.map(c => [c.id, c.id === chipBlack.id ? 12 : 0]));
const session = {
  id: 's1',
  status: 'closed',
  date: '2026-03-20',
  createdAt: 1000,
  updatedAt: 2000,
  closedAt: 3000,
  pdfSeq: 7,
  playerIds: [player.id],
  playersSnapshot: [{ id: player.id, name: player.name, nick: player.nick, display: player.nick }],
  chipsSnapshot: chips.map((c, i) => ({ id: c.id, name: c.name, color: c.color, value: c.value, order: i, style: c.style || null })),
  game: { players: [{ id: player.id, buyIn: 100, rebuys: [], counts }] },
};

hooks.setStore({ ...base, players: [player], sessions: [session], draftSessionId: '' });
const target = hooks.getStore().sessions[0];
const model = hooks.buildPdfDocumentModel(target);
const screenMeta = hooks.getReportModeMeta(model, 'screen');
const pdfMeta = hooks.getReportModeMeta(model, 'pdf');

if (screenMeta.sessionTitle !== pdfMeta.sessionTitle) throw new Error('screen/pdf title mismatch');
if (screenMeta.sessionDateLabel !== pdfMeta.sessionDateLabel) throw new Error('screen/pdf date mismatch');
if (screenMeta.sessionRef !== pdfMeta.sessionRef) throw new Error('screen/pdf ref mismatch');
if (!/pantalla/i.test(screenMeta.tags.join(' '))) throw new Error('screen mode should mention pantalla');
if (!/pdf/i.test(pdfMeta.tags.join(' '))) throw new Error('pdf mode should mention pdf');
if (screenMeta.copy === pdfMeta.copy) throw new Error('screen/pdf explanatory copy should differ by mode');
if (!/Exportar PDF oficial/.test(code)) throw new Error('screen CTA should clarify official PDF export');
if (!/const printTitle = `\$\{pad3\(seqNum\)\}_Pokerito_\$\{ddmmyyyy\}`;/.test(code)) throw new Error('print title should use stable filename-friendly pattern');

console.log('test-pdf-dual-mode-consistency=ok');
