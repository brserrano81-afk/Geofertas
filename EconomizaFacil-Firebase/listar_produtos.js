/**
 * listar_produtos.js
 * Lista todos os produtos cadastrados na ofertas_v2
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'geofertas-325b0'
});

const db = admin.firestore();

async function listarProdutos() {
  console.log('📦 Buscando produtos cadastrados...\n');

  const snap = await db.collection('ofertas_v2')
    .where('ativo', '==', true)
    .get();

  console.log(`Total de ofertas ativas: ${snap.size}\n`);

  // Agrupar por categoria
  const porCategoria = {};
  snap.forEach(doc => {
    const d = doc.data();
    const cat  = d.categoria || 'sem categoria';
    const nome = d.nome || 'sem nome';
    const preco = d['preço'] || 0;
    const mercado = d['nome do mercado'] || 'sem mercado';

    if (!porCategoria[cat]) porCategoria[cat] = [];
    porCategoria[cat].push({ nome, preco, mercado });
  });

  // Exibir por categoria
  for (const cat of Object.keys(porCategoria).sort()) {
    console.log(`\n═══ ${cat.toUpperCase()} (${porCategoria[cat].length} ofertas) ═══`);
    
    // Agrupar por nome do produto
    const porNome = {};
    porCategoria[cat].forEach(o => {
      if (!porNome[o.nome]) porNome[o.nome] = [];
      porNome[o.nome].push(o);
    });

    for (const nome of Object.keys(porNome).sort()) {
      const ofertas = porNome[nome];
      const precos = ofertas.map(o => `R$ ${Number(o.preco).toFixed(2).replace('.', ',')} (${o.mercado})`);
      console.log(`  📌 ${nome}`);
      precos.forEach(p => console.log(`     → ${p}`));
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log(`✅ Total: ${snap.size} ofertas ativas`);
  console.log('═══════════════════════════════════════\n');
}

listarProdutos().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
