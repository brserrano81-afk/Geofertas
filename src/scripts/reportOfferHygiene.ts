import fs from 'fs';
import path from 'path';
import { collection, getDocs } from 'firebase/firestore';

import { db } from '../firebase';
import { offerHygieneService } from '../services/OfferHygieneService';

async function main() {
    const offersSnap = await getDocs(collection(db, 'offers'));
    const analyses = await Promise.all(
        offersSnap.docs.map((docSnap) =>
            offerHygieneService.analyzeOffer({
                id: docSnap.id,
                ...(docSnap.data() as Record<string, unknown>),
            }),
        ),
    );

    const summary = offerHygieneService.buildSummary(analyses);
    const archiveCandidates = analyses
        .filter((analysis) => analysis.shouldArchive)
        .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName))
        .slice(0, 300);
    const reviewCandidates = analyses
        .filter((analysis) => !analysis.shouldArchive && analysis.reviewReasons.length > 0)
        .sort((a, b) => a.canonicalName.localeCompare(b.canonicalName))
        .slice(0, 200);

    const report = {
        generatedAt: new Date().toISOString(),
        summary,
        archiveCandidates,
        reviewCandidates,
    };

    const reportDir = path.join(process.cwd(), 'logs', 'runtime');
    fs.mkdirSync(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `offer-hygiene-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

    console.log(JSON.stringify({
        reportPath,
        ...summary,
        archiveExamples: archiveCandidates.slice(0, 15),
        reviewExamples: reviewCandidates.slice(0, 15),
    }, null, 2));
}

main().catch((err) => {
    console.error('[reportOfferHygiene] Error:', err);
    process.exit(1);
});
