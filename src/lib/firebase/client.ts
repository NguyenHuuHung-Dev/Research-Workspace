import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Object.values(firebaseConfig).every(Boolean);

function app(): FirebaseApp {
  if (!firebaseConfigured) throw new Error("Firebase configuration is missing.");
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export const clientFirebase = {
  auth: (): Auth => getAuth(app()),
  db: (): Firestore => getFirestore(app()),
};
