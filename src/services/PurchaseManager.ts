import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

function formatCurrency(value: number): string {
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
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
