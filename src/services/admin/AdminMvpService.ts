import {
    addDoc,
    collection,
    doc,
    getDocs,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';

import { db } from '../../firebase';

export type AdminStatusFilter = 'todos' | 'ativos' | 'inativos';

export type MarketRecord = {
    id: string;
    nome: string;
    rede: string;
    bairro: string;
    cidade: string;
    uf: string;
    endereco: string;
    ativo: boolean;
    createdAt?: unknown;
    updatedAt?: unknown;
};

export type MarketInput = Omit<MarketRecord, 'id' | 'createdAt' | 'updatedAt'>;

export type OfferRecord = {
    id: string;
    productName: string;
    category: string;
    unit: string;
    price: number;
    marketId: string;
    marketName: string;
    networkName: string;
    neighborhood: string;
    city: string;
    state: string;
    expiresAt: string;
    collectedAt: string;
    featured: boolean;
    active: boolean;
    createdAt?: unknown;
    updatedAt?: unknown;
};

export type OfferInput = Omit<OfferRecord, 'id' | 'createdAt' | 'updatedAt'>;

export type CampaignRecord = {
    id: string;
    name: string;
    marketId: string;
    marketName: string;
    description: string;
    startsAt: string;
    endsAt: string;
    active: boolean;
    createdAt?: unknown;
    updatedAt?: unknown;
};

export type CampaignInput = Omit<CampaignRecord, 'id' | 'createdAt' | 'updatedAt'>;

export type DashboardMetrics = {
    totalMarkets: number;
    activeOffers: number;
    expiredOffers: number;
    featuredOffers: number;
    recentEntries: Array<{
        id: string;
        type: 'mercado' | 'oferta' | 'campanha';
        title: string;
        subtitle: string;
        createdAtLabel: string;
    }>;
};

function stringValue(value: unknown): string {
    return String(value || '').trim();
}

function booleanValue(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    return fallback;
}

function numberValue(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function isoDateFromDateInput(value: string): string {
    if (!value) return '';
    return new Date(`${value}T12:00:00`).toISOString();
}

export function dateInputFromIso(value: string): string {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '';
    return parsed.toISOString().slice(0, 10);
}

export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
}

export function formatDateLabel(value: string): string {
    if (!value) return 'sem data';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'sem data';
    return parsed.toLocaleDateString('pt-BR');
}

function timestampToDate(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' || typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (typeof value === 'object') {
        const typed = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
        if (typeof typed.toDate === 'function') return typed.toDate();
        if (typeof typed.seconds === 'number') return new Date(typed.seconds * 1000);
        if (typeof typed._seconds === 'number') return new Date(typed._seconds * 1000);
    }
    return null;
}

function createdAtLabel(value: unknown): string {
    const parsed = timestampToDate(value);
    if (!parsed || Number.isNaN(parsed.getTime())) return 'sem data';
    return parsed.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function buildMarketAddress(input: MarketInput): string {
    const parts = [input.endereco, input.bairro, `${input.cidade} - ${input.uf}`]
        .map((item) => item.trim())
        .filter(Boolean);
    return parts.join(', ');
}

class AdminMvpService {
    async listMarkets(): Promise<MarketRecord[]> {
        const snap = await getDocs(collection(db, 'markets'));
        return snap.docs
            .map((docSnap) => {
                const data = docSnap.data() as Record<string, unknown>;
                return {
                    id: docSnap.id,
                    nome: stringValue(data.nome || data.name),
                    rede: stringValue(data.rede || data.networkName || data.networkId),
                    bairro: stringValue(data.bairro),
                    cidade: stringValue(data.cidade),
                    uf: stringValue(data.uf).toUpperCase(),
                    endereco: stringValue(data.endereco || data.address),
                    ativo: data.active !== false && data.ativo !== false,
                    createdAt: data.createdAt,
                    updatedAt: data.updatedAt,
                };
            })
            .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    }

    async createMarket(input: MarketInput) {
        await addDoc(collection(db, 'markets'), {
            nome: input.nome.trim(),
            name: input.nome.trim(),
            rede: input.rede.trim(),
            networkName: input.rede.trim(),
            bairro: input.bairro.trim(),
            cidade: input.cidade.trim(),
            uf: input.uf.trim().toUpperCase(),
            endereco: input.endereco.trim(),
            address: buildMarketAddress(input),
            ativo: input.ativo,
            active: input.ativo,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }

    async updateMarket(id: string, input: MarketInput) {
        await updateDoc(doc(db, 'markets', id), {
            nome: input.nome.trim(),
            name: input.nome.trim(),
            rede: input.rede.trim(),
            networkName: input.rede.trim(),
            bairro: input.bairro.trim(),
            cidade: input.cidade.trim(),
            uf: input.uf.trim().toUpperCase(),
            endereco: input.endereco.trim(),
            address: buildMarketAddress(input),
            ativo: input.ativo,
            active: input.ativo,
            updatedAt: serverTimestamp(),
        });
    }

    async toggleMarketStatus(record: MarketRecord) {
        const next = !record.ativo;
        await updateDoc(doc(db, 'markets', record.id), {
            ativo: next,
            active: next,
            updatedAt: serverTimestamp(),
        });
    }

    async listOffers(): Promise<OfferRecord[]> {
        const snap = await getDocs(collection(db, 'offers'));
        return snap.docs
            .map((docSnap) => {
                const data = docSnap.data() as Record<string, unknown>;
                return {
                    id: docSnap.id,
                    productName: stringValue(data.productName || data.name),
                    category: stringValue(data.category),
                    unit: stringValue(data.unit || data.unidade),
                    price: numberValue(data.price || data.promoPrice),
                    marketId: stringValue(data.marketId),
                    marketName: stringValue(data.marketName || data.networkName),
                    networkName: stringValue(data.networkName || data.rede),
                    neighborhood: stringValue(data.neighborhood || data.bairro),
                    city: stringValue(data.city || data.cidade),
                    state: stringValue(data.state || data.uf).toUpperCase(),
                    expiresAt: stringValue(data.expiresAt),
                    collectedAt: stringValue(data.collectedAt || data.startsAt || data.updatedAtIso),
                    featured: booleanValue(data.featured ?? data.destaque, false),
                    active: data.active !== false && data.ativo !== false,
                    createdAt: data.createdAt,
                    updatedAt: data.updatedAt,
                };
            })
            .sort((a, b) => a.productName.localeCompare(b.productName, 'pt-BR'));
    }

    async createOffer(input: OfferInput) {
        await addDoc(collection(db, 'offers'), {
            productName: input.productName.trim(),
            name: input.productName.trim(),
            category: input.category.trim().toLowerCase(),
            unit: input.unit.trim(),
            unidade: input.unit.trim(),
            price: input.price,
            marketId: input.marketId.trim(),
            marketName: input.marketName.trim(),
            networkName: input.networkName.trim(),
            neighborhood: input.neighborhood.trim(),
            bairro: input.neighborhood.trim(),
            city: input.city.trim(),
            cidade: input.city.trim(),
            state: input.state.trim().toUpperCase(),
            uf: input.state.trim().toUpperCase(),
            expiresAt: input.expiresAt,
            collectedAt: input.collectedAt,
            startsAt: input.collectedAt,
            featured: input.featured,
            destaque: input.featured,
            active: input.active,
            ativo: input.active,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }

    async updateOffer(id: string, input: OfferInput) {
        await updateDoc(doc(db, 'offers', id), {
            productName: input.productName.trim(),
            name: input.productName.trim(),
            category: input.category.trim().toLowerCase(),
            unit: input.unit.trim(),
            unidade: input.unit.trim(),
            price: input.price,
            marketId: input.marketId.trim(),
            marketName: input.marketName.trim(),
            networkName: input.networkName.trim(),
            neighborhood: input.neighborhood.trim(),
            bairro: input.neighborhood.trim(),
            city: input.city.trim(),
            cidade: input.city.trim(),
            state: input.state.trim().toUpperCase(),
            uf: input.state.trim().toUpperCase(),
            expiresAt: input.expiresAt,
            collectedAt: input.collectedAt,
            startsAt: input.collectedAt,
            featured: input.featured,
            destaque: input.featured,
            active: input.active,
            ativo: input.active,
            updatedAt: serverTimestamp(),
        });
    }

    async toggleOfferStatus(record: OfferRecord) {
        const next = !record.active;
        await updateDoc(doc(db, 'offers', record.id), {
            active: next,
            ativo: next,
            updatedAt: serverTimestamp(),
        });
    }

    async listCampaigns(): Promise<CampaignRecord[]> {
        const snap = await getDocs(collection(db, 'campaigns'));
        return snap.docs
            .map((docSnap) => {
                const data = docSnap.data() as Record<string, unknown>;
                return {
                    id: docSnap.id,
                    name: stringValue(data.name),
                    marketId: stringValue(data.marketId),
                    marketName: stringValue(data.marketName || data.networkName),
                    description: stringValue(data.description || data.descricao),
                    startsAt: stringValue(data.startsAt),
                    endsAt: stringValue(data.endsAt || data.expiresAt),
                    active: data.active !== false && data.ativo !== false,
                    createdAt: data.createdAt,
                    updatedAt: data.updatedAt,
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }

    async createCampaign(input: CampaignInput) {
        await addDoc(collection(db, 'campaigns'), {
            name: input.name.trim(),
            marketId: input.marketId.trim(),
            marketName: input.marketName.trim(),
            description: input.description.trim(),
            descricao: input.description.trim(),
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            expiresAt: input.endsAt,
            active: input.active,
            ativo: input.active,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    }

    async updateCampaign(id: string, input: CampaignInput) {
        await updateDoc(doc(db, 'campaigns', id), {
            name: input.name.trim(),
            marketId: input.marketId.trim(),
            marketName: input.marketName.trim(),
            description: input.description.trim(),
            descricao: input.description.trim(),
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            expiresAt: input.endsAt,
            active: input.active,
            ativo: input.active,
            updatedAt: serverTimestamp(),
        });
    }

    async toggleCampaignStatus(record: CampaignRecord) {
        const next = !record.active;
        await updateDoc(doc(db, 'campaigns', record.id), {
            active: next,
            ativo: next,
            updatedAt: serverTimestamp(),
        });
    }

    async getDashboardMetrics(): Promise<DashboardMetrics> {
        const [markets, offers, campaigns] = await Promise.all([
            this.listMarkets(),
            this.listOffers(),
            this.listCampaigns(),
        ]);

        const now = Date.now();
        const expiredOffers = offers.filter((offer) => {
            if (!offer.expiresAt) return false;
            const parsed = new Date(offer.expiresAt);
            return !Number.isNaN(parsed.getTime()) && parsed.getTime() < now;
        }).length;

        const recentEntries = [
            ...markets.map((item) => ({
                id: item.id,
                type: 'mercado' as const,
                title: item.nome,
                subtitle: `${item.bairro || 'bairro'} · ${item.cidade || 'cidade'} - ${item.uf || 'UF'}`,
                createdAt: item.createdAt,
            })),
            ...offers.map((item) => ({
                id: item.id,
                type: 'oferta' as const,
                title: item.productName,
                subtitle: `${item.marketName || 'mercado'} · ${formatCurrency(item.price)}`,
                createdAt: item.createdAt,
            })),
            ...campaigns.map((item) => ({
                id: item.id,
                type: 'campanha' as const,
                title: item.name,
                subtitle: item.marketName || 'sem mercado vinculado',
                createdAt: item.createdAt,
            })),
        ]
            .sort((a, b) => {
                const first = timestampToDate(b.createdAt)?.getTime() || 0;
                const second = timestampToDate(a.createdAt)?.getTime() || 0;
                return first - second;
            })
            .slice(0, 6)
            .map((item) => ({
                ...item,
                createdAtLabel: createdAtLabel(item.createdAt),
            }));

        return {
            totalMarkets: markets.length,
            activeOffers: offers.filter((offer) => offer.active).length,
            expiredOffers,
            featuredOffers: offers.filter((offer) => offer.featured && offer.active).length,
            recentEntries,
        };
    }
}

export const adminMvpService = new AdminMvpService();

export function createEmptyMarketInput(): MarketInput {
    return {
        nome: '',
        rede: '',
        bairro: '',
        cidade: '',
        uf: '',
        endereco: '',
        ativo: true,
    };
}

export function createEmptyOfferInput(): OfferInput {
    return {
        productName: '',
        category: '',
        unit: '',
        price: 0,
        marketId: '',
        marketName: '',
        networkName: '',
        neighborhood: '',
        city: '',
        state: '',
        expiresAt: '',
        collectedAt: new Date().toISOString(),
        featured: false,
        active: true,
    };
}

export function createEmptyCampaignInput(): CampaignInput {
    return {
        name: '',
        marketId: '',
        marketName: '',
        description: '',
        startsAt: new Date().toISOString(),
        endsAt: '',
        active: true,
    };
}

export function marketToInput(record: MarketRecord): MarketInput {
    return {
        nome: record.nome,
        rede: record.rede,
        bairro: record.bairro,
        cidade: record.cidade,
        uf: record.uf,
        endereco: record.endereco,
        ativo: record.ativo,
    };
}

export function offerToInput(record: OfferRecord): OfferInput {
    return {
        productName: record.productName,
        category: record.category,
        unit: record.unit,
        price: record.price,
        marketId: record.marketId,
        marketName: record.marketName,
        networkName: record.networkName,
        neighborhood: record.neighborhood,
        city: record.city,
        state: record.state,
        expiresAt: record.expiresAt,
        collectedAt: record.collectedAt,
        featured: record.featured,
        active: record.active,
    };
}

export function campaignToInput(record: CampaignRecord): CampaignInput {
    return {
        name: record.name,
        marketId: record.marketId,
        marketName: record.marketName,
        description: record.description,
        startsAt: record.startsAt,
        endsAt: record.endsAt,
        active: record.active,
    };
}

export function normalizeMarketInput(input: MarketInput): MarketInput {
    return {
        ...input,
        uf: input.uf.trim().toUpperCase().slice(0, 2),
    };
}

export function normalizeOfferInput(input: OfferInput, market?: MarketRecord | null): OfferInput {
    return {
        ...input,
        price: Number(input.price) || 0,
        category: input.category.trim().toLowerCase(),
        marketId: market?.id || input.marketId,
        marketName: market?.nome || input.marketName.trim(),
        networkName: market?.rede || input.networkName.trim(),
        neighborhood: market?.bairro || input.neighborhood.trim(),
        city: market?.cidade || input.city.trim(),
        state: (market?.uf || input.state).trim().toUpperCase(),
        expiresAt: input.expiresAt ? isoDateFromDateInput(dateInputFromIso(input.expiresAt) || input.expiresAt.slice(0, 10)) : '',
        collectedAt: input.collectedAt ? new Date(input.collectedAt).toISOString() : new Date().toISOString(),
    };
}

export function normalizeCampaignInput(input: CampaignInput, market?: MarketRecord | null): CampaignInput {
    return {
        ...input,
        marketId: market?.id || input.marketId,
        marketName: market?.nome || input.marketName.trim(),
        startsAt: input.startsAt ? new Date(input.startsAt).toISOString() : new Date().toISOString(),
        endsAt: input.endsAt ? new Date(input.endsAt).toISOString() : '',
    };
}
