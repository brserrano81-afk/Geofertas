import { ListManager } from './ListManager';
import { offerEngine } from './OfferEngine';
import type {
    MarketComparisonEntry,
    MarketComparisonItem,
    ShoppingComparisonResult,
    ShoppingListItem,
} from '../types/shopping';

function rankMarkets(a: MarketComparisonEntry, b: MarketComparisonEntry): number {
    if (a.coverage !== b.coverage) {
        return b.coverage - a.coverage;
    }

    if (a.total !== b.total) {
        return a.total - b.total;
    }

    if (a.missingItems.length !== b.missingItems.length) {
        return a.missingItems.length - b.missingItems.length;
    }

    return a.marketName.localeCompare(b.marketName);
}

class ShoppingComparisonService {
    async compareActiveList(userId: string): Promise<ShoppingComparisonResult> {
        const listManager = new ListManager(userId);
        const activeList = await listManager.loadStructuredActiveList();

        if (!activeList || activeList.items.length === 0) {
            return {
                items: [],
                ranking: [],
                comparedAt: new Date().toISOString(),
            };
        }

        return this.compareItems(activeList.items);
    }

    async compareItems(items: ShoppingListItem[]): Promise<ShoppingComparisonResult> {
        const normalizedItems = items
            .filter((item) => item?.name?.trim())
            .map((item) => ({
                ...item,
                quantity: item.quantity && item.quantity > 0 ? item.quantity : 1,
            }));

        if (normalizedItems.length === 0) {
            return {
                items: [],
                ranking: [],
                comparedAt: new Date().toISOString(),
            };
        }

        const pricesByItem = await offerEngine.getPricesForItems(normalizedItems);
        const markets = new Map<string, { marketName: string; marketId: string; coveredItems: MarketComparisonItem[] }>();

        for (const item of normalizedItems) {
            const matches = pricesByItem.get(item.name) || [];

            for (const match of matches) {
                const marketKey = `${match.marketId || match.marketName}:${match.marketName}`.toLowerCase();
                if (!markets.has(marketKey)) {
                    markets.set(marketKey, {
                        marketName: match.marketName,
                        marketId: match.marketId,
                        coveredItems: [],
                    });
                }

                markets.get(marketKey)!.coveredItems.push({
                    item,
                    offer: match,
                });
            }
        }

        const ranking = Array.from(markets.values())
            .map((market): MarketComparisonEntry => {
                const coveredNames = new Set(market.coveredItems.map((entry) => entry.item.name));
                const missingItems = normalizedItems.filter((item) => !coveredNames.has(item.name));
                const total = market.coveredItems.reduce((sum, entry) => sum + entry.offer.totalPrice, 0);

                return {
                    marketName: market.marketName,
                    marketId: market.marketId,
                    coverage: market.coveredItems.length,
                    coveredItems: market.coveredItems.sort((a, b) => a.item.name.localeCompare(b.item.name)),
                    missingItems,
                    total: Math.round(total * 100) / 100,
                };
            })
            .sort(rankMarkets);

        return {
            items: normalizedItems,
            ranking,
            bestMarket: ranking[0],
            comparedAt: new Date().toISOString(),
        };
    }
}

export { ShoppingComparisonService };
export const shoppingComparisonService = new ShoppingComparisonService();
