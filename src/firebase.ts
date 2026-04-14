import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const fallbackFirebaseConfig = {
    apiKey: 'AIzaSyDVW8oK9luHCFZhRl28XjcoZlDgeVA2y0Y',
    authDomain: 'geofertas-325b0.firebaseapp.com',
    projectId: 'geofertas-325b0',
    storageBucket: 'geofertas-325b0.firebasestorage.app',
    messagingSenderId: '333137067503',
    appId: '1:333137067503:web:f2ad402d55e33a0c60ca1a',
};

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

function resolveFirebaseConfig() {
    const firebaseConfig = {
        apiKey: readEnv('VITE_FIREBASE_API_KEY') || readEnv('FIREBASE_API_KEY') || fallbackFirebaseConfig.apiKey,
        authDomain: readEnv('VITE_FIREBASE_AUTH_DOMAIN') || readEnv('FIREBASE_AUTH_DOMAIN') || fallbackFirebaseConfig.authDomain,
        projectId: readEnv('VITE_FIREBASE_PROJECT_ID') || readEnv('FIREBASE_PROJECT_ID') || fallbackFirebaseConfig.projectId,
        storageBucket: readEnv('VITE_FIREBASE_STORAGE_BUCKET') || readEnv('FIREBASE_STORAGE_BUCKET') || fallbackFirebaseConfig.storageBucket,
        messagingSenderId:
            readEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') ||
            readEnv('FIREBASE_MESSAGING_SENDER_ID') ||
            fallbackFirebaseConfig.messagingSenderId,
        appId: readEnv('VITE_FIREBASE_APP_ID') || readEnv('FIREBASE_APP_ID') || fallbackFirebaseConfig.appId,
    };

    const envMissing = [
        'VITE_FIREBASE_API_KEY',
        'VITE_FIREBASE_AUTH_DOMAIN',
        'VITE_FIREBASE_PROJECT_ID',
        'VITE_FIREBASE_STORAGE_BUCKET',
        'VITE_FIREBASE_MESSAGING_SENDER_ID',
        'VITE_FIREBASE_APP_ID',
    ].filter((name) => !readEnv(name));

    if (envMissing.length > 0 && typeof console !== 'undefined') {
        console.warn(
            `[firebase] Missing Vercel env vars (${envMissing.join(', ')}). Using fallback web config to keep the app booting.`,
        );
    }

    return firebaseConfig;
}

const app = initializeApp(resolveFirebaseConfig());

export const db = getFirestore(app);
