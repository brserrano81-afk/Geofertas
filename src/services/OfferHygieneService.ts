import {
    type CatalogProduct,
    fuzzyCatalogMatch,
    normalizeCatalogText,
    productCatalogService,
} from './ProductCatalogService';
import { getOfferDataMode, isTestSeedOffer } from './OfferDataMode';

export interface OfferSnapshot {
    id?: string;
    name?: string;
    productName?: string;
    marketName?: string;
    networkName?: string;
    category?: string;
    price?: number;
    promoPrice?: number;
    source?: unknown;
    active?: boolean;
    [key: string]: unknown;
}

export interface OfferAnalysis {
    offerId: string;
    canonicalName: string;
    marketName: string;
    category: string;
    numericPrice: number;
    matchedProduct?: CatalogProduct;
    reasons: string[];
    reviewReasons: string[];
    shouldArchive: boolean;
}

function isLikelyTechnicalName(name: string): boolean {
    const normalized = normalizeCatalogText(name);
    return (
        !normalized ||
        /^off\s+[a-z0-9]{6,}$/i.test(normalized) ||
        /^[a-z0-9]{14,}$/i.test(normalized)
    );
}

function isSuspiciousSource(source: unknown): boolean {
    const value = String(source || '').trim();
    return !value || value === '[object Object]';
}

class OfferHygieneService {
    async analyzeOffer(offer: OfferSnapshot): Promise<OfferAnalysis> {
        const canonicalName = String(offer.productName || offer.name || '').trim();
        const marketName = String(offer.marketName || offer.networkName || '').trim();
        const category = String(offer.category || '').trim().toLowerCase();
        const numericPrice = Number(offer.price || offer.promoPrice || 0);

        const reasons: string[] = [];
        const reviewReasons: string[] = [];

        if (!canonicalName) reasons.push('missing_name');
        if (isLikelyTechnicalName(canonicalName)) reasons.push('technical_name');
        if (!marketName) reasons.push('missing_market');
        if (!(numericPrice > 0)) reasons.push('invalid_price');

        const catalogMatch = canonicalName
            ? await productCatalogService.matchProductName(canonicalName)
            : { score: 0 };
        const matchedProduct = catalogMatch.product;

        if (!matchedProduct && category === 'outros') {
            reasons.push('category_outros_without_catalog_match');
        } else if (!matchedProduct) {
            reviewReasons.push('catalog_miss');
        }

        if (category === 'outros' && matchedProduct) {
            reviewReasons.push('category_outros_but_catalog_match');
        }

        if (isSuspiciousSource(offer.source)) {
            reviewReasons.push('suspicious_source');
        }

        const shouldArchive = offer.active === false ? false : reasons.length > 0;
        if (offer.active === false) {
            reviewReasons.push('already_inactive');
        }

        return {
            offerId: offer.id || '',
            canonicalName,
            marketName,
            category,
            numericPrice,
            matchedProduct,
            reasons,
            reviewReasons,
            shouldArchive,
        };
    }

    buildSummary(analyses: OfferAnalysis[]) {
        const reasonCounts = new Map<string, number>();
        const reviewCounts = new Map<string, number>();
        let archiveCount = 0;
        let reviewCount = 0;

        for (const analysis of analyses) {
            if (analysis.shouldArchive) archiveCount++;
            if (analysis.reviewReasons.length > 0) reviewCount++;
            for (const reason of analysis.reasons) {
                reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
            }
            for (const reviewReason of analysis.reviewReasons) {
                reviewCounts.set(reviewReason, (reviewCounts.get(reviewReason) || 0) + 1);
            }
        }

        return {
            total: analyses.length,
            archiveCount,
            reviewCount,
            reasonCounts: Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1]),
            reviewCounts: Array.from(reviewCounts.entries()).sort((a, b) => b[1] - a[1]),
        };
    }

    isOfferUsableForSearch(offer: OfferSnapshot): boolean {
        const canonicalName = String(offer.productName || offer.name || '').trim();
        const marketName = String(offer.marketName || offer.networkName || '').trim();
        const numericPrice = Number(offer.price || offer.promoPrice || 0);
        const dataMode = getOfferDataMode();
        const isTestOffer = isTestSeedOffer(offer);

        if (offer.active === false) return false;

        if (offer.expiresAt || offer.validUntil) {
            const expires = new Date((offer.expiresAt || offer.validUntil) as string | number);
            if (expires < new Date()) {
                return false;
            }
        }
        // TODO: Em um futuro proximo, ofertas sem data de validade devem ser tratadas de forma diferente ou expiradas automaticamente.
        // Para este P1, aceitar a oferta sem expiresAt para não quebrar a base inteira.

        if (dataMode === 'real' && isTestOffer) return false;
        if (dataMode === 'test' && !isTestOffer) return false;
        if (!canonicalName || !marketName || !(numericPrice > 0)) return false;
        if (isLikelyTechnicalName(canonicalName)) return false;
        return true;
    }

    matchesCatalogProduct(offerName: string, searchTerms: string[]): boolean {
        const normalizedOfferName = normalizeCatalogText(offerName);
        return searchTerms.some((term) => fuzzyCatalogMatch(term, normalizedOfferName));
    }
}

export const offerHygieneService = new OfferHygieneService();
