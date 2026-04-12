import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';

import { db } from '../firebase';

function resolveArgs() {
    const args = process.argv.slice(2);
    return {
        apply: args.includes('--apply'),
    };
}

async function main() {
    const { apply } = resolveArgs();
    const offersSnap = await getDocs(collection(db, 'offers'));
    const rawOffers = offersSnap.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as Record<string, unknown>) }))
        .filter(Boolean);
    const testOffers = (rawOffers as Array<Record<string, unknown> & { id: string }>)
        .filter((offer) => offer.source === 'test_seed' || offer.environment === 'staging' || offer.synthetic === true);

    if (apply) {
        const batchSize = 400;
        for (let index = 0; index < testOffers.length; index += batchSize) {
            const batch = writeBatch(db);
            for (const offer of testOffers.slice(index, index + batchSize)) {
                batch.delete(doc(db, 'offers', offer.id));
            }
            await batch.commit();
        }
    }

    console.log(JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        matchedTestOffers: testOffers.length,
        previewIds: testOffers.slice(0, 25).map((offer) => offer.id),
    }, null, 2));
}

main().catch((err) => {
    console.error('[clearTestOfferUniverse] Error:', err);
    process.exit(1);
});
