// ─────────────────────────────────────────────
// Seed Base: Atacadão — Catálogo de produtos e mercados
// npx tsx src/scripts/seedAtacadaoBase.ts
// ─────────────────────────────────────────────

import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';

async function seed() {
    console.log('🏪 Seeding Atacadão base...');
    const batch = writeBatch(db);

    const network = {
        id: 'atacadao',
        name: 'Atacadão',
        type: 'atacado',
    };

    batch.set(doc(db, 'networks', network.id), network);

    const markets = [
        { id: 'atacadao-camburi', name: 'Atacadão Camburi', networkId: 'atacadao', address: 'Av. Dante Michelini, Jardim Camburi', location: { lat: -20.2655, lng: -40.2680 } },
        { id: 'atacadao-vila-velha', name: 'Atacadão Vila Velha', networkId: 'atacadao', address: 'Rod. do Sol, Vila Velha', location: { lat: -20.3650, lng: -40.3100 } },
        { id: 'atacadao-cariacica', name: 'Atacadão Cariacica', networkId: 'atacadao', address: 'Campo Grande, Cariacica', location: { lat: -20.3350, lng: -40.3700 } },
    ];

    for (const market of markets) {
        batch.set(doc(db, 'markets', market.id), market);
    }

    await batch.commit();
    console.log(`✅ Seeded ${markets.length} Atacadão markets.`);
}

seed().catch(console.error);
