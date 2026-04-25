import { isServer } from '../lib/isServer';
import { adminDb as serverDb, admin } from '../lib/firebase-admin';

export interface MessageLog {
    role: 'user' | 'assistant';
    content: string;
}

export interface PendingResolution {
    action: string;
    data: any;
    confirmed: boolean;
    originalMessage: string;
}

export type ConversationStatus =
    | 'IDLE'
    | 'AWAITING_INITIAL_LOCATION'
    | 'AWAITING_NAME'
    | 'AWAITING_ADD_TO_LIST'
    | 'AWAITING_LIST_ITEMS'
    | 'AWAITING_LIST_CONFIRMATION'
    | 'AWAITING_PURCHASE_CONFIRMATION'
    | 'AWAITING_PRICE_TAG_CONFIRMATION'
    | 'AWAITING_EXPENSE_CONFIRMATION'
    | 'AWAITING_CLARIFICATION'
    | 'AWAITING_TRANSPORT_MODE_FOR_LIST'
    | 'AWAITING_TRANSPORT_FOR_LIST'
    | 'AWAITING_TRANSPORT_CONSUMPTION'
    | 'AWAITING_CONSUMPTION'
    | 'AWAITING_SHARE_CONFIRMATION'
    | 'AWAITING_SHARE_TARGET'
    | 'AWAITING_MULTI_CHOICE'
    | 'AWAITING_ONBOARDING_ANSWER'
    | 'AWAITING_LIST_RECOVERY'
    | 'AWAITING_LGPD_CONSENT'
    | 'CRIANDO_LISTA';

export class ConversationStateService {
    public current: ConversationStatus = 'IDLE';
    public action = '';
    public data: any = null;
    public prompt = '';
    public updatedAt = Date.now();

    private turnCount = 0;
    private history: Record<string, MessageLog[]> = {};

    private static readonly STALE_STATE_MAX_AGE_MS = 30 * 60 * 1000;
    private static readonly YES_WORDS = ['sim', 'yes', 'ok', 'pode', 'quero', 'anota', 'bora', 'manda', 'por favor', 'claro', 'com certeza', 'isso'];
    private static readonly NO_WORDS = ['nao', 'no', 'n', 'nem', 'nunca', 'cancela', 'cancelar', 'deixa', 'nope', 'nop', 'naum', 'fala logo', 'que nada', 'negativo', 'ixe'];
    private static readonly HOT_STATES: ConversationStatus[] = [
        'AWAITING_LIST_CONFIRMATION',
        'AWAITING_PURCHASE_CONFIRMATION',
        'AWAITING_PRICE_TAG_CONFIRMATION',
        'AWAITING_EXPENSE_CONFIRMATION',
        'AWAITING_ADD_TO_LIST',
        'AWAITING_NAME',
        'AWAITING_CLARIFICATION',
        'AWAITING_TRANSPORT_FOR_LIST',
        'AWAITING_TRANSPORT_CONSUMPTION',
        'AWAITING_ONBOARDING_ANSWER',
        'AWAITING_LIST_RECOVERY',
        'AWAITING_LGPD_CONSENT',
        'AWAITING_SHARE_TARGET',
    ];

    addMessage(userId: string, role: 'user' | 'assistant', content: string) {
        if (!this.history[userId]) {
            this.history[userId] = [];
        }
        this.history[userId].push({ role, content });
        if (this.history[userId].length > 10) {
            this.history[userId].shift();
        }
    }

    getHistory(userId: string): MessageLog[] {
        return this.history[userId] || [];
    }

    clearHistory(userId: string) {
        this.history[userId] = [];
    }

    transition(status: ConversationStatus, action: string, data: any, prompt: string) {
        console.log(`[State] ${this.current} -> ${status} (action: ${action})`);
        this.current = status;
        this.action = action;
        this.data = data;
        this.prompt = prompt;
        this.updatedAt = Date.now();
    }

    reset() {
        console.log(`[State] RESET from ${this.current}`);
        this.current = 'IDLE';
        this.action = '';
        this.data = null;
        this.prompt = '';
        this.updatedAt = Date.now();
    }

    async load(userId: string) {
        if (!isServer || !serverDb) return;
        try {
            const snap = await (serverDb as any).collection('user_conversations').doc(userId).get();
            if (snap.exists) {
                const data = snap.data();
                this.current = data.current || 'IDLE';
                this.action = data.action || '';
                this.data = data.data || null;
                this.prompt = data.prompt || '';
                this.updatedAt = data.updatedAt || Date.now();
                this.turnCount = data.turnCount || 0;
            }
        } catch (err) {
            console.error(`[ConversationState] Error loading state for ${userId}:`, err);
        }
    }

    async save(userId: string) {
        if (!isServer || !serverDb) return;
        try {
            await (serverDb as any).collection('user_conversations').doc(userId).set({
                current: this.current,
                action: this.action,
                data: this.data,
                prompt: this.prompt,
                updatedAt: this.updatedAt,
                turnCount: this.turnCount,
                lastInteractionAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        } catch (err) {
            console.error(`[ConversationState] Error saving state for ${userId}:`, err);
        }
    }

    incrementTurn() {
        this.turnCount++;
    }

    get turns() {
        return this.turnCount;
    }

    isConfirmation(msg: string): boolean {
        const low = this.normalizeMessage(msg);
        return ConversationStateService.YES_WORDS.some((word) => low === word || low.startsWith(`${word} `) || low.startsWith(`${word},`));
    }

    isNegation(msg: string): boolean {
        const low = this.normalizeMessage(msg);
        return ConversationStateService.NO_WORDS.some((word) => low === word || low.startsWith(`${word} `));
    }

    resolveIfPending(message: string): PendingResolution | null {
        if (this.current === 'IDLE') return null;

        if (this.isStateExpired()) {
            console.log(`[State] Expirando estado antigo: ${this.current}`);
            this.reset();
            return null;
        }

        const isYes = this.isConfirmation(message);
        const isNo = this.isNegation(message);

        if (this.shouldResolveHotState(isYes, isNo)) {
            return this.resolveAndReset(message, isYes || this.isFreeTextState(this.current));
        }

        if (this.current === 'CRIANDO_LISTA') {
            return this.buildPendingResult('CRIANDO_LISTA', this.data, true, message);
        }

        if (this.current === 'AWAITING_SHARE_CONFIRMATION') {
            return this.resolveShareConfirmation(message, isYes, isNo);
        }

        if (this.current === 'AWAITING_MULTI_CHOICE') {
            return this.resolveMultiChoice(message);
        }

        return null;
    }

    private normalizeMessage(message: string): string {
        return message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    }

    private isStateExpired(): boolean {
        return Date.now() - this.updatedAt > ConversationStateService.STALE_STATE_MAX_AGE_MS;
    }

    private isFreeTextState(state: ConversationStatus): boolean {
        return state === 'AWAITING_NAME'
            || state === 'AWAITING_TRANSPORT_FOR_LIST'
            || state === 'AWAITING_TRANSPORT_CONSUMPTION'
            || state === 'AWAITING_SHARE_TARGET';
    }

    private shouldResolveHotState(isYes: boolean, isNo: boolean): boolean {
        return ConversationStateService.HOT_STATES.includes(this.current)
            && (isYes || isNo || this.isFreeTextState(this.current));
    }

    private resolveAndReset(message: string, confirmed: boolean): PendingResolution {
        const result = this.buildPendingResult(this.action || this.current, this.data, confirmed, message);
        this.reset();
        return result;
    }

    private resolveShareConfirmation(message: string, isYes: boolean, isNo: boolean): PendingResolution | null {
        const low = this.normalizeMessage(message);
        const isMercado = /\b(mercado|barato|proximo|rota|1)\b/.test(low);
        const isShare = /\b(compartilhar|whatsapp|zap|mandar|enviar|2)\b/.test(low);

        let confirmed = isMercado;
        if (isShare) confirmed = false;
        if (isYes && !isMercado && !isShare) confirmed = true;

        if (isMercado || isShare || isYes) {
            const result = this.buildPendingResult('share_list', this.data, confirmed, message);
            this.reset();
            return result;
        }

        if (isNo) {
            this.reset();
            return this.buildPendingResult('share_list', this.data, false, message);
        }

        return null;
    }

    private resolveMultiChoice(message: string): PendingResolution | null {
        const low = this.normalizeMessage(message);
        const isPrice = /\b(preco|precos|1|ver preco|comparar|quanto|valor)\b/.test(low);
        const isList = /\b(lista|2|criar|montar|cria|monta)\b/.test(low);

        if (isPrice || isList) {
            const result = this.buildPendingResult('multi_choice', this.data, isPrice, message);
            this.reset();
            return result;
        }

        this.reset();
        return null;
    }

    private buildPendingResult(action: string, data: any, confirmed: boolean, originalMessage: string): PendingResolution {
        return {
            action,
            data,
            confirmed,
            originalMessage,
        };
    }
}

export const conversationState = new ConversationStateService();
