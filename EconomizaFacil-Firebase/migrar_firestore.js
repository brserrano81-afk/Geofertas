// ============================================================
// SCRIPT: Migrar e Reorganizar Firestore — EconomizaFacil.IA
// Corrige categorias, marcas falsas e campos inconsistentes
// Como usar:
// 1. npm install firebase-admin
// 2. Coloque seu serviceAccountKey.json na mesma pasta
// 3. node migrar_firestore.js
// ============================================================

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
db.settings({ ignoreUndefinedProperties: true });

// ── MAPA DE CORREÇÃO DE CATEGORIAS ──────────────────────────
// De qualquer valor atual → para o valor correto padronizado
const CATEGORIA_MAP = {
  // variações de mercearia
  'basicos':        'mercearia',
  'básicos':        'mercearia',
  'basico':         'mercearia',
  'graos':          'mercearia',
  'grãos':          'mercearia',
  'mercearia':      'mercearia',

  // variações de bebidas
  'bebidas':        'bebidas',
  'bebida':         'bebidas',

  // variações de hortifruti
  'hortifruti':     'hortifruti',
  'hortifrúti':     'hortifruti',
  'hortifruti ':    'hortifruti',
  'frutas':         'hortifruti',
  'verduras':       'hortifruti',
  'legumes':        'hortifruti',

  // variações de laticínios
  'laticinios':     'laticinios',
  'laticínios':     'laticinios',
  'laticinío':      'laticinios',
  'laticinío ':     'laticinios',

  // variações de açougue
  'acougue':        'acougue',
  'açougue':        'acougue',
  'carnes':         'acougue',
  'carne':          'acougue',

  // variações de padaria
  'padaria':        'padaria',
  'paes':           'padaria',
  'pães':           'padaria',

  // variações de frios
  'frios':          'frios_embutidos',
  'frios_embutidos':'frios_embutidos',
  'embutidos':      'frios_embutidos',
  'friambre':       'frios_embutidos',

  // variações de congelados
  'congelados':     'congelados',
  'congelado':      'congelados',

  // variações de doces
  'doces':          'doces_biscoitos',
  'doces_biscoitos':'doces_biscoitos',
  'biscoitos':      'doces_biscoitos',
  'confeitaria':    'doces_biscoitos',

  // variações de higiene
  'higiene':        'higiene_pessoal',
  'higiene_pessoal':'higiene_pessoal',
  'higiene pessoal':'higiene_pessoal',
  'perfumaria':     'higiene_pessoal',

  // variações de limpeza
  'limpeza':        'limpeza',
  'produtos de limpeza': 'limpeza',

  // pet
  'pet':            'pet',
  'pet shop':       'pet',
  'animais':        'pet',

  // bazar
  'bazar':          'bazar',
  'utilidades':     'bazar',

  // farmácia
  'farmacia':       'farmacia',
  'farmácia':       'farmacia',
  'medicamentos':   'farmacia',
};

// ── CORREÇÕES ESPECÍFICAS POR PRODUCT ID ────────────────────
// Produtos com categoria claramente errada
const PRODUTO_CATEGORIA_CORRETA = {
  'cafe-pilao-500g':          'mercearia',
  'cafe-tres-coracoes-500g':  'mercearia',
  'acucar-uniao-1kg':         'mercearia',
  'acucar-refinado-1kg':      'mercearia',
  'arroz-tio-joao-5kg':       'mercearia',
  'feijao-carioca-camil-1kg': 'mercearia',
  'oleo-soja-liza-900ml':     'mercearia',
  'farinha-trigo-dona-benta-1kg': 'mercearia',
  'macarrao-barilla-500g':    'mercearia',
  'sal-cisne-1kg':            'mercearia',
  'leite-piracanjuba-1l':     'laticinios',
  'frango-congelado-kg':      'acougue',
  'carne-bovina-acem-kg':     'acougue',
  'linguica-sadia-500g':      'frios_embutidos',
  'cerveja-brahma-lata-350ml':'bebidas',
  'detergente-ype-500ml':     'limpeza',
  'alface-unidade':           'hortifruti',
  'banana-prata-kg':          'hortifruti',
  'batata-kg':                'hortifruti',
  'cebola-kg':                'hortifruti',
};

// ── MARCAS FALSAS PARA REMOVER ──────────────────────────────
const MARCAS_FALSAS = [
  'Web Brand A', 'Web Brand B', 'Web Brand C',
  'web brand a', 'web brand b', 'web brand c',
  'Brand A', 'Brand B', 'Test Brand', 'Fake Brand'
];

function normalizarCategoria(categoriaAtual, productId) {
  // Primeiro verifica correção específica por ID
  if (productId && PRODUTO_CATEGORIA_CORRETA[productId]) {
    return PRODUTO_CATEGORIA_CORRETA[productId];
  }
  if (!categoriaAtual) return 'mercearia';
  const key = categoriaAtual.toLowerCase().trim();
  return CATEGORIA_MAP[key] || categoriaAtual;
}

function isMarcaFalsa(marca) {
  if (!marca) return false;
  return MARCAS_FALSAS.some(f => f.toLowerCase() === marca.toLowerCase());
}

// ── MIGRAR PRODUCTS ─────────────────────────────────────────
async function migrarProdutos() {
  console.log('\n📦 Migrando produtos...');
  const snap = await db.collection('products').get();
  let atualizados = 0;
  let semMudanca = 0;
  const batch_ops = [];

  snap.forEach(doc => {
    const data = doc.data();
    const categoriaOriginal = data.category;
    const categoriaCorreta = normalizarCategoria(categoriaOriginal, doc.id);

    const updates = {};

    if (categoriaOriginal !== categoriaCorreta) {
      updates.category = categoriaCorreta;
    }

    // Adicionar campo 'active' se não existir
    if (data.active === undefined) {
      updates.active = true;
    }

    if (Object.keys(updates).length > 0) {
      batch_ops.push({ ref: doc.ref, updates });
      atualizados++;
    } else {
      semMudanca++;
    }
  });

  // Executar em lotes de 400
  for (let i = 0; i < batch_ops.length; i += 400) {
    const batch = db.batch();
    batch_ops.slice(i, i + 400).forEach(op => {
      batch.update(op.ref, op.updates);
    });
    await batch.commit();
  }

  console.log(`   ✅ ${atualizados} produtos atualizados`);
  console.log(`   ℹ️  ${semMudanca} produtos sem alteração`);
}

// ── MIGRAR OFFERS ────────────────────────────────────────────
async function migrarOfertas() {
  console.log('\n🏷️  Migrando ofertas...');
  const snap = await db.collection('offers').get();
  let atualizados = 0;
  let semMudanca = 0;
  const batch_ops = [];

  snap.forEach(doc => {
    const data = doc.data();
    const updates = {};

    // Corrigir categoria
    const categoriaOriginal = data.category;
    const categoriaCorreta = normalizarCategoria(categoriaOriginal, data.productId);
    if (categoriaOriginal !== categoriaCorreta) {
      updates.category = categoriaCorreta;
    }

    // Remover marca falsa
    if (isMarcaFalsa(data.brand)) {
      updates.brand = admin.firestore.FieldValue.delete();
    }

    // Padronizar active/isActive
    if (data.isActive !== undefined && data.active === undefined) {
      updates.active = data.isActive;
      updates.isActive = admin.firestore.FieldValue.delete();
    }
    if (data.active === undefined && data.isActive === undefined) {
      updates.active = true;
    }

    // Adicionar campo active se não existir
    if (data.active === undefined && data.isActive !== undefined) {
      updates.active = data.isActive;
    }

    if (Object.keys(updates).length > 0) {
      batch_ops.push({ ref: doc.ref, updates });
      atualizados++;
    } else {
      semMudanca++;
    }
  });

  // Executar em lotes de 400
  for (let i = 0; i < batch_ops.length; i += 400) {
    const batch = db.batch();
    batch_ops.slice(i, i + 400).forEach(op => {
      batch.update(op.ref, op.updates);
    });
    await batch.commit();
  }

  console.log(`   ✅ ${atualizados} ofertas atualizadas`);
  console.log(`   ℹ️  ${semMudanca} ofertas sem alteração`);
}

// ── CRIAR COLEÇÃO DE CATEGORIAS ──────────────────────────────
async function criarCategorias() {
  console.log('\n📁 Criando/atualizando coleção de categorias...');
  const categorias = [
    { id: 'mercearia',       nome: 'Mercearia',          icone: '🛒', ordem: 1  },
    { id: 'bebidas',         nome: 'Bebidas',             icone: '🥤', ordem: 2  },
    { id: 'laticinios',      nome: 'Laticínios',          icone: '🥛', ordem: 3  },
    { id: 'acougue',         nome: 'Açougue',             icone: '🥩', ordem: 4  },
    { id: 'hortifruti',      nome: 'Hortifruti',          icone: '🥦', ordem: 5  },
    { id: 'padaria',         nome: 'Padaria',             icone: '🍞', ordem: 6  },
    { id: 'frios_embutidos', nome: 'Frios e Embutidos',   icone: '🧀', ordem: 7  },
    { id: 'congelados',      nome: 'Congelados',          icone: '🧊', ordem: 8  },
    { id: 'doces_biscoitos', nome: 'Doces e Biscoitos',   icone: '🍬', ordem: 9  },
    { id: 'higiene_pessoal', nome: 'Higiene Pessoal',     icone: '🧴', ordem: 10 },
    { id: 'limpeza',         nome: 'Limpeza',             icone: '🧹', ordem: 11 },
    { id: 'pet',             nome: 'Pet Shop',            icone: '🐾', ordem: 12 },
    { id: 'bazar',           nome: 'Bazar',               icone: '🏪', ordem: 13 },
    { id: 'farmacia',        nome: 'Farmácia',            icone: '💊', ordem: 14 },
  ];

  const batch = db.batch();
  categorias.forEach(cat => {
    batch.set(db.collection('categories').doc(cat.id), cat, { merge: true });
  });
  await batch.commit();
  console.log(`   ✅ ${categorias.length} categorias criadas/atualizadas`);
}

// ── RELATÓRIO FINAL ──────────────────────────────────────────
async function relatorio() {
  console.log('\n📊 Relatório final...');

  const [products, offers, markets] = await Promise.all([
    db.collection('products').get(),
    db.collection('offers').get(),
    db.collection('markets').get(),
  ]);

  const catProdutos = {};
  products.forEach(d => {
    const cat = d.data().category || 'sem_categoria';
    catProdutos[cat] = (catProdutos[cat] || 0) + 1;
  });

  const catOfertas = {};
  offers.forEach(d => {
    const cat = d.data().category || 'sem_categoria';
    catOfertas[cat] = (catOfertas[cat] || 0) + 1;
  });

  console.log(`\n   Total produtos: ${products.size}`);
  console.log('   Por categoria:');
  Object.entries(catProdutos).sort().forEach(([cat, n]) => {
    console.log(`     ${cat}: ${n}`);
  });

  console.log(`\n   Total ofertas: ${offers.size}`);
  console.log('   Por categoria:');
  Object.entries(catOfertas).sort().forEach(([cat, n]) => {
    console.log(`     ${cat}: ${n}`);
  });

  console.log(`\n   Total mercados: ${markets.size}`);
}

// ── EXECUTAR ─────────────────────────────────────────────────
async function main() {
  console.log('🚀 Iniciando migração do Firestore...');
  console.log('   Projeto: geofertas-325b0\n');

  await criarCategorias();
  await migrarProdutos();
  await migrarOfertas();
  await relatorio();

  console.log('\n🎉 Migração concluída com sucesso!');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Erro na migração:', err);
  process.exit(1);
});
