import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

class PurchaseManager {
    private readonly userId: string;

    constructor(userId: string) {
        this.userId = userId;
    }

    formatReceiptConference(receiptData: any, matchResult: { matched: Array<{ name: string; price: number }>; impulse: Array<{ name: string; price: number }> }) {
        const matchedTotal = matchResult.matched.reduce((sum, item) => sum + Number(item.price || 0), 0);
        const impulseTotal = matchResult.impulse.reduce((sum, item) => sum + Number(item.price || 0), 0);
        const outsideLines = matchResult.impulse.slice(0, 5).map((item) => `• ${item.name} — R$ ${Number(item.price || 0).toFixed(2).replace('.', ',')}`);

        const text =
            `🧾 ANÁLISE DO SEU CUPOM — ${receiptData.marketName || 'Mercado'}\n\n` +
            `✅ Da sua lista (${matchResult.matched.length} itens): R$ ${matchedTotal.toFixed(2).replace('.', ',')}\n` +
            `⚠️ Fora da lista (${matchResult.impulse.length} itens): R$ ${impulseTotal.toFixed(2).replace('.', ',')}\n\n` +
            (outsideLines.length > 0 ? `Compras fora da lista:\n${outsideLines.join('\n')}\n\n` : '') +
            `Responda **OK** para salvar essa compra ou **CANCELAR** para descartar.`;

        return { text };
    }

    async saveConfirmedPurchase(receiptData: any, items?: Array<{ name: string; price: number }>) {
        const safeItems = Array.isArray(items) && items.length > 0
            ? items
            : Array.isArray(receiptData.items) ? receiptData.items : [];

        const totalAmount = Number(receiptData.total || receiptData.totalAmount || safeItems.reduce((sum: number, item: any) => sum + Number(item.price || 0), 0) || 0);

        await addDoc(collection(db, 'users', this.userId, 'purchases'), {
            marketName: receiptData.marketName || 'Mercado',
            items: safeItems,
            totalAmount,
            savedAt: new Date().toISOString(),
            createdAt: serverTimestamp(),
            source: receiptData.type || 'receipt',
        });

        return {
            text: `✅ Compra salva com sucesso!\n\nTotal registrado: **R$ ${totalAmount.toFixed(2).replace('.', ',')}**`,
        };
    }
}

export { PurchaseManager };
