import { collection, getDocs } from 'firebase/firestore';
import { db as clientDb } from '../firebase';
import { isServer } from '../lib/isServer';
import { adminDb as serverDb } from '../lib/firebase-admin';
const db = isServer ? (serverDb as any) : clientDb;

export interface CategoryMetadata {
    id: string;
    nome: string;
    icone?: string;
    ordem?: number;
}

class CategoryMetadataService {
    private cache: CategoryMetadata[] | null = null;
    private loadedAt = 0;

    async load(force = false): Promise<CategoryMetadata[]> {
        const now = Date.now();
        if (!force && this.cache && now - this.loadedAt < 10 * 60 * 1000) {
            return this.cache;
        }

        let snap;
        if (isServer) {
            snap = await db.collection('categories').get();
        } else {
            snap = await getDocs(collection(db, 'categories'));
        }
        this.cache = snap.docs
            .map((docSnap: any) => ({
                id: docSnap.id,
                ...(docSnap.data() as Omit<CategoryMetadata, 'id'>),
            }))
            .sort((a: any, b: any) => (a.ordem || 999) - (b.ordem || 999));
        this.loadedAt = now;
        return (this.cache || []) as CategoryMetadata[];
    }

    async getMap(): Promise<Map<string, CategoryMetadata>> {
        const categories = await this.load();
        return new Map(categories.map((category) => [category.id, category]));
    }
}

export const categoryMetadataService = new CategoryMetadataService();
