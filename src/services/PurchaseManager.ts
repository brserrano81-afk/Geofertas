import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { analyticsEventWriter, slugifyMarketName } from '../workers/AnalyticsEventWriter';
import { normalizeCatalogText, CATEGORY_ALIASES } from './ProductCatalogService';

function formatCurrency(value: number): string {
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

/**
 * Infere a categoria dominante do carrinho por votação de aliases.
 * Retorna slug ou string vazia quando indefinido.
 * Nunca lança exceção.
 */
function inferDominantCategory(items: Array<{ name: string }>): string {
    try {
        const votes: Record<string, number> = {};
        for (const item of items) {
            const norm = normalizeCatalogText(item.name || '');
            for (const [slug, aliases] of Object.entries(CATEGORY_ALIASES)) {
                if (aliases.some((alias) => norm.includes(alias))) {
                    votes[slug] = (votes[slug] || 0) + 1;
                    break;
                }
            }
        }
        const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
        return sorted[0]?.[0] || '';
    } catch {
        return '';
    }
}

class PurchaseManager {
    private readonly userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    formatReceiptConference(
        receiptData: any,
        matchResult: { matched: Array<{ name: string; price: number }>; impulse: Array<{ name: string; price: number }> },
    ) {
        const matchedTotal = matchResult.matched.reduce((sum, item) => sum + Number(item.price || 0), 0);
        const impulseTotal = matchResult.impulse.reduce((sum, item) => sum + Number(item.price || 0), 0);
        const outsideLines = matchResult.impulse
            .slice(0, 5)
            .map((item) => `• ${item.name} - ${formatCurrency(Number(item.price || 0))}`);

        const text =
            `🧾 Analisei seu cupom - ${receiptData.marketName || 'Mercado'}\n\n` +
            `✅ Da sua lista (${matchResult.matched.length} itens): ${formatCurrency(matchedTotal)}\n` +
            `⚠️ Fora da lista (${matchResult.impulse.length} itens): ${formatCurrency(impulseTotal)}\n\n` +
            (outsideLines.length > 0 ? `Compras fora da lista:\n${outsideLines.join('\n')}\n\n` : '') +
            `Se eu salvar esse cupom, ele entra no seu histórico pessoal e me ajuda a entender seus gastos do mês, sua frequência de compra e o que você costuma levar.\n\n` +
            `Responda OK para salvar ou CANCELAR para descartar.`;

        return { text };
    }

    async saveConfirmedPurchase(receiptData: any, items?: Array<{ name: string; price: number }>) {
        const safeItems = Array.isArray(items) && items.length > 0
            ? items
            : Array.isArray(receiptData.items) ? receiptData.items : [];

        const totalAmount = Number(
            receiptData.total ||
            receiptData.totalAmount ||
            safeItems.reduce((sum: number, item: any) => sum + Number(item.price || 0), 0) ||
            0,
        );

        await addDoc(collection(db, 'users', this.userId, 'purchases'), {
            marketName: receiptData.marketName || 'Mercado',
            items: safeItems,
            totalAmount,
            savedAt: new Date().toISOString(),
            createdAt: serverTimestamp(),
            source: receiptData.type || 'receipt',
            confidence: Number(receiptData.confidence || 0) || null,
        });

        // ── Analytics anônimo (fire-and-forget, sem PII) ─────────────────────
        const marketId = receiptData.marketId || slugifyMarketName(receiptData.marketName || 'desconhecido');
        const categorySlug = inferDominantCategory(safeItems);

        analyticsEventWriter.writeEvent({
            eventType: 'purchase_recorded',
            marketId,
            categorySlug,
            basketSize: safeItems.length,
            totalAmount,
        }).catch(() => { /* já logado internamente */ });

        analyticsEventWriter.updateUserAggregate(this.userId, {
            purchaseAmount: totalAmount,
            basketSize: safeItems.length,
            categorySlug,
            marketId,
        }).catch(() => { /* já logado internamente */ });
        // ─────────────────────────────────────────────────────────────────────

        return {
            text:
                `✅ Cupom salvo no seu histórico!\n\n` +
                `Total registrado: ${formatCurrency(totalAmount)}\n\n` +
                `Vou usar isso para acompanhar seus gastos do mês, entender sua frequência de compra e melhorar suas próximas recomendações.\n\n` +
                `Sempre que quiser, pode me mandar outro cupom. 💚`,
        };
    }
}

export { PurchaseManager };
