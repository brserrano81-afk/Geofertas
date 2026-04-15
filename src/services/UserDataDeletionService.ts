// ─────────────────────────────────────────────────────────────
// UserDataDeletionService — Exclusão e Anonimização LGPD
// Lei 13.709/2018 — art. 18, IV (direito de exclusão)
// ─────────────────────────────────────────────────────────────

import {
    collection,
    doc,
    getDoc,
    getDocs,
    serverTimestamp,
    setDoc,
    writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';

/** Gera pseudônimo anônimo determinístico baseado no userId */
function generateAnonymousId(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = (hash << 5) - hash + userId.charCodeAt(i);
        hash |= 0;
    }
    return `anon_${Math.abs(hash).toString(36)}`;
}

class UserDataDeletionService {
    /**
     * Anonimiza completamente o perfil do usuário.
     *
     * O que é preservado (sem PII):
     *   - userId (necessário para integridade referencial)
     *   - channel, interactionCount (estatísticas anonimizadas)
     *   - anonymizedAt (registro de conformidade LGPD)
     *
     * O que é removido:
     *   - name, lastMessagePreview, lastIntent
     *   - userLocation (lat, lng, address, neighborhood)
     *   - transportMode, consumption, busTicket
     *   - preferences aninhadas
     *   - locationDeclaredAt, locationSource
     *   - interactions, purchases, lists (sub-coleções)
     */
    async anonymizeUser(userId: string): Promise<{ success: boolean; message: string }> {
        try {
            console.log(`[UserDataDeletionService] Iniciando anonimização para ${userId}`);

            // 1. Anonimizar perfil raiz — apagar todos os campos PII
            const userRef = doc(db, 'users', userId);
            await setDoc(userRef, {
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
                // Registro de conformidade LGPD
                anonymizedAt: serverTimestamp(),
                deletionRequestedAt: serverTimestamp(),
                anonymousAlias: generateAnonymousId(userId),
            }, { merge: true });

            // 2. Limpar sub-coleção de interações (conversas)
            await this.clearSubcollection(userId, 'interactions');

            // 3. Limpar sub-coleção de compras pessoais
            await this.clearSubcollection(userId, 'purchases');

            // 4. Limpar sub-coleção de listas
            await this.clearSubcollection(userId, 'lists');

            console.log(`[UserDataDeletionService] ✅ Anonimização concluída para ${userId}`);

            return {
                success: true,
                message:
                    `✅ *Seus dados pessoais foram apagados com sucesso.*\n\n` +
                    `O que foi removido:\n` +
                    `• Nome e identificação\n` +
                    `• Localização salva\n` +
                    `• Histórico de conversas\n` +
                    `• Histórico de compras\n` +
                    `• Listas de compras\n\n` +
                    `Seu histórico anônimo pode continuar contribuindo para a inteligência de preços da comunidade, mas não te identifica.\n\n` +
                    `Se quiser recomeçar, é só me mandar uma mensagem! 💚`,
            };
        } catch (err) {
            console.error(`[UserDataDeletionService] Erro na anonimização de ${userId}:`, err);
            return {
                success: false,
                message:
                    'Ocorreu um erro ao processar sua solicitação de exclusão. ' +
                    'Tente novamente em alguns instantes ou entre em contato com o suporte.',
            };
        }
    }

    /**
     * Remove apenas a localização do usuário — chamado por TTL expirado.
     */
    async clearLocation(userId: string): Promise<void> {
        try {
            const userRef = doc(db, 'users', userId);
            await setDoc(userRef, {
                userLocation: null,
                locationDeclaredAt: null,
                locationSource: null,
            }, { merge: true });
            console.log(`[UserDataDeletionService] Localização de ${userId} removida (TTL expirado)`);
        } catch (err) {
            console.error('[UserDataDeletionService] Erro ao limpar localização:', err);
        }
    }

    /**
     * Verifica se o usuário já solicitou exclusão anteriormente.
     */
    async isDeletionRequested(userId: string): Promise<boolean> {
        try {
            const userRef = doc(db, 'users', userId);
            const snap = await getDoc(userRef);
            if (!snap.exists()) return false;
            return Boolean(snap.data().deletionRequestedAt);
        } catch {
            return false;
        }
    }

    /**
     * Remove todos os documentos de uma sub-coleção em batches seguros (≤400 por vez).
     */
    private async clearSubcollection(userId: string, subcollection: string): Promise<void> {
        try {
            const colRef = collection(db, 'users', userId, subcollection);
            const snap = await getDocs(colRef);

            if (snap.empty) return;

            const batchSize = 400; // Firestore permite até 500 — margem de segurança
            let batch = writeBatch(db);
            let opCount = 0;

            for (const docSnap of snap.docs) {
                batch.delete(docSnap.ref);
                opCount++;

                if (opCount >= batchSize) {
                    await batch.commit();
                    batch = writeBatch(db);
                    opCount = 0;
                }
            }

            if (opCount > 0) {
                await batch.commit();
            }

            console.log(
                `[UserDataDeletionService] Sub-coleção "${subcollection}" de ${userId} ` +
                `removida (${snap.docs.length} documentos)`,
            );
        } catch (err) {
            console.error(
                `[UserDataDeletionService] Erro ao limpar sub-coleção "${subcollection}" de ${userId}:`,
                err,
            );
            throw err;
        }
    }
}

export const userDataDeletionService = new UserDataDeletionService();
