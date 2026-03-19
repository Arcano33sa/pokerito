const fs = require('fs');
const path = require('path');
const vm = require('vm');
let code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

code = code.replace(/\}\)\(\);\s*$/, `window.__TEST_HOOKS = {
  navigate, getRouteHref, resolveHeaderRoute, applyHeaderNavigationState, findHeaderBackTarget,
  getHeaderTrail: () => headerNavTrail.slice(),
};})();`);

function makeEl(tag='div'){
  return {
    tagName: String(tag || 'div').toUpperCase(),
    style: {}, children: [], className: '', innerHTML: '', textContent: '', dataset: {}, attributes: {}, hidden: false,
    classList: { toggle(){}, add(){}, remove(){} },
    appendChild(child){ this.children.push(child); return child; }, removeChild(child){ this.children = this.children.filter(x => x !== child); }, remove(){},
    setAttribute(name, value){ this.attributes[name] = String(value); }, getAttribute(name){ return this.attributes[name] || null; },
    addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; }, closest(){ return null; }, blur(){}, focus(){},
  };
}
const storage = new Map();
const document = {
  documentElement: { style: { setProperty(){} }, dataset: {}, classList: { toggle(){}, add(){}, remove(){} }, setAttribute(){}, removeAttribute(){}, clientWidth: 1024, clientHeight: 768 },
  body: Object.assign(makeEl('body'), { style: {} }),
  getElementById(id){ if (!this.__els) this.__els = {}; if (!this.__els[id]) this.__els[id] = makeEl('div'); return this.__els[id]; },
  createElement(tag){
    if (tag === 'template') return { innerHTML: '', content: { firstElementChild: makeEl('div') } };
    return makeEl(tag);
  },
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
  innerWidth: 1024,
  innerHeight: 768,
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

function commitRoute(){
  hooks.applyHeaderNavigationState(hooks.getRouteHref());
}

context.window.location.hash = '#/inicio';
commitRoute();
hooks.navigate('/juego');
commitRoute();
hooks.navigate('/juego/mesa');
commitRoute();
hooks.navigate('/archivo/historial');
commitRoute();
let back = hooks.findHeaderBackTarget(hooks.resolveHeaderRoute('/archivo/historial'));
if (back !== '/juego/mesa') throw new Error('archivo/historial back should return to mesa');

hooks.navigate(back, { stackMode: 'back' });
commitRoute();
back = hooks.findHeaderBackTarget(hooks.resolveHeaderRoute('/juego/mesa'));
if (back !== '/juego') throw new Error(`mesa back should now return to juego, got ${back}`);

hooks.navigate('/inicio', { stackMode: 'home' });
commitRoute();
hooks.navigate('/configuracion');
commitRoute();
back = hooks.findHeaderBackTarget(hooks.resolveHeaderRoute('/configuracion'));
if (back !== '/inicio') throw new Error(`after home reset, config back should return to inicio, got ${back}`);

console.log('test-header-back-stack-no-ping-pong=ok');
console.log('test-header-home-resets-stack=ok');
