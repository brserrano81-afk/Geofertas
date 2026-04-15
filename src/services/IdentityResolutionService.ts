import { collection, doc, getDoc, getDocs, serverTimestamp as clientTimestamp, setDoc } from 'firebase/firestore';
import { db as clientDb } from '../firebase';
import { isServer } from '../lib/isServer';
import { adminDb as serverDb, admin } from '../lib/firebase-admin';

const serverTimestamp = isServer ? admin.firestore.FieldValue.serverTimestamp : clientTimestamp;
const db = isServer ? (serverDb as any) : clientDb;
import type { CanonicalIdentity } from '../types/identity';
import { analyticsEventWriter } from '../workers/AnalyticsEventWriter';

function normalizeValue(value: string): string {
    return String(value || '')
        .trim()
        .toLowerCase();
}

export function normalizeRemoteJid(remoteJid?: string | null): string {
    const normalized = normalizeValue(remoteJid || '');
    if (!normalized) return '';
    if (normalized.includes('@')) return normalized;
    return `${normalized}@s.whatsapp.net`;
}

export function extractPhoneNumberFromRemoteJid(remoteJid?: string | null): string {
    const digits = normalizeRemoteJid(remoteJid).split('@')[0].replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 11 && !digits.startsWith('55')) {
        return `55${digits}`;
    }
    return digits;
}

export function normalizeBsuid(bsuid?: string | null): string {
    return normalizeValue(bsuid || '').replace(/\s+/g, '');
}

export function buildLegacyUserId(remoteJid?: string | null): string {
    const normalizedRemoteJid = normalizeRemoteJid(remoteJid);
    if (normalizedRemoteJid) return normalizedRemoteJid;

    const phone = extractPhoneNumberFromRemoteJid(remoteJid);
    return phone ? `${phone}@s.whatsapp.net` : '';
}

export function buildCanonicalBsuidUserId(bsuid: string): string {
    return `bsuid:${normalizeBsuid(bsuid)}`;
}

export function buildCanonicalPhoneUserId(phoneNumber: string): string {
    return `wa:${String(phoneNumber || '').replace(/\D/g, '')}`;
}

function buildAliasKey(kind: 'bsuid' | 'phone' | 'remoteJid', value: string): string {
    return `${kind}:${normalizeValue(value)}`;
}

async function readAliasTarget(aliasKey: string): Promise<string | null> {
    if (isServer) {
        const snap = await db.collection('identity_aliases').doc(aliasKey).get();
        if (!snap.exists) return null;
        return String(snap.data().canonicalUserId || '').trim() || null;
    }

    const snap = await getDoc(doc(db, 'identity_aliases', aliasKey));
    if (!snap.exists()) {
        return null;
    }

    return String(snap.data().canonicalUserId || '').trim() || null;
}

async function hasUserDocument(userId: string): Promise<boolean> {
    if (!userId) return false;
    if (isServer) {
        const snap = await db.collection('users').doc(userId).get();
        return snap.exists;
    }
    const snap = await getDoc(doc(db, 'users', userId));
    return snap.exists();
}

class IdentityResolutionService {
    async resolveWhatsAppIdentity(params: {
        remoteJid?: string | null;
        bsuid?: string | null;
        channel?: 'whatsapp' | 'web';
    }): Promise<CanonicalIdentity> {
        const channel = params.channel || 'whatsapp';
        const remoteJid = normalizeRemoteJid(params.remoteJid);
        const legacyUserId = buildLegacyUserId(remoteJid);
        const phoneNumber = extractPhoneNumberFromRemoteJid(remoteJid);
        const bsuid = normalizeBsuid(params.bsuid);

        const aliasCandidates = [
            bsuid ? { key: buildAliasKey('bsuid', bsuid), source: 'bsuid_alias' as const } : null,
            phoneNumber ? { key: buildAliasKey('phone', phoneNumber), source: 'phone_alias' as const } : null,
            remoteJid ? { key: buildAliasKey('remoteJid', remoteJid), source: 'remote_jid_alias' as const } : null,
        ].filter(Boolean) as Array<{ key: string; source: CanonicalIdentity['resolutionSource'] }>;

        let canonicalUserId = '';
        let resolutionSource: CanonicalIdentity['resolutionSource'] =
            bsuid ? 'bsuid_generated' : 'phone_generated';

        for (const candidate of aliasCandidates) {
            const target = await readAliasTarget(candidate.key);
            if (target) {
                canonicalUserId = target;
                resolutionSource = candidate.source;
                break;
            }
        }

        if (!canonicalUserId) {
            canonicalUserId = bsuid
                ? buildCanonicalBsuidUserId(bsuid)
                : phoneNumber
                    ? buildCanonicalPhoneUserId(phoneNumber)
                    : legacyUserId || 'default_user';
        }

        const canonicalUserExists = await hasUserDocument(canonicalUserId);
        const legacyUserExists = legacyUserId !== canonicalUserId && await hasUserDocument(legacyUserId);
        const storageUserId = legacyUserExists && !canonicalUserExists
            ? legacyUserId
            : canonicalUserId;

        const identity: CanonicalIdentity = {
            canonicalUserId,
            storageUserId,
            legacyUserId: legacyUserId || canonicalUserId,
            bsuid: bsuid || undefined,
            phoneNumber: phoneNumber || undefined,
            remoteJid: remoteJid || undefined,
            channel,
            resolutionSource,
            requiresBackfill: legacyUserExists && storageUserId !== canonicalUserId,
            aliases: aliasCandidates.map((candidate) => candidate.key),
        };

        await this.persistIdentity(identity);
        await this.lazyBackfillCanonicalData(identity);

        return identity;
    }

    async getIdentitySnapshot(userId: string): Promise<CanonicalIdentity> {
        const normalizedUserId = String(userId || '').trim();
        if (!normalizedUserId) {
            return {
                canonicalUserId: 'default_user',
                storageUserId: 'default_user',
                legacyUserId: 'default_user',
                channel: 'web',
                resolutionSource: 'legacy_passthrough',
                requiresBackfill: false,
                aliases: [],
            };
        }

        if (normalizedUserId.includes('@')) {
            return this.resolveWhatsAppIdentity({ remoteJid: normalizedUserId, channel: 'whatsapp' });
        }

        if (isServer) {
            const snap = await db.collection('canonical_identities').doc(normalizedUserId).get();
            if (!snap.exists) {
                return {
                    canonicalUserId: normalizedUserId,
                    storageUserId: normalizedUserId,
                    legacyUserId: normalizedUserId,
                    remoteJid: normalizedUserId.includes('@') ? normalizedUserId : undefined,
                    channel: normalizedUserId.includes('@') ? 'whatsapp' : 'web',
                    resolutionSource: 'legacy_passthrough',
                    requiresBackfill: false,
                    aliases: [],
                };
            }
            const data = snap.data();
            return {
                canonicalUserId: normalizedUserId,
                storageUserId: String(data.storageUserId || normalizedUserId),
                legacyUserId: String(data.legacyUserId || normalizedUserId),
                bsuid: data.bsuid,
                phoneNumber: data.phoneNumber,
                remoteJid: data.remoteJid,
                channel: (data.channel || 'web') as CanonicalIdentity['channel'],
                resolutionSource: (data.resolutionSource || 'legacy_passthrough') as CanonicalIdentity['resolutionSource'],
                requiresBackfill: Boolean(data.requiresBackfill),
                aliases: Array.isArray(data.aliases) ? data.aliases : [],
            };
        }

        const identitySnap = await getDoc(doc(db, 'canonical_identities', normalizedUserId));
        if (!identitySnap.exists()) {
            return {
                canonicalUserId: normalizedUserId,
                storageUserId: normalizedUserId,
                legacyUserId: normalizedUserId,
                remoteJid: normalizedUserId.includes('@') ? normalizedUserId : undefined,
                channel: normalizedUserId.includes('@') ? 'whatsapp' : 'web',
                resolutionSource: 'legacy_passthrough',
                requiresBackfill: false,
                aliases: [],
            };
        }

        const data = identitySnap.data() as Partial<CanonicalIdentity>;
        return {
            canonicalUserId: normalizedUserId,
            storageUserId: String(data.storageUserId || normalizedUserId),
            legacyUserId: String(data.legacyUserId || normalizedUserId),
            bsuid: data.bsuid,
            phoneNumber: data.phoneNumber,
            remoteJid: data.remoteJid,
            channel: (data.channel || 'web') as CanonicalIdentity['channel'],
            resolutionSource: (data.resolutionSource || 'legacy_passthrough') as CanonicalIdentity['resolutionSource'],
            requiresBackfill: Boolean(data.requiresBackfill),
            aliases: Array.isArray(data.aliases) ? data.aliases : [],
        };
    }

    async getCompatibleUserIds(userId: string): Promise<string[]> {
        const identity = await this.getIdentitySnapshot(userId);
        return Array.from(new Set([
            identity.canonicalUserId,
            identity.storageUserId,
            identity.legacyUserId,
        ].filter(Boolean)));
    }

    private async persistIdentity(identity: CanonicalIdentity): Promise<void> {
        if (isServer) {
            await db.collection('canonical_identities').doc(identity.canonicalUserId).set({
                ...identity,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
            }, { merge: true });

            await Promise.all(identity.aliases.map((aliasKey) =>
                db.collection('identity_aliases').doc(aliasKey).set({
                    canonicalUserId: identity.canonicalUserId,
                    storageUserId: identity.storageUserId,
                    legacyUserId: identity.legacyUserId,
                    bsuid: identity.bsuid || null,
                    remoteJid: identity.remoteJid || null,
                    phoneNumber: identity.phoneNumber || null,
                    channel: identity.channel,
                    updatedAt: serverTimestamp(),
                    createdAt: serverTimestamp(),
                }, { merge: true })
            ));
            return;
        }

        const canonicalRef = doc(db, 'canonical_identities', identity.canonicalUserId);
        await setDoc(canonicalRef, {
            ...identity,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
        }, { merge: true });

        const aliasWrites = identity.aliases.map((aliasKey) =>
            setDoc(doc(db, 'identity_aliases', aliasKey), {
                canonicalUserId: identity.canonicalUserId,
                storageUserId: identity.storageUserId,
                legacyUserId: identity.legacyUserId,
                bsuid: identity.bsuid || null,
                remoteJid: identity.remoteJid || null,
                phoneNumber: identity.phoneNumber || null,
                channel: identity.channel,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp(),
            }, { merge: true }),
        );

        await Promise.all(aliasWrites);
    }

    private async lazyBackfillCanonicalData(identity: CanonicalIdentity): Promise<void> {
        if (!identity.requiresBackfill || !identity.legacyUserId || identity.legacyUserId === identity.canonicalUserId) {
            return;
        }

        const [legacySnap, canonicalSnap] = await Promise.all([
            getDoc(doc(db, 'users', identity.legacyUserId)),
            getDoc(doc(db, 'users', identity.canonicalUserId)),
        ]);

        if (!legacySnap.exists()) {
            return;
        }

        const legacyData = legacySnap.data();
        await setDoc(doc(db, 'users', identity.canonicalUserId), {
            ...(canonicalSnap.exists() ? canonicalSnap.data() : {}),
            ...legacyData,
            userId: identity.canonicalUserId,
            canonicalUserId: identity.canonicalUserId,
            legacyUserId: identity.legacyUserId,
            bsuid: identity.bsuid || null,
            remoteJid: identity.remoteJid || null,
            storageUserId: identity.canonicalUserId,
            identityBackfilledAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        }, { merge: true });

        await Promise.all([
            this.copySubcollection(identity.legacyUserId, identity.canonicalUserId, 'purchases'),
            this.copySubcollection(identity.legacyUserId, identity.canonicalUserId, 'lists'),
            this.copySubcollection(identity.legacyUserId, identity.canonicalUserId, 'interactions'),
            analyticsEventWriter.mergeAggregateDocuments(identity.canonicalUserId, [identity.legacyUserId]),
        ]);

        const migratedIdentity: CanonicalIdentity = {
            ...identity,
            storageUserId: identity.canonicalUserId,
            requiresBackfill: false,
        };
        await this.persistIdentity(migratedIdentity);

        await setDoc(doc(db, 'users', identity.legacyUserId), {
            canonicalUserId: identity.canonicalUserId,
            storageUserId: identity.canonicalUserId,
            legacyUserId: identity.legacyUserId,
            identityMigratedTo: identity.canonicalUserId,
            identityBackfilledAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        }, { merge: true });
    }

    private async copySubcollection(sourceUserId: string, targetUserId: string, subcollection: 'purchases' | 'lists' | 'interactions'): Promise<void> {
        if (!sourceUserId || !targetUserId || sourceUserId === targetUserId) {
            return;
        }

        const sourceSnap = await getDocs(collection(db, 'users', sourceUserId, subcollection));
        if (sourceSnap.empty) {
            return;
        }

        await Promise.all(sourceSnap.docs.map((docSnap) => setDoc(
            doc(db, 'users', targetUserId, subcollection, docSnap.id),
            {
                ...docSnap.data(),
                canonicalUserId: targetUserId,
                legacyUserId: sourceUserId,
                migratedFromLegacyAt: serverTimestamp(),
            },
            { merge: true },
        )));
    }
}

export const identityResolutionService = new IdentityResolutionService();
