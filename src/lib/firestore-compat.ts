import { isServer } from './isServer';
import { adminDb } from './firebase-admin';
import { db as clientDb } from '../firebase';
import * as clientFirestore from 'firebase/firestore';

/**
 * Utilitário de compatibilidade para Firestore (Admin vs Client).
 * Resolve o problema de permissão no Worker ao garantir uso de Admin SDK em Node.
 */
export const db = isServer ? (adminDb as any) : clientDb;

export const compat = {
    doc: (path: string, ...segments: string[]) => {
        if (isServer) {
            return adminDb.doc(`${path}/${segments.join('/')}`);
        }
        return clientFirestore.doc(clientDb, path, ...segments);
    },
    collection: (path: string, ...segments: string[]) => {
        if (isServer) {
            return adminDb.collection(`${path}/${segments.join('/')}`);
        }
        return clientFirestore.collection(clientDb, path, ...segments);
    }
};

export async function getDocument(collectionName: string, docId: string) {
    if (isServer) {
        const snap = await adminDb.collection(collectionName).doc(docId).get();
        return snap.exists ? snap.data() : null;
    }
    const snap = await clientFirestore.getDoc(clientFirestore.doc(clientDb, collectionName, docId));
    return snap.exists() ? snap.data() : null;
}

export async function setDocument(collectionName: string, docId: string, data: any, options = { merge: true }) {
    if (isServer) {
        return adminDb.collection(collectionName).doc(docId).set(data, options);
    }
    return clientFirestore.setDoc(clientFirestore.doc(clientDb, collectionName, docId), data, options);
}

export async function addDocument(collectionName: string, data: any) {
    if (isServer) {
        return adminDb.collection(collectionName).add(data);
    }
    return clientFirestore.addDoc(clientFirestore.collection(clientDb, collectionName), data);
}
