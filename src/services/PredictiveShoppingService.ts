import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

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

        const estimatedBasketTotal = plannedPurchases.reduce((sum, item) => sum + (item.currentPrice || 0), 0);
        const averageMonthlySpend = monthlySpend.size > 0
            ? Number((Array.from(monthlySpend.values()).reduce((sum, value) => sum + value, 0) / monthlySpend.size).toFixed(2))
            : 0;

        return {
            averageMonthlySpend,
            estimatedBasketTotal: Number(estimatedBasketTotal.toFixed(2)),
            plannedPurchases,
        };
    }

    formatMonthlyPlan(plan: PredictivePlan): string {
        if (plan.plannedPurchases.length === 0) {
            return 'Ainda não tenho histórico suficiente para prever sua próxima compra. Me mande mais cupons e eu vou aprendendo.';
        }

        const lines = plan.plannedPurchases.map((item) => {
            const urgency = item.urgent ? 'URGENTE' : `${item.daysRemaining}d`;
            const price = item.currentPrice !== null ? `R$ ${item.currentPrice.toFixed(2).replace('.', ',')}` : 'sem oferta agora';
            const market = item.marketName ? ` no ${item.marketName}` : '';
            return `• ${item.product} — ${urgency} — ${price}${market}`;
        });

        return `📈 **Planejamento previsto do mês**\n\n${lines.join('\n')}\n\n💰 Estimativa da próxima cesta: **R$ ${plan.estimatedBasketTotal.toFixed(2).replace('.', ',')}**\n📊 Gasto médio mensal: **R$ ${plan.averageMonthlySpend.toFixed(2).replace('.', ',')}**`;
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
        if (daysRemaining > 7) return null;

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
            const purchasesRef = collection(db, 'users', userId, 'purchases');
            const snap = await getDocs(purchasesRef);
            return snap.docs.map((docSnap) => docSnap.data());
        } catch (err) {
            console.error('[PredictiveShoppingService] Error loading purchases:', err);
            return [];
        }
    }

    private async getActiveOffers(): Promise<any[]> {
        try {
            const offersRef = collection(db, 'offers');
            const snap = await getDocs(offersRef);
            const nowIso = new Date().toISOString();
            return snap.docs
                .map((docSnap) => docSnap.data())
                .filter((offer) => !offer.expiresAt || offer.expiresAt >= nowIso);
        } catch (err) {
            console.error('[PredictiveShoppingService] Error loading offers:', err);
            return [];
        }
    }
}

export const predictiveShoppingService = new PredictiveShoppingService();
