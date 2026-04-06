import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore/lite";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth"; // 1. أضفنا استيراد مكتبة الحماية

const firebaseConfig = {
  apiKey: "AIzaSyBIIdkBPaQFHhPLo7Gob7sA1LacaT3E2JE",
  authDomain: "wind-reviews.firebaseapp.com",
  projectId: "wind-reviews",
  storageBucket: "wind-reviews.firebasestorage.app",
  messagingSenderId: "596996130193",
  appId: "1:596996130193:web:186c91269249c6c5eb8630"
};

// منع إعادة تشغيل Firebase
let app = null;
let db = null;
let storage = null;
let authInstance = null;

function getAppInstance() {
  if (!app) {
    app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

// Export getter functions for Edge I/O compliance
export const getDb = () => {
  if (!db) {
    db = getFirestore(getAppInstance());
  }
  return db;
};

export const getStorageInstance = () => {
  if (!storage) {
    storage = getStorage(getAppInstance());
  }
  return storage;
};

export const getAuthInstance = () => {
  if (!authInstance) {
    authInstance = getAuth(getAppInstance());
  }
  return authInstance;
};