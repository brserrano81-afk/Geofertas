import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export interface CatalogProduct {
    id: string;
    name: string;
    brand?: string | null;
    category: string;
    synonyms: string[];
    active?: boolean;
}

export interface CatalogSearchResult {
    matchedProducts: CatalogProduct[];
    matchedCategory?: string;
    searchTerms: string[];
    isBroadMatch: boolean;
}

export interface CatalogMatchResult {
    product?: CatalogProduct;
    matchedBy?: 'name' | 'synonym';
    score: number;
}

export function normalizeCatalogText(str: string): string {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function fuzzyCatalogMatch(needle: string, haystack: string): boolean {
    const n = normalizeCatalogText(needle);
    const h = normalizeCatalogText(haystack);
    if (!n || !h) return false;
    if (h.includes(n) || n.includes(h)) return true;

    const keywords = n.split(/\s+/).filter(Boolean);
    return keywords.every((kw) => {
        if (h.includes(kw)) return true;
        if (kw.endsWith('s') && kw.length > 3 && h.includes(kw.slice(0, -1))) return true;
        if (h.includes(`${kw}s`)) return true;
        return false;
    });
}

export const CATEGORY_ALIASES: Record<string, string[]> = {
    mercearia: ['mercearia', 'mercado', 'basico', 'basicos', 'graos', 'grãos'],
    acougue: ['acougue', 'açougue', 'carne', 'carnes', 'frango', 'bovina', 'bovino', 'boi', 'porco', 'linguica', 'linguiça'],
    bebidas: ['bebida', 'bebidas', 'cerveja', 'cervejas', 'gelada', 'geladas', 'refrigerante', 'refrigerantes', 'suco', 'agua', 'água'],
    laticinios: ['laticinio', 'laticinios', 'laticínios', 'leite', 'queijo', 'iogurte', 'manteiga'],
    limpeza: ['limpeza', 'detergente', 'sabao', 'sabão', 'desinfetante', 'amaciante'],
    higiene_pessoal: ['higiene', 'higiene pessoal', 'papel higienico', 'papel higiênico', 'shampoo', 'sabonete', 'desodorante'],
    congelados: ['congelado', 'congelados', 'lasanha', 'pizza', 'hamburguer', 'hambúrguer', 'nuggets'],
    frios_embutidos: ['frios', 'embutidos', 'presunto', 'mortadela', 'salame', 'bacon', 'linguica', 'linguiça'],
    doces_biscoitos: ['doce', 'doces', 'biscoito', 'biscoitos', 'bolacha', 'chocolate'],
    padaria: ['padaria', 'pao', 'pão', 'bolo', 'torrada'],
    hortifruti: ['hortifruti', 'hortifruti', 'fruta', 'frutas', 'verdura', 'verduras', 'legume', 'legumes', 'banana', 'tomate', 'alface', 'batata', 'cebola'],
    bazar: ['bazar', 'utilidades'],
};

class ProductCatalogService {
    private cache: CatalogProduct[] | null = null;
    private loadedAt = 0;

    async loadCatalog(force = false): Promise<CatalogProduct[]> {
        const now = Date.now();
        if (!force && this.cache && now - this.loadedAt < 5 * 60 * 1000) {
            return this.cache;
        }

        const snap = await getDocs(collection(db, 'products'));
        this.cache = snap.docs
            .map((docSnap) => ({
                id: docSnap.id,
                ...(docSnap.data() as Omit<CatalogProduct, 'id'>),
            }))
            .filter((product) => product.active !== false);
        this.loadedAt = now;
        return this.cache;
    }

    async resolveSearch(term: string): Promise<CatalogSearchResult> {
        const normalizedTerm = normalizeCatalogText(term);
        if (!normalizedTerm) {
            return {
                matchedProducts: [],
                searchTerms: [],
                isBroadMatch: false,
            };
        }

        const catalog = await this.loadCatalog();
        const directCategory = this.resolveCategoryAlias(normalizedTerm);

        const matchedProducts = catalog.filter((product) => {
            if (fuzzyCatalogMatch(normalizedTerm, product.name)) return true;
            return (product.synonyms || []).some((synonym) => fuzzyCatalogMatch(normalizedTerm, synonym));
        });

        const categoryVotes = new Map<string, number>();
        matchedProducts.forEach((product) => {
            categoryVotes.set(product.category, (categoryVotes.get(product.category) || 0) + 1);
        });

        const votedCategory = Array.from(categoryVotes.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0];

        const matchedCategory = directCategory || votedCategory;
        const searchTerms = Array.from(new Set(
            matchedProducts.flatMap((product) => [
                product.name,
                ...(product.synonyms || []),
            ]),
        ))
            .map((value) => normalizeCatalogText(value))
            .filter(Boolean)
            .slice(0, 40);

        return {
            matchedProducts,
            matchedCategory,
            searchTerms,
            isBroadMatch: matchedProducts.length >= 6,
        };
    }

    async matchProductName(term: string): Promise<CatalogMatchResult> {
        const normalizedTerm = normalizeCatalogText(term);
        if (!normalizedTerm) {
            return { score: 0 };
        }

        const catalog = await this.loadCatalog();
        let bestMatch: CatalogMatchResult = { score: 0 };

        for (const product of catalog) {
            const normalizedName = normalizeCatalogText(product.name);
            if (normalizedName === normalizedTerm) {
                return { product, matchedBy: 'name', score: 1 };
            }

            if (fuzzyCatalogMatch(normalizedTerm, normalizedName)) {
                bestMatch = bestMatch.score >= 0.9 ? bestMatch : { product, matchedBy: 'name', score: 0.9 };
            }

            for (const synonym of product.synonyms || []) {
                const normalizedSynonym = normalizeCatalogText(synonym);
                if (normalizedSynonym === normalizedTerm) {
                    return { product, matchedBy: 'synonym', score: 0.95 };
                }
                if (fuzzyCatalogMatch(normalizedTerm, normalizedSynonym) && bestMatch.score < 0.8) {
                    bestMatch = { product, matchedBy: 'synonym', score: 0.8 };
                }
            }
        }

        return bestMatch;
    }

    async findMentionedBrand(term: string): Promise<string | undefined> {
        const normalizedTerm = normalizeCatalogText(term);
        if (!normalizedTerm) {
            return undefined;
        }

        const catalog = await this.loadCatalog();
        const brands = Array.from(new Map(
            catalog
                .filter((product) => product.brand)
                .map((product) => [normalizeCatalogText(product.brand || ''), product.brand || '']),
        ).entries())
            .filter(([normalizedBrand]) => normalizedBrand)
            .sort((a, b) => b[0].length - a[0].length);

        return brands.find(([normalizedBrand]) => normalizedTerm.includes(normalizedBrand))?.[1];
    }

    private resolveCategoryAlias(term: string): string | undefined {
        for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
            if (aliases.some((alias) => fuzzyCatalogMatch(term, alias))) {
                return category;
            }
        }

        return undefined;
    }

    /**
     * Enriquece semanticamente um nome de produto:
     * - Tenta match no catálogo (nome canônico + categoria + id)
     * - Fallback: inferência de categoria por CATEGORY_ALIASES
     *
     * Retorna os campos prontos para salvar em offer_queue.
     */
    async enrichProductSemantically(rawName: string): Promise<{
        normalizedName?: string;
        catalogProductId?: string;
        category?: string;
        semanticScore: number;
    }> {
        const match = await this.matchProductName(rawName);

        if (match.product && match.score >= 0.8) {
            return {
                normalizedName: match.product.name,
                catalogProductId: match.product.id,
                category: match.product.category || undefined,
                semanticScore: match.score,
            };
        }

        // Fallback: só inferir categoria pelo alias, sem nome canônico
        const normalizedTerm = normalizeCatalogText(rawName);
        const inferredCategory = this.resolveCategoryAlias(normalizedTerm);
        return {
            normalizedName: undefined,
            catalogProductId: undefined,
            category: inferredCategory,
            semanticScore: match.score,
        };
    }
}

export const productCatalogService = new ProductCatalogService();
