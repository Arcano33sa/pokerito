const fs = require('fs');
const path = require('path');

const root = __dirname;
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function mustContain(haystack, needle, label){
  if (!haystack.includes(needle)) throw new Error(`missing ${label}: ${needle}`);
}

function mustNotContain(haystack, needle, label){
  if (haystack.includes(needle)) throw new Error(`unexpected ${label}: ${needle}`);
}

mustContain(app, 'id="adminUpdateSection"', 'admin update section markup');
mustContain(app, 'id="checkUpdateBtn"', 'check update button');
mustContain(app, "const UPDATE_UI_KEY = 'pokerito_update_ui';", 'update ui storage key');
mustContain(app, "const UPDATE_BOOT_KEY = 'pokerito_update_boot';", 'update boot storage key');
mustContain(app, 'let updateActionInFlight = false;', 'update action lock');
mustContain(app, 'async function getLiveServiceWorkerSnapshot(reg)', 'live sw snapshot helper');
mustContain(app, 'function deriveUpdateUiStateFromLive(current, live, options)', 'live-state reconciler');
mustContain(app, 'async function syncUpdateUiStateFromServiceWorker(options)', 'live-state sync helper');
mustContain(app, "targetScriptUrl: '',", 'boot mark target script support');
mustContain(app, "data.type !== 'POKERITO_SW_ACTIVATED'", 'activated sw message listener');
mustContain(app, "button: 'Actualizar ahora'", 'available update button copy');
mustContain(app, 'hydratePostUpdateUiState();', 'post-update hydrate on boot');
mustContain(app, 'worker.postMessage({ type: \'POKERITO_SKIP_WAITING\' });', 'waiting worker activation message');
mustContain(app, "window.addEventListener('pageshow'", 'pageshow state refresh');
mustContain(app, "window.addEventListener('focus'", 'focus state refresh');
mustContain(app, "document.addEventListener('visibilitychange'", 'visibility state refresh');
mustContain(css, '.admin-update-panel .btn{', 'admin update button polish css');
mustContain(css, '.admin-update-panel .small-note{', 'admin update note width css');
mustContain(css, '.admin-update-panel .panel-head{', 'admin update panel head polish css');
mustContain(sw, "const CACHE_NAME = 'pokerito-v0.1.48-pwa-manual-update-stage2';", 'service worker cache bump');
mustContain(sw, "if (!self.registration.active) await self.skipWaiting();", 'first-install activation only');
mustContain(sw, "type: 'POKERITO_SW_ACTIVATED'", 'service worker activation broadcast');
mustContain(sw, "data.type === 'POKERITO_SKIP_WAITING'", 'service worker skip waiting message hook');
mustNotContain(sw, '.then(() => self.skipWaiting())', 'unconditional skipWaiting');

console.log('test-admin-update-section=ok');
console.log('test-admin-update-lock=ok');
console.log('test-admin-update-live-state-sync=ok');
console.log('test-admin-update-post-reload-state=ok');
console.log('test-admin-update-manual-activation-only=ok');
console.log('test-admin-update-cache-bump=ok');
