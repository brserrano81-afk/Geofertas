import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

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
        const userRef = doc(db, 'users', userId);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
            const profile: UserProfile = {
                userId,
                channel: userId.endsWith('@c.us') ? 'whatsapp' : 'web',
                interactionCount: 0,
            };

            await setDoc(userRef, {
                ...profile,
                createdAt: serverTimestamp(),
                lastInteractionAt: serverTimestamp(),
            }, { merge: true });

            return profile;
        }

        return {
            userId,
            ...(snap.data() as Omit<UserProfile, 'userId'>),
        };
    }

    async recordInteraction(userId: string, interaction: UserInteraction) {
        const userRef = doc(db, 'users', userId);
        const interactionsRef = collection(db, 'users', userId, 'interactions');

        // LGPD — Minimização de dados (art. 6º, III):
        // Nunca salvamos o texto completo da mensagem — apenas um preview ≤80 chars.
        // Isso evita captura acidental de dados sensíveis na conversa.
        const contentPreview = String(interaction.content || '').slice(0, 80);

        const interactionPayload = {
            role: interaction.role,
            contentPreview,          // preview ≤80 chars — nunca o texto completo
            ...(interaction.intent ? { intent: interaction.intent } : {}),
            createdAt: serverTimestamp(),
        };

        await addDoc(interactionsRef, interactionPayload);

        await setDoc(userRef, {
            userId,
            channel: userId.endsWith('@c.us') ? 'whatsapp' : 'web',
            lastInteractionAt: serverTimestamp(),
            lastIntent: interaction.intent || null,
            lastMessagePreview: contentPreview,
            interactionCount: await this.getNextInteractionCount(userId),
        }, { merge: true });
    }

    async updateUserName(userId: string, name: string) {
        const userRef = doc(db, 'users', userId);
        await setDoc(userRef, {
            userId,
            name,
            updatedAt: serverTimestamp(),
        }, { merge: true });
    }

    private async getRecentInteractions(userId: string): Promise<UserInteraction[]> {
        try {
            const interactionsRef = collection(db, 'users', userId, 'interactions');
            const interactionsQuery = query(interactionsRef, orderBy('createdAt', 'desc'), limit(8));
            const snap = await getDocs(interactionsQuery);

            return snap.docs
                .map((docSnap) => {
                    const data = docSnap.data();
                    return {
                        role: data.role as 'user' | 'assistant',
                        // Compatibilidade: suporta campo legado 'content' e novo 'contentPreview'
                        content: String(data.contentPreview || data.content || ''),
                        intent: data.intent,
                        createdAt: data.createdAt,
                    } as UserInteraction;
                })
                .reverse();
        } catch (err) {
            console.error('[UserProfileService] Error loading interactions:', err);
            return [];
        }
    }

    private async getNextInteractionCount(userId: string): Promise<number> {
        try {
            const userRef = doc(db, 'users', userId);
            const snap = await getDoc(userRef);
            const current = snap.exists() ? Number(snap.data().interactionCount || 0) : 0;
            return current + 1;
        } catch (err) {
            console.error('[UserProfileService] Error counting interactions:', err);
            return 1;
        }
    }
}

export const userProfileService = new UserProfileService();
