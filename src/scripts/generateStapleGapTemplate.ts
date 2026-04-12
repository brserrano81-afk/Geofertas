import fs from 'fs';
import path from 'path';
import { collection, getDocs } from 'firebase/firestore';

import { db } from '../firebase';
import { fuzzyCatalogMatch, normalizeCatalogText, productCatalogService, type CatalogProduct } from '../services/ProductCatalogService';

type GenericDoc = Record<string, unknown> & { id: string };

type StapleDefinition = {
    term: string;
    preferredMarkets?: string[];
};

const STAPLES: StapleDefinition[] = [
    { term: 'arroz' },
    { term: 'feijao' },
    { term: 'oleo' },
    { term: 'cafe' },
    { term: 'leite' },
    { term: 'refrigerante' },
    { term: 'shampoo' },
];

const STAPLE_ALIASES: Record<string, string[]> = {
    arroz: ['arroz', 'arroz branco', 'arroz tipo 1', 'agulhinha'],
    feijao: ['feijao', 'feijao carioca', 'feijao preto', 'carioca'],
    oleo: ['oleo', 'oleo de soja', 'soya', 'soja 900ml'],
    cafe: ['cafe', 'cafe pilao', 'cafe 500g'],
    leite: ['leite', 'leite integral', 'leite 1l'],
    refrigerante: ['refrigerante', 'coca cola', 'guarana', 'fanta', 'sprite', 'pet 2l', 'pet 2,5l'],
    shampoo: ['shampoo'],
};

function buildPool(doc: { name?: string; brand?: string | null; synonyms?: string[] }) {
    return [doc.name || '', doc.brand || '', ...(doc.synonyms || [])];
}

function matchesStaple(term: string, product: CatalogProduct): boolean {
    const aliases = STAPLE_ALIASES[term] || [term];
    const pool = buildPool(product).map((value) => normalizeCatalogText(value));

    return aliases.some((alias) => {
        const normalizedAlias = normalizeCatalogText(alias);
        return pool.some((value) => value === normalizedAlias || value.includes(normalizedAlias));
    });
}

function readOfferName(doc: GenericDoc): string {
    return String(doc.productName || doc.name || '').trim();
}

function readOfferBrand(doc: GenericDoc): string {
    return String(doc.brand || '').trim();
}

function readOfferMarket(doc: GenericDoc): string {
    return String(doc.marketName || doc.networkName || 'Mercado desconhecido').trim() || 'Mercado desconhecido';
}

async function main() {
    const [catalog, offersSnap] = await Promise.all([
        productCatalogService.loadCatalog(true),
        getDocs(collection(db, 'offers')),
    ]);

    const rawOffers = offersSnap.docs
        .map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Record<string, unknown>),
        }))
        .filter(Boolean);
    const activeOffers: GenericDoc[] = (rawOffers as GenericDoc[]).filter((offer) => offer.active !== false);

    const marketFrequency = new Map<string, number>();
    for (const offer of activeOffers) {
        const market = readOfferMarket(offer);
        marketFrequency.set(market, (marketFrequency.get(market) || 0) + 1);
    }
    const topMarkets = Array.from(marketFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([market]) => market);

    const rows: string[] = [
        [
            'family',
            'category',
            'productId',
            'productName',
            'brand',
            'currentOfferCount',
            'currentOfferMarkets',
            'targetMarkets',
            'status',
            'realPrice',
            'collectedAt',
            'sourceUrl',
            'notes',
        ].join(','),
    ];

    const summary: Array<Record<string, unknown>> = [];

    for (const staple of STAPLES) {
        const familyProducts = catalog.filter((product) => matchesStaple(staple.term, product));
        const normalizedFamily = normalizeCatalogText(staple.term);

        const familyOffers = activeOffers.filter((offer: GenericDoc) =>
            (STAPLE_ALIASES[staple.term] || [normalizedFamily]).some((alias) => {
                const normalizedAlias = normalizeCatalogText(alias);
                return [readOfferName(offer), readOfferBrand(offer), ...(Array.isArray(offer.synonyms) ? offer.synonyms.map(String) : [])]
                    .map((value) => normalizeCatalogText(value))
                    .some((value) => value === normalizedAlias || value.includes(normalizedAlias));
            }),
        );

        const byProduct = familyProducts.map((product) => {
            const productOffers = familyOffers.filter((offer: GenericDoc) =>
                buildPool(product).some((catalogTerm) =>
                    [readOfferName(offer), readOfferBrand(offer), ...(Array.isArray(offer.synonyms) ? offer.synonyms.map(String) : [])]
                        .some((offerTerm) => fuzzyCatalogMatch(catalogTerm, offerTerm) || fuzzyCatalogMatch(offerTerm, catalogTerm)),
                ),
            );

            const offerMarkets = Array.from(new Set(productOffers.map((offer) => readOfferMarket(offer))));
            const targetMarkets = (staple.preferredMarkets || topMarkets).filter((market) => !offerMarkets.includes(market));

            return {
                family: staple.term,
                category: product.category,
                productId: product.id,
                productName: product.name,
                brand: product.brand || '',
                currentOfferCount: productOffers.length,
                currentOfferMarkets: offerMarkets,
                targetMarkets,
            };
        });

        const missingOffers = byProduct.filter((product) => product.currentOfferCount === 0);
        const weakCoverage = byProduct.filter((product) => product.currentOfferCount > 0 && product.currentOfferCount < 3);

        summary.push({
            family: staple.term,
            catalogProducts: familyProducts.length,
            activeOffers: familyOffers.length,
            productsWithoutOffers: missingOffers.length,
            weakCoverageProducts: weakCoverage.length,
        });

        for (const product of [...missingOffers, ...weakCoverage]) {
            rows.push([
                product.family,
                product.category,
                product.productId,
                `"${product.productName.replace(/"/g, '""')}"`,
                `"${String(product.brand).replace(/"/g, '""')}"`,
                String(product.currentOfferCount),
                `"${product.currentOfferMarkets.join(' | ')}"`,
                `"${product.targetMarkets.join(' | ')}"`,
                product.currentOfferCount === 0 ? 'missing_offer' : 'weak_coverage',
                '',
                '',
                '',
                '',
            ].join(','));
        }
    }

    const outputDir = path.join(process.cwd(), 'logs', 'runtime');
    fs.mkdirSync(outputDir, { recursive: true });
    const csvPath = path.join(outputDir, `staple-gap-template-${Date.now()}.csv`);
    fs.writeFileSync(csvPath, rows.join('\n'), 'utf8');

    console.log(JSON.stringify({
        csvPath,
        topMarkets,
        summary,
        previewRows: rows.slice(0, 12),
    }, null, 2));
}

main().catch((err) => {
    console.error('[generateStapleGapTemplate] Error:', err);
    process.exit(1);
});
