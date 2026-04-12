// ─────────────────────────────────────────────
// AiService — Interpretação via OpenAI GPT-4o-mini
// ─────────────────────────────────────────────

import { GoogleGenerativeAI } from '@google/generative-ai';

function getGeminiKey(): string {
    return import.meta.env?.VITE_GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
}

export type Intent =
    | 'saudacao' | 'ajuda' | 'desconhecido'
    | 'consultar_preco_produto' | 'consultar_preco_multiplos_produtos'
    | 'comparar_menor_preco' | 'comparar_menor_preco_multiplos_produtos'
    | 'criar_lista' | 'montar_lista' | 'adicionar_item_lista' | 'remover_item_lista'
    | 'mostrar_lista' | 'gerenciar_lista' | 'limpar_lista' | 'ver_ultima_lista'
    | 'calcular_total_lista' | 'melhor_mercado_para_lista' | 'compartilhar_lista'
    | 'extrair_cupom' | 'confirmar_registro' | 'cancelar_compra' | 'finalizar_compra'
    | 'compartilhar_localizacao' | 'find_nearby_markets'
    | 'definir_transporte' | 'definir_consumo'
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

const SYSTEM_PROMPT = `Você é o classificador de intenções do Economiza Fácil — uma IA de supermercado para Classe C e D no WhatsApp.

REGRAS ABSOLUTAS DE IDENTIDADE:
1. Linguagem DIRETA e sem frescura. Se perguntarem "quanto tá o pão?", classifique como busca de produto.
2. SEM FILTROS DE ELITE: qualquer produto é válido — alimentos, higiene, utilidades, camisinha, fralda, ração. Trate tudo com naturalidade.
3. Entenda GÍRIAS brasileiras: "tá quanto", "manda ver", "e aí", "bora", "show", "de boa", "pode crê".
4. ZERO FRICÇÃO: NUNCA peça CPF, login ou dado pessoal. Identificação é pelo número do celular.
5. Se a mensagem parece busca de qualquer produto, classifique como SEARCH_PRODUCT.
6. Se a mensagem é algo que você não entende, tente interpretar como busca de produto antes de dar UNKNOWN.

Responda APENAS com JSON válido, nunca texto fora do JSON. Formato:
{
  "intent": "SEARCH_PRODUCT|CREATE_LIST|ADD_TO_LIST|REMOVE_FROM_LIST|SHOW_LIST|CLEAR_LIST|SHARE_LIST|CALCULATE_LIST|EXTRACT_RECEIPT|CONFIRM_PURCHASE|CANCEL_PURCHASE|GREETING|HELP|SET_LOCATION|SET_TRANSPORT|SET_CONSUMPTION|SET_PREFERENCE|SHOW_PROFILE|MARKET_OFFERS|WEEKLY_OFFERS|CATEGORY_SEARCH|PRICE_HISTORY|REGISTER_EXPENSE|EXPENSE_ANALYSIS|VIEW_PURCHASE_HISTORY|VIEW_RECENT_EXPENSES|VIEW_LAST_PURCHASE|VIEW_CONSUMPTION_PATTERN|FIND_NEARBY_MARKETS|CANCEL_OR_EXIT|UNKNOWN",
  "entities": [{"value": "nome_do_produto", "quantity": 1, "unit": "kg"}],
  "isBatch": false,
  "confidence": 0.95
}

Regras de classificação:
- Link http/sefaz/nfce → EXTRACT_RECEIPT
- "lista com" ou itens com vírgula → CREATE_LIST
- Saudação simples, gírias (kole, koé, iae), ou pontuação isolada (., ?, !) → GREETING
- Busca de produto (qualquer item) → SEARCH_PRODUCT
- Múltiplos produtos → isBatch: true
- "mercados perto" / "mercado próximo" → FIND_NEARBY_MARKETS
- "ofertas do [mercado]" → MARKET_OFFERS
- "hortifrúti" / "carnes" / categoria → CATEGORY_SEARCH
- Gasto financeiro: extraia valor em "amount" e mercado em "value"
- Período: extraia dias em "days"
- Palavra isolada provável produto → SEARCH_PRODUCT (não UNKNOWN)`;

const NLP_TO_INTENT: Record<string, Intent> = {
    'SEARCH_PRODUCT': 'consultar_preco_produto',
    'CREATE_LIST': 'criar_lista',
    'ADD_TO_LIST': 'adicionar_item_lista',
    'REMOVE_FROM_LIST': 'remover_item_lista',
    'SHOW_LIST': 'mostrar_lista',
    'CLEAR_LIST': 'limpar_lista',
    'SHARE_LIST': 'compartilhar_lista',
    'CALCULATE_LIST': 'calcular_total_lista',
    'EXTRACT_RECEIPT': 'extrair_cupom',
    'CONFIRM_PURCHASE': 'confirmar_registro',
    'CANCEL_PURCHASE': 'cancelar_compra',
    'GREETING': 'saudacao',
    'HELP': 'ajuda',
    'SET_LOCATION': 'compartilhar_localizacao',
    'SET_TRANSPORT': 'definir_transporte',
    'SET_CONSUMPTION': 'definir_consumo',
    'SET_PREFERENCE': 'definir_preferencia_usuario',
    'SHOW_PROFILE': 'ver_perfil_usuario',
    'MARKET_OFFERS': 'ofertas_mercado',
    'WEEKLY_OFFERS': 'ofertas_da_semana',
    'CATEGORY_SEARCH': 'buscar_categoria',
    'PRICE_HISTORY': 'consultar_historico_global',
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
            '.', '?', '!', 'oii', 'hello', 'menu', 'inicio', 'início',
        ]);

        if (directGreetings.has(normalized)) {
            return this.buildResult('saudacao', {
                intent: 'GREETING',
                entities: [],
                confidence: 0.99,
            });
        }

        // Atalho para links (sem precisar chamar a LLM)
        if (message.match(/https?:\/\//i) || message.match(/sefaz/i) || message.match(/nfce/i)) {
            return this.buildResult('extrair_cupom', { intent: 'EXTRACT_RECEIPT', entities: [{ value: message }], confidence: 1.0 });
        }

        try {
            const apiKey = getGeminiKey();
            if (!apiKey) {
                console.warn("[AiService] GOOGLE_GEMINI_API_KEY ausente. Usando fallback.");
                return this.buildResult('desconhecido', { intent: 'UNKNOWN', entities: [{ value: 'API_ERROR' }], confidence: 0 });
            }

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            const contextPrompt = context?.richContextSummary
                ? `\nCONTEXTO DO USUARIO:\n${context.richContextSummary}\n`
                : '';

            const result = await model.generateContent([
                `${SYSTEM_PROMPT}${contextPrompt}`,
                message
            ]);

            const responseText = result.response.text();

            // Parse o JSON retornado (removendo possíveis backticks markdown)
            const cleaned = responseText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned) as NlpResult & { isBatch?: boolean };

            const nlpResult: NlpResult = {
                intent: parsed.intent || 'UNKNOWN',
                entities: parsed.entities || [],
                confidence: parsed.confidence || 0.5,
            };

            const intent = NLP_TO_INTENT[nlpResult.intent] || 'desconhecido';
            const isBatch = parsed.isBatch || false;

            // Converter para multi-produto se batch
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
            .map(e => e.value)
            .filter(v => v && v !== 'API_ERROR');

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
        history: { role: 'user' | 'assistant', content: string }[],
        userMessage: string,
        userContextSummary?: string,
    ): Promise<string> {
        const apiKey = getGeminiKey();
        if (!apiKey) {
            console.warn("[AiService] GOOGLE_GEMINI_API_KEY ausente. Usando fallback de texto simples.");
            return systemContext; 
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

        const AI_PROMPT = `Você é o "Economiza Fácil", um assistente virtual focado em entregar a melhor economia para os usuários (foco em supermercados, Classe C e D no Brasil).
Sua personalidade: Educada, prestativa, clara e fluida. Você conduz uma conversa natural, como um excelente atendente humano.
COMPREENSÃO: Você entende perfeitamente todas as gírias brasileiras e formas informais de falar, MAS VOCÊ NÃO FALA GÍRIAS. Responda sempre em bom português, de maneira amigável mas respeitosa e profissional.
OBJETIVO: Ajudar o usuário a economizar tempo e dinheiro, encontrar os supermercados mais baratos, organizar listas de compras e analisar cupons.
ESTILO DE RESPOSTA: Seja direto sem ser robótico. Mantenha as mensagens enxutas e escaneáveis (perfeitas para a tela de um celular no WhatsApp). Formate listas e preços de forma legível (usando marcadores e destaques em negrito onde apropriado). Evite introduções longas, elogios desnecessários e frases genéricas.
DADOS E LISTAS: NUNCA resuma as listas de produtos ou resultados fornecidos pelo sistema. Se o sistema te mandar um texto com 5 marcas e 5 preços, mostre todos eles na sua resposta. NUNCA altere os valores numéricos. NUNCA remova a formatação original que o sistema já usou (ex: asteriscos \`**\` ou emojis nas listas).`;

        try {
            const formattedHistory = history.map(msg => ({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            }));

            const chat = model.startChat({
                history: [
                    { role: 'user', parts: [{ text: AI_PROMPT }] },
                    { role: 'model', parts: [{ text: "Compreendido. Estou pronto para ajudar os usuários a economizarem o máximo possível, respondendo de forma educada, fluida e natural, sempre respeitando os dados fornecidos pelo sistema." }] },
                    ...formattedHistory
                ],
            });

            const promptContext = `[CONTEXTO RICO DO USUARIO]:\n${userContextSummary || 'sem contexto adicional'}\n\n[MENSAGEM ORIGINAL GERADA PELO SISTEMA (Use como os dados base para a sua resposta)]: \n\n${systemContext}\n\n====================\n\n[NOVA MENSAGEM DO USUÁRIO]: \n${userMessage}\n\nBaseado na Mensagem Original do Sistema, aja como o Economiza Fácil.\nREGRA DE OURO: Se precisar humanizar, use no máximo 1 frase curta antes OU depois da mensagem do sistema. Priorize resposta objetiva. MANTENHA O TEXTO ORIGINAL DAS OFERTAS/PRODUTOS INTACTO exatamente como fornecido. NÃO TRUNQUE, NÃO RESUMA E NÃO OMITA AS LISTAS DO SISTEMA.`;

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
            console.warn("[AiService] GOOGLE_GEMINI_API_KEY ausente. Não é possível transcrever áudio.");
            return null;
        }

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            // Convert Uint8Array to base64
            let binary = '';
            for (let i = 0; i < audioData.length; i++) {
                binary += String.fromCharCode(audioData[i]);
            }
            const base64 = btoa(binary);

            const audioPart = {
                inlineData: {
                    data: base64,
                    mimeType: mimeType
                }
            };

            const prompt = "Transcreva exatamente o que é dito neste áudio. Se for uma lista de compras ou o nome de um produto, escreva claramente. Não adicione comentários descritivos, apenas o que foi dito.";

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
