// ─────────────────────────────────────────────────────────────────────────────
// AnalyticsService — lê analytics_events e user_aggregates
// Nunca expõe PII, histórico individual nem userId nos resultados.
// Toda agregação é feita client-side (MVP — sem Cloud Functions).
// ─────────────────────────────────────────────────────────────────────────────

import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '../../firebase';

// ── Tipos públicos ────────────────────────────────────────────────────────────

export interface RankedItem {
    label: string;
    count: number;
}

export interface AnalyticsSummary {
    // ── Metadados ────────────────────────────────────────────────────────────
    eventCount: number;
    userCount: number;

    // ── Top listas ───────────────────────────────────────────────────────────
    /** Categorias com mais registros de compra (purchase_recorded) */
    topCategories: RankedItem[];
    /** Categorias com mais consultas de preço (price_queried) — "top produtos" */
    topPriceQueryCategories: RankedItem[];
    /** marketIds mais frequentes em todos os eventos */
    topMarkets: RankedItem[];
    /** Regiões (slugs de bairro) com mais eventos de compra */
    topRegions: RankedItem[];

    // ── Frequência temporal ───────────────────────────────────────────────────
    /** Contagem por dia da semana: [Dom, Seg, Ter, Qua, Qui, Sex, Sab] */
    weekdayFrequency: number[];
    /** Matriz [weekday 0-6][hour 0-23] para o heatmap */
    weekdayHourMatrix: number[][];

    // ── Agregados de usuário (média de user_aggregates) ───────────────────────
    avgTicket: number;
    avgBasketSize: number;
    avgSavings: number;
    totalPurchases: number;
}

// ── Helpers internos ──────────────────────────────────────────────────────────

function topN(
    counts: Map<string, number>,
    n: number,
    labelTransform?: (k: string) => string,
): RankedItem[] {
    return Array.from(counts.entries())
        .filter(([key]) => Boolean(key))
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([key, count]) => ({
            label: labelTransform ? labelTransform(key) : key,
            count,
        }));
}

function increment(map: Map<string, number>, key: string) {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
}

// ── AnalyticsService ──────────────────────────────────────────────────────────

class AnalyticsService {
    /**
     * Carrega e agrega eventos dos últimos 5 000 registros.
     * Limita o custo de leitura no Firestore para o MVP.
     */
    async loadSummary(): Promise<AnalyticsSummary> {
        const [eventsSnap, aggregatesSnap] = await Promise.all([
            getDocs(
                query(
                    collection(db, 'analytics_events'),
                    orderBy('createdAt', 'desc'),
                    limit(5000),
                ),
            ),
            getDocs(collection(db, 'user_aggregates')),
        ]);

        // ── Agregação de analytics_events ────────────────────────────────────
        const purchaseCategoryCount = new Map<string, number>();
        const priceQueryCategoryCount = new Map<string, number>();
        const marketCount = new Map<string, number>();
        const regionCount = new Map<string, number>();
        const weekdayFrequency = new Array<number>(7).fill(0);
        const weekdayHourMatrix: number[][] = Array.from({ length: 7 }, () =>
            new Array<number>(24).fill(0),
        );

        eventsSnap.forEach((docSnap) => {
            const d = docSnap.data();
            const eventType: string = d.eventType || '';
            const categorySlug: string = d.categorySlug || '';
            const marketId: string = d.marketId || '';
            const marketRegion: string = d.marketRegion || '';
            const weekday: number = Number(d.weekday ?? -1);
            const hour: number = Number(d.hour ?? -1);

            if (eventType === 'purchase_recorded' && categorySlug) {
                increment(purchaseCategoryCount, categorySlug);
            }
            if (eventType === 'price_queried' && categorySlug) {
                increment(priceQueryCategoryCount, categorySlug);
            }
            if (marketId) increment(marketCount, marketId);
            if (marketRegion && eventType === 'purchase_recorded') {
                increment(regionCount, marketRegion);
            }
            if (weekday >= 0 && weekday <= 6) {
                weekdayFrequency[weekday]++;
                if (hour >= 0 && hour <= 23) {
                    weekdayHourMatrix[weekday][hour]++;
                }
            }
        });

        // ── Agregação de user_aggregates ──────────────────────────────────────
        let totalTicket = 0;
        let totalBasket = 0;
        let totalSavings = 0;
        let totalPurchases = 0;
        let usersWithData = 0;

        aggregatesSnap.forEach((docSnap) => {
            const d = docSnap.data();
            const avgTicket = Number(d.averageTicket || 0);
            const basketAvg = Number(d.basketAvgSize || 0);
            const savings = Number(d.estimatedSavings || 0);
            const purchases = Number(d.purchaseCount || 0);

            if (purchases > 0) {
                totalTicket += avgTicket;
                totalBasket += basketAvg;
                totalSavings += savings;
                totalPurchases += purchases;
                usersWithData++;
            }
        });

        const avgTicket = usersWithData > 0
            ? Math.round((totalTicket / usersWithData) * 100) / 100
            : 0;
        const avgBasketSize = usersWithData > 0
            ? Math.round((totalBasket / usersWithData) * 10) / 10
            : 0;
        const avgSavings = usersWithData > 0
            ? Math.round((totalSavings / usersWithData) * 100) / 100
            : 0;

        // ── Mapear marketId para rótulo legível (remove underscores) ─────────
        const labelMarket = (id: string) =>
            id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

        const labelCategory = (slug: string) =>
            slug
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (c) => c.toUpperCase());

        return {
            eventCount: eventsSnap.size,
            userCount: aggregatesSnap.size,
            topCategories: topN(purchaseCategoryCount, 8, labelCategory),
            topPriceQueryCategories: topN(priceQueryCategoryCount, 8, labelCategory),
            topMarkets: topN(marketCount, 8, labelMarket),
            topRegions: topN(regionCount, 8, (r) => r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())),
            weekdayFrequency,
            weekdayHourMatrix,
            avgTicket,
            avgBasketSize,
            avgSavings,
            totalPurchases,
        };
    }
}

export const analyticsService = new AnalyticsService();
