import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { offerEngine } from './OfferEngine';
import type { ActiveShoppingList, ShoppingListItem } from '../types/shopping';

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
        const active = await this.getActiveListDoc();
        if (active) {
            await updateDoc(active.ref, {
                items,
                status: 'active',
                updatedAt: serverTimestamp(),
            });
            return;
        }

        await addDoc(collection(db, 'users', this.userId, 'lists'), {
            items,
            status: 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }

    async recoverActiveListItemsOnly(): Promise<{ text: string; items: ShoppingListItem[] }> {
        const items = await this.loadActiveList();
        return {
            text: formatList(items),
            items,
        };
    }

    async archiveActiveList(): Promise<void> {
        const active = await this.getActiveListDoc();
        if (!active) return;
        await updateDoc(active.ref, {
            status: 'archived',
            updatedAt: serverTimestamp(),
        });
    }

    async deleteActiveList(): Promise<void> {
        const active = await this.getActiveListDoc();
        if (!active) return;
        await updateDoc(active.ref, {
            status: 'deleted',
            updatedAt: serverTimestamp(),
        });
    }

    async finalizeListWithReceipt(): Promise<void> {
        const active = await this.getActiveListDoc();
        if (!active) return;
        await updateDoc(active.ref, {
            status: 'completed',
            completedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }

    async getLastList(): Promise<{ text: string }> {
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

        const lines = ranking.map(([market, total], index) => `${index + 1}️⃣ ${market} — R$ ${total.toFixed(2).replace('.', ',')}`);
        return {
            text: `🛒 Melhor mercado pra sua lista (${items.length} itens)\n\n${lines.join('\n')}`,
            topMarketName: ranking[0][0],
        };
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
        const listsRef = collection(db, 'users', this.userId, 'lists');
        const activeQuery = query(listsRef, where('status', '==', 'active'), orderBy('updatedAt', 'desc'), limit(1));
        const snap = await getDocs(activeQuery);
        if (snap.empty) return null;
        const data = snap.docs[0].data();
        return {
            id: snap.docs[0].id,
            ref: snap.docs[0].ref,
            status: String(data.status || 'active'),
            items: (data.items || []) as ShoppingListItem[],
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            completedAt: data.completedAt,
        };
    }
}

export { ListManager };
