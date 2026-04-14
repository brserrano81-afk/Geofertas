// ─────────────────────────────────────────────
// OfferQueueService — Gestão da fila de ofertas pendentes de aprovação
// Fluxo: Cliente envia foto → IA extrai → salva em `offer_queue` (status: pending)
//        Admin revisa → aprova (move para `offers`) ou rejeita (status: rejected)
// ─────────────────────────────────────────────

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
    // Dados extraídos da imagem
    productName: string;
    marketName: string;
    price: number;
    unit?: string;
    brand?: string;
    category?: string;
    expiresAt?: string;
    // Rastreabilidade
    submittedBy: string;       // userId / telefone do remetente
    submittedAt: string;       // ISO timestamp
    imageSource: 'tabloid' | 'price_tag' | 'receipt' | 'unknown';
    rawExtracted?: Record<string, unknown>;  // dump completo do que a IA leu
    // Status de moderação
    status: OfferQueueStatus;
    reviewedBy?: string;       // userId ou 'admin' ou 'master_admin'
    reviewedAt?: string;
    rejectionReason?: string;
    // Quando aprovada
    publishedOfferId?: string; // ID gerado na coleção `offers`
}

export type OfferQueueInput = Omit<OfferQueueItem, 'id'>;

class OfferQueueService {
    // ── ESCRITA ──────────────────────────────────────────────────────

    /** Enfileira itens extraídos de uma imagem para moderação. */
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

        console.log(`[OfferQueueService] ${ids.length} item(s) enfileirados.`);
        return ids;
    }

    // ── LEITURA ──────────────────────────────────────────────────────

    /** Retorna todos os itens pendentes, do mais antigo para o mais novo. */
    async listPending(): Promise<OfferQueueItem[]> {
        return this._list('pending');
    }

    /** Retorna todos os itens (qualquer status) ordenados por submissão desc. */
    async listAll(): Promise<OfferQueueItem[]> {
        const ref = collection(db, 'offer_queue');
        const q = query(ref, orderBy('submittedAt', 'desc'));
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OfferQueueItem, 'id'>) }));
    }

    private async _list(status: OfferQueueStatus): Promise<OfferQueueItem[]> {
        const ref = collection(db, 'offer_queue');
        const q = query(ref, where('status', '==', status), orderBy('submittedAt', 'asc'));
        const snap = await getDocs(q);
        return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OfferQueueItem, 'id'>) }));
    }

    // ── MODERAÇÃO ────────────────────────────────────────────────────

    /**
     * Aprova um item: publica na coleção oficial `offers` e marca como aprovado.
     * Retorna o ID da oferta publicada.
     */
    async approve(
        itemId: string,
        item: OfferQueueItem,
        reviewedBy: string,
        overrides?: Partial<OfferQueueItem>,
    ): Promise<string> {
        const now = new Date().toISOString();
        const merged = { ...item, ...overrides };

        // Calcula validade padrão de 7 dias se não informado
        const expiresAt =
            merged.expiresAt ||
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

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
            source: 'community_photo',
            submittedBy: merged.submittedBy,
            approvedBy: reviewedBy,
            queueItemId: itemId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });

        // Marca item da fila como aprovado
        await updateDoc(doc(db, 'offer_queue', itemId), {
            status: 'approved',
            reviewedBy,
            reviewedAt: now,
            publishedOfferId: offerRef.id,
            updatedAt: serverTimestamp(),
        });

        console.log(`[OfferQueueService] Item ${itemId} aprovado → offer ${offerRef.id}`);
        return offerRef.id;
    }

    /** Rejeita um item da fila com motivo opcional. */
    async reject(itemId: string, reviewedBy: string, reason: string = ''): Promise<void> {
        await updateDoc(doc(db, 'offer_queue', itemId), {
            status: 'rejected',
            reviewedBy,
            reviewedAt: new Date().toISOString(),
            rejectionReason: reason,
            updatedAt: serverTimestamp(),
        });
        console.log(`[OfferQueueService] Item ${itemId} rejeitado por ${reviewedBy}.`);
    }
}

export const offerQueueService = new OfferQueueService();
