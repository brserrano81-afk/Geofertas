import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    serverTimestamp,
    setDoc,
    writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { identityResolutionService } from './IdentityResolutionService';

function generateAnonymousId(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = (hash << 5) - hash + userId.charCodeAt(i);
        hash |= 0;
    }
    return `anon_${Math.abs(hash).toString(36)}`;
}

class UserDataDeletionService {
    async anonymizeUser(userId: string): Promise<{ success: boolean; message: string }> {
        try {
            const identity = await identityResolutionService.getIdentitySnapshot(userId);
            const compatibleUserIds = await identityResolutionService.getCompatibleUserIds(userId);

            for (const targetUserId of compatibleUserIds) {
                await setDoc(doc(db, 'users', targetUserId), {
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
                    anonymizedAt: serverTimestamp(),
                    deletionRequestedAt: serverTimestamp(),
                    anonymousAlias: generateAnonymousId(identity.canonicalUserId),
                    canonicalUserId: identity.canonicalUserId,
                    storageUserId: identity.canonicalUserId,
                    legacyUserId: identity.legacyUserId,
                    remoteJid: null,
                    bsuid: null,
                }, { merge: true });

                await this.clearSubcollection(targetUserId, 'interactions');
                await this.clearSubcollection(targetUserId, 'purchases');
                await this.clearSubcollection(targetUserId, 'lists');
                await deleteDoc(doc(db, 'user_aggregates', targetUserId));
            }

            await this.clearIdentityArtifacts(identity);

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

    async clearLocation(userId: string): Promise<void> {
        try {
            const compatibleUserIds = await identityResolutionService.getCompatibleUserIds(userId);
            await Promise.all(compatibleUserIds.map((targetUserId) => setDoc(doc(db, 'users', targetUserId), {
                userLocation: null,
                locationDeclaredAt: null,
                locationSource: null,
            }, { merge: true })));
        } catch (err) {
            console.error('[UserDataDeletionService] Erro ao limpar localização:', err);
        }
    }

    async isDeletionRequested(userId: string): Promise<boolean> {
        try {
            const compatibleUserIds = await identityResolutionService.getCompatibleUserIds(userId);
            for (const targetUserId of compatibleUserIds) {
                const snap = await getDoc(doc(db, 'users', targetUserId));
                if (snap.exists() && snap.data().deletionRequestedAt) {
                    return true;
                }
            }
            return false;
        } catch {
            return false;
        }
    }

    private async clearIdentityArtifacts(identity: Awaited<ReturnType<typeof identityResolutionService.getIdentitySnapshot>>): Promise<void> {
        const deletions = [
            deleteDoc(doc(db, 'canonical_identities', identity.canonicalUserId)),
            ...identity.aliases.map((alias) => deleteDoc(doc(db, 'identity_aliases', alias))),
        ];
        await Promise.all(deletions);
    }

    private async clearSubcollection(userId: string, subcollection: string): Promise<void> {
        const colRef = collection(db, 'users', userId, subcollection);
        const snap = await getDocs(colRef);

        if (snap.empty) return;

        const batchSize = 400;
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
    }
}

export const userDataDeletionService = new UserDataDeletionService();
