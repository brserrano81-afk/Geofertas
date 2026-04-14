// ─────────────────────────────────────────────
// IngestionPipeline — Chain of Responsibility para entrada do usuário
// Detecta tipo de input: Link SEFAZ, Imagem, QR Code
// ─────────────────────────────────────────────

import { visionService } from './VisionService';

interface PipelineResult {
    success: boolean;
    data?: any;
    error?: string;
    source?: 'sefaz' | 'vision' | 'qr' | 'price_tag' | 'tabloid';
}

function readRuntimeEnv(name: string): string {
    try {
        const viteValue = import.meta.env?.[name as keyof ImportMetaEnv];
        if (typeof viteValue === 'string' && viteValue.trim()) {
            return viteValue.trim();
        }
    } catch {
        // ignore import.meta access outside Vite/browser
    }

    if (typeof process !== 'undefined') {
        const processValue = process.env?.[name];
        if (typeof processValue === 'string' && processValue.trim()) {
            return processValue.trim();
        }
    }

    return '';
}

function resolveApiBaseUrl(): string {
    const configuredBaseUrl = readRuntimeEnv('VITE_API_BASE_URL') || readRuntimeEnv('API_BASE_URL');
    if (configuredBaseUrl) {
        return configuredBaseUrl.replace(/\/$/, '');
    }

    if (typeof window !== 'undefined' && window.location?.origin) {
        return window.location.origin.replace(/\/$/, '');
    }

    throw new Error('API_BASE_URL not configured for SEFAZ proxy access.');
}

class IngestionPipeline {
    async processUserSubmission(input: string | Uint8Array): Promise<PipelineResult> {
        // Se for binário (imagem)
        if (input instanceof Uint8Array) {
            return this.processImage(input);
        }

        // Se for string (link ou QR)  
        const text = input as string;

        // Detectar link SEFAZ (mesmo sem http://)
        if (text.match(/(https?:\/\/)?.*(sefaz|nfce|fazenda)/i)) {
            let urlStr = text;
            if (!urlStr.startsWith('http')) {
                urlStr = 'http://' + urlStr;
            }
            return this.processSefazLink(urlStr);
        }

        // Detectar QR code URL genérica
        if (text.match(/https?:\/\//)) {
            return this.processSefazLink(text);
        }

        return { success: false, error: 'Não reconheci o formato. Envie um link de nota fiscal, QR Code ou foto do cupom.' };
    }

    private async processImage(imageData: Uint8Array): Promise<PipelineResult> {
        console.log(`[IngestionPipeline] Processing image: ${imageData.length} bytes`);
        try {
            const result = await visionService.extractFromImage(imageData);
            
            // 1. Tentativa via Chave de 44 dígitos
            if (result && result.sefazKey) {
                const cleanKey = result.sefazKey.replace(/\D/g, '');
                if (cleanKey.length === 44) {
                    const generatedUrl = `http://app.sefaz.es.gov.br/ConsultaNFCe/qrcode.aspx?p=${cleanKey}|2|1|1|`;
                    console.log(`[IngestionPipeline] Chave encontrada: ${cleanKey}. Tentando scrap no proxy...`);
                    const proxyResult = await this.processSefazLink(generatedUrl);
                    if (proxyResult.success) return proxyResult;
                    console.log(`[IngestionPipeline] Proxy falhou (Captcha Web?). Usando OCR/Vision fallback.`);
                }
            }

            // 2. Tentativa via OCR da URL
            if (result && result.sefazUrl) {
                let urlStr = result.sefazUrl;
                if (!urlStr.startsWith('http')) {
                    urlStr = 'http://' + urlStr;
                }
                console.log(`[IngestionPipeline] URL encontrada: ${urlStr}. Tentando scrap no proxy...`);
                const proxyResult = await this.processSefazLink(urlStr);
                if (proxyResult.success) return proxyResult;
                console.log(`[IngestionPipeline] Proxy falhou (Captcha Web?). Usando OCR/Vision fallback.`);
            }

            // 3. Verifica Price Tag avulsa (produto �nico)
            if (result && result.type === 'price_tag') {
                return { success: true, data: result, source: 'price_tag' };
            }

            // 4. Tabloide / Encarte � m�ltiplos produtos, vai para fila de revis�o
            if (result && result.type === 'tabloid' && Array.isArray(result.items) && result.items.length > 0) {
                console.log('[IngestionPipeline] Tabloide: ' + result.items.length + ' produto(s). Roteando para fila.');
                return { success: true, data: result, source: 'tabloid' };
            }
            
            // 4. Fallback de Ouro: Usa os próprios itens que a IA Gemini já extraiu da imagem!
            // Isso resolve o problema de telas com Captcha ou bloqueios da SEFAZ.
            if (result && (result.items?.length > 0 || result.total > 0)) {
                console.log(`[IngestionPipeline] Sucesso usando os dados lidos magicamente pela IA (Vision) na imagem!`);
                return { success: true, data: result, source: 'vision' };
            }
            
            return { success: false, error: 'Não consegui extrair dados da imagem. Tente uma foto mais nítida da prateleira ou do cupom.' };
        } catch (err) {
            return { success: false, error: 'Erro ao processar a imagem.' };
        }
    }

    private async processSefazLink(url: string): Promise<PipelineResult> {
        console.log(`[IngestionPipeline] Processing SEFAZ link: ${url}`);
        try {
            const proxyUrl = `${resolveApiBaseUrl()}/proxy?url=${encodeURIComponent(url)}`;
            const response = await fetch(proxyUrl);

            if (!response.ok) {
                console.error(`[IngestionPipeline] Proxy returned ${response.status}`);
                return { success: false, error: `O servidor da SEFAZ retornou erro (${response.status}). Tente novamente.` };
            }

            const data = await response.json();

            if (data && data.items && data.items.length > 0) {
                return {
                    success: true,
                    data: {
                        marketName: data.supermarket || 'Desconhecido',
                        cnpj: data.cnpj || '',
                        total: data.totalValue || 0,
                        items: data.items.map((i: any) => ({
                            name: i.name,
                            price: i.totalPrice || i.unitPrice || 0,
                            quantity: i.quantity || 1,
                        })),
                    },
                    source: 'sefaz',
                };
            }

            return { success: false, error: 'Link processado mas sem itens encontrados.' };
        } catch (err: any) {
            console.error('[IngestionPipeline] SEFAZ error:', err);
            return { success: false, error: `Erro ao acessar o link: ${err.message}` };
        }
    }
}

export const ingestionPipeline = new IngestionPipeline();
