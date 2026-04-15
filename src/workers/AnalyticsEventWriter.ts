// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsEventWriter — Camada de analytics anônima do Economiza Fácil
//
// REGRAS ABSOLUTAS (LGPD — art. 6º, III):
//   ✗ Nunca gravar userId como campo de evento
//   ✗ Nunca gravar nome, telefone, e-mail
//   ✗ Nunca gravar lat/lng ou endereço exato
//   ✓ userId é usado APENAS como chave de documento em user_aggregates
//   ✓ marketRegion = slug de bairro (granularidade ≥ 1 km²)
//
// Coleções:
//   analytics_events/{eventId}  — eventos individuais anônimos
//   user_aggregates/{userId}    — agregados mensais por usuário (sem PII nos campos)
// ─────────────────────────────────────────────────────────────────────────────

import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    serverTimestamp,
    setDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { CATEGORY_ALIASES, normalizeCatalogText } from '../services/ProductCatalogService';

// ── Tipos públicos ────────────────────────────────────────────────────────────

export type AnalyticsEventType =
    | 'purchase_recorded'
    | 'list_created'
    | 'list_updated'
    | 'price_queried'
    | 'offer_viewed'
    | 'list_compared';

/**
 * Payload de entrada — todos os campos são opcionais exceto eventType.
 * O writer preenche weekday, hour e createdAt automaticamente.
 */
export interface AnalyticsEventPayload {
    eventType: AnalyticsEventType;
    /** ID do mercado no Firestore (ou slug derivado do nome). Sem PII. */
    marketId?: string;
    /** Slug de bairro/região (ex: "centro", "jardins"). NUNCA lat/lng. */
    marketRegion?: string;
    /** Slug de categoria (ex: "mercearia", "acougue"). */
    categorySlug?: string;
    /** Preço unitário do produto consultado (0 quando não aplicável). */
    pricePoint?: number;
    /** Número de itens no carrinho/lista. */
    basketSize?: number;
    /** Valor total da compra (0 quando não aplicável). */
    totalAmount?: number;
}

export interface AggregateUpdatePayload {
    purchaseAmount?: number;
    basketSize?: number;
    categorySlug?: string;
    marketId?: string;
    estimatedSavings?: number;
}

/** Documento gravado em analytics_events/{eventId} */
interface StoredAnalyticsEvent {
    eventType: AnalyticsEventType;
    marketId: string;
    marketRegion: string;
    categorySlug: string;
    pricePoint: number;
    basketSize: number;
    totalAmount: number;
    weekday: number;          // 0 = domingo … 6 = sábado
    hour: number;             // 0–23
    createdAt: ReturnType<typeof serverTimestamp>;
}

/** Documento gravado em user_aggregates/{userId} */
export interface UserAggregate {
    periodStart: string;      // "YYYY-MM-01"
    periodEnd: string;        // "YYYY-MM-DD" (último dia do mês)
    purchaseCount: number;
    totalSpent: number;
    averageTicket: number;
    topCategories: string[];  // até 5 slugs mais frequentes
    topMarketIds: string[];   // até 5 marketIds mais frequentes
    basketAvgSize: number;
    estimatedSavings: number;
}

// ── PII Guard ─────────────────────────────────────────────────────────────────

/** Campos explicitamente proibidos em qualquer payload de analytics */
const PII_FIELD_NAMES = new Set([
    'userid', 'name', 'nome', 'phone', 'telefone', 'email',
    'lat', 'lng', 'latitude', 'longitude',
    'address', 'endereco', 'endereço', 'rua', 'street', 'numero',
]);

/**
 * Lança erro se detectar campo de PII no payload.
 * Proteção em runtime — complementa a tipagem estática.
 */
function assertNoPii(payload: Record<string, unknown>): void {
    for (const key of Object.keys(payload)) {
        if (PII_FIELD_NAMES.has(key.toLowerCase())) {
            throw new Error(
                `[AnalyticsEventWriter] Campo PII proibido detectado: "${key}". ` +
                'Remova o campo antes de gravar o evento.',
            );
        }
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Retorna o primeiro e o último dia do mês corrente em formato ISO (YYYY-MM-DD) */
function currentMonthBounds(): { periodStart: string; periodEnd: string } {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const periodStart = new Date(y, m, 1).toISOString().slice(0, 10);
    const periodEnd = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    return { periodStart, periodEnd };
}

/** Retorna as N chaves com maior contagem de um mapa de votos */
function topN(votes: Record<string, number>, n = 5): string[] {
    return Object.entries(votes)
        .filter(([key]) => Boolean(key))
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([key]) => key);
}

/** Converte nome de mercado em slug estável para uso como marketId substituto */
export function slugifyMarketName(name: string): string {
    return normalizeCatalogText(name).replace(/\s+/g, '_');
}

export function sanitizeMarketRegion(region?: string | null): string {
    return normalizeCatalogText(region || '').replace(/\s+/g, '_');
}

export function inferDominantCategory(items: Array<{ name?: string | null }>): string {
    try {
        const votes: Record<string, number> = {};
        for (const item of items) {
            const normalizedName = normalizeCatalogText(item?.name || '');
            if (!normalizedName) continue;

            for (const [slug, aliases] of Object.entries(CATEGORY_ALIASES)) {
                if (aliases.some((alias) => normalizedName.includes(normalizeCatalogText(alias)))) {
                    votes[slug] = (votes[slug] || 0) + 1;
                    break;
                }
            }
        }

        return topN(votes, 1)[0] || '';
    } catch {
        return '';
    }
}

// ── AnalyticsEventWriter ──────────────────────────────────────────────────────

class AnalyticsEventWriter {
    /**
     * Grava um evento anônimo em `analytics_events`.
     *
     * Fire-and-forget: nunca lança exceção para o caller.
     * Falhas são logadas, mas não bloqueiam o fluxo principal.
     */
    async writeEvent(payload: AnalyticsEventPayload): Promise<void> {
        try {
            const now = new Date();

            const event: StoredAnalyticsEvent = {
                eventType: payload.eventType,
                marketId: payload.marketId || '',
                marketRegion: sanitizeMarketRegion(payload.marketRegion),
                categorySlug: normalizeCatalogText(payload.categorySlug || ''),
                pricePoint: Math.round(Number(payload.pricePoint || 0) * 100) / 100,
                basketSize: Math.max(0, Math.floor(Number(payload.basketSize || 0))),
                totalAmount: Math.round(Number(payload.totalAmount || 0) * 100) / 100,
                weekday: now.getDay(),
                hour: now.getHours(),
                createdAt: serverTimestamp(),
            };

            // Guarda de PII em runtime
            assertNoPii(event as unknown as Record<string, unknown>);

            await addDoc(collection(db, 'analytics_events'), event);
            console.log(`[AnalyticsEventWriter] Evento gravado: ${payload.eventType} | market=${event.marketId} | cat=${event.categorySlug}`);
        } catch (err) {
            console.error('[AnalyticsEventWriter] Falha ao gravar evento (não crítico):', err);
        }
    }

    /**
     * Atualiza o agregado mensal do usuário em `user_aggregates/{userId}`.
     *
     * O userId é usado APENAS como chave do documento — não é gravado como
     * campo de valor no documento, nem aparece em analytics_events.
     *
     * Fire-and-forget: nunca lança exceção para o caller.
     */
    async updateUserAggregate(
        userId: string,
        update: AggregateUpdatePayload,
    ): Promise<void> {
        try {
            const { periodStart, periodEnd } = currentMonthBounds();
            const aggRef = doc(db, 'user_aggregates', userId);
            const snap = await getDoc(aggRef);
            const prev = snap.exists() ? snap.data() : {};

            // ── Votos de categoria e mercado ─────────────────────────────────
            const categoryVotes: Record<string, number> = { ...(prev._categoryVotes || {}) };
            const marketVotes: Record<string, number> = { ...(prev._marketVotes || {}) };

            if (update.categorySlug) {
                const slug = normalizeCatalogText(update.categorySlug);
                if (slug) categoryVotes[slug] = (categoryVotes[slug] || 0) + 1;
            }
            if (update.marketId) {
                marketVotes[update.marketId] = (marketVotes[update.marketId] || 0) + 1;
            }

            // ── Contadores de compra ──────────────────────────────────────────
            const hasPurchase = update.purchaseAmount != null;
            const purchaseCount = (prev.purchaseCount || 0) + (hasPurchase ? 1 : 0);
            const totalSpent = (prev.totalSpent || 0) + (update.purchaseAmount || 0);
            const averageTicket = purchaseCount > 0
                ? Math.round((totalSpent / purchaseCount) * 100) / 100
                : 0;

            // ── Média de tamanho de cesta (running average) ───────────────────
            const basketTotal = (prev._basketSizeTotal || 0) + (update.basketSize || 0);
            const basketCount = (prev._basketSizeCount || 0) + (update.basketSize != null ? 1 : 0);
            const basketAvgSize = basketCount > 0
                ? Math.round((basketTotal / basketCount) * 10) / 10
                : 0;

            // ── Economia acumulada ────────────────────────────────────────────
            const estimatedSavings =
                Math.round(((prev.estimatedSavings || 0) + (update.estimatedSavings || 0)) * 100) / 100;

            // ── Montar documento ──────────────────────────────────────────────
            const aggregate: Record<string, unknown> = {
                periodStart,
                periodEnd,
                purchaseCount,
                totalSpent: Math.round(totalSpent * 100) / 100,
                averageTicket,
                topCategories: topN(categoryVotes),
                topMarketIds: topN(marketVotes),
                basketAvgSize,
                estimatedSavings,
                // Acumuladores internos (sem PII, usados para manter médias incrementais)
                _categoryVotes: categoryVotes,
                _marketVotes: marketVotes,
                _basketSizeTotal: basketTotal,
                _basketSizeCount: basketCount,
                updatedAt: serverTimestamp(),
            };

            // Guarda de PII: verifica que nenhum campo proibido escapou
            assertNoPii(aggregate);

            await setDoc(aggRef, aggregate, { merge: true });
            console.log(`[AnalyticsEventWriter] Agregado atualizado: ${userId.slice(0, 8)}… | purchases=${purchaseCount}`);
        } catch (err) {
            console.error('[AnalyticsEventWriter] Falha ao atualizar agregado (não crítico):', err);
        }
    }

    async mergeAggregateDocuments(targetUserId: string, sourceUserIds: string[]): Promise<void> {
        try {
            const uniqueSourceIds = Array.from(new Set(sourceUserIds.filter((userId) => userId && userId !== targetUserId)));
            if (!targetUserId || uniqueSourceIds.length === 0) {
                return;
            }

            const targetRef = doc(db, 'user_aggregates', targetUserId);
            const [targetSnap, ...sourceSnaps] = await Promise.all([
                getDoc(targetRef),
                ...uniqueSourceIds.map((userId) => getDoc(doc(db, 'user_aggregates', userId))),
            ]);

            const merged = sourceSnaps.reduce<Record<string, unknown>>((acc, snap) => {
                if (!snap.exists()) {
                    return acc;
                }

                const data = snap.data();
                const mergeVotes = (current: Record<string, number>, incoming: Record<string, number>) => {
                    for (const [key, value] of Object.entries(incoming || {})) {
                        current[key] = (current[key] || 0) + Number(value || 0);
                    }
                    return current;
                };

                acc.purchaseCount = Number(acc.purchaseCount || 0) + Number(data.purchaseCount || 0);
                acc.totalSpent = Number(acc.totalSpent || 0) + Number(data.totalSpent || 0);
                acc.estimatedSavings = Number(acc.estimatedSavings || 0) + Number(data.estimatedSavings || 0);
                acc._basketSizeTotal = Number(acc._basketSizeTotal || 0) + Number(data._basketSizeTotal || 0);
                acc._basketSizeCount = Number(acc._basketSizeCount || 0) + Number(data._basketSizeCount || 0);
                acc._categoryVotes = mergeVotes(
                    (acc._categoryVotes || {}) as Record<string, number>,
                    (data._categoryVotes || {}) as Record<string, number>,
                );
                acc._marketVotes = mergeVotes(
                    (acc._marketVotes || {}) as Record<string, number>,
                    (data._marketVotes || {}) as Record<string, number>,
                );
                acc.periodStart = String(acc.periodStart || data.periodStart || currentMonthBounds().periodStart);
                acc.periodEnd = String(acc.periodEnd || data.periodEnd || currentMonthBounds().periodEnd);
                return acc;
            }, targetSnap.exists() ? { ...targetSnap.data() } : {});

            const purchaseCount = Number(merged.purchaseCount || 0);
            const totalSpent = Math.round(Number(merged.totalSpent || 0) * 100) / 100;
            const basketSizeTotal = Number(merged._basketSizeTotal || 0);
            const basketSizeCount = Number(merged._basketSizeCount || 0);
            const averageTicket = purchaseCount > 0 ? Math.round((totalSpent / purchaseCount) * 100) / 100 : 0;
            const basketAvgSize = basketSizeCount > 0 ? Math.round((basketSizeTotal / basketSizeCount) * 10) / 10 : 0;
            const categoryVotes = (merged._categoryVotes || {}) as Record<string, number>;
            const marketVotes = (merged._marketVotes || {}) as Record<string, number>;

            await setDoc(targetRef, {
                periodStart: merged.periodStart || currentMonthBounds().periodStart,
                periodEnd: merged.periodEnd || currentMonthBounds().periodEnd,
                purchaseCount,
                totalSpent,
                averageTicket,
                topCategories: topN(categoryVotes),
                topMarketIds: topN(marketVotes),
                basketAvgSize,
                estimatedSavings: Math.round(Number(merged.estimatedSavings || 0) * 100) / 100,
                _categoryVotes: categoryVotes,
                _marketVotes: marketVotes,
                _basketSizeTotal: basketSizeTotal,
                _basketSizeCount: basketSizeCount,
                updatedAt: serverTimestamp(),
            }, { merge: true });

            await Promise.all(sourceSnaps.map(async (snap) => {
                if (!snap.exists()) return;
                await deleteDoc(snap.ref);
            }));
        } catch (err) {
            console.error('[AnalyticsEventWriter] Falha ao unificar aggregates (não crítico):', err);
        }
    }
}

export const analyticsEventWriter = new AnalyticsEventWriter();
