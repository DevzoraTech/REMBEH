import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getMessaging, isSupported, type Messaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyB69EaN5m3CWK1VtF-3zMey-lVDuSfJ6GY",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "rembeh-web.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "rembeh-web",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ??
    "rembeh-web.firebasestorage.app",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "110942121490",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ??
    "1:110942121490:web:80fddd27aafd357a62b2cb",
};

export function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }
  return initializeApp(firebaseConfig);
}

export async function getFirebaseMessaging(): Promise<Messaging | null> {
  if (typeof window === "undefined") {
    return null;
  }
  const supported = await isSupported().catch(() => false);
  if (!supported) {
    return null;
  }
  return getMessaging(getFirebaseApp());
}

export const firebaseWebPublicConfig = firebaseConfig;
