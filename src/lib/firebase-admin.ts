import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Assuming this file is in src/lib/firebase-admin.ts
const ROOT_DIR = path.resolve(__dirname, '../../');

function getServiceAccount() {
    // 1. Tenta carregar do ambiente (JSON string) - Comum no Railway
    const envJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (envJson) {
        try {
            return JSON.parse(envJson);
        } catch (err) {
            console.error('[firebase-admin] Falha ao ler FIREBASE_SERVICE_ACCOUNT do ambiente');
        }
    }

    // 2. Tenta carregar do arquivo local
    const saPath = path.join(ROOT_DIR, 'service-account.json');
    if (fs.existsSync(saPath)) {
        try {
            return JSON.parse(fs.readFileSync(saPath, 'utf8'));
        } catch (err) {
            console.error('[firebase-admin] Falha ao ler service-account.json local');
        }
    }

    return undefined;
}

if (!admin.apps.length) {
    const sa = getServiceAccount();
    const config: any = {};
    
    if (sa) {
        config.credential = admin.credential.cert(sa);
        // Tenta inferir o bucket padrão do Firebase
        config.storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${sa.project_id}.appspot.com`;
    } else {
        config.credential = admin.credential.applicationDefault();
        config.storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
    }

    admin.initializeApp(config);
    console.log(`[firebase-admin] Inicializado. Bucket: ${config.storageBucket || 'não definido'}`);
}

export const adminDb = admin.firestore();

// Exporta o bucket de forma segura (pode ser útil no worker de áudio futuramente)
export const getBucket = () => {
    try {
        return admin.storage().bucket();
    } catch (err) {
        console.warn('[firebase-admin] Storage Bucket não configurado corretamente.');
        return null;
    }
};

export { admin };
