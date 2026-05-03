import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Mocking helper functions from ChatService.ts
 */
function capitalize(value) {
    const text = String(value || '').trim();
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatPreferenceLabel(preference) {
    if (preference === 'economizar') return 'Economizar';
    if (preference === 'perto') return 'Mercado mais perto';
    return 'Equilibrar preço e distância';
}

/**
 * Simplified logic from ChatService.ts handleShowUserProfile
 */
async function generateProfileResponse(prefs, richContext) {
    // 1. Localização
    let locationStr = 'ainda não informado';
    if (prefs.neighborhood) {
        if (prefs.locationDeclaredAt) {
            locationStr = `Localização aproximada salva: ${capitalize(prefs.neighborhood)}`;
        } else {
            locationStr = `Tenho uma localização salva anteriormente: ${capitalize(prefs.neighborhood)}. Quer atualizar?`;
        }
    }

    // 2. Transporte
    const transportStr = prefs.transportMode 
        ? capitalize(String(prefs.transportMode)) 
        : 'ainda não informado';

    // 3. Consumo
    const consumptionStr = prefs.consumption 
        ? `${prefs.consumption} km/l` 
        : 'ainda não informado';

    // 4. Preferência
    const preferenceStr = prefs.optimizationPreference 
        ? formatPreferenceLabel(prefs.optimizationPreference) 
        : 'ainda não informada';

    // 5. Inferências (Produtos e Mercados)
    const productsStr = richContext.frequentProducts.length > 0
        ? richContext.frequentProducts.slice(0, 5).map(p => capitalize(p)).join(', ')
        : 'ainda estou aprendendo';
    
    const marketsStr = richContext.favoriteMarkets.length > 0
        ? richContext.favoriteMarkets.join(', ')
        : 'ainda estou aprendendo';

    return `O que tenho salvo sobre você:\n\n` +
           `📍 Localização: ${locationStr}\n` +
           `🚗 Transporte: ${transportStr}\n` +
           `⛽ Consumo do carro: ${consumptionStr}\n` +
           `💚 Preferência: ${preferenceStr}\n\n` +
           `Pelo seu uso:\n` +
           `🛒 Produtos frequentes: ${productsStr}\n` +
           `🏪 Mercados frequentes: ${marketsStr}\n\n` +
           `Quer atualizar localização, transporte ou preferência?`;
}

function normalizeText(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

const asksForProfileRegex = /\b(o que (voce|vc) sabe sobre mim|o que sabe sobre mim|o que lembra de mim|me fala meu historico|meu perfil|meu historico|me fala meu historico)\b/;

describe('Profile Trusted Contract', () => {
    test('Usuário sem perfil: não mostra defaults perigosos (carro 10km/l)', async () => {
        const prefs = {};
        const richContext = { favoriteMarkets: [], frequentProducts: [] };
        const response = await generateProfileResponse(prefs, richContext);
        
        assert.ok(response.includes('📍 Localização: ainda não informado'));
        assert.ok(response.includes('🚗 Transporte: ainda não informado'));
        assert.ok(response.includes('⛽ Consumo do carro: ainda não informado'));
        assert.ok(response.includes('💚 Preferência: ainda não informada'));
        
        // Verifica que defaults antigos não vazaram
        assert.strictEqual(response.includes('Carro (10 km/l)'), false);
    });

    test('Usuário com bairro sem timestamp: mostra localização salva anteriormente', async () => {
        const prefs = { neighborhood: 'praia da costa' };
        const richContext = { favoriteMarkets: [], frequentProducts: [] };
        const response = await generateProfileResponse(prefs, richContext);
        
        assert.ok(response.includes('Tenho uma localização salva anteriormente: Praia da costa'));
    });

    test('Usuário com localização confirmada (timestamp): mostra localização aproximada salva', async () => {
        const prefs = { neighborhood: 'mata da praia', locationDeclaredAt: new Date() };
        const richContext = { favoriteMarkets: [], frequentProducts: [] };
        const response = await generateProfileResponse(prefs, richContext);
        
        assert.ok(response.includes('Localização aproximada salva: Mata da praia'));
    });

    test('Usuário com transporte e consumo confirmados: mostra valores', async () => {
        const prefs = { transportMode: 'carro', consumption: 12.5 };
        const richContext = { favoriteMarkets: [], frequentProducts: [] };
        const response = await generateProfileResponse(prefs, richContext);
        
        assert.ok(response.includes('🚗 Transporte: Carro'));
        assert.ok(response.includes('⛽ Consumo do carro: 12.5 km/l'));
    });

    test('Usuário com preferência confirmada: mostra label correto', async () => {
        const prefs = { optimizationPreference: 'economizar' };
        const richContext = { favoriteMarkets: [], frequentProducts: [] };
        const response = await generateProfileResponse(prefs, richContext);
        
        assert.ok(response.includes('💚 Preferência: Economizar'));
    });

    test('Inferências: mostra mercados e produtos frequentes baseados no histórico', async () => {
        const prefs = {};
        const richContext = { 
            favoriteMarkets: ['Atacadão', 'Carone'], 
            frequentProducts: ['arroz', 'feijão', 'café'] 
        };
        const response = await generateProfileResponse(prefs, richContext);
        
        assert.ok(response.includes('🛒 Produtos frequentes: Arroz, Feijão, Café'));
        assert.ok(response.includes('🏪 Mercados frequentes: Atacadão, Carone'));
    });

    test('Ativação do perfil: verifica regex de frases', () => {
        assert.ok(asksForProfileRegex.test(normalizeText('o que você sabe sobre mim?')));
        assert.ok(asksForProfileRegex.test(normalizeText('o que sabe sobre mim')));
        assert.ok(asksForProfileRegex.test(normalizeText('o que vc sabe sobre mim')));
        assert.ok(asksForProfileRegex.test(normalizeText('meu histórico')));
        assert.ok(asksForProfileRegex.test(normalizeText('me fala meu historico')));
        assert.ok(asksForProfileRegex.test(normalizeText('o que lembra de mim')));
        assert.ok(asksForProfileRegex.test(normalizeText('meu perfil')));
    });

    test('InteractionCount: não deve aparecer na resposta pública', async () => {
        const prefs = {};
        const richContext = { favoriteMarkets: [], frequentProducts: [] };
        const response = await generateProfileResponse(prefs, richContext);
        
        assert.strictEqual(response.includes('interações'), false);
        assert.strictEqual(response.includes('373'), false);
    });
});
