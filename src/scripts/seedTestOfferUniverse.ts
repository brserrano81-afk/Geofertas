import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore';

import { db } from '../firebase';

type ProductDoc = {
    id: string;
    name?: string;
    brand?: string | null;
    category?: string;
    synonyms?: string[];
    active?: boolean;
};

type MarketDoc = {
    id: string;
    name?: string;
    networkId?: string;
};

const TARGET_MARKET_NAMES = [
    'Assaí Atacadista Goiabeiras',
    'Carone Praia da Costa',
    'Atacadão Camburi',
    'BH Supermercados Camburi',
    'Casagrande Serra',
    'Extrabom Praia de Campista',
    'Assaí Serra',
    'Assaí Atacadista Laranjeiras',
];

const CATEGORY_BASE_PRICE: Record<string, number> = {
    mercearia: 8.9,
    bebidas: 4.9,
    laticinios: 6.9,
    limpeza: 7.9,
    higiene_pessoal: 12.9,
    congelados: 14.9,
    frios_embutidos: 10.9,
    doces_biscoitos: 6.5,
    padaria: 5.2,
    hortifruti: 4.4,
    acougue: 24.9,
    bazar: 15.9,
};

function resolveArgs() {
    const args = process.argv.slice(2);
    return {
        apply: args.includes('--apply'),
        replace: args.includes('--replace'),
    };
}

function slugify(value: string): string {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function hash(value: string): number {
    return Array.from(value).reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) % 100000, 7);
}

function buildSyntheticPrice(product: ProductDoc, market: MarketDoc): number {
    const category = String(product.category || 'mercearia').toLowerCase();
    const base = CATEGORY_BASE_PRICE[category] || 9.9;
    const brandWeight = hash(String(product.brand || product.name || '')) % 250;
    const marketWeight = hash(market.id) % 180;
    const finalPrice = base + (brandWeight / 100) + (marketWeight / 120) + ((hash(product.id + market.id) % 90) / 100);
    return Number(finalPrice.toFixed(2));
}

async function main() {
    const { apply, replace } = resolveArgs();
    const [productsSnap, marketsSnap, existingOffersSnap] = await Promise.all([
        getDocs(collection(db, 'products')),
        getDocs(collection(db, 'markets')),
        getDocs(collection(db, 'offers')),
    ]);

    const products = productsSnap.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<ProductDoc, 'id'>) }))
        .filter((product) => product.active !== false && product.name);

    const markets = marketsSnap.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Omit<MarketDoc, 'id'>) }))
        .filter((market) => TARGET_MARKET_NAMES.includes(String(market.name || '')));

    const existingIds = new Set(
        existingOffersSnap.docs
            .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) }) as Record<string, unknown> & { id: string })
            .filter((offer) => offer.source === 'test_seed')
            .map((offer) => offer.id),
    );

    const writes: Array<{ id: string; payload: Record<string, unknown> }> = [];
    const preview: Array<Record<string, unknown>> = [];

    for (const product of products) {
        for (const market of markets) {
            const offerId = `test_${slugify(market.id)}_${slugify(product.id)}`;
            if (!replace && existingIds.has(offerId)) continue;

            const price = buildSyntheticPrice(product, market);
            const payload = {
                productId: product.id,
                productName: product.name,
                name: product.name,
                brand: product.brand || '',
                category: product.category || 'mercearia',
                synonyms: product.synonyms || [],
                marketName: market.name || '',
                marketId: market.id,
                networkName: market.networkId || '',
                price,
                promoPrice: Number((price * 0.96).toFixed(2)),
                active: true,
                source: 'test_seed',
                environment: 'staging',
                synthetic: true,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                notes: 'Generated for controlled test coverage',
            };

            writes.push({ id: offerId, payload });
            if (preview.length < 20) {
                preview.push({ id: offerId, ...payload });
            }
        }
    }

    if (apply) {
        const batchSize = 400;
        for (let index = 0; index < writes.length; index += batchSize) {
            const batch = writeBatch(db);
            for (const write of writes.slice(index, index + batchSize)) {
                batch.set(doc(db, 'offers', write.id), write.payload, { merge: true });
            }
            await batch.commit();
        }
    }

    console.log(JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        replaceExistingTestOffers: replace,
        selectedMarkets: markets.map((market) => ({ id: market.id, name: market.name })),
        selectedProducts: products.length,
        generatedOffers: writes.length,
        preview,
    }, null, 2));
}

main().catch((err) => {
    console.error('[seedTestOfferUniverse] Error:', err);
    process.exit(1);
});
