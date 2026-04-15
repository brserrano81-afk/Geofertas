// OfferQueueService - Gestao da fila de contribuicoes colaborativas
// Fluxo: cliente envia foto de oferta -> IA extrai -> salva em `offer_queue` (status: pending)
//        admin revisa -> aprova (move para `offers`) ou rejeita (status: rejected)

import {
    addDoc,
    collection,
    doc,
    getDocs,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from 'firebase/firestore';
import { db } from '../../firebase';

export type OfferQueueStatus = 'pending' | 'approved' | 'rejected';

export interface OfferQueueItem {
    id: string;
    productName: string;
    marketName: string;
    price: number;
    unit?: string;
    brand?: string;
    category?: string;
    // Enriquecimento semântico — preenchido automaticamente na ingestão
    normalizedName?: string;       // Nome canônico do catálogo (se matched)
    catalogProductId?: string;     // ID do produto no catálogo (se matched)
    semanticScore?: number;        // Confiança do match semântico (0–1)
    expiresAt?: string;
    submittedBy: string;
    submittedAt: string;
    imageSource: 'tabloid' | 'price_tag' | 'receipt' | 'unknown';
    rawExtracted?: Record<string, unknown>;
    status: OfferQueueStatus;
    reviewedBy?: string;
    reviewedAt?: string;
    rejectionReason?: string;
    publishedOfferId?: string;
}

export type OfferQueueInput = Omit<OfferQueueItem, 'id'>;

class OfferQueueService {
    async enqueue(items: Omit<OfferQueueInput, 'status' | 'submittedAt'>[]): Promise<string[]> {
        const ids: string[] = [];
        const now = new Date().toISOString();

        for (const item of items) {
            const ref = await addDoc(collection(db, 'offer_queue'), {
                ...item,
                status: 'pending',
                submittedAt: now,
                createdAt: serverTimestamp(),
            });
            ids.push(ref.id);
        }

        console.log(`[OfferQueueService] ${ids.length} contribuicao(oes) colaborativa(s) enfileirada(s).`);
        return ids;
    }

    async listPending(): Promise<OfferQueueItem[]> {
        return this._list('pending');
    }

    async listAll(): Promise<OfferQueueItem[]> {
        const ref = collection(db, 'offer_queue');
        const q = query(ref, orderBy('submittedAt', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<OfferQueueItem, 'id'>) }));
    }

    private async _list(status: OfferQueueStatus): Promise<OfferQueueItem[]> {
        const ref = collection(db, 'offer_queue');
        const q = query(ref, where('status', '==', status), orderBy('submittedAt', 'asc'));
        const snap = await getDocs(q);
        return snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<OfferQueueItem, 'id'>) }));
    }

    async approve(
        itemId: string,
        item: OfferQueueItem,
        reviewedBy: string,
        overrides?: Partial<OfferQueueItem>,
    ): Promise<string> {
        const now = new Date().toISOString();
        const merged = { ...item, ...overrides };
        const expiresAt = merged.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const offerRef = await addDoc(collection(db, 'offers'), {
            productName: merged.productName,
            name: merged.productName,
            marketName: merged.marketName,
            price: merged.price,
            unit: merged.unit || '',
            brand: merged.brand || '',
            category: merged.category || 'outros',
            expiresAt,
            active: true,
            featured: false,
            source: merged.imageSource === 'tabloid' ? 'community_tabloid' : 'community_price_tag',
            submittedBy: merged.submittedBy,
            approvedBy: reviewedBy,
            queueItemId: itemId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        await updateDoc(doc(db, 'offer_queue', itemId), {
            status: 'approved',
            reviewedBy,
            reviewedAt: now,
            publishedOfferId: offerRef.id,
            updatedAt: serverTimestamp(),
        });

        console.log(`[OfferQueueService] Contribuicao ${itemId} aprovada -> offer ${offerRef.id}`);
        return offerRef.id;
    }

    async reject(itemId: string, reviewedBy: string, reason: string = ''): Promise<void> {
        await updateDoc(doc(db, 'offer_queue', itemId), {
            status: 'rejected',
            reviewedBy,
            reviewedAt: new Date().toISOString(),
            rejectionReason: reason,
            updatedAt: serverTimestamp(),
        });
        console.log(`[OfferQueueService] Contribuicao ${itemId} rejeitada por ${reviewedBy}.`);
    }
}

export const offerQueueService = new OfferQueueService();
