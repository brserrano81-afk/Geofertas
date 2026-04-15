import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { lgpdConsentService } from './LgpdConsentService';

export interface UserPreferences {
    name?: string;
    transportMode?: string;
    consumption?: number;
    busTicket?: number;
    optimizationPreference?: 'economizar' | 'perto' | 'equilibrar';
    neighborhood?: string;
    userLocation?: {
        lat: number;
        lng: number;
        address?: string;
    };
    // LGPD — campos de controle de localização
    locationDeclaredAt?: unknown;           // Timestamp — quando a localização foi salva
    locationSource?: 'user_declared' | 'gps_auto'; // origem: nunca inferida
}

class UserPreferencesService {
    async getPreferences(userId: string): Promise<UserPreferences> {
        try {
            const userRef = doc(db, 'users', userId);
            const snap = await getDoc(userRef);
            if (!snap.exists()) {
                return {};
            }

            const data = snap.data() as Record<string, unknown>;
            const nestedPreferences = (data.preferences || {}) as Record<string, unknown>;

            return {
                name: String(data.name || nestedPreferences.name || '').trim() || undefined,
                transportMode: String(data.transportMode || nestedPreferences.transportMode || '').trim() || undefined,
                consumption: Number(data.consumption || nestedPreferences.consumption || 0) || undefined,
                busTicket: Number(data.busTicket || nestedPreferences.busTicket || 0) || undefined,
                optimizationPreference: (data.optimizationPreference || nestedPreferences.optimizationPreference || undefined) as UserPreferences['optimizationPreference'],
                neighborhood: String(data.neighborhood || nestedPreferences.neighborhood || '').trim() || undefined,
                userLocation: this.parseUserLocation(data.userLocation || nestedPreferences.userLocation),
            };
        } catch (err) {
            console.error('[UserPreferencesService] Error loading preferences:', err);
            return {};
        }
    }

    async savePreferences(userId: string, partial: UserPreferences): Promise<void> {
        const userRef = doc(db, 'users', userId);
        const payload = Object.fromEntries(
            Object.entries(partial).filter(([, value]) => value !== undefined),
        );

        if (Object.keys(payload).length === 0) {
            return;
        }

        // LGPD — sempre que userLocation for atualizado, registrar origem e timestamp
        if (partial.userLocation) {
            const source = partial.locationSource ?? 'user_declared';
            await lgpdConsentService.recordLocationDeclaration(userId, source);
        }

        await setDoc(userRef, {
            userId,
            ...payload,
            preferences: payload,
            updatedAt: serverTimestamp(),
        }, { merge: true });
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
