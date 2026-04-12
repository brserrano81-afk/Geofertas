export interface MatchResult {
    matched: Array<{ name: string; price: number }>;
    impulse: Array<{ name: string; price: number }>;
}

function normalize(value: string): string {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

export function matchReceiptToList(
    receiptItems: Array<{ name?: string; productName?: string; description?: string; price?: number }>,
    listItems: Array<{ name?: string }>,
): MatchResult {
    const listNormalized = new Set(
        listItems.map((item) => normalize(String(item.name || ''))).filter(Boolean),
    );

    const matched: Array<{ name: string; price: number }> = [];
    const impulse: Array<{ name: string; price: number }> = [];

    for (const item of receiptItems || []) {
        const name = String(item.name || item.productName || item.description || '').trim();
        const price = Number(item.price || 0);
        if (!name) continue;

        const normalized = normalize(name);
        const entry = { name, price };
        if (Array.from(listNormalized).some((listName) => normalized.includes(listName) || listName.includes(normalized))) {
            matched.push(entry);
        } else {
            impulse.push(entry);
        }
    }

    return { matched, impulse };
}
