// Seed: Extrabom Ofertas
// npx tsx src/scripts/seedExtrabomOffers.ts
import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc } from 'firebase/firestore';

const app = initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'economizafacil-8bf1c' });
const db = getFirestore(app);

async function seed() {
    console.log('📦 Seeding Extrabom offers...');
    const batch = writeBatch(db);
    const offers = [
        { productName: 'Arroz Tio João 5kg', price: 26.90, marketName: 'Extrabom', networkName: 'Extrabom', category: 'grãos' },
        { productName: 'Feijão Carioca Camil 1kg', price: 7.99, marketName: 'Extrabom', networkName: 'Extrabom', category: 'grãos' },
        { productName: 'Óleo de Soja Soya 900ml', price: 6.49, marketName: 'Extrabom', networkName: 'Extrabom', category: 'óleos' },
        { productName: 'Café Pilão 500g', price: 17.90, marketName: 'Extrabom', networkName: 'Extrabom', category: 'bebidas' },
        { productName: 'Açúcar União 1kg', price: 5.29, marketName: 'Extrabom', networkName: 'Extrabom', category: 'básicos' },
        { productName: 'Leite Integral Piracanjuba 1L', price: 5.89, marketName: 'Extrabom', networkName: 'Extrabom', category: 'laticínios' },
    ];
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    for (const offer of offers) {
        const id = `extrabom_${offer.productName.replace(/\s+/g, '_').toLowerCase()}`;
        batch.set(doc(db, 'offers', id), { ...offer, startsAt: now, expiresAt: expires, marketId: 'extrabom-praia-campista' });
    }
    await batch.commit();
    console.log(`✅ Seeded ${offers.length} Extrabom offers.`);
}
seed().catch(console.error);
