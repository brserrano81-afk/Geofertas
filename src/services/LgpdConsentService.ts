// ─────────────────────────────────────────────────────────────
// LgpdConsentService — Gestão de consentimento LGPD
// Lei 13.709/2018 — arts. 8º, 9º, 18
// ─────────────────────────────────────────────────────────────

import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const CURRENT_CONSENT_VERSION = 'v1.0';
export const DEFAULT_RETENTION_DAYS = 365;
export const LOCATION_TTL_DAYS = 90;

export interface UserConsent {
    consentedAt: unknown;           // Timestamp — quando o usuário aceitou
    consentVersion: string;         // ex: "v1.0"
    dataRetentionDays: number;      // padrão: 365 dias
    locationDeclaredAt?: unknown;   // Timestamp — quando a localização foi declarada
    locationSource?: 'user_declared' | 'gps_auto'; // origem da localização (nunca inferida)
    anonymizedAt?: unknown;         // Timestamp — se o usuário solicitou anonimização
    deletionRequestedAt?: unknown;  // Timestamp — se o usuário solicitou exclusão
}

/** Resumo legível do termo de uso exibido ao usuário no WhatsApp */
export const CONSENT_NOTICE = `🔒 *Aviso de Privacidade — Economiza Fácil*

Ao usar este assistente, você concorda que:
• Seu histórico de compras e lista são salvos para melhorar suas recomendações
• Sua localização (quando compartilhada) é usada apenas para encontrar mercados próximos
• Seus dados não são vendidos ou compartilhados com terceiros
• Você pode apagar seus dados a qualquer momento digitando *APAGAR MEUS DADOS*

Política completa: economizafacil.com.br/privacidade`;

class LgpdConsentService {
    /**
     * Registra o consentimento do usuário na primeira interação.
     * Idempotente: não sobrescreve consentimento já existente.
     */
    async recordConsent(userId: string): Promise<void> {
        const userRef = doc(db, 'users', userId);
        const snap = await getDoc(userRef);

        if (snap.exists() && snap.data().consentedAt) {
            // Consentimento já registrado — não sobrescrever
            return;
        }

        await setDoc(userRef, {
            consentedAt: serverTimestamp(),
            consentVersion: CURRENT_CONSENT_VERSION,
            dataRetentionDays: DEFAULT_RETENTION_DAYS,
        }, { merge: true });

        console.log(`[LgpdConsentService] Consentimento registrado para ${userId} — ${CURRENT_CONSENT_VERSION}`);
    }

    /**
     * Registra a origem e data de declaração da localização.
     * Deve ser chamado sempre que userLocation for atualizado.
     */
    async recordLocationDeclaration(
        userId: string,
        source: 'user_declared' | 'gps_auto' = 'user_declared',
    ): Promise<void> {
        const userRef = doc(db, 'users', userId);

        await setDoc(userRef, {
            locationDeclaredAt: serverTimestamp(),
            locationSource: source,
        }, { merge: true });

        console.log(`[LgpdConsentService] Localização registrada para ${userId} — fonte: ${source}`);
    }

    /**
     * Verifica se a localização do usuário expirou (TTL semântico).
     * Retorna true se a localização deve ser considerada inválida.
     */
    async isLocationExpired(userId: string): Promise<boolean> {
        try {
            const userRef = doc(db, 'users', userId);
            const snap = await getDoc(userRef);

            if (!snap.exists()) return true;

            const data = snap.data();
            const locationDeclaredAt = data.locationDeclaredAt;

            if (!locationDeclaredAt) return true;

            // Calcular se passou o TTL
            const declaredMs = typeof locationDeclaredAt.toMillis === 'function'
                ? locationDeclaredAt.toMillis()
                : new Date(locationDeclaredAt).getTime();

            const ttlMs = LOCATION_TTL_DAYS * 24 * 60 * 60 * 1000;
            const isExpired = Date.now() - declaredMs > ttlMs;

            if (isExpired) {
                console.log(`[LgpdConsentService] Localização de ${userId} expirou (TTL: ${LOCATION_TTL_DAYS} dias)`);
            }

            return isExpired;
        } catch (err) {
            console.error('[LgpdConsentService] Erro ao verificar TTL de localização:', err);
            return false; // fail-safe: não bloquear operação
        }
    }

    /**
     * Verifica se o usuário já deu consentimento.
     */
    async hasConsented(userId: string): Promise<boolean> {
        try {
            const userRef = doc(db, 'users', userId);
            const snap = await getDoc(userRef);
            if (!snap.exists()) return false;
            return Boolean(snap.data().consentedAt);
        } catch {
            return false;
        }
    }

    /**
     * Retorna os dados de consentimento do usuário.
     */
    async getConsent(userId: string): Promise<Partial<UserConsent>> {
        try {
            const userRef = doc(db, 'users', userId);
            const snap = await getDoc(userRef);
            if (!snap.exists()) return {};

            const data = snap.data();
            return {
                consentedAt: data.consentedAt,
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
