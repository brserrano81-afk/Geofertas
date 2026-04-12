import { doc, setDoc } from 'firebase/firestore';

import { db } from '../firebase';

type SeedProduct = {
    id: string;
    name: string;
    brand: string;
    category: string;
    synonyms: string[];
};

const PRODUCTS: SeedProduct[] = [
    {
        id: 'p_cerveja_skol_lata_350ml',
        name: 'Cerveja Skol Lata 350ml',
        brand: 'Skol',
        category: 'bebidas',
        synonyms: ['skol', 'skol lata', 'cerveja skol', 'cerveja skol lata', 'skol 350ml'],
    },
    {
        id: 'p_cerveja_crystal_lata_350ml',
        name: 'Cerveja Crystal Lata 350ml',
        brand: 'Crystal',
        category: 'bebidas',
        synonyms: ['crystal', 'crystal lata', 'cerveja crystal', 'cerveja crystal lata', 'crystal 350ml'],
    },
    {
        id: 'p_cerveja_itaipava_lata_350ml',
        name: 'Cerveja Itaipava Lata 350ml',
        brand: 'Itaipava',
        category: 'bebidas',
        synonyms: ['itaipava', 'itaipava lata', 'cerveja itaipava', 'cerveja itaipava lata', 'itaipava 350ml'],
    },
    {
        id: 'p_cerveja_amstel_lata_350ml',
        name: 'Cerveja Amstel Lata 350ml',
        brand: 'Amstel',
        category: 'bebidas',
        synonyms: ['amstel', 'amstel lata', 'cerveja amstel', 'cerveja amstel lata', 'amstel 350ml'],
    },
    {
        id: 'p_cerveja_bohemia_lata_350ml',
        name: 'Cerveja Bohemia Lata 350ml',
        brand: 'Bohemia',
        category: 'bebidas',
        synonyms: ['bohemia', 'bohemia lata', 'cerveja bohemia', 'cerveja bohemia lata', 'bohemia 350ml'],
    },
    {
        id: 'p_cerveja_spaten_lata_350ml',
        name: 'Cerveja Spaten Lata 350ml',
        brand: 'Spaten',
        category: 'bebidas',
        synonyms: ['spaten', 'spaten lata', 'cerveja spaten', 'cerveja spaten lata', 'spaten 350ml'],
    },
];

async function main() {
    for (const product of PRODUCTS) {
        await setDoc(doc(db, 'products', product.id), {
            ...product,
            active: true,
            updatedAt: new Date().toISOString(),
        }, { merge: true });
        console.log(`upserted:${product.id}`);
    }

    console.log(`done:${PRODUCTS.length}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
