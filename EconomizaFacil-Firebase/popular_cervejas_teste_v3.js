/**
 * popular_cervejas_teste_v3.js
 * Distribui cada marca em mercados DIFERENTES para testar comparação real
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'geofertas-325b0'
});

const db = admin.firestore();

async function popularCervejas() {
  console.log('🍺 Iniciando popular cervejas v3...\n');

  const marketsSnap = await db.collection('markets').limit(15).get();
  const mercados = [];
  marketsSnap.forEach(doc => {
    const d = doc.data();
    mercados.push({
      id:      doc.id,
      name:    d.name || d.marketName || 'Mercado',
      address: d.address || d.marketAddress || '',
      lat:     d.lat || d.marketLat || null,
      lng:     d.lng || d.marketLng || null,
    });
  });

  console.log(`📦 ${mercados.length} mercados encontrados.\n`);

  // Cada cerveja vai para 3 mercados DIFERENTES (rotacionando)
  const cervejas = [
    { nome: 'Crystal Lata 350ml',       sinonimos: ['crystal', 'cerveja crystal'],                    precoBase: 2.39, mercadoOffset: 0 },
    { nome: 'Itaipava Lata 350ml',       sinonimos: ['itaipava', 'cerveja itaipava'],                  precoBase: 2.49, mercadoOffset: 1 },
    { nome: 'Skol Lata 350ml',           sinonimos: ['skol', 'skol lata', 'cerveja skol'],             precoBase: 2.89, mercadoOffset: 2 },
    { nome: 'Brahma Lata 350ml',         sinonimos: ['brahma', 'brahma lata', 'cerveja brahma'],       precoBase: 2.99, mercadoOffset: 3 },
    { nome: 'Amstel Lata 350ml',         sinonimos: ['amstel', 'amstel lata', 'cerveja amstel'],       precoBase: 3.29, mercadoOffset: 4 },
    { nome: 'Bohemia Lata 350ml',        sinonimos: ['bohemia', 'cerveja bohemia'],                    precoBase: 3.59, mercadoOffset: 5 },
    { nome: 'Budweiser Lata 350ml',      sinonimos: ['budweiser', 'bud', 'cerveja budweiser'],         precoBase: 3.99, mercadoOffset: 6 },
    { nome: 'Spaten Lata 350ml',         sinonimos: ['spaten', 'cerveja spaten'],                      precoBase: 4.29, mercadoOffset: 7 },
    { nome: 'Heineken Lata 350ml',       sinonimos: ['heineken', 'heineken lata', 'cerveja heineken'], precoBase: 4.49, mercadoOffset: 0 },
    { nome: 'Stella Artois Lata 350ml',  sinonimos: ['stella', 'stella artois', 'cerveja stella'],     precoBase: 4.79, mercadoOffset: 1 },
    { nome: 'Corona Extra Long Neck',    sinonimos: ['corona', 'cerveja corona'],                      precoBase: 6.99, mercadoOffset: 2 },
  ];

  const validade = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const batch = db.batch();
  let count = 0;

  for (const cerveja of cervejas) {
    // Pega 3 mercados começando do offset — garante mercados diferentes por marca
    for (let i = 0; i < 3; i++) {
      const idx     = (cerveja.mercadoOffset + i) % mercados.length;
      const mercado = mercados[idx];
      const preco   = parseFloat((cerveja.precoBase + i * 0.20).toFixed(2));

      const docRef = db.collection('ofertas_v2').doc();
      batch.set(docRef, {
        nome:                  cerveja.nome,
        'sinônimos':           cerveja.sinonimos,
        categoria:             'bebidas',
        'preço':               preco,
        unidade:               'unidade',
        'ID do mercado':       mercado.id,
        'nome do mercado':     mercado.name,
        'endereço de mercado': mercado.address,
        mercadoLat:            mercado.lat,
        mercadoLng:            mercado.lng,
        nome_da_rede:          '',
        ativo:                 true,
        source:                'teste',
        criadoEm:              admin.firestore.FieldValue.serverTimestamp(),
        expiraEm:              validade.toISOString(),
      });

      count++;
      console.log(`   ✅ ${cerveja.nome} — R$ ${preco.toFixed(2).replace('.', ',')} → ${mercado.name}`);
    }
  }

  await batch.commit();

  console.log('\n═══════════════════════════════════════');
  console.log('✅ Cervejas criadas com mercados variados!');
  console.log(`   Total: ${count} ofertas | ${cervejas.length} marcas`);
  console.log('═══════════════════════════════════════\n');
  console.log('🎯 Teste agora:');
  console.log('   "cerveja"   → ~11 marcas em mercados diferentes');
  console.log('   "brahma"    → Brahma em 3 mercados diferentes');
  console.log('   "heineken"  → Heineken em 3 mercados diferentes\n');
}

popularCervejas().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
