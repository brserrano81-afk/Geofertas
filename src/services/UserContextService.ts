import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase';
import { userPreferencesService } from './UserPreferencesService';

interface PredictedNeed {
    product: string;
    daysRemaining: number;
    urgent: boolean;
}

export interface RichUserContext {
    summary: string;
    favoriteMarkets: string[];
    frequentProducts: string[];
    predictedNeeds: PredictedNeed[];
    averageMonthlySpend: number;
    activeList: string[];
    recentInteractionSnippets: string[];
}

function normalizeProductName(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

class UserContextService {
    async buildRichContext(userId: string, userName?: string): Promise<RichUserContext> {
        const [purchases, activeList, preferences, recentInteractions] = await Promise.all([
            this.getPurchases(userId),
            this.getActiveList(userId),
            userPreferencesService.getPreferences(userId),
            this.getRecentInteractions(userId),
        ]);

        const productFrequency = new Map<string, number>();
        const marketFrequency = new Map<string, number>();
        const monthlySpend = new Map<string, number>();
        const productCycles = new Map<string, Date[]>();
        const now = new Date();

        for (const purchase of purchases) {
            const purchaseDate = new Date(purchase.date || purchase.savedAt || Date.now());
            const monthKey = `${purchaseDate.getFullYear()}-${String(purchaseDate.getMonth() + 1).padStart(2, '0')}`;
            monthlySpend.set(monthKey, (monthlySpend.get(monthKey) || 0) + Number(purchase.totalAmount || 0));

            const marketName = String(purchase.marketName || '').trim();
            if (marketName) {
                marketFrequency.set(marketName, (marketFrequency.get(marketName) || 0) + 1);
            }

            const items = Array.isArray(purchase.items) ? purchase.items : [];
            for (const item of items) {
                const rawName = String(item.name || item.productName || item.description || '').trim();
                if (!rawName) continue;

                const normalizedName = normalizeProductName(rawName);
                productFrequency.set(normalizedName, (productFrequency.get(normalizedName) || 0) + 1);

                if (!productCycles.has(normalizedName)) {
                    productCycles.set(normalizedName, []);
                }
                productCycles.get(normalizedName)!.push(purchaseDate);
            }
        }

        const frequentProducts = Array.from(productFrequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([product]) => product);

        const favoriteMarkets = Array.from(marketFrequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([market]) => market);

        const averageMonthlySpend = monthlySpend.size > 0
            ? Number((Array.from(monthlySpend.values()).reduce((sum, value) => sum + value, 0) / monthlySpend.size).toFixed(2))
            : 0;

        const predictedNeeds = Array.from(productCycles.entries())
            .map(([product, dates]) => this.predictNeed(product, dates, now))
            .filter((item): item is PredictedNeed => item !== null)
            .sort((a, b) => a.daysRemaining - b.daysRemaining)
            .slice(0, 8);

        const recentInteractionSnippets = recentInteractions
            .slice(-5)
            .map((interaction) => `${interaction.role}: ${String(interaction.content || '').slice(0, 80)}`);

        const activeListNames = activeList.map((item: any) => String(item.name || item.product || '').trim()).filter(Boolean);

        const summary = [
            `USUARIO: ${userName || preferences.name || 'Cliente'}`,
            `TRANSPORTE: ${preferences.transportMode || 'carro'} | CONSUMO: ${preferences.consumption || 10} km/l | PASSAGEM: R$ ${Number(preferences.busTicket || 4.5).toFixed(2)}`,
            `PREFERENCIA: ${preferences.optimizationPreference || 'equilibrar'}`,
            `MERCADOS FAVORITOS: ${favoriteMarkets.join(', ') || 'sem historico'}`,
            `PRODUTOS FREQUENTES: ${frequentProducts.join(', ') || 'sem historico'}`,
            `PRODUTOS PERTO DE ACABAR: ${predictedNeeds.map((item) => `${item.product} (${item.daysRemaining}d)`).join(', ') || 'nenhum'}`,
            `LISTA ATIVA: ${activeListNames.join(', ') || 'vazia'}`,
            `GASTO MEDIO MENSAL: R$ ${averageMonthlySpend.toFixed(2)}`,
            `ULTIMAS INTERACOES: ${recentInteractionSnippets.join(' | ') || 'primeiro contato'}`,
        ].join('\n');

        return {
            summary,
            favoriteMarkets,
            frequentProducts,
            predictedNeeds,
            averageMonthlySpend,
            activeList: activeListNames,
            recentInteractionSnippets,
        };
    }

    private async getPurchases(userId: string): Promise<any[]> {
        try {
            const purchasesRef = collection(db, 'users', userId, 'purchases');
            const snap = await getDocs(purchasesRef);
            return snap.docs.map((docSnap) => docSnap.data());
        } catch (err) {
            console.error('[UserContextService] Error loading purchases:', err);
            return [];
        }
    }

    private async getActiveList(userId: string): Promise<any[]> {
        try {
            const listsRef = collection(db, 'users', userId, 'lists');
            const listsQuery = query(listsRef, orderBy('updatedAt', 'desc'), limit(1));
            const snap = await getDocs(listsQuery);
            if (snap.empty) return [];
            return snap.docs[0].data().items || [];
        } catch (err) {
            console.error('[UserContextService] Error loading active list:', err);
            return [];
        }
    }

    private async getRecentInteractions(userId: string): Promise<any[]> {
        try {
            const interactionsRef = collection(db, 'users', userId, 'interactions');
            const interactionsQuery = query(interactionsRef, orderBy('createdAt', 'desc'), limit(8));
            const snap = await getDocs(interactionsQuery);
            return snap.docs.map((docSnap) => docSnap.data()).reverse();
        } catch (err) {
            console.error('[UserContextService] Error loading interactions:', err);
            return [];
        }
    }

    private predictNeed(product: string, dates: Date[], now: Date): PredictedNeed | null {
        if (dates.length < 2) return null;

        const sortedDates = [...dates].sort((a, b) => a.getTime() - b.getTime());
        const intervals: number[] = [];

        for (let index = 1; index < sortedDates.length; index++) {
            const days = (sortedDates[index].getTime() - sortedDates[index - 1].getTime()) / (1000 * 60 * 60 * 24);
            if (days > 0) {
                intervals.push(days);
            }
        }

        if (intervals.length === 0) return null;

        const averageCycle = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
        const daysSinceLastPurchase = (now.getTime() - sortedDates[sortedDates.length - 1].getTime()) / (1000 * 60 * 60 * 24);
        const daysRemaining = Math.max(0, Math.round(averageCycle - daysSinceLastPurchase));

        if (daysRemaining > 7) return null;

        return {
            product,
            daysRemaining,
            urgent: daysRemaining <= 1,
        };
    }
}

export const userContextService = new UserContextService();
