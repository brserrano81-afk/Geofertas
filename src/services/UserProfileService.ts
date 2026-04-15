import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp as clientTimestamp, setDoc } from 'firebase/firestore';
import { db as clientDb } from '../firebase';
import { isServer } from '../lib/isServer';
import { adminDb as serverDb, admin } from '../lib/firebase-admin';
import { identityResolutionService } from './IdentityResolutionService';

// Helper de normalização de tempo
const serverTimestamp = isServer ? admin.firestore.FieldValue.serverTimestamp : clientTimestamp;
const db = isServer ? (serverDb as any) : clientDb;

export interface UserInteraction {
    role: 'user' | 'assistant';
    content: string;
    intent?: string;
    createdAt?: unknown;
}

export interface UserProfile {
    userId: string;
    createdAt?: unknown;
    lastInteractionAt?: unknown;
    interactionCount?: number;
    name?: string;
    lastIntent?: string;
    channel?: string;
    lastMessagePreview?: string;
}

class UserProfileService {
    async bootstrapUser(userId: string): Promise<{ profile: UserProfile; recentInteractions: UserInteraction[] }> {
        const profile = await this.ensureUser(userId);
        const recentInteractions = await this.getRecentInteractions(userId);
        return { profile, recentInteractions };
    }

    async ensureUser(userId: string): Promise<UserProfile> {
        const identity = await identityResolutionService.getIdentitySnapshot(userId);
        if (isServer) {
            const snap = await db.collection('users').doc(identity.canonicalUserId).get();
            if (!snap.exists) {
                const profile: UserProfile = {
                    userId: identity.canonicalUserId,
                    channel: identity.channel,
                    interactionCount: 0,
                };

                await db.collection('users').doc(identity.canonicalUserId).set({
                    ...profile,
                    canonicalUserId: identity.canonicalUserId,
                    legacyUserId: identity.legacyUserId,
                    storageUserId: identity.storageUserId,
                    bsuid: identity.bsuid || null,
                    remoteJid: identity.remoteJid || null,
                    createdAt: serverTimestamp(),
                    lastInteractionAt: serverTimestamp(),
                }, { merge: true });

                return profile;
            }

            return {
                userId: identity.canonicalUserId,
                ...(snap.data() as Omit<UserProfile, 'userId'>),
            };
        }

        const userRef = doc(db, 'users', identity.canonicalUserId);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
            const profile: UserProfile = {
                userId: identity.canonicalUserId,
                channel: identity.channel,
                interactionCount: 0,
            };

            await setDoc(userRef, {
                ...profile,
                canonicalUserId: identity.canonicalUserId,
                legacyUserId: identity.legacyUserId,
                storageUserId: identity.storageUserId,
                bsuid: identity.bsuid || null,
                remoteJid: identity.remoteJid || null,
                createdAt: serverTimestamp(),
                lastInteractionAt: serverTimestamp(),
            }, { merge: true });

            return profile;
        }

        return {
            userId: identity.canonicalUserId,
            ...(snap.data() as Omit<UserProfile, 'userId'>),
        };
    }

    async recordInteraction(userId: string, interaction: UserInteraction) {
        const identity = await identityResolutionService.getIdentitySnapshot(userId);
        const writeUserIds = Array.from(new Set([
            identity.canonicalUserId,
            identity.storageUserId,
        ].filter(Boolean)));

        const contentPreview = String(interaction.content || '').slice(0, 80);
        const interactionPayload = {
            role: interaction.role,
            contentPreview,
            ...(interaction.intent ? { intent: interaction.intent } : {}),
            createdAt: serverTimestamp(),
        };
        const nextInteractionCount = await this.getNextInteractionCount(identity.canonicalUserId);

        await Promise.all(writeUserIds.map(async (targetUserId) => {
            if (isServer) {
                await db.collection('users').doc(targetUserId).collection('interactions').add(interactionPayload);
                await db.collection('users').doc(targetUserId).set({
                    userId: identity.canonicalUserId,
                    canonicalUserId: identity.canonicalUserId,
                    legacyUserId: identity.legacyUserId,
                    storageUserId: identity.storageUserId,
                    bsuid: identity.bsuid || null,
                    remoteJid: identity.remoteJid || null,
                    channel: identity.channel,
                    lastInteractionAt: serverTimestamp(),
                    lastIntent: interaction.intent || null,
                    lastMessagePreview: contentPreview,
                    interactionCount: nextInteractionCount,
                }, { merge: true });
            } else {
                await addDoc(collection(db, 'users', targetUserId, 'interactions'), interactionPayload);
                await setDoc(doc(db, 'users', targetUserId), {
                    userId: identity.canonicalUserId,
                    canonicalUserId: identity.canonicalUserId,
                    legacyUserId: identity.legacyUserId,
                    storageUserId: identity.storageUserId,
                    bsuid: identity.bsuid || null,
                    remoteJid: identity.remoteJid || null,
                    channel: identity.channel,
                    lastInteractionAt: serverTimestamp(),
                    lastIntent: interaction.intent || null,
                    lastMessagePreview: contentPreview,
                    interactionCount: nextInteractionCount,
                }, { merge: true });
            }
        }));
    }

    async updateUserName(userId: string, name: string) {
        const identity = await identityResolutionService.getIdentitySnapshot(userId);
        const writeUserIds = Array.from(new Set([
            identity.canonicalUserId,
            identity.storageUserId,
        ].filter(Boolean)));

        await Promise.all(writeUserIds.map(async (targetUserId) => {
            if (isServer) {
                await db.collection('users').doc(targetUserId).set({
                    userId: identity.canonicalUserId,
                    canonicalUserId: identity.canonicalUserId,
                    legacyUserId: identity.legacyUserId,
                    storageUserId: identity.storageUserId,
                    bsuid: identity.bsuid || null,
                    remoteJid: identity.remoteJid || null,
                    name,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            } else {
                await setDoc(doc(db, 'users', targetUserId), {
                    userId: identity.canonicalUserId,
                    canonicalUserId: identity.canonicalUserId,
                    legacyUserId: identity.legacyUserId,
                    storageUserId: identity.storageUserId,
                    bsuid: identity.bsuid || null,
                    remoteJid: identity.remoteJid || null,
                    name,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }
        }));
    }

    async getRecentInteractions(userId: string): Promise<UserInteraction[]> {
        try {
            const compatibleUserIds = await identityResolutionService.getCompatibleUserIds(userId);
            const batches = await Promise.all(compatibleUserIds.map(async (targetUserId) => {
                if (isServer) {
                    const snap = await db.collection('users').doc(targetUserId).collection('interactions')
                        .orderBy('createdAt', 'desc')
                        .limit(8)
                        .get();
                    
                    return snap.docs.map((docSnap: any) => {
                        const data = docSnap.data();
                        return {
                            role: data.role as 'user' | 'assistant',
                            content: String(data.contentPreview || data.content || ''),
                            intent: data.intent,
                            createdAt: data.createdAt,
                        } as UserInteraction;
                    });
                }

                const interactionsRef = collection(db, 'users', targetUserId, 'interactions');
                const interactionsQuery = query(interactionsRef, orderBy('createdAt', 'desc'), limit(8));
                const snap = await getDocs(interactionsQuery);

                return snap.docs.map((docSnap: any) => {
                    const data = docSnap.data();
                    return {
                        role: data.role as 'user' | 'assistant',
                        content: String(data.contentPreview || data.content || ''),
                        intent: data.intent,
                        createdAt: data.createdAt,
                    } as UserInteraction;
                });
            }));

            return batches
                .flat()
                .sort((a, b) => this.getTimestamp(b.createdAt) - this.getTimestamp(a.createdAt))
                .slice(0, 8)
                .reverse();
        } catch (err) {
            console.error('[UserProfileService] Error loading interactions:', err);
            return [];
        }
    }

    private async getNextInteractionCount(userId: string): Promise<number> {
        try {
            let data: any = null;
            if (isServer) {
                const snap = await db.collection('users').doc(userId).get();
                if (snap.exists) data = snap.data();
            } else {
                const snap = await getDoc(doc(db, 'users', userId));
                if (snap.exists()) data = snap.data();
            }
            const current = data ? Number(data.interactionCount || 0) : 0;
            return current + 1;
        } catch (err) {
            console.error('[UserProfileService] Error counting interactions:', err);
            return 1;
        }
    }

    private getTimestamp(value: unknown): number {
        if (!value) return 0;
        if (typeof value === 'object' && value !== null && 'toMillis' in (value as { toMillis?: unknown })) {
            const toMillis = (value as { toMillis: () => number }).toMillis;
            if (typeof toMillis === 'function') {
                return toMillis();
            }
        }
        if (value instanceof Date) {
            return value.getTime();
        }
        if (typeof value === 'string') {
            const parsed = Date.parse(value);
            return Number.isNaN(parsed) ? 0 : parsed;
        }
        return 0;
    }
}

export const userProfileService = new UserProfileService();
