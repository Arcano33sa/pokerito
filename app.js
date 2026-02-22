/* Pokerito — v0.1.13 — Etapa 1/3: PDF Ranking Global Top 10 (acumulado) */
(function(){
  const $app = document.getElementById('app');
  const $headerRight = document.getElementById('headerRight');

  // Theme (Auto/Light/Dark) — persisted
  const THEME_KEY = 'pokerito_theme';
  const THEME_VALUES = new Set(['auto','light','dark']);
  const mqDark = (window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);
  let themePref = loadThemePref();

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

  // Rol + estado (Etapa 7/7): badge de sesión/permiso + estado de store
  const $roleBadges = document.createElement('div');
  $roleBadges.id = 'roleBadges';
  $roleBadges.style.display = 'flex';
  $roleBadges.style.alignItems = 'center';
  $roleBadges.style.gap = '8px';
  if ($headerRight) $headerRight.appendChild($roleBadges);

  // ===== Firebase Auth (Etapa 3/7) =====
  // Nota: firebaseInit.js expone window.__POKERITO_FIREBASE__ (auth/db) + authApi helpers.
  let fbRef = null;
  let authUser = null;
  let authReady = false;
  let authInitOnce = false;
  let authUiError = '';

  // ===== Autorización (Etapa 4/7) =====
  // Gate TOTAL: sesión válida NO implica acceso aprobado.
  let authzReady = false;
  let authzChecking = false;
  let authorized = false;
  let authorizedRole = '';
  let authzUiError = '';
  let accessRequest = null; // { status, ... } o null
  let accessRequestReady = false;
  let authzReqSeq = 0;
  let allowedDocExists = false;

  // ===== Bootstrap ADMIN (Etapa 5/7) =====
  // IMPORTANT: Reemplaza este correo por el tuyo (dueño). Debe coincidir EXACTO con el email del login Google.
  const ADMIN_BOOTSTRAP_EMAIL = 'jcguadamuz@icloud.com';

  // ===== Panel ADMIN (Etapa 6/7) =====
  let adminDataReady = false;
  let adminDataLoading = false;
  let adminActionBusy = false;
  let adminUiError = '';
  let adminPending = [];
  let adminAllowed = [];
  let adminLastLoadedAt = 0;
  let adminSeq = 0;

  function resetAdminState(){
    adminDataReady = false;
    adminDataLoading = false;
    adminActionBusy = false;
    adminUiError = '';
    adminPending = [];
    adminAllowed = [];
    adminLastLoadedAt = 0;
    adminSeq = 0;
  }

  function isAdminRole(){
    return !!(authorized && String(authorizedRole || '').toUpperCase() === 'ADMIN');
  }

  function isFirestoreAdminEnabled(){
    const fb = fbRef || window.__POKERITO_FIREBASE__;
    const api = fb && fb.firestoreApi;
    return !!(
      fb && fb.db && api &&
      typeof api.doc === 'function' &&
      typeof api.collection === 'function' &&
      typeof api.query === 'function' &&
      typeof api.where === 'function' &&
      typeof api.getDoc === 'function' &&
      typeof api.getDocs === 'function' &&
      typeof api.setDoc === 'function' &&
      typeof api.updateDoc === 'function' &&
      typeof api.deleteDoc === 'function'
    );
  }

  function tsToMs(t){
    try{
      if (!t) return 0;
      if (typeof t.toMillis === 'function') return t.toMillis();
      if (typeof t.toDate === 'function') return +t.toDate();
      if (typeof t.seconds === 'number') return Math.round(t.seconds * 1000);
      if (typeof t === 'number') return Math.round(t);
      const d = Date.parse(String(t));
      return (d != d) ? 0 : d;
    }catch(e){
      return 0;
    }
  }

  function fmtWhen(t){
    const ms = tsToMs(t);
    if (!ms) return '';
    try{ return new Date(ms).toLocaleString(); }
    catch(e){ return new Date(ms).toISOString(); }
  }


  function isAuthEnabled(){
    const fb = fbRef || window.__POKERITO_FIREBASE__;
    return !!(fb && fb.auth && fb.authApi && typeof fb.authApi.onAuthStateChanged === 'function');
  }

  function isFirestoreAccessEnabled(){
    const fb = fbRef || window.__POKERITO_FIREBASE__;
    const api = fb && fb.firestoreApi;
    return !!(
      fb && fb.db && api &&
      typeof api.doc === 'function' &&
      typeof api.getDoc === 'function' &&
      typeof api.setDoc === 'function'
    );
  }

  function resetAuthorizationState(){
    authzReady = false;
    authzChecking = false;
    authorized = false;
    authorizedRole = '';
    authzUiError = '';
    accessRequest = null;
    accessRequestReady = false;
    allowedDocExists = false;
    resetAdminState();
  }

  function normEmail(v){
    return String(v || '').trim().toLowerCase();
  }

  function isBootstrapEmailConfigured(){
    const v = String(ADMIN_BOOTSTRAP_EMAIL || '').trim();
    if (!v) return false;
    if (v.includes('__SET_')) return false;
    return v.includes('@');
  }

  function canBootstrapAdmin(){
    if (!isBootstrapEmailConfigured()) return false;
    if (!isAuthEnabled()) return false;
    if (!authReady || !authUser) return false;
    if (!isFirestoreAccessEnabled()) return false;
    if (!authzReady || authzChecking) return false;
    if (authorized) return false;
    if (allowedDocExists) return false; // debe NO existir allowedUsers/{uid}
    return normEmail(authUser.email) === normEmail(ADMIN_BOOTSTRAP_EMAIL);
  }

  function prettyFsError(err){
    const code = (err && err.code) ? String(err.code) : '';
    if (code === 'permission-denied') return 'Permiso denegado en Firestore.';
    if (code === 'unavailable') return 'Firestore no disponible (red/conexión).';
    if (code) return 'Error Firestore: ' + code;
    return 'Error Firestore.';
  }

  function prettyAuthError(err){
    const code = (err && err.code) ? String(err.code) : '';
    if (code === 'auth/unauthorized-domain') return 'Dominio no autorizado en Firebase Auth.';
    if (code === 'auth/popup-blocked') return 'El navegador bloqueó el popup.';
    if (code === 'auth/operation-not-supported-in-this-environment') return 'Este entorno no soporta popup.';
    if (code) return 'Error de login: ' + code;
    return 'Error de login.';
  }

  function attachFirebase(fb){
    fbRef = fb || window.__POKERITO_FIREBASE__ || null;
    if (authInitOnce) return;
    if (!isAuthEnabled()) return;
    authInitOnce = true;

    const auth = fbRef.auth;
    const api = fbRef.authApi;

    // Completa redirect login (si aplica). No bloquea UI.
    try{ if (api.getRedirectResult) api.getRedirectResult(auth).catch(() => {}); }catch(e){}

    try{
      api.onAuthStateChanged(
        auth,
        (u) => {
          authUser = u || null;
          authReady = true;
          authUiError = '';
          resetAdminState();

          if (!authUser) {
            stopStoreSync();
            resetAuthorizationState();
            onRoute();
            return;
          }

          authzReady = false;
          authzChecking = true;
          authzUiError = '';
          accessRequest = null;
          accessRequestReady = false;
          onRoute();
          refreshAuthorizationState({ showToastOnError: true });
        },
        (err) => {
          authUser = null;
          authReady = true;
          authUiError = prettyAuthError(err);
          stopStoreSync();
          resetAuthorizationState();
          onRoute();
        }
      );
    }catch(err){
      authUser = null;
      authReady = true;
      authUiError = prettyAuthError(err);
    }
  }

  async function loginWithGoogle(){
    if (!isAuthEnabled()) { authUiError = 'Firebase/Auth no está listo.'; onRoute(); return; }
    const auth = fbRef.auth;
    const api = fbRef.authApi;

    authUiError = '';
    const provider = new api.GoogleAuthProvider();
    try{ provider.setCustomParameters({ prompt: 'select_account' }); }catch(e){}

    try{
      await api.signInWithPopup(auth, provider);
    }catch(err){
      const code = (err && err.code) ? String(err.code) : '';
      if (code === 'auth/popup-closed-by-user') return; // cancelado por el usuario

      // Fallback: redirect en entornos donde el popup falla (iPad/Safari/PWA)
      const shouldRedirect = (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment');
      if (shouldRedirect){
        try{ await api.signInWithRedirect(auth, provider); return; }catch(e2){}
      }

      // Último intento: redirect silencioso (si el popup no cuajó por cualquier razón)
      try{ await api.signInWithRedirect(auth, provider); return; }catch(e3){}

      authUiError = prettyAuthError(err);
      onRoute();
    }
  }

  async function logout(){
    if (!isAuthEnabled()) return;
    try{ await fbRef.authApi.signOut(fbRef.auth); }
    catch(err){ authUiError = prettyAuthError(err); onRoute(); }
  }

  async function refreshAuthorizationState(opts){
    const options = opts || {};
    const seq = ++authzReqSeq;

    if (!authUser) {
      resetAuthorizationState();
      onRoute();
      return;
    }

    if (!isFirestoreAccessEnabled()) {
      authorized = false;
      authorizedRole = '';
      accessRequest = null;
      accessRequestReady = false;
      authzReady = true;
      authzChecking = false;
      authzUiError = 'Firestore no está listo.';
      onRoute();
      return;
    }

    authzChecking = true;
    authzUiError = '';
    onRoute();

    try {
      const db = fbRef.db;
      const fs = fbRef.firestoreApi;
      const uid = String(authUser.uid || '').trim();
      if (!uid) throw new Error('uid_missing');

      let nextAuthorized = false;
      let nextRole = '';
      let nextAllowedExists = false;
      let nextReq = null;
      let nextReqReady = false;

      const allowedRef = fs.doc(db, 'allowedUsers', uid);
      const allowedSnap = await fs.getDoc(allowedRef);
      if (allowedSnap && allowedSnap.exists && allowedSnap.exists()) {
        nextAllowedExists = true;
        const data = allowedSnap.data ? (allowedSnap.data() || {}) : {};
        const rol = String(data.rol || '').trim().toUpperCase();
        if (rol === 'ADMIN' || rol === 'MIEMBRO') {
          nextAuthorized = true;
          nextRole = rol;
        }
      }

      if (!nextAuthorized) {
        const reqRef = fs.doc(db, 'accessRequests', uid);
        const reqSnap = await fs.getDoc(reqRef);
        nextReqReady = true;
        if (reqSnap && reqSnap.exists && reqSnap.exists()) {
          const rd = reqSnap.data ? (reqSnap.data() || {}) : {};
          const status = String(rd.status || '').trim().toUpperCase();
          nextReq = Object.assign({}, rd, { status: status || 'PENDING' });
        }
      } else {
        nextReq = null;
        nextReqReady = true;
      }

      if (seq !== authzReqSeq) return;
      authorized = nextAuthorized;
      authorizedRole = nextRole;
      allowedDocExists = nextAllowedExists;
      if (!(authorized && String(authorizedRole || '').toUpperCase() === 'ADMIN')) resetAdminState();
      accessRequest = nextReq;
      accessRequestReady = nextReqReady;
      authzReady = true;
      authzChecking = false;
      authzUiError = '';

      // Etapa 7/7: Store compartido (Firestore) — iniciar/parar sync segun autorización
      if (authorized) startStoreSync();
      else stopStoreSync();

      onRoute();
    } catch (err) {
      if (seq !== authzReqSeq) return;
      authorized = false;
      authorizedRole = '';
      allowedDocExists = false;
      authzReady = true;
      authzChecking = false;
      authzUiError = prettyFsError(err);
      accessRequestReady = false;
      if (options.showToastOnError) showToast(authzUiError);
      // Etapa 7/7: sin autorización, detener sync del store
      stopStoreSync();
      onRoute();
    }
  }

  async function bootstrapActivateAdmin(){
    if (!authUser) { showToast('Inicia sesión primero'); return; }
    if (!isFirestoreAccessEnabled()) { showToast('Firestore no está listo'); return; }
    if (!isBootstrapEmailConfigured()) { showToast('Bootstrap no configurado (ADMIN_BOOTSTRAP_EMAIL)'); return; }
    if (normEmail(authUser.email) !== normEmail(ADMIN_BOOTSTRAP_EMAIL)) { showToast('Tu correo no coincide con el ADMIN bootstrap'); return; }

    try {
      authzUiError = '';
      authzChecking = true;
      onRoute();

      const db = fbRef.db;
      const fs = fbRef.firestoreApi;
      const uid = String(authUser.uid || '').trim();
      if (!uid) throw new Error('uid_missing');

      const allowedRef = fs.doc(db, 'allowedUsers', uid);
      const snap = await fs.getDoc(allowedRef);
      if (snap && snap.exists && snap.exists()) {
        authzChecking = false;
        allowedDocExists = true;
        authzUiError = 'Ya existe allowedUsers para este usuario. Bootstrap oculto.';
        showToast(authzUiError);
        onRoute();
        return;
      }

      const nowTs = (fs.serverTimestamp ? fs.serverTimestamp() : Date.now());
      const payload = {
        uid,
        nombre: String(authUser.displayName || '').trim() || 'Usuario',
        email: String(authUser.email || '').trim() || '',
        rol: 'ADMIN',
        createdAt: nowTs,
        createdBy: uid,
        updatedAt: nowTs,
        updatedBy: uid,
        bootstrap: true,
      };

      await fs.setDoc(allowedRef, payload, { merge: false });
      showToast('ADMIN activado');
      await refreshAuthorizationState({ showToastOnError: true });
    } catch (err) {
      authzChecking = false;
      authzUiError = prettyFsError(err);
      showToast(authzUiError);
      onRoute();
    }
  }

  async function submitAccessRequest(mode){
    const action = String(mode || 'new');
    if (!authUser) { showToast('Inicia sesión primero'); return; }
    if (!isFirestoreAccessEnabled()) { showToast('Firestore no está listo'); return; }

    try {
      authzUiError = '';
      authzChecking = true;
      onRoute();

      const db = fbRef.db;
      const fs = fbRef.firestoreApi;
      const uid = String(authUser.uid || '').trim();
      const nowTs = (fs.serverTimestamp ? fs.serverTimestamp() : Date.now());
      const payload = {
        uid,
        nombre: String(authUser.displayName || '').trim() || 'Usuario',
        email: String(authUser.email || '').trim() || '',
        status: 'PENDING',
        createdAt: nowTs,
        resolvedAt: null,
        resolvedBy: null,
      };

      await fs.setDoc(fs.doc(db, 'accessRequests', uid), payload, { merge: true });
      showToast(action === 'retry' ? 'Solicitud reenviada' : 'Solicitud enviada');
      await refreshAuthorizationState({ showToastOnError: true });
    } catch (err) {
      authzChecking = false;
      authzUiError = prettyFsError(err);
      showToast(authzUiError);
      onRoute();
    }
  }


  // ===== Admin helpers (Etapa 6/7) =====
  async function adminLoadData(opts){
    if (!authUser || !isAdminRole()) return;
    if (!isFirestoreAdminEnabled()) {
      adminUiError = 'Firestore (admin) no está listo.';
      adminDataReady = true;
      adminDataLoading = false;
      onRoute();
      return;
    }

    const force = !!(opts && opts.force);
    const now = Date.now();
    if (!force && adminDataReady && (now - adminLastLoadedAt) < 15000) return;
    if (adminDataLoading || adminActionBusy) return;

    adminDataLoading = true;
    adminUiError = '';
    onRoute();

    const seq = ++adminSeq;

    try{
      const db = fbRef.db;
      const fs = fbRef.firestoreApi;

      // PENDING requests
      const reqQ = fs.query(fs.collection(db, 'accessRequests'), fs.where('status', '==', 'PENDING'));
      const reqSnap = await fs.getDocs(reqQ);
      const pending = [];
      reqSnap.forEach(ds => {
        const d = (ds && ds.data) ? (ds.data() || {}) : {};
        const uid = String(d.uid || ds.id || '').trim();
        if (!uid) return;
        pending.push(Object.assign({ __id: ds.id, uid }, d));
      });
      pending.sort((a,b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));

      // allowed users
      const allowedSnap = await fs.getDocs(fs.collection(db, 'allowedUsers'));
      const allowed = [];
      allowedSnap.forEach(ds => {
        const d = (ds && ds.data) ? (ds.data() || {}) : {};
        const uid = String(d.uid || ds.id || '').trim();
        if (!uid) return;
        allowed.push(Object.assign({ __id: ds.id, uid }, d));
      });
      allowed.sort((a,b) => {
        const ra = String(a.rol || '').toUpperCase();
        const rb = String(b.rol || '').toUpperCase();
        if (ra != rb) return (ra === 'ADMIN') ? -1 : 1;
        const na = String(a.nombre || a.email || a.uid || '').toLowerCase();
        const nb = String(b.nombre || b.email || b.uid || '').toLowerCase();
        return na.localeCompare(nb);
      });

      if (seq !== adminSeq) return;
      adminPending = pending;
      adminAllowed = allowed;
      adminDataReady = true;
      adminDataLoading = false;
      adminLastLoadedAt = Date.now();
      adminUiError = '';
      onRoute();
    }catch(err){
      if (seq !== adminSeq) return;
      adminDataReady = true;
      adminDataLoading = false;
      adminUiError = prettyFsError(err);
      showToast(adminUiError);
      onRoute();
    }
  }

  async function adminCountAdmins(){
    if (!authUser || !isAdminRole()) return 0;
    if (!isFirestoreAdminEnabled()) return 0;
    const db = fbRef.db;
    const fs = fbRef.firestoreApi;
    const q = fs.query(fs.collection(db, 'allowedUsers'), fs.where('rol', '==', 'ADMIN'));
    const snap = await fs.getDocs(q);
    let n = 0;
    snap.forEach(() => { n++; });
    return n;
  }

  async function adminApproveRequest(uid, role){
    const targetUid = String(uid || '').trim();
    const nextRole = String(role || 'MIEMBRO').trim().toUpperCase();
    if (!targetUid) return;
    if (!authUser || !isAdminRole()) return;
    if (!isFirestoreAdminEnabled()) { showToast('Firestore (admin) no está listo'); return; }
    if (nextRole !== 'ADMIN' && nextRole !== 'MIEMBRO') { showToast('Rol inválido'); return; }
    if (!confirm(`Aprobar acceso como ${nextRole}?`)) return;

    try{
      adminActionBusy = true;
      onRoute();

      const db = fbRef.db;
      const fs = fbRef.firestoreApi;
      const myUid = String(authUser.uid || '').trim();
      const nowTs = (fs.serverTimestamp ? fs.serverTimestamp() : Date.now());

      const reqRef = fs.doc(db, 'accessRequests', targetUid);
      const reqSnap = await fs.getDoc(reqRef);
      const rd = (reqSnap && reqSnap.exists && reqSnap.exists()) ? (reqSnap.data() || {}) : {};

      const nombre = String(rd.nombre || '').trim() || 'Usuario';
      const email = String(rd.email || '').trim() || '';

      const allowedRef = fs.doc(db, 'allowedUsers', targetUid);
      const allowedSnap = await fs.getDoc(allowedRef);

      if (allowedSnap && allowedSnap.exists && allowedSnap.exists()) {
        await fs.updateDoc(allowedRef, { rol: nextRole, updatedAt: nowTs, updatedBy: myUid });
      } else {
        await fs.setDoc(allowedRef, {
          uid: targetUid,
          nombre,
          email,
          rol: nextRole,
          createdAt: nowTs,
          createdBy: myUid,
          updatedAt: nowTs,
          updatedBy: myUid,
        }, { merge: false });
      }

      await fs.setDoc(reqRef, {
        status: 'APPROVED',
        resolvedAt: nowTs,
        resolvedBy: myUid,
        approvedRole: nextRole,
      }, { merge: true });

      showToast(`Aprobado como ${nextRole}`);
      adminActionBusy = false;
      await adminLoadData({ force: true });
    }catch(err){
      adminActionBusy = false;
      adminUiError = prettyFsError(err);
      showToast(adminUiError);
      onRoute();
    }
  }

  async function adminRejectRequest(uid){
    const targetUid = String(uid || '').trim();
    if (!targetUid) return;
    if (!authUser || !isAdminRole()) return;
    if (!isFirestoreAdminEnabled()) { showToast('Firestore (admin) no está listo'); return; }
    if (!confirm('Rechazar solicitud?')) return;

    try{
      adminActionBusy = true;
      onRoute();

      const db = fbRef.db;
      const fs = fbRef.firestoreApi;
      const myUid = String(authUser.uid || '').trim();
      const nowTs = (fs.serverTimestamp ? fs.serverTimestamp() : Date.now());

      await fs.setDoc(fs.doc(db, 'accessRequests', targetUid), {
        status: 'REJECTED',
        resolvedAt: nowTs,
        resolvedBy: myUid,
      }, { merge: true });

      showToast('Solicitud rechazada');
      adminActionBusy = false;
      await adminLoadData({ force: true });
    }catch(err){
      adminActionBusy = false;
      adminUiError = prettyFsError(err);
      showToast(adminUiError);
      onRoute();
    }
  }

  async function adminSetRole(uid, newRole){
    const targetUid = String(uid || '').trim();
    const role = String(newRole || '').trim().toUpperCase();
    if (!targetUid) return;
    if (!authUser || !isAdminRole()) return;
    if (!isFirestoreAdminEnabled()) { showToast('Firestore (admin) no está listo'); return; }
    if (role !== 'ADMIN' && role !== 'MIEMBRO') { showToast('Rol inválido'); return; }

    const item = (Array.isArray(adminAllowed) ? adminAllowed : []).find(x => String((x && x.uid) || '').trim() === targetUid) || {};
    const cur = String(item.rol || '').trim().toUpperCase();
    if (cur && cur === role) return;

    if (!confirm(`Cambiar rol a ${role}?`)) return;

    try{
      adminActionBusy = true;
      onRoute();

      const db = fbRef.db;
      const fs = fbRef.firestoreApi;
      const myUid = String(authUser.uid || '').trim();
      const nowTs = (fs.serverTimestamp ? fs.serverTimestamp() : Date.now());

      // Regla anti-autogol: no dejar 0 ADMIN
      if (cur === 'ADMIN' && role === 'MIEMBRO') {
        const admins = await adminCountAdmins();
        if (admins <= 1) {
          adminActionBusy = false;
          showToast('No puedes dejar la app sin ADMIN.');
          onRoute();
          return;
        }
      }

      await fs.updateDoc(fs.doc(db, 'allowedUsers', targetUid), {
        rol: role,
        updatedAt: nowTs,
        updatedBy: myUid,
      });

      showToast(`Rol actualizado: ${role}`);
      adminActionBusy = false;
      await adminLoadData({ force: true });
    }catch(err){
      adminActionBusy = false;
      adminUiError = prettyFsError(err);
      showToast(adminUiError);
      onRoute();
    }
  }

  async function adminRevokeAccess(uid){
    const targetUid = String(uid || '').trim();
    if (!targetUid) return;
    if (!authUser || !isAdminRole()) return;
    if (!isFirestoreAdminEnabled()) { showToast('Firestore (admin) no está listo'); return; }

    const item = (Array.isArray(adminAllowed) ? adminAllowed : []).find(x => String((x && x.uid) || '').trim() === targetUid) || {};
    const cur = String(item.rol || '').trim().toUpperCase();

    const selfUid = String(authUser.uid || '').trim();
    const isSelf = (selfUid && selfUid === targetUid);

    const msg = isSelf ? 'Te vas a revocar a ti mismo. ¿Seguro?' : 'Revocar acceso? El usuario quedará bloqueado.';
    if (!confirm(msg)) return;

    try{
      adminActionBusy = true;
      onRoute();

      const db = fbRef.db;
      const fs = fbRef.firestoreApi;
      const myUid = selfUid;
      const nowTs = (fs.serverTimestamp ? fs.serverTimestamp() : Date.now());

      // Regla anti-autogol: no dejar 0 ADMIN
      if (cur === 'ADMIN') {
        const admins = await adminCountAdmins();
        if (admins <= 1) {
          adminActionBusy = false;
          showToast('No puedes dejar la app sin ADMIN.');
          onRoute();
          return;
        }
      }

      await fs.deleteDoc(fs.doc(db, 'allowedUsers', targetUid));

      // Dejar su solicitud en REJECTED para permitir que vuelva a solicitar
      await fs.setDoc(fs.doc(db, 'accessRequests', targetUid), {
        uid: targetUid,
        status: 'REJECTED',
        resolvedAt: nowTs,
        resolvedBy: myUid,
        revoked: true,
      }, { merge: true });

      showToast('Acceso revocado');
      adminActionBusy = false;
      await adminLoadData({ force: true });

      if (isSelf) {
        await refreshAuthorizationState({ showToastOnError: false });
      }
    }catch(err){
      adminActionBusy = false;
      adminUiError = prettyFsError(err);
      showToast(adminUiError);
      onRoute();
    }
  }

  function renderAdminPanelBlock(){
    const busy = !!(adminDataLoading || adminActionBusy);
    const reqs = Array.isArray(adminPending) ? adminPending : [];
    const allowed = Array.isArray(adminAllowed) ? adminAllowed : [];
    const adminsCount = allowed.filter(x => String((x && x.rol) || '').toUpperCase() === 'ADMIN').length;
    const totalCount = allowed.length;

    const reqList = reqs.length ? reqs.map(r => {
      const uid = escapeHtml(String(r.uid || '').trim());
      const name = escapeHtml(String(r.nombre || 'Usuario').trim() || 'Usuario');
      const email = escapeHtml(String(r.email || '').trim());
      const when = fmtWhen(r.createdAt);
      const whenTxt = when ? escapeHtml(when) : '';
      const meta = (email ? email : '—') + (whenTxt ? ` · ${whenTxt}` : '');

      return `
        <div class="admin-item">
          <div class="admin-top">
            <div class="admin-meta">
              <div class="admin-name">${name}</div>
              <div class="admin-sub">${meta}</div>
            </div>
            <span class="badge">PENDING</span>
          </div>
          <div class="admin-actions">
            <button class="btn small primary" type="button" data-req-approve data-uid="${uid}" data-role="MIEMBRO" ${busy ? 'disabled' : ''}>Aprobar MIEMBRO</button>
            <button class="btn small" type="button" data-req-approve data-uid="${uid}" data-role="ADMIN" ${busy ? 'disabled' : ''}>Aprobar ADMIN</button>
            <button class="btn small danger" type="button" data-req-reject data-uid="${uid}" ${busy ? 'disabled' : ''}>Rechazar</button>
          </div>
        </div>
      `;
    }).join('') : `<div class="small-note" style="margin-top:10px">No hay solicitudes PENDING.</div>`;

    const allowedList = allowed.length ? allowed.map(u => {
      const uid = escapeHtml(String(u.uid || '').trim());
      const role = String(u.rol || '').trim().toUpperCase();
      const badge = escapeHtml(role || '—');
      const name = escapeHtml(String(u.nombre || 'Usuario').trim() || 'Usuario');
      const email = escapeHtml(String(u.email || '').trim());
      const isSelf = !!(authUser && String(authUser.uid || '').trim() === String(u.uid || '').trim());

      const disableLastAdmin = (role === 'ADMIN' && adminsCount <= 1);
      const disableDemote = busy || disableLastAdmin;
      const disableRevoke = busy || disableLastAdmin;

      const roleBtn = (role === 'ADMIN')
        ? `<button class="btn small" type="button" data-user-role data-uid="${uid}" data-role="MIEMBRO" ${disableDemote ? 'disabled' : ''}>Hacer MIEMBRO</button>`
        : `<button class="btn small" type="button" data-user-role data-uid="${uid}" data-role="ADMIN" ${busy ? 'disabled' : ''}>Hacer ADMIN</button>`;

      return `
        <div class="admin-item">
          <div class="admin-top">
            <div class="admin-meta">
              <div class="admin-name">${name} ${isSelf ? '<span class="badge" style="margin-left:6px">TÚ</span>' : ''}</div>
              <div class="admin-sub">${email ? email : '—'}</div>
            </div>
            <span class="badge">${badge}</span>
          </div>
          <div class="admin-actions">
            ${roleBtn}
            <button class="btn small danger" type="button" data-user-revoke data-uid="${uid}" ${disableRevoke ? 'disabled' : ''}>Revocar acceso</button>
          </div>
          ${disableLastAdmin && isSelf ? `<div class="small-note" style="margin-top:10px">Regla anti-autogol: no puedes quedarte sin ADMIN.</div>` : ''}
        </div>
      `;
    }).join('') : `<div class="small-note" style="margin-top:10px">No hay usuarios autorizados todavía.</div>`;

    const statusLine = busy ? `<span class="badge">CARGANDO</span>` : `<span class="badge">OK</span>`;

    return `
      <div class="panel" role="region" aria-label="Panel ADMIN" style="margin-top:14px">
        <div class="panel-head">
          <div class="panel-title" style="margin:0">Panel ADMIN</div>
          <div class="row" style="gap:10px">
            ${statusLine}
            <button class="btn small" type="button" id="adminRefreshBtn" ${busy ? 'disabled' : ''}>Actualizar</button>
          </div>
        </div>
        <div class="small-note" style="margin-top:10px">Solicitudes y roles. Total autorizados: <b>${totalCount}</b> · ADMIN: <b>${adminsCount}</b>.</div>
        ${adminUiError ? `<div class="small-note" style="margin-top:8px"><span class="badge" style="vertical-align:middle">ERROR</span> <span style="color:var(--muted); font-weight:850">${escapeHtml(adminUiError)}</span></div>` : ''}

        <div class="panel-title" style="margin-top:16px">Solicitudes (PENDING)</div>
        ${reqList}

        <div class="panel-title" style="margin-top:18px">Autorizados (allowedUsers)</div>
        ${allowedList}
      </div>
    `;
  }


// ===== Shared Store (Etapa 7/7) — Firestore store/main =====
// Legacy local-only key (Etapas <=6): se mantiene solo para migración.
const LEGACY_STORE_KEY = 'pokerito_store_v1';
// Cache local (solo lectura) para arrancar rápido; la fuente de verdad es Firestore.
const STORE_CACHE_KEY = 'pokerito_store_main_cache_v1';
const STORE_VERSION = 1;

let store = loadStore();

// Firestore store sync state
let storeUnsub = null;
let storeSyncReady = false;      // ya recibimos al menos 1 snapshot
let storeRemoteExists = false;
let storeSyncError = '';
let storeInitAttempted = false;
let storeLastAppliedJson = '';
let storeWriteBusy = false;
let storeWriteTimer = null;
let storeWriteSeq = 0;

function isStoreEnabled(){
  const fb = fbRef || window.__POKERITO_FIREBASE__;
  const api = fb && fb.firestoreApi;
  return !!(
    fb && fb.db && api &&
    typeof api.doc === 'function' &&
    typeof api.onSnapshot === 'function' &&
    typeof api.getDoc === 'function' &&
    typeof api.setDoc === 'function' &&
    typeof api.updateDoc === 'function'
  );
}

function stopStoreSync(){
  if (storeUnsub){
    try{ storeUnsub(); }catch(e){}
    storeUnsub = null;
  }
  storeSyncReady = false;
  storeRemoteExists = false;
  storeSyncError = '';
  storeInitAttempted = false;
  storeLastAppliedJson = '';
  storeWriteBusy = false;
  storeWriteSeq = 0;
  if (storeWriteTimer){ clearTimeout(storeWriteTimer); storeWriteTimer = null; }
}

function startStoreSync(){
  if (!authorized || !authUser) return;
  if (!isStoreEnabled()) return;
  if (storeUnsub) return;

  storeSyncReady = false;
  storeRemoteExists = false;
  storeSyncError = '';
  storeInitAttempted = false;

  const fb = fbRef || window.__POKERITO_FIREBASE__;
  const fs = fb.firestoreApi;
  const db = fb.db;
  const ref = fs.doc(db, 'store', 'main');

  storeUnsub = fs.onSnapshot(ref, (snap) => {
    storeSyncReady = true;
    storeSyncError = '';

    if (snap && snap.exists && snap.exists()){
      storeRemoteExists = true;
      const docData = snap.data ? (snap.data() || {}) : {};
      const incoming = docData && docData.data ? docData.data : null;

      if (incoming && typeof incoming === 'object'){
        const normalized = normalizeStore(incoming);
        const json = safeJson(normalized);
        if (json && json !== storeLastAppliedJson){
          store = normalized;
          storeLastAppliedJson = json;
          persistStore(store); // cache local
        }
      }
    } else {
      storeRemoteExists = false;
      if (isAdminRole() && !storeInitAttempted){
        storeInitAttempted = true;
        bootstrapCreateStoreMain().catch(() => {});
      }
    }

    onRoute();
  }, (err) => {
    storeSyncReady = true;
    storeRemoteExists = false;
    storeSyncError = prettyFsError(err);
    showToast('Store: ' + storeSyncError);
    onRoute();
  });
}

function safeJson(obj){
  try{ return JSON.stringify(obj); }catch(e){ return ''; }
}

async function bootstrapCreateStoreMain(){
  if (!isAdminRole() || !authUser) return;
  if (!isStoreEnabled()) return;

  const fb = fbRef || window.__POKERITO_FIREBASE__;
  const fs = fb.firestoreApi;
  const db = fb.db;
  const ref = fs.doc(db, 'store', 'main');

  // Re-check existence (avoid races)
  const snap = await fs.getDoc(ref);
  if (snap && snap.exists && snap.exists()) return;

  const nowTs = (fs.serverTimestamp ? fs.serverTimestamp() : Date.now());
  const uid = String(authUser.uid || '').trim() || 'admin';

  const payload = {
    data: normalizeStore(store || initStore(false)),
    updatedAt: nowTs,
    updatedBy: uid,
  };

  await fs.setDoc(ref, payload, { merge: false });
  showToast('Store inicializado');
}

function canEditData(){
  return !!(authorized && authUser && isAdminRole() && storeSyncReady && storeRemoteExists && !storeSyncError);
}

function canReadData(){
  return !!(authorized && authUser && storeSyncReady && storeRemoteExists && !storeSyncError);
}

function requireAdminEdit(ctx){
  const prefix = (ctx === undefined || ctx === null) ? '' : String(ctx).trim();
  const withCtx = (m) => prefix ? (prefix + ': ' + m) : m;

  if (!authorized || !authUser){ showToast(withCtx('Inicia sesión')); return false; }
  if (!storeSyncReady){ showToast(withCtx('Store cargando…')); return false; }
  if (storeSyncError){ showToast(withCtx('Store: ' + storeSyncError)); return false; }
  if (!storeRemoteExists){ showToast(withCtx('Store no inicializado')); return false; }
  if (!isAdminRole()){ showToast(withCtx('Solo ADMIN puede editar')); return false; }
  return true;
}

function loadStore(){
  try{
    let raw = localStorage.getItem(STORE_CACHE_KEY);
    if (!raw) raw = localStorage.getItem(LEGACY_STORE_KEY);
    if (!raw) return initStore(true);
    const obj = JSON.parse(raw);
    if (!obj || obj.v !== STORE_VERSION) return initStore(true);
    const normalized = normalizeStore(obj);
    persistStore(normalized);
    return normalized;
  }catch(e){
    return initStore(true);
  }
}

function initStore(persist){
  const obj = {
    v: STORE_VERSION,
    chips: defaultChips(),
    players: defaultPlayers(),
    sessions: defaultSessions(),
    pdfSeqNext: 1,
    draftSessionId: '',
    ui: { juego: {} },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  if (persist !== false) persistStore(obj);
  return obj;
}

function persistStore(obj){
  try{ localStorage.setItem(STORE_CACHE_KEY, JSON.stringify(obj)); }catch(e){}
}

function saveStore(){
  store.updatedAt = Date.now();
  persistStore(store);
  if (!canEditData()) return;
  scheduleStoreWrite('save');
}

function scheduleStoreWrite(reason){
  if (!canEditData()) return;
  storeWriteSeq++;
  const seq = storeWriteSeq;
  if (storeWriteTimer) clearTimeout(storeWriteTimer);
  storeWriteTimer = setTimeout(() => {
    if (seq !== storeWriteSeq) return;
    writeStoreNow(reason || 'update');
  }, 350);
}

async function writeStoreNow(reason){
  if (storeWriteBusy) return;
  if (!canEditData()) return;
  storeWriteBusy = true;

  const fb = fbRef || window.__POKERITO_FIREBASE__;
  const fs = fb.firestoreApi;
  const db = fb.db;
  const uid = String(authUser.uid || '').trim();
  const ref = fs.doc(db, 'store', 'main');
  const nowTs = (fs.serverTimestamp ? fs.serverTimestamp() : Date.now());

  const payload = { data: store, updatedAt: nowTs, updatedBy: uid };

  try{
    await fs.updateDoc(ref, payload);
    storeWriteBusy = false;
    storeLastAppliedJson = safeJson(normalizeStore(store));
  }catch(err){
    // fallback: doc missing
    try{
      await fs.setDoc(ref, payload, { merge: true });
      storeWriteBusy = false;
      storeLastAppliedJson = safeJson(normalizeStore(store));
    }catch(err2){
      storeWriteBusy = false;
      showToast('Guardar: ' + prettyFsError(err2));
    }
  }
}

function normalizeStore(obj){
  // copiar para evitar mutaciones cruzadas con snapshots
  let out = null;
  try{ out = JSON.parse(JSON.stringify(obj || {})); }
  catch(e){ out = (obj && typeof obj === 'object') ? Object.assign({}, obj) : {}; }

  if (!out || typeof out !== 'object') out = {};
  out.v = STORE_VERSION;

  if (!Array.isArray(out.chips) || !out.chips.length) out.chips = defaultChips();
  if (!Array.isArray(out.players)) out.players = defaultPlayers();
  if (!Array.isArray(out.sessions)) out.sessions = defaultSessions();

  // ui es opcional (preferencia). Se mantiene para no romper UX.
  if (!out.ui || typeof out.ui !== 'object') out.ui = {};
  if (!out.ui.juego || typeof out.ui.juego !== 'object') out.ui.juego = {};

  if (typeof out.draftSessionId !== 'string') out.draftSessionId = '';

  // Etapa 6: asegurar forma de sesiones existentes (migración suave)
  if (Array.isArray(out.sessions)){
    let changed = false;
    out.sessions.forEach(s => {
      const before = safeJson(s);
      try{ ensureSessionGame(s); }catch(e){}
      if (safeJson(s) != before) changed = true;
    });
    if (out.draftSessionId){
      const ds = out.sessions.find(x => x && x.id === out.draftSessionId) || null;
      if (ds && ds.status !== 'draft') { out.draftSessionId = ''; changed = true; }
    }
    if (changed) out.updatedAt = Date.now();
  }

  // Etapa 1: PDF consecutivo global (pdfSeqNext) — migración suave
  try{
    let next = out.pdfSeqNext;
    let changedPdf = false;

    if (!Number.isFinite(next) || next < 1){ next = 1; changedPdf = true; }
    next = Math.floor(next);

    let maxSeq = 0;
    (Array.isArray(out.sessions) ? out.sessions : []).forEach(s => {
      const n = (s && Number.isFinite(s.pdfSeq)) ? Math.floor(s.pdfSeq) : 0;
      if (n > maxSeq) maxSeq = n;
    });
    if (next <= maxSeq){ next = maxSeq + 1; changedPdf = true; }

    if (out.pdfSeqNext !== next){ out.pdfSeqNext = next; changedPdf = true; }

    if (changedPdf){ out.updatedAt = Date.now(); }
  }catch(e){}

  if (!out.createdAt) out.createdAt = Date.now();
  if (!out.updatedAt) out.updatedAt = Date.now();

  return out;
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
  if (!requireAdminEdit()) return;
  const idx = store.chips.findIndex(c => c.id === chip.id);
  if (idx >= 0) store.chips[idx] = chip;
  else store.chips.push(chip);
  saveStore();
}

function setChipActive(id, active){
  if (!requireAdminEdit()) return;
  const c = store.chips.find(x => x.id === id);
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
  if (!requireAdminEdit()) return;
  if (!store.players) store.players = [];
  const idx = store.players.findIndex(p => p.id === player.id);
  if (idx >= 0) store.players[idx] = player;
  else store.players.push(player);
  saveStore();
}

function setPlayerActive(id, active){
  if (!requireAdminEdit()) return;
  const p = (store.players || []).find(x => x.id === id);
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
    '/usuarios': renderUsuarios,
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

  function shouldGate(path){
    // Etapa 4/7 — Gate TOTAL:
    // 1) Sin sesión => solo USUARIOS
    // 2) Con sesión pero sin autorización aprobada (o aún verificando) => solo USUARIOS
    if (!isAuthEnabled()) return false;
    if (!authReady) return false;
    if (!authUser) return (path !== '/usuarios');
    if (!authzReady) return (path !== '/usuarios');
    if (!authorized) return (path !== '/usuarios');
    return false;
  }

  // ===== Etapa 7/7: Gate de STORE (Firestore) para pantallas de datos =====
  function routeNeedsStore(path){
    return !(path === '/inicio' || path === '/usuarios');
  }

  function getStoreGate(path){
    if (!authorized || !authUser) return null;
    if (!routeNeedsStore(path)) return null;
    if (!storeSyncReady) return { kind: 'loading' };
    if (storeSyncError) return { kind: 'error', msg: storeSyncError };
    if (!storeRemoteExists) return { kind: 'missing' };
    return null;
  }

  function renderStoreGate(path, gate){
    const kind = gate && gate.kind ? String(gate.kind) : 'loading';
    const isAdmin = isAdminRole();

    let title = 'Datos compartidos';
    let body = '';
    let showRetry = false;
    let showInit = false;

    if (kind === 'loading'){
      title = 'Cargando datos…';
      body = 'Conectando a Firestore y sincronizando el store compartido.';
      showRetry = true;
    } else if (kind === 'error'){
      title = 'Error de datos';
      body = 'No se pudo leer el store compartido.\n\n' + String(gate.msg || '');
      showRetry = true;
    } else if (kind === 'missing'){
      title = 'Store no inicializado';
      body = isAdmin
        ? 'No existe store/main todavía. Solo un ADMIN puede crearlo.'
        : 'Store no inicializado, espera a un ADMIN.';
      showInit = isAdmin;
      showRetry = isAdmin;
    }

    const root = el(`
      <section class="screen" aria-label="${escapeAttr(title)}">
        <h1 class="screen-title">${escapeHtml(title)}</h1>
        <p class="screen-sub">${escapeHtml(body)}</p>

        <div class="panel" role="region" aria-label="Estado" style="margin-top:10px">
          <div class="small-note" style="margin-top:0">
            Ruta: <b>${escapeHtml(path)}</b> · Rol: <b>${escapeHtml(String(authorizedRole || ''))}</b>
          </div>
          ${kind === 'loading' ? `<div class="small-note" style="margin-top:10px">Tip: si estás en iPad/PWA y esto tarda, revisa conexión o dominio autorizado.</div>` : ''}
        </div>

        <div class="row" style="margin-top:14px; gap:10px; flex-wrap:wrap">
          <button class="btn" type="button" id="storeBackBtn">Volver</button>
          ${showInit ? `<button class="btn primary" type="button" id="storeInitBtn">Inicializar store</button>` : ''}
          ${showRetry ? `<button class="btn" type="button" id="storeRetryBtn">Reintentar</button>` : ''}
        </div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    const $back = document.getElementById('storeBackBtn');
    if ($back) $back.addEventListener('click', () => navigate('/inicio'));

    const $init = document.getElementById('storeInitBtn');
    if ($init) $init.addEventListener('click', async () => {
      if (!authorized || !authUser) { showToast('Inicia sesión'); return; }
      if (!isAdminRole()) { showToast('Solo ADMIN puede editar'); return; }
      if (!isStoreEnabled()) { showToast('Firestore no está listo'); return; }
      try{
        await bootstrapCreateStoreMain();
      }catch(e){
        showToast('Init: ' + prettyFsError(e));
      }
    });

    const $retry = document.getElementById('storeRetryBtn');
    if ($retry) $retry.addEventListener('click', () => {
      // Reiniciar sync (sin loops)
      stopStoreSync();
      startStoreSync();
      onRoute();
    });
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
    if (shouldGate(path)) {
      // Evitar loops: solo redirigir si realmente no estamos ya en /usuarios
      navigate('/usuarios');
      return;
    }

    // Etapa 7/7: sin store listo, bloquear pantallas de datos (pero NO /inicio ni /usuarios)
    if (authorized && routeNeedsStore(path)) {
      const gate = getStoreGate(path);
      if (gate) {
        renderStoreGate(path, gate);
        updateHeaderControls(path);
        try{ updateHeaderRoleBadge(); }catch(e){}
        try { $app.parentElement.scrollTo({ top: 0, left: 0, behavior: 'instant' }); } catch(e){ $app.parentElement.scrollTop = 0; }
        return;
      }
    }

    const isPrint = (path === '/pdf');
    try{ document.body.classList.toggle('print-mode', isPrint); }catch(e){}
    const fn = routes[path] || routes['/inicio'];
    fn();
    updateHeaderControls(path);
    updateHeaderRoleBadge();
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

          <button class="card home-card home-card--usuarios" data-go="/usuarios" type="button">
            <div class="card-hero" aria-hidden="true">
              <div class="card-hero-slot">
                <img class="card-hero-img" data-hero="usuarios" alt="" decoding="async" loading="lazy" />
                <img class="card-hero-fallback" src="assets/hero/usuarios.svg" alt="" decoding="async" loading="lazy" />
              </div>
            </div>
            <div class="home-body">
              <div class="home-title">Usuarios</div>
              <p class="home-desc">Acceso, roles y mesa. (Por ahora: mock + compartir app.)</p>
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
    const roUser = !isAdminRole();
    const draft = getDraftSession();
    const activePlayers = getPlayers().filter(p => !!p.active);
    const lastIds = (store.ui && store.ui.juego && Array.isArray(store.ui.juego.lastPlayerIds)) ? store.ui.juego.lastPlayerIds : [];
    const selected = new Set(lastIds.filter(id => activePlayers.some(p => p.id === id)));
    // Importante: la fecha por defecto NO debe “pegarse” de una fecha vieja guardada.
    // Siempre precargar con la fecha real del día (America/Managua) al crear una nueva partida.
    const defaultDate = todayYMD();

    const closedSessions = getClosedSessions();

    const root = el(`
      <section class="screen" aria-label="Crear/Continuar Partida">
        <h1 class="screen-title">Juego</h1>
        <p class="screen-sub">Crea una partida del día o retoma el borrador. (Tu “yo del futuro” te lo agradecerá.)</p>

        ${roUser ? `<div class="small-note" style="margin-top:10px"><span class="badge" style="vertical-align:middle">SOLO LECTURA</span> <span style="color:var(--muted); font-weight:850">Solo ADMIN puede crear/editar. Tú puedes ver historial y exportar.</span></div>` : ''}

        ${draft ? `
          <div class="panel" role="region" aria-label="Partida en borrador">
            <div class="panel-head">
              <div class="panel-title" style="margin:0">Partida en borrador</div>
              <div class="row">
                <button class="btn primary" type="button" id="continueDraftBtn" ${roUser ? 'disabled' : ''}>Continuar</button>
                <button class="btn danger" type="button" id="discardDraftBtn" ${roUser ? 'disabled' : ''}>Descartar</button>
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
              <input id="sessionDate" type="date" value="${escapeAttr(defaultDate)}" ${(draft || roUser) ? 'disabled' : ''} />
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
    let manualDateTouched = false;

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
            <button class="pick ${sel ? 'selected' : ''}" type="button" data-id="${p.id}" ${(draft || roUser) ? 'disabled' : ''}>
              <div class="pick-nick">${escapeHtml(disp)}</div>
              <div class="pick-name">${escapeHtml(name || '')}</div>
            </button>
          `;
        }).join('');
    }

    function syncStartDisabled(){
      const can = !draft && !roUser && selected.size > 0 && activePlayers.length > 0;
      $start.disabled = !can;
    }

    $grid.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button.pick');
      if (!btn || btn.disabled) return;
      if (roUser) { showToast('Solo ADMIN puede editar'); return; }
      const id = btn.getAttribute('data-id');
      if (!id) return;
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      btn.classList.toggle('selected', selected.has(id));
      syncStartDisabled();
    });

    $date.addEventListener('change', () => {
      if (roUser) { showToast('Solo ADMIN puede editar'); return; }
      manualDateTouched = true;
      const v = ($date.value || '').trim();
      if (!store.ui) store.ui = {};
      if (!store.ui.juego) store.ui.juego = {};
      store.ui.juego.lastDate = v;
      saveStore();
    });

    $start.addEventListener('click', () => {
      if (roUser) { showToast('Solo ADMIN puede editar'); return; }
      if (!requireAdminEdit()) return;
      if (draft) return;
      const today = todayYMD();
      let date = ($date.value || '').trim();
      // Si el usuario no tocó la fecha, forzar que sea “hoy” en el momento real de iniciar.
      // (Evita el caso de dejar la pantalla abierta y arrancar otro día.)
      if (!manualDateTouched) date = today;
      if (!date) date = today;
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
        if (roUser) { showToast('Solo ADMIN puede editar'); return; }
        if (!requireAdminEdit()) return;
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
    renderMesaSession(s, { readOnly: (!canEditData()), backPath: '/juego', badge: 'Draft' });
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
    renderMesaSession(s, { readOnly: (s.status === 'closed' || !canEditData()), backPath: '/juego', badge: (s.status === 'closed' ? 'Cerrada' : 'Draft') });
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

    // Etapa 1/3: Ranking GLOBAL acumulado (closed + sesión actual por id, aunque timing)
    const ga = computeGlobalAnalytics({ includeSessionId: s.id });
    const top10 = (ga && Array.isArray(ga.ranking) ? ga.ranking.slice(0, 10) : []);
    const rankTbody = top10.map((r, idx) => {
      const avg = r.games ? (numOrZero(r.netTotal) / numOrZero(r.games)) : 0;
      return `
        <tr>
          <td class="num">${escapeHtml(String(idx + 1))}</td>
          <td class="who" title="${escapeAttr(String(r.display || ''))}">${escapeHtml(String(r.display || ''))}</td>
          <td class="num">${escapeHtml(formatMoney(r.netTotal))}</td>
          <td class="num">${escapeHtml(String(r.games || 0))}</td>
          <td class="num">${escapeHtml(String(r.wins1 || 0))}</td>
          <td class="num">${escapeHtml(formatMoney(avg))}</td>
          <td class="num">${escapeHtml(formatMoney(r.investedTotal || 0))}</td>
        </tr>
      `;
    }).join('');

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

    // Etapa 2/3: Estadísticas por jugador (ACTIVOS) — acumulado global (closed + sesión actual)
    const activePlayers = getPlayers().filter(p => p && p.id && p.active === true);
    activePlayers.sort((a,b) => {
      const an = reportName(a.id, playerDisplayName(a));
      const bn = reportName(b.id, playerDisplayName(b));
      return String(an).localeCompare(String(bn), 'es', { sensitivity: 'base' });
    });

    // Opcional (pero útil): rebuys históricos por jugador (cantidad + monto)
    const rebuysMap = (function computePdfRebuysByPlayer(){
      const map = new Map();
      try{
        const uniq = new Map();
        getClosedSessions().forEach(ss => { if (ss && ss.id) uniq.set(String(ss.id), ss); });
        const sid = String(s && s.id ? s.id : '').trim();
        if (sid){
          const cur = getSessionById(sid);
          if (cur && cur.id) uniq.set(String(cur.id), cur);
        }
        Array.from(uniq.values()).forEach(ss => {
          try{
            const an2 = analyzeSession(ss);
            (an2.rows || []).forEach(r => {
              const pid = String(r.id || '').trim();
              if (!pid) return;
              const cur = map.get(pid) || { count: 0, amount: 0 };
              cur.count += Math.max(0, Math.floor(numOrZero(r.rebuysCount)));
              cur.amount += numOrZero(r.rebuysTotal);
              map.set(pid, cur);
            });
          }catch(e){}
        });
      }catch(e){}
      return map;
    })();

    // ===== Etapa 3/3: Records globales (TODOS) — extremos (sesiones closed + sesión actual) =====
    const globalRecords = (function computePdfGlobalRecords(){
      const sessionsUniq = new Map();
      try{
        getClosedSessions().forEach(ss => { if (ss && ss.id) sessionsUniq.set(String(ss.id), ss); });
      }catch(e){}

      try{
        const sid = String(s && s.id ? s.id : '').trim();
        if (sid){
          const cur = getSessionById(sid);
          if (cur && cur.id) sessionsUniq.set(String(cur.id), cur);
          else sessionsUniq.set(sid, s);
        }
      }catch(e){}

      const sessions = Array.from(sessionsUniq.values());

      const rec = {
        // A) Records por sesión (global)
        maxTotalInvested: null, // { value, date }
        maxPlayersCount: null,
        maxRebuysCount: null,
        maxRebuysAmount: null,
        maxAbsDelta: null,

        // B) Records de jugador en una sesión
        maxGain: null, // { value, date, player }
        maxLoss: null,
        maxInvested: null,
        maxPlayerRebuysCount: null,
        maxPlayerRebuysAmount: null,

        // C) Records históricos por jugador (acumulado global)
        maxNetTotal: null, // { value, player }
        minNetTotal: null,
        maxGames: null,
        maxWins1: null,
        bestAvgNetMin3: null, // { value, player, games }
      };

      function updMax(cur, value, extra){
        if (!Number.isFinite(value)) return cur;
        if (!cur || value > cur.value + 0.0001) return { value, ...extra };
        return cur;
      }
      function updMin(cur, value, extra){
        if (!Number.isFinite(value)) return cur;
        if (!cur || value < cur.value - 0.0001) return { value, ...extra };
        return cur;
      }

      sessions.forEach(ss => {
        if (!ss) return;
        try{
          const date = String(ss.date || '').trim() || '—';
          const an2 = analyzeSession(ss);
          const sum2 = an2.summary || calcSessionSummary(ss);
          const rows2 = Array.isArray(an2.rows) ? an2.rows : [];

          const rbCount = rows2.reduce((a,r) => a + Math.max(0, Math.floor(numOrZero(r.rebuysCount))), 0);
          const rbAmt = rows2.reduce((a,r) => a + numOrZero(r.rebuysTotal), 0);
          const absDelta = Math.abs(numOrZero(sum2.delta));

          rec.maxTotalInvested = updMax(rec.maxTotalInvested, numOrZero(sum2.totalInvested), { date });
          rec.maxPlayersCount = updMax(rec.maxPlayersCount, Math.max(0, Math.floor(numOrZero(sum2.playersCount))), { date });
          rec.maxRebuysCount = updMax(rec.maxRebuysCount, rbCount, { date });
          rec.maxRebuysAmount = updMax(rec.maxRebuysAmount, rbAmt, { date });
          rec.maxAbsDelta = updMax(rec.maxAbsDelta, absDelta, { date });

          const rn = makeReportNameResolver(ss);
          rows2.forEach(r => {
            const pid = String(r.id || '').trim();
            if (!pid) return;
            const player = rn(pid, r.display);
            rec.maxGain = updMax(rec.maxGain, numOrZero(r.net), { date, player });
            rec.maxLoss = updMin(rec.maxLoss, numOrZero(r.net), { date, player });
            rec.maxInvested = updMax(rec.maxInvested, numOrZero(r.invested), { date, player });
            rec.maxPlayerRebuysCount = updMax(rec.maxPlayerRebuysCount, Math.max(0, Math.floor(numOrZero(r.rebuysCount))), { date, player });
            rec.maxPlayerRebuysAmount = updMax(rec.maxPlayerRebuysAmount, numOrZero(r.rebuysTotal), { date, player });
          });
        }catch(e){}
      });

      // C) Records históricos por jugador — desde acumulado global (ga)
      try{
        const list = (ga && Array.isArray(ga.ranking)) ? ga.ranking : [];
        list.forEach(r => {
          const player = String(r.display || '').trim() || '—';
          rec.maxNetTotal = updMax(rec.maxNetTotal, numOrZero(r.netTotal), { player });
          rec.minNetTotal = updMin(rec.minNetTotal, numOrZero(r.netTotal), { player });
          rec.maxGames = updMax(rec.maxGames, Math.max(0, Math.floor(numOrZero(r.games))), { player });
          rec.maxWins1 = updMax(rec.maxWins1, Math.max(0, Math.floor(numOrZero(r.wins1))), { player });

          const games = Math.max(0, Math.floor(numOrZero(r.games)));
          if (games >= 3){
            const avg = (games ? (numOrZero(r.netTotal) / games) : 0);
            if (!rec.bestAvgNetMin3 || avg > rec.bestAvgNetMin3.value + 0.0001){
              rec.bestAvgNetMin3 = { value: avg, player, games };
            }
          }
        });
      }catch(e){}

      return rec;
    })();

    function recMoney(item){
      if (!item) return '—';
      return formatMoney(numOrZero(item.value));
    }
    function recInt(item){
      if (!item) return '—';
      return String(Math.max(0, Math.floor(numOrZero(item.value))));
    }
    function recDate(item){
      if (!item) return '—';
      return String(item.date || '—');
    }
    function recDatePlayer(item){
      if (!item) return '—';
      return `${String(item.date || '—')} · ${String(item.player || '—')}`;
    }
    function recPlayer(item){
      if (!item) return '—';
      return String(item.player || '—');
    }

    const recordsHtml = (function buildPdfRecordsHtml(){
      const rowsA = [
        ['Mayor monto total jugado (sesión)', recMoney(globalRecords.maxTotalInvested), recDate(globalRecords.maxTotalInvested)],
        ['Mayor cantidad de jugadores (sesión)', recInt(globalRecords.maxPlayersCount), recDate(globalRecords.maxPlayersCount)],
        ['Mayor rebuys (cantidad) (sesión)', recInt(globalRecords.maxRebuysCount), recDate(globalRecords.maxRebuysCount)],
        ['Mayor rebuys (monto) (sesión)', recMoney(globalRecords.maxRebuysAmount), recDate(globalRecords.maxRebuysAmount)],
        ['Mayor |Δ| (delta absoluto) (sesión)', recMoney(globalRecords.maxAbsDelta), recDate(globalRecords.maxAbsDelta)],
      ];

      const rowsB = [
        ['Mayor ganancia en una sesión', recMoney(globalRecords.maxGain), recDatePlayer(globalRecords.maxGain)],
        ['Mayor pérdida en una sesión', recMoney(globalRecords.maxLoss), recDatePlayer(globalRecords.maxLoss)],
        ['Mayor inversión individual en una sesión', recMoney(globalRecords.maxInvested), recDatePlayer(globalRecords.maxInvested)],
        ['Más rebuys (cantidad) en una sesión', recInt(globalRecords.maxPlayerRebuysCount), recDatePlayer(globalRecords.maxPlayerRebuysCount)],
        ['Más rebuys (monto) en una sesión', recMoney(globalRecords.maxPlayerRebuysAmount), recDatePlayer(globalRecords.maxPlayerRebuysAmount)],
      ];

      const rowsC = [
        ['Mayor neto acumulado', recMoney(globalRecords.maxNetTotal), recPlayer(globalRecords.maxNetTotal)],
        ['Menor neto acumulado', recMoney(globalRecords.minNetTotal), recPlayer(globalRecords.minNetTotal)],
        ['Más partidas jugadas', recInt(globalRecords.maxGames), recPlayer(globalRecords.maxGames)],
        ['Más veces #1', recInt(globalRecords.maxWins1), recPlayer(globalRecords.maxWins1)],
        [
          'Mejor promedio neto (mín. 3 partidas)',
          (globalRecords.bestAvgNetMin3 ? recMoney(globalRecords.bestAvgNetMin3) : '—'),
          (globalRecords.bestAvgNetMin3 ? `${recPlayer(globalRecords.bestAvgNetMin3)} · ${String(globalRecords.bestAvgNetMin3.games)} partidas` : '—')
        ],
      ];

      function tbodyFrom(rows){
        return rows.map(([label, val, meta]) => {
          return `
            <tr>
              <td>${escapeHtml(String(label))}</td>
              <td class="num">${escapeHtml(String(val))}</td>
              <td class="meta">${escapeHtml(String(meta))}</td>
            </tr>
          `;
        }).join('');
      }

      const tbodyA = tbodyFrom(rowsA);
      const tbodyB = tbodyFrom(rowsB);
      const tbodyC = tbodyFrom(rowsC);

      return `
        <div class="print-records print-pagebreak" role="region" aria-label="Records globales (todos)">
          <div class="print-section-title">RECORDS GLOBALES (TODOS)</div>

          <div class="print-records-group">
            <div class="print-records-subtitle">A) Records por sesión (global)</div>
            <div class="print-table-wrap print-table-wrap--records">
              <table class="print-table print-table--records">
                <thead>
                  <tr>
                    <th>Record</th>
                    <th class="num">Valor</th>
                    <th>Fecha / Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  ${tbodyA}
                </tbody>
              </table>
            </div>
          </div>

          <div class="print-records-group">
            <div class="print-records-subtitle">B) Records de jugador en una sesión</div>
            <div class="print-table-wrap print-table-wrap--records">
              <table class="print-table print-table--records">
                <thead>
                  <tr>
                    <th>Record</th>
                    <th class="num">Valor</th>
                    <th>Fecha / Jugador</th>
                  </tr>
                </thead>
                <tbody>
                  ${tbodyB}
                </tbody>
              </table>
            </div>
          </div>

          <div class="print-records-group">
            <div class="print-records-subtitle">C) Records históricos por jugador</div>
            <div class="print-table-wrap print-table-wrap--records">
              <table class="print-table print-table--records">
                <thead>
                  <tr>
                    <th>Record</th>
                    <th class="num">Valor</th>
                    <th>Jugador</th>
                  </tr>
                </thead>
                <tbody>
                  ${tbodyC}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    })();

    const playerStatsHtml = activePlayers.map(p => {
      const pid = String(p.id || '').trim();
      if (!pid) return '';

      const st = (ga && ga.byPlayer && ga.byPlayer.get) ? ga.byPlayer.get(pid) : null;
      const games = st ? Math.max(0, Math.floor(numOrZero(st.games))) : 0;
      const netTotal = st ? numOrZero(st.netTotal) : 0;
      const wins1 = st ? Math.max(0, Math.floor(numOrZero(st.wins1))) : 0;
      const avgNet = games ? (netTotal / games) : 0;
      const investedTotal = st ? numOrZero(st.investedTotal) : 0;

      const bestAmt = (st && st.best && Number.isFinite(st.best.net)) ? formatMoney(st.best.net) : '—';
      const bestDate = (st && st.best && st.best.date) ? String(st.best.date) : '—';
      const worstAmt = (st && st.worst && Number.isFinite(st.worst.net)) ? formatMoney(st.worst.net) : '—';
      const worstDate = (st && st.worst && st.worst.date) ? String(st.worst.date) : '—';

      const rb = rebuysMap.get(pid) || { count: 0, amount: 0 };
      const rbCount = Math.max(0, Math.floor(numOrZero(rb.count)));
      const rbAmount = numOrZero(rb.amount);
      const rbLabel = `${rbCount} · ${formatMoney(rbAmount)}`;

      const nick = (p && p.nick ? String(p.nick).trim() : '');
      const legalName = reportName(pid, playerDisplayName(p));
      const netClass = Math.abs(netTotal) < 0.0001 ? 'ok' : (netTotal > 0 ? 'pos' : 'neg');

      return `
        <article class="print-player-block" data-pid="${escapeAttr(pid)}">
          <div class="print-player-head">
            <div class="print-player-ident">
              <div class="print-player-name">${escapeHtml(String(legalName || 'Sin nombre'))}</div>
              <div class="print-player-sub">${escapeHtml(nick ? ('Apodo: ' + nick) : '')}</div>
            </div>
            <div class="print-player-kpi">
              <div class="k">Neto acumulado</div>
              <div class="v net ${netClass}">${escapeHtml(formatMoney(netTotal))}</div>
            </div>
          </div>

          <div class="print-player-grid">
            <div class="pp-stat"><div class="k">Partidas jugadas</div><div class="v">${escapeHtml(String(games))}</div></div>
            <div class="pp-stat"><div class="k">Veces #1</div><div class="v">${escapeHtml(String(wins1))}</div></div>
            <div class="pp-stat"><div class="k">Promedio neto por partida</div><div class="v">${escapeHtml(formatMoney(avgNet))}</div></div>

            <div class="pp-stat"><div class="k">Invertido total (histórico)</div><div class="v">${escapeHtml(formatMoney(investedTotal))}</div></div>
            <div class="pp-stat"><div class="k">Mejor noche</div><div class="v">${escapeHtml(String(bestAmt))}</div><div class="s">${escapeHtml(String(bestDate))}</div></div>
            <div class="pp-stat"><div class="k">Peor noche</div><div class="v">${escapeHtml(String(worstAmt))}</div><div class="s">${escapeHtml(String(worstDate))}</div></div>

            <div class="pp-stat"><div class="k">Rebuys (histórico)</div><div class="v">${escapeHtml(String(rbLabel))}</div></div>
          </div>
        </article>
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

        <div class="print-global print-pagebreak" role="region" aria-label="Ranking Global">
          <div class="print-section-title">RANKING GLOBAL (TOP 10 — NETO ACUMULADO)</div>

          ${top10.length ? `
            <div class="print-table-wrap print-table-wrap--ranking" role="region" aria-label="Tabla ranking global">
              <table class="print-table print-table--ranking">
                <thead>
                  <tr>
                    <th class="num" style="width:56px">Rank</th>
                    <th>Jugador</th>
                    <th class="num">Neto acumulado</th>
                    <th class="num">Partidas</th>
                    <th class="num">Veces #1</th>
                    <th class="num">Promedio neto</th>
                    <th class="num">Invertido total</th>
                  </tr>
                </thead>
                <tbody>
                  ${rankTbody}
                </tbody>
              </table>
            </div>
          ` : `<div class="empty" style="margin-top:12px">No hay datos globales todavía.</div>`}
        </div>

        ${recordsHtml}

        <div class="print-players print-pagebreak" role="region" aria-label="Estadísticas por jugador (activos)">
          <div class="print-section-title">ESTADÍSTICAS POR JUGADOR (ACTIVOS)</div>

          ${activePlayers.length ? `
            <div class="print-players-list">
              ${playerStatsHtml}
            </div>
          ` : `<div class="empty" style="margin-top:12px">No hay jugadores activos.</div>`}
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
            ${(!readOnly && canEditData() && String(s.status || '').toLowerCase() === 'draft') ? `<button class="btn" type="button" id="addPlayersBtn">Agregar jugadores</button>` : ``}
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

    const $addPlayers = document.getElementById('addPlayersBtn');
    if ($addPlayers){
      $addPlayers.addEventListener('click', async () => {
        const ctx = 'Agregar jugadores';
        let rerender = false;
        try{
          if (readOnly) return;

          const sid = String(s && s.id ? s.id : '').trim();
          if (!sid){ showToast(ctx + ': Sesión no válida'); return; }

          // Sesión fresca (evitar objeto stale para elegibles)
          const base = getSessionById(sid);
          if (!base){ showToast(ctx + ': Sesión no encontrada'); return; }
          if (String(base.status || '').toLowerCase() !== 'draft') return;
          if (!requireAdminEdit(ctx)) return;

          const existing = new Set();
          (Array.isArray(base.playerIds) ? base.playerIds : []).forEach(pid => existing.add(String(pid)));
          (Array.isArray(base.playersSnapshot) ? base.playersSnapshot : []).forEach(p => { if (p && p.id) existing.add(String(p.id)); });
          (base.game && Array.isArray(base.game.players) ? base.game.players : []).forEach(p => { if (p && p.id) existing.add(String(p.id)); });

          const eligible = getPlayers()
            .filter(p => p && p.id && p.active === true)
            .map(p => ({
              id: String(p.id),
              display: playerDisplayName(p),
              name: (p && p.name ? String(p.name).trim() : ''),
              nick: (p && p.nick ? String(p.nick).trim() : ''),
            }))
            .filter(p => !existing.has(p.id))
            .sort((a,b) => {
              const ad = String(a.display || '').toLowerCase();
              const bd = String(b.display || '').toLowerCase();
              if (ad < bd) return -1;
              if (ad > bd) return 1;
              return String(a.id).localeCompare(String(b.id));
            });

          if (!eligible.length){
            showToast(ctx + ': No hay jugadores nuevos. Agrégalos en Configuración y actívalos.');
            return;
          }

          const selected = await multiSelectPlayersDialog({
            title: 'Agregar jugadores',
            body: 'Selecciona jugadores activos que no estén en la sesión.',
            players: eligible,
            okText: 'Agregar',
            cancelText: 'Cancelar'
          });
          if (!Array.isArray(selected) || !selected.length) return;

          // Re-leer sesión antes de aplicar (concurrencia mínima)
          const latest = getSessionById(sid);
          if (!latest){ showToast(ctx + ': Sesión no encontrada'); return; }
          if (String(latest.status || '').toLowerCase() !== 'draft'){ showToast(ctx + ': Sesión cerrada: no se pueden agregar jugadores'); return; }
          if (!requireAdminEdit(ctx)) return;

          const existing2 = new Set();
          (Array.isArray(latest.playerIds) ? latest.playerIds : []).forEach(pid => existing2.add(String(pid)));
          (Array.isArray(latest.playersSnapshot) ? latest.playersSnapshot : []).forEach(p => { if (p && p.id) existing2.add(String(p.id)); });
          (latest.game && Array.isArray(latest.game.players) ? latest.game.players : []).forEach(p => { if (p && p.id) existing2.add(String(p.id)); });

          const filtered = selected
            .map(x => String(x || '').trim())
            .filter(pid => pid && !existing2.has(pid));

          if (!filtered.length){
            showToast(ctx + ': Ya estaban en la sesión (actualizada).');
            return;
          }

          const res = addPlayersToDraftSession(sid, filtered);
          rerender = true;

          if (res && res.addedCount > 0) showToast('Jugadores agregados: ' + String(res.addedCount));
        }catch(err){
          const msg = (err && err.message) ? err.message : String(err || 'Error');
          showToast(ctx + ': ' + msg);
        }finally{
          if (rerender){
            try{ onRoute(); }catch(e){}
          }
        }
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
    const roUser = !isAdminRole();
    const root = el(`
      <section class="screen" aria-label="Configuración">
        <h1 class="screen-title">Configuración</h1>
        <p class="screen-sub">Configuras una vez y luego solo juegas. (Ok, también discutes. Pero con estilo.)</p>

        ${roUser ? `<div class="small-note" style="margin-top:10px"><span class="badge" style="vertical-align:middle">SOLO LECTURA</span> <span style="color:var(--muted); font-weight:850">Solo ADMIN puede editar. Tú puedes ver y exportar.</span></div>` : ''}

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
            <button class="btn primary" type="button" id="addPlayerBtn" ${roUser ? 'disabled' : ''}>Agregar jugador</button>
          </div>

          <div class="player-grid" id="playerGrid" aria-live="polite"></div>

          <div class="small-note">En <b>Juego</b> se mostrará el <b>Apodo</b>. Si está vacío, se usa el nombre. Estadísticas calculadas desde sesiones cerradas.</div>
        </div>

        <div class="panel" role="region" aria-label="Fichas" style="margin-top:14px">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Fichas</div>
            <button class="btn primary" type="button" id="addChipBtn" ${roUser ? 'disabled' : ''}>Agregar ficha</button>
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
              <button class="btn" type="button" data-act="edit" ${roUser ? 'disabled' : ''}>Editar</button>
              <button class="btn" type="button" data-act="toggle" ${roUser ? 'disabled' : ''}>${actionLabel}</button>
            </div>
          </article>
        `;
      }).join('');
    }

    $pgrid.addEventListener('click', (ev) => {
      if (roUser) { showToast('Solo ADMIN puede editar'); return; }
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
      if (roUser) { showToast('Solo ADMIN puede editar'); return; }
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
              <button class="btn" type="button" data-act="edit" ${roUser ? 'disabled' : ''}>Editar</button>
              <button class="btn" type="button" data-act="toggle" ${roUser ? 'disabled' : ''}>${actionLabel}</button>
            </div>
          </article>
        `;
      }).join('');
    }

    $cgrid.addEventListener('click', (ev) => {
      if (roUser) { showToast('Solo ADMIN puede editar'); return; }
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
      if (roUser) { showToast('Solo ADMIN puede editar'); return; }
      openChipModal({ mode: 'add', onSave: renderChips });
    });

    document.getElementById('backBtn').addEventListener('click', () => navigate('/inicio'));

    renderPlayers();
    renderChips();
  }

  function openChipModal({ mode, chip, onSave }){
    if (!requireAdminEdit()) return;
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
    if (!requireAdminEdit()) return;
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
    // Forzar TZ Managua para que el “hoy” sea consistente aunque el dispositivo tenga otra zona.
    try {
      const s = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Managua',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    } catch (e) {}
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
  if (!requireAdminEdit()) return;
    if (!s || !s.id) return;
    if (!Array.isArray(store.sessions)) store.sessions = [];
    const idx = store.sessions.findIndex(x => x && x.id === s.id);
    if (idx >= 0) store.sessions[idx] = s;
    else store.sessions.push(s);
    saveStore();
  }

  function getSessionById(id){
    const sessions = Array.isArray(store.sessions) ? store.sessions : [];
    return sessions.find(x => x && x.id === id) || null;
  }

  // ===== Etapa 1/3: Late joiners (agregar jugadores a Draft sin re-snapshot completo) =====
  // Regla de negocio:
  // - Los jugadores a agregar deben existir en Configuración (store.players) y estar active=true
  // - Solo en sesiones status='draft'
  // - Solo ADMIN (requireAdminEdit)
  // Nota: NO recalcula el playersSnapshot completo; solo anexa snapshots nuevos al final.
  function addPlayersToDraftSession(sessionId, newPlayerIds){
    const ctx = 'Agregar jugadores';
    if (!requireAdminEdit(ctx)) return { addedCount: 0, ignoredCount: 0, addedIds: [], ignoredIds: [] };

    const toast = (m) => showToast(ctx + ': ' + m);

    const sid = String(sessionId || '').trim() || String(store.draftSessionId || '').trim();
    if (!sid){
      toast('Sesión no válida');
      return { addedCount: 0, ignoredCount: 0, addedIds: [], ignoredIds: [] };
    }

    // Obtener la sesión más reciente desde store (evitar objeto stale)
    const s = getSessionById(sid);
    if (!s){
      toast('Sesión no encontrada');
      return { addedCount: 0, ignoredCount: 0, addedIds: [], ignoredIds: [] };
    }
    if (String(s.status || '').toLowerCase() !== 'draft'){
      toast('Sesión cerrada: no se pueden agregar jugadores');
      return { addedCount: 0, ignoredCount: 0, addedIds: [], ignoredIds: [] };
    }

    const raw = Array.isArray(newPlayerIds)
      ? newPlayerIds
      : (newPlayerIds != null ? [newPlayerIds] : []);

    // Normalizar ids de entrada (sin duplicados)
    const req = [];
    const reqSeen = new Set();
    raw.forEach(x => {
      const pid = String(x || '').trim();
      if (!pid) return;
      if (reqSeen.has(pid)) return;
      reqSeen.add(pid);
      req.push(pid);
    });

    const master = new Map(getPlayers().filter(p => p && p.id).map(p => [String(p.id), p]));
    const existing = new Set();
    (Array.isArray(s.playerIds) ? s.playerIds : []).forEach(pid => existing.add(String(pid)));
    (Array.isArray(s.playersSnapshot) ? s.playersSnapshot : []).forEach(p => { if (p && p.id) existing.add(String(p.id)); });
    (s.game && Array.isArray(s.game.players) ? s.game.players : []).forEach(p => { if (p && p.id) existing.add(String(p.id)); });

    const added = [];
    const ignored = [];
    req.forEach(pid => {
      const p = master.get(pid);
      const ok = !!(p && p.active === true);
      if (!ok || existing.has(pid)){
        ignored.push(pid);
        return;
      }
      added.push(pid);
      existing.add(pid);
    });

    if (!added.length){
      toast('No hay jugadores nuevos. Agrégalos en Configuración y actívalos.');
      return { addedCount: 0, ignoredCount: req.length, addedIds: [], ignoredIds: ignored.slice() };
    }

    if (!Array.isArray(s.playerIds)) s.playerIds = [];
    if (!Array.isArray(s.playersSnapshot)) s.playersSnapshot = [];

    // Anexar ids nuevos al final (sin duplicados)
    const pidSet = new Set(s.playerIds.map(x => String(x)));
    added.forEach(pid => {
      if (pidSet.has(pid)) return;
      s.playerIds.push(pid);
      pidSet.add(pid);
    });

    // Anexar snapshots solo de los nuevos jugadores (NO re-snapshot del resto)
    const newSnaps = snapshotPlayers(added);
    newSnaps.forEach(sp => s.playersSnapshot.push(sp));

    // Asegurar game.players consistente (preserva estados existentes)
    ensureSessionGame(s);

    // Persistir
    touchSession(s);
    saveSession(s);

    return {
      addedCount: added.length,
      ignoredCount: Math.max(0, req.length - added.length),
      addedIds: added.slice(),
      ignoredIds: ignored.slice()
    };
  }

  // Hook ligero para pruebas manuales (sin UI):
  // window.pokeritoAddPlayersToDraftSession(sessionId?, [playerIds])
  try{ window.pokeritoAddPlayersToDraftSession = addPlayersToDraftSession; }catch(e){}

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
  if (!requireAdminEdit()) return;
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

  function computeAnalyticsFromSessions(sessions){
    const list = Array.isArray(sessions) ? sessions : [];
    const byPlayer = new Map();

    let maxTotalInvested = null; // { date, amount }
    let maxGain = null; // { date, amount, player }
    let maxLoss = null; // { date, amount, player }

    const detailed = [];
    const summaryRows = [];

    // Nota: la app mantiene getClosedSessions() en orden DESC por fecha.
    // Para exports/estadísticas, procesamos en orden cronológico (ASC).
    list.slice().reverse().forEach(s => {
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

  function computeAnalytics(){
    // Ranking/records globales “oficiales”: solo sesiones cerradas
    return computeAnalyticsFromSessions(getClosedSessions());
  }

  // Etapa 1/3: GLOBAL acumulado para PDF: sesiones closed + (siempre) la sesión actual por id.
  // No lista sesiones; solo entrega agregados por jugador.
  function computeGlobalAnalytics({ includeSessionId } = {}){
    const closed = getClosedSessions();
    const map = new Map();
    closed.forEach(s => {
      if (s && s.id) map.set(String(s.id), s);
    });

    const sid = String(includeSessionId || '').trim();
    if (sid){
      const cur = getSessionById(sid);
      if (cur && cur.id) map.set(String(cur.id), cur);
    }

    const sessions = Array.from(map.values()).sort((a,b) => numOrZero(b.closedAt || b.updatedAt) - numOrZero(a.closedAt || a.updatedAt));
    return computeAnalyticsFromSessions(sessions);
  }

  function recalcAndPersistStats(){
  if (!requireAdminEdit()) return;
    const a = computeAnalytics();
    // persist into players.stats (for convenience) + global block
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
      records: a.records,
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


  function getAppShareUrl(){
    // Always share a stable entry route
    const base = (window.location.origin || '') + (window.location.pathname || '');
    return base + '#/inicio';
  }

  async function shareAppLink(){
    const url = getAppShareUrl();
    const data = { title: 'Pokerito', url: url };

    // Native share (if available)
    if (navigator.share){
      try{
        await navigator.share(data);
        return;
      }catch(e){
        // user canceled or not allowed — fall through
      }
    }

    const ok = await copyTextToClipboard(url);
    if (ok){
      showToast('Link copiado');
      return;
    }

    // Last resort: modal with the URL so the user can copy manually
    await confirmDialog({ title: 'Compartir', body: 'Copia este link\n\n' + url, okText: 'OK', cancelText: 'Cerrar' });
  }

  async function copyTextToClipboard(text){
    const t = String(text || '');
    if (!t) return false;

    if (navigator.clipboard && navigator.clipboard.writeText){
      try{ await navigator.clipboard.writeText(t); return true; }catch(e){}
    }

    // Fallback for older iOS: textarea + execCommand
    try{
      const ta = document.createElement('textarea');
      ta.value = t;
      ta.setAttribute('readonly','');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return !!ok;
    }catch(e){
      return false;
    }
  }

  let toastTimer = null;
  function showToast(msg){
    const text = String(msg || '').trim();
    if (!text) return;

    let elToast = document.getElementById('toast');
    if (!elToast){
      elToast = document.createElement('div');
      elToast.id = 'toast';
      elToast.className = 'toast';
      document.body.appendChild(elToast);
    }

    elToast.textContent = text;
    elToast.classList.add('show');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      try{ elToast.classList.remove('show'); }catch(e){}
    }, 1900);
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
    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      data: {
        store: store,
        themePref: themePref,
      }
    };
    const ymd = ymdCompact(todayYmd());
    const hh = String(new Date().getHours()).padStart(2,'0');
    const mm = String(new Date().getMinutes()).padStart(2,'0');
    const filename = `POKERITO_Respaldo_${ymd}_${hh}${mm}.json`;
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), filename);
  }

  async function importBackupJson(text, { mode }){
    if (!requireAdminEdit()) return;
    let obj = null;
    try{ obj = JSON.parse(text); }catch(e){ obj = null; }
    if (!obj || typeof obj !== 'object'){
      await confirmDialog({ title: 'Respaldo inválido', body: 'El archivo no es JSON válido.', okText: 'OK', cancelText: 'Cerrar', danger: true });
      return;
    }
    if (obj.schemaVersion !== 1 || !obj.data || typeof obj.data !== 'object'){
      await confirmDialog({ title: 'Respaldo inválido', body: 'schemaVersion o estructura no reconocida.', okText: 'OK', cancelText: 'Cerrar', danger: true });
      return;
    }
    const incomingStore = obj.data.store;
    if (!incomingStore || typeof incomingStore !== 'object'){
      await confirmDialog({ title: 'Respaldo inválido', body: 'No se encontró data.store.', okText: 'OK', cancelText: 'Cerrar', danger: true });
      return;
    }
    // normalize to our store shape
    const normalized = normalizeIncomingStore(incomingStore);

    const chipsN = (Array.isArray(normalized.chips) ? normalized.chips.length : 0);
    const playersN = (Array.isArray(normalized.players) ? normalized.players.length : 0);
    const sessionsN = (Array.isArray(normalized.sessions) ? normalized.sessions.length : 0);
    const closedN = (Array.isArray(normalized.sessions) ? normalized.sessions.filter(s => s && s.status === 'closed').length : 0);

    const sumBody = `Resumen del respaldo:\n\n• Fichas: ${chipsN}\n• Jugadores: ${playersN}\n• Partidas: ${sessionsN} (cerradas: ${closedN})\n\nModo: ${mode === 'merge' ? 'Fusionar' : 'Reemplazar'}`;

    const ok = await confirmDialog({
      title: 'Importar respaldo',
      body: sumBody + (mode === 'merge' ? '\n\nFusionar solo agrega IDs nuevos (no pisa datos existentes).' : '\n\nReemplazar borrará los datos actuales en este dispositivo.'),
      okText: mode === 'merge' ? 'Fusionar' : 'Reemplazar',
      cancelText: 'Cancelar',
      danger: (mode !== 'merge'),
    });
    if (!ok) return;

    const incomingTheme = (typeof obj.data.themePref === 'string') ? obj.data.themePref : null;
    if (mode === 'merge'){
      mergeStore(normalized);
    } else {
      store = normalized;
      saveStore();
    }
    if (incomingTheme){
      themePref = (incomingTheme === 'auto' || incomingTheme === 'light' || incomingTheme === 'dark') ? incomingTheme : themePref;
      try{ localStorage.setItem(THEME_KEY, themePref); }catch(e){}
      applyTheme();
    }
    try{ recalcAndPersistStats(); }catch(e){}
    await confirmDialog({ title: 'Importación completa', body: 'Respaldo aplicado.', okText: 'OK', cancelText: 'Cerrar' });
    navigate('/inicio');
  }

  function normalizeIncomingStore(obj){
    // keep our v/version; avoid destructive migrations
    const out = {
      v: STORE_VERSION,
      chips: Array.isArray(obj.chips) ? obj.chips : defaultChips(),
      players: Array.isArray(obj.players) ? obj.players : defaultPlayers(),
      sessions: Array.isArray(obj.sessions) ? obj.sessions : [],
      draftSessionId: (typeof obj.draftSessionId === 'string') ? obj.draftSessionId : '',
      ui: (obj.ui && typeof obj.ui === 'object') ? obj.ui : { juego: {} },
      createdAt: numOrZero(obj.createdAt) || Date.now(),
      updatedAt: Date.now(),
    };
    // soft migration: ensure sessions shape
    if (Array.isArray(out.sessions)){
      out.sessions.forEach(s => { try{ ensureSessionGame(s); }catch(e){} });
      if (out.draftSessionId){
        const ds = out.sessions.find(x => x && x.id === out.draftSessionId) || null;
        if (ds && ds.status !== 'draft') out.draftSessionId = '';
      }
    }
    return out;
  }

  function mergeStore(incoming){
    // Safe merge: keep current on conflicts, only add missing IDs
    const cur = store;
    const byId = (arr) => {
      const m = new Map();
      (Array.isArray(arr) ? arr : []).forEach(x => { if (x && x.id) m.set(x.id, x); });
      return m;
    };

    const chips = byId(cur.chips);
    (Array.isArray(incoming.chips) ? incoming.chips : []).forEach(c => {
      if (c && c.id && !chips.has(c.id)) chips.set(c.id, c);
    });

    const players = byId(cur.players);
    (Array.isArray(incoming.players) ? incoming.players : []).forEach(p => {
      if (p && p.id && !players.has(p.id)) players.set(p.id, p);
    });

    const sessions = byId(cur.sessions);
    (Array.isArray(incoming.sessions) ? incoming.sessions : []).forEach(s => {
      if (s && s.id && !sessions.has(s.id)) sessions.set(s.id, s);
    });

    cur.chips = Array.from(chips.values());
    cur.players = Array.from(players.values());
    cur.sessions = Array.from(sessions.values());
    cur.updatedAt = Date.now();
    saveStore();
  }

  function resetAllData(){
    try{ localStorage.removeItem(STORE_CACHE_KEY); }catch(e){}
    try{ localStorage.removeItem(LEGACY_STORE_KEY); }catch(e){}
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
        // Evitar que MIEMBRO escriba punteros globales: solo ADMIN corrige el draftSessionId
        if (isAdminRole() && storeSyncReady && storeRemoteExists){
          store.draftSessionId = s.id;
          saveStore();
        }
      }
    }
    return s;
  }

  function discardDraftSession(){
  if (!requireAdminEdit()) return;
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
              <div class="small-note" style="margin-top:0">${escapeHtml(body || '')}</div>
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

  function multiSelectPlayersDialog({ title, body, players, okText, cancelText }){
    return new Promise(resolve => {
      const list = Array.isArray(players) ? players : [];

      const overlay = el(`
        <div class="modal-overlay" role="dialog" aria-modal="true" aria-label="Seleccionar jugadores">
          <div class="modal">
            <div class="modal-head">
              <div class="modal-title">${escapeHtml(title || 'Seleccionar')}</div>
              <button class="icon-btn" type="button" data-act="close" aria-label="Cerrar">×</button>
            </div>
            <div class="modal-body">
              ${body ? `<div class="small-note" style="margin-top:0">${escapeHtml(body)}</div>` : ''}
              <div class="small-note" style="margin-top:10px">Seleccionados: <b id="selCount">0</b></div>
              <div class="pick-grid" style="margin-top:10px">
                ${list.map(p => {
                  const disp = String(p && p.display ? p.display : '').trim() || 'Sin nombre';
                  const name = String(p && p.name ? p.name : '').trim();
                  const nick = String(p && p.nick ? p.nick : '').trim();
                  const sub = (name && name !== disp) ? name : ((nick && nick !== disp) ? nick : '');
                  return `
                    <button class="pick" type="button" data-id="${escapeAttr(String(p.id || ''))}">
                      <div class="pick-nick">${escapeHtml(disp)}</div>
                      <div class="pick-name">${escapeHtml(sub)}</div>
                    </button>
                  `;
                }).join('')}
              </div>
            </div>
            <div class="modal-foot">
              <button class="btn" type="button" data-act="cancel">${escapeHtml(cancelText || 'Cancelar')}</button>
              <button class="btn primary" type="button" data-act="ok" disabled>${escapeHtml(okText || 'OK')}</button>
            </div>
          </div>
        </div>
      `);

      const selected = new Set();
      const $ok = overlay.querySelector('[data-act="ok"]');
      const $count = overlay.querySelector('#selCount');

      function sync(){
        if ($count) $count.textContent = String(selected.size);
        if ($ok) $ok.disabled = (selected.size === 0);
      }

      function close(val){
        overlay.remove();
        try{ document.body.style.overflow = ''; }catch(e){}
        resolve(val);
      }

      overlay.addEventListener('click', (ev) => {
        if (ev.target === overlay) close(null);
      });
      overlay.querySelectorAll('[data-act="close"],[data-act="cancel"]').forEach(b => b.addEventListener('click', () => close(null)));

      const $grid = overlay.querySelector('.pick-grid');
      if ($grid){
        $grid.addEventListener('click', (ev) => {
          const btn = ev.target.closest('button.pick[data-id]');
          if (!btn) return;
          const id = String(btn.getAttribute('data-id') || '').trim();
          if (!id) return;
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
          btn.classList.toggle('selected', selected.has(id));
          sync();
        });
      }

      $ok.addEventListener('click', () => close(Array.from(selected)));
      overlay.addEventListener('keydown', (ev) => {
        if (ev.key === 'Escape') { ev.preventDefault(); close(null); }
        if (ev.key === 'Enter') {
          if (selected.size > 0) { ev.preventDefault(); close(Array.from(selected)); }
        }
      });

      document.body.appendChild(overlay);
      try{ document.body.style.overflow = 'hidden'; }catch(e){}
      sync();
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



  function renderUsuarios(){
    const enabled = isAuthEnabled();
    const fsEnabled = isFirestoreAccessEnabled();
    const ready = authReady;
    const u = authUser;
    const displayName = u ? escapeHtml(u.displayName || '') : '';
    const email = u ? escapeHtml(u.email || '') : '';

    const gateActive = !!(enabled && ready && u && (!authzReady || !authorized));
    const sessBadge = (!enabled) ? 'OFF' : (!ready ? '...' : (u ? 'OK' : 'LOGIN'));
    const sessTitle = (!enabled) ? 'Sesión' : (!ready ? 'Cargando sesión' : (u ? 'Sesión activa' : 'Iniciar sesión'));

    let sessMsg = '';
    if (!enabled) sessMsg = 'Firebase/Auth no está listo (revisa firebaseConfig.js y que firebaseInit.js cargue sin errores).';
    else if (!ready) sessMsg = 'Cargando sesión…';
    else if (u) sessMsg = `Conectado como <b>${displayName || 'Usuario'}</b>${email ? ` (${email})` : ''}.`;
    else sessMsg = 'Inicia sesión con Google para usar la app.';

    let authzBadge = 'BLOQUEADO';
    let authzTitle = 'Acceso';
    let authzMsg = '';
    if (!enabled) {
      authzBadge = 'OFF';
      authzTitle = 'Autorización';
      authzMsg = 'Activa Firebase/Auth + Firestore para habilitar autorización por usuario.';
    } else if (!ready) {
      authzBadge = '...';
      authzTitle = 'Autorización';
      authzMsg = 'Esperando estado de sesión…';
    } else if (!u) {
      authzBadge = 'LOGIN';
      authzTitle = 'Autorización';
      authzMsg = 'Primero inicia sesión para validar si tu usuario está autorizado.';
    } else if (!fsEnabled) {
      authzBadge = 'ERROR';
      authzTitle = 'Autorización';
      authzMsg = 'Firestore no está listo. No se puede validar allowedUsers/accessRequests.';
    } else if (!authzReady || authzChecking) {
      authzBadge = 'CHECK';
      authzTitle = 'Verificando autorización';
      authzMsg = 'Comprobando allowedUsers…';
    } else if (authorized) {
      authzBadge = escapeHtml(authorizedRole || 'OK');
      authzTitle = 'Acceso aprobado';
      authzMsg = `Tu usuario está autorizado${authorizedRole ? ` como <b>${escapeHtml(authorizedRole)}</b>` : ''}.`;
    } else {
      const st = String((accessRequest && accessRequest.status) || '').toUpperCase();
      if (st === 'PENDING') {
        authzBadge = 'PENDING';
        authzTitle = 'Solicitud enviada';
        authzMsg = 'Tu solicitud está pendiente de aprobación por un ADMIN.';
      } else if (st === 'REJECTED') {
        authzBadge = 'REJECTED';
        authzTitle = 'Acceso no aprobado';
        authzMsg = 'Tu solicitud fue rechazada. Puedes volver a solicitar acceso.';
      } else if (st === 'APPROVED') {
        authzBadge = 'APPROVED';
        authzTitle = 'Solicitud aprobada';
        authzMsg = 'Tu solicitud aparece aprobada. Si aún no entras, toca “Revisar estado” para detectar allowedUsers.';
      } else if (accessRequestReady) {
        authzBadge = 'SOLICITAR';
        authzTitle = 'Solicitar acceso';
        authzMsg = 'Tu usuario aún no está autorizado. Solicita acceso para que un ADMIN te apruebe.';
      } else {
        authzBadge = 'CHECK';
        authzTitle = 'Verificando acceso';
        authzMsg = 'Consultando estado de solicitud…';
      }
    }

    const requestStatus = String((accessRequest && accessRequest.status) || '').toUpperCase();
    const canBootstrap = canBootstrapAdmin();
    const canRequest = !!(enabled && ready && u && fsEnabled && authzReady && !authorized && !authzChecking && (!requestStatus || requestStatus === 'REJECTED') && !canBootstrap);
    const canRefreshAccess = !!(enabled && ready && u && fsEnabled && !authzChecking);
    const showAccessPanel = !!(enabled && ready && u);
    const canBack = !!(enabled && ready && u && authzReady && authorized);

    const root = el(`
      <section class="screen" aria-label="Usuarios">
        <h1 class="screen-title">Usuarios</h1>
        <p class="screen-sub">Acceso y permisos. Si no estás autorizado, la app se queda aquí. Sin drama, así debe ser.</p>

        ${gateActive ? `
          <div class="panel" role="region" aria-label="Bloqueo por autorización" style="margin-top:10px">
            <div class="panel-head">
              <div class="panel-title" style="margin:0">Acceso restringido</div>
              <span class="badge">GATE</span>
            </div>
            <div class="small-note" style="margin-top:10px">Tu sesión existe, pero el acceso a la app está bloqueado hasta que aparezcas en <b>allowedUsers</b>.</div>
          </div>
        ` : ''}

        <div class="panel" role="region" aria-label="Sesión" style="margin-top:${gateActive ? '14px' : '10px'}">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">${sessTitle}</div>
            <span class="badge">${sessBadge}</span>
          </div>
          <div class="small-note" style="margin-top:10px">${sessMsg}</div>
          ${authUiError ? `<div class="small-note" style="margin-top:8px"><span class="badge" style="vertical-align:middle">ERROR</span> <span style="color:var(--muted); font-weight:850">${escapeHtml(authUiError)}</span></div>` : ''}
          <div class="row" style="margin-top:12px; gap:10px; flex-wrap:wrap">
            ${enabled ? (u ? `<button class="btn danger" type="button" id="logoutBtn">Cerrar sesión</button>` : `<button class="btn primary" type="button" id="loginBtn">Iniciar sesión con Google</button>`) : ''}
            ${canRefreshAccess ? `<button class="btn" type="button" id="refreshAccessBtn">Revisar estado</button>` : ''}
          </div>
          ${enabled ? `<div class="small-note" style="margin-top:10px">Si el popup falla (iPad/Safari/PWA), se usará redirección automática.</div>` : ''}
        </div>

        ${showAccessPanel ? `
          <div class="panel" role="region" aria-label="Autorización" style="margin-top:14px">
            <div class="panel-head">
              <div class="panel-title" style="margin:0">${authzTitle}</div>
              <span class="badge">${authzBadge}</span>
            </div>
            <div class="small-note" style="margin-top:10px">${authzMsg}</div>
            ${authzUiError ? `<div class="small-note" style="margin-top:8px"><span class="badge" style="vertical-align:middle">ERROR</span> <span style="color:var(--muted); font-weight:850">${escapeHtml(authzUiError)}</span></div>` : ''}

            ${canBootstrap ? `
              <div class="row" style="margin-top:12px; gap:10px; flex-wrap:wrap">
                <button class="btn primary" type="button" id="bootstrapAdminBtn">Activar ADMIN (bootstrap)</button>
              </div>
              <div class="small-note" style="margin-top:10px">Esto crea tu registro en <b>allowedUsers</b> como <b>ADMIN</b>. Solo aparece para el correo bootstrap y solo si aún no existe tu allowedUsers.</div>
            ` : ''}

            ${(!authorized && authzReady) ? `
              <div class="row" style="margin-top:12px; gap:10px; flex-wrap:wrap">
                <button class="btn primary" type="button" id="requestAccessBtn" ${canRequest ? '' : 'disabled'}>${requestStatus === 'REJECTED' ? 'Volver a solicitar' : 'Solicitar acceso'}</button>
                ${canRefreshAccess ? `<button class="btn" type="button" id="refreshAccessBtn2">Revisar estado</button>` : ''}
              </div>
            ` : ''}
            ${(!authorized && authzReady) ? `<div class="small-note" style="margin-top:10px">Estados soportados: PENDING / REJECTED / APPROVED. El acceso real se habilita cuando tu UID exista en <b>allowedUsers</b>.</div>` : ''}
          </div>
        ` : ''}

        ${(authorized && String(authorizedRole || '').toUpperCase() === 'ADMIN') ? renderAdminPanelBlock() : ''}

        <div class="panel" role="region" aria-label="Compartir app" style="margin-top:14px">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Compartir app</div>
            <button class="btn primary" type="button" id="shareBtn">COMPARTIR APP</button>
          </div>
          <div class="small-note" style="margin-top:10px">Comparte el link para abrir Pokerito en otro dispositivo.</div>
        </div>

        <div class="row" style="margin-top:14px">
          <button class="btn primary" type="button" id="backBtn" ${canBack ? '' : 'disabled'}>Volver</button>
        </div>
      </section>
    `);

    $app.innerHTML = '';
    $app.appendChild(root);

    const b = document.getElementById('backBtn');
    if (b) b.addEventListener('click', () => navigate('/inicio'));

    const sb = document.getElementById('shareBtn');
    if (sb) sb.addEventListener('click', () => shareAppLink());

    const lb = document.getElementById('loginBtn');
    if (lb) lb.addEventListener('click', () => loginWithGoogle());

    const lob = document.getElementById('logoutBtn');
    if (lob) lob.addEventListener('click', () => logout());

    const rb1 = document.getElementById('refreshAccessBtn');
    if (rb1) rb1.addEventListener('click', () => refreshAuthorizationState({ showToastOnError: true }));
    const rb2 = document.getElementById('refreshAccessBtn2');
    if (rb2) rb2.addEventListener('click', () => refreshAuthorizationState({ showToastOnError: true }));

    const bb = document.getElementById('bootstrapAdminBtn');
    if (bb) bb.addEventListener('click', () => bootstrapActivateAdmin());

    const reqBtn = document.getElementById('requestAccessBtn');
    if (reqBtn) {
      reqBtn.addEventListener('click', () => {
        const st = String((accessRequest && accessRequest.status) || '').toUpperCase();
        submitAccessRequest(st === 'REJECTED' ? 'retry' : 'new');
      });
    }

    // Panel ADMIN (Etapa 6/7)
    if (authorized && String(authorizedRole || '').toUpperCase() === 'ADMIN') {
      const ab = document.getElementById('adminRefreshBtn');
      if (ab) ab.addEventListener('click', () => adminLoadData({ force: true }));

      root.querySelectorAll('[data-req-approve]').forEach(btn => {
        btn.addEventListener('click', () => {
          const uid = btn.getAttribute('data-uid');
          const role = btn.getAttribute('data-role');
          adminApproveRequest(uid, role);
        });
      });
      root.querySelectorAll('[data-req-reject]').forEach(btn => {
        btn.addEventListener('click', () => {
          const uid = btn.getAttribute('data-uid');
          adminRejectRequest(uid);
        });
      });
      root.querySelectorAll('[data-user-role]').forEach(btn => {
        btn.addEventListener('click', () => {
          const uid = btn.getAttribute('data-uid');
          const role = btn.getAttribute('data-role');
          adminSetRole(uid, role);
        });
      });
      root.querySelectorAll('[data-user-revoke]').forEach(btn => {
        btn.addEventListener('click', () => {
          const uid = btn.getAttribute('data-uid');
          adminRevokeAccess(uid);
        });
      });

      if (!adminDataReady && !adminDataLoading && !adminActionBusy) {
        adminLoadData({ force: true });
      }
    }
  }
  function renderSoporte(){
    const roUser = !isAdminRole();
    const root = el(`
      <section class="screen" aria-label="Soporte">
        <h1 class="screen-title">Soporte</h1>
        <p class="screen-sub">Herramientas y ajustes generales. (Sí, aquí vive el “modo oscuro”.)</p>

        ${roUser ? `<div class="small-note" style="margin-top:10px"><span class="badge" style="vertical-align:middle">SOLO LECTURA</span> <span style="color:var(--muted); font-weight:850">Importar, recalcular y cambios están reservados a ADMIN.</span></div>` : ''}

        <div class="panel" role="region" aria-label="Compartir" style="margin-top:10px">
          <div class="panel-head">
            <div class="panel-title" style="margin:0">Compartir app</div>
            <button class="btn primary" type="button" id="shareSupportBtn">COMPARTIR APP</button>
          </div>
          <div class="small-note" style="margin-top:10px">Comparte el link para abrir Pokerito en otro dispositivo.</div>
        </div>

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
            <button class="btn" type="button" id="exportJsonBtn">Exportar JSON</button>
          </div>
          <div class="row" style="margin-top:10px; gap:10px; flex-wrap:wrap">
            <button class="btn primary" type="button" id="importJsonBtn" ${roUser ? 'disabled' : ''}>Importar (Reemplazar)</button>
            <button class="btn" type="button" id="importMergeJsonBtn" ${roUser ? 'disabled' : ''}>Importar (Fusionar)</button>
            <input id="importFile" type="file" accept="application/json" style="display:none" />
          </div>
          <div class="small-note" style="margin-top:10px">Importar muestra un resumen (fichas/jugadores/partidas) antes de aplicar. Fusionar solo agrega IDs nuevos (modo seguro).</div>
        </div>

        <div class="panel" role="region" aria-label="Mantenimiento" style="margin-top:14px">
          <div class="panel-title">Mantenimiento</div>
          <div class="row" style="gap:10px; flex-wrap:wrap">
            <button class="btn" type="button" id="recalcBtn" ${roUser ? 'disabled' : ''}>Recalcular estadísticas</button>
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

    const $share = document.getElementById('shareSupportBtn');
    if ($share) $share.addEventListener('click', () => shareAppLink());

    // Backup
    const $file = document.getElementById('importFile');
    const $import = document.getElementById('importJsonBtn');
    const $importMerge = document.getElementById('importMergeJsonBtn');
    let importMode = 'replace';

    document.getElementById('exportJsonBtn').addEventListener('click', () => exportBackupJson());

    function openPicker(mode){
      if (roUser) { showToast('Solo ADMIN puede editar'); return; }
      importMode = mode;
      if ($file) { $file.value = ''; $file.click(); }
    }
    if ($import) $import.addEventListener('click', () => openPicker('replace'));
    if ($importMerge) $importMerge.addEventListener('click', () => openPicker('merge'));

    if ($file){
      $file.addEventListener('change', async () => {
        const f = $file.files && $file.files[0];
        if (!f) return;
        const txt = await f.text().catch(() => '');
        if (!txt) return;
        await importBackupJson(txt, { mode: importMode });
      });
    }

    // Maintenance
    document.getElementById('recalcBtn').addEventListener('click', async () => {
      if (roUser) { showToast('Solo ADMIN puede editar'); return; }
      if (!requireAdminEdit()) return;
      const ok = await confirmDialog({
        title: 'Recalcular estadísticas',
        body: 'Reconstruye stats desde todas las sesiones cerradas.',
        okText: 'Recalcular',
        cancelText: 'Cancelar',
      });
      if (!ok) return;
      recalcAndPersistStats();
      await confirmDialog({ title: 'Listo', body: 'Estadísticas recalculadas.', okText: 'OK', cancelText: 'Cerrar' });
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

  function updateHeaderRoleBadge(){
    try{
      if (!$roleBadges) return;
      // limpiar siempre
      $roleBadges.innerHTML = '';

      if (!authReady || !authUser) return;
      if (!authzReady) {
        $roleBadges.innerHTML = '<span class="badge">AUTH…</span>';
        return;
      }
      if (!authorized) return;

      const role = String(authorizedRole || '').toUpperCase();
      const isAdmin = (role === 'ADMIN');
      const ro = !isAdmin;

      const roleHtml = `<span class="badge">${escapeHtml(role || 'USUARIO')}</span>`;
      const roHtml = ro ? `<span class="badge">SOLO LECTURA</span>` : '';

      let storeHtml = '';
      if (routeNeedsStore(getRoute()) && authorized){
        if (!storeSyncReady) storeHtml = '<span class="badge">STORE…</span>';
        else if (storeSyncError) storeHtml = '<span class="badge">STORE ERROR</span>';
        else if (!storeRemoteExists) storeHtml = '<span class="badge">STORE</span>';
      }

      $roleBadges.innerHTML = roleHtml + roHtml + storeHtml;
    }catch(e){}
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
      navigator.serviceWorker.register('./sw.js').catch(() => {});
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

  // Firebase ready (Auth + Firestore)
  window.addEventListener('pokerito:firebase-ready', (ev) => {
    try{ attachFirebase(ev && ev.detail ? ev.detail : window.__POKERITO_FIREBASE__); }catch(e){}
  });
  if (window.__POKERITO_FIREBASE__) {
    try{ attachFirebase(window.__POKERITO_FIREBASE__); }catch(e){}
  }

  window.addEventListener('hashchange', onRoute);
  window.addEventListener('DOMContentLoaded', () => {
    // ensure default route
    if (!window.location.hash) window.location.hash = '#/inicio';
    applyTheme();
    onRoute();

    // Fallback: si Firebase no llega (config faltante, bloqueo de red, etc.),
    // no dejar la UI en “cargando” para siempre.
    setTimeout(() => {
      if (!authInitOnce && !authReady) {
        authReady = true;
        onRoute();
      }
    }, 1200);
  });

})();
