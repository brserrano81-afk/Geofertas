// AiService - Interpretacao via Gemini

import { GoogleGenerativeAI } from '@google/generative-ai';

const GEMINI_MODEL = 'gemini-2.5-flash';

function getGeminiKey(): string {
    const key = import.meta.env?.VITE_GOOGLE_GEMINI_API_KEY || 
                process.env.GOOGLE_GEMINI_API_KEY || 
                process.env.GEMINI_API_KEY || 
                '';
    
    if (key) {
        console.log(`[AiService] Chave encontrada: ${key.substring(0, 8)}...`);
    } else {
        console.warn('[AiService] Nenhuma chave Gemini encontrada no ambiente.');
    }
    
    return key;
}

export type Intent =
    | 'saudacao' | 'ajuda' | 'desconhecido'
    | 'consultar_preco_produto' | 'consultar_preco_multiplos_produtos'
    | 'comparar_menor_preco' | 'comparar_menor_preco_multiplos_produtos'
    | 'criar_lista' | 'montar_lista' | 'adicionar_item_lista' | 'remover_item_lista'
    | 'mostrar_lista' | 'gerenciar_lista' | 'limpar_lista' | 'ver_ultima_lista'
    | 'calcular_total_lista' | 'melhor_mercado_para_lista' | 'compartilhar_lista'
    | 'processar_comprovante_compra' | 'confirmar_registro' | 'cancelar_compra' | 'finalizar_compra'
    | 'compartilhar_localizacao' | 'find_nearby_markets'
    | 'definir_transporte' | 'definir_consumo' | 'definir_combustivel'
    | 'definir_preferencia_usuario' | 'ver_perfil_usuario'
    | 'ofertas_mercado' | 'get_market_offers'
    | 'ofertas_da_semana' | 'buscar_categoria'
    | 'consultar_historico_global'
    | 'registrar_gasto' | 'analise_gastos_pessoal'
    | 'ver_historico_compras' | 'ver_gastos_recentes'
    | 'ver_ultima_compra' | 'ver_padrao_consumo';

export interface NlpResult {
    intent: string;
    entities: Array<{
        value: string;
        quantity?: number;
        unit?: string;
        amount?: number;
        days?: number;
        targetPhone?: string;
    }>;
    confidence: number;
}

export interface Interpretation {
    intent: Intent;
    product?: string;
    products?: string[];
    isBatch: boolean;
    confidence: number;
    nlpResult: NlpResult;
}

const SYSTEM_PROMPT = `Classificador NLP do Economiza Facil.
REGRAS:
1. Responda APENAS JSON: {"intent": "...", "entities": [{"value": "...", "quantity": 1, "unit": "...", "targetPhone": "...", "amount": 0, "days": 0}], "isBatch": false, "confidence": 0.95}
2. INTENTS: SEARCH_PRODUCT, CREATE_LIST, ADD_TO_LIST, REMOVE_FROM_LIST, SHOW_LIST, CLEAR_LIST, SHARE_LIST, CALCULATE_LIST, EXTRACT_RECEIPT, CONFIRM_PURCHASE, CANCEL_PURCHASE, GREETING, HELP, SET_LOCATION, SET_TRANSPORT, SET_CONSUMPTION, SET_FUEL_PRICE, SET_PREFERENCE, SHOW_PROFILE, MARKET_OFFERS, WEEKLY_OFFERS, CATEGORY_SEARCH, PRICE_HISTORY, SAZONALIDADE, REGISTER_EXPENSE, EXPENSE_ANALYSIS, VIEW_PURCHASE_HISTORY, VIEW_RECENT_EXPENSES, VIEW_LAST_PURCHASE, VIEW_CONSUMPTION_PATTERN, FIND_NEARBY_MARKETS, CANCEL_OR_EXIT, UNKNOWN
3. EXEMPLOS:
- "quando o frango fica mais barato" -> SAZONALIDADE
- "melhor epoca pra comprar arroz" -> SAZONALIDADE
- "qual mercado e mais barato?" -> FIND_NEARBY_MARKETS
- "qual mercado ta mais barato perto de mim" -> FIND_NEARBY_MARKETS
- "onde comprar minha lista" -> CALCULATE_LIST
- "quanto fica minha lista" -> CALCULATE_LIST
- "compartilha minha lista com 27999887766" -> SHARE_LIST (targetPhone: "27999887766")
- "vale ir de carro no atacadao?" -> SET_TRANSPORT (entities.value: "atacadao")
4. Entenda girias: "kto ta", "add", "tira".
5. SHARE/CLEAR/SHOW_LIST: entities deve ser vazio (exceto phone em SHARE).`;

const NLP_TO_INTENT: Record<string, Intent> = {
    'SEARCH_PRODUCT': 'consultar_preco_produto',
    'CREATE_LIST': 'criar_lista',
    'ADD_TO_LIST': 'adicionar_item_lista',
    'REMOVE_FROM_LIST': 'remover_item_lista',
    'SHOW_LIST': 'mostrar_lista',
    'CLEAR_LIST': 'limpar_lista',
    'SHARE_LIST': 'compartilhar_lista',
    'CALCULATE_LIST': 'calcular_total_lista',
    'EXTRACT_RECEIPT': 'processar_comprovante_compra',
    'CONFIRM_PURCHASE': 'confirmar_registro',
    'CANCEL_PURCHASE': 'cancelar_compra',
    'GREETING': 'saudacao',
    'HELP': 'ajuda',
    'SET_LOCATION': 'compartilhar_localizacao',
    'SET_TRANSPORT': 'definir_transporte',
    'SET_CONSUMPTION': 'definir_consumo',
    'SET_FUEL_PRICE': 'definir_combustivel',
    'SET_PREFERENCE': 'definir_preferencia_usuario',
    'SHOW_PROFILE': 'ver_perfil_usuario',
    'MARKET_OFFERS': 'ofertas_mercado',
    'WEEKLY_OFFERS': 'ofertas_da_semana',
    'CATEGORY_SEARCH': 'buscar_categoria',
    'PRICE_HISTORY': 'consultar_historico_global',
    'SAZONALIDADE': 'consultar_historico_global',
    'REGISTER_EXPENSE': 'registrar_gasto',
    'EXPENSE_ANALYSIS': 'analise_gastos_pessoal',
    'VIEW_PURCHASE_HISTORY': 'ver_historico_compras',
    'VIEW_RECENT_EXPENSES': 'ver_gastos_recentes',
    'VIEW_LAST_PURCHASE': 'ver_ultima_compra',
    'VIEW_CONSUMPTION_PATTERN': 'ver_padrao_consumo',
    'FIND_NEARBY_MARKETS': 'find_nearby_markets',
    'CANCEL_OR_EXIT': 'desconhecido',
    'UNKNOWN': 'desconhecido',
};

class AiService {
    async interpret(message: string, context?: any): Promise<Interpretation> {
        console.log(`[AiService] Interpreting: "${message}"`);
        const normalized = message.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

        const directGreetings = new Set([
            'oi', 'ola', 'olá', 'opa', 'e ai', 'e aí', 'iae', 'bom dia', 'boa tarde', 'boa noite',
            '.', '?', '!', 'oii', 'hello', 'menu', 'inicio', 'início', 'olaa', 'salve',
        ]);

        if (directGreetings.has(normalized)) {
            return this.buildResult('saudacao', {
                intent: 'GREETING',
                entities: [],
                confidence: 0.99,
            });
        }

        if (message.match(/https?:\/\//i) || message.match(/sefaz/i) || message.match(/nfce/i)) {
            return this.buildResult('processar_comprovante_compra', { intent: 'EXTRACT_RECEIPT', entities: [{ value: message }], confidence: 1.0 });
        }

        try {
            const apiKey = getGeminiKey();
            if (!apiKey) {
                console.warn('[AiService] GOOGLE_GEMINI_API_KEY ausente. Usando fallback.');
                return this.buildResult('desconhecido', { intent: 'UNKNOWN', entities: [{ value: 'API_ERROR' }], confidence: 0 });
            }

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ 
                model: GEMINI_MODEL,
                generationConfig: { temperature: 0.1 }
            });

            const contextPrompt = context?.richContextSummary
                ? `\nCONTEXTO DO USUARIO:\n${context.richContextSummary}\n`
                : '';

            const result = await model.generateContent([
                `${SYSTEM_PROMPT}${contextPrompt}`,
                message,
            ]);

            const responseText = result.response.text();
            
            // Extração robusta do JSON: mesmo que o Gemini fale "Aqui está: ```json { ... } ```"
            let cleaned = responseText;
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                cleaned = jsonMatch[0];
            } else {
                cleaned = responseText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
            }

            let parsed: NlpResult & { isBatch?: boolean };
            try {
                parsed = JSON.parse(cleaned) as NlpResult & { isBatch?: boolean };
            } catch (e) {
                console.error('[AiService] Failed to parse JSON. Raw response:', responseText);
                console.error('[AiService] Cleaned string attempted to parse:', cleaned);
                throw e; // Pass to the outer catch block
            }

            const nlpResult: NlpResult = {
                intent: parsed.intent || 'UNKNOWN',
                entities: parsed.entities || [],
                confidence: parsed.confidence || 0.5,
            };

            const intent = NLP_TO_INTENT[nlpResult.intent] || 'desconhecido';
            const isBatch = parsed.isBatch || false;

            let finalIntent = intent;
            if (isBatch && intent === 'consultar_preco_produto') {
                finalIntent = 'consultar_preco_multiplos_produtos';
            }

            return this.buildResult(finalIntent, nlpResult, isBatch);
        } catch (err) {
            console.error('[AiService] Parsing Error:', err);
            return this.buildResult('desconhecido', { intent: 'UNKNOWN', entities: [{ value: 'API_ERROR' }], confidence: 0 });
        }
    }

    private buildResult(intent: Intent, nlpResult: NlpResult, isBatch: boolean = false): Interpretation {
        const products = nlpResult.entities
            .map((entity) => entity.value)
            .filter((value) => value && value !== 'API_ERROR');

        return {
            intent,
            product: products[0],
            products: products.length > 1 ? products : undefined,
            isBatch,
            confidence: nlpResult.confidence,
            nlpResult,
        };
    }

    async generateConversationalResponse(
        systemContext: string,
        history: { role: 'user' | 'assistant'; content: string }[],
        userMessage: string,
        userContextSummary?: string,
    ): Promise<string> {
        const apiKey = getGeminiKey();
        if (!apiKey) {
            console.warn('[AiService] GOOGLE_GEMINI_API_KEY ausente. Usando fallback de texto simples.');
            return systemContext;
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        const AI_PROMPT = `Você é o "Economiza Fácil", um assistente virtual focado em entregar economia real no WhatsApp.
Sua personalidade: clara, útil, comercial e natural.
Você entende gírias e erros de digitação, mas responde em bom português.
Mantenha as mensagens curtas, escaneáveis e próprias para WhatsApp.
Nunca altere números do sistema e nunca misture histórico pessoal de compra com colaboração para a base de ofertas.`;

        try {
            const formattedHistory = history.map((msg) => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }],
            }));

            const chat = model.startChat({
                history: [
                    { role: 'user', parts: [{ text: AI_PROMPT }] },
                    { role: 'model', parts: [{ text: 'Compreendido. Vou responder de forma natural, útil e fiel aos dados do sistema.' }] },
                    ...formattedHistory,
                ],
            });

            const promptContext = `[CONTEXTO RICO DO USUARIO]:\n${userContextSummary || 'sem contexto adicional'}\n\n[MENSAGEM ORIGINAL GERADA PELO SISTEMA]:\n${systemContext}\n\n[NOVA MENSAGEM DO USUARIO]:\n${userMessage}\n\nHumanize com leveza, mas preserve os dados e a estrutura útil da resposta.`;

            const result = await chat.sendMessage(promptContext);
            return result.response.text();
        } catch (err) {
            console.error('[AiService] Erro no Gemini Conversacional:', err);
            return systemContext;
        }
    }

    async transcribeAudio(audioData: Uint8Array, mimeType: string): Promise<string | null> {
        const apiKey = getGeminiKey();
        if (!apiKey) {
            console.warn('[AiService] GOOGLE_GEMINI_API_KEY ausente. Não é possível transcrever áudio.');
            return null;
        }

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

            let binary = '';
            for (let i = 0; i < audioData.length; i++) {
                binary += String.fromCharCode(audioData[i]);
            }
            const base64 = btoa(binary);

            const audioPart = {
                inlineData: {
                    data: base64,
                    mimeType,
                },
            };

            const prompt = 'Transcreva exatamente o que é dito neste áudio. Se for lista de compras ou produto, escreva claramente. Não adicione comentários.';

            const result = await model.generateContent([prompt, audioPart]);
            const text = result.response.text();

            return text.trim();
        } catch (err) {
            console.error('[AiService] Erro ao transcrever áudio no Gemini:', err);
            return null;
        }
    }
}

export const aiService = new AiService();
