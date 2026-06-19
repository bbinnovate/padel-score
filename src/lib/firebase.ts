import { initializeApp, getApps } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirestore, initializeFirestore, persistentLocalCache } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// persistentLocalCache uses IndexedDB — browser only. Fall back to default on server (SSR).
let db: ReturnType<typeof getFirestore>;
try {
  db =
    typeof window !== "undefined"
      ? initializeFirestore(app, { localCache: persistentLocalCache() })
      : getFirestore(app);
} catch {
  // initializeFirestore throws if called twice (HMR / hot reload) — reuse existing instance
  db = getFirestore(app);
}

// Analytics is browser-only — guard with isSupported()
const analyticsPromise = isSupported().then((yes) => (yes ? getAnalytics(app) : null));

export { app, db, analyticsPromise };
