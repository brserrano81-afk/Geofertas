export interface ShoppingListItem {
    id?: string;
    name: string;
    quantity?: number;
    unit?: string;
}

export interface ShoppingItemOfferCandidate {
    itemName: string;
    productName: string;
    marketName: string;
    marketId: string;
    price: number;
    quantity: number;
    unit?: string;
    totalPrice: number;
    expiresAt?: string;
}

export interface MarketComparisonItem {
    item: ShoppingListItem;
    offer: ShoppingItemOfferCandidate;
}

export interface MarketComparisonEntry {
    marketName: string;
    marketId: string;
    coverage: number;
    coveredItems: MarketComparisonItem[];
    missingItems: ShoppingListItem[];
    total: number;
}

export interface ShoppingComparisonResult {
    items: ShoppingListItem[];
    ranking: MarketComparisonEntry[];
    bestMarket?: MarketComparisonEntry;
    comparedAt: string;
}

export interface ActiveShoppingList {
    id?: string;
    userId: string;
    status: string;
    items: ShoppingListItem[];
    createdAt?: unknown;
    updatedAt?: unknown;
    completedAt?: unknown;
}
