import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

function normalize(value: string): string {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

class PurchaseAnalyticsService {
    private readonly userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    async getFrequentProducts(days: number): Promise<string[]> {
        const purchases = await this.getPurchases();
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const counts = new Map<string, number>();

        for (const purchase of purchases) {
            const purchaseDate = new Date(purchase.savedAt || purchase.date || Date.now()).getTime();
            if (purchaseDate < cutoff) continue;
            for (const item of purchase.items || []) {
                const name = normalize(item.name || item.productName || item.description || '');
                if (!name) continue;
                counts.set(name, (counts.get(name) || 0) + 1);
            }
        }

        return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name]) => name);
    }

    async calculateCategoryAverage(term: string, days: number) {
        const purchases = await this.getPurchases();
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        let total = 0;
        let count = 0;

        for (const purchase of purchases) {
            const purchaseDate = new Date(purchase.savedAt || purchase.date || Date.now()).getTime();
            if (purchaseDate < cutoff) continue;
            for (const item of purchase.items || []) {
                const name = normalize(item.name || item.productName || item.description || '');
                if (name.includes(normalize(term))) {
                    total += Number(item.price || 0);
                    count += 1;
                }
            }
        }

        return { total, count, average: count > 0 ? total / count : 0 };
    }

    formatCategoryAnalysis(summary: { total: number; count: number; average: number }, term: string, days: number): string {
        return `📊 Gastos com **${term}** nos últimos ${days} dias\n\nTotal: **R$ ${summary.total.toFixed(2).replace('.', ',')}**\nItens: **${summary.count}**\nMédia: **R$ ${summary.average.toFixed(2).replace('.', ',')}**`;
    }

    async getTopSpending(days: number) {
        const purchases = await this.getPurchases();
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const totals = new Map<string, number>();

        for (const purchase of purchases) {
            const purchaseDate = new Date(purchase.savedAt || purchase.date || Date.now()).getTime();
            if (purchaseDate < cutoff) continue;
            for (const item of purchase.items || []) {
                const name = normalize(item.name || item.productName || item.description || '');
                if (!name) continue;
                totals.set(name, (totals.get(name) || 0) + Number(item.price || 0));
            }
        }

        return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }

    formatTopSpending(top: Array<[string, number]>, days: number): string {
        if (top.length === 0) {
            return `Ainda não tenho gastos suficientes para analisar os últimos ${days} dias.`;
        }
        const lines = top.map(([name, total]) => `• ${name} — R$ ${total.toFixed(2).replace('.', ',')}`);
        return `📊 Maiores gastos nos últimos ${days} dias\n\n${lines.join('\n')}`;
    }

    async getTotalSpentInPeriod(startDate: string, endDate: string) {
        const purchases = await this.getPurchases();
        const start = new Date(startDate).getTime();
        const end = new Date(endDate).getTime();
        const filtered = purchases.filter((purchase) => {
            const ts = new Date(purchase.savedAt || purchase.date || Date.now()).getTime();
            return ts >= start && ts <= end;
        });
        const total = filtered.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0);
        return { total, count: filtered.length };
    }

    formatPeriodSummary(result: { total: number; count: number }, days: number): string {
        return `📊 Seus gastos nos últimos ${days} dias\n\nTotal: **R$ ${result.total.toFixed(2).replace('.', ',')}**\nCompras registradas: **${result.count}**`;
    }

    async getLastPurchase() {
        const purchases = await this.getPurchases();
        return purchases.sort((a, b) => new Date(b.savedAt || b.date || 0).getTime() - new Date(a.savedAt || a.date || 0).getTime())[0] || null;
    }

    formatLastPurchase(purchase: any): string {
        if (!purchase) {
            return 'Ainda não encontrei nenhuma compra salva.';
        }
        return `🧾 Última compra\n\nMercado: **${purchase.marketName || 'Mercado'}**\nTotal: **R$ ${Number(purchase.totalAmount || 0).toFixed(2).replace('.', ',')}**`;
    }

    async getConsumptionPattern(days: number) {
        const purchases = await this.getPurchases();
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        const recent = purchases.filter((purchase) => new Date(purchase.savedAt || purchase.date || Date.now()).getTime() >= cutoff);
        return {
            purchaseCount: recent.length,
            averageTicket: recent.length > 0 ? recent.reduce((sum, purchase) => sum + Number(purchase.totalAmount || 0), 0) / recent.length : 0,
        };
    }

    formatConsumptionPattern(pattern: { purchaseCount: number; averageTicket: number }, days: number): string {
        return `📈 Seu padrão de consumo (${days} dias)\n\nCompras: **${pattern.purchaseCount}**\nTicket médio: **R$ ${pattern.averageTicket.toFixed(2).replace('.', ',')}**`;
    }

    private async getPurchases(): Promise<any[]> {
        try {
            const purchasesRef = collection(db, 'users', this.userId, 'purchases');
            const snap = await getDocs(purchasesRef);
            return snap.docs.map((docSnap) => docSnap.data());
        } catch (err) {
            console.error('[PurchaseAnalyticsService] Error loading purchases:', err);
            return [];
        }
    }
}

export { PurchaseAnalyticsService };
