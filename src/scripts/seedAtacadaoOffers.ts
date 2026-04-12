// Seed: Atacadão Ofertas
// npx tsx src/scripts/seedAtacadaoOffers.ts
import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc } from 'firebase/firestore';

const app = initializeApp({ projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'economizafacil-8bf1c' });
const db = getFirestore(app);

async function seed() {
    console.log('📦 Seeding Atacadão offers...');
    const batch = writeBatch(db);
    const offers = [
        { productName: 'Arroz Tio João 5kg', price: 24.99, marketName: 'Atacadão', networkName: 'Atacadão', category: 'grãos' },
        { productName: 'Feijão Carioca Camil 1kg', price: 7.49, marketName: 'Atacadão', networkName: 'Atacadão', category: 'grãos' },
        { productName: 'Óleo de Soja Soya 900ml', price: 5.99, marketName: 'Atacadão', networkName: 'Atacadão', category: 'óleos' },
        { productName: 'Café Pilão 500g', price: 16.90, marketName: 'Atacadão', networkName: 'Atacadão', category: 'bebidas' },
        { productName: 'Açúcar União 1kg', price: 4.99, marketName: 'Atacadão', networkName: 'Atacadão', category: 'básicos' },
        { productName: 'Leite Integral Piracanjuba 1L', price: 5.49, marketName: 'Atacadão', networkName: 'Atacadão', category: 'laticínios' },
    ];
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    for (const offer of offers) {
        const id = `atacadao_${offer.productName.replace(/\s+/g, '_').toLowerCase()}`;
        batch.set(doc(db, 'offers', id), { ...offer, startsAt: now, expiresAt: expires, marketId: 'atacadao-camburi' });
    }
    await batch.commit();
    console.log(`✅ Seeded ${offers.length} Atacadão offers.`);
}
seed().catch(console.error);
