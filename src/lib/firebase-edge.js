// Firebase Edge-compatible wrapper for Cloudflare Pages
// This bypasses the EvalError by using browser-compatible Firebase builds

import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore/lite';

// Firebase config - same as main config but for edge compatibility
const firebaseConfig = {
  apiKey: "AIzaSyBIIdkBPaQFHhPLo7Gob7sA1LacaT3E2JE",
  authDomain: "wind-reviews.firebaseapp.com",
  projectId: "wind-reviews",
  storageBucket: "wind-reviews.firebasestorage.app",
  messagingSenderId: "596996130193",
  appId: "1:596996130193:web:186c91269249c6c5eb8630",
  databaseURL: "https://wind-reviews-default-rtdb.firebaseio.com/" // 🔥 إضافة الرابط فقط لتوحيد الإعدادات
};

// Initialize Firebase app for edge runtime
let app = null;
let db = null;

export function getFirebaseEdge() {
  if (!app) {
    app = initializeApp(firebaseConfig);
  }
  if (!db) {
    db = getFirestore(app);
    
    // Connect to emulator in development if needed
    if (typeof window === 'undefined' && process.env.NODE_ENV === 'development') {
      try {
        connectFirestoreEmulator(db, 'localhost', 8080);
      } catch (e) {
        // Emulator already connected or not available
        console.log('Firestore emulator not available:', e.message);
      }
    }
  }
  
  return { app, db };
}

// Export getter function for Edge I/O compliance
export const getEdgeDb = () => {
  return getFirebaseEdge().db;
};