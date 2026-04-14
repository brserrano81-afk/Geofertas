// ─────────────────────────────────────────────
// VisionService — Extração de dados de imagens via GPT-4o
// ─────────────────────────────────────────────

import { GoogleGenerativeAI } from '@google/generative-ai';

function getGeminiKey(): string {
    return import.meta.env?.VITE_GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
}

const SYSTEM_PROMPT = `Você é um especialista em visão computacional treinado para analisar imagens de supermercado.
Sua tarefa é identificar se a imagem é:
  (A) CUPOM FISCAL — nota impressa com lista de itens comprados
  (B) ETIQUETA DE PREÇO — placa de prateleira com um único produto e valor
  (C) TABLOIDE / ENCARTE — folheto ou foto com vários produtos e preços

REGRAS ABSOLUTAS:
1. Responda APENAS com um JSON válido, sem texto adicional, sem markdown.
2. Defina o campo "type" como "receipt", "price_tag" ou "tabloid".

─── CUPOM FISCAL ("type": "receipt") ───
- "marketName": Nome do mercado (ou "Desconhecido").
- "cnpj": Apenas os dígitos do CNPJ (14 chars, ou "").
- "sefazUrl": URL da SEFAZ/NFC-e se visível no QR Code (ou "").
- "sefazKey": Chave de Acesso com exatos 44 dígitos (ou "").
- "total": Valor total pago.
- "items": Array — TODOS OS ITENS: [{ "name": "Produto", "price": 10.50 }]

─── ETIQUETA DE PREÇO ("type": "price_tag") ───
- "marketName": Nome do mercado se visível (ou "").
- "product": Nome do produto.
- "brand": Marca (ou "").
- "price": Preço numérico.
- "unit": "kg", "litro", "un", "gl" etc. (ou "").

─── TABLOIDE / ENCARTE ("type": "tabloid") ───
Use este tipo quando a imagem contiver MÚLTIPLOS produtos com preços (panfleto, jornal de oferta, foto de vitrine, etc.).
- "marketName": Nome do mercado se visível no material (ou "").
- "items": Array com TODOS os produtos identificados:
  [{ "product": "Frango inteiro", "brand": "Sadia", "price": 12.90, "unit": "kg" }]
  Se a marca não estiver visível, use "".
  Se a unidade não estiver clara, use "un".

Exemplos de saída:

TABLOIDE:
{
  "type": "tabloid",
  "marketName": "Extrabom",
  "items": [
    { "product": "Arroz Branco", "brand": "Tio João", "price": 19.90, "unit": "5kg" },
    { "product": "Óleo de Soja", "brand": "Liza", "price": 8.49, "unit": "900ml" }
  ]
}

ETIQUETA:
{
  "type": "price_tag",
  "marketName": "Atacadão",
  "product": "Arroz Branco",
  "brand": "Tio João",
  "price": 25.90,
  "unit": "5kg"
}`;

class VisionService {
    async extractFromImage(imageData: Uint8Array): Promise<any> {
        console.log(`[VisionService] Processing image: ${imageData.length} bytes via Gemini`);

        const apiKey = getGeminiKey();
        if (!apiKey) {
            console.error("[VisionService] GOOGLE_GEMINI_API_KEY não configurada.");
            return null;
        }

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            const base64 = this.uint8ToBase64(imageData);
            
            const imagePart = {
                inlineData: {
                    data: base64,
                    mimeType: "image/jpeg"
                }
            };

            const result = await model.generateContent([
                SYSTEM_PROMPT,
                imagePart
            ]);

            const responseText = result.response.text();
            
            // Clean markdown markdown syntax
            const cleaned = responseText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
            const parsed = JSON.parse(cleaned);

            // Validação do CNPJ apenas para notas fiscais
            if (parsed.type === 'receipt' && parsed.cnpj) {
                const cnpjDigits = parsed.cnpj.replace(/\D/g, '');
                if (cnpjDigits.length !== 14) {
                    console.warn('[VisionService] CNPJ inválido, marcando mercado como Desconhecido');
                    parsed.marketName = 'Desconhecido';
                }
            }

            return parsed;
        } catch (err) {
            console.error('[VisionService] Error:', err);
            return null;
        }
    }

    private uint8ToBase64(uint8Array: Uint8Array): string {
        let binary = '';
        for (let i = 0; i < uint8Array.length; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        return btoa(binary);
    }
}

export const visionService = new VisionService();
