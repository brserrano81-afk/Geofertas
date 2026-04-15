import { collection, getDocs } from 'firebase/firestore';
import { db as clientDb } from '../firebase';
import { isServer } from '../lib/isServer';
import { adminDb as serverDb } from '../lib/firebase-admin';

const db = isServer ? (serverDb as any) : clientDb;

interface PlannedPurchase {
    product: string;
    daysRemaining: number;
    urgent: boolean;
    currentPrice: number | null;
    marketName: string | null;
}

export interface PredictivePlan {
    averageMonthlySpend: number;
    estimatedBasketTotal: number;
    plannedPurchases: PlannedPurchase[];
}

function normalize(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function titleCase(value: string): string {
    return String(value || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

class PredictiveShoppingService {
    async buildMonthlyPlan(userId: string): Promise<PredictivePlan> {
        const [purchases, offers] = await Promise.all([
            this.getPurchases(userId),
            this.getActiveOffers(),
        ]);

        const productCycles = new Map<string, Date[]>();
        const monthlySpend = new Map<string, number>();
        const now = new Date();

        for (const purchase of purchases) {
            const purchaseDate = new Date(purchase.date || purchase.savedAt || Date.now());
            const monthKey = `${purchaseDate.getFullYear()}-${String(purchaseDate.getMonth() + 1).padStart(2, '0')}`;
            monthlySpend.set(monthKey, (monthlySpend.get(monthKey) || 0) + Number(purchase.totalAmount || 0));

            const items = Array.isArray(purchase.items) ? purchase.items : [];
            for (const item of items) {
                const product = normalize(String(item.name || item.productName || item.description || ''));
                if (!product) continue;

                if (!productCycles.has(product)) {
                    productCycles.set(product, []);
                }
                productCycles.get(product)!.push(purchaseDate);
            }
        }

        const plannedPurchases = Array.from(productCycles.entries())
            .map(([product, dates]) => this.buildPlannedPurchase(product, dates, offers, now))
            .filter((item): item is PlannedPurchase => item !== null)
            .sort((a, b) => a.daysRemaining - b.daysRemaining)
            .slice(0, 10);

        const estimatedBasketTotal = plannedPurchases.reduce((sum: number, item: PlannedPurchase) => sum + (item.currentPrice || 0), 0);
        const averageMonthlySpend = monthlySpend.size > 0
            ? Number((Array.from(monthlySpend.values()).reduce((sum: number, value: number) => sum + value, 0) / monthlySpend.size).toFixed(2))
            : 0;

        return {
            averageMonthlySpend,
            estimatedBasketTotal: Number(estimatedBasketTotal.toFixed(2)),
            plannedPurchases,
        };
    }

    formatMonthlyPlan(plan: PredictivePlan): string {
        if (plan.plannedPurchases.length === 0) {
            return 'Ainda não tenho histórico suficiente para planejar seu mês. Me manda mais cupons e eu vou aprendendo com você.';
        }

        const lines = plan.plannedPurchases.slice(0, 5).map((item) => {
            const urgency = item.daysRemaining <= 0
                ? '🔴'
                : item.daysRemaining <= 3
                    ? '🟡'
                    : '🟢';
            const timing = item.daysRemaining <= 0
                ? 'acabou hoje'
                : item.daysRemaining === 1
                    ? 'acaba amanhã'
                    : `acaba em ${item.daysRemaining} dias`;
            return `${urgency} ${titleCase(item.product)} — ${timing}`;
        });

        return `📅 Planejamento do mês\n\nCom base no seu histórico:\n\n${lines.join('\n')}\n\n💰 Estimativa do mês: R$ ${plan.averageMonthlySpend.toFixed(2).replace('.', ',')}\n\nQuer que eu monte a lista? 🛒`;
    }

    private buildPlannedPurchase(product: string, dates: Date[], offers: any[], now: Date): PlannedPurchase | null {
        if (dates.length < 2) return null;

        const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());
        const intervals: number[] = [];
        for (let index = 1; index < sortedDates.length; index++) {
            const days = (sortedDates[index].getTime() - sortedDates[index - 1].getTime()) / (1000 * 60 * 60 * 24);
            if (days > 0) intervals.push(days);
        }

        if (intervals.length === 0) return null;

        const averageCycle = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
        const daysSinceLastPurchase = (now.getTime() - sortedDates[sortedDates.length - 1].getTime()) / (1000 * 60 * 60 * 24);
        const daysRemaining = Math.max(0, Math.round(averageCycle - daysSinceLastPurchase));
        if (daysRemaining > 10) return null;

        const matchingOffers = offers.filter((offer) => {
            const name = normalize(String(offer.productName || offer.name || ''));
            return name.includes(product) || product.includes(name);
        });

        matchingOffers.sort((a, b) => Number(a.price || a.promoPrice || 0) - Number(b.price || b.promoPrice || 0));
        const bestOffer = matchingOffers[0];

        return {
            product,
            daysRemaining,
            urgent: daysRemaining <= 1,
            currentPrice: bestOffer ? Number(bestOffer.price || bestOffer.promoPrice || 0) : null,
            marketName: bestOffer ? String(bestOffer.marketName || bestOffer.networkName || '') : null,
        };
    }

    private async getPurchases(userId: string): Promise<any[]> {
        try {
            if (isServer) {
                const snap = await (db as any).collection('users').doc(userId).collection('purchases').get();
                return snap.docs.map((docSnap: any) => docSnap.data());
            }
            const purchasesRef = collection(db, 'users', userId, 'purchases');
            const snap = await getDocs(purchasesRef);
            return snap.docs.map((docSnap: any) => docSnap.data());
        } catch (err) {
            console.error('[PredictiveShoppingService] Error loading purchases:', err);
            return [];
        }
    }

    private async getActiveOffers(): Promise<any[]> {
        try {
            let docs: any[] = [];
            if (isServer) {
                const snap = await (db as any).collection('offers').get();
                docs = snap.docs.map((docSnap: any) => docSnap.data());
            } else {
                const offersRef = collection(db, 'offers');
                const snap = await getDocs(offersRef);
                docs = snap.docs.map((docSnap: any) => docSnap.data());
            }
            const nowIso = new Date().toISOString();
            return docs.filter((offer) => !offer.expiresAt || offer.expiresAt >= nowIso);
        } catch (err) {
            console.error('[PredictiveShoppingService] Error loading offers:', err);
            return [];
        }
    }
}

export const predictiveShoppingService = new PredictiveShoppingService();
