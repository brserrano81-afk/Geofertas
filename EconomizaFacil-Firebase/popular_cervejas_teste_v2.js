/**
 * popular_cervejas_teste_v2.js
 * 
 * CORRIGIDO: insere na coleção 'ofertas_v2' com campos em português
 * iguais aos que já existem no Firestore.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'geofertas-325b0'
});

const db = admin.firestore();

async function popularCervejas() {
  console.log('🍺 Iniciando popular cervejas de teste v2...\n');

  // Buscar mercados existentes
  const marketsSnap = await db.collection('markets').limit(10).get();
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

  if (mercados.length === 0) {
    console.error('❌ Nenhum mercado encontrado!');
    process.exit(1);
  }

  // 10 marcas de cerveja
  const cervejas = [
    { nome: 'Skol Lata 350ml',           sinonimos: ['skol', 'skol lata', 'cerveja skol'],             precoBase: 2.89 },
    { nome: 'Heineken Lata 350ml',        sinonimos: ['heineken', 'heineken lata', 'cerveja heineken'], precoBase: 4.49 },
    { nome: 'Amstel Lata 350ml',          sinonimos: ['amstel', 'amstel lata', 'cerveja amstel'],       precoBase: 3.29 },
    { nome: 'Itaipava Lata 350ml',        sinonimos: ['itaipava', 'cerveja itaipava'],                  precoBase: 2.49 },
    { nome: 'Crystal Lata 350ml',         sinonimos: ['crystal', 'cerveja crystal'],                    precoBase: 2.39 },
    { nome: 'Budweiser Lata 350ml',       sinonimos: ['budweiser', 'bud', 'cerveja budweiser'],         precoBase: 3.99 },
    { nome: 'Stella Artois Lata 350ml',   sinonimos: ['stella', 'stella artois', 'cerveja stella'],     precoBase: 4.79 },
    { nome: 'Corona Extra Long Neck',     sinonimos: ['corona', 'cerveja corona'],                      precoBase: 6.99 },
    { nome: 'Bohemia Lata 350ml',         sinonimos: ['bohemia', 'cerveja bohemia'],                    precoBase: 3.59 },
    { nome: 'Spaten Lata 350ml',          sinonimos: ['spaten', 'cerveja spaten'],                      precoBase: 4.29 },
  ];

  const validade = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const batch = db.batch();
  let count = 0;

  for (const cerveja of cervejas) {
    const mercadosEscolhidos = mercados.slice(0, Math.min(3, mercados.length));

    for (let i = 0; i < mercadosEscolhidos.length; i++) {
      const mercado = mercadosEscolhidos[i];
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
  console.log('✅ Cervejas criadas na ofertas_v2!');
  console.log(`   Total: ${count} ofertas | ${cervejas.length} marcas`);
  console.log('═══════════════════════════════════════\n');
}

popularCervejas().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
