export type OfferDataMode = 'real' | 'test' | 'all';

function readModeCandidate(): string {
    try {
        const viteMode = import.meta.env?.VITE_OFFER_DATA_MODE;
        if (viteMode) return String(viteMode);
    } catch {
        // ignore import.meta access in non-vite contexts
    }

    return String(process.env.OFFER_DATA_MODE || '');
}

export function getOfferDataMode(): OfferDataMode {
    const normalized = readModeCandidate().trim().toLowerCase();
    if (normalized === 'test') return 'test';
    if (normalized === 'all') return 'all';
    return 'real';
}

export function isTestSeedOffer(offer: Record<string, unknown>): boolean {
    const source = String(offer.source || '').trim().toLowerCase();
    const environment = String(offer.environment || '').trim().toLowerCase();
    return source === 'test_seed' || environment === 'staging' || offer.synthetic === true;
}
