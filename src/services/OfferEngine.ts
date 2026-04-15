// ─────────────────────────────────────────────
// OfferEngine — Motor de busca de ofertas no Firebase
// ─────────────────────────────────────────────

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { calculateTransportCost, type TransportMode } from '../app/utils/geoUtils';
import { geoDecisionEngine } from './GeoDecisionEngine';
import { normalizeCatalogText, productCatalogService } from './ProductCatalogService';
import { offerHygieneService } from './OfferHygieneService';
import { categoryMetadataService } from './CategoryMetadataService';
import { analyticsEventWriter, sanitizeMarketRegion } from '../workers/AnalyticsEventWriter';
import type { ShoppingItemOfferCandidate, ShoppingListItem } from '../types/shopping';

interface OfferResult {
    productName: string;
    brandName?: string;
    price: number;
    marketName: string;
    marketId: string;
    marketRegion?: string;
    distance?: number;
    transportCost?: number;
    realCost?: number;
    expiresAt?: string;
}

function normalize(str: string): string {
    return str.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, '')
        .trim();
}

function capitalize(str: string): string {
    if (!str) return str;
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function titleCase(str: string): string {
    return String(str || '')
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function formatCurrency(value: number): string {
    return `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
}

function fuzzyMatch(needle: string, haystack: string): boolean {
    const n = normalize(needle);
    const h = normalize(haystack);
    if (h.includes(n) || n.includes(h)) return true;

    // Tentativa simples de singular (ex: cervejas -> cerveja)
    if (n.endsWith('s') && n.length > 3 && h.includes(n.slice(0, -1))) return true;

    // Keyword match — todas as palavras da busca devem aparecer
    const keywords = n.split(/\s+/);
    return keywords.every(kw => {
        if (h.includes(kw)) return true;
        // Singular simples para cada palavra chave
        if (kw.endsWith('s') && kw.length > 3 && h.includes(kw.slice(0, -1))) return true;
        // Plural simples para cada palavra chave (ex: pesquisou cerveja, mercado cadastrou cervejas)
        if (h.includes(kw + 's')) return true;
        return false;
    });
}

function isBadOfferName(productName: string): boolean {
    const normalized = normalize(productName);
    return !normalized || /^off\s+[a-z0-9]{6,}/i.test(normalized);
}

const CATEGORY_SYNONYMS: Record<string, string[]> = {
    'hortifruti': ['fruta', 'verdura', 'legume', 'alface', 'tomate', 'banana', 'maca', 'laranja', 'batata', 'cebola', 'cenoura', 'pepino', 'pimentao'],
    'mercearia': ['arroz', 'feijao', 'oleo', 'acucar', 'sal', 'farinha', 'macarrao', 'molho', 'massa', 'cafe'],
    'carnes': ['carne', 'frango', 'bovina', 'suina', 'linguica', 'costela', 'file', 'bisteca', 'hamburguer', 'salsicha'],
    'limpeza': ['detergente', 'sabao', 'desinfetante', 'agua sanitaria', 'esponja', 'amaciante', 'alvejante'],
    'higiene': ['shampoo', 'condicionador', 'sabonete', 'papel higienico', 'creme dental', 'escova', 'desodorante', 'absorvente', 'camisinha', 'preservativo'],
    'bebidas': ['cerveja', 'refrigerante', 'suco', 'agua', 'vinho', 'vodka', 'whisky', 'energetico'],
    'laticinios': ['leite', 'queijo', 'iogurte', 'manteiga', 'requeijao', 'creme de leite', 'nata'],
    'padaria': ['pao', 'bolo', 'biscoito', 'bolacha', 'rosca', 'torrada'],
    'frios': ['presunto', 'mortadela', 'peito de peru', 'salame', 'bacon', 'apresuntado'],
    'congelados': ['pizza', 'lasanha', 'sorvete', 'hamburguer', 'nuggets', 'polpa'],
};

function categoryMatch(category: string, productName: string): boolean {
    const normCat = normalize(category);
    const normProd = normalize(productName);

    // Match direto
    if (normProd.includes(normCat) || normCat.includes(normProd)) return true;

    // Match por sinônimos
    for (const [cat, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
        if (normCat.includes(cat) || cat.includes(normCat)) {
            if (synonyms.some(s => normProd.includes(s))) return true;
        }
    }

    return false;
}

function inferOfferLabel(query: string, matchedBase: string | undefined, offer: OfferResult): string {
    if (offer.brandName?.trim()) {
        return titleCase(offer.brandName);
    }

    const normalizedOfferName = normalizeCatalogText(offer.productName);
    const baseCandidates = [query, matchedBase]
        .map((value) => normalizeCatalogText(value || ''))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

    let remainder = normalizedOfferName;
    for (const base of baseCandidates) {
        if (remainder.startsWith(`${base} `)) {
            remainder = remainder.slice(base.length).trim();
            break;
        }
        if (remainder.includes(base)) {
            remainder = remainder.replace(base, '').trim();
        }
    }

    const inferred = remainder.split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
    return titleCase(inferred || offer.productName);
}

function shouldUseWebFallback(): boolean {
    try {
        const viteFlag = import.meta.env?.VITE_ALLOW_WEB_FALLBACK;
        if (viteFlag !== undefined) {
            return String(viteFlag).trim().toLowerCase() === 'true';
        }
    } catch {
        // ignore import.meta access outside vite
    }

    return String(process.env.ALLOW_WEB_FALLBACK || '').trim().toLowerCase() === 'true';
}

class OfferEngine {
    async lookupSingle(
        productName: string,
        userLocation?: { lat: number; lng: number },
        transportMode?: TransportMode,
        consumption?: number
    ): Promise<string> {
        console.log(`[OfferEngine] lookupSingle: ${productName} (geo: ${!!userLocation})`);
        try {
            const searchContext = await productCatalogService.resolveSearch(productName);
            const catalogMatch = await productCatalogService.matchProductName(productName);
            const mentionedBrand = await productCatalogService.findMentionedBrand(productName);
            const normalizedInput = normalizeCatalogText(productName);
            const exactCatalogTerms = catalogMatch.product
                ? new Set([
                    normalizeCatalogText(catalogMatch.product.name),
                    ...(catalogMatch.product.synonyms || []).map((synonym) => normalizeCatalogText(synonym)),
                ].filter(Boolean))
                : new Set<string>();
            const matchedCatalogBase = catalogMatch.product
                ? normalizeCatalogText(catalogMatch.product.name)
                : undefined;
            const isExactCatalogTerm = exactCatalogTerms.has(normalizedInput);
            const hasSpecificDescriptor = Boolean(mentionedBrand) || Boolean(
                normalizedInput &&
                matchedCatalogBase &&
                !isExactCatalogTerm &&
                normalizedInput.includes(matchedCatalogBase),
            );
            const shouldExpandCatalogSearch = !hasSpecificDescriptor;
            const offersRef = collection(db, 'offers');
            const offersQuery = searchContext.matchedCategory
                ? query(offersRef, where('category', '==', searchContext.matchedCategory))
                : offersRef;
            const snap = await getDocs(offersQuery);

            const matches: OfferResult[] = [];
            const searchTerms = new Set([
                normalize(productName),
                ...searchContext.searchTerms,
            ]);

            snap.forEach(doc => {
                const data = doc.data();
                if (!offerHygieneService.isOfferUsableForSearch(data)) return;
                const pName = data.productName || data.name || '';
                const searchableOfferText = [pName, data.brand || ''].join(' ');
                const mName = data.marketName || data.networkName || '';
                const price = data.price || data.promoPrice || 0;
                if (isBadOfferName(pName)) return;

                const isCatalogMatch = shouldExpandCatalogSearch &&
                    Array.from(searchTerms).some((term) => fuzzyMatch(term, searchableOfferText));

                if (fuzzyMatch(productName, searchableOfferText) || isCatalogMatch) {
                    // Checar validade
                    if (data.expiresAt) {
                        const expires = new Date(data.expiresAt);
                        if (expires < new Date()) return; // Expirada
                    }

                    // Filtrar ofertas sem dados essenciais
                    if (!mName || price <= 0) {
                        console.log(`[OfferEngine] SKIP bad offer: ${doc.id} (market: "${mName}", price: ${price})`);
                        return;
                    }

                    console.log(`[OfferEngine] MATCH: ${pName} @ ${mName} = R$${price} (doc: ${doc.id})`);

                    matches.push({
                        productName: pName,
                        brandName: data.brand || '',
                        price,
                        marketName: mName,
                        marketId: data.marketId || '',
                        marketRegion: data.neighborhood || data.bairro || data.marketRegion || '',
                        expiresAt: data.expiresAt,
                    });
                }
            });

            const localBrandVariety = new Set(
                matches.map((match) => normalizeCatalogText(inferOfferLabel(productName, matchedCatalogBase, match))),
            ).size;
            if (matches.length < 3 || (!hasSpecificDescriptor && localBrandVariety < 2)) {
                if (shouldUseWebFallback()) {
                    console.log(`[OfferEngine] Poucos resultados locais (${matches.length}). Web fallback liberado por configuracao.`);
                } else {
                    console.log(`[OfferEngine] Poucos resultados locais (${matches.length}). Web fallback desativado em modo WhatsApp-first.`);
                }
            }

            if (matches.length === 0) {
                return `Não encontrei ofertas vigentes para **${productName}** hoje.`;
            }

            // ── Analytics: price_queried (fire-and-forget, sem PII) ───────────
            {
                const cheapest = matches.reduce(
                    (min, m) => (m.price < min.price ? m : min),
                    matches[0],
                );
                analyticsEventWriter.writeEvent({
                    eventType: 'price_queried',
                    marketId: cheapest.marketId || '',
                    marketRegion: sanitizeMarketRegion(cheapest.marketRegion),
                    categorySlug: searchContext.matchedCategory || '',
                    pricePoint: cheapest.price,
                    basketSize: 1,
                }).catch(() => { /* já logado internamente */ });
            }
            // ─────────────────────────────────────────────────────────────────

            // Identificar se é uma busca "genérica" analisando as marcas ou nomes
            const genericLabels = matches
                .map((match) => inferOfferLabel(productName, matchedCatalogBase, match))
                .filter(Boolean);
            const distinctGenericLabels = new Set(genericLabels.map((label) => normalizeCatalogText(label)));
            const shouldShowBrandOptions = shouldExpandCatalogSearch && distinctGenericLabels.size > 1;

            if (shouldShowBrandOptions) {
                const groupedByLabel = new Map<string, { label: string; offers: OfferResult[] }>();

                for (const match of matches) {
                    const label = inferOfferLabel(productName, matchedCatalogBase, match);
                    const groupKey = normalizeCatalogText(label);
                    if (!groupedByLabel.has(groupKey)) {
                        groupedByLabel.set(groupKey, { label, offers: [] });
                    }
                    groupedByLabel.get(groupKey)!.offers.push(match);
                }

                const brandLines: string[] = [];
                const bestPerBrand: Array<{ label: string; offer: OfferResult }> = [];

                for (const [, groupData] of groupedByLabel.entries()) {
                    groupData.offers.sort((a, b) => a.price - b.price);
                    bestPerBrand.push({ label: groupData.label, offer: groupData.offers[0] });
                }

                bestPerBrand.sort((a, b) => a.offer.price - b.offer.price);

                const topBrands = bestPerBrand.slice(0, 6);
                for (const [index, item] of topBrands.entries()) {
                    const best = item.offer;
                    if (userLocation) {
                        await this.enrichWithDistance([best], userLocation, transportMode || 'car', consumption || 10);
                    }

                    const icon = index === 0 ? '🟢' : index === 1 ? '🟡' : '🔴';
                    brandLines.push(`${icon} ${formatCurrency(best.price)} - ${item.label} (${best.marketName})`);
                }

                const cheapest = topBrands[0];
                const priciest = topBrands[topBrands.length - 1];
                const savings = cheapest && priciest
                    ? Math.max(0, priciest.offer.price - cheapest.offer.price)
                    : 0;

                return `☕ ${productName.toUpperCase()} — comparação de marcas\n\n${brandLines.join('\n')}\n\n💡 Trocando para ${cheapest?.label || 'a opção mais barata'}:\nR$ ${savings.toFixed(2).replace('.', ',')} por unidade\n\nQuer que eu troque na sua lista? 🛒`;
            }

            const distinctBrands = new Set<string>();
            matches.forEach(m => {
                if (m.brandName) {
                    distinctBrands.add(m.brandName.toLowerCase());
                } else {
                    // Tenta adivinhar a marca via substring após o termo
                    const termNormalized = normalize(productName);
                    const nameNormalized = normalize(m.productName);
                    if (nameNormalized !== termNormalized) {
                        const words = nameNormalized.replace(termNormalized, '').trim().split(' ');
                        if (words.length > 0 && words[0].length > 2) {
                            distinctBrands.add(words[0]);
                        }
                    }
                }
            });

            const isGenericSearch = false && distinctBrands.size > 1;

            if (isGenericSearch) {
                // AGRUPAMENTO INTELIGENTE POR MARCA / VARIAÇÃO
                const grouped = new Map<string, OfferResult[]>();
                for (const m of matches) {
                    let groupKey = m.brandName || m.productName.split(' ').slice(0, 3).join(' ');
                    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
                    grouped.get(groupKey)!.push(m);
                }

                const brandLines: string[] = [];

                // Para cada marca, mostrar o mercado mais barato
                const sortedGroups = Array.from(grouped.entries());

                const bestPerBrand: OfferResult[] = [];
                for (const [, groupMatches] of sortedGroups) {
                    groupMatches.sort((a, b) => a.price - b.price);
                    bestPerBrand.push(groupMatches[0]);
                }

                // Sort all top brands by price
                bestPerBrand.sort((a, b) => a.price - b.price);

                for (const best of bestPerBrand) {
                    if (userLocation) {
                        await this.enrichWithDistance([best], userLocation, transportMode || 'car', consumption || 10);
                    }

                    const priceStr = `R$ ${best.price.toFixed(2).replace('.', ',')}`;
                    const label = best.brandName ? capitalize(best.brandName) : capitalize(best.productName);
                    
                    if (best.realCost && best.distance) {
                         brandLines.push(`🏷️ **${label}**: ${priceStr} no ${best.marketName} (Total Real: R$ ${best.realCost.toFixed(2).replace('.', ',')})`);
                    } else {
                         brandLines.push(`🏷️ **${label}**: ${priceStr} no ${best.marketName}`);
                    }
                }

                return `🔍 **Múltiplas marcas encontradas para ${productName.toUpperCase()}!**\nAqui estão as opções ordenadas pelo menor preço:\n\n${brandLines.join('\n')}`;
            }

            // FLUXO ORIGINAL (Item Específico)
            // Deduplicar por mercado (manter o mais barato de cada)
            const deduped = new Map<string, OfferResult>();
            for (const m of matches) {
                const key = m.marketName.toLowerCase();
                if (!deduped.has(key) || m.price < deduped.get(key)!.price) {
                    deduped.set(key, m);
                }
            }
            const uniqueMatches = Array.from(deduped.values());

            if (uniqueMatches.length === 0) {
                return `Não encontrei ofertas vigentes para **${productName}** hoje.`;
            }

            // Se o usuário tem localização, calcular custo real
            if (userLocation) {
                await this.enrichWithDistance(uniqueMatches, userLocation, transportMode || 'car', consumption || 10);
            }

            // Ordenar por custo real (preço + transporte) ou só preço
            if (userLocation) {
                uniqueMatches.sort((a, b) => (a.realCost || a.price) - (b.realCost || b.price));
            } else {
                uniqueMatches.sort((a, b) => a.price - b.price);
            }

            const top3 = uniqueMatches.slice(0, 3);

            const lineIcons = ['🟢', '🟡', '🔴'];
            const lines = top3.map((result, index) => {
                const icon = lineIcons[index] || '•';
                const label = result.brandName?.trim()
                    ? `${titleCase(result.brandName)} (${result.marketName})`
                    : result.marketName;
                return `${icon} ${formatCurrency(result.price)} - ${label}`;
            });

            const economy = top3.length > 1
                ? Math.max(0, top3[top3.length - 1].price - top3[0].price)
                : 0;

            return `${this.formatProductHeader(productName)}\n\n${lines.join('\n')}\n\n💰 Você economiza: ${formatCurrency(economy)}\n\nQuer saber se vale ir de carro? 🚗`;
        } catch (err) {
            console.error('[OfferEngine] Firestore error:', err);
            return `Erro ao buscar ofertas para ${productName}. Tente novamente.`;
        }
    }

    /**
     * Enriquece ofertas com distância e custo de transporte buscando lat/lng dos mercados.
     */
    private async enrichWithDistance(
        matches: OfferResult[],
        userLocation: { lat: number; lng: number },
        transportMode: TransportMode,
        consumption: number
    ): Promise<void> {
        try {
            // Busca mercados num raio grande (50km) para cruzar com as ofertas
            const nearbyMarkets = await geoDecisionEngine.findNearbyMarkets(userLocation.lat, userLocation.lng, 50);

            for (const match of matches) {
                const normMarket = normalize(match.marketName);

                // Encontrar o mercado correspondente nos resultados do geoDecisionEngine
                const geoMatch = nearbyMarkets.find((m: any) =>
                    m.marketId === match.marketId ||
                    normalize(m.marketName).includes(normMarket) ||
                    normMarket.includes(normalize(m.marketName))
                );

                if (geoMatch && geoMatch.distance !== undefined) {
                    match.distance = geoMatch.distance;
                    match.transportCost = calculateTransportCost(
                        match.distance,
                        transportMode,
                        consumption,
                    );
                    match.realCost = Math.round((match.price + match.transportCost) * 100) / 100;
                }
            }
        } catch (err) {
            console.error('[OfferEngine] enrichWithDistance error:', err);
        }
    }

    async lookupBatch(
        products: string[],
        userLocation?: { lat: number; lng: number },
        transportMode?: TransportMode,
        consumption?: number
    ): Promise<{ text: string; products: string[] }> {
        console.log(`[OfferEngine] lookupBatch: ${products.join(', ')}`);
        const results: string[] = [];
        const foundProducts: string[] = [];

        for (const product of products) {
            const result = await this.lookupSingle(product, userLocation, transportMode, consumption);
            results.push(result);
            if (!result.startsWith('Não encontrei')) {
                foundProducts.push(product);
            }
        }

        return {
            text: results.join('\n\n──────────\n\n'),
            products: foundProducts,
        };
    }

    async getTopOffersByMarket(marketName: string, purchaseHistory?: string[]): Promise<string> {
        console.log(`[OfferEngine] getTopOffersByMarket: ${marketName} (history: ${purchaseHistory?.length || 0} items)`);
        try {
            const offersRef = collection(db, 'offers');
            const [snap, categoryMap] = await Promise.all([
                getDocs(offersRef),
                categoryMetadataService.getMap(),
            ]);

            // Normalizar histórico para comparação
            const historyNorm = (purchaseHistory || []).map(p => normalize(p));
            const searchNorm = normalize(marketName);

            // Coletar matches e o nome real do mercado
            let realMarketName = marketName; // fallback
            const productMap = new Map<string, {
                name: string;
                price: number;
                isFrequent: boolean;
                categoryId: string;
            }>();

            snap.forEach(doc => {
                const data = doc.data();
                if (!offerHygieneService.isOfferUsableForSearch(data)) return;
                const rawMarket = data.marketName || data.networkName || '';
                const mn = normalize(rawMarket);
                const price = data.price || data.promoPrice || 0;
                if (!mn || price <= 0) return;

                // Match de mercado (precisa match significativo, min 4 chars)
                if (searchNorm.length >= 4 && mn.includes(searchNorm) || mn === searchNorm) {
                    if (data.expiresAt && new Date(data.expiresAt) < new Date()) return;

                    // Capturar o nome real do mercado (com acentos/caps original)
                    if (rawMarket && rawMarket.length > realMarketName.length) {
                        realMarketName = rawMarket;
                    }

                    const productName = data.productName || data.name || '';
                    // Skip produtos com nomes que são IDs/hashes
                    if (!productName || /^off[\s_]?[a-f0-9]{6}/i.test(productName) || /^[a-f0-9]{8,}/i.test(productName)) {
                        return;
                    }

                    const productKey = normalize(productName);
                    const categoryId = String(data.category || '').trim().toLowerCase();

                    // Verificar se o produto está no histórico de compras
                    const isFrequent = historyNorm.some(h =>
                        productKey.includes(h) || h.includes(productKey) ||
                        fuzzyMatch(h, productName)
                    );

                    // DEDUP: apenas manter o mais barato por produto
                    const existing = productMap.get(productKey);
                    if (!existing || price < existing.price) {
                        productMap.set(productKey, {
                            name: productName,
                            price,
                            isFrequent,
                            categoryId,
                        });
                    }
                }
            });

            const unique = Array.from(productMap.values());
            {
            const grouped = new Map<string, Array<{
                name: string;
                price: number;
                isFrequent: boolean;
                categoryId: string;
            }>>();
            for (const offer of unique) {
                const resolvedCategoryId = categoryMap.has(offer.categoryId)
                    ? offer.categoryId
                    : 'outros';
                if (!grouped.has(resolvedCategoryId)) {
                    grouped.set(resolvedCategoryId, []);
                }
                grouped.get(resolvedCategoryId)!.push(offer);
            }

            const orderedGroups = Array.from(grouped.entries()).sort((a, b) => {
                const metaA = categoryMap.get(a[0]);
                const metaB = categoryMap.get(b[0]);
                return (metaA?.ordem || 999) - (metaB?.ordem || 999);
            });

            const sections: string[] = [];
            let totalShown = 0;

            for (const [categoryId, offers] of orderedGroups) {
                if (totalShown >= 18) break;

                offers.sort((a, b) => {
                    if (a.isFrequent && !b.isFrequent) return -1;
                    if (!a.isFrequent && b.isFrequent) return 1;
                    return a.price - b.price;
                });

                const selected = offers.slice(0, 3);
                if (selected.length === 0) continue;

                totalShown += selected.length;
                const categoryMeta = categoryMap.get(categoryId);
                const categoryLabel = categoryMeta?.nome || capitalize(categoryId.replace(/_/g, ' ')) || 'Outros';
                const icon = categoryMeta?.icone || '🛒';
                const lines = selected.map((offer) => {
                    const star = offer.isFrequent ? ' ⭐' : '';
                    return `• ${offer.name} — R$ ${offer.price.toFixed(2).replace('.', ',')}${star}`;
                });

                sections.push(`${icon} **${categoryLabel}**\n${lines.join('\n')}`);
            }

            if (sections.length === 0) {
                return `Poxa, não encontrei ofertas ativas para o mercado **${realMarketName}** agora.`;
            }

            const groupedHasFrequent = unique.some((offer) => offer.isFrequent);
            const hasFrequent = groupedHasFrequent;
            const groupedLegend = hasFrequent ? '\n\n⭐ = produtos que você costuma comprar' : '';

            return `🏪 Ofertas do ${realMarketName.toUpperCase()} — hoje\n\n${sections.join('\n\n')}${groupedLegend}\n\nQuer saber qual fica mais perto de você? 📍`;

            if (unique.length === 0) return `Poxa, não encontrei ofertas ativas para o mercado **${realMarketName}** agora.`;

            // Para dar "variedade" e não mostrar apenas os 10 itens mais baratos (sal, alface)
            // em TODOS os mercados, embaralhamos os produtos (mantendo os frequentes no topo).
            }
            const frequent = unique.filter(o => o.isFrequent);
            const others = unique.filter(o => !o.isFrequent).sort(() => Math.random() - 0.5);

            // Pegar as 10 vagas, priorizando frequentes
            let selected = [...frequent];
            if (selected.length < 10) {
                selected = selected.concat(others.slice(0, 10 - selected.length));
            } else {
                selected = selected.slice(0, 10);
            }

            // Ordenar a vitrine final por preço apenas para ficar bonito
            selected.sort((a, b) => {
                if (a.isFrequent && !b.isFrequent) return -1;
                if (!a.isFrequent && b.isFrequent) return 1;
                return a.price - b.price;
            });

            const lines = selected.map((r, i) => {
                const star = r.isFrequent ? ' ⭐' : '';
                return `${i + 1}. ${r.name} — R$ ${r.price.toFixed(2).replace('.', ',')}${star}`;
            });

            const hasFrequent = selected.some(r => r.isFrequent);
            const header = `🏪 **Ofertas ${realMarketName.toUpperCase()}**`;
            const legend = hasFrequent ? '\n\n⭐ = produtos que você costuma comprar' : '';

            return `${header}\n\n${lines.join('\n')}${legend}`;
        } catch (err) {
            console.error('[OfferEngine] Error:', err);
            return `Poxa, não encontrei ofertas para ${marketName} agora.`;
        }
    }

    async getWeeklyVitrine(): Promise<string> {
        try {
            const offersRef = collection(db, 'offers');
            const snap = await getDocs(offersRef);
            const active: Array<{ name: string; price: number; market: string }> = [];

            snap.forEach(doc => {
                const data = doc.data();
                if (!offerHygieneService.isOfferUsableForSearch(data)) return;
                if (data.expiresAt && new Date(data.expiresAt) < new Date()) return;
                active.push({
                    name: data.productName || data.name,
                    price: data.price || data.promoPrice || 0,
                    market: data.marketName || data.networkName || '',
                });
            });

            if (active.length === 0) return "As ofertas da semana não foram carregadas ainda.";

            active.sort((a, b) => a.price - b.price);
            const top = active.slice(0, 10);
            const lines = top.map((r, i) => `${i + 1}. **${r.name}** — R$ ${r.price.toFixed(2).replace('.', ',')} (${r.market})`);
            return `🔥 **TOP 10 OFERTAS DA SEMANA**\n\n${lines.join('\n')}`;
        } catch (err) {
            return "Erro ao carregar ofertas da semana.";
        }
    }

    async getCategoryVitrine(category: string): Promise<string> {
        try {
            const offersRef = collection(db, 'offers');
            const searchContext = await productCatalogService.resolveSearch(category);
            const offersQuery = searchContext.matchedCategory
                ? query(offersRef, where('category', '==', searchContext.matchedCategory))
                : offersRef;
            const snap = await getDocs(offersQuery);
            const matches: Array<{ name: string; price: number; market: string }> = [];
            const searchTerms = new Set([normalize(category), ...searchContext.searchTerms]);

            snap.forEach(doc => {
                const data = doc.data();
                if (!offerHygieneService.isOfferUsableForSearch(data)) return;
                if (data.expiresAt && new Date(data.expiresAt) < new Date()) return;
                const prodName = data.productName || data.name || '';
                const cat = data.category || '';
                if (isBadOfferName(prodName)) return;
                const isCatalogMatch = Array.from(searchTerms).some((term) => fuzzyMatch(term, prodName));
                if (categoryMatch(category, prodName) || categoryMatch(category, cat) || isCatalogMatch) {
                    matches.push({
                        name: prodName,
                        price: data.price || data.promoPrice || 0,
                        market: data.marketName || data.networkName || '',
                    });
                }
            });

            if (matches.length === 0) return `Poxa, não encontrei ofertas na categoria **${category}** agora.`;

            matches.sort((a, b) => a.price - b.price);
            const top = matches.slice(0, 10);
            const lines = top.map((r, i) => `${i + 1}. **${r.name}** — R$ ${r.price.toFixed(2).replace('.', ',')} (${r.market})`);
            return `📦 **${category.toUpperCase()}**\n\n${lines.join('\n')}`;
        } catch (err) {
            return `Poxa, não encontrei ofertas na categoria ${category}.`;
        }
    }

    async getHistoricalPrices(productName: string, targetDate?: string): Promise<string> {
        try {
            const offersRef = collection(db, 'offers');
            const snap = await getDocs(offersRef);
            const matches: Array<{ name: string; price: number; market: string; date: string }> = [];

            snap.forEach(doc => {
                const data = doc.data();
                if (!offerHygieneService.isOfferUsableForSearch(data)) return;
                if (fuzzyMatch(productName, data.productName || data.name || '')) {
                    const offerDate = data.createdAt || data.startsAt || '';
                    // Filtrar por data alvo se fornecida
                    if (targetDate && offerDate && offerDate < targetDate) return;
                    matches.push({
                        name: data.productName || data.name,
                        price: data.price || data.promoPrice || 0,
                        market: data.marketName || data.networkName || '',
                        date: offerDate || 'N/A',
                    });
                }
            });

            if (matches.length === 0) return `Ainda não tenho histórico suficiente para te mostrar quando ${productName} fica mais barato.`;

            const prices = matches.map((item) => item.price).filter((price) => price > 0);
            const lowest = Math.min(...prices);
            const highest = Math.max(...prices);
            const sample = matches
                .slice(0, 3)
                .map((item) => `• ${item.market}: ${formatCurrency(item.price)}`)
                .join('\n');

            return `📈 Histórico de preço — ${productName.toUpperCase()}\n\nFaixa encontrada:\n✅ Mais barato: ${formatCurrency(lowest)}\n❌ Mais caro: ${formatCurrency(highest)}\n\nÚltimos registros:\n${sample}`;
        } catch (err) {
            return `Erro ao buscar histórico de ${productName}.`;
        }
    }

    private formatProductHeader(productName: string): string {
        return `🛒 ${productName.toUpperCase()}`;
    }

    // Usado pelo ListManager e pelo ShoppingComparisonService para comparar preços entre mercados.
    async getPricesForItems(items: ShoppingListItem[]): Promise<Map<string, ShoppingItemOfferCandidate[]>> {
        const result = new Map<string, ShoppingItemOfferCandidate[]>();

        try {
            const catalogByItem = await Promise.all(items.map((item) => productCatalogService.resolveSearch(item.name)));
            const categoryHints = Array.from(new Set(catalogByItem.map((search) => search.matchedCategory).filter(Boolean)));
            const offersRef = collection(db, 'offers');
            const snap = categoryHints.length === 1
                ? await getDocs(query(offersRef, where('category', '==', categoryHints[0]!)))
                : await getDocs(offersRef);

            for (const [index, item] of items.entries()) {
                const itemMatches = new Map<string, ShoppingItemOfferCandidate>();
                const searchContext = catalogByItem[index];
                const searchTerms = new Set([normalize(item.name), ...searchContext.searchTerms]);
                const quantity = item.quantity && item.quantity > 0 ? item.quantity : 1;

                snap.forEach(doc => {
                    const data = doc.data();
                    if (!offerHygieneService.isOfferUsableForSearch(data)) return;
                    const mName = data.marketName || data.networkName || '';
                    const price = data.price || data.promoPrice || 0;
                    if (!mName || price <= 0) return;
                    if (data.expiresAt && new Date(data.expiresAt) < new Date()) return;
                    const offerName = data.productName || data.name || '';
                    if (isBadOfferName(offerName)) return;
                    const isCatalogMatch = Array.from(searchTerms).some((term) => fuzzyMatch(term, offerName));
                    if (fuzzyMatch(item.name, offerName) || isCatalogMatch) {
                        const marketKey = normalize(mName);
                        const candidate: ShoppingItemOfferCandidate = {
                            itemName: item.name,
                            productName: offerName,
                            marketName: mName,
                            marketId: data.marketId || '',
                            price,
                            quantity,
                            unit: item.unit,
                            totalPrice: price * quantity,
                            expiresAt: data.expiresAt,
                        };
                        const current = itemMatches.get(marketKey);
                        if (!current || candidate.totalPrice < current.totalPrice) {
                            itemMatches.set(marketKey, candidate);
                        }
                    }
                });

                const rankedMatches = Array.from(itemMatches.values()).sort((a, b) => {
                    if (a.totalPrice !== b.totalPrice) {
                        return a.totalPrice - b.totalPrice;
                    }

                    return a.marketName.localeCompare(b.marketName);
                });

                result.set(item.name, rankedMatches);
            }
        } catch (err) {
            console.error('[OfferEngine] getPricesForItems error:', err);
        }

        return result;
    }

    /**
     * Sugestão inteligente: detecta a categoria dominante da lista e sugere
     * 1 produto complementar com oferta ativa que o usuário NÃO tem na lista.
     */
    async getSmartSuggestion(listItems: Array<{ name: string }>): Promise<{ text: string; product?: string } | null> {
        if (listItems.length < 2) return null;

        try {
            // 1. Detectar a categoria dominante
            const categoryScores: Record<string, number> = {};
            const listNormalized = listItems.map(i => normalize(i.name));

            for (const itemNorm of listNormalized) {
                for (const [cat, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
                    if (synonyms.some(s => itemNorm.includes(s) || s.includes(itemNorm))) {
                        categoryScores[cat] = (categoryScores[cat] || 0) + 1;
                    }
                }
            }

            if (Object.keys(categoryScores).length === 0) return null;

            // Pegar a top categoria
            const topCategory = Object.entries(categoryScores)
                .sort(([, a], [, b]) => b - a)[0][0];

            const topSynonyms = CATEGORY_SYNONYMS[topCategory] || [];

            // 2. Filtrar sinônimos que o usuário JÁ tem na lista
            const alreadyInList = new Set(listNormalized);
            const candidates = topSynonyms.filter(s =>
                !alreadyInList.has(s) &&
                !listNormalized.some(li => li.includes(s) || s.includes(li))
            );

            if (candidates.length === 0) return null;

            // 3. Buscar uma oferta ativa para um dos candidatos
            const offersRef = collection(db, 'offers');
            const snap = await getDocs(offersRef);

            for (const candidate of candidates) {
                let bestOffer: { name: string; price: number; market: string } | null = null;

                snap.forEach(doc => {
                    const data = doc.data();
                    if (!offerHygieneService.isOfferUsableForSearch(data)) return;
                    const pName = data.productName || data.name || '';
                    const price = data.price || data.promoPrice || 0;
                    const market = data.marketName || data.networkName || '';
                    if (!pName || price <= 0 || !market) return;
                    if (data.expiresAt && new Date(data.expiresAt) < new Date()) return;

                    if (fuzzyMatch(candidate, pName)) {
                        if (!bestOffer || price < bestOffer.price) {
                            bestOffer = { name: pName, price, market };
                        }
                    }
                });

                if (bestOffer) {
                    const bo = bestOffer as { name: string; price: number; market: string };
                    const CATEGORY_LABELS: Record<string, string> = {
                        'limpeza': '🧹 Limpeza',
                        'higiene': '🧴 Higiene',
                        'mercearia': '🛒 Mercearia',
                        'hortifruti': '🥦 Hortifrúti',
                        'carnes': '🥩 Carnes',
                        'bebidas': '🍺 Bebidas',
                        'laticinios': '🥛 Laticínios',
                        'padaria': '🍞 Padaria',
                        'frios': '🧀 Frios',
                        'congelados': '🧊 Congelados',
                    };
                    const catLabel = CATEGORY_LABELS[topCategory] || topCategory;
                    const priceStr = `R$ ${bo.price.toFixed(2).replace('.', ',')}`;

                    return {
                        text: `\n\n💡 **Dica ${catLabel}:** Vi que você tem itens de ${topCategory} na lista. Que tal adicionar **${bo.name}** por **${priceStr}** no **${bo.market}**?`,
                        product: bo.name,
                    };
                }
            }

            return null;
        } catch (err) {
            console.error('[OfferEngine] getSmartSuggestion error:', err);
            return null;
        }
    }
}

export const offerEngine = new OfferEngine();
