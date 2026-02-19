// Firebase config (Pokerito) — separado para evitar tocar app.js core
// Expuesto como export (para firebaseInit.js) y también en window para debug.

export const firebaseConfig = {
  apiKey: "AIzaSyA9F0CHuuPi5Nu1NgqUU_rgmdTlsboXIdM",
  authDomain: "pokeritoinclusivo.firebaseapp.com",
  projectId: "pokeritoinclusivo",
  storageBucket: "pokeritoinclusivo.firebasestorage.app",
  messagingSenderId: "776803668480",
  appId: "1:776803668480:web:95f9b152af12267002fee5"
};

try {
  window.PK_FIREBASE_CONFIG = firebaseConfig;
} catch (_) {}
