/**
 * popular_cervejas_teste.js
 * 
 * Adiciona 10 marcas de cerveja com preços variados no Firestore
 * distribuídas em mercados já existentes para teste real.
 * 
 * Como rodar:
 *   node popular_cervejas_teste.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'geofertas-325b0'
});

const db = admin.firestore();

// ── Mercados reais já cadastrados (IDs aproximados — ajuste se precisar) ──
// O script busca os primeiros 10 mercados cadastrados e distribui as ofertas
async function popularCervejas() {
  console.log('🍺 Iniciando popular cervejas de teste...\n');

  // Buscar mercados existentes
  const marketsSnap = await db.collection('markets').limit(10).get();
  const mercados = [];
  marketsSnap.forEach(doc => {
    const d = doc.data();
    mercados.push({
      id: doc.id,
      name: d.name || d.marketName || 'Mercado',
      address: d.address || d.marketAddress || '',
      lat: d.lat || d.marketLat || null,
      lng: d.lng || d.marketLng || null,
    });
  });

  console.log(`📦 ${mercados.length} mercados encontrados para distribuir as ofertas.\n`);

  if (mercados.length === 0) {
    console.error('❌ Nenhum mercado encontrado!');
    process.exit(1);
  }

  // ── 10 marcas de cerveja com variação de preço por mercado ──
  const cervejas = [
    { nome: 'Skol Lata 350ml',           sinonimos: ['skol', 'skol lata', 'cerveja skol'],           precoBase: 2.89 },
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

  // Data de validade: 30 dias a partir de hoje
  const hoje = new Date();
  const validade = new Date(hoje.getTime() + 30 * 24 * 60 * 60 * 1000);

  const batch = db.batch();
  let count = 0;

  for (const cerveja of cervejas) {
    // Cada cerveja vai para 3 mercados aleatórios com preços ligeiramente diferentes
    const mercadosEscolhidos = mercados.slice(0, Math.min(3, mercados.length));

    for (let i = 0; i < mercadosEscolhidos.length; i++) {
      const mercado = mercadosEscolhidos[i];
      // Variação de preço: mercado 1 = mais barato, mercado 3 = mais caro
      const variacao = parseFloat((i * 0.20).toFixed(2));
      const preco    = parseFloat((cerveja.precoBase + variacao).toFixed(2));

      const docRef = db.collection('offers').doc();
      batch.set(docRef, {
        name:          cerveja.nome,
        synonyms:      cerveja.sinonimos,
        category:      'bebidas',
        price:         preco,
        unit:          'unidade',
        marketId:      mercado.id,
        marketName:    mercado.name,
        marketAddress: mercado.address,
        marketLat:     mercado.lat,
        marketLng:     mercado.lng,
        active:        true,
        source:        'teste',
        createdAt:     admin.firestore.FieldValue.serverTimestamp(),
        expiresAt:     validade.toISOString(),
        enrichedAt:    admin.firestore.FieldValue.serverTimestamp(),
      });

      count++;
      console.log(`   ✅ ${cerveja.nome} — R$ ${preco.toFixed(2).replace('.', ',')} → ${mercado.name}`);
    }
  }

  await batch.commit();

  console.log('\n═══════════════════════════════════════');
  console.log('✅ Cervejas de teste criadas!');
  console.log(`   Total de ofertas criadas: ${count}`);
  console.log(`   Marcas: ${cervejas.length}`);
  console.log('═══════════════════════════════════════\n');
  console.log('🎯 Agora teste no WhatsApp:');
  console.log('   "cerveja"        → deve mostrar ~10 marcas');
  console.log('   "brahma"         → deve mostrar Brahma em todos os mercados');
  console.log('   "heineken"       → deve mostrar Heineken em todos os mercados');
  console.log('   "cerveja corona" → deve mostrar Corona em todos os mercados\n');
}

popularCervejas().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
