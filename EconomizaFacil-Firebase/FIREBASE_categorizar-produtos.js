const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');
 
const FIREBASE_PROJECT_ID = 'geofertas-325b0';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'PLACEHOLDER_KEY';
const SERVICE_ACCOUNT_PATH = './serviceAccountKey.json';
 
const serviceAccount = require(SERVICE_ACCOUNT_PATH);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: FIREBASE_PROJECT_ID
});
const db = admin.firestore();
 
const claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
 
const CATEGORIAS = {
  acougue: ['carne', 'frango', 'peixe', 'linguica', 'bacon', 'presunto', 'salsicha', 'costela', 'picanha', 'alcatra', 'file', 'contrafile', 'patinho', 'camarao', 'atum'],
  mercearia: ['arroz', 'feijao', 'oleo', 'azeite', 'macarrao', 'acucar', 'sal', 'cafe', 'farinha', 'amido', 'fermento', 'vinagre', 'molho', 'extrato', 'tempero', 'condimento', 'caldo'],
  bebidas: ['cerveja', 'refri', 'refrigerante', 'suco', 'agua', 'vinho', 'energetico', 'isotonic', 'whisky', 'vodka', 'cachaca', 'rum'],
  laticinios: ['leite', 'queijo', 'manteiga', 'iogurte', 'creme', 'requeijao', 'margarina', 'nata'],
  padaria: ['pao', 'bolo', 'biscoito', 'bolacha', 'torrada', 'croissant', 'baguete'],
  higiene: ['sabonete', 'shampoo', 'condicionador', 'pasta', 'escova', 'desodorante', 'absorvente', 'fralda', 'papel higienico', 'creme', 'locao'],
  limpeza: ['detergente', 'sabao', 'desinfetante', 'sanitario', 'agua sanitaria', 'multiuso', 'tira limo', 'amaciante', 'alvejante', 'esponja', 'vassoura', 'rodo'],
  hortifruti: ['fruta', 'verdura', 'legume', 'alface', 'tomate', 'cebola', 'alho', 'batata', 'cenoura', 'brocolis', 'banana', 'maca', 'laranja', 'limao'],
  congelados: ['sorvete', 'pizza', 'lasanha', 'empanado', 'nugget', 'hamburguer', 'prato pronto', 'congelado'],
  pets: ['racao', 'areia', 'petisco', 'vermifugo']
};
 
function classificarLocalmente(nomeProduto) {
  const nome = nomeProduto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [categoria, palavras] of Object.entries(CATEGORIAS)) {
    for (const palavra of palavras) {
      if (nome.includes(palavra)) return categoria;
    }
  }
  return null;
}
 
async function classificarComClaude(produtos) {
  if (produtos.length === 0) return {};
  const lista = produtos.map((p, i) => `${i + 1}. ${p.nome}`).join('\n');
  const response = await claude.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Classifique cada produto em UMA das categorias: acougue, mercearia, bebidas, laticinios, padaria, higiene, limpeza, hortifruti, congelados, pets, outros\n\nProdutos:\n${lista}\n\nResponda APENAS JSON puro sem markdown: {"1": "categoria", "2": "categoria"}`
    }]
  });
  try {
    return JSON.parse(response.content[0].text.replace(/```json|```/g, '').trim());
  } catch (e) {
    console.error('Erro Claude:', e.message);
    return {};
  }
}
 
async function categorizarColecao(nomeColecao, campoNome) {
  console.log(`\n📦 Processando: ${nomeColecao}`);
  const snapshot = await db.collection(nomeColecao).get();
  const docs = snapshot.docs;
  console.log(`   Total: ${docs.length}`);
 
  const semCategoria = [];
  let jaTemCategoria = 0;
 
  docs.forEach(doc => {
    const data = doc.data();
    if (!data.category) {
      semCategoria.push({ id: doc.id, nome: data[campoNome] || data.name || doc.id });
    } else {
      jaTemCategoria++;
    }
  });
 
  console.log(`   Ja categorizados: ${jaTemCategoria}`);
  console.log(`   Sem categoria: ${semCategoria.length}`);
 
  if (semCategoria.length === 0) {
    console.log(`   OK Todos ja categorizados!`);
    return;
  }
 
  const paraUsarClaude = [];
  const batch = db.batch();
  let atualizadosLocal = 0;
 
  semCategoria.forEach(item => {
    const categoria = classificarLocalmente(item.nome);
    if (categoria) {
      batch.update(db.collection(nomeColecao).doc(item.id), { category: categoria });
      atualizadosLocal++;
    } else {
      paraUsarClaude.push(item);
    }
  });
 
  if (atualizadosLocal > 0) {
    await batch.commit();
    console.log(`   OK Classificados localmente: ${atualizadosLocal}`);
  }
 
  if (paraUsarClaude.length > 0) {
    console.log(`   Usando Claude para: ${paraUsarClaude.length} produtos...`);
    const tamLote = 20;
    for (let i = 0; i < paraUsarClaude.length; i += tamLote) {
      const lote = paraUsarClaude.slice(i, i + tamLote);
      console.log(`   Lote ${Math.floor(i / tamLote) + 1}/${Math.ceil(paraUsarClaude.length / tamLote)}...`);
      const resultado = await classificarComClaude(lote);
      const batchClaude = db.batch();
      lote.forEach((item, idx) => {
        const categoria = resultado[String(idx + 1)] || 'outros';
        batchClaude.update(db.collection(nomeColecao).doc(item.id), { category: categoria });
      });
      await batchClaude.commit();
      console.log(`   OK Lote salvo`);
      if (i + tamLote < paraUsarClaude.length) await new Promise(r => setTimeout(r, 1000));
    }
  }
 
  console.log(`   OK ${nomeColecao} categorizada!`);
}
 
async function adicionarSinonimos() {
  console.log('\n📝 Adicionando sinonimos...');
  const snapshot = await db.collection('products').get();
  const batch = db.batch();
  let atualizados = 0;
 
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    if (!data.synonyms || data.synonyms.length === 0) {
      const nome = (data.name || '').toLowerCase();
      const partes = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(' ').filter(p => p.length > 2);
      batch.update(db.collection('products').doc(doc.id), { synonyms: [...new Set([nome, ...partes])] });
      atualizados++;
    }
  });
 
  if (atualizados > 0) {
    await batch.commit();
    console.log(`   OK Sinonimos adicionados: ${atualizados} produtos`);
  } else {
    console.log('   OK Todos ja tem sinonimos!');
  }
}
 
async function verificarEstrutura() {
  console.log('\n🔍 Verificando Firebase...');
  const colecoes = ['products', 'offers', 'markets', 'users', 'shopping_lists', 'purchases', 'purchase_receipts'];
  for (const col of colecoes) {
    try {
      const snap = await db.collection(col).limit(1).get();
      console.log(`   OK ${col}: ${snap.empty ? 'vazia' : 'tem dados'}`);
    } catch (e) {
      console.log(`   ERRO ${col}: ${e.message}`);
    }
  }
}
 
async function main() {
  console.log('EconomizaFacil.IA - Setup Firebase');
  console.log('====================================');
  try {
    await verificarEstrutura();
    await categorizarColecao('products', 'name');
    await categorizarColecao('offers', 'productName');
    await adicionarSinonimos();
    console.log('\n====================================');
    console.log('OK Setup concluido! Firebase pronto.');
  } catch (error) {
    console.error('\nERRO:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}
 
main();
 