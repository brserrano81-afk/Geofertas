/**
 * popular_cafe.js
 * Adiciona marcas de café na coleção ofertas_v2
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'geofertas-325b0'
});

const db = admin.firestore();

async function popularCafe() {
  console.log('☕ Iniciando popular café...\n');

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

  console.log(`📦 ${mercados.length} mercados carregados\n`);

  const cafes = [
    { nome: 'Café Pilão 500g',           sin: ['cafe','café','pilao','pilão'],                    preco: 18.90, offset: 0  },
    { nome: 'Café 3 Corações 500g',      sin: ['cafe','café','3 coracoes','3 corações'],           preco: 17.90, offset: 1  },
    { nome: 'Café Melitta 500g',         sin: ['cafe','café','melitta'],                           preco: 19.90, offset: 2  },
    { nome: 'Café Nescafé Tradicional 160g',sin:['cafe','café','nescafe','nescafé'],              preco: 16.90, offset: 3  },
    { nome: 'Café Caboclo 500g',         sin: ['cafe','café','caboclo'],                           preco: 14.90, offset: 4  },
    { nome: 'Café Pelé 500g',            sin: ['cafe','café','pele','pelé'],                      preco: 15.90, offset: 5  },
    { nome: 'Café Iguaçu 500g',          sin: ['cafe','café','iguacu','iguaçu'],                  preco: 13.90, offset: 6  },
    { nome: 'Café Pilão 250g',           sin: ['cafe','café','pilao 250','pilão 250'],             preco: 10.90, offset: 7  },
    { nome: 'Café 3 Corações 250g',      sin: ['cafe','café','3 coracoes 250'],                   preco: 9.90,  offset: 8  },
    { nome: 'Café Melitta Premium 250g', sin: ['cafe','café','melitta premium'],                   preco: 12.90, offset: 9  },
    { nome: 'Café Solúvel Nescafé 200g', sin: ['cafe soluvel','café solúvel','nescafe soluvel'],   preco: 24.90, offset: 10 },
    { nome: 'Café em Cápsula Nespresso 10un',sin:['capsula','cápsula','nespresso','cafe capsula'], preco: 29.90, offset: 11 },
  ];

  const validade = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const batch = db.batch();
  let count = 0;

  for (const cafe of cafes) {
    for (let i = 0; i < 3; i++) {
      const idx     = (cafe.offset + i) % mercados.length;
      const mercado = mercados[idx];
      const variacao = parseFloat((i * (cafe.preco * 0.05)).toFixed(2));
      const preco   = parseFloat((cafe.preco + variacao).toFixed(2));

      const docRef = db.collection('ofertas_v2').doc();
      batch.set(docRef, {
        nome:                  cafe.nome,
        'sinônimos':           cafe.sin,
        categoria:             'mercearia',
        'preço':               preco,
        unidade:               'unidade',
        'ID do mercado':       mercado.id,
        'nome do mercado':     mercado.name,
        'endereço de mercado': mercado.address,
        mercadoLat:            mercado.lat,
        mercadoLng:            mercado.lng,
        nome_da_rede:          '',
        ativo:                 true,
        source:                'popular_cafe',
        criadoEm:              admin.firestore.FieldValue.serverTimestamp(),
        expiraEm:              validade.toISOString(),
      });

      count++;
      console.log(`   ✅ ${cafe.nome} — R$ ${preco.toFixed(2).replace('.', ',')} → ${mercado.name}`);
    }
  }

  await batch.commit();

  console.log('\n═══════════════════════════════════════');
  console.log('✅ Café populado com sucesso!');
  console.log(`   Total: ${count} ofertas | ${cafes.length} marcas`);
  console.log('═══════════════════════════════════════\n');
  console.log('🎯 Teste agora:');
  console.log('   "café"        → 5 marcas mais baratas');
  console.log('   "pilão"       → Pilão em todos os mercados');
  console.log('   "nescafé"     → Nescafé em todos os mercados\n');
}

popularCafe().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
