// ============================================================
// SCRIPT: Corrigir Firestore — Fase 2
// - Desativa ofertas inválidas (off_, prod_, sem nome real)
// - Herda categoria do produto para ofertas em "outros"
// - Corrige categorias faltantes (óleos, molhos, pescados...)
// node corrigir_firestore2.js
// ============================================================

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ── CATEGORIAS FALTANTES NO MAPA ANTERIOR ───────────────────
const CATEGORIA_MAP2 = {
  'óleos':          'mercearia',
  'oleos':          'mercearia',
  'óleo':           'mercearia',
  'oleo':           'mercearia',
  'molhos':         'mercearia',
  'molho':          'mercearia',
  'pescados':       'acougue',
  'peixe':          'acougue',
  'frutos do mar':  'acougue',
  'cereais':        'mercearia',
  'enlatados':      'mercearia',
  'conservas':      'mercearia',
  'temperos':       'mercearia',
  'condimentos':    'mercearia',
  'massas':         'mercearia',
  'farinhas':       'mercearia',
  'açúcares':       'mercearia',
  'acucares':       'mercearia',
  'cafes':          'mercearia',
  'café':           'mercearia',
  'cafe':           'mercearia',
  'biscoitos':      'doces_biscoitos',
  'doces':          'doces_biscoitos',
  'sorvetes':       'congelados',
  'frios':          'frios_embutidos',
  'embutidos':      'frios_embutidos',
  'laticinios':     'laticinios',
  'laticínios':     'laticinios',
  'queijos':        'laticinios',
  'iogurtes':       'laticinios',
  'carnes':         'acougue',
  'aves':           'acougue',
  'suinos':         'acougue',
  'suínos':         'acougue',
  'frango':         'acougue',
  'frutas':         'hortifruti',
  'verduras':       'hortifruti',
  'legumes':        'hortifruti',
  'higiene':        'higiene_pessoal',
  'cosmeticos':     'higiene_pessoal',
  'cosméticos':     'higiene_pessoal',
  'limpeza':        'limpeza',
  'bazar':          'bazar',
  'utilidades':     'bazar',
  'eletronicos':    'bazar',
  'papelaria':      'bazar',
  'pet':            'pet',
  'racao':          'pet',
  'ração':          'pet',
  'farmacia':       'farmacia',
  'farmácia':       'farmacia',
  'vitaminas':      'farmacia',
};

// ── VERIFICA SE OFERTA É INVÁLIDA ───────────────────────────
function isOfertaInvalida(data) {
  const nome = (data.name || data.productName || '').toLowerCase().trim();
  const prodId = (data.productId || '').toLowerCase();

  // Nome claramente inválido
  if (!nome) return true;
  if (nome.startsWith('off ') || nome.startsWith('off_')) return true;
  if (nome.match(/^off [a-f0-9]{10,}/i)) return true;
  if (nome.match(/^[a-f0-9]{15,}$/)) return true;

  // ProductId inválido (IDs gerados automaticamente tipo prod_xxxx)
  if (prodId.startsWith('prod_') && prodId.length > 10) return true;

  // Sem preço real
  if (!data.price || data.price <= 0) return true;

  return false;
}

// ── FASE 1: Desativar ofertas inválidas ──────────────────────
async function desativarInvalidas() {
  console.log('\n🗑️  Desativando ofertas inválidas...');
  const snap = await db.collection('offers').get();
  let desativadas = 0;
  let validas = 0;
  const batch_ops = [];

  snap.forEach(doc => {
    const data = doc.data();
    if (isOfertaInvalida(data)) {
      batch_ops.push({ ref: doc.ref, updates: { active: false } });
      desativadas++;
    } else {
      validas++;
    }
  });

  for (let i = 0; i < batch_ops.length; i += 400) {
    const batch = db.batch();
    batch_ops.slice(i, i + 400).forEach(op => batch.update(op.ref, op.updates));
    await batch.commit();
  }

  console.log(`   ✅ ${desativadas} ofertas desativadas`);
  console.log(`   ℹ️  ${validas} ofertas válidas mantidas`);
  return validas;
}

// ── FASE 2: Herdar categoria do produto ──────────────────────
async function herdarCategoriaDoProduto() {
  console.log('\n🔗 Herdando categoria dos produtos...');

  // Carregar todos os produtos em memória
  const prodSnap = await db.collection('products').get();
  const prodMap = {};
  prodSnap.forEach(doc => {
    prodMap[doc.id] = doc.data();
  });
  console.log(`   📦 ${prodSnap.size} produtos carregados`);

  // Buscar ofertas ativas com categoria "outros" ou faltante
  const offSnap = await db.collection('offers')
    .where('active', '==', true)
    .get();

  let herdadas = 0;
  let semProduto = 0;
  const batch_ops = [];

  offSnap.forEach(doc => {
    const data = doc.data();
    const cat = (data.category || '').toLowerCase().trim();

    // Só processa se categoria está errada/ausente
    if (cat && cat !== 'outros' && cat !== 'outro' && cat !== 'sem_categoria') return;

    const prodId = data.productId;
    if (!prodId) { semProduto++; return; }

    const produto = prodMap[prodId];
    if (!produto || !produto.category) { semProduto++; return; }

    batch_ops.push({
      ref: doc.ref,
      updates: { category: produto.category }
    });
    herdadas++;
  });

  for (let i = 0; i < batch_ops.length; i += 400) {
    const batch = db.batch();
    batch_ops.slice(i, i + 400).forEach(op => batch.update(op.ref, op.updates));
    await batch.commit();
  }

  console.log(`   ✅ ${herdadas} ofertas com categoria herdada do produto`);
  console.log(`   ⚠️  ${semProduto} ofertas sem produto correspondente`);
}

// ── FASE 3: Corrigir categorias ainda erradas ────────────────
async function corrigirCategorias() {
  console.log('\n🏷️  Corrigindo categorias restantes...');

  const snap = await db.collection('offers')
    .where('active', '==', true)
    .get();

  let corrigidas = 0;
  const batch_ops = [];

  snap.forEach(doc => {
    const data = doc.data();
    const catAtual = (data.category || '').trim();
    const catLower = catAtual.toLowerCase();
    const catCorreta = CATEGORIA_MAP2[catLower];

    if (catCorreta && catCorreta !== catAtual) {
      batch_ops.push({ ref: doc.ref, updates: { category: catCorreta } });
      corrigidas++;
    }
  });

  for (let i = 0; i < batch_ops.length; i += 400) {
    const batch = db.batch();
    batch_ops.slice(i, i + 400).forEach(op => batch.update(op.ref, op.updates));
    await batch.commit();
  }

  console.log(`   ✅ ${corrigidas} ofertas com categoria corrigida`);
}

// ── FASE 4: Corrigir produtos também ────────────────────────
async function corrigirProdutos() {
  console.log('\n📦 Corrigindo categorias de produtos...');

  const snap = await db.collection('products').get();
  let corrigidos = 0;
  const batch_ops = [];

  snap.forEach(doc => {
    const data = doc.data();
    const catAtual = (data.category || '').trim();
    const catLower = catAtual.toLowerCase();
    const catCorreta = CATEGORIA_MAP2[catLower];

    if (catCorreta && catCorreta !== catAtual) {
      batch_ops.push({ ref: doc.ref, updates: { category: catCorreta } });
      corrigidos++;
    }
  });

  for (let i = 0; i < batch_ops.length; i += 400) {
    const batch = db.batch();
    batch_ops.slice(i, i + 400).forEach(op => batch.update(op.ref, op.updates));
    await batch.commit();
  }

  console.log(`   ✅ ${corrigidos} produtos com categoria corrigida`);
}

// ── RELATÓRIO FINAL ──────────────────────────────────────────
async function relatorio() {
  console.log('\n📊 Relatório final...');

  const [products, offersAtivas, offersTotal] = await Promise.all([
    db.collection('products').get(),
    db.collection('offers').where('active', '==', true).get(),
    db.collection('offers').get(),
  ]);

  const catOfertas = {};
  offersAtivas.forEach(d => {
    const cat = d.data().category || 'sem_categoria';
    catOfertas[cat] = (catOfertas[cat] || 0) + 1;
  });

  const catProdutos = {};
  products.forEach(d => {
    const cat = d.data().category || 'sem_categoria';
    catProdutos[cat] = (catProdutos[cat] || 0) + 1;
  });

  console.log(`\n   Total produtos: ${products.size}`);
  console.log('   Por categoria:');
  Object.entries(catProdutos).sort().forEach(([cat, n]) => {
    console.log(`     ${cat}: ${n}`);
  });

  console.log(`\n   Ofertas ativas: ${offersAtivas.size} / ${offersTotal.size} total`);
  console.log('   Por categoria:');
  Object.entries(catOfertas).sort().forEach(([cat, n]) => {
    console.log(`     ${cat}: ${n}`);
  });
}

// ── EXECUTAR ─────────────────────────────────────────────────
async function main() {
  console.log('🚀 Iniciando correção Fase 2...');
  console.log('   Projeto: geofertas-325b0\n');

  await desativarInvalidas();
  await herdarCategoriaDoProduto();
  await corrigirCategorias();
  await corrigirProdutos();
  await relatorio();

  console.log('\n🎉 Correção concluída!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
