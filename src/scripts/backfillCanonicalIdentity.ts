import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';

const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('[BackfillCanonicalIdentity] ERRO: service-account.json não encontrado.');
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccountPath) });
const db = getFirestore();
const DRY_RUN = process.argv.includes('--dry-run');
const SUBCOLLECTIONS = ['purchases', 'lists', 'interactions'] as const;

function normalizeValue(value = ''): string {
    return String(value || '').trim().toLowerCase();
}

function normalizeRemoteJid(remoteJid = ''): string {
    const normalized = normalizeValue(remoteJid);
    if (!normalized) return '';
    if (normalized.includes('@')) return normalized;
    return `${normalized}@s.whatsapp.net`;
}

function normalizeBsuid(bsuid = ''): string {
    return normalizeValue(bsuid).replace(/\s+/g, '');
}

function extractPhoneNumber(remoteJid = ''): string {
    const digits = normalizeRemoteJid(remoteJid).split('@')[0].replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 11 && !digits.startsWith('55')) {
        return `55${digits}`;
    }
    return digits;
}

function canonicalUserIdFor(userId: string, data: FirebaseFirestore.DocumentData): string {
    const explicitCanonical = String(data.canonicalUserId || '').trim();
    if (explicitCanonical) return explicitCanonical;

    const bsuid = normalizeBsuid(String(data.bsuid || data.businessScopedUserId || ''));
    if (bsuid) return `bsuid:${bsuid}`;

    const remoteJid = normalizeRemoteJid(String(data.remoteJid || userId));
    const phone = extractPhoneNumber(remoteJid);
    if (phone) return `wa:${phone}`;

    return userId;
}

async function copySubcollection(sourceUserId: string, targetUserId: string, subcollection: typeof SUBCOLLECTIONS[number]): Promise<number> {
    if (sourceUserId === targetUserId) return 0;

    const snap = await db.collection('users').doc(sourceUserId).collection(subcollection).get();
    if (snap.empty) return 0;

    let copied = 0;
    for (const docSnap of snap.docs) {
        if (!DRY_RUN) {
            await db.collection('users').doc(targetUserId).collection(subcollection).doc(docSnap.id).set({
                ...docSnap.data(),
                canonicalUserId: targetUserId,
                legacyUserId: sourceUserId,
                migratedFromLegacyAt: Timestamp.now(),
            }, { merge: true });
        }
        copied++;
    }
    return copied;
}

async function mergeAggregate(sourceUserId: string, targetUserId: string): Promise<void> {
    if (sourceUserId === targetUserId) return;

    const [sourceSnap, targetSnap] = await Promise.all([
        db.collection('user_aggregates').doc(sourceUserId).get(),
        db.collection('user_aggregates').doc(targetUserId).get(),
    ]);

    if (!sourceSnap.exists) return;

    const source = sourceSnap.data() || {};
    const target = targetSnap.exists ? targetSnap.data() || {} : {};
    const mergeVotes = (a: Record<string, number>, b: Record<string, number>) => {
        const result = { ...a };
        for (const [key, value] of Object.entries(b || {})) {
            result[key] = (result[key] || 0) + Number(value || 0);
        }
        return result;
    };

    const categoryVotes = mergeVotes(target._categoryVotes || {}, source._categoryVotes || {});
    const marketVotes = mergeVotes(target._marketVotes || {}, source._marketVotes || {});
    const purchaseCount = Number(target.purchaseCount || 0) + Number(source.purchaseCount || 0);
    const totalSpent = Number(target.totalSpent || 0) + Number(source.totalSpent || 0);
    const basketSizeTotal = Number(target._basketSizeTotal || 0) + Number(source._basketSizeTotal || 0);
    const basketSizeCount = Number(target._basketSizeCount || 0) + Number(source._basketSizeCount || 0);

    const topN = (votes: Record<string, number>) => Object.entries(votes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key]) => key);

    if (!DRY_RUN) {
        await db.collection('user_aggregates').doc(targetUserId).set({
            periodStart: target.periodStart || source.periodStart || new Date().toISOString().slice(0, 10),
            periodEnd: target.periodEnd || source.periodEnd || new Date().toISOString().slice(0, 10),
            purchaseCount,
            totalSpent,
            averageTicket: purchaseCount > 0 ? Number((totalSpent / purchaseCount).toFixed(2)) : 0,
            topCategories: topN(categoryVotes),
            topMarketIds: topN(marketVotes),
            basketAvgSize: basketSizeCount > 0 ? Number((basketSizeTotal / basketSizeCount).toFixed(1)) : 0,
            estimatedSavings: Number(target.estimatedSavings || 0) + Number(source.estimatedSavings || 0),
            _categoryVotes: categoryVotes,
            _marketVotes: marketVotes,
            _basketSizeTotal: basketSizeTotal,
            _basketSizeCount: basketSizeCount,
            updatedAt: Timestamp.now(),
        }, { merge: true });

        await db.collection('user_aggregates').doc(sourceUserId).delete();
    }
}

async function run(): Promise<void> {
    const usersSnap = await db.collection('users').get();
    let migratedUsers = 0;
    let copiedDocs = 0;

    for (const userDoc of usersSnap.docs) {
        const sourceUserId = userDoc.id;
        const data = userDoc.data();
        const canonicalUserId = canonicalUserIdFor(sourceUserId, data);
        const remoteJid = normalizeRemoteJid(String(data.remoteJid || sourceUserId));
        const bsuid = normalizeBsuid(String(data.bsuid || ''));
        const phoneNumber = extractPhoneNumber(remoteJid);
        const legacyUserId = sourceUserId.includes('@') ? sourceUserId : String(data.legacyUserId || sourceUserId);

        if (!DRY_RUN) {
            await db.collection('canonical_identities').doc(canonicalUserId).set({
                canonicalUserId,
                storageUserId: canonicalUserId,
                legacyUserId,
                bsuid: bsuid || null,
                remoteJid: remoteJid || null,
                phoneNumber: phoneNumber || null,
                channel: remoteJid ? 'whatsapp' : 'web',
                requiresBackfill: false,
                aliases: [
                    bsuid ? `bsuid:${bsuid}` : null,
                    phoneNumber ? `phone:${phoneNumber}` : null,
                    remoteJid ? `remoteJid:${remoteJid}` : null,
                ].filter(Boolean),
                backfilledAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                createdAt: Timestamp.now(),
            }, { merge: true });

            for (const alias of [
                bsuid ? `bsuid:${bsuid}` : null,
                phoneNumber ? `phone:${phoneNumber}` : null,
                remoteJid ? `remoteJid:${remoteJid}` : null,
            ].filter(Boolean) as string[]) {
                await db.collection('identity_aliases').doc(alias).set({
                    canonicalUserId,
                    storageUserId: canonicalUserId,
                    legacyUserId,
                    bsuid: bsuid || null,
                    remoteJid: remoteJid || null,
                    phoneNumber: phoneNumber || null,
                    channel: remoteJid ? 'whatsapp' : 'web',
                    updatedAt: Timestamp.now(),
                    createdAt: Timestamp.now(),
                }, { merge: true });
            }

            await db.collection('users').doc(canonicalUserId).set({
                ...data,
                userId: canonicalUserId,
                canonicalUserId,
                storageUserId: canonicalUserId,
                legacyUserId,
                bsuid: bsuid || null,
                remoteJid: remoteJid || null,
                identityBackfilledAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            }, { merge: true });
        }

        for (const subcollection of SUBCOLLECTIONS) {
            copiedDocs += await copySubcollection(sourceUserId, canonicalUserId, subcollection);
        }

        await mergeAggregate(sourceUserId, canonicalUserId);
        migratedUsers++;
    }

    console.log(`[BackfillCanonicalIdentity] usuários processados: ${migratedUsers}`);
    console.log(`[BackfillCanonicalIdentity] documentos de subcoleção copiados: ${copiedDocs}`);
    console.log(`[BackfillCanonicalIdentity] dryRun: ${DRY_RUN}`);
}

run().catch((err) => {
    console.error('[BackfillCanonicalIdentity] ERRO FATAL:', err);
    process.exit(1);
});
