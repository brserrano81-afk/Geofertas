import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

function readEnv(name: string): string {
    try {
        const viteValue = import.meta.env?.[name as keyof ImportMetaEnv];
        if (typeof viteValue === 'string' && viteValue.trim()) {
            return viteValue.trim();
        }
    } catch {
        // ignore import.meta access outside Vite/browser
    }

    if (typeof process !== 'undefined') {
        const processValue = process.env?.[name];
        if (typeof processValue === 'string' && processValue.trim()) {
            return processValue.trim();
        }
    }

    return '';
}

function requireFirebaseConfig() {
    const firebaseConfig = {
        apiKey: readEnv('VITE_FIREBASE_API_KEY') || readEnv('FIREBASE_API_KEY'),
        authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN') || readEnv('FIREBASE_AUTH_DOMAIN'),
        projectId: readEnv('VITE_FIREBASE_PROJECT_ID') || readEnv('FIREBASE_PROJECT_ID'),
        storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET') || readEnv('FIREBASE_STORAGE_BUCKET'),
        messagingSenderId: readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || readEnv('FIREBASE_MESSAGING_SENDER_ID'),
        appId: readEnv('VITE_FIREBASE_APP_ID') || readEnv('FIREBASE_APP_ID'),
    };

    const missing = Object.entries(firebaseConfig)
        .filter(([, value]) => !value)
        .map(([key]) => key);

    if (missing.length > 0) {
        throw new Error(`[firebase] Missing Firebase env vars: ${missing.join(', ')}`);
    }

    return firebaseConfig;
}

const app = initializeApp(requireFirebaseConfig());

export const db = getFirestore(app);
