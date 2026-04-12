// ─────────────────────────────────────────────
// GeoDecisionEngine — Motor de decisão geográfica
// Calcula melhor mercado baseado em distância + preço + transporte
// ─────────────────────────────────────────────

import { haversineDistance, calculateTransportCost, type TransportMode } from '../app/utils/geoUtils';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

interface MarketResult {
    marketId: string;
    marketName: string;
    lat: number;
    lng: number;
    distance: number;
    transportCost: number;
    productPrice?: number;
    totalCost: number;
}

class GeoDecisionEngine {
    async findNearbyMarkets(
        userLat: number,
        userLng: number,
        radiusKm: number = 10,
    ): Promise<MarketResult[]> {
        try {
            const marketsRef = collection(db, 'markets');
            const snap = await getDocs(marketsRef);
            const results: MarketResult[] = [];

            snap.forEach(doc => {
                const data = doc.data();
                const lat = data.location?.lat || data.geo?.lat;
                const lng = data.location?.lng || data.geo?.lng;

                if (lat && lng) {
                    const dist = haversineDistance(userLat, userLng, lat, lng);
                    if (dist <= radiusKm) {
                        results.push({
                            marketId: doc.id,
                            marketName: data.name || 'Mercado',
                            lat,
                            lng,
                            distance: Math.round(dist * 10) / 10,
                            transportCost: 0,
                            totalCost: 0,
                        });
                    }
                }
            });

            results.sort((a, b) => a.distance - b.distance);
            return results.slice(0, 5);
        } catch (err) {
            console.error('[GeoDecisionEngine] Error:', err);
            return [];
        }
    }

    async findBestMarketForProduct(
        _productName: string,
        userLat: number,
        userLng: number,
        transportMode: TransportMode = 'car',
        consumption: number = 10,
        busTicket: number = 4.50,
    ): Promise<MarketResult[]> {
        const nearby = await this.findNearbyMarkets(userLat, userLng);

        const enriched = nearby.map(m => {
            const transport = calculateTransportCost(m.distance, transportMode, consumption, busTicket);
            return {
                ...m,
                transportCost: Math.round(transport * 100) / 100,
                totalCost: Math.round(transport * 100) / 100, // sem preço de produto por enquanto
            };
        });

        enriched.sort((a, b) => a.totalCost - b.totalCost);
        return enriched;
    }

    formatNearbyMarketsResponse(markets: MarketResult[]): string {
        if (markets.length === 0) {
            return "Não encontrei mercados próximos à sua localização.";
        }

        const lines = markets.map((m, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return `${medal} **${m.marketName}** — ${m.distance} km`;
        });

        return `📍 **Mercados próximos:**\n\n${lines.join('\n')}`;
    }
}

export const geoDecisionEngine = new GeoDecisionEngine();
