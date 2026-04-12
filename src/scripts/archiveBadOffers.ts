import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { db } from '../firebase';
import { offerHygieneService } from '../services/OfferHygieneService';

async function main() {
    const archiveBatchId = `offer-archive-${Date.now()}`;
    const offersSnap = await getDocs(collection(db, 'offers'));

    let archivedCount = 0;
    const archivedExamples: Array<Record<string, unknown>> = [];

    for (const docSnap of offersSnap.docs) {
        const raw = {
            id: docSnap.id,
            ...(docSnap.data() as Record<string, unknown>),
        };

        const analysis = await offerHygieneService.analyzeOffer(raw);
        if (!analysis.shouldArchive) {
            continue;
        }

        const archiveRef = doc(db, 'offers_archive', docSnap.id);
        const offerRef = doc(db, 'offers', docSnap.id);

        await setDoc(archiveRef, {
            ...raw,
            archivedAt: serverTimestamp(),
            archiveBatchId,
            archiveReasons: analysis.reasons,
            reviewReasons: analysis.reviewReasons,
            matchedProductId: analysis.matchedProduct?.id || null,
        }, { merge: true });

        await updateDoc(offerRef, {
            active: false,
            archivedAt: serverTimestamp(),
            archiveBatchId,
            archiveReasons: analysis.reasons,
            reviewReasons: analysis.reviewReasons,
            matchedProductId: analysis.matchedProduct?.id || null,
        });

        archivedCount++;
        if (archivedExamples.length < 20) {
            archivedExamples.push({
                id: analysis.offerId,
                canonicalName: analysis.canonicalName,
                category: analysis.category,
                marketName: analysis.marketName,
                reasons: analysis.reasons,
            });
        }
    }

    console.log(JSON.stringify({
        archiveBatchId,
        archivedCount,
        archivedExamples,
    }, null, 2));
}

main().catch((err) => {
    console.error('[archiveBadOffers] Error:', err);
    process.exit(1);
});
