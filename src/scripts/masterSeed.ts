// ═══════════════════════════════════════════════
// MASTER SEED — Popula TODO o banco de uma vez
// npx tsx src/scripts/masterSeed.ts
// ═══════════════════════════════════════════════

import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyDVW8oK9luHCFZhRl28XjcoZlDgeVA2y0Y",
    authDomain: "geofertas-325b0.firebaseapp.com",
    projectId: "geofertas-325b0",
    storageBucket: "geofertas-325b0.firebasestorage.app",
    messagingSenderId: "333137067503",
    appId: "1:333137067503:web:f2ad402d55e33a0c60ca1a"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const NOW = new Date().toISOString();
const EXPIRES = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 dias

// ═══════ REDES ═══════
const NETWORKS = [
    { id: 'atacadao', name: 'Atacadão', type: 'atacado' },
    { id: 'extrabom', name: 'Extrabom', type: 'varejo' },
    { id: 'assai', name: 'Assaí', type: 'atacado' },
    { id: 'carone', name: 'Carone', type: 'varejo' },
    { id: 'casagrande', name: 'Casagrande', type: 'varejo' },
    { id: 'rede-show', name: 'Rede Show', type: 'varejo' },
    { id: 'multishow', name: 'MultiShow', type: 'varejo' },
    { id: 'bh', name: 'BH Supermercados', type: 'varejo' },
];

// ═══════ MERCADOS (com geolocalização real da Grande Vitória) ═══════
const MARKETS = [
    // Atacadão
    { id: 'atacadao-camburi', name: 'Atacadão Camburi', networkId: 'atacadao', address: 'Av. Dante Michelini, Jardim Camburi, Vitória', location: { lat: -20.2655, lng: -40.2680 } },
    { id: 'atacadao-vila-velha', name: 'Atacadão Vila Velha', networkId: 'atacadao', address: 'Rod. do Sol, Vila Velha', location: { lat: -20.3650, lng: -40.3100 } },
    { id: 'atacadao-cariacica', name: 'Atacadão Cariacica', networkId: 'atacadao', address: 'Rod. BR-101, Campo Grande, Cariacica', location: { lat: -20.3350, lng: -40.3700 } },
    // Extrabom
    { id: 'extrabom-praia-campista', name: 'Extrabom Praia de Campista', networkId: 'extrabom', address: 'R. João da Cruz, Praia de Campista, Vila Velha', location: { lat: -20.3200, lng: -40.2900 } },
    { id: 'extrabom-jardim-camburi', name: 'Extrabom Jardim Camburi', networkId: 'extrabom', address: 'Av. Dante Michelini, Jardim Camburi, Vitória', location: { lat: -20.2670, lng: -40.2660 } },
    { id: 'extrabom-itaparica', name: 'Extrabom Itaparica', networkId: 'extrabom', address: 'Av. Saturnino de Brito, Itaparica, Vila Velha', location: { lat: -20.3700, lng: -40.3200 } },
    // Assaí
    { id: 'assai-camburi', name: 'Assaí Atacadista Camburi', networkId: 'assai', address: 'Av. Fernando Ferrari, Jardim Camburi, Vitória', location: { lat: -20.2700, lng: -40.2700 } },
    { id: 'assai-laranjeiras', name: 'Assaí Atacadista Laranjeiras', networkId: 'assai', address: 'Av. Carlos Lindenberg, Serra', location: { lat: -20.2100, lng: -40.2800 } },
    // Carone
    { id: 'carone-praia-costa', name: 'Carone Praia da Costa', networkId: 'carone', address: 'Av. Champagnat, Praia da Costa, Vila Velha', location: { lat: -20.3350, lng: -40.2950 } },
    { id: 'carone-jardim-camburi', name: 'Carone Jardim Camburi', networkId: 'carone', address: 'R. Natal, Jardim Camburi, Vitória', location: { lat: -20.2680, lng: -40.2690 } },
    { id: 'carone-vitoria', name: 'Carone Centro Vitória', networkId: 'carone', address: 'Av. Princesa Isabel, Centro, Vitória', location: { lat: -20.3190, lng: -40.3380 } },
    // Casagrande
    { id: 'casagrande-serra', name: 'Casagrande Serra', networkId: 'casagrande', address: 'Serra Sede, Serra', location: { lat: -20.1280, lng: -40.3080 } },
    // Rede Show
    { id: 'rede-show-cariacica', name: 'Rede Show Cariacica', networkId: 'rede-show', address: 'Itacibá, Cariacica', location: { lat: -20.3400, lng: -40.4100 } },
    // MultiShow
    { id: 'multishow-vila-velha', name: 'MultiShow Vila Velha', networkId: 'multishow', address: 'Av. Jerônimo Monteiro, Vila Velha', location: { lat: -20.3450, lng: -40.2900 } },
    // BH
    { id: 'bh-camburi', name: 'BH Supermercados Camburi', networkId: 'bh', address: 'Jardim Camburi, Vitória', location: { lat: -20.2620, lng: -40.2650 } },
];

// ═══════ CAMPANHAS ═══════
const CAMPAIGNS = [
    { id: 'atacadao-semanal', networkId: 'atacadao', name: 'Ofertas da Semana Atacadão', startsAt: NOW, expiresAt: EXPIRES, active: true },
    { id: 'extrabom-semanal', networkId: 'extrabom', name: 'Ofertas Extrabom', startsAt: NOW, expiresAt: EXPIRES, active: true },
    { id: 'assai-semanal', networkId: 'assai', name: 'Mega Ofertas Assaí', startsAt: NOW, expiresAt: EXPIRES, active: true },
    { id: 'carone-semanal', networkId: 'carone', name: 'Promoções Carone', startsAt: NOW, expiresAt: EXPIRES, active: true },
    { id: 'casagrande-semanal', networkId: 'casagrande', name: 'Ofertas Casagrande', startsAt: NOW, expiresAt: EXPIRES, active: true },
];

// ═══════ PRODUTOS BASE (catálogo) ═══════
const PRODUCTS = [
    { id: 'arroz-tio-joao-5kg', name: 'Arroz Tio João 5kg', category: 'grãos', synonyms: ['arroz', 'arroz branco', 'tio joao'] },
    { id: 'feijao-carioca-camil-1kg', name: 'Feijão Carioca Camil 1kg', category: 'grãos', synonyms: ['feijão', 'feijao', 'feijoada', 'carioca'] },
    { id: 'oleo-soja-soya-900ml', name: 'Óleo de Soja Soya 900ml', category: 'óleos', synonyms: ['óleo', 'oleo', 'soja', 'oleo de soja'] },
    { id: 'cafe-pilao-500g', name: 'Café Pilão 500g', category: 'bebidas', synonyms: ['café', 'cafe', 'pilão', 'pilao'] },
    { id: 'acucar-uniao-1kg', name: 'Açúcar União 1kg', category: 'básicos', synonyms: ['açúcar', 'acucar', 'união', 'uniao'] },
    { id: 'leite-piracanjuba-1l', name: 'Leite Integral Piracanjuba 1L', category: 'laticínios', synonyms: ['leite', 'leite integral', 'piracanjuba'] },
    { id: 'macarrao-barilla-500g', name: 'Macarrão Barilla 500g', category: 'massas', synonyms: ['macarrão', 'macarrao', 'espaguete', 'massa'] },
    { id: 'molho-tomate-heinz-340g', name: 'Molho de Tomate Heinz 340g', category: 'molhos', synonyms: ['molho', 'molho de tomate', 'extrato'] },
    { id: 'frango-congelado-kg', name: 'Frango Congelado (kg)', category: 'carnes', synonyms: ['frango', 'peito de frango', 'coxa'] },
    { id: 'carne-bovina-acem-kg', name: 'Carne Bovina Acém (kg)', category: 'carnes', synonyms: ['carne', 'acém', 'acem', 'boi'] },
    { id: 'linguica-sadia-500g', name: 'Linguiça Sadia 500g', category: 'carnes', synonyms: ['linguiça', 'linguica', 'sadia'] },
    { id: 'sabao-po-omo-1kg', name: 'Sabão em Pó OMO 1kg', category: 'limpeza', synonyms: ['sabão', 'sabao', 'omo', 'sabão em pó'] },
    { id: 'detergente-ype-500ml', name: 'Detergente Ypê 500ml', category: 'limpeza', synonyms: ['detergente', 'ype', 'lava louça'] },
    { id: 'papel-higienico-neve-12', name: 'Papel Higiênico Neve 12un', category: 'higiene', synonyms: ['papel higiênico', 'papel higienico', 'neve'] },
    { id: 'cerveja-brahma-lata-350ml', name: 'Cerveja Brahma Lata 350ml', category: 'bebidas', synonyms: ['cerveja', 'brahma', 'latinha'] },
    { id: 'refrigerante-coca-2l', name: 'Coca-Cola 2L', category: 'bebidas', synonyms: ['coca', 'coca-cola', 'refrigerante'] },
    { id: 'margarina-qualy-500g', name: 'Margarina Qualy 500g', category: 'laticínios', synonyms: ['margarina', 'qualy', 'manteiga'] },
    { id: 'farinha-trigo-dona-benta-1kg', name: 'Farinha de Trigo Dona Benta 1kg', category: 'básicos', synonyms: ['farinha', 'farinha de trigo', 'dona benta'] },
    { id: 'sal-cisne-1kg', name: 'Sal Cisne 1kg', category: 'básicos', synonyms: ['sal', 'cisne'] },
    { id: 'banana-prata-kg', name: 'Banana Prata (kg)', category: 'hortifrúti', synonyms: ['banana', 'banana prata'] },
    { id: 'tomate-kg', name: 'Tomate (kg)', category: 'hortifrúti', synonyms: ['tomate'] },
    { id: 'cebola-kg', name: 'Cebola (kg)', category: 'hortifrúti', synonyms: ['cebola'] },
    { id: 'batata-kg', name: 'Batata (kg)', category: 'hortifrúti', synonyms: ['batata'] },
    { id: 'alface-unidade', name: 'Alface (unidade)', category: 'hortifrúti', synonyms: ['alface'] },
    { id: 'ovos-dz', name: 'Ovos (dúzia)', category: 'básicos', synonyms: ['ovos', 'ovo', 'dúzia de ovos'] },
];

// ═══════ OFERTAS POR REDE (preços realistas ES) ═══════
interface OfferData {
    productId: string;
    productName: string;
    price: number;
    promoPrice?: number;
    marketId: string;
    marketName: string;
    networkName: string;
    category: string;
    isActive: boolean;
    startsAt: string;
    expiresAt: string;
}

function makeOffers(): OfferData[] {
    const offers: OfferData[] = [];

    // Tabela de preços por rede (realistas)
    const priceTable: Record<string, Record<string, number>> = {
        'atacadao': {
            'arroz-tio-joao-5kg': 24.99, 'feijao-carioca-camil-1kg': 7.49, 'oleo-soja-soya-900ml': 5.99,
            'cafe-pilao-500g': 16.90, 'acucar-uniao-1kg': 4.99, 'leite-piracanjuba-1l': 5.49,
            'macarrao-barilla-500g': 5.99, 'molho-tomate-heinz-340g': 4.29, 'frango-congelado-kg': 12.99,
            'carne-bovina-acem-kg': 32.90, 'linguica-sadia-500g': 14.90, 'sabao-po-omo-1kg': 15.90,
            'detergente-ype-500ml': 2.49, 'papel-higienico-neve-12': 16.90, 'cerveja-brahma-lata-350ml': 3.29,
            'refrigerante-coca-2l': 8.99, 'margarina-qualy-500g': 6.49, 'farinha-trigo-dona-benta-1kg': 5.99,
            'sal-cisne-1kg': 2.99, 'banana-prata-kg': 4.99, 'tomate-kg': 7.99,
            'cebola-kg': 4.49, 'batata-kg': 5.99, 'alface-unidade': 2.99, 'ovos-dz': 12.99
        },
        'extrabom': {
            'arroz-tio-joao-5kg': 26.90, 'feijao-carioca-camil-1kg': 7.99, 'oleo-soja-soya-900ml': 6.49,
            'cafe-pilao-500g': 17.90, 'acucar-uniao-1kg': 5.29, 'leite-piracanjuba-1l': 5.89,
            'macarrao-barilla-500g': 6.49, 'molho-tomate-heinz-340g': 4.99, 'frango-congelado-kg': 13.99,
            'carne-bovina-acem-kg': 34.90, 'linguica-sadia-500g': 15.90, 'sabao-po-omo-1kg': 17.49,
            'detergente-ype-500ml': 2.79, 'papel-higienico-neve-12': 18.90, 'cerveja-brahma-lata-350ml': 3.49,
            'refrigerante-coca-2l': 9.49, 'margarina-qualy-500g': 6.99, 'farinha-trigo-dona-benta-1kg': 6.49,
            'sal-cisne-1kg': 3.29, 'banana-prata-kg': 5.49, 'tomate-kg': 8.99,
            'cebola-kg': 4.99, 'batata-kg': 6.49, 'alface-unidade': 3.49, 'ovos-dz': 13.99
        },
        'assai': {
            'arroz-tio-joao-5kg': 23.99, 'feijao-carioca-camil-1kg': 6.99, 'oleo-soja-soya-900ml': 5.79,
            'cafe-pilao-500g': 15.90, 'acucar-uniao-1kg': 4.59, 'leite-piracanjuba-1l': 5.29,
            'macarrao-barilla-500g': 5.49, 'molho-tomate-heinz-340g': 3.99, 'frango-congelado-kg': 11.99,
            'carne-bovina-acem-kg': 31.90, 'linguica-sadia-500g': 13.90, 'sabao-po-omo-1kg': 14.90,
            'detergente-ype-500ml': 2.29, 'papel-higienico-neve-12': 15.90, 'cerveja-brahma-lata-350ml': 2.99,
            'refrigerante-coca-2l': 8.49, 'margarina-qualy-500g': 5.99, 'farinha-trigo-dona-benta-1kg': 5.49,
            'sal-cisne-1kg': 2.79, 'banana-prata-kg': 4.49, 'tomate-kg': 6.99,
            'cebola-kg': 3.99, 'batata-kg': 5.49, 'alface-unidade': 2.49, 'ovos-dz': 11.99
        },
        'carone': {
            'arroz-tio-joao-5kg': 27.90, 'feijao-carioca-camil-1kg': 8.49, 'oleo-soja-soya-900ml': 6.99,
            'cafe-pilao-500g': 18.90, 'acucar-uniao-1kg': 5.49, 'leite-piracanjuba-1l': 6.29,
            'macarrao-barilla-500g': 6.99, 'molho-tomate-heinz-340g': 5.29, 'frango-congelado-kg': 14.99,
            'carne-bovina-acem-kg': 36.90, 'linguica-sadia-500g': 16.90, 'sabao-po-omo-1kg': 18.49,
            'detergente-ype-500ml': 2.99, 'papel-higienico-neve-12': 19.90, 'cerveja-brahma-lata-350ml': 3.79,
            'refrigerante-coca-2l': 9.99, 'margarina-qualy-500g': 7.49, 'farinha-trigo-dona-benta-1kg': 6.99,
            'sal-cisne-1kg': 3.49, 'banana-prata-kg': 5.99, 'tomate-kg': 9.49,
            'cebola-kg': 5.49, 'batata-kg': 6.99, 'alface-unidade': 3.99, 'ovos-dz': 14.49
        },
        'casagrande': {
            'arroz-tio-joao-5kg': 25.90, 'feijao-carioca-camil-1kg': 7.29, 'oleo-soja-soya-900ml': 6.19,
            'cafe-pilao-500g': 16.49, 'acucar-uniao-1kg': 4.79, 'leite-piracanjuba-1l': 5.59,
            'macarrao-barilla-500g': 5.79, 'molho-tomate-heinz-340g': 4.49, 'frango-congelado-kg': 13.49,
            'carne-bovina-acem-kg': 33.90, 'linguica-sadia-500g': 15.29, 'sabao-po-omo-1kg': 16.90,
            'detergente-ype-500ml': 2.59, 'papel-higienico-neve-12': 17.90, 'cerveja-brahma-lata-350ml': 3.39,
            'refrigerante-coca-2l': 8.79, 'margarina-qualy-500g': 6.29, 'farinha-trigo-dona-benta-1kg': 5.79,
            'sal-cisne-1kg': 2.89, 'banana-prata-kg': 4.79, 'tomate-kg': 7.49,
            'cebola-kg': 4.29, 'batata-kg': 5.79, 'alface-unidade': 2.79, 'ovos-dz': 12.49
        },
        'rede-show': {
            'arroz-tio-joao-5kg': 27.49, 'feijao-carioca-camil-1kg': 8.29, 'oleo-soja-soya-900ml': 6.79,
            'cafe-pilao-500g': 18.49, 'acucar-uniao-1kg': 5.39, 'leite-piracanjuba-1l': 6.19,
            'frango-congelado-kg': 14.49, 'carne-bovina-acem-kg': 35.90,
            'cerveja-brahma-lata-350ml': 3.59, 'refrigerante-coca-2l': 9.79, 'ovos-dz': 13.49
        },
        'multishow': {
            'arroz-tio-joao-5kg': 26.50, 'feijao-carioca-camil-1kg': 7.79, 'oleo-soja-soya-900ml': 6.29,
            'cafe-pilao-500g': 17.29, 'acucar-uniao-1kg': 5.09, 'leite-piracanjuba-1l': 5.69,
            'frango-congelado-kg': 13.29, 'carne-bovina-acem-kg': 34.50,
            'cerveja-brahma-lata-350ml': 3.19, 'refrigerante-coca-2l': 9.29, 'ovos-dz': 12.99
        },
        'bh': {
            'arroz-tio-joao-5kg': 25.49, 'feijao-carioca-camil-1kg': 7.19, 'oleo-soja-soya-900ml': 5.89,
            'cafe-pilao-500g': 16.29, 'acucar-uniao-1kg': 4.69, 'leite-piracanjuba-1l': 5.39,
            'macarrao-barilla-500g': 5.69, 'molho-tomate-heinz-340g': 4.19, 'frango-congelado-kg': 12.49,
            'carne-bovina-acem-kg': 32.49, 'linguica-sadia-500g': 14.49, 'sabao-po-omo-1kg': 15.49,
            'detergente-ype-500ml': 2.39, 'papel-higienico-neve-12': 16.49, 'cerveja-brahma-lata-350ml': 3.09,
            'refrigerante-coca-2l': 8.69, 'margarina-qualy-500g': 6.19, 'farinha-trigo-dona-benta-1kg': 5.59,
            'sal-cisne-1kg': 2.69, 'banana-prata-kg': 4.69, 'tomate-kg': 7.29,
            'cebola-kg': 4.19, 'batata-kg': 5.69, 'alface-unidade': 2.69, 'ovos-dz': 12.29
        },
    };

    // Mapear marketId por rede
    const marketByNetwork: Record<string, string[]> = {};
    for (const m of MARKETS) {
        if (!marketByNetwork[m.networkId]) marketByNetwork[m.networkId] = [];
        marketByNetwork[m.networkId].push(m.id);
    }

    for (const [networkId, prices] of Object.entries(priceTable)) {
        const network = NETWORKS.find(n => n.id === networkId);
        const networkMarkets = marketByNetwork[networkId] || [];
        const mainMarketId = networkMarkets[0] || networkId;

        for (const [productId, price] of Object.entries(prices)) {
            const product = PRODUCTS.find(p => p.id === productId);
            if (!product) continue;

            offers.push({
                productId,
                productName: product.name,
                price,
                marketId: mainMarketId,
                marketName: network?.name || networkId,
                networkName: network?.name || networkId,
                category: product.category,
                isActive: true,
                startsAt: NOW,
                expiresAt: EXPIRES,
            });
        }
    }

    return offers;
}

// ═══════ EXECUÇÃO ═══════

async function seed() {
    console.log('🚀 MASTER SEED — Economiza Fácil');
    console.log('═'.repeat(50));

    const offers = makeOffers();
    let totalWritten = 0;

    // Firestore batch tem limite de 500 writes
    const BATCH_SIZE = 450;

    // ─── 1. Redes ───
    console.log(`\n📡 Seeding ${NETWORKS.length} redes...`);
    let batch = writeBatch(db);
    for (const net of NETWORKS) {
        batch.set(doc(db, 'networks', net.id), net);
    }
    await batch.commit();
    totalWritten += NETWORKS.length;
    console.log(`   ✅ ${NETWORKS.length} redes gravadas.`);

    // ─── 2. Mercados ───
    console.log(`\n🏪 Seeding ${MARKETS.length} mercados...`);
    batch = writeBatch(db);
    for (const mkt of MARKETS) {
        batch.set(doc(db, 'markets', mkt.id), mkt);
    }
    await batch.commit();
    totalWritten += MARKETS.length;
    console.log(`   ✅ ${MARKETS.length} mercados com geolocalização.`);

    // ─── 3. Campanhas ───
    console.log(`\n📅 Seeding ${CAMPAIGNS.length} campanhas...`);
    batch = writeBatch(db);
    for (const camp of CAMPAIGNS) {
        batch.set(doc(db, 'campaigns', camp.id), camp);
    }
    await batch.commit();
    totalWritten += CAMPAIGNS.length;
    console.log(`   ✅ ${CAMPAIGNS.length} campanhas ativas.`);

    // ─── 4. Produtos (catálogo) ───
    console.log(`\n📦 Seeding ${PRODUCTS.length} produtos no catálogo...`);
    batch = writeBatch(db);
    for (const prod of PRODUCTS) {
        batch.set(doc(db, 'products', prod.id), prod);
    }
    await batch.commit();
    totalWritten += PRODUCTS.length;
    console.log(`   ✅ ${PRODUCTS.length} produtos com sinônimos.`);

    // ─── 5. Ofertas ───
    console.log(`\n💰 Seeding ${offers.length} ofertas...`);
    for (let i = 0; i < offers.length; i += BATCH_SIZE) {
        batch = writeBatch(db);
        const chunk = offers.slice(i, i + BATCH_SIZE);
        for (const offer of chunk) {
            const offerId = `${offer.networkName.toLowerCase().replace(/\s+/g, '-')}_${offer.productId}`;
            batch.set(doc(db, 'offers', offerId), offer);
        }
        await batch.commit();
        console.log(`   ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${chunk.length} ofertas.`);
    }
    totalWritten += offers.length;

    // ─── RESUMO ───
    console.log('\n' + '═'.repeat(50));
    console.log('🎯 SEED COMPLETO!');
    console.log(`   📡 Redes:     ${NETWORKS.length}`);
    console.log(`   🏪 Mercados:  ${MARKETS.length}`);
    console.log(`   📅 Campanhas: ${CAMPAIGNS.length}`);
    console.log(`   📦 Produtos:  ${PRODUCTS.length}`);
    console.log(`   💰 Ofertas:   ${offers.length}`);
    console.log(`   📊 Total:     ${totalWritten} registros`);
    console.log('═'.repeat(50));

    // Listar ofertas por rede
    const byNetwork: Record<string, number> = {};
    for (const o of offers) {
        byNetwork[o.networkName] = (byNetwork[o.networkName] || 0) + 1;
    }
    console.log('\n📊 Ofertas por rede:');
    for (const [name, count] of Object.entries(byNetwork)) {
        console.log(`   ${name}: ${count} ofertas`);
    }

    process.exit(0);
}

seed().catch(err => {
    console.error('❌ Erro no seed:', err);
    process.exit(1);
});
