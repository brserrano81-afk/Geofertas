import fs from 'fs';
import path from 'path';
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';

import { db } from '../firebase';

type CsvRow = Record<string, string>;

function parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];

        if (char === '"') {
            if (inQuotes && line[index + 1] === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current);
    return values.map((value) => value.trim());
}

function parseCsv(content: string): CsvRow[] {
    const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length < 2) return [];

    const headers = parseCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        return headers.reduce<CsvRow>((acc, header, index) => {
            acc[header] = values[index] || '';
            return acc;
        }, {});
    });
}

function slugify(value: string): string {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function resolveArgs() {
    const args = process.argv.slice(2);
    return {
        filePath: args.find((arg) => !arg.startsWith('--')) || process.env.STAPLE_IMPORT_FILE || '',
        apply: args.includes('--apply'),
    };
}

async function main() {
    const { filePath, apply } = resolveArgs();
    if (!filePath) {
        throw new Error('Informe o caminho do CSV preenchido. Exemplo: npm run catalog:import-staples -- C:\\caminho\\arquivo.csv --apply');
    }

    const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(process.cwd(), filePath);

    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Arquivo não encontrado: ${absolutePath}`);
    }

    const rows = parseCsv(fs.readFileSync(absolutePath, 'utf8'));
    const importableRows = rows.filter((row) =>
        row.realPrice &&
        row.productId &&
        row.productName &&
        row.targetMarkets &&
        row.targetMarkets.trim().length > 0,
    );

    const [marketsSnap, productsSnap] = await Promise.all([
        getDocs(collection(db, 'markets')),
        getDocs(collection(db, 'products')),
    ]);

    const markets: Array<Record<string, unknown> & { id: string; name?: string }> = marketsSnap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) }));
    const products = new Map(productsSnap.docs.map((docSnap) => [docSnap.id, docSnap.data() as Record<string, unknown>]));

    const preview: Array<Record<string, unknown>> = [];
    let importedCount = 0;

    for (const row of importableRows) {
        const targetMarkets = row.targetMarkets.split('|').map((value) => value.trim()).filter(Boolean);
        const realPrice = Number(String(row.realPrice).replace(',', '.'));
        if (!Number.isFinite(realPrice) || realPrice <= 0) continue;

        const product = products.get(row.productId);
        if (!product) continue;

        for (const marketName of targetMarkets) {
            const market = markets.find((item) => String(item.name || '').trim() === marketName);
            const record = {
                productId: row.productId,
                productName: row.productName,
                brand: row.brand || '',
                category: row.category || String(product.category || ''),
                marketName,
                marketId: market?.id || '',
                price: realPrice,
                active: true,
                source: 'manual_csv_import',
                collectedAt: row.collectedAt || new Date().toISOString(),
                sourceUrl: row.sourceUrl || '',
                notes: row.notes || '',
                updatedAt: serverTimestamp(),
            };

            if (preview.length < 25) {
                preview.push(record);
            }

            if (apply) {
                const offerId = `${slugify(market?.id || marketName)}_${slugify(row.productId)}`;
                await setDoc(doc(db, 'offers', offerId), record, { merge: true });
            }

            importedCount += 1;
        }
    }

    console.log(JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        sourceFile: absolutePath,
        inputRows: rows.length,
        importableRows: importableRows.length,
        generatedOfferWrites: importedCount,
        preview,
    }, null, 2));
}

main().catch((err) => {
    console.error('[importStapleOffersFromCsv] Error:', err);
    process.exit(1);
});
