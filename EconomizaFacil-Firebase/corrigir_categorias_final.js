// SCRIPT: Correção Final de Categorias
// node corrigir_categorias_final.js

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

const MAPA = {
  'adega':                  'bebidas',
  'Adega':                  'bebidas',
  'bomboniere':             'doces_biscoitos',
  'Bomboniere':             'doces_biscoitos',
  'carnes e congelados':    'acougue',
  'Carnes e Congelados':    'acougue',
  'carnes':                 'acougue',
  'Carnes':                 'acougue',
  'peixes':                 'acougue',
  'Peixes':                 'acougue',
  'peixe':                  'acougue',
  'Peixe':                  'acougue',
  'arroz':                  'mercearia',
  'Arroz':                  'mercearia',
  'basicos':                'mercearia',
  'básicos':                'mercearia',
  'graos':                  'mercearia',
  'grãos':                  'mercearia',
  'hortifrúti':             'hortifruti',
  'Hortifrúti':             'hortifruti',
  'Hortifruti':             'hortifruti',
  'laticinío':              'laticinios',
  'Laticínios':             'laticinios',
  'açougue':                'acougue',
  'Açougue':                'acougue',
  'mercearia ':             'mercearia',
  'bebidas ':               'bebidas',
};

async function corrigir(colecao) {
  console.log(`\n📦 Corrigindo ${colecao}...`);
  const snap = await db.collection(colecao).get();
  let corrigidos = 0;
  const batch_ops = [];

  snap.forEach(doc => {
    const data = doc.data();
    const catAtual = (data.category || '').trim();
    const catCorreta = MAPA[catAtual];
    if (catCorreta) {
      batch_ops.push({ ref: doc.ref, updates: { category: catCorreta } });
      corrigidos++;
    }
  });

  for (let i = 0; i < batch_ops.length; i += 400) {
    const batch = db.batch();
    batch_ops.slice(i, i + 400).forEach(op => batch.update(op.ref, op.updates));
    await batch.commit();
  }
  console.log(`   ✅ ${corrigidos} documentos corrigidos em ${colecao}`);
}

async function relatorio() {
  console.log('\n📊 Relatório final...');
  const [produtos, ofertas] = await Promise.all([
    db.collection('products').get(),
    db.collection('offers').where('active', '==', true).get(),
  ]);

  const catP = {};
  produtos.forEach(d => { const c = d.data().category || 'sem_categoria'; catP[c] = (catP[c]||0)+1; });

  const catO = {};
  ofertas.forEach(d => { const c = d.data().category || 'sem_categoria'; catO[c] = (catO[c]||0)+1; });

  console.log(`\n   Produtos (${produtos.size} total):`);
  Object.entries(catP).sort().forEach(([c,n]) => console.log(`     ${c}: ${n}`));

  console.log(`\n   Ofertas ativas (${ofertas.size} total):`);
  Object.entries(catO).sort().forEach(([c,n]) => console.log(`     ${c}: ${n}`));
}

async function main() {
  console.log('🚀 Correção final de categorias...');
  await corrigir('products');
  await corrigir('offers');
  await relatorio();
  console.log('\n🎉 Concluído!');
  process.exit(0);
}

main().catch(err => { console.error('❌ Erro:', err); process.exit(1); });
