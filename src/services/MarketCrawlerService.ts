import * as cheerio from 'cheerio';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';

export interface ScrapedOffer {
    productName: string;
    brandName?: string;
    price: number;
    marketName: string;
    marketId: string;
    url?: string;
}

class MarketCrawlerService {
    private readonly USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    /**
     * Tenta buscar as ofertas reais na internet para um termo de pesquisa
     */
    async searchRealTime(term: string): Promise<ScrapedOffer[]> {
        console.log(`[MarketCrawlerService] 🌐 Iniciando busca na web para: ${term}`);
        
        const results: ScrapedOffer[] = [];
        
        // Dispara buscas paralelas (limite de 5s de timeout para não travar o bot)
        const fetchPromises = [
            this.scrapeExtrabom(term).catch(e => { console.error('Errom Extrabom crawler:', e); return []; }),
            this.scrapeCarone(term).catch(e => { console.error('Erro Carone crawler:', e); return []; })
        ];

        const allData = await Promise.all(fetchPromises);
        allData.forEach(list => results.push(...list));

        // Se a busca falhar por bloqueios de anti-bot (Cloudflare, etc), 
        // ou não encontrar resultados reais, apenas retorna array vazio
        if (results.length === 0) {
            console.log(`[MarketCrawlerService] ⚠️ Sem resultados reais na web ou bloqueio detectado.`);
        }

        console.log(`[MarketCrawlerService] ✅ Busca concluída. ${results.length} itens encontrados na web.`);
        
        // Salva silenciosamente no Firebase para cache futuro
        if (results.length > 0) {
            this.persistToDatabase(results).catch(e => console.error("Erro ao salvar cache da web:", e));
        }

        return results;
    }

    private async scrapeExtrabom(term: string): Promise<ScrapedOffer[]> {
        const url = `https://www.extrabom.com.br/busca/?q=${encodeURIComponent(term)}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': this.USER_AGENT, 'Accept': 'text/html' },
            // timeout signal
            signal: AbortSignal.timeout(6000)
        });

        if (!response.ok) throw new Error(`Status ${response.status}`);
        const html = await response.text();
        const $ = cheerio.load(html);
        const offers: ScrapedOffer[] = [];

        // Estrutura comum do Extrabom
        $('.product-item, .item-produto, .card-produto').each((_, el) => {
            const name = $(el).find('.name, .product-name, .title').text().trim();
            const priceStr = $(el).find('.price, .preco, .valor').text().replace(/[^0-9,]/g, '').replace(',', '.');
            const price = parseFloat(priceStr);

            if (name && price && price > 0) {
                // Tenta extrar marca da primeira palavra para o agrupamento
                const brand = name.split(' ')[0];
                offers.push({
                    productName: name,
                    brandName: brand,
                    price,
                    marketName: 'Extrabom Praia de Campista',
                    marketId: 'extrabom-praia-campista',
                    url
                });
            }
        });

        return offers.slice(0, 5); // Traz os 5 primeiros
    }

    private async scrapeCarone(term: string): Promise<ScrapedOffer[]> {
        const url = `https://www.carone.com.br/${encodeURIComponent(term)}`;
        const response = await fetch(url, {
            headers: { 'User-Agent': this.USER_AGENT, 'Accept': 'text/html' },
            signal: AbortSignal.timeout(6000)
        });

        if (!response.ok) throw new Error(`Status ${response.status}`);
        const html = await response.text();
        const $ = cheerio.load(html);
        const offers: ScrapedOffer[] = [];

        // Carone (frequentemente VTEX)
        $('.vtex-product-summary-2-x-container').each((_, el) => {
            const name = $(el).find('.vtex-store-components-3-x-productBrand').text().trim();
            const priceStr = $(el).find('.vtex-store-components-3-x-sellingPriceValue').text().replace(/[^0-9,]/g, '').replace(',', '.');
            const price = parseFloat(priceStr);

            if (name && price && price > 0) {
                offers.push({
                    productName: name,
                    price,
                    marketName: 'Carone Praia da Costa',
                    marketId: 'carone-praia-costa',
                    url
                });
            }
        });

        return offers.slice(0, 5);
    }



    private async persistToDatabase(offers: ScrapedOffer[]) {
        const offersRef = collection(db, 'offers');
        
        for (const offer of offers) {
            try {
                // Checa se já existe para evitar duplicação em curto prazo
                const q = query(offersRef, 
                    where('name', '==', offer.productName), 
                    where('marketId', '==', offer.marketId)
                );
                const snap = await getDocs(q);
                
                if (snap.empty) {
                    await addDoc(offersRef, {
                        name: offer.productName,
                        productName: offer.productName,
                        brand: offer.brandName || '',
                        price: offer.price,
                        marketName: offer.marketName,
                        marketId: offer.marketId,
                        source: 'web_crawler',
                        url: offer.url,
                        createdAt: new Date().toISOString(),
                        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() // Expira em 2 dias
                    });
                }
            } catch (e) {
                console.error('[MarketCrawlerService] Erro ao salvar offer no cache:', e);
            }
        }
    }
}

export const marketCrawlerService = new MarketCrawlerService();
