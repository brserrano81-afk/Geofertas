import { doc, getDoc, serverTimestamp as clientTimestamp, setDoc } from 'firebase/firestore';
import { db as clientDb } from '../firebase';
import { isServer } from '../lib/isServer';
import { adminDb as serverDb, admin } from '../lib/firebase-admin';

const serverTimestamp = isServer ? admin.firestore.FieldValue.serverTimestamp : clientTimestamp;
const db = isServer ? (serverDb as any) : clientDb;
import { identityResolutionService } from './IdentityResolutionService';

export const CURRENT_CONSENT_VERSION = 'v1';
export const DEFAULT_RETENTION_DAYS = 365;
export const LOCATION_TTL_DAYS = 90;
export const PRIVACY_POLICY_URL = 'https://economizafacil.ia.br/privacidade';

export const CONSENT_ONBOARDING_MESSAGE =
    'Antes de começarmos, preciso do seu OK. 🔐\n\n' +
    'Para funcionar bem, o Economiza Fácil usa alguns dados seus, como:\n' +
    '📍 localização aproximada, para achar mercados perto de você;\n' +
    '🛒 listas e produtos pesquisados, para comparar preços;\n' +
    '💬 histórico de conversa, para melhorar sua experiência.\n\n' +
    'Seus dados são usados apenas para operar e melhorar o Economiza Fácil.\n' +
    'Você não precisa informar CPF, documento ou dados bancários.\n\n' +
    'Você pode pedir para ver, corrigir ou apagar seus dados quando quiser.\n\n' +
    'Ao continuar, você concorda com nossa Política de Privacidade:\n' +
    `${PRIVACY_POLICY_URL}\n\n` +
    'Responda SIM, OK ou ACEITO para continuar.';

export const PRIVACY_COMMAND_MESSAGE =
    '🔐 Política de Privacidade do Economiza Fácil\n\n' +
    'Usamos dados como número de WhatsApp, mensagens, listas, produtos pesquisados e localização aproximada para operar e melhorar o serviço.\n' +
    'Não pedimos CPF, documento ou dados bancários pelo WhatsApp.\n\n' +
    'Você pode pedir para ver, corrigir ou apagar seus dados quando quiser.\n\n' +
    `Leia a política completa aqui:\n${PRIVACY_POLICY_URL}`;

const ACCEPTANCE_WORDS = new Set(['sim', 'aceito', 'ok', 'concordo', 'continuar']);

export interface UserConsent {
    lgpdConsent?: boolean;
    lgpdConsentAt?: unknown;
    consentVersion?: string;
    dataRetentionDays?: number;
    locationDeclaredAt?: unknown;
    locationSource?: 'user_declared' | 'gps_auto';
    anonymizedAt?: unknown;
    deletionRequestedAt?: unknown;
}

function normalizeText(value: string): string {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

class LgpdConsentService {
    async hasConsented(userId: string): Promise<boolean> {
        try {
            const identity = await identityResolutionService.getIdentitySnapshot(userId);
            const compatibleUserIds = await identityResolutionService.getCompatibleUserIds(identity.canonicalUserId);

            for (const targetUserId of compatibleUserIds) {
                if (isServer) {
                    const snap = await db.collection('users').doc(targetUserId).get();
                    if (!snap.exists) continue;
                    const data = snap.data();
                    if (data.lgpdConsent === true || data.consentedAt) return true;
                } else {
                    const snap = await getDoc(doc(db, 'users', targetUserId));
                    if (!snap.exists()) continue;
                    const data = snap.data();
                    if (data.lgpdConsent === true || data.consentedAt) return true;
                }
            }

            return false;
        } catch {
            return false;
        }
    }

    async registerConsent(userId: string): Promise<void> {
        const identity = await identityResolutionService.getIdentitySnapshot(userId);
        if (isServer) {
            await db.collection('users').doc(identity.canonicalUserId).set({
                userId: identity.canonicalUserId,
                canonicalUserId: identity.canonicalUserId,
                legacyUserId: identity.legacyUserId,
                storageUserId: identity.storageUserId,
                lgpdConsent: true,
                lgpdConsentAt: serverTimestamp(),
                consentVersion: CURRENT_CONSENT_VERSION,
                dataRetentionDays: DEFAULT_RETENTION_DAYS,
                updatedAt: serverTimestamp(),
            }, { merge: true });
        } else {
            await setDoc(doc(db, 'users', identity.canonicalUserId), {
                userId: identity.canonicalUserId,
                canonicalUserId: identity.canonicalUserId,
                legacyUserId: identity.legacyUserId,
                storageUserId: identity.storageUserId,
                lgpdConsent: true,
                lgpdConsentAt: serverTimestamp(),
                consentVersion: CURRENT_CONSENT_VERSION,
                dataRetentionDays: DEFAULT_RETENTION_DAYS,
                updatedAt: serverTimestamp(),
            }, { merge: true });
        }
    }

    async evaluateConsentGate(userId: string, message: string): Promise<{
        allowed: boolean;
        justConsented: boolean;
        responseText?: string;
    }> {
        const alreadyConsented = await this.hasConsented(userId);
        if (alreadyConsented) {
            return { allowed: true, justConsented: false };
        }

        const normalized = normalizeText(message);
        if (ACCEPTANCE_WORDS.has(normalized)) {
            await this.registerConsent(userId);
            return { allowed: true, justConsented: true };
        }

        return {
            allowed: false,
            justConsented: false,
            responseText: CONSENT_ONBOARDING_MESSAGE,
        };
    }

    async recordLocationDeclaration(
        userId: string,
        source: 'user_declared' | 'gps_auto' = 'user_declared',
    ): Promise<void> {
        const identity = await identityResolutionService.getIdentitySnapshot(userId);
        if (isServer) {
            await db.collection('users').doc(identity.canonicalUserId).set({
                locationDeclaredAt: serverTimestamp(),
                locationSource: source,
            }, { merge: true });
        } else {
            await setDoc(doc(db, 'users', identity.canonicalUserId), {
                locationDeclaredAt: serverTimestamp(),
                locationSource: source,
            }, { merge: true });
        }
    }

    async isLocationExpired(userId: string): Promise<boolean> {
        try {
            const identity = await identityResolutionService.getIdentitySnapshot(userId);
            let locationDeclaredAt;
            if (isServer) {
                const snap = await db.collection('users').doc(identity.canonicalUserId).get();
                if (!snap.exists) return true;
                locationDeclaredAt = snap.data().locationDeclaredAt;
            } else {
                const snap = await getDoc(doc(db, 'users', identity.canonicalUserId));
                if (!snap.exists()) return true;
                locationDeclaredAt = snap.data().locationDeclaredAt;
            }
            
            if (!locationDeclaredAt) return true;

            const declaredMs = typeof locationDeclaredAt.toMillis === 'function'
                ? locationDeclaredAt.toMillis()
                : new Date(locationDeclaredAt).getTime();

            const ttlMs = LOCATION_TTL_DAYS * 24 * 60 * 60 * 1000;
            return Date.now() - declaredMs > ttlMs;
        } catch {
            return false;
        }
    }

    async getConsent(userId: string): Promise<Partial<UserConsent>> {
        try {
            const identity = await identityResolutionService.getIdentitySnapshot(userId);
            let snap;
            if (isServer) {
                snap = await db.collection('users').doc(identity.canonicalUserId).get();
            } else {
                snap = await getDoc(doc(db, 'users', identity.canonicalUserId));
            }
            if (!snap.exists || (typeof snap.exists === 'function' && !snap.exists())) return {};

            const data = snap.data();
            return {
                lgpdConsent: Boolean(data.lgpdConsent || data.consentedAt),
                lgpdConsentAt: data.lgpdConsentAt || data.consentedAt,
                consentVersion: data.consentVersion,
                dataRetentionDays: data.dataRetentionDays ?? DEFAULT_RETENTION_DAYS,
                locationDeclaredAt: data.locationDeclaredAt,
                locationSource: data.locationSource,
                anonymizedAt: data.anonymizedAt,
                deletionRequestedAt: data.deletionRequestedAt,
            };
        } catch (err) {
            console.error('[LgpdConsentService] Erro ao carregar consentimento:', err);
            return {};
        }
    }
}

export const lgpdConsentService = new LgpdConsentService();
