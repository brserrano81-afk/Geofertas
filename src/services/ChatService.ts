// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ChatService â€” Orquestrador Puro
// Recebe NlpResult â†’ delega para engine correto
// â†’ retorna ChatResponse.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import { diagnosticService } from './DiagnosticService.ts';
import { aiService, type Intent } from './AiService';
import { offerEngine } from './OfferEngine';
import { ListManager } from './ListManager';
import { PurchaseManager } from './PurchaseManager';
import { ingestionPipeline, type PipelineResult } from './IngestionPipeline';
import { matchReceiptToList, type MatchResult } from './ReceiptMatcher';
import { ConversationStateService, type PendingResolution } from './ConversationStateService';
import { PurchaseAnalyticsService } from './PurchaseAnalyticsService';
import { userPreferencesService } from './UserPreferencesService';
import { userProfileService } from './UserProfileService';
import { userContextService } from './UserContextService';
import { predictiveShoppingService } from './PredictiveShoppingService';
import { geoDecisionEngine } from './GeoDecisionEngine';
import { shoppingComparisonService } from './ShoppingComparisonService';
import { type TransportMode, calculateAllTransportCosts } from '../app/utils/geoUtils';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db as clientDb } from '../firebase';
import { isServer } from '../lib/isServer';
import { adminDb as serverDb } from '../lib/firebase-admin';
const db = isServer ? (serverDb as any) : clientDb;
import type { ShoppingComparisonResult } from '../types/shopping';
import { offerQueueService } from './admin/OfferQueueService';
import { productCatalogService } from './ProductCatalogService';
import { userDataDeletionService } from './UserDataDeletionService';
import { lgpdConsentService } from './LgpdConsentService';

export interface ChatResponse {
    text: string;
    shareContent?: string;
    requestLocation?: boolean; // Se true, o front dispara o GPS
}

const INTENT_CONFIDENCE_THRESHOLD = 0.45;
const RECEIPT_AUTO_SAVE_THRESHOLD = 0.9;
const CHAT_FALLBACK_TEXT = 'Ainda não entendi bem o que você quer fazer. Posso te ajudar com preço de produto, ofertas de mercado, lista de compras ou seus gastos.';

interface ListItem {
    name: string;
    quantity?: number;
    unit?: string;
    priceAtacadao?: number;
    priceExtrabom?: number;
}

interface UserLocation {
    lat: number;
    lng: number;
    address?: string;
}

interface ChatContext {
    shoppingList: ListItem[];
    lastProduct?: string;
    userId: string;
    storageUserId: string;
    userName?: string;
    isFirstContact?: boolean;
    pendingPurchase?: any;
    pendingMatchResult?: MatchResult;
    pendingAllProducts?: string[];
    lastIntent?: Intent;
    userLocation?: UserLocation;
    transportMode?: TransportMode;
    consumption?: number;
    busTicket?: number;
    lastEconomicResult?: any;
    richContextSummary?: string;
    predictedNeeds?: Array<{ product: string; daysRemaining: number; urgent: boolean }>;
    optimizationPreference?: 'economizar' | 'perto' | 'equilibrar';
}

// Palavras que NUNCA devem ser adicionadas como item de lista
const GARBAGE_WORDS = new Set([
    'ver lista', 'mostrar lista', 'minha lista', 'adicionar', 'eu', 'usar',
    'ok', 'sim', 'bora', 'pode', 'quero', 'finalizar', 'pronto', 'fechar',
    'lista', 'ver', 'mostrar', 'obrigado', 'valeu', 'oi', 'ola', 'tchau',
    'nao', 'nÃ£o', 'cancelar', 'voltar', 'ajuda', 'help',
    'bom dia', 'boa tarde', 'boa noite', 'e ai', 'e aÃ­', 'olÃ¡',
]);

const COURTESY_WORDS = new Set([
    'oi', 'ola', 'olÃ¡', 'bom dia', 'boa tarde', 'boa noite', 'obrigado',
    'obrigada', 'valeu', 'e ai', 'e aÃ­', 'show', 'blz', 'beleza',
]);

/** Remove duplicatas (case-insensitive) e filtra garbage words */
function cleanProductList(products: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const p of products) {
        const key = p.toLowerCase().trim();
        if (key.length < 2) continue;
        if (GARBAGE_WORDS.has(key)) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(p.trim());
    }
    return result;
}

function normalizeText(value: string): string {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function extractPhoneNumber(message: string): string | null {
    const digits = String(message || '').replace(/\D/g, '');
    if (digits.length < 10) return null;
    if (digits.length === 10 || digits.length === 11) return digits;
    if (digits.length === 12 || digits.length === 13) {
        return digits.startsWith('55') ? digits : digits.slice(-11);
    }
    return digits.slice(-11);
}

function detectOptimizationPreference(message: string): 'economizar' | 'perto' | 'equilibrar' | null {
    const normalized = normalizeText(message);
    if (/\b(economizar|mais barato|barato mesmo|mesmo que seja longe|mais longe)\b/.test(normalized)) {
        return 'economizar';
    }
    if (/\b(mais perto|mercado perto|proximo|perto de mim)\b/.test(normalized)) {
        return 'perto';
    }
    if (/\b(equilibrar|equilibrio|os dois|balancear|custo beneficio)\b/.test(normalized)) {
        return 'equilibrar';
    }
    return null;
}

function formatPreferenceLabel(preference?: 'economizar' | 'perto' | 'equilibrar'): string {
    if (preference === 'economizar') return 'Economizar';
    if (preference === 'perto') return 'Mercado mais perto';
    return 'Equilibrar preÃ§o e distÃ¢ncia';
}

function capitalize(value: string): string {
    const text = String(value || '').trim();
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function looksLikeNeighborhoodFallback(message: string): boolean {
    const trimmed = String(message || '').trim();
    const normalized = normalizeText(trimmed);

    if (trimmed.length < 3 || trimmed.length > 80) return false;
    if (!/[a-zA-ZÀ-ÿ]/.test(trimmed)) return false;
    if (COURTESY_WORDS.has(normalized)) return false;
    if (trimmed.split(/\s+/).length > 8) return false;
    if (/\d/.test(trimmed)) return false;
    if (/\b(ajuda|help|socorro|nao sei|não sei|sei la|sei lá)\b/.test(normalized)) return false;

    return !/\b(quanto|valor|preco|precos|oferta|ofertas|lista|mercado|mercados|comprar|compra|quero|produto|produtos)\b/.test(normalized);
}

function normalizeTextListEntry(value: string): string {
    return String(value || '').toLowerCase().trim();
}

function isIntentResolved(intent: Intent | 'share_target', confidence: number, hasProducts: boolean): boolean {
    if (intent === 'share_target') {
        return true;
    }

    if (intent === 'saudacao' || intent === 'ajuda') {
        return true;
    }

    if (hasProducts) {
        return true;
    }

    return intent !== 'desconhecido' && confidence >= INTENT_CONFIDENCE_THRESHOLD;
}

function isActionableIntent(intent: Intent, hasProducts: boolean): boolean {
    if (hasProducts) {
        return true;
    }

    return !['saudacao', 'ajuda', 'desconhecido'].includes(intent);
}

function shouldAutoSaveReceipt(pipelineResult: PipelineResult, receiptData: any): boolean {
    if (pipelineResult.source === 'receipt_sefaz') {
        return true;
    }

    return Number(receiptData?.confidence || 0) >= RECEIPT_AUTO_SAVE_THRESHOLD;
}

class ChatSession {
    private static diagnosticsChecked = false;

    private context: ChatContext;
    private readonly conversationState = new ConversationStateService();
    private readonly listManager: ListManager;
    private readonly purchaseManager: PurchaseManager;
    private readonly purchaseAnalytics: PurchaseAnalyticsService;
    private readonly ready: Promise<void>;
    private lastContextRefreshAt = 0;

    constructor(userId: string = 'default_user', storageUserId: string = userId) {
        this.context = {
            shoppingList: [],
            userId,
            storageUserId,
            transportMode: 'car',
            consumption: 10,
            isFirstContact: true,
        };

        this.listManager = new ListManager(storageUserId);
        this.purchaseManager = new PurchaseManager(storageUserId, userId);
        this.purchaseAnalytics = new PurchaseAnalyticsService(storageUserId);

        if (!ChatSession.diagnosticsChecked) {
            diagnosticService.runFullCheck();
            ChatSession.diagnosticsChecked = true;
        }

        this.ready = this.init();
    }

    private async init() {
        const { profile, recentInteractions } = await userProfileService.bootstrapUser(this.context.userId);
        this.context.shoppingList = await this.listManager.loadActiveList();

        // Carregar preferÃªncias persistentes
        const prefs = await userPreferencesService.getPreferences(this.context.userId);
        if (profile.name) this.context.userName = profile.name;
        if (prefs.name) this.context.userName = prefs.name;
        if (prefs.consumption) this.context.consumption = prefs.consumption;
        if (prefs.busTicket) this.context.busTicket = prefs.busTicket;
        if (prefs.optimizationPreference) this.context.optimizationPreference = prefs.optimizationPreference;
        if (prefs.userLocation) this.context.userLocation = prefs.userLocation;
        this.context.isFirstContact = recentInteractions.length === 0;
        recentInteractions.forEach((interaction) => {
            this.conversationState.addMessage(this.context.userId, interaction.role, interaction.content);
        });
        await this.refreshRichContext(true);
        console.log(`[ChatService] Preferences loaded for ${this.context.userId}:`, prefs);
    }

    public async processMessage(message: string): Promise<ChatResponse> { await this.conversationState.load(this.context.userId); const res = await this._processMessageInternal(message); await this.conversationState.save(this.context.userId); return res; }
    private async _processMessageInternal(message: string): Promise<ChatResponse> {
        await this.ready;
        await this.refreshRichContext();
        const conversationState = this.conversationState;
        console.log(`[ChatService] >>> INCOMING: "${message}"`);

        // LGPD: Interceptar comando de exclusao de dados
        const normalizedForLgpd = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

        // 📍 Interceptar comando nativo de localização enviado pela Bridge
        if (message.startsWith('[GPS_LOCATION_UPDATE]')) {
            console.log(`[ChatService] Bypass de NLP para Localização detectado.`);
            const coordsMatch = message.match(/\[GPS_LOCATION_UPDATE\]\s*([\d.-]+),\s*([\d.-]+)/);
            if (coordsMatch) {
                const lat = parseFloat(coordsMatch[1]);
                const lng = parseFloat(coordsMatch[2]);
                this.context.userLocation = { lat, lng };
                
                await userPreferencesService.savePreferences(this.context.userId, {
                    userLocation: { lat, lng },
                });
                console.log(`[ChatService] Localização salva no contexto: ${lat}, ${lng}`);
                return this.handleCoords(lat, lng); // Redireciona para o handler correto de processamento de coordenadas
            }
        }
        const isDeletionCommand = /\b(apagar|excluir|deletar|remover|esquece|esqueca)\s+(meus\s+)?dados\b/.test(normalizedForLgpd);
        if (isDeletionCommand) {
            console.log('[ChatService] [LGPD] Exclusao de dados solicitada: ' + this.context.userId);
            const result = await userDataDeletionService.anonymizeUser(this.context.userId);
            return { text: result.message };
        }

        const consentGate = await lgpdConsentService.evaluateConsentGate(this.context.userId, message);
        if (!consentGate.allowed) {
            return { text: consentGate.responseText || '' };
        }

        conversationState.addMessage(this.context.userId, 'user', message);
        await userProfileService.recordInteraction(this.context.userId, {
            role: 'user',
            content: message,
        });
        
        const rawResponse = await this._generateRawResponse(message);
        
        const history = conversationState.getHistory(this.context.userId);
        const historyForGemini = history.slice(0, -1); 
        
        const conversationalText = await aiService.generateConversationalResponse(
            rawResponse.text,
            historyForGemini,
            message,
            this.context.richContextSummary,
        );
        
        rawResponse.text = conversationalText;
        conversationState.addMessage(this.context.userId, 'assistant', rawResponse.text);
        await userProfileService.recordInteraction(this.context.userId, {
            role: 'assistant',
            content: rawResponse.text,
            intent: this.context.lastIntent,
        });

        return rawResponse;
    }

    private async _generateRawResponse(message: string): Promise<ChatResponse> {
        const conversationState = this.conversationState;
        conversationState.incrementTurn();
        const normalizedMessage = normalizeText(message);

        // â”€â”€â”€ 0. GPS: TRATAMENTO DE COORDENADAS DIRETAS â”€â”€â”€
        if (message.startsWith('COORDENADAS:') || message.startsWith('[GPS_LOCATION_UPDATE]')) {
            const cleanStr = message.replace('COORDENADAS:', '').replace('[GPS_LOCATION_UPDATE]', '').trim();
            const parts = cleanStr.split(',');
            if (parts.length === 2) {
                const lat = parseFloat(parts[0]);
                const lng = parseFloat(parts[1]);
                if (!isNaN(lat) && !isNaN(lng)) {
                    return this.handleCoords(lat, lng);
                }
            }
        }

        // â”€â”€â”€ 0.8. HOTFIX AMNESIA: EARLY RETURN PARA CONFIRMAÃ‡ÃƒO DE COMPRA â”€â”€â”€
        const pendingPurchaseConfirmation = await this.handlePendingPurchaseConfirmation(message);
        if (pendingPurchaseConfirmation) {
            return pendingPurchaseConfirmation;
        }
        if (conversationState.current === 'AWAITING_PURCHASE_CONFIRMATION') {
            const lowMsg = message.toLowerCase().trim();
            const confirmWords = ['ok', 'sim', 'confirmo', 'salva', 'pode salvar', 'yes', 'confirmar', 'isso'];
            const negativeWords = ['cancelar', 'nÃ£o', 'nao', 'cancela', 'errado', 'descarta'];

            const isConfirm = confirmWords.some(w => lowMsg === w || lowMsg.startsWith(`${w} `));
            const isNegative = negativeWords.some(w => lowMsg === w || lowMsg.startsWith(`${w} `));

            if (isConfirm && this.context.pendingPurchase) {
                console.log(`[ChatService] Early Return: Bypassing NLP for Purchase Confirmation.`);
                const allItems = this.context.pendingMatchResult
                    ? [...this.context.pendingMatchResult.matched, ...this.context.pendingMatchResult.impulse]
                    : undefined;
                const res = await this.purchaseManager.saveConfirmedPurchase(this.context.pendingPurchase, allItems);

                // Finalizar lista se houve match com cupom
                if (this.context.pendingMatchResult && this.context.pendingMatchResult.matched.length > 0) {
                    await this.listManager.finalizeListWithReceipt();
                }

                this.context.pendingPurchase = undefined;
                this.context.pendingMatchResult = undefined;
                conversationState.reset();
                return res;
            }

            if (isNegative && this.context.pendingPurchase) {
                this.context.pendingPurchase = undefined;
                this.context.pendingMatchResult = undefined;
                conversationState.reset();
                return { text: 'Fechado. Não salvei esse cupom no seu histórico. Como posso te ajudar agora?' };
            }

            // Se ele digitar algo nada a ver no meio da confirmaÃ§Ã£o:
            return { text: 'Me responde com OK para salvar esse cupom no seu histórico ou CANCELAR para descartar.' };
        }

        // â”€â”€â”€ 0.1 FAST GREETING INTERCEPT â”€â”€â”€
        const veryShort = message.trim().toLowerCase();
        if (veryShort === '.' || veryShort === '?' || veryShort === '!' || veryShort === 'kole' || veryShort === 'koÃ©') {
            console.log(`[ChatService] Fast-intercepting greeting: "${veryShort}"`);
            return this.handleSaudacao();
        }

        // â”€â”€â”€ 0.2 ONBOARDING ANSWER (Sabe como funciona?) â”€â”€â”€
        if (conversationState.current === 'AWAITING_ONBOARDING_ANSWER') {
            const lowOnb = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const isNo = ['nao', 'n', 'nop', 'naum', 'no', 'fala logo', 'que nada', 'negativo', 'nem', 'ixe', 'conta ai', 'explica', 'como'].some(w => lowOnb === w || lowOnb.startsWith(`${w} `));
            const isYes = ['sim', 'yes', 'ok', 'sei', 'ja sei', 'claro', 'conheÃ§o', 'conheco', 's', 'sei sim', 'bora', 'ja'].some(w => lowOnb === w || lowOnb.startsWith(`${w} `));

            conversationState.reset();

            if (isNo) {
                return { text: "Show! Aqui Ã© simples:\n\nðŸ’¬ VocÃª me manda o nome do produto e eu te mostro o **preÃ§o mais barato** entre os mercados da sua regiÃ£o.\n\nðŸ›’ Pode montar sua **lista de compras** comigo e eu comparo os preÃ§os pra vocÃª economizar de verdade.\n\nðŸ“¸ Tirou foto do cupom fiscal? Me manda que eu registro os preÃ§os reais e ainda te mostro se teve **compra por impulso**!\n\nBora lÃ¡, me fala o que vocÃª precisa! ðŸ·ï¸" };
            }

            if (isYes) {
                return { text: "Boa! Quem jÃ¡ sabe usar sai na frente! ðŸ’ª\n\nEm que posso te ajudar hoje?\nâ€¢ PreÃ§o mais barato de algum produto?\nâ€¢ Montar uma lista de compras?\nâ€¢ Mercado mais prÃ³ximo de vocÃª?\n\nManda aÃ­! ðŸ›’" };
            }

            // Se ele jÃ¡ mandou um produto direto, trata como busca
            // Cai no fluxo normal abaixo
        }

        // â”€â”€â”€ 0.3 TRANSPORT INTERCEPT (FINALIZANDO LISTA) â”€â”€â”€
        if (conversationState.current === 'AWAITING_TRANSPORT_MODE_FOR_LIST') {
            const low = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            if (low.includes('carro') || low.includes('uber') || low.includes('moto')) this.context.transportMode = 'car';
            else if (low.includes('onibus') || low.includes('Ã´nibus') || low.includes('bus')) this.context.transportMode = 'bus';
            else if (low.includes('pe') || low.includes('pÃ©') || low.includes('andando')) this.context.transportMode = 'foot';
            else if (low.includes('bike') || low.includes('bicicleta')) this.context.transportMode = 'bike';
            else {
                return { text: "NÃ£o entendi bem como vocÃª vai. Responde aÃ­: ðŸš— Carro, ðŸšŒ Ã”nibus, ðŸš¶ A pÃ© ou ðŸš² Bike?" };
            }

            conversationState.reset();
            return this.handleCalcularTotalLista();
        }

        // Calcula interpretaÃ§Ã£o no inÃ­cio
        const interpretation = await aiService.interpret(message, this.context);
        const explicitPreference = detectOptimizationPreference(message);
        const asksForProfile = /\b(o que (voce|vc) sabe sobre mim|o que lembra de mim|me fala meu historico|me fale meu historico)\b/.test(normalizedMessage);
        const hasProducts = Boolean(interpretation.product) || Boolean(interpretation.products?.length);
        const actionableIntent = isActionableIntent(interpretation.intent, hasProducts);

        if (this.context.isFirstContact && actionableIntent) {
            this.context.isFirstContact = false;
        }

        // â”€â”€â”€ 0.5. PRIMEIRO CONTATO: PEDIR LOCALIZACAO SEM TRAVAR â”€â”€â”€
        if (this.context.isFirstContact && conversationState.current === 'IDLE' && !actionableIntent) {
            this.context.isFirstContact = false;
            conversationState.transition('AWAITING_INITIAL_LOCATION', 'initial_location', null, 'Me manda sua localização para eu buscar mercados perto de você.');
            return this.handleSaudacao();
        }

        // â”€â”€â”€ 1. RESOLVER ESTADO PENDENTE (antes do NLP) â”€â”€â”€
        const pending = conversationState.resolveIfPending(message);

        if (conversationState.current === 'AWAITING_INITIAL_LOCATION') {
            if (looksLikeNeighborhoodFallback(message) && !actionableIntent) {
                return this.handleNeighborhoodFallback(message);
            }

            if (actionableIntent) {
                console.log(`[FIRST_CONTACT_LOCATION_SKIPPED] user=${this.context.userId} reason=actionable_message`);
                conversationState.reset();
            }

            if (/\b(nao|não|depois|agora nao|agora não|sem localizacao|sem localização)\b/.test(normalizedMessage)) {
                console.log(`[FIRST_CONTACT_LOCATION_SKIPPED] user=${this.context.userId} reason=user_declined`);
                conversationState.reset();
                return {
                    text: 'Sem problema 👍\n\nVocê também pode me mandar o nome de um produto, sua lista ou uma foto de oferta que eu já começo a te ajudar.',
                };
            }
        }

        // â”€â”€â”€ 1.5. GATILHO DE SAÃDA DO LOOP (CRIANDO_LISTA -> FINALIZAR) E BLOQUEIOS GLOBAIS â”€â”€â”€
        if (conversationState.current === 'CRIANDO_LISTA' || conversationState.current === 'AWAITING_ADD_TO_LIST') {
            const lowMsgRaw = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            const finishWords = ['finalizar', 'finaliza', 'fechar lista', 'fechar a lista', 'so isso', 'e so isso', 'tudo', 'cabou', 'acabou', 'encerra', 'pode finalizar'];
            const isFinish = finishWords.some(w => lowMsgRaw === w || lowMsgRaw.includes(` ${w}`) || lowMsgRaw.startsWith(`${w} `));

            // HOTFIX: "ver lista" / "mostrar lista" â†’ mostrar a lista sem adicionar como item
            const viewListWords = ['ver lista', 'mostrar lista', 'minha lista', 'ver a lista', 'mostra a lista', 'mostra lista', 'exibir lista'];
            const isViewList = viewListWords.some(w => lowMsgRaw === w || lowMsgRaw.startsWith(`${w}`));
            if (isViewList) {
                console.log(`[ChatService] Interceptando 'ver lista' durante CRIANDO_LISTA`);
                const curList = await this.listManager.recoverActiveListItemsOnly();
                if (curList.items.length > 0) {
                    return { text: `${curList.text}Quer adicionar mais itens ou **FINALIZAR**?` };
                }
                return { text: "Sua lista estÃ¡ vazia. Me diga os produtos que quer adicionar!" };
            }

            // HOTFIX 2: Finalizar deve ser exclusivo de CRIANDO_LISTA
            if (isFinish) {
                console.log(`[ChatService] Gatilho de saÃ­da ativado: ${message}`);
                conversationState.transition('AWAITING_TRANSPORT_MODE_FOR_LIST', 'choose_transport_for_list', null, 'Como vocÃª vai pro mercado?');
                return { text: "Massa, lista fechada! ðŸ›’\nPra eu te dar a rota com o preÃ§o **REAL** (somando passagem ou gasolina), me diga: como vocÃª vai pro mercado?\nðŸš— Carro\nðŸšŒ Ã”nibus\nðŸš¶ A pÃ©\nðŸš² Bike" };
            }

            // HOTFIX 4: Bloqueio de IntenÃ§Ãµes Globais de Mobilidade durante o loop
            if (lowMsgRaw.includes('km/l') || lowMsgRaw.includes('km ') || lowMsgRaw.includes('carro faz') || lowMsgRaw.match(/\d+\s*(km\/l|km por litro)/)) {
                return { text: "Opa, jÃ¡ guardo essa info do seu transporte! Mas antes, quer adicionar mais itens ou podemos **FINALIZAR** sua lista de produtos?" };
            }
        }

        const fallbackIntent = explicitPreference
            ? 'definir_preferencia_usuario'
            : asksForProfile
                ? 'ver_perfil_usuario'
                : interpretation.intent;
        const intent: Intent | 'share_target' = pending ? (pending.action as Intent) : fallbackIntent;
        this.context.lastIntent = intent;

        // VERIFICAÃ‡ÃƒO DE ERRO NA API DA OPENAI:
        if (interpretation.nlpResult?.entities[0]?.value === 'API_ERROR') {
            console.error(`[ChatService] NLP Error Bubble-up: API Falhou silenciosamente.`);
            return { text: "Estou com uma instabilidade no meu cérebro de IA agora, tente de novo em um segundo." };
        }

        // ANTI-AMNÃ‰SIA: Se o estado nÃ£o Ã© IDLE e o NLP falhou em achar algo forte,
        // forÃ§a a repetiÃ§Ã£o do estado pendente ou trata como resposta ao estado.
        // E ESPECIAL: Se o LLM disse CANCEL_OR_EXIT (convertido para desconhecido mas validado em AiService)
        if (intent === 'desconhecido' && interpretation.nlpResult?.intent === 'CANCEL_OR_EXIT') {
            console.log(`[ChatService] Cancel or Exit detected. Clearing State.`);
            conversationState.reset();
            return { text: "Tudo bem! Se precisar de algo mais, Ã© sÃ³ chamar. ðŸ‘‹" };
        }

        if (conversationState.current !== 'IDLE' && (intent === 'saudacao' || intent === 'desconhecido')) {
            console.log(`[ChatService] Amnesia Guard: State "${conversationState.current}" blocked intent "${intent}".`);
            return { text: `Desculpe, ainda estou aguardando sua resposta anterior: **${conversationState.prompt}**` };
        }

        console.log(`[ChatService] Intent: ${intent} | Batch: ${interpretation.isBatch} | Confidence: ${interpretation.confidence}`);
        if (isIntentResolved(intent, interpretation.confidence, hasProducts)) {
            console.log(`[INTENT_RESOLVED] user=${this.context.userId} intent=${intent} confidence=${interpretation.confidence.toFixed(2)}`);
        }

        // â”€â”€â”€ 2. HANDLER PARA AÃ‡Ã•ES DO STATE MACHINE â”€â”€â”€
        // Quando resolveIfPending retorna, o action pode ser diferente dos intents do NLP
        if (pending) {
            const pendingResponse = await this.handlePendingAction(pending, message, interpretation);
            if (pendingResponse) {
                return pendingResponse;
            }
            switch (pending.action) {
                case 'save_user_name': {
                    // Onboarding: salvar nome
                    const userName = message.trim().split(' ')[0];
                    this.context.userName = userName;
                    await userPreferencesService.savePreferences(this.context.userId, { name: userName });
                    await userProfileService.updateUserName(this.context.userId, userName);
                    conversationState.transition('AWAITING_ONBOARDING_ANSWER', 'onboarding_answer', null, 'Sabe como funciona?');
                    return { text: `Fala ${userName}! ðŸ‘‹ Bora economizar? Pode perguntar preÃ§o de qualquer produto de supermercado ou mandar a lista do mÃªs que te ajudo a economizar!\n\nSabe como funciona?` };
                }
                case 'list_recovery': {
                    // UsuÃ¡rio decidiu: manter lista existente ou criar nova
                    const lowRecover = pending.originalMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    const isNew = ['nova', 'criar', 'criar nova', 'nova lista', 'lista nova', 'nova', 'nao', 'n', 'limpa', 'apaga', 'deleta'].some(w => lowRecover === w || lowRecover.startsWith(`${w} `));

                    if (isNew) {
                        // Deletar lista nÃ£o-finalizada e comeÃ§ar do zero
                        await this.listManager.deleteActiveList();
                        this.context.shoppingList = [];

                        // Se tinha produtos pendentes (do intent original), criar com eles
                        const pendingProducts = pending.data?.products;
                        if (pendingProducts && pendingProducts.length > 0) {
                            this.context.shoppingList = pendingProducts.map((name: string) => ({ name }));
                            await this.listManager.persistList(this.context.shoppingList);
                            const createdList = await this.listManager.recoverActiveListItemsOnly();
                            conversationState.transition('CRIANDO_LISTA', 'adicionar_item_lista', null, 'Diga os itens');
                            return { text: `âœ… Lista nova criada! ðŸ›’\n\n${createdList.text}Quer adicionar mais itens ou **FINALIZAR**?` };
                        }

                        conversationState.transition('CRIANDO_LISTA', 'adicionar_item_lista', null, 'Me diga os produtos!');
                        return { text: "âœ… Lista anterior apagada! Me diga os produtos pra nova lista." };
                    }

                    // Manter lista existente â†’ carregar e entrar em CRIANDO_LISTA
                    this.context.shoppingList = await this.listManager.loadActiveList();

                    // Se tinha produtos pendentes, adicionar junto
                    const pendingProds = pending.data?.products;
                    if (pendingProds && pendingProds.length > 0) {
                        for (const p of pendingProds) {
                            if (!this.context.shoppingList.find(i => i.name.toLowerCase() === p.toLowerCase())) {
                                this.context.shoppingList.push({ name: p });
                            }
                        }
                        await this.listManager.persistList(this.context.shoppingList);
                    }

                    const recoveredList = await this.listManager.recoverActiveListItemsOnly();
                    conversationState.transition('CRIANDO_LISTA', 'adicionar_item_lista', null, 'Diga os itens');
                    return { text: `ðŸ‘ Mantive sua lista! ðŸ›’\n\n${recoveredList.text}Quer adicionar mais itens ou **FINALIZAR**?` };
                }
                case 'add_to_list': {
                    // UsuÃ¡rio disse "sim" apÃ³s busca de preÃ§o Ãºnico ou fallback de mercado
                    if (pending.confirmed) {
                        let productsToAdd: string[] = [];
                        const msgClean = pending.originalMessage.toLowerCase()
                            .replace(/\b(sim|yes|ok|pode|quero|anota|bora|manda|por favor|claro|com certeza|isso)\b/g, '')
                            .replace(/[,e]/g, ' ')
                            .split(/\s+/)
                            .filter(Boolean);

                        if (msgClean.length > 0) {
                            productsToAdd = msgClean;
                        } else if (pending.data && pending.data !== 'variados') {
                            productsToAdd = [pending.data];
                        } else {
                            conversationState.transition('CRIANDO_LISTA', 'adicionar_item_lista', null, 'Diga os itens');
                            return { text: "Beleza! Me diga quais itens vocÃª quer colocar na lista." };
                        }

                        let addedCount = 0;
                        for (const product of productsToAdd) {
                            if (!this.context.shoppingList.find(i => i.name.toLowerCase() === product)) {
                                this.context.shoppingList.push({ name: product });
                                addedCount++;
                            }
                        }
                        await this.listManager.persistList(this.context.shoppingList);
                        const addedText = addedCount > 1 ? `**variados**` : `**${productsToAdd[0]}**`;

                        conversationState.transition('CRIANDO_LISTA', 'adicionar_item_lista', null, 'Diga os itens');
                        return { text: `âœ… ${addedCount > 1 ? 'Itens adicionados' : addedText + ' adicionado'} Ã  sua lista! ðŸ›’\n\nDiga mais um produto ou _"ver lista"_ para conferir.` };
                    }
                    return { text: "Beleza, nÃ£o anotei. O que mais precisa?" };
                }
                case 'add_batch_to_list': {
                    // UsuÃ¡rio disse "sim" apÃ³s busca de mÃºltiplos produtos
                    // HOTFIX: usar allProducts do context para adicionar TODOS, nÃ£o sÃ³ os com preÃ§o
                    if (pending.confirmed && pending.data) {
                        const productsToAdd: string[] = this.context.pendingAllProducts || pending.data;

                        for (const p of productsToAdd) {
                            if (!this.context.shoppingList.find(i => i.name.toLowerCase() === p.toLowerCase())) {
                                this.context.shoppingList.push({ name: p });
                            }
                        }
                        this.context.pendingAllProducts = undefined;
                        await this.listManager.persistList(this.context.shoppingList);
                        conversationState.transition('CRIANDO_LISTA', 'adicionar_item_lista', null, 'Diga os itens');
                        return { text: `âœ… **${productsToAdd.join(', ')}** adicionados Ã  sua lista! ðŸ›’\n\nDiga mais um produto ou _"ver lista"_ para conferir.` };
                    }
                    this.context.pendingAllProducts = undefined;
                    return { text: "Beleza, nÃ£o anotei. O que mais precisa?" };
                }
                case 'confirm_list': {
                    if (pending.confirmed) {
                        return this.handleCalcularTotalLista();
                    }
                    return { text: "Beleza! Quer adicionar mais itens ou me fala o que precisa." };
                }
                case 'multi_choice': {
                    const savedProducts: string[] = pending.data || [];
                    if (pending.confirmed) {
                        // UsuÃ¡rio escolheu PREÃ‡O â†’ buscar preÃ§o de cada produto
                        console.log(`[ChatService] Multi-choice: PREÃ‡O para ${savedProducts.length} produtos`);
                        const batchResult = await offerEngine.lookupBatch(savedProducts);
                        this.context.pendingAllProducts = savedProducts; // Salvar TODOS para add na lista depois
                        if (batchResult.products.length > 0) {
                            conversationState.transition('AWAITING_ADD_TO_LIST', 'add_batch_to_list', batchResult.products, 'Quer anotar na lista?');
                            return { text: `${batchResult.text}\n\n**Quer que eu anote na sua Lista de Compras? (Sim/NÃ£o)**` };
                        }
                        return { text: batchResult.text };
                    } else {
                        // UsuÃ¡rio escolheu LISTA â†’ criar lista de compras
                        console.log(`[ChatService] Multi-choice: LISTA com ${savedProducts.length} produtos`);
                        await this.listManager.archiveActiveList();
                        this.context.shoppingList = savedProducts.map(name => ({ name }));
                        await this.listManager.persistList(this.context.shoppingList);
                        const createdList = await this.listManager.recoverActiveListItemsOnly();
                        conversationState.transition('AWAITING_LIST_CONFIRMATION', 'confirm_list', this.context.shoppingList, 'Finalizar lista?');
                        return { text: `Lista com ${savedProducts.length} itens criada com sucesso! ðŸ›’\n\n${createdList.text}Finalizar lista?` };
                    }
                }
                case 'confirm_expense': {
                    if (pending.confirmed && pending.data) {
                        const { amount, marketName: mktName } = pending.data;
                        // Registrar despesa como compra simplificada
                        await this.purchaseManager.saveConfirmedPurchase({
                            marketName: mktName,
                            total: amount,
                            items: [],
                            date: new Date().toISOString(),
                        });
                        const formattedVal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
                        return { text: `âœ… Gasto de **${formattedVal}** no **${mktName}** registrado com sucesso!` };
                    }
                    return { text: "Gasto cancelado. O que mais precisa?" };
                }
                case 'CRIANDO_LISTA': {
                    // Adicionar mais itens durante criaÃ§Ã£o de lista
                    const normalizedMessage = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                    if (COURTESY_WORDS.has(normalizedMessage)) {
                        const updatedList = await this.listManager.recoverActiveListItemsOnly();
                        return { text: `${updatedList.text}Pode me dizer mais um produto ou **FINALIZAR** para eu fechar sua lista.` };
                    }

                    const rawNewItems = interpretation.products || interpretation.nlpResult.entities.map(e => e.value);
                    const newItems = cleanProductList(rawNewItems);
                    if (newItems.length > 0) {
                        let addedCount = 0;
                        const duplicates: string[] = [];
                        for (const itemName of newItems) {
                            if (this.context.shoppingList.find(i => i.name.toLowerCase() === itemName.toLowerCase())) {
                                duplicates.push(itemName);
                            } else {
                                this.context.shoppingList.push({ name: itemName });
                                addedCount++;
                            }
                        }
                        await this.listManager.persistList(this.context.shoppingList);
                        const updatedList = await this.listManager.recoverActiveListItemsOnly();

                        let response = '';
                        if (addedCount > 0) response += `Adicionei! ðŸ›’\n\n`;
                        if (duplicates.length > 0) response += `âš ï¸ **${duplicates.join(', ')}** jÃ¡ ${duplicates.length === 1 ? 'estÃ¡' : 'estÃ£o'} na lista.\n\n`;
                        response += `${updatedList.text}Quer adicionar mais itens ou **FINALIZAR**?`;
                        return { text: response };
                    }
                    // Se digitou algo que nÃ£o Ã© produto, tenta interpretar como produto mesmo
                    const singleItem = message.trim();
                    if (singleItem.length > 1 && singleItem.length < 50 && !GARBAGE_WORDS.has(singleItem.toLowerCase().trim())) {
                        // Verificar duplicata
                        if (this.context.shoppingList.find(i => i.name.toLowerCase() === singleItem.toLowerCase())) {
                            const updatedList = await this.listManager.recoverActiveListItemsOnly();
                            return { text: `âš ï¸ **${singleItem}** jÃ¡ estÃ¡ na sua lista!\n\n${updatedList.text}Quer adicionar mais itens ou **FINALIZAR**?` };
                        }
                        this.context.shoppingList.push({ name: singleItem });
                        await this.listManager.persistList(this.context.shoppingList);
                        const updatedList = await this.listManager.recoverActiveListItemsOnly();
                        return { text: `Adicionei **${singleItem}**! ðŸ›’\n\n${updatedList.text}Quer adicionar mais ou **FINALIZAR**?` };
                    }
                    return { text: "NÃ£o entendi. Me diga o nome do produto ou **FINALIZAR** para fechar a lista." };
                }
                case 'share_list': {
                    if (pending.confirmed === null) {
                        return { text: "VocÃª prefere ver a rota para o mercado mais barato ou compartilhar a lista no WhatsApp?" };
                    }
                    if (pending.confirmed) {
                        // Rota para o mercado â€” com cÃ¡lculo multimodal de transporte
                        const topMarketName = pending.data?.topMarketName;
                        const dest = encodeURIComponent((topMarketName || "Supermercado"));
                        const routeLink = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;

                        // Se o usuÃ¡rio tem localizaÃ§Ã£o, calcular custos de transporte
                        if (this.context.userLocation && topMarketName) {
                            try {
                                const nearbyMarkets = await geoDecisionEngine.findNearbyMarkets(
                                    this.context.userLocation.lat,
                                    this.context.userLocation.lng,
                                    50
                                );
                                const marketGeo = nearbyMarkets.find((m: any) =>
                                    m.marketName?.toLowerCase().includes(topMarketName.toLowerCase()) ||
                                    topMarketName.toLowerCase().includes(m.marketName?.toLowerCase() || '')
                                );

                                if (marketGeo?.distance) {
                                    const distKm = marketGeo.distance;
                                    const costs = calculateAllTransportCosts(
                                        distKm,
                                        this.context.consumption || 10,
                                        this.context.busTicket || 4.50
                                    );

                                    const listTotal = pending.data?.listTotal || 0;
                                    const transportLines = costs.map(c => {
                                        const costStr = c.cost > 0 ? `R$ ${c.cost.toFixed(2).replace('.', ',')}` : 'GrÃ¡tis';
                                        const realTotal = listTotal > 0 ? ` â†’ Total real: **R$ ${(listTotal + c.cost).toFixed(2).replace('.', ',')}**` : '';
                                        return `${c.emoji} **${c.label}**: ${costStr} (${c.time})${realTotal}`;
                                    });

                                    return {
                                        text: `ðŸ“ **Rota para ${topMarketName}** (${distKm.toFixed(1)} km)\n\n` +
                                            `ðŸ§® **Custo de deslocamento (ida e volta):**\n${transportLines.join('\n')}\n\n` +
                                            `ðŸ”— ${routeLink}\n\n` +
                                            `ðŸ’¡ _Classe C economiza em cada detalhe! Escolha o meio de transporte que mais cabe no seu bolso._ ðŸ’ª`
                                    };
                                }
                            } catch (err) {
                                console.error('[ChatService] Transport calc error:', err);
                            }
                        }

                        // Fallback sem localizaÃ§Ã£o
                        return { text: `ðŸ“ **Rota para o ${topMarketName || 'mercado mais barato'}**\n\nðŸ”— ${routeLink}\n\nðŸ’¡ _Compartilhe sua localizaÃ§Ã£o para eu calcular o custo de transporte (carro, Ã´nibus, a pÃ©, bike e uber)!_` };
                    } else {
                        // Compartilhar (WhatsApp)
                        const listItems = pending.data?.list || this.context.shoppingList;
                        if (listItems.length === 0) return { text: "Sua lista estÃ¡ vazia." };
                        const share = this.listManager.getShareText(listItems);
                        return { text: `Aqui estÃ¡ sua lista pronta para compartilhar!\n\n${share}`, shareContent: share };
                    }
                }
                default:
                    // AÃ§Ã£o nÃ£o reconhecida do state machine, continuar para o switch de intents
                    break;
            }
        }

        // â”€â”€â”€ 2.5. FALLBACK INTELIGENTE: Detectar nomes de rede como busca de mercado â”€â”€â”€
        const KNOWN_MARKETS = ['atacadÃ£o', 'atacadao', 'extrabom', 'assaÃ­', 'assai', 'carone', 'casagrande', 'rede show', 'redeshow', 'multishow', 'multi show', 'bh supermercados', 'bh', 'supermarket'];
        if (intent === 'consultar_preco_produto' || intent === 'comparar_menor_preco') {
            const searchTerm = (interpretation.product || interpretation.nlpResult.entities[0]?.value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
            if (searchTerm.length >= 2) {
                const matchedMarket = KNOWN_MARKETS.find(m => searchTerm.includes(m) || m.includes(searchTerm));
                if (matchedMarket && searchTerm.length <= 20) {
                    console.log(`[ChatService] Market Fallback: "${searchTerm}" â†’ ofertas_mercado (matched: ${matchedMarket})`);
                    const purchases = await this.purchaseAnalytics.getFrequentProducts(30);
                    const marketVitrine = await offerEngine.getTopOffersByMarket(searchTerm, purchases);
                    if (marketVitrine.startsWith("Poxa, nÃ£o encontrei") || marketVitrine.includes("ativas para o mercado agora")) {
                        return { text: marketVitrine };
                    }
                    conversationState.transition('AWAITING_ADD_TO_LIST', 'add_to_list', 'variados', 'Quer que eu adicione as melhores ofertas?');
                    return { text: `${marketVitrine}\n\n**Quer que eu coloque algum desses na sua lista de compras?** ðŸ›’\n(Diga 'Sim' e depois cite os nomes)` };
                }
            }
        }

        // â”€â”€â”€ 2.6. MULTI-PRODUTO: Perguntar "preÃ§o ou lista?" â”€â”€â”€
        const rawMultiProducts = interpretation.products || interpretation.nlpResult.entities.map(e => e.value);
        const multiProducts = cleanProductList(rawMultiProducts);
        const hasMultipleProducts = multiProducts.length >= 2;
        const msgLower = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const hasExplicitListKeyword = /\b(lista|monte|cria|montar|criar|minha lista)\b/.test(msgLower);

        if (hasMultipleProducts && !hasExplicitListKeyword &&
            (intent === 'criar_lista' || intent === 'consultar_preco_multiplos_produtos' || intent === 'comparar_menor_preco_multiplos_produtos')) {
            console.log(`[ChatService] Multi-product question: ${multiProducts.length} products, asking user intent`);
            conversationState.transition('AWAITING_MULTI_CHOICE', 'multi_choice', multiProducts, '1 ou 2?');
            const productList = multiProducts.map(p => `â€¢ ${p}`).join('\n');
            return { text: `Encontrei ${multiProducts.length} produtos:\n${productList}\n\nO que vocÃª prefere?\n1ï¸âƒ£ Ver o **preÃ§o** de cada um\n2ï¸âƒ£ Criar uma **lista de compras**` };
        }

        switch (intent as Intent | 'share_target') {
            // â”€â”€â”€ SaudaÃ§Ã£o / Ajuda â”€â”€â”€
            case 'saudacao':
                return this.handleSaudacao();
            case 'ajuda':
                return { text: "Pode perguntar de tudo: do pÃ£o atÃ© as comprinhas de farmÃ¡cia (tipo fralda, camisinha). ðŸ›’\nManda bala no que vocÃª precisa:\nâ€¢ _\"Quanto tÃ¡ o arroz?\"_\nâ€¢ _\"Lista: arroz, feijÃ£o, frango\"_\nâ€¢ Mude o mercado: _\"AtacadÃ£o\"_ ou _\"Extrabom\"_\nâ€¢ Envie a foto ou link do Cupom Fiscal!" };

            // â”€â”€â”€ Cupom / Comprovante / Foto de oferta â”€â”€â”€
            case 'processar_comprovante_compra': {
                return this.handleReceiptSubmission(message);
            }
            case 'confirmar_registro':
                return this.handlePurchaseConfirmation();
            case 'cancelar_compra':
                return this.handlePurchaseCancellation();
            case 'finalizar_compra':
                return { text: "Para registrar uma compra real, envie uma foto do cupom, QR Code ou do preÃ§o na prateleira. ðŸ“¸" };

            // â”€â”€â”€ Multi-Produto (TOP 3 por produto + proativo) â”€â”€â”€
            case 'consultar_preco_multiplos_produtos':
            case 'comparar_menor_preco_multiplos_produtos': {
                const products = interpretation.products || interpretation.nlpResult.entities.map(e => e.value);
                if (products.length === 0) return { text: "Quais produtos vocÃª gostaria de consultar?" };

                const batchResult = await offerEngine.lookupBatch(products, this.context.userLocation, this.context.transportMode, this.context.consumption);
                this.context.pendingAllProducts = products; // Salvar TODOS para add na lista depois

                if (batchResult.products.length > 0) {
                    conversationState.transition('AWAITING_ADD_TO_LIST', 'add_batch_to_list', batchResult.products, 'Quer que eu anote isso na sua Lista de Compras?');
                    return { text: `${batchResult.text}\n\n**Quer que eu anote isso na sua Lista de Compras? (Sim/NÃ£o)**` };
                }
                return { text: batchResult.text };
            }

            // â”€â”€â”€ GeolocalizaÃ§Ã£o â”€â”€â”€
            case 'compartilhar_localizacao':
                return this.handleLocation();
            case 'find_nearby_markets':
                return this.handleFindNearbyMarkets();
            case 'definir_transporte':
                return this.handleTransport(message.toLowerCase());
            case 'definir_consumo':
                return this.handleConsumption(message.toLowerCase());
            case 'definir_preferencia_usuario': {
                return this.handlePreferenceIntent(explicitPreference);
                const preference = explicitPreference;
                if (!preference) {
                    return { text: "Me diga como vocÃª prefere que eu priorize as sugestÃµes:\nâ€¢ **economizar**\nâ€¢ **mercado mais perto**\nâ€¢ **equilibrar os dois**" };
                }

                const normalizedPreference = preference as 'economizar' | 'perto' | 'equilibrar';
                this.context.optimizationPreference = normalizedPreference;
                await userPreferencesService.savePreferences(this.context.userId, {
                    optimizationPreference: normalizedPreference,
                });
                await this.refreshRichContext(true);

                const messages = {
                    economizar: 'âœ… Anotado! Vou priorizar as opÃ§Ãµes mais baratas primeiro, mesmo que sejam um pouco mais longe.',
                    perto: 'âœ… Fechado! Vou priorizar os mercados mais perto de vocÃª primeiro.',
                    equilibrar: 'âœ… Combinado! Vou equilibrar preÃ§o e distÃ¢ncia para te mostrar a melhor escolha.',
                };

                return { text: `${messages[normalizedPreference]}\n\nPode mudar quando quiser.` };
            }
            case 'ver_perfil_usuario':
                return this.handleShowUserProfile();

            // â”€â”€â”€ Ofertas EspecÃ­ficas de um Mercado â”€â”€â”€
            case 'ofertas_mercado':
            case 'get_market_offers': {
                return this.handleMarketOffersIntent(interpretation.nlpResult.entities[0]?.value);
                const marketName = interpretation.nlpResult.entities[0]?.value;
                if (!marketName) return { text: "De qual mercado vocÃª quer ver as ofertas?" };
                // Carregar histÃ³rico de compras para cruzar
                const mktPurchases = await this.purchaseAnalytics.getFrequentProducts(30);
                const marketVitrine = await offerEngine.getTopOffersByMarket(marketName, mktPurchases);
                if (marketVitrine.startsWith("Poxa, nÃ£o encontrei")) {
                    return { text: marketVitrine };
                }
                conversationState.transition('AWAITING_ADD_TO_LIST', 'add_to_list', 'variados', 'Quer que eu adicione as melhores ofertas?');
                return { text: `${marketVitrine}\n\n**Quer que eu coloque algum desses na sua lista de compras?** ðŸ›’\n(Diga 'Sim' e depois cite os nomes)` };
            }

            // â”€â”€â”€ Ofertas da Semana â”€â”€â”€
            case 'ofertas_da_semana': {
                const vitrine = await offerEngine.getWeeklyVitrine();
                return { text: vitrine };
            }

            // â”€â”€â”€ Ofertas por Categoria â”€â”€â”€
            case 'buscar_categoria': {
                return this.handleCategoryOffersIntent(interpretation.nlpResult.entities[0]?.value);
                const categoryName = interpretation.nlpResult.entities[0]?.value;
                if (!categoryName) return { text: "Qual departamento ou categoria vocÃª quer buscar? (ex: Carnes, Limpeza, Cervejas)" };
                const catVitrine = await offerEngine.getCategoryVitrine(categoryName);
                if (catVitrine.startsWith("Poxa") || catVitrine.startsWith("As ofertas")) {
                    return { text: catVitrine };
                }
                conversationState.transition('AWAITING_ADD_TO_LIST', 'add_to_list', 'variados', 'Quer que eu adicione algum item?');
                return { text: `${catVitrine}\n\n**Gostou de algo? Quer que eu adicione Ã  sua lista de compras?** ðŸ›’\n(Diga 'Sim' e depois cite os nomes)` };
            }

            // â”€â”€â”€ HistÃ³rico de PreÃ§os (Global) â”€â”€â”€
            case 'consultar_historico_global': {
                return this.handlePriceHistoryIntent(interpretation.product || interpretation.nlpResult.entities[0]?.value, message);
                const product = interpretation.product || interpretation.nlpResult.entities[0]?.value;
                if (!product) return { text: "Qual produto vocÃª quer ver o histÃ³rico de preÃ§o?" };
                const targetDate = this.extractDateFromMessage(message);
                const historicalText = await offerEngine.getHistoricalPrices(product, targetDate || undefined);
                return { text: historicalText };
            }

            // â”€â”€â”€ AtualizaÃ§Ã£o de Registro Financeiro Pessoal â”€â”€â”€
            case 'registrar_gasto': {
                return this.handleExpenseRegistrationIntent(interpretation.nlpResult.entities[0]?.amount, interpretation.nlpResult.entities[0]?.value);
                const amount = interpretation.nlpResult.entities[0]?.amount;
                const marketNameGasto = interpretation.nlpResult.entities[0]?.value;

                if (amount === undefined || !marketNameGasto || marketNameGasto === 'desconhecido') {
                    return { text: "Para registrar um gasto financeiro, preciso do valor exato e do nome da loja. Exemplo: _'Gastei 150 reais no AtacadÃ£o'_." };
                }

                const payload = { amount, marketName: marketNameGasto };
                const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount as number);

                conversationState.transition('AWAITING_EXPENSE_CONFIRMATION', 'confirm_expense', payload, 'Confirmar gasto?');
                return { text: `ðŸ“ Entendi. VocÃª gastou **${formattedValue}** no mercado **${marketNameGasto.toUpperCase()}**?\n\n(Diga *Sim* para confirmar ou *NÃ£o* para cancelar)` };
            }

            // â”€â”€â”€ AnÃ¡lise de Gastos Pessoal â”€â”€â”€
            case 'analise_gastos_pessoal': {
                return this.handleExpenseAnalysisIntent(interpretation.product || interpretation.nlpResult.entities[0]?.value, message);
                const analyticsTerm = interpretation.product || interpretation.nlpResult.entities[0]?.value;
                const days = this.extractDaysFromMessage(message);

                if (analyticsTerm) {
                    const summary = await this.purchaseAnalytics.calculateCategoryAverage(analyticsTerm, days);
                    return { text: this.purchaseAnalytics.formatCategoryAnalysis(summary, analyticsTerm, days) };
                } else {
                    const top = await this.purchaseAnalytics.getTopSpending(days);
                    return { text: this.purchaseAnalytics.formatTopSpending(top, days) };
                }
            }

            // â”€â”€â”€ HistÃ³rico de Compras do UsuÃ¡rio â”€â”€â”€
            case 'gerenciar_lista':
            case 'mostrar_lista': {
                return this.handleShowListIntent();
                const curList = await this.listManager.recoverActiveListItemsOnly();
                if (curList.items.length > 0) {
                    conversationState.transition('AWAITING_LIST_CONFIRMATION', 'confirm_list', this.context.shoppingList, 'Finalizar lista?');
                    return { text: `${curList.text}Finalizar lista?` };
                }
                return { text: "Sua lista estÃ¡ vazia no momento. Diga algo como _'lista: arroz, feijÃ£o'_ para comeÃ§ar!" };
            }

            case 'limpar_lista':
                await this.listManager.archiveActiveList();
                this.context.shoppingList = [];
                return { text: "Lista limpa com sucesso! Quando quiser comeÃ§ar uma nova, Ã© sÃ³ me falar os itens." };

            case 'ver_ultima_lista':
                return this.listManager.getLastList();

            case 'ver_historico_compras':
            case 'ver_gastos_recentes': {
                return this.handleRecentHistoryIntent(interpretation.nlpResult.entities[0]?.days || this.extractDaysFromMessage(message));
                const days = interpretation.nlpResult.entities[0]?.days || this.extractDaysFromMessage(message);
                const endDate = new Date().toISOString().split('T')[0];
                const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const result = await this.purchaseAnalytics.getTotalSpentInPeriod(startDate, endDate);
                return { text: this.purchaseAnalytics.formatPeriodSummary(result, days) };
            }

            case 'ver_ultima_compra': {
                const purchase = await this.purchaseAnalytics.getLastPurchase();
                return { text: this.purchaseAnalytics.formatLastPurchase(purchase) };
            }

            case 'ver_padrao_consumo': {
                const daysPattern = interpretation.nlpResult.entities[0]?.days || this.extractDaysFromMessage(message);
                const pattern = await this.purchaseAnalytics.getConsumptionPattern(daysPattern);
                const predictivePlan = await predictiveShoppingService.buildMonthlyPlan(this.context.storageUserId);
                const predictiveText = predictiveShoppingService.formatMonthlyPlan(predictivePlan);
                return { text: `${this.purchaseAnalytics.formatConsumptionPattern(pattern, daysPattern)}\n\n${predictiveText}` };
            }

            // â”€â”€â”€ Lista â”€â”€â”€
            case 'montar_lista':
            case 'criar_lista': {
                return this.handleCreateListIntent(interpretation);
                const rawItems = interpretation.products || interpretation.nlpResult.entities.map(e => e.value);
                const items = cleanProductList(rawItems);

                // Verificar se jÃ¡ existe uma lista ativa nÃ£o-finalizada
                const existingList = await this.listManager.loadActiveList();
                if (existingList.length > 0) {
                    console.log(`[ChatService] Lista ativa encontrada com ${existingList.length} itens. Perguntando ao usuÃ¡rio.`);
                    conversationState.transition('AWAITING_LIST_RECOVERY', 'list_recovery', { products: items }, 'Manter ou criar nova?');
                    const preview = existingList.slice(0, 5).map(i => i.name).join(', ');
                    const moreText = existingList.length > 5 ? ` e mais ${existingList.length - 5}` : '';
                    return { text: `ðŸ“‹ VocÃª jÃ¡ tem uma lista com **${existingList.length} itens** (${preview}${moreText}).\n\nQuer **manter** essa lista e continuar adicionando ou **criar uma nova** do zero?` };
                }

                if (items.length === 0) {
                    conversationState.transition('CRIANDO_LISTA', 'adicionar_item_lista', null, 'Me dÃª os produtos que eu crio uma lista pra vocÃª bem rÃ¡pida e econÃ´mica!');
                    return { text: "Me dÃª os produtos que eu crio uma lista pra vocÃª bem rÃ¡pida e econÃ´mica!" };
                }

                // Criar nova lista
                const entities = interpretation.nlpResult.entities;
                this.context.shoppingList = items.map((name, idx) => ({
                    name,
                    quantity: entities[idx]?.quantity,
                    unit: entities[idx]?.unit
                }));
                await this.listManager.persistList(this.context.shoppingList);

                const createdList = await this.listManager.recoverActiveListItemsOnly();
                conversationState.transition('CRIANDO_LISTA', 'adicionar_item_lista', null, 'Diga os itens');
                return { text: `Lista com ${items.length} itens criada! ðŸ›’\n\n${createdList.text}Quer adicionar mais itens ou **FINALIZAR**?` };
            }
            case 'adicionar_item_lista': {
                return this.handleAddItemsIntent(interpretation);
                const addEntities = interpretation.nlpResult.entities;
                const interpretedProducts = ((interpretation.products || []) as string[]).filter((value) => typeof value === 'string' && value.length > 0);
                const fallbackAddItems: string[] = interpretation.product
                    ? [interpretation.product as string]
                    : addEntities.map(e => e.value).filter((value): value is string => Boolean(value));
                const rawAddItems: string[] = interpretedProducts.length > 0 ? interpretedProducts : fallbackAddItems;
                const addItems = cleanProductList(rawAddItems);
                if (addItems.length === 0) return { text: "Quais itens vocÃª quer adicionar?" };
                addItems.forEach((name, idx) => {
                    if (!this.context.shoppingList.find(i => i.name === name)) {
                        this.context.shoppingList.push({
                            name,
                            quantity: addEntities[idx]?.quantity,
                            unit: addEntities[idx]?.unit
                        });
                    }
                });
                await this.listManager.persistList(this.context.shoppingList);
                const addResult = await this.listManager.recoverActiveListItemsOnly();
                conversationState.transition('AWAITING_LIST_CONFIRMATION', 'confirm_list', this.context.shoppingList, 'Finalizar lista?');
                return { text: `Adicionei Ã  sua lista.\n\n${addResult.text}Finalizar lista?` };
            }
            case 'remover_item_lista': {
                return this.handleRemoveItemsIntent(interpretation);
                const interpretedRemoveProducts = ((interpretation.products || []) as string[]).filter((value) => typeof value === 'string' && value.length > 0);
                const fallbackRemoveItems: string[] = interpretation.product
                    ? [interpretation.product as string]
                    : interpretation.nlpResult.entities.map(e => e.value).filter((value): value is string => Boolean(value));
                const removeItems: string[] = interpretedRemoveProducts.length > 0 ? interpretedRemoveProducts : fallbackRemoveItems;
                if (removeItems.length === 0) return { text: "Quais itens vocÃª quer tirar da lista?" };
                this.context.shoppingList = this.context.shoppingList.filter(
                    item => !removeItems.some(r => item.name.toLowerCase().includes(r.toLowerCase()))
                );
                await this.listManager.persistList(this.context.shoppingList);
                const rmResult = await this.listManager.recoverActiveListItemsOnly();
                conversationState.transition('AWAITING_LIST_CONFIRMATION', 'confirm_list', this.context.shoppingList, 'Finalizar lista?');
                return { text: `Pronto, removi. Sua lista atualizada:\n\n${rmResult.text}Finalizar lista?` };
            }
            case 'calcular_total_lista':
            case 'melhor_mercado_para_lista': {
                return this.handleCalcularTotalLista();
            }
            case 'compartilhar_lista':
                if (this.context.shoppingList.length === 0) return { text: "Sua lista estÃ¡ vazia." };
                {
                    const targetPhone = extractPhoneNumber(message);
                    if (targetPhone) {
                        return this.shareListToPhone(targetPhone, this.context.shoppingList);
                    }
                    const share = this.listManager.getShareText(this.context.shoppingList);
                    conversationState.transition('AWAITING_SHARE_TARGET', 'share_target', { list: this.context.shoppingList }, 'Qual numero devo enviar?');
                    return { text: `Aqui estÃ¡ sua lista pronta para compartilhar:\n\n${share}\n\nSe quiser, eu tambÃ©m posso enviar direto para outro nÃºmero. Me manda o telefone com DDD.`, shareContent: share };
                }
            case 'share_target': {
                const targetPhone = extractPhoneNumber(message);
                const listItems = this.context.shoppingList;
                if (!targetPhone) {
                    return { text: "Preciso de um nÃºmero vÃ¡lido com DDD para enviar sua lista. Exemplo: **27999887766**." };
                }
                if (listItems.length === 0) {
                    return { text: "Sua lista estÃ¡ vazia agora. Me diga os itens e eu preparo outra." };
                }
                return this.shareListToPhone(targetPhone, listItems);
            }

            // â”€â”€â”€ PreÃ§o Ãšnico (PROATIVO: oferece adicionar na lista) â”€â”€â”€
            case 'consultar_preco_produto':
            case 'comparar_menor_preco': {
                return this.handleSinglePriceIntent(interpretation.product || interpretation.nlpResult.entities[0]?.value);
                const term = interpretation.product || interpretation.nlpResult.entities[0]?.value;
                if (!term) return { text: "Quais produtos vocÃª quer saber o preÃ§o?" };
                this.context.lastProduct = term;
                const priceText = await offerEngine.lookupSingle(term, this.context.userLocation, this.context.transportMode, this.context.consumption);

                if (priceText.startsWith("NÃ£o encontrei ofertas")) {
                    return { text: `Poxa, ainda nÃ£o encontrei ofertas vigentes para **${term}** hoje.` };
                }

                conversationState.transition('AWAITING_ADD_TO_LIST', 'add_to_list', term, 'Quer que eu anote isso na sua Lista de Compras?');
                return { text: `${priceText}\n\n**Quer que eu anote isso na sua Lista de Compras? (Sim/NÃ£o)**` };
            }

            default:
                console.warn(
                    `[FALLBACK_TRIGGERED] user=${this.context.userId} intent=${intent} confidence=${interpretation.confidence.toFixed(2)} hasProducts=${hasProducts}`,
                );
                return { text: CHAT_FALLBACK_TEXT };
        }
    }

    public async processImage(imageData: Uint8Array): Promise<ChatResponse> {
        await this.ready;
        await this.refreshRichContext();
        const conversationState = this.conversationState;
        console.log(`[ChatService] >>> INCOMING IMAGE`);
        this.context.isFirstContact = false;
        conversationState.incrementTurn();
        this.context.lastIntent = 'processar_comprovante_compra';
        conversationState.addMessage(this.context.userId, 'user', '[IMAGEM]');
        await userProfileService.recordInteraction(this.context.userId, {
            role: 'user',
            content: '[IMAGEM]',
            intent: 'processar_comprovante_compra',
        });

        const pipelineResult = await ingestionPipeline.processUserSubmission(imageData);
        const receiptData = pipelineResult.data;

        if (!pipelineResult.success || !pipelineResult.data) {
            return { text: pipelineResult.error || 'Não consegui extrair os dados da imagem. Envie uma foto mais nítida do cupom ou da oferta.' };
        }

        if (pipelineResult.source === 'community_tabloid') {
            const response = await this.enqueueTabloidToQueue(pipelineResult.data);
            conversationState.addMessage(this.context.userId, 'assistant', response.text);
            await userProfileService.recordInteraction(this.context.userId, { role: 'assistant', content: response.text, intent: 'processar_comprovante_compra' });
            return response;
        }

        if (pipelineResult.source === 'community_price_tag') {
            const response = await this.enqueuePriceTagToQueue(pipelineResult.data);
            conversationState.addMessage(this.context.userId, 'assistant', response.text);
            await userProfileService.recordInteraction(this.context.userId, { role: 'assistant', content: response.text, intent: 'processar_comprovante_compra' });
            return response;
        }

        const response = await this.handlePersonalReceiptFlow(pipelineResult, receiptData);
        conversationState.addMessage(this.context.userId, 'assistant', response.text);
        await userProfileService.recordInteraction(this.context.userId, {
            role: 'assistant',
            content: response.text,
            intent: 'processar_comprovante_compra',
        });

        return response;
    }

    // â”€â”€â”€ Extras & SaudaÃ§Ãµes â”€â”€â”€

    private handleSaudacao(): ChatResponse {
        return {
            text:
                'Olá! Eu sou o Economiza Fácil 💚\n\n' +
                'Eu te ajudo a descobrir onde sua compra sai mais barata pelo WhatsApp.\n\n' +
                'Pra começar do jeito certo, me manda sua localização 📍\n' +
                'Assim eu já busco os mercados mais próximos e as melhores ofertas pra você.',
            requestLocation: true,
        };
    }

    private handleLocation(): ChatResponse {
        return {
            text: 'Me manda sua localização 📍\n\nAssim eu busco os mercados mais próximos e as melhores ofertas perto de você.',
            requestLocation: true,
        };
    }

    private handleTransport(msg: string): ChatResponse {
        const conversationState = this.conversationState;
        if (msg.includes('carro')) {
            this.context.transportMode = 'car';
            conversationState.transition('AWAITING_CONSUMPTION', 'set_consumption', null, 'Qual o consumo mÃ©dio (km/l)?');
            return { text: "Entendido! VocÃª vai de **ðŸš— carro**. Qual o consumo mÃ©dio (km/l)? _(padrÃ£o: 10 km/l)_" };
        }
        if (msg.includes('onibus') || msg.includes('Ã´nibus') || msg.includes('bus')) {
            this.context.transportMode = 'bus';
            const priceMatch = msg.match(/\d+([.,]\d+)?/);
            if (priceMatch) {
                const val = parseFloat(priceMatch[0].replace(',', '.'));
                this.context.busTicket = val;
                userPreferencesService.savePreferences(this.context.userId, { busTicket: val });
            }
            conversationState.reset();
            return { text: `ðŸšŒ VocÃª vai de **Ã´nibus**! Considerei o valor da passagem como **R$ ${this.context.busTicket || 4.50}**.\nSe o valor for diferente, me diga: _'passagem custante X'_ ou mude para ðŸš— carro.` };
        }
        this.context.transportMode = 'foot';
        conversationState.reset();
        return { text: "Ã“timo! VocÃª vai **ðŸš¶ a pÃ©**. Custo de deslocamento: **R$ 0,00**. Vou considerar apenas mercados bem prÃ³ximos." };
    }

    private handleConsumption(msg: string): ChatResponse {
        const match = msg.match(/\d+([.,]\d+)?/);
        if (match) {
            const val = parseFloat(match[0].replace(',', '.'));
            this.context.consumption = val;
            userPreferencesService.savePreferences(this.context.userId, { consumption: val });
            return { text: `Entendido! Gravei o consumo de **${val} km/l** nas suas preferÃªncias. RecomendaÃ§Ãµes agora serÃ£o mais precisas! ðŸš—ðŸ’¨` };
        }
        return { text: "NÃ£o consegui identificar o valor. Pode digitar apenas o nÃºmero do consumo (ex: 12.5)?" };
    }

    private handleCoords(
        lat: number,
        lng: number,
        locationSource: 'user_declared' | 'gps_auto' = 'gps_auto',
    ): ChatResponse {
        this.context.userLocation = { lat, lng, address: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
        this.context.isFirstContact = false;
        void userPreferencesService.savePreferences(this.context.userId, {
            userLocation: this.context.userLocation,
            locationSource,
        });
        this.conversationState.reset();
        return { text: '📍 Localização recebida!\n\nAgora já consigo buscar os mercados mais próximos e as melhores ofertas pra você.\n\nPode mandar um produto, sua lista ou pedir ofertas de um mercado.' };
    }

    private handleNeighborhoodFallback(message: string): ChatResponse {
        const neighborhood = message.trim().replace(/\s+/g, ' ');
        this.context.isFirstContact = false;
        void userPreferencesService.savePreferences(this.context.userId, {
            neighborhood,
        });
        this.conversationState.reset();
        return {
            text:
                `Beleza, vou usar *${capitalize(neighborhood)}* como sua regiao por enquanto.\n\n` +
                'Se quiser mais precisao depois, pode me mandar o GPS pelo WhatsApp. Agora pode pedir um produto, uma lista ou mercados perto.',
        };
    }

    private async handleFindNearbyMarkets(): Promise<ChatResponse> {
        if (!this.context.userLocation) {
            this.context.userLocation = { lat: -20.2975, lng: -40.3015, address: "VitÃ³ria, ES" }; // Mock sem fricÃ§Ã£o para a classe C
        }
        const markets = await geoDecisionEngine.findNearbyMarkets(
            this.context.userLocation.lat,
            this.context.userLocation.lng,
        );
        if (!markets.length) {
            return { text: 'Ainda não achei mercados perto de você. Se quiser, me manda seu bairro para eu procurar melhor.' };
        }

        const lines = markets.slice(0, 3).map((market, index) =>
            `${index + 1}️⃣ ${market.marketName} - ${market.distance.toFixed(1).replace('.', ',')}km`,
        );
        const closest = markets[0];

        return {
            text:
                `🏪 Mercados perto de você\n\n${lines.join('\n')}\n\n` +
                `${closest.marketName} é o mais perto agora.\n\nQuer saber qual vale mais a pena para suas compras? 🚗`,
        };
    }

    private async handleCalcularTotalLista(): Promise<ChatResponse> {
        const conversationState = this.conversationState;
        if (this.context.shoppingList.length === 0) {
            return { text: 'Sua lista está vazia.' };
        }

        const comparison = await shoppingComparisonService.compareItems(this.context.shoppingList);
        const comparativeText = this.formatShoppingComparisonForWhatsApp(comparison);

        if (comparison.ranking.length === 0) {
            return {
                text: `${comparativeText}\n\nSe quiser, posso manter sua lista e tentar de novo depois.`,
            };
        }

        const topMarketName = comparison.bestMarket?.marketName || comparison.ranking[0]?.marketName || 'Mercado';

        // SugestÃ£o inteligente baseada na categoria dominante da lista
        const suggestion = await offerEngine.getSmartSuggestion(this.context.shoppingList);
        const suggestionText = suggestion ? suggestion.text : '';

        conversationState.transition('AWAITING_SHARE_CONFIRMATION', 'share_list', { list: this.context.shoppingList, topMarketName }, 'Quer compartilhar essa lista?');
        return { text: `${comparativeText}${suggestionText}\n\nQuer calcular o transporte também? 🚗` };
    }

    private formatShoppingComparisonForWhatsApp(comparison: ShoppingComparisonResult): string {
        if (comparison.items.length === 0) {
            return 'Sua lista está vazia.';
        }

        if (comparison.ranking.length === 0) {
            const itemLines = comparison.items.map((item) => `â€¢ ${item.name}`).join('\n');
            return `🛒 Sua lista tem ${comparison.items.length} itens, mas ainda não encontrei ofertas suficientes para comparar.\n\nItens da lista:\n${itemLines}`;
        }

        const bestMarket = comparison.bestMarket || comparison.ranking[0];
        const rankingLines = comparison.ranking
            .slice(0, 3)
            .map((entry, index) => `${index + 1}️⃣ ${entry.marketName} - ${this.formatCurrency(entry.total)}`)
            .join('\n');

        const missingText = bestMarket.missingItems.length > 0
            ? `\n\n⚠️ Ainda não achei estes itens nesse mercado:\n${bestMarket.missingItems.map((item) => `• ${item.name}`).join('\n')}`
            : '';

        const title = `🛒 Melhor mercado pra sua lista (${comparison.items.length} itens)`;
        const savingVsWorst = comparison.ranking.length > 1
            ? Math.max(0, comparison.ranking[comparison.ranking.length - 1].total - comparison.ranking[0].total)
            : 0;

        return `${title}\n\n${rankingLines}\n\n💰 Indo no ${bestMarket.marketName} você economiza ${this.formatCurrency(savingVsWorst)}${missingText}`;
    }

    private formatCurrency(value: number): string {
        return `R$ ${value.toFixed(2).replace('.', ',')}`;
    }

    /** Enfileira tabloide (vÃ¡rios produtos de encarte) para aprovaÃ§Ã£o do admin */
    private async enqueueTabloidToQueue(tabData: any): Promise<ChatResponse> {
        const marketName = String(tabData.marketName || '').trim();
        const items: any[] = Array.isArray(tabData.items) ? tabData.items : [];
        if (items.length === 0) {
            return { text: 'Recebi a imagem, mas nao consegui ler os produtos. Tente uma foto mais nitida do encarte.' };
        }
        try {
            const validItems = items.filter((i: any) => i.product && Number(i.price) > 0);
            if (validItems.length === 0) {
                return { text: 'Li a imagem, mas os produtos nao tinham preco legivel. Tente uma foto mais proxima.' };
            }

            // Enriquecimento semântico paralelo — resolve categoria e nome canônico
            const enriched = await Promise.all(
                validItems.map(async (i: any) => {
                    const rawName = String(i.product || '').trim();
                    const semantic = await productCatalogService.enrichProductSemantically(rawName);
                    return {
                        productName: rawName,
                        marketName: marketName || String(i.marketName || '').trim(),
                        price: Number(i.price),
                        unit: String(i.unit || 'un').trim(),
                        brand: String(i.brand || '').trim(),
                        ...semantic,          // category, normalizedName, catalogProductId, semanticScore
                        imageSource: 'tabloid' as const,
                        submittedBy: this.context.userId,
                        rawExtracted: i,
                    };
                }),
            );

            const toEnqueue = enriched;
            await offerQueueService.enqueue(toEnqueue);
            const summaryLines = toEnqueue.slice(0, 3)
                .map((o: any) => `â€¢ ${o.productName} â€” R$ ${o.price.toFixed(2).replace('.', ',')} ${o.unit}`);
            const extra = toEnqueue.length > 3 ? `\n_...e mais ${toEnqueue.length - 3} produto(s)_` : '';
            return {
                text: `📸 Recebi seu encarte/oferta! Identifiquei **${toEnqueue.length} produto(s)**` +
                    (marketName ? ` do ${marketName}` : '') + `:\n\n` +
                    summaryLines.join('\n') + extra +
                    `\n\nIsso ajuda a manter a base do Economiza Fácil atualizada para todo mundo.\nAntes de entrar nas comparações, passa por análise. ✅`
            };
        } catch (err) {
            console.error('[ChatService] Erro ao enfileirar tabloide:', err);
            return { text: 'Recebi a imagem, mas houve um erro ao processar. Tente novamente.' };
        }
    }

    /** Enfileira uma etiqueta de preço (produto único) para aprovação do admin */
    private async enqueuePriceTagToQueue(tagData: any): Promise<ChatResponse> {
        const marketName = String(tagData.marketName || '').trim();
        const productName = String(tagData.product || '').trim();
        const price = Number(tagData.price || 0);
        if (!productName || price <= 0) {
            return { text: 'Vi a etiqueta, mas nao consegui ler o produto ou preco. Tente uma foto mais proxima.' };
        }
        try {
            // Enriquecimento semântico — resolve categoria e nome canônico
            const semantic = await productCatalogService.enrichProductSemantically(productName);

            await offerQueueService.enqueue([{
                productName,
                marketName,
                price,
                unit: String(tagData.unit || 'un').trim(),
                brand: String(tagData.brand || '').trim(),
                ...semantic,          // category, normalizedName, catalogProductId, semanticScore
                imageSource: 'price_tag' as const,
                submittedBy: this.context.userId,
                rawExtracted: tagData,
            }]);
            const priceStr = price.toFixed(2).replace('.', ',');
            return {
                text: `🏷️ Recebi esse preço!\n\n` +
                    `• ${productName}${tagData.brand ? ` (${tagData.brand})` : ''}\n` +
                    `• R$ ${priceStr}${tagData.unit ? ` / ${tagData.unit}` : ''}\n` +
                    (marketName ? `• ${marketName}\n` : '') +
                    `\nIsso ajuda a atualizar a base colaborativa de ofertas.\nAntes de publicar, eu mando para análise. Valeu por ajudar a comunidade! 💚`
            };
        } catch (err) {
            console.error('[ChatService] Erro ao enfileirar price_tag:', err);
            return { text: 'Consegui ler a etiqueta, mas deu erro ao enviar. Tente novamente.' };
        }
    }

    private async refreshRichContext(force: boolean = false): Promise<void> {
        const now = Date.now();
        if (!force && now - this.lastContextRefreshAt < 30000) {
            return;
        }

        const richContext = await userContextService.buildRichContext(this.context.storageUserId, this.context.userName);
        this.context.richContextSummary = richContext.summary;
        this.context.predictedNeeds = richContext.predictedNeeds;
        this.lastContextRefreshAt = now;
    }

    private async handleShowUserProfile(): Promise<ChatResponse> {
        const [prefs, profile, richContext] = await Promise.all([
            userPreferencesService.getPreferences(this.context.userId),
            userProfileService.ensureUser(this.context.userId),
            userContextService.buildRichContext(this.context.storageUserId, this.context.userName),
        ]);

        const favoriteMarket = richContext.favoriteMarkets[0] || 'ainda aprendendo';
        const frequentProducts = richContext.frequentProducts.length > 0
            ? richContext.frequentProducts.slice(0, 5).map((item) => capitalize(item)).join(', ')
            : 'ainda aprendendo';
        const transport = prefs.transportMode || this.context.transportMode || 'carro';
        const consumption = prefs.consumption || this.context.consumption || 10;
        const neighborhood = prefs.neighborhood || 'nÃ£o informado';
        const preference = formatPreferenceLabel(prefs.optimizationPreference || this.context.optimizationPreference);
        const interactions = Number(profile.interactionCount || 0);
        const productLines = frequentProducts === 'ainda aprendendo'
            ? 'â€¢ ainda aprendendo'
            : `â€¢ ${frequentProducts.replace(/, /g, '\nâ€¢ ')}`;

        return {
            text:
                `👤 O que eu sei sobre você:\n\n` +
                `📍 Bairro: ${capitalize(neighborhood)}\n` +
                `🏪 Mercado favorito: ${favoriteMarket}\n` +
                `🚗 Transporte: ${capitalize(String(transport))} (${consumption} km/l)\n` +
                `💚 Preferência: ${preference}\n\n` +
                `🛒 Produtos mais comprados:\n${productLines}\n\n` +
                `💰 Gasto médio mensal: R$ ${richContext.averageMonthlySpend.toFixed(2).replace('.', ',')}\n` +
                `📦 Interações registradas: ${interactions}\n\n` +
                `Quer corrigir alguma informaÃ§Ã£o?`,
        };
    }

    private async shareListToPhone(targetPhone: string, listItems: ListItem[]): Promise<ChatResponse> {
        const shareText = this.listManager.getShareText(listItems);
        const digits = this.normalizeShareTargetPhone(targetPhone);
        const remoteJid = `${digits}@s.whatsapp.net`;
        const correlationId = `manual-share-${Date.now()}`;

        if (isServer) {
            await (db as any).collection('message_outbox').add({
                inboxId: correlationId,
                source: 'economizafacil-share-list',
                correlationId,
                sourceMessageId: null,
                userId: this.context.userId,
                remoteJid,
                text: shareText,
                sendStatus: 'pending_send',
                retryCount: 0,
                lastRetryAtIso: null,
                nextRetryAtIso: null,
                sentAtIso: null,
                createdAt: new Date(),
                createdAtIso: new Date().toISOString(),
            });
        } else {
            await addDoc(collection(db, 'message_outbox'), {
                inboxId: correlationId,
                source: 'economizafacil-share-list',
                correlationId,
                sourceMessageId: null,
                userId: this.context.userId,
                remoteJid,
                text: shareText,
                sendStatus: 'pending_send',
                retryCount: 0,
                lastRetryAtIso: null,
                nextRetryAtIso: null,
                sentAtIso: null,
                createdAt: serverTimestamp(),
                createdAtIso: new Date().toISOString(),
            });
        }

        return {
            text: `✅ Lista enviada pra ${targetPhone}!\n\nA outra pessoa recebeu sua lista com ${listItems.length} itens. Boas compras! 🛒`,
            shareContent: shareText,
        };
    }

    private extractDateFromMessage(msg: string): string | null {
        const MONTHS: Record<string, string> = {
            'janeiro': '01', 'jan': '01', 'fevereiro': '02', 'fev': '02',
            'marco': '03', 'marÃ§o': '03', 'mar': '03', 'abril': '04', 'abr': '04',
            'maio': '05', 'mai': '05', 'junho': '06', 'jun': '06',
            'julho': '07', 'jul': '07', 'agosto': '08', 'ago': '08',
            'setembro': '09', 'set': '09', 'outubro': '10', 'out': '10',
            'novembro': '11', 'nov': '11', 'dezembro': '12', 'dez': '12',
        };

        const low = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        for (const [name, num] of Object.entries(MONTHS)) {
            const re = new RegExp(name + '[\\s/]*(\\d{4})', 'i');
            const m = low.match(re);
            if (m) return `${m[1]}-${num}-15`;
        }

        const mmyyyy = low.match(/(\d{2})[\/\-](\d{4})/);
        if (mmyyyy) return `${mmyyyy[2]}-${mmyyyy[1]}-15`;

        const full = low.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
        if (full) return `${full[3]}-${full[2]}-${full[1]}`;

        const year = new Date().getFullYear();
        for (const [name, num] of Object.entries(MONTHS)) {
            if (low.includes(name)) return `${year}-${num}-15`;
        }

        return null;
    }

    private extractDaysFromMessage(msg: string): number {
        const low = msg.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        const daysMatch = low.match(/(\d+)\s*dias?/);
        if (daysMatch) return parseInt(daysMatch[1]);

        const monthsMatch = low.match(/(\d+)\s*mes(es)?/);
        if (monthsMatch) return parseInt(monthsMatch[1]) * 30;

        if (low.includes('semana passada') || low.includes('ultima semana')) return 7;
        if (low.includes('mes passado') || low.includes('ultimo mes')) return 30;
        if (low.includes('2 meses') || low.includes('dois meses')) return 60;
        if (low.includes('3 meses') || low.includes('tres meses')) return 90;
        if (low.includes('6 meses') || low.includes('seis meses')) return 180;
        if (low.includes('ano') || low.includes('12 meses')) return 365;

        return 30;
    }

    private async handlePendingPurchaseConfirmation(message: string): Promise<ChatResponse | null> {
        if (this.conversationState.current !== 'AWAITING_PURCHASE_CONFIRMATION') {
            return null;
        }

        const lowMsg = normalizeText(message);
        const confirmWords = ['ok', 'sim', 'confirmo', 'salva', 'pode salvar', 'yes', 'confirmar', 'isso'];
        const negativeWords = ['cancelar', 'nÃ£o', 'nao', 'cancela', 'errado', 'descarta'];

        const isConfirm = confirmWords.some((word) => lowMsg === normalizeText(word) || lowMsg.startsWith(`${normalizeText(word)} `));
        const isNegative = negativeWords.some((word) => lowMsg === normalizeText(word) || lowMsg.startsWith(`${normalizeText(word)} `));

        if (isConfirm && this.context.pendingPurchase) {
            console.log('[ChatService] Early Return: Bypassing NLP for Purchase Confirmation.');
            return this.confirmPendingPurchase();
        }

        if (isNegative && this.context.pendingPurchase) {
            this.clearPendingPurchaseContext();
            return { text: 'Fechado. Não salvei esse cupom no seu histórico. Como posso te ajudar agora?' };
        }

        return { text: 'Me responde com OK para salvar esse cupom no seu histórico ou CANCELAR para descartar.' };
    }

    private async handlePendingAction(
        pending: PendingResolution,
        message: string,
        interpretation: Awaited<ReturnType<typeof aiService.interpret>>,
    ): Promise<ChatResponse | null> {
        switch (pending.action) {
            case 'save_user_name':
                return this.handlePendingSaveUserName(message);
            case 'list_recovery':
                return this.handlePendingListRecovery(pending);
            case 'add_to_list':
                return this.handlePendingAddToList(pending);
            case 'add_batch_to_list':
                return this.handlePendingAddBatchToList(pending);
            case 'confirm_list':
                return pending.confirmed
                    ? this.handleCalcularTotalLista()
                    : { text: 'Beleza! Quer adicionar mais itens ou me fala o que precisa.' };
            case 'multi_choice':
                return this.handlePendingMultiChoice(pending);
            case 'confirm_expense':
                return this.handlePendingExpenseConfirmation(pending);
            case 'CRIANDO_LISTA':
                return this.handlePendingListBuilding(message, interpretation);
            default:
                return null;
        }
    }

    private async handlePendingSaveUserName(message: string): Promise<ChatResponse> {
        const userName = message.trim().split(' ')[0];
        this.context.userName = userName;
        await userPreferencesService.savePreferences(this.context.userId, { name: userName });
        await userProfileService.updateUserName(this.context.userId, userName);
        this.conversationState.transition('AWAITING_ONBOARDING_ANSWER', 'onboarding_answer', null, 'Sabe como funciona?');
        return { text: `Fala ${userName}! ðŸ‘‹ Bora economizar? Pode perguntar preÃ§o de qualquer produto de supermercado ou mandar a lista do mÃªs que te ajudo a economizar!\n\nSabe como funciona?` };
    }

    private async handlePendingListRecovery(pending: PendingResolution): Promise<ChatResponse> {
        const lowRecover = normalizeText(pending.originalMessage);
        const isNew = ['nova', 'criar', 'criar nova', 'nova lista', 'lista nova', 'nao', 'n', 'limpa', 'apaga', 'deleta']
            .some((word) => lowRecover === word || lowRecover.startsWith(`${word} `));

        if (isNew) {
            await this.listManager.deleteActiveList();
            this.context.shoppingList = [];
            const pendingProducts = pending.data?.products;
            if (pendingProducts && pendingProducts.length > 0) {
                this.context.shoppingList = pendingProducts.map((name: string) => ({ name }));
                await this.listManager.persistList(this.context.shoppingList);
                const createdList = await this.listManager.recoverActiveListItemsOnly();
                this.moveToListCreation('Diga os itens');
                return { text: `âœ… Lista nova criada! ðŸ›’\n\n${createdList.text}Quer adicionar mais itens ou **FINALIZAR**?` };
            }

            this.moveToListCreation('Me diga os produtos!');
            return { text: 'âœ… Lista anterior apagada! Me diga os produtos pra nova lista.' };
        }

        this.context.shoppingList = await this.listManager.loadActiveList();
        const pendingProducts = pending.data?.products;
        if (pendingProducts && pendingProducts.length > 0) {
            for (const product of pendingProducts) {
                if (!this.hasItemInShoppingList(product)) {
                    this.context.shoppingList.push({ name: product });
                }
            }
            await this.listManager.persistList(this.context.shoppingList);
        }

        const recoveredList = await this.listManager.recoverActiveListItemsOnly();
        this.moveToListCreation('Diga os itens');
        return { text: `ðŸ‘ Mantive sua lista! ðŸ›’\n\n${recoveredList.text}Quer adicionar mais itens ou **FINALIZAR**?` };
    }

    private async handlePendingAddToList(pending: PendingResolution): Promise<ChatResponse> {
        if (!pending.confirmed) {
            return { text: 'Beleza, nÃ£o anotei. O que mais precisa?' };
        }

        const productsToAdd = this.extractPendingProductsToAdd(pending);
        if (productsToAdd.length === 0) {
            this.moveToListCreation('Diga os itens');
            return { text: 'Beleza! Me diga quais itens vocÃª quer colocar na lista.' };
        }

        const { addedCount } = this.addProductsToShoppingList(productsToAdd);
        await this.listManager.persistList(this.context.shoppingList);
        this.moveToListCreation('Diga os itens');
        const addedText = addedCount > 1 ? '**variados**' : `**${productsToAdd[0]}**`;
        return { text: `âœ… ${addedCount > 1 ? 'Itens adicionados' : `${addedText} adicionado`} Ã  sua lista! ðŸ›’\n\nDiga mais um produto ou _"ver lista"_ para conferir.` };
    }

    private async handlePendingAddBatchToList(pending: PendingResolution): Promise<ChatResponse> {
        if (!pending.confirmed || !pending.data) {
            this.context.pendingAllProducts = undefined;
            return { text: 'Beleza, nÃ£o anotei. O que mais precisa?' };
        }

        const productsToAdd: string[] = this.context.pendingAllProducts || pending.data;
        this.addProductsToShoppingList(productsToAdd);
        this.context.pendingAllProducts = undefined;
        await this.listManager.persistList(this.context.shoppingList);
        this.moveToListCreation('Diga os itens');
        return { text: `âœ… **${productsToAdd.join(', ')}** adicionados Ã  sua lista! ðŸ›’\n\nDiga mais um produto ou _"ver lista"_ para conferir.` };
    }

    private async handlePendingMultiChoice(pending: PendingResolution): Promise<ChatResponse> {
        const savedProducts: string[] = pending.data || [];
        if (pending.confirmed) {
            console.log(`[ChatService] Multi-choice: PREÃ‡O para ${savedProducts.length} produtos`);
            const batchResult = await offerEngine.lookupBatch(savedProducts);
            this.context.pendingAllProducts = savedProducts;
            if (batchResult.products.length > 0) {
                this.conversationState.transition('AWAITING_ADD_TO_LIST', 'add_batch_to_list', batchResult.products, 'Quer anotar na lista?');
                return { text: `${batchResult.text}\n\n**Quer que eu anote na sua Lista de Compras? (Sim/NÃ£o)**` };
            }
            return { text: batchResult.text };
        }

        console.log(`[ChatService] Multi-choice: LISTA com ${savedProducts.length} produtos`);
        await this.listManager.archiveActiveList();
        this.context.shoppingList = savedProducts.map((name) => ({ name }));
        await this.listManager.persistList(this.context.shoppingList);
        const createdList = await this.listManager.recoverActiveListItemsOnly();
        this.conversationState.transition('AWAITING_LIST_CONFIRMATION', 'confirm_list', this.context.shoppingList, 'Finalizar lista?');
        return { text: `Lista com ${savedProducts.length} itens criada com sucesso! ðŸ›’\n\n${createdList.text}Finalizar lista?` };
    }

    private async handlePendingExpenseConfirmation(pending: PendingResolution): Promise<ChatResponse> {
        if (!pending.confirmed || !pending.data) {
            return { text: 'Gasto cancelado. O que mais precisa?' };
        }

        const { amount, marketName } = pending.data;
        await this.purchaseManager.saveConfirmedPurchase({
            marketName,
            total: amount,
            items: [],
            date: new Date().toISOString(),
        });
        const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
        return { text: `âœ… Gasto de **${formattedValue}** no **${marketName}** registrado com sucesso!` };
    }

    private async handlePendingListBuilding(
        message: string,
        interpretation: Awaited<ReturnType<typeof aiService.interpret>>,
    ): Promise<ChatResponse> {
        const normalizedMessage = normalizeText(message);
        if (COURTESY_WORDS.has(normalizedMessage)) {
            const updatedList = await this.listManager.recoverActiveListItemsOnly();
            return { text: `${updatedList.text}Pode me dizer mais um produto ou **FINALIZAR** para eu fechar sua lista.` };
        }

        const rawNewItems = interpretation.products || interpretation.nlpResult.entities.map((entity) => entity.value);
        const newItems = cleanProductList(rawNewItems);
        if (newItems.length > 0) {
            const { addedCount, duplicates } = this.addProductsToShoppingList(newItems);
            await this.listManager.persistList(this.context.shoppingList);
            const updatedList = await this.listManager.recoverActiveListItemsOnly();

            let response = '';
            if (addedCount > 0) response += 'Adicionei! ðŸ›’\n\n';
            if (duplicates.length > 0) response += `âš ï¸ **${duplicates.join(', ')}** jÃ¡ ${duplicates.length === 1 ? 'estÃ¡' : 'estÃ£o'} na lista.\n\n`;
            response += `${updatedList.text}Quer adicionar mais itens ou **FINALIZAR**?`;
            return { text: response };
        }

        const singleItem = message.trim();
        if (singleItem.length > 1 && singleItem.length < 50 && !GARBAGE_WORDS.has(normalizeText(singleItem))) {
            if (this.hasItemInShoppingList(singleItem)) {
                const updatedList = await this.listManager.recoverActiveListItemsOnly();
                return { text: `âš ï¸ **${singleItem}** jÃ¡ estÃ¡ na sua lista!\n\n${updatedList.text}Quer adicionar mais itens ou **FINALIZAR**?` };
            }
            this.context.shoppingList.push({ name: singleItem });
            await this.listManager.persistList(this.context.shoppingList);
            const updatedList = await this.listManager.recoverActiveListItemsOnly();
            return { text: `Adicionei **${singleItem}**! ðŸ›’\n\n${updatedList.text}Quer adicionar mais ou **FINALIZAR**?` };
        }

        return { text: 'NÃ£o entendi. Me diga o nome do produto ou **FINALIZAR** para fechar a lista.' };
    }

    private async handleReceiptSubmission(input: string): Promise<ChatResponse> {
        const pipelineResult = await ingestionPipeline.processUserSubmission(input);
        const receiptData = pipelineResult.success ? pipelineResult.data : null;

        if (!receiptData) {
            return { text: pipelineResult.error || 'Não consegui extrair os dados. Envie um link de nota fiscal, foto do cupom ou foto de oferta.' };
        }

        if (pipelineResult.source === 'community_price_tag') {
            return this.enqueuePriceTagToQueue(receiptData);
        }

        if (pipelineResult.source === 'community_tabloid') {
            return this.enqueueTabloidToQueue(receiptData);
        }

        return this.handlePersonalReceiptFlow(pipelineResult, receiptData);
    }

    private async handlePurchaseConfirmation(): Promise<ChatResponse> {
        if (!this.context.pendingPurchase) {
            return { text: 'NÃ£o tenho nenhuma compra pendente para confirmar agora.' };
        }

        return this.confirmPendingPurchase();
    }

    private handlePurchaseCancellation(): ChatResponse {
        if (!this.context.pendingPurchase) {
            return { text: 'NÃ£o tenho nenhuma compra pendente para cancelar.' };
        }

        this.clearPendingPurchaseContext();
        return { text: 'Fechado. Não salvei esse cupom no seu histórico.' };
    }

    private async handlePreferenceIntent(preference: 'economizar' | 'perto' | 'equilibrar' | null): Promise<ChatResponse> {
        if (!preference) {
            return { text: 'Me diga como você prefere que eu priorize as sugestões:\n• economizar\n• mercado mais perto\n• equilibrar os dois' };
        }

        this.context.optimizationPreference = preference;
        await userPreferencesService.savePreferences(this.context.userId, { optimizationPreference: preference });
        await this.refreshRichContext(true);

        const messages = {
            economizar: '✅ Anotado! Vou sempre te mostrar as opções mais baratas primeiro, mesmo que sejam um pouco mais longe.',
            perto: '✅ Anotado! Vou priorizar os mercados mais perto de você.',
            equilibrar: '✅ Anotado! Vou equilibrar preço e distância para te mostrar a melhor escolha.',
        };

        return { text: `${messages[preference]}\n\nPode mudar quando quiser! 😊` };
    }

    private async handleMarketOffersIntent(marketName?: string): Promise<ChatResponse> {
        if (!marketName) return { text: 'De qual mercado vocÃª quer ver as ofertas?' };
        const purchaseHistory = await this.purchaseAnalytics.getFrequentProducts(30);
        const marketVitrine = await offerEngine.getTopOffersByMarket(marketName, purchaseHistory);
        if (marketVitrine.startsWith('Poxa, nÃ£o encontrei')) {
            return { text: marketVitrine };
        }
        this.conversationState.transition('AWAITING_ADD_TO_LIST', 'add_to_list', 'variados', 'Quer que eu adicione as melhores ofertas?');
        return { text: `${marketVitrine}\n\nSe quiser, eu também posso colocar algum desses na sua lista. 🛒` };
    }

    private async handleCategoryOffersIntent(categoryName?: string): Promise<ChatResponse> {
        if (!categoryName) return { text: 'Qual departamento ou categoria vocÃª quer buscar? (ex: Carnes, Limpeza, Cervejas)' };
        const categoryVitrine = await offerEngine.getCategoryVitrine(categoryName);
        if (categoryVitrine.startsWith('Poxa') || categoryVitrine.startsWith('As ofertas')) {
            return { text: categoryVitrine };
        }
        this.conversationState.transition('AWAITING_ADD_TO_LIST', 'add_to_list', 'variados', 'Quer que eu adicione algum item?');
        return { text: `${categoryVitrine}\n\n**Gostou de algo? Quer que eu adicione Ã  sua lista de compras?** ðŸ›’\n(Diga 'Sim' e depois cite os nomes)` };
    }

    private async handlePriceHistoryIntent(product: string | undefined, message: string): Promise<ChatResponse> {
        if (!product) return { text: 'Qual produto vocÃª quer ver o histÃ³rico de preÃ§o?' };
        const targetDate = this.extractDateFromMessage(message);
        const historicalText = await offerEngine.getHistoricalPrices(product, targetDate || undefined);
        return { text: historicalText };
    }

    private async handleExpenseRegistrationIntent(amount?: number, marketName?: string): Promise<ChatResponse> {
        if (amount === undefined || !marketName || marketName === 'desconhecido') {
            return { text: "Para registrar um gasto financeiro, preciso do valor exato e do nome da loja. Exemplo: _'Gastei 150 reais no AtacadÃ£o'_." };
        }

        const payload = { amount, marketName };
        const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
        this.conversationState.transition('AWAITING_EXPENSE_CONFIRMATION', 'confirm_expense', payload, 'Confirmar gasto?');
        return { text: `ðŸ“ Entendi. VocÃª gastou **${formattedValue}** no mercado **${marketName.toUpperCase()}**?\n\n(Diga *Sim* para confirmar ou *NÃ£o* para cancelar)` };
    }

    private async handleExpenseAnalysisIntent(analyticsTerm: string | undefined, message: string): Promise<ChatResponse> {
        const days = this.extractDaysFromMessage(message);
        if (analyticsTerm) {
            const summary = await this.purchaseAnalytics.calculateCategoryAverage(analyticsTerm, days);
            return { text: this.purchaseAnalytics.formatCategoryAnalysis(summary, analyticsTerm, days) };
        }

        const top = await this.purchaseAnalytics.getTopSpending(days);
        return { text: this.purchaseAnalytics.formatTopSpending(top, days) };
    }

    private async handleShowListIntent(): Promise<ChatResponse> {
        const currentList = await this.listManager.recoverActiveListItemsOnly();
        if (currentList.items.length > 0) {
            this.conversationState.transition('AWAITING_LIST_CONFIRMATION', 'confirm_list', this.context.shoppingList, 'Finalizar lista?');
            return { text: `${currentList.text}Quer saber onde comprar mais barato?\nDigite: onde comprar minha lista` };
        }
        return { text: "Sua lista está vazia no momento. Diga algo como 'adiciona arroz, feijão e café' para começar." };
    }

    private async handleRecentHistoryIntent(days: number): Promise<ChatResponse> {
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const result = await this.purchaseAnalytics.getTotalSpentInPeriod(startDate, endDate);
        return { text: this.purchaseAnalytics.formatPeriodSummary(result, days) };
    }

    private async handleCreateListIntent(interpretation: Awaited<ReturnType<typeof aiService.interpret>>): Promise<ChatResponse> {
        const rawItems = interpretation.products || interpretation.nlpResult.entities.map((entity) => entity.value);
        const items = cleanProductList(rawItems);
        const existingList = await this.listManager.loadActiveList();

        if (existingList.length > 0) {
            console.log(`[ChatService] Lista ativa encontrada com ${existingList.length} itens. Perguntando ao usuÃ¡rio.`);
            this.conversationState.transition('AWAITING_LIST_RECOVERY', 'list_recovery', { products: items }, 'Manter ou criar nova?');
            const preview = existingList.slice(0, 5).map((item) => item.name).join(', ');
            const moreText = existingList.length > 5 ? ` e mais ${existingList.length - 5}` : '';
            return { text: `ðŸ“‹ VocÃª jÃ¡ tem uma lista com **${existingList.length} itens** (${preview}${moreText}).\n\nQuer **manter** essa lista e continuar adicionando ou **criar uma nova** do zero?` };
        }

        if (items.length === 0) {
            this.moveToListCreation('Me dÃª os produtos que eu crio uma lista pra vocÃª bem rÃ¡pida e econÃ´mica!');
            return { text: 'Me fala os produtos que eu monto sua lista rapidinho. 🛒' };
        }

        const entities = interpretation.nlpResult.entities;
        this.context.shoppingList = items.map((name, index) => ({
            name,
            quantity: entities[index]?.quantity,
            unit: entities[index]?.unit,
        }));
        await this.listManager.persistList(this.context.shoppingList);

        this.moveToListCreation('Diga os itens');
        return { text: `✅ Adicionado à sua lista:\n${items.map((item) => `• ${item}`).join('\n')}\n\nDigite minha lista pra ver tudo! 🛒` };
    }

    private async handleAddItemsIntent(interpretation: Awaited<ReturnType<typeof aiService.interpret>>): Promise<ChatResponse> {
        const entities = interpretation.nlpResult.entities;
        const rawItems = interpretation.products?.length
            ? interpretation.products
            : interpretation.product
                ? [interpretation.product]
                : entities.map((entity) => entity.value);
        const addItems = cleanProductList(rawItems);
        if (addItems.length === 0) return { text: 'Quais itens vocÃª quer adicionar?' };

        addItems.forEach((name, index) => {
            if (!this.context.shoppingList.find((item) => item.name === name)) {
                this.context.shoppingList.push({
                    name,
                    quantity: entities[index]?.quantity,
                    unit: entities[index]?.unit,
                });
            }
        });

        await this.listManager.persistList(this.context.shoppingList);
        return { text: `✅ Adicionado à sua lista:\n${addItems.map((item) => `• ${item}`).join('\n')}\n\nDigite minha lista pra ver tudo! 🛒` };
    }

    private async handleRemoveItemsIntent(interpretation: Awaited<ReturnType<typeof aiService.interpret>>): Promise<ChatResponse> {
        const removeItems = interpretation.products?.length
            ? interpretation.products
            : interpretation.product
                ? [interpretation.product]
                : interpretation.nlpResult.entities.map((entity) => entity.value);
        if (removeItems.length === 0) return { text: 'Quais itens vocÃª quer tirar da lista?' };

        this.context.shoppingList = this.context.shoppingList.filter((item) =>
            !removeItems.some((removeItem) => normalizeTextListEntry(item.name).includes(normalizeTextListEntry(removeItem))),
        );
        await this.listManager.persistList(this.context.shoppingList);
        const removedResult = await this.listManager.recoverActiveListItemsOnly();
        this.conversationState.transition('AWAITING_LIST_CONFIRMATION', 'confirm_list', this.context.shoppingList, 'Finalizar lista?');
        return { text: `✅ Removi da sua lista.\n\n${removedResult.text}Quer ajustar mais alguma coisa?` };
    }

    private async handleSinglePriceIntent(term?: string): Promise<ChatResponse> {
        if (!term) return { text: 'Quais produtos vocÃª quer saber o preÃ§o?' };
        this.context.lastProduct = term;
        const priceText = await offerEngine.lookupSingle(term, this.context.userLocation, this.context.transportMode, this.context.consumption);

        if (priceText.startsWith('NÃƒÂ£o encontrei ofertas') || priceText.startsWith('NÃ£o encontrei ofertas')) {
            return { text: `Poxa, ainda nÃ£o encontrei ofertas vigentes para **${term}** hoje.` };
        }

        this.conversationState.transition('AWAITING_ADD_TO_LIST', 'add_to_list', term, 'Quer que eu anote isso na sua Lista de Compras?');
        return { text: `${priceText}\n\nQuer que eu coloque isso na sua lista? 🛒` };
    }

    private moveToListCreation(prompt: string) {
        this.conversationState.transition('CRIANDO_LISTA', 'adicionar_item_lista', null, prompt);
    }

    private hasItemInShoppingList(name: string): boolean {
        return this.context.shoppingList.some((item) => normalizeTextListEntry(item.name) === normalizeTextListEntry(name));
    }

    private extractPendingProductsToAdd(pending: PendingResolution): string[] {
        const cleanedMessage = normalizeText(pending.originalMessage)
            .replace(/\b(sim|yes|ok|pode|quero|anota|bora|manda|por favor|claro|com certeza|isso)\b/g, '')
            .replace(/[,e]/g, ' ')
            .split(/\s+/)
            .filter(Boolean);

        if (cleanedMessage.length > 0) {
            return cleanedMessage;
        }

        if (pending.data && pending.data !== 'variados') {
            return [pending.data];
        }

        return [];
    }

    private addProductsToShoppingList(products: string[]): { addedCount: number; duplicates: string[] } {
        let addedCount = 0;
        const duplicates: string[] = [];

        for (const product of products) {
            if (this.hasItemInShoppingList(product)) {
                duplicates.push(product);
                continue;
            }
            this.context.shoppingList.push({ name: product });
            addedCount++;
        }

        return { addedCount, duplicates };
    }

    private clearPendingPurchaseContext() {
        this.context.pendingPurchase = undefined;
        this.context.pendingMatchResult = undefined;
        this.conversationState.reset();
    }

    private async handlePersonalReceiptFlow(pipelineResult: PipelineResult, receiptData: any): Promise<ChatResponse> {
        const activeList = await this.listManager.loadActiveList();
        const matchResult = matchReceiptToList(receiptData.items || [], activeList);

        if (shouldAutoSaveReceipt(pipelineResult, receiptData)) {
            this.context.pendingMatchResult = matchResult;
            this.context.pendingPurchase = receiptData;
            return this.confirmPendingPurchase();
        }

        this.context.pendingPurchase = receiptData;
        this.context.pendingMatchResult = matchResult;
        const conference = this.purchaseManager.formatReceiptConference(receiptData, matchResult);
        this.conversationState.transition('AWAITING_PURCHASE_CONFIRMATION', 'confirm_purchase', receiptData, 'OK para confirmar');
        return { text: conference.text };
    }

    private async confirmPendingPurchase(): Promise<ChatResponse> {
        const allItems = this.context.pendingMatchResult
            ? [...this.context.pendingMatchResult.matched, ...this.context.pendingMatchResult.impulse]
            : undefined;
        const response = await this.purchaseManager.saveConfirmedPurchase(this.context.pendingPurchase, allItems);

        if (this.context.pendingMatchResult && this.context.pendingMatchResult.matched.length > 0) {
            await this.listManager.finalizeListWithReceipt();
        }

        this.clearPendingPurchaseContext();
        return response;
    }

    private normalizeShareTargetPhone(targetPhone: string): string {
        return targetPhone.startsWith('55') ? targetPhone : `55${targetPhone}`;
    }
}

class ChatService {
    private readonly sessions = new Map<string, ChatSession>();

    private getSession(userId: string = 'default_user', storageUserId: string = userId): ChatSession {
        const normalizedUserId = userId || 'default_user';

        if (!this.sessions.has(normalizedUserId)) {
            this.sessions.set(normalizedUserId, new ChatSession(normalizedUserId, storageUserId || normalizedUserId));
        }

        return this.sessions.get(normalizedUserId)!;
    }

    public async processMessage(message: string, userId: string = 'default_user', storageUserId: string = userId): Promise<ChatResponse> {
        return this.getSession(userId, storageUserId).processMessage(message);
    }

    public async processImage(imageData: Uint8Array, userId: string = 'default_user', storageUserId: string = userId): Promise<ChatResponse> {
        return this.getSession(userId, storageUserId).processImage(imageData);
    }
}

export const chatService = new ChatService();
