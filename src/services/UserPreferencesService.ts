import { doc, getDoc, serverTimestamp as clientTimestamp, setDoc } from 'firebase/firestore';
import { db as clientDb } from '../firebase';
import { isServer } from '../lib/isServer';
import { adminDb as serverDb, admin } from '../lib/firebase-admin';

const serverTimestamp = isServer ? admin.firestore.FieldValue.serverTimestamp : clientTimestamp;
const db = isServer ? (serverDb as any) : clientDb;
import { lgpdConsentService } from './LgpdConsentService';
import { identityResolutionService } from './IdentityResolutionService';

export interface UserPreferences {
    name?: string;
    transportMode?: string;
    consumption?: number;
    busTicket?: number;
    fuelPrice?: number;
    optimizationPreference?: 'economizar' | 'perto' | 'equilibrar';
    neighborhood?: string;
    userLocation?: {
        lat: number;
        lng: number;
        address?: string;
    };
    locationDeclaredAt?: unknown;
    locationSource?: 'user_declared' | 'gps_auto';
}

class UserPreferencesService {
    async getPreferences(userId: string): Promise<UserPreferences> {
        try {
            const compatibleUserIds = await identityResolutionService.getCompatibleUserIds(userId);

            for (const targetUserId of compatibleUserIds) {
                if (isServer) {
                    const snap = await db.collection('users').doc(targetUserId).get();
                    if (!snap.exists) continue;
                    const data = snap.data() as Record<string, unknown>;
                    const nestedPreferences = (data.preferences || {}) as Record<string, unknown>;
                    return {
                        name: String(data.name || nestedPreferences.name || '').trim() || undefined,
                        transportMode: String(data.transportMode || nestedPreferences.transportMode || '').trim() || undefined,
                        consumption: Number(data.consumption || nestedPreferences.consumption || 0) || undefined,
                        busTicket: Number(data.busTicket || nestedPreferences.busTicket || 0) || undefined,
                        fuelPrice: Number(data.fuelPrice || nestedPreferences.fuelPrice || 0) || undefined,
                        optimizationPreference: (data.optimizationPreference || nestedPreferences.optimizationPreference || undefined) as UserPreferences['optimizationPreference'],
                        neighborhood: String(data.neighborhood || nestedPreferences.neighborhood || '').trim() || undefined,
                        userLocation: this.parseUserLocation(data.userLocation || nestedPreferences.userLocation),
                    };
                }

                const snap = await getDoc(doc(db, 'users', targetUserId));
                if (!snap.exists()) {
                    continue;
                }

                const data = snap.data() as Record<string, unknown>;
                const nestedPreferences = (data.preferences || {}) as Record<string, unknown>;

                return {
                    name: String(data.name || nestedPreferences.name || '').trim() || undefined,
                    transportMode: String(data.transportMode || nestedPreferences.transportMode || '').trim() || undefined,
                    consumption: Number(data.consumption || nestedPreferences.consumption || 0) || undefined,
                    busTicket: Number(data.busTicket || nestedPreferences.busTicket || 0) || undefined,
                    fuelPrice: Number(data.fuelPrice || nestedPreferences.fuelPrice || 0) || undefined,
                    optimizationPreference: (data.optimizationPreference || nestedPreferences.optimizationPreference || undefined) as UserPreferences['optimizationPreference'],
                    neighborhood: String(data.neighborhood || nestedPreferences.neighborhood || '').trim() || undefined,
                    userLocation: this.parseUserLocation(data.userLocation || nestedPreferences.userLocation),
                };
            }

            return {};
        } catch (err) {
            console.error('[UserPreferencesService] Error loading preferences:', err);
            return {};
        }
    }

    async savePreferences(userId: string, partial: UserPreferences): Promise<void> {
        const identity = await identityResolutionService.getIdentitySnapshot(userId);
        const payload = Object.fromEntries(
            Object.entries(partial).filter(([, value]) => value !== undefined),
        );

        if (Object.keys(payload).length === 0) {
            return;
        }

        if (partial.userLocation) {
            const source = partial.locationSource ?? 'user_declared';
            await lgpdConsentService.recordLocationDeclaration(identity.canonicalUserId, source);
        }

        const writeUserIds = Array.from(new Set([
            identity.canonicalUserId,
            identity.storageUserId,
        ].filter(Boolean)));

        await Promise.all(writeUserIds.map((targetUserId) => {
            if (isServer) {
                return db.collection('users').doc(targetUserId).set({
                    userId: identity.canonicalUserId,
                    canonicalUserId: identity.canonicalUserId,
                    legacyUserId: identity.legacyUserId,
                    storageUserId: identity.storageUserId,
                    bsuid: identity.bsuid || null,
                    remoteJid: identity.remoteJid || null,
                    ...payload,
                    preferences: payload,
                    updatedAt: serverTimestamp(),
                }, { merge: true });
            }
            return setDoc(doc(db, 'users', targetUserId), {
                userId: identity.canonicalUserId,
                canonicalUserId: identity.canonicalUserId,
                legacyUserId: identity.legacyUserId,
                storageUserId: identity.storageUserId,
                bsuid: identity.bsuid || null,
                remoteJid: identity.remoteJid || null,
                ...payload,
                preferences: payload,
                updatedAt: serverTimestamp(),
            }, { merge: true });
        }));
    }

    private parseUserLocation(value: unknown): UserPreferences['userLocation'] {
        if (!value || typeof value !== 'object') {
            return undefined;
        }

        const raw = value as Record<string, unknown>;
        const lat = Number(raw.lat);
        const lng = Number(raw.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
            return undefined;
        }

        return {
            lat,
            lng,
            address: String(raw.address || '').trim() || undefined,
        };
    }
}

export const userPreferencesService = new UserPreferencesService();
