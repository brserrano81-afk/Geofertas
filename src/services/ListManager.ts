import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp as clientTimestamp, updateDoc, where } from 'firebase/firestore';
import { db as clientDb } from '../firebase';
import { isServer } from '../lib/isServer';
import { adminDb as serverDb, admin } from '../lib/firebase-admin';

const serverTimestamp = isServer ? admin.firestore.FieldValue.serverTimestamp : clientTimestamp;
const db = isServer ? (serverDb as any) : clientDb;

import { offerEngine } from './OfferEngine';
import type { ActiveShoppingList, ShoppingListItem } from '../types/shopping';
import { analyticsEventWriter, inferDominantCategory } from '../workers/AnalyticsEventWriter';

function toSortableTimestamp(value: unknown): number {
    if (!value) return 0;
    if (typeof value === 'object' && value !== null && 'toMillis' in (value as { toMillis?: unknown })) {
        const toMillis = (value as { toMillis: () => number }).toMillis;
        if (typeof toMillis === 'function') {
            return toMillis();
        }
    }

    if (value instanceof Date) {
        return value.getTime();
    }

    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? 0 : parsed;
    }

    return 0;
}

function formatList(items: ShoppingListItem[]): string {
    if (items.length === 0) {
        return 'Sua lista está vazia.\n';
    }

    const lines = items.map((item, index) => `${index + 1}. ${item.name}`);
    return `🛒 Sua lista (${items.length} itens):\n\n${lines.join('\n')}\n\n`;
}

class ListManager {
    private readonly userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    async loadActiveList(): Promise<ShoppingListItem[]> {
        const active = await this.getActiveListDoc();
        return active?.items || [];
    }

    async loadStructuredActiveList(): Promise<ActiveShoppingList | null> {
        const active = await this.getActiveListDoc();
        if (!active) return null;

        return {
            id: active.id,
            userId: this.userId,
            status: active.status,
            items: active.items,
            createdAt: active.createdAt,
            updatedAt: active.updatedAt,
            completedAt: active.completedAt,
        };
    }

    async persistList(items: ShoppingListItem[]): Promise<void> {
        const categorySlug = inferDominantCategory(items);

        const active = await this.getActiveListDoc();

        if (isServer) {
            if (active) {
                await db.collection('users').doc(this.userId).collection('lists').doc(active.id).update({
                    items,
                    status: 'active',
                    updatedAt: serverTimestamp(),
                });
            } else {
                await db.collection('users').doc(this.userId).collection('lists').add({
                    items,
                    status: 'active',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            }
        } else {
            if (active) {
                await updateDoc(active.ref, {
                    items,
                    status: 'active',
                    updatedAt: serverTimestamp(),
                });
            } else {
                await addDoc(collection(db, 'users', this.userId, 'lists'), {
                    items,
                    status: 'active',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
            }
        }

        // Analytics: (fire-and-forget, sem PII)
        const eventType = active ? 'list_updated' : 'list_created';
        analyticsEventWriter.writeEvent({
            eventType,
            categorySlug,
            basketSize: items.length,
        }).catch(() => { /* já logado internamente */ });
        return;
    }

    async recoverActiveListItemsOnly(): Promise<{ text: string; items: ShoppingListItem[] }> {
        const items = await this.loadActiveList();
        return {
            text: formatList(items),
            items,
        };
    }

    async archiveActiveList(): Promise<void> {
        const activeDocs = await this.getAllActiveListDocs();
        console.log(`[ListManager] Archiving ${activeDocs.length} active lists for user ${this.userId}`);
        
        for (const active of activeDocs) {
            if (isServer) {
                await db.collection('users').doc(this.userId).collection('lists').doc(active.id).update({
                    status: 'archived',
                    updatedAt: serverTimestamp(),
                });
            } else {
                await updateDoc(active.ref, {
                    status: 'archived',
                    updatedAt: serverTimestamp(),
                });
            }
        }
    }

    async deleteActiveList(): Promise<void> {
        const active = await this.getActiveListDoc();
        if (!active) return;
        if (isServer) {
            await db.collection('users').doc(this.userId).collection('lists').doc(active.id).update({
                status: 'deleted',
                updatedAt: serverTimestamp(),
            });
        } else {
            await updateDoc(active.ref, {
                status: 'deleted',
                updatedAt: serverTimestamp(),
            });
        }
    }

    async finalizeListWithReceipt(): Promise<void> {
        const active = await this.getActiveListDoc();
        if (!active) return;
        if (isServer) {
            await db.collection('users').doc(this.userId).collection('lists').doc(active.id).update({
                status: 'completed',
                completedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        } else {
            await updateDoc(active.ref, {
                status: 'completed',
                completedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        }
    }

    async getLastList(): Promise<{ text: string }> {
        if (isServer) {
            const snap = await db.collection('users').doc(this.userId).collection('lists')
                .orderBy('updatedAt', 'desc')
                .limit(1)
                .get();
            if (snap.empty) {
                return { text: 'Ainda não encontrei nenhuma lista anterior sua.' };
            }
            const items = (snap.docs[0].data().items || []) as ShoppingListItem[];
            return { text: `📋 Última lista salva\n\n${formatList(items)}` };
        }

        const listsRef = collection(db, 'users', this.userId, 'lists');
        const snap = await getDocs(query(listsRef, orderBy('updatedAt', 'desc'), limit(1)));
        if (snap.empty) {
            return { text: 'Ainda não encontrei nenhuma lista anterior sua.' };
        }

        const items = (snap.docs[0].data().items || []) as ShoppingListItem[];
        return { text: `📋 Última lista salva\n\n${formatList(items)}` };
    }

    getShareText(items: ShoppingListItem[]): string {
        const lines = items.map((item, index) => `${index + 1}. ${item.name}`);
        return `🛒 Lista de compras\n\n${lines.join('\n')}`;
    }

    async generateComparativeTemplate(): Promise<{ text: string; topMarketName: string }> {
        const items = await this.loadActiveList();
        if (items.length === 0) {
            return { text: 'Sua lista está vazia.', topMarketName: 'Mercado' };
        }

        const categorySlug = inferDominantCategory(items);

        const pricesByItem = await offerEngine.getPricesForItems(items);
        const totals = new Map<string, number>();

        for (const [, offers] of pricesByItem.entries()) {
            for (const offer of offers.slice(0, 3)) {
                totals.set(offer.marketName, (totals.get(offer.marketName) || 0) + offer.totalPrice);
            }
        }

        const ranking = Array.from(totals.entries())
            .sort((a, b) => a[1] - b[1])
            .slice(0, 3);

        if (ranking.length === 0) {
            return { text: 'Ainda não encontrei preços suficientes para comparar sua lista.', topMarketName: 'Mercado' };
        }

        const [topMarketName, topMarketTotal] = ranking[0];
        analyticsEventWriter.writeEvent({
            eventType: 'list_compared',
            marketId: '',
            categorySlug,
            pricePoint: items.length > 0 ? Math.round((topMarketTotal / items.length) * 100) / 100 : 0,
            basketSize: items.length,
            totalAmount: topMarketTotal,
        }).catch(() => { /* já logado internamente */ });

        const lines = ranking.map(([market, total], index) => `${index + 1}️⃣ ${market} — R$ ${total.toFixed(2).replace('.', ',')}`);
        return {
            text: `🛒 Melhor mercado pra sua lista (${items.length} itens)\n\n${lines.join('\n')}`,
            topMarketName,
        };
    }

    private async getAllActiveListDocs(): Promise<any[]> {
        if (isServer) {
            const snap = await db.collection('users').doc(this.userId).collection('lists')
                .where('status', '==', 'active')
                .get();
            return snap.docs.map((d: any) => ({ id: d.id, ref: d.ref, ...d.data() }));
        }
        const listsRef = collection(db, 'users', this.userId, 'lists');
        const q = query(listsRef, where('status', '==', 'active'));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }));
    }

    private async getActiveListDoc(): Promise<{
        id: string;
        ref: any;
        status: string;
        items: ShoppingListItem[];
        createdAt?: unknown;
        updatedAt?: unknown;
        completedAt?: unknown;
    } | null> {
        if (isServer) {
            const snap = await db.collection('users').doc(this.userId).collection('lists')
                .where('status', '==', 'active')
                .limit(5)
                .get();
            if (snap.empty) return null;
            const [latestDoc] = snap.docs.sort((a: any, b: any) => {
                const aUpdatedAt = toSortableTimestamp(a.data().updatedAt);
                const bUpdatedAt = toSortableTimestamp(b.data().updatedAt);
                return bUpdatedAt - aUpdatedAt;
            });
            const data = latestDoc.data();
            return {
                id: latestDoc.id,
                ref: latestDoc.ref,
                status: String(data.status || 'active'),
                items: (data.items || []) as ShoppingListItem[],
                createdAt: data.createdAt,
                updatedAt: data.updatedAt,
                completedAt: data.completedAt,
            };
        }

        const listsRef = collection(db, 'users', this.userId, 'lists');
        const activeQuery = query(listsRef, where('status', '==', 'active'), limit(10));
        const snap = await getDocs(activeQuery);
        if (snap.empty) return null;
        const [latestDoc] = snap.docs.sort((a, b) => {
            const aUpdatedAt = toSortableTimestamp(a.data().updatedAt);
            const bUpdatedAt = toSortableTimestamp(b.data().updatedAt);
            return bUpdatedAt - aUpdatedAt;
        });
        const data = latestDoc.data();
        return {
            id: latestDoc.id,
            ref: latestDoc.ref,
            status: String(data.status || 'active'),
            items: (data.items || []) as ShoppingListItem[],
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            completedAt: data.completedAt,
        };
    }
}

export { ListManager };
