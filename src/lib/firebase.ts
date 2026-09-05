import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// DEBUG: Validate critical fields are present
if (!firebaseConfig.projectId) {
  console.error("VITE_FIREBASE_PROJECT_ID is missing");
}

if (!firebaseConfig.apiKey) {
  console.error("VITE_FIREBASE_API_KEY is missing");
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// Use auto-detect long-polling to prevent ERR_QUIC_PROTOCOL_ERROR and network drops
let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    experimentalAutoDetectLongPolling: true,
  });
} catch (e) {
  dbInstance = getFirestore(app);
}

export const db = dbInstance;
console.log("DB instance", db);
export const storage = getStorage(app);
