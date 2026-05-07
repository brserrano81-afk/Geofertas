// VisionService - Extracao de dados de imagens via Gemini

import { GoogleGenerativeAI } from '@google/generative-ai';

function getGeminiKey(): string {
    return import.meta.env?.VITE_GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
}

const SYSTEM_PROMPT = `Você é um especialista em análise de imagens de supermercado para o Brasil.
Sua tarefa é extrair dados para inteligência de consumo (B2B) e histórico do usuário.

CLASSIFICAÇÃO ("type"):
- "receipt": Cupom fiscal/NFC-e.
- "price_tag": Etiqueta de gôndola.
- "tabloid": Encarte/folheto.

REGRAS GERAIS:
1. JSON puro, sem markdown.
2. "isReadable": false se a imagem estiver borrada, escura ou ilegível.
3. "confidence": 0 a 1.

ESTRUTURA DE ITENS (essencial para B2B):
- "productName": Nome do item.
- "brand": Marca identificada (ou "").
- "price": Valor total do item na nota.
- "unitPrice": Preço por unidade/kg.
- "quantity": Quantidade comprada.
- "unit": "kg", "un", "l", "peça", etc.
- "type": "peso" (kg/g) ou "unidade" (un/peça).

CAMPOS ESPECÍFICOS (CUPOM):
- "marketName": Nome do mercado.
- "cnpj": Apenas números.
- "total": Valor total da nota.
- "sefazKey": 44 dígitos se visível.

Exemplo Cupom:
{
  "type": "receipt",
  "isReadable": true,
  "confidence": 0.98,
  "marketName": "Assaí",
  "total": 150.50,
  "items": [
    { "productName": "Arroz Tio João", "brand": "Tio João", "price": 25.90, "unitPrice": 5.18, "quantity": 5, "unit": "kg", "type": "peso" }
  ]
}`;

class VisionService {
    async extractFromImage(imageData: Uint8Array, mimeType: string = 'image/jpeg'): Promise<any> {
        console.log(`[VisionService] Processing image: ${imageData.length} bytes via Gemini mimeType=${mimeType}`);

        const apiKey = getGeminiKey();
        if (!apiKey) {
            console.error('[VisionService] GOOGLE_GEMINI_API_KEY não configurada.');
            return null;
        }

        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

            const base64 = this.uint8ToBase64(imageData);
            const imagePart = {
                inlineData: {
                    data: base64,
                    mimeType,
                },
            };

            const result = await model.generateContent([
                SYSTEM_PROMPT,
                imagePart,
            ]);

            const responseText = result.response.text();
            const cleaned = responseText.replace(/```json\s*/g, '').replace(/```/g, '').trim();

            let parsed: any;
            try {
                parsed = JSON.parse(cleaned);
            } catch (parseError: any) {
                console.error('[VisionService] JSON parsing failed:', parseError.message);
                console.error('[VisionService] Response text:', responseText);
                console.error('[VisionService] Cleaned text:', cleaned);
                return null;
            }

            if (typeof parsed.confidence !== 'number') {
                parsed.confidence = 0.7;
            }

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
        if (typeof btoa === 'function') {
            let binary = '';
            for (let i = 0; i < uint8Array.length; i++) {
                binary += String.fromCharCode(uint8Array[i]);
            }
            return btoa(binary);
        }

        if (typeof Buffer !== 'undefined') {
            return Buffer.from(uint8Array).toString('base64');
        }

        throw new Error('Unable to encode image to base64.');
    }
}

export const visionService = new VisionService();
