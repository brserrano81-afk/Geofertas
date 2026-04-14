// IngestionPipeline - Chain of Responsibility para entrada do usuario
// Detecta tipo de input: link SEFAZ, imagem, QR code

import { visionService } from './VisionService';

export interface PipelineResult {
    success: boolean;
    data?: any;
    error?: string;
    source?: 'receipt_sefaz' | 'receipt_vision' | 'community_price_tag' | 'community_tabloid';
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
        if (input instanceof Uint8Array) {
            return this.processImage(input);
        }

        const text = input as string;

        if (text.match(/(https?:\/\/)?.*(sefaz|nfce|fazenda)/i)) {
            let urlStr = text;
            if (!urlStr.startsWith('http')) {
                urlStr = 'http://' + urlStr;
            }
            return this.processSefazLink(urlStr);
        }

        if (text.match(/https?:\/\//)) {
            return this.processSefazLink(text);
        }

        return {
            success: false,
            error: 'Não reconheci o formato. Envie um link de nota fiscal, QR Code, foto do cupom ou foto de oferta.',
        };
    }

    private async processImage(imageData: Uint8Array): Promise<PipelineResult> {
        console.log(`[IngestionPipeline] Processing image: ${imageData.length} bytes`);
        try {
            const result = await visionService.extractFromImage(imageData);

            if (result && result.sefazKey) {
                const cleanKey = result.sefazKey.replace(/\D/g, '');
                if (cleanKey.length === 44) {
                    const generatedUrl = `http://app.sefaz.es.gov.br/ConsultaNFCe/qrcode.aspx?p=${cleanKey}|2|1|1|`;
                    console.log(`[IngestionPipeline] Chave encontrada: ${cleanKey}. Tentando scrap no proxy...`);
                    const proxyResult = await this.processSefazLink(generatedUrl);
                    if (proxyResult.success) return proxyResult;
                    console.log('[IngestionPipeline] Proxy falhou. Usando fallback de visao.');
                }
            }

            if (result && result.sefazUrl) {
                let urlStr = result.sefazUrl;
                if (!urlStr.startsWith('http')) {
                    urlStr = 'http://' + urlStr;
                }
                console.log(`[IngestionPipeline] URL encontrada: ${urlStr}. Tentando scrap no proxy...`);
                const proxyResult = await this.processSefazLink(urlStr);
                if (proxyResult.success) return proxyResult;
                console.log('[IngestionPipeline] Proxy falhou. Usando fallback de visao.');
            }

            if (result && result.type === 'price_tag') {
                return { success: true, data: result, source: 'community_price_tag' };
            }

            if (result && result.type === 'tabloid' && Array.isArray(result.items) && result.items.length > 0) {
                console.log(`[IngestionPipeline] Contribuicao colaborativa: tabloide com ${result.items.length} produto(s).`);
                return { success: true, data: result, source: 'community_tabloid' };
            }

            if (result && result.type === 'receipt' && (result.items?.length > 0 || result.total > 0)) {
                console.log('[IngestionPipeline] Cupom fiscal identificado via visao.');
                return { success: true, data: result, source: 'receipt_vision' };
            }

            return {
                success: false,
                error: 'Não consegui extrair dados da imagem. Tente uma foto mais nítida do cupom ou da oferta.',
            };
        } catch {
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
                        confidence: 0.99,
                        type: 'receipt',
                        items: data.items.map((item: any) => ({
                            name: item.name,
                            price: item.totalPrice || item.unitPrice || 0,
                            quantity: item.quantity || 1,
                        })),
                    },
                    source: 'receipt_sefaz',
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
