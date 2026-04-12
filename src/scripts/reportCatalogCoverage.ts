import fs from 'fs';
import path from 'path';
import { collection, getDocs } from 'firebase/firestore';

import { db } from '../firebase';
import { fuzzyCatalogMatch, normalizeCatalogText, productCatalogService } from '../services/ProductCatalogService';

type GenericDoc = Record<string, unknown> & { id: string };

type GapCandidate = {
    normalizedName: string;
    sampleName: string;
    category: string;
    markets: string[];
    marketCount: number;
    occurrences: number;
    minPrice?: number;
    maxPrice?: number;
    sampleSynonyms: string[];
};

const STAPLE_TERMS = [
    'arroz',
    'feijao',
    'oleo',
    'cafe',
    'leite',
    'cerveja',
    'refrigerante',
    'papel higienico',
    'detergente',
    'shampoo',
];

const STAPLE_ALIASES: Record<string, string[]> = {
    arroz: ['arroz', 'arroz branco', 'arroz tipo 1', 'agulhinha'],
    feijao: ['feijao', 'feijao carioca', 'feijao preto', 'carioca'],
    oleo: ['oleo', 'oleo de soja', 'soja 900ml'],
    cafe: ['cafe', 'cafe pilao', 'cafe 500g'],
    leite: ['leite', 'leite integral', 'leite 1l'],
    cerveja: ['cerveja', 'skol', 'brahma', 'heineken', 'amstel', 'itaipava', 'bohemia', 'spaten'],
    refrigerante: ['refrigerante', 'coca cola', 'guarana', 'fanta', 'sprite', 'pet 2l', 'pet 2,5l'],
    shampoo: ['shampoo'],
    detergente: ['detergente', 'lava louca', 'lava louça', 'ype'],
    'papel higienico': ['papel higienico', 'papel higiênico', 'neve 12un'],
};

function readName(doc: GenericDoc): string {
    return String(doc.productName || doc.name || '').trim();
}

function readCategory(doc: GenericDoc): string {
    return String(doc.category || 'sem_categoria').trim() || 'sem_categoria';
}

function readPrice(doc: GenericDoc): number | undefined {
    const raw = doc.price || doc.promoPrice;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readMarket(doc: GenericDoc): string {
    return String(doc.marketName || doc.networkName || 'Mercado desconhecido').trim() || 'Mercado desconhecido';
}

function buildSearchPool(doc: GenericDoc): string[] {
    const base = [readName(doc), String(doc.brand || '')];
    const synonyms = Array.isArray(doc.synonyms) ? doc.synonyms.map((value) => String(value)) : [];
    return [...base, ...synonyms].filter(Boolean);
}

function matchesStaple(term: string, doc: { name?: string; brand?: string | null; synonyms?: string[] }): boolean {
    const aliases = STAPLE_ALIASES[term] || [term];
    const pool = buildSearchPool(doc as GenericDoc).map((value) => normalizeCatalogText(value));

    return aliases.some((alias) => {
        const normalizedAlias = normalizeCatalogText(alias);
        return pool.some((value) => {
            if (!value) return false;
            if (value === normalizedAlias) return true;
            if (value.includes(normalizedAlias)) return true;
            return false;
        });
    });
}

function inferProductBrand(name: string): string | undefined {
    const words = normalizeCatalogText(name).split(' ').filter(Boolean);
    if (words.length < 2) return undefined;

    const stopWords = new Set([
        'cerveja', 'arroz', 'feijao', 'oleo', 'cafe', 'leite', 'papel', 'higienico',
        'detergente', 'shampoo', 'lata', 'garrafa', 'kg', 'ml', 'lt', 'tradicional',
        'tipo', 'extra', 'long', 'neck', 'branco', 'integral', 'puro', 'malte',
    ]);

    const candidates = words.filter((word) => !stopWords.has(word) && !/^\d+(kg|ml|l)?$/.test(word));
    if (candidates.length === 0) return undefined;
    return candidates.slice(0, 2).join(' ');
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

    const unmatchedMap = new Map<string, GapCandidate>();
    const categoryCoverage = new Map<string, { products: number; activeOffers: number }>();

    for (const product of catalog) {
        const category = readCategory(product as unknown as GenericDoc);
        if (!categoryCoverage.has(category)) {
            categoryCoverage.set(category, { products: 0, activeOffers: 0 });
        }
        categoryCoverage.get(category)!.products += 1;
    }

    for (const offer of activeOffers) {
        const category = readCategory(offer);
        if (!categoryCoverage.has(category)) {
            categoryCoverage.set(category, { products: 0, activeOffers: 0 });
        }
        categoryCoverage.get(category)!.activeOffers += 1;

        const offerName = readName(offer);
        if (!offerName) continue;

        const searchPool = buildSearchPool(offer);
        const matchedProduct = catalog.find((product) => {
            const productPool = [product.name, product.brand || '', ...(product.synonyms || [])];
            return searchPool.some((offerTerm) =>
                productPool.some((productTerm) =>
                    fuzzyCatalogMatch(offerTerm, productTerm) || fuzzyCatalogMatch(productTerm, offerTerm),
                ),
            );
        });

        if (matchedProduct) continue;

        const normalizedName = normalizeCatalogText(offerName);
        const current = unmatchedMap.get(normalizedName) || {
            normalizedName,
            sampleName: offerName,
            category,
            markets: [],
            marketCount: 0,
            occurrences: 0,
            minPrice: undefined,
            maxPrice: undefined,
            sampleSynonyms: Array.isArray(offer.synonyms) ? offer.synonyms.map((value: unknown) => String(value)).slice(0, 6) : [],
        };

        current.occurrences += 1;
        const market = readMarket(offer);
        if (!current.markets.includes(market)) {
            current.markets.push(market);
        }
        current.marketCount = current.markets.length;
        const price = readPrice(offer);
        if (price !== undefined) {
            current.minPrice = current.minPrice === undefined ? price : Math.min(current.minPrice, price);
            current.maxPrice = current.maxPrice === undefined ? price : Math.max(current.maxPrice, price);
        }

        unmatchedMap.set(normalizedName, current);
    }

    const unmatchedCandidates = Array.from(unmatchedMap.values())
        .sort((a, b) => {
            if (b.marketCount !== a.marketCount) return b.marketCount - a.marketCount;
            if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
            return a.sampleName.localeCompare(b.sampleName);
        });

    const categorySummary = Array.from(categoryCoverage.entries())
        .map(([category, stats]) => ({
            category,
            products: stats.products,
            activeOffers: stats.activeOffers,
            coverageRatio: stats.products > 0 ? Number((stats.activeOffers / stats.products).toFixed(2)) : null,
        }))
        .sort((a, b) => (a.coverageRatio ?? -1) - (b.coverageRatio ?? -1));

    const stapleCoverage = STAPLE_TERMS.map((term) => {
        const productMatches = catalog.filter((product) =>
            matchesStaple(term, product),
        );
        const offerMatches = activeOffers.filter((offer) =>
            matchesStaple(term, offer as { name?: string; brand?: string | null; synonyms?: string[] }),
        );

        const distinctBrands = Array.from(new Set(
            offerMatches
                .map((offer) => String(offer.brand || inferProductBrand(readName(offer)) || ''))
                .map((value: string) => normalizeCatalogText(value))
                .filter(Boolean),
        ));

        return {
            term,
            products: productMatches.length,
            activeOffers: offerMatches.length,
            distinctOfferBrands: distinctBrands.length,
            sampleBrands: distinctBrands.slice(0, 8),
        };
    });

    const suggestedSeedCandidates = unmatchedCandidates
        .filter((candidate) => candidate.marketCount >= 2 && candidate.occurrences >= 2)
        .slice(0, 60)
        .map((candidate) => ({
            id: `auto_${candidate.normalizedName.replace(/\s+/g, '_').slice(0, 80)}`,
            name: candidate.sampleName,
            brand: inferProductBrand(candidate.sampleName) || null,
            category: candidate.category,
            synonyms: Array.from(new Set([
                candidate.sampleName,
                ...candidate.sampleSynonyms,
            ])).slice(0, 8),
            source: 'coverage_report',
            marketCount: candidate.marketCount,
            occurrences: candidate.occurrences,
        }));

    const report = {
        generatedAt: new Date().toISOString(),
        totals: {
            catalogProducts: catalog.length,
            activeOffers: activeOffers.length,
            unmatchedOfferNames: unmatchedCandidates.length,
            suggestedSeedCandidates: suggestedSeedCandidates.length,
        },
        categorySummary,
        stapleCoverage,
        unmatchedExamples: unmatchedCandidates.slice(0, 80),
        suggestedSeedCandidates,
    };

    const reportDir = path.join(process.cwd(), 'logs', 'runtime');
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `catalog-coverage-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(JSON.stringify({
        reportPath,
        totals: report.totals,
        weakestCategories: categorySummary.slice(0, 8),
        stapleCoverage,
        topUnmatchedExamples: unmatchedCandidates.slice(0, 20),
        suggestedSeedCandidates: suggestedSeedCandidates.slice(0, 20),
    }, null, 2));
}

main().catch((err) => {
    console.error('[reportCatalogCoverage] Error:', err);
    process.exit(1);
});
