// Pokerito — Firebase Init (Auth + Firestore) — CDN modular (v9+)
// Etapa 3/7: Auth Google helpers listos (login/gate viven en app.js).

import { firebaseConfig } from './firebaseConfig.js';

// Pin de versión para evitar sorpresas.
// (v9+ modular; sin bundlers, sin NPM)
// Versión usada: 9.23.0

import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';

function hasBasics(cfg){
  return !!(cfg && typeof cfg === 'object' && cfg.apiKey && cfg.authDomain && cfg.projectId);
}

let app = null;
let auth = null;
let db = null;

try {
  if (hasBasics(firebaseConfig)) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    // Exponer helpers de Auth (Etapa 3/7)
    const authApi = {
      GoogleAuthProvider,
      signInWithPopup,
      signInWithRedirect,
      getRedirectResult,
      signOut,
      onAuthStateChanged,
    };

    const firestoreApi = {
      doc,
      collection,
      getDoc,
      getDocs,
      setDoc,
      updateDoc,
      deleteDoc,
      query,
      where,
      orderBy,
      limit,
  onSnapshot,
      serverTimestamp,
    };

    // Exponer también a scripts no-module (app.js hoy es clásico).
    // En etapas futuras, app.js podrá importar { app, auth, db } directamente.
    try {
      window.__POKERITO_FIREBASE__ = { app, auth, db, authApi, firestoreApi };
      window.dispatchEvent(new CustomEvent('pokerito:firebase-ready', { detail: window.__POKERITO_FIREBASE__ }));
    } catch(e) {}

    console.info('[Pokerito] Firebase listo (Auth + Firestore).');
  } else {
    console.warn('[Pokerito] FirebaseConfig incompleto. Pega tu firebaseConfig en firebaseConfig.js para activar Auth/Firestore.');
  }
} catch (err) {
  console.error('[Pokerito] Error iniciando Firebase:', err);
}

export { app, auth, db };
