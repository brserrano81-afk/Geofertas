import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';

const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('[RetentionJob] ERRO: service-account.json não encontrado.');
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccountPath) });
const db = getFirestore();

const RETENTION_DAYS = 365;
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_LIMIT = 400;

function generateAnonymousId(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = (hash << 5) - hash + userId.charCodeAt(i);
        hash |= 0;
    }
    return `anon_${Math.abs(hash).toString(36)}`;
}

async function clearSubcollection(userId: string, subcollection: string): Promise<number> {
    const colRef = db.collection('users').doc(userId).collection(subcollection);
    const snap = await colRef.get();
    if (snap.empty) return 0;

    let deleted = 0;
    let batch = db.batch();
    let opCount = 0;

    for (const docSnap of snap.docs) {
        batch.delete(docSnap.ref);
        opCount++;
        deleted++;

        if (opCount >= BATCH_LIMIT) {
            if (!DRY_RUN) await batch.commit();
            batch = db.batch();
            opCount = 0;
        }
    }

    if (opCount > 0 && !DRY_RUN) await batch.commit();
    return deleted;
}

async function getCompatibleUserIds(canonicalDocId: string, canonicalData: FirebaseFirestore.DocumentData): Promise<string[]> {
    const ids = new Set<string>([
        canonicalDocId,
        String(canonicalData.storageUserId || '').trim(),
        String(canonicalData.legacyUserId || '').trim(),
    ].filter(Boolean));

    return Array.from(ids);
}

async function anonymizeCanonicalIdentity(canonicalDocId: string, canonicalData: FirebaseFirestore.DocumentData): Promise<void> {
    const compatibleUserIds = await getCompatibleUserIds(canonicalDocId, canonicalData);

    if (!DRY_RUN) {
        for (const userId of compatibleUserIds) {
            await db.collection('users').doc(userId).set({
                name: null,
                lastMessagePreview: null,
                lastIntent: null,
                neighborhood: null,
                transportMode: null,
                consumption: null,
                busTicket: null,
                optimizationPreference: null,
                locationDeclaredAt: null,
                locationSource: null,
                userLocation: null,
                preferences: null,
                anonymizedAt: Timestamp.now(),
                retentionJobReason: 'inactivity_ttl',
                anonymousAlias: generateAnonymousId(canonicalDocId),
                canonicalUserId: canonicalDocId,
                storageUserId: canonicalDocId,
                remoteJid: null,
                bsuid: null,
            }, { merge: true });

            const deletedInteractions = await clearSubcollection(userId, 'interactions');
            const deletedPurchases = await clearSubcollection(userId, 'purchases');
            const deletedLists = await clearSubcollection(userId, 'lists');
            await db.collection('user_aggregates').doc(userId).delete().catch(() => undefined);

            console.log(`[RetentionJob] ✅ ${userId} anonimizado | interactions:${deletedInteractions} purchases:${deletedPurchases} lists:${deletedLists}`);
        }

        const aliasSnap = await db.collection('identity_aliases')
            .where('canonicalUserId', '==', canonicalDocId)
            .get();
        for (const aliasDoc of aliasSnap.docs) {
            await aliasDoc.ref.delete();
        }
        await db.collection('canonical_identities').doc(canonicalDocId).delete();
    } else {
        console.log(`[RetentionJob] [DRY_RUN] Seria anonimizado: ${canonicalDocId} -> ${compatibleUserIds.join(', ')}`);
    }
}

async function runRetentionJob(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
    console.log(`[RetentionJob] Cutoff: ${cutoffDate.toISOString()} (${RETENTION_DAYS} dias)`);

    const canonicalSnap = await db.collection('canonical_identities').get();
    let processed = 0;
    let anonymized = 0;
    let skipped = 0;

    for (const canonicalDoc of canonicalSnap.docs) {
        processed++;
        const data = canonicalDoc.data();
        const canonicalUserId = canonicalDoc.id;

        const userRef = db.collection('users').doc(canonicalUserId);
        const userSnap = await userRef.get();
        const userData = userSnap.exists ? userSnap.data() || {} : {};

        if (userData.anonymizedAt) {
            skipped++;
            continue;
        }

        const userRetentionDays = Number(userData.dataRetentionDays || RETENTION_DAYS);
        const userCutoff = new Date();
        userCutoff.setDate(userCutoff.getDate() - userRetentionDays);
        const userCutoffTs = Timestamp.fromDate(userCutoff);
        const lastInteractionAt = userData.lastInteractionAt as Timestamp | undefined;

        if (!lastInteractionAt) {
            const createdAt = userData.createdAt as Timestamp | undefined;
            if (!createdAt || createdAt.toMillis() > userCutoffTs.toMillis()) {
                skipped++;
                continue;
            }
        } else if (lastInteractionAt.toMillis() > userCutoffTs.toMillis()) {
            skipped++;
            continue;
        }

        console.log(`[RetentionJob] Anonimizando: ${canonicalUserId}`);
        await anonymizeCanonicalIdentity(canonicalUserId, data);
        anonymized++;
    }

    console.log(`[RetentionJob] Total processados : ${processed}`);
    console.log(`[RetentionJob] Anonimizados      : ${anonymized}`);
    console.log(`[RetentionJob] Ignorados (ativos): ${skipped}`);
    console.log(`[RetentionJob] DryRun            : ${DRY_RUN}`);
}

runRetentionJob().catch((err) => {
    console.error('[RetentionJob] ERRO FATAL:', err);
    process.exit(1);
});
