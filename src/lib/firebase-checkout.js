// ═══════════════════════════════════════════════════════════
// ✅ CHECKOUT-DEDICATED FIREBASE CLIENT
// ═══════════════════════════════════════════════════════════
//
// PURPOSE:
// This is a MINIMAL Firebase client for the checkout page ONLY.
// It imports ONLY what checkout needs: firebase/app + firebase/firestore/lite
//
// WHY SEPARATE FROM src/lib/firebase.js:
// The main firebase.js eagerly imports:
//   - firebase/storage  → uses XMLHttpRequest (fails in Cloudflare Edge)
//   - firebase/auth     → uses indexedDB (fails in Cloudflare Edge)
//   - firebase/database → unused in checkout
//
// These imports create shared-chunk instability when bundled with checkout.
// By isolating to ONLY firestore/lite, we eliminate Edge runtime failures.
//
// ═══════════════════════════════════════════════════════════

import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore/lite";

// Firebase config - same as main config
const firebaseConfig = {
  apiKey: "AIzaSyBIIdkBPaQFHhPLo7Gob7sA1LacaT3E2JE",
  authDomain: "wind-reviews.firebaseapp.com",
  projectId: "wind-reviews",
  storageBucket: "wind-reviews.firebasestorage.app",
  messagingSenderId: "596996130193",
  appId: "1:596996130193:web:186c91269249c6c5eb8630",
  databaseURL: "https://wind-reviews-default-rtdb.firebaseio.com/"
};

let app = null;
let db = null;

/**
 * Get Firestore instance for checkout page.
 * Only uses firebase/firestore/lite - no storage, auth, or database.
 * This avoids Cloudflare Edge runtime failures with those SDKs.
 */
export const getDb = () => {
  if (!app) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  if (!db) {
    db = getFirestore(app);
  }
  return db;
};