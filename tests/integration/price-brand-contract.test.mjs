import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// Mocking the normalization logic
function normalizeCatalogText(str) {
    return String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const BRAND_DICTIONARY = {
    'melita': 'Melitta',
    'melitta': 'Melitta',
    'pilao': 'Pilão',
    'pilão': 'Pilão',
    'nescafe': 'Nescafé',
    'nescafé': 'Nescafé',
    'tres coracoes': '3 Corações',
    'três corações': '3 Corações',
    '3 coracoes': '3 Corações',
    '3 corações': '3 Corações',
    'cafe do dia': 'Café do Dia',
    'café do dia': 'Café do Dia'
};

function detectSearchMode(term) {
    const normalizedTerm = normalizeCatalogText(term);
    if (!normalizedTerm) {
        return { mode: 'generic_product', productQuery: term, brand: null };
    }

    let detectedBrand = null;
    let detectedBrandKey = null;

    const sortedKeys = Object.keys(BRAND_DICTIONARY).sort((a, b) => b.length - a.length);

    for (const key of sortedKeys) {
        const normalizedKey = normalizeCatalogText(key);
        const pattern = new RegExp(`(?:^|\\s)${normalizedKey}(?:\\s|$)`);
        if (pattern.test(normalizedTerm)) {
            detectedBrand = BRAND_DICTIONARY[key];
            detectedBrandKey = normalizedKey;
            break;
        }
    }

    if (!detectedBrand || !detectedBrandKey) {
        return { mode: 'generic_product', productQuery: term, brand: null };
    }

    if (normalizedTerm === detectedBrandKey) {
        return { mode: 'brand_only', productQuery: null, brand: detectedBrand };
    }

    const productQueryStr = normalizedTerm
        .replace(new RegExp(`(?:^|\\s)${detectedBrandKey}(?:\\s|$)`), ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if (!productQueryStr) {
        return { mode: 'brand_only', productQuery: null, brand: detectedBrand };
    }

    return { mode: 'brand_specific', productQuery: productQueryStr, brand: detectedBrand };
}

describe('Price Brand Contract P1', () => {

    test('Consulta Genérica: café', () => {
        const result = detectSearchMode('café');
        assert.equal(result.mode, 'generic_product');
        assert.equal(result.productQuery, 'café');
        assert.equal(result.brand, null);
    });

    test('Consulta Específica: café Melitta', () => {
        const result = detectSearchMode('café Melitta');
        assert.equal(result.mode, 'brand_specific');
        assert.equal(result.productQuery, 'cafe'); // normalized 
        assert.equal(result.brand, 'Melitta');
    });

    test('Consulta Específica com Typo: café Melita', () => {
        const result = detectSearchMode('café Melita');
        assert.equal(result.mode, 'brand_specific');
        assert.equal(result.productQuery, 'cafe');
        assert.equal(result.brand, 'Melitta'); // Deve ser normalizado
    });

    test('Consulta Só Marca: quanto tá o Melitta?', () => {
        const result = detectSearchMode('quanto tá o Melitta?');
        assert.equal(result.mode, 'brand_specific');
        assert.equal(result.productQuery, 'quanto ta o');
        assert.equal(result.brand, 'Melitta');
    });

    test('Consulta Só Marca: melita', () => {
        const result = detectSearchMode('melita');
        assert.equal(result.mode, 'brand_only');
        assert.equal(result.productQuery, null);
        assert.equal(result.brand, 'Melitta');
    });

    test('Não mistura marcas (pilão não é melitta)', () => {
        const result = detectSearchMode('preço do café Pilão');
        assert.equal(result.mode, 'brand_specific');
        assert.equal(result.brand, 'Pilão');
    });
});
