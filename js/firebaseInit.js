// Firebase init (Pokerito) — CDN modular (sin build)
// Debe correr antes de app.js y exponer window.PK_FB = { app, auth, db, authApi }

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  limit,
  orderBy,
  runTransaction,
  serverTimestamp,
  Timestamp,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js";

import { firebaseConfig } from "./firebaseConfig.js";

(function initFirebase(){
  try {
    if (window.PK_FB) return; // idempotente
    if (!firebaseConfig || !firebaseConfig.apiKey) throw new Error("firebaseConfig missing");

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // Auth helpers (Google)
    const provider = new GoogleAuthProvider();
    try { provider.setCustomParameters({ prompt: 'select_account' }); } catch(e){}

    async function loginGoogle(){
      // Prefer popup (desktop) y cae a redirect si el popup falla (iPad/Safari o popups bloqueados)
      try {
        const res = await signInWithPopup(auth, provider);
        return { user: (res && res.user) ? res.user : null, method: 'popup' };
      } catch (err) {
        const code = (err && err.code) ? String(err.code) : '';
        const userClosed = (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request');
        const shouldRedirect = (!userClosed) && (
          code === 'auth/popup-blocked' ||
          code === 'auth/operation-not-supported-in-this-environment' ||
          code === 'auth/web-storage-unsupported' ||
          code === ''
        );

        if (!shouldRedirect) throw err;

        // Intentar redirect como fallback
        try {
          await signInWithRedirect(auth, provider);
          return { redirected: true, method: 'redirect' };
        } catch (err2) {
          throw (err2 || err);
        }
      }
    }

    async function logout(){
      await signOut(auth);
      return true;
    }

    function onAuth(cb){
      return onAuthStateChanged(auth, cb);
    }

    async function handleRedirect(){
      try {
        const res = await getRedirectResult(auth);
        return res || null;
      } catch (err) {
        return { __error: err };
      }
    }

    const authApi = {
      provider,
      loginGoogle,
      logout,
      onAuth,
      handleRedirect,
      // pre-lanzamos el redirectResult para que app.js lo pueda esperar sin duplicar llamadas
      redirectResultPromise: handleRedirect(),
    };

    const fs = {
      doc,
      collection,
      getDoc,
      setDoc,
      updateDoc,
      deleteDoc,
      getDocs,
      query,
      where,
      limit,
      orderBy,
      runTransaction,
      serverTimestamp,
      Timestamp,
      onSnapshot,
    };

    window.PK_FB = { app, auth, db, authApi, fs };
  } catch (err) {
    console.warn("[Pokerito] Firebase init failed:", err);
  }
})();
