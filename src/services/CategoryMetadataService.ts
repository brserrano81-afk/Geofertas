import { collection, getDocs } from 'firebase/firestore';

import { db } from '../firebase';

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

        const snap = await getDocs(collection(db, 'categories'));
        this.cache = snap.docs
            .map((docSnap) => ({
                id: docSnap.id,
                ...(docSnap.data() as Omit<CategoryMetadata, 'id'>),
            }))
            .sort((a, b) => (a.ordem || 999) - (b.ordem || 999));
        this.loadedAt = now;
        return this.cache;
    }

    async getMap(): Promise<Map<string, CategoryMetadata>> {
        const categories = await this.load();
        return new Map(categories.map((category) => [category.id, category]));
    }
}

export const categoryMetadataService = new CategoryMetadataService();
