// ─────────────────────────────────────────────
// VisionService — Extração de dados de imagens via GPT-4o
// ─────────────────────────────────────────────

import { GoogleGenerativeAI } from '@google/generative-ai';

function getGeminiKey(): string {
    return import.meta.env?.VITE_GOOGLE_GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY || '';
}

const SYSTEM_PROMPT = `Você é um especialista em visão computacional treinado para analisar imagens de supermercado.
Sua tarefa é identificar se a imagem é um CUPOM FISCAL (nota impressa com lista de itens) ou uma ETIQUETA DE PREÇO (placa na prateleira com produto e valor).

REGRAS ABSOLUTAS:
1. Responda APENAS com um JSON válido.
2. Defina o campo "type" como "receipt" ou "price_tag".

CUPOM FISCAL ("type": "receipt"):
- Extraia nome do mercado (ou "Desconhecido").
- Tente encontrar CNPJ (apenas os números, ou "").
- "sefazUrl": Procure na imagem por uma URL de consulta da nota (ex: link do QR Code da SEFAZ). Se encontrar, coloque a URL completa aqui (ou "").
- "sefazKey": Procure pela "Chave de Acesso" (são exatos 44 números, as vezes separados por espaços). Se existir, agrupe e retorne apenas os 44 números (ou "").
- "total": Valor total pago.
- "items": Array com TODOS OS ITENS: { "name": "Produto", "price": 10.50 }

ETIQUETA DE PREÇO ("type": "price_tag"):
- "marketName": Nome do mercado se visível.
- "product": Nome do produto na placa principal.
- "brand": Marca do produto (ou "").
- "price": Preço visível.
- "unit": kg, litro, gl, un, etc. (ou "")

Formato de Saída (Exemplo Etiqueta):
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
