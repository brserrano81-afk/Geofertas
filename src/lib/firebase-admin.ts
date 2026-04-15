import { isServer } from './isServer';

/**
 * Isomorphic Firebase Admin Loader
 * 
 * This file is bundled by Vite for the browser and loaded by Node for the backend.
 * To prevent Vite from bundling Node-only modules (firebase-admin, fs, path, etc.),
 * we use dynamic imports with a variable-based module name that bypasses static analysis.
 */

let admin: any = null;
let adminDb: any = null;

if (isServer) {
    // Hidden dependencies to avoid Vite bundling
    const modulePkg = 'module';
    const firebaseAdminPkg = 'firebase-admin';
    const fsPkg = 'fs';
    const pathPkg = 'path';

    // We use top-level await which is supported in Modern Node and Vite (with target: esnext)
    try {
        const { createRequire } = await import(modulePkg);
        const require = createRequire(import.meta.url);
        
        admin = require(firebaseAdminPkg);
        const fs = require(fsPkg);
        const path = require(pathPkg);

        if (!admin.apps.length) {
            const getServiceAccount = () => {
                const envJson = process.env.FIREBASE_SERVICE_ACCOUNT;
                if (envJson) {
                    try {
                        return JSON.parse(envJson);
                    } catch (err) {
                        console.error('[firebase-admin] Falha ao ler FIREBASE_SERVICE_ACCOUNT do ambiente');
                    }
                }

                const saPath = path.join(process.cwd(), 'service-account.json');
                if (fs.existsSync(saPath)) {
                    try {
                        return JSON.parse(fs.readFileSync(saPath, 'utf8'));
                    } catch (err) {
                        console.error('[firebase-admin] Falha ao ler service-account.json local');
                    }
                }
                return undefined;
            };

            const sa = getServiceAccount();
            const config: any = {};
            
            if (sa) {
                config.credential = admin.credential.cert(sa);
                config.storageBucket = process.env.FIREBASE_STORAGE_BUCKET || `${sa.project_id}.appspot.com`;
            } else {
                config.credential = admin.credential.applicationDefault();
                config.storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
            }

            admin.initializeApp(config);
            console.log(`[firebase-admin] Inicializado corretamente no servidor.`);
        }
        adminDb = admin.firestore();
    } catch (err) {
        console.error('[firebase-admin] Failed to initialize backend services:', err);
    }
}

export { admin, adminDb };

export const getBucket = () => {
    if (!isServer || !admin) return null;
    try {
        return admin.storage().bucket();
    } catch (err) {
        console.warn('[firebase-admin] Storage Bucket não configurado corretamente.');
        return null;
    }
};
