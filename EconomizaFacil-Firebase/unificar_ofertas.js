/**
 * unificar_ofertas.js
 * 
 * Lê de: offers, ofertas_completas, products
 * Escreve em: ofertas_v2 (padrão do sistema)
 * 
 * Como rodar:
 *   node unificar_ofertas.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'geofertas-325b0'
});

const db = admin.firestore();

// ── Carregar mercados em memória ──────────────────────────────
async function carregarMercados() {
  const snap = await db.collection('markets').get();
  const map = {};
  snap.forEach(doc => {
    const d = doc.data();
    map[doc.id] = {
      name:    d.name    || d.marketName    || '',
      address: d.address || d.marketAddress || '',
      lat:     d.lat     ?? d.marketLat     ?? null,
      lng:     d.lng     ?? d.marketLng     ?? null,
    };
  });
  console.log(`   📦 ${Object.keys(map).length} mercados carregados`);
  return map;
}

// ── Normalizar oferta para o padrão ofertas_v2 ────────────────
function normalizar(data, mercadosMap) {
  // Campos em português (já no padrão)
  if (data['nome do mercado'] || data['ID do mercado']) {
    return {
      nome:                  data.nome || data.name || '',
      'sinônimos':           data['sinônimos'] || data.synonyms || [],
      categoria:             data.categoria || data.category || '',
      'preço':               data['preço'] ?? data.price ?? 0,
      unidade:               data.unidade || data.unit || 'unidade',
      'ID do mercado':       data['ID do mercado'] || data.marketId || '',
      'nome do mercado':     data['nome do mercado'] || data.marketName || '',
      'endereço de mercado': data['endereço de mercado'] || data.marketAddress || '',
      mercadoLat:            data.mercadoLat ?? data.marketLat ?? null,
      mercadoLng:            data.mercadoLng ?? data.marketLng ?? null,
      nome_da_rede:          data.nome_da_rede || data.networkName || '',
      ativo:                 data.ativo ?? data.active ?? true,
      expiraEm:              data.expiraEm || data.expiresAt || '',
      source:                data.source || 'migrado',
      criadoEm:              admin.firestore.FieldValue.serverTimestamp(),
    };
  }

  // Campos em inglês (coleção offers)
  const marketId = data.marketId || '';
  const mercado  = mercadosMap[marketId] || {};
  return {
    nome:                  data.name || '',
    'sinônimos':           data.synonyms || [],
    categoria:             data.category || '',
    'preço':               data.price ?? 0,
    unidade:               data.unit || 'unidade',
    'ID do mercado':       marketId,
    'nome do mercado':     data.marketName || mercado.name || '',
    'endereço de mercado': data.marketAddress || mercado.address || '',
    mercadoLat:            data.marketLat ?? mercado.lat ?? null,
    mercadoLng:            data.marketLng ?? mercado.lng ?? null,
    nome_da_rede:          data.networkName || '',
    ativo:                 data.active ?? true,
    expiraEm:              data.expiresAt || '',
    source:                'migrado_offers',
    criadoEm:              admin.firestore.FieldValue.serverTimestamp(),
  };
}

// ── Migrar uma coleção ────────────────────────────────────────
async function migrarColecao(nomeColecao, mercadosMap) {
  console.log(`\n🔄 Migrando coleção: ${nomeColecao}...`);
  
  let snap;
  try {
    snap = await db.collection(nomeColecao).get();
  } catch(e) {
    console.log(`   ⚠️  Coleção ${nomeColecao} não encontrada, pulando.`);
    return 0;
  }

  if (snap.empty) {
    console.log(`   ℹ️  Coleção ${nomeColecao} está vazia.`);
    return 0;
  }

  console.log(`   📋 ${snap.size} documentos encontrados`);

  // Verificar IDs já existentes em ofertas_v2 para evitar duplicatas
  const existentesSnap = await db.collection('ofertas_v2')
    .where('source', '==', `migrado_${nomeColecao}`)
    .get();
  const existentes = new Set();
  existentesSnap.forEach(doc => {
    const d = doc.data();
    // Chave única: nome + mercado + preço
    existentes.add(`${d.nome}_${d['ID do mercado']}_${d['preço']}`);
  });

  let batch = db.batch();
  let count = 0;
  let pulados = 0;
  let batchCount = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    
    // Pular inativos
    const ativo = data.ativo ?? data.active ?? true;
    if (!ativo) { pulados++; continue; }

    const normalizado = normalizar(data, mercadosMap);
    normalizado.source = `migrado_${nomeColecao}`;

    // Pular sem nome ou preço
    if (!normalizado.nome || !normalizado['preço']) { pulados++; continue; }

    // Pular duplicatas
    const chave = `${normalizado.nome}_${normalizado['ID do mercado']}_${normalizado['preço']}`;
    if (existentes.has(chave)) { pulados++; continue; }

    const docRef = db.collection('ofertas_v2').doc();
    batch.set(docRef, normalizado);
    count++;
    batchCount++;

    if (batchCount === 400) {
      await batch.commit();
      console.log(`   💾 ${count} documentos commitados...`);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) await batch.commit();

  console.log(`   ✅ ${count} migrados | ${pulados} pulados (inativos/duplicatas)`);
  return count;
}

// ── Main ──────────────────────────────────────────────────────
async function unificar() {
  console.log('🚀 Iniciando unificação de ofertas...\n');

  const mercadosMap = await carregarMercados();

  let total = 0;
  total += await migrarColecao('offers', mercadosMap);
  total += await migrarColecao('ofertas_completas', mercadosMap);

  // Contar total atual em ofertas_v2
  const v2Snap = await db.collection('ofertas_v2').where('ativo', '==', true).get();

  console.log('\n═══════════════════════════════════════');
  console.log('✅ Unificação concluída!');
  console.log(`   Migrados agora : ${total}`);
  console.log(`   Total ofertas_v2 ativas: ${v2Snap.size}`);
  console.log('═══════════════════════════════════════\n');
  console.log('🎯 Agora rode: node listar_produtos.js');
  console.log('   Para ver todos os produtos disponíveis!\n');
}

unificar().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
