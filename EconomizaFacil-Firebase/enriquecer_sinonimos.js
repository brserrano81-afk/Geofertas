// ============================================================
// enriquecer_sinonimos.js
// Adiciona sinônimos genéricos nos produtos do Firestore
// Ex: Skol ganha "cerveja", "gelada", "latinha"
//     Heineken ganha "cerveja", "gelada", "latinha"
//     Pilão ganha "café", "cafe"
// ============================================================

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { FieldValue } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

// Mapa: palavra-chave no nome do produto → sinônimos a adicionar
const REGRAS = [
  // BEBIDAS — cervejas
  { match: ['brahma', 'skol', 'heineken', 'amstel', 'itaipava', 'crystal', 'antartica', 'budweiser', 'corona', 'stella'],
    add: ['cerveja', 'gelada', 'latinha', 'bebida', 'alcoolica'] },

  // BEBIDAS — refrigerantes
  { match: ['coca-cola', 'coca cola', 'pepsi', 'guaraná antarctica', 'guarana antarctica', 'fanta', 'sprite', 'schweppes'],
    add: ['refrigerante', 'refri', 'bebida', 'soda'] },

  // BEBIDAS — sucos e águas
  { match: ['del valle', 'suco', 'nectar', 'crystal agua', 'bonafont', 'minalba', 'agua mineral'],
    add: ['suco', 'agua', 'bebida'] },

  // MERCEARIA — café
  { match: ['pilão', 'pilao', '3 coracoes', '3 corações', 'melitta', 'nescafe', 'nescafé', 'café do dia', 'cafe do dia'],
    add: ['cafe', 'café', 'cafezinho'] },

  // MERCEARIA — arroz
  { match: ['tio joao', 'tio joão', 'camil arroz', 'prato fino arroz', 'uncle bens'],
    add: ['arroz', 'arroz branco', 'arroz agulhinha'] },

  // MERCEARIA — feijão
  { match: ['camil feijao', 'camil feijão', 'carioca camil', 'feijao carioca', 'feijão carioca'],
    add: ['feijao', 'feijão', 'feijao carioca', 'feijão carioca'] },

  // MERCEARIA — açúcar
  { match: ['uniao', 'união', 'acucar uniao', 'açúcar união'],
    add: ['acucar', 'açúcar', 'acucar refinado'] },

  // MERCEARIA — óleo
  { match: ['soya', 'liza', 'oleo soja', 'óleo soja', 'oleo de soja'],
    add: ['oleo', 'óleo', 'oleo de soja', 'óleo de soja', 'oleo soja'] },

  // MERCEARIA — farinha
  { match: ['dona benta', 'anaconda farinha', 'mirabel farinha'],
    add: ['farinha', 'farinha de trigo', 'farinha trigo'] },

  // MERCEARIA — macarrão
  { match: ['barilla', 'adria', 'renata macarrao', 'macarrao barilla'],
    add: ['macarrao', 'macarrão', 'massa', 'espaguete', 'spaghetti'] },

  // MERCEARIA — sal
  { match: ['cisne', 'sal cisne', 'lebre'],
    add: ['sal', 'sal refinado', 'sal de cozinha'] },

  // MERCEARIA — molho
  { match: ['heinz', 'pomarola', 'quero', 'molho tomate'],
    add: ['molho', 'molho de tomate', 'molho tomate', 'extrato'] },

  // MERCEARIA — ovos
  { match: ['ovos', 'ovo'],
    add: ['ovos', 'ovo', 'ovos brancos', 'ovos caipira'] },

  // AÇOUGUE — frango
  { match: ['frango', 'sadia frango', 'seara frango', 'aurora frango'],
    add: ['frango', 'frango inteiro', 'frango congelado', 'ave'] },

  // AÇOUGUE — carne
  { match: ['picanha', 'fraldinha', 'alcatra', 'patinho', 'carne bovina', 'acem'],
    add: ['carne', 'carne bovina', 'bovino', 'churrasco'] },

  // AÇOUGUE — linguiça
  { match: ['linguica sadia', 'linguiça sadia', 'linguica seara', 'linguiça seara', 'linguica aurora'],
    add: ['linguica', 'linguiça', 'salsicha', 'embutido'] },

  // LATICÍNIOS — leite
  { match: ['piracanjuba', 'italac', 'parmalat', 'betania', 'betânia', 'ninho', 'leite integral'],
    add: ['leite', 'leite integral', 'leite desnatado', 'laticinios'] },

  // HIGIENE — shampoo / sabonete
  { match: ['dove', 'pantene', 'seda', 'head shoulders', 'clear shampoo'],
    add: ['shampoo', 'xampu', 'cabelo', 'higiene'] },

  // LIMPEZA — detergente
  { match: ['ypê', 'ype', 'limpol', 'limpeza detergente'],
    add: ['detergente', 'limpeza', 'louça'] },

  // LIMPEZA — sabão
  { match: ['omo', 'ariel', 'surf', 'brilhante'],
    add: ['sabao', 'sabão', 'sabao em po', 'sabão em pó', 'lavar roupa'] },
];

async function enriquecerSinonimos() {
  console.log("🚀 Enriquecendo sinônimos dos produtos...\n");

  const productsSnap = await db.collection("products").get();
  console.log(`📦 ${productsSnap.size} produtos encontrados\n`);

  const BATCH_SIZE = 400;
  let batch   = db.batch();
  let count   = 0;
  let total   = 0;
  let lotes   = 0;

  for (const doc of productsSnap.docs) {
    const d = doc.data();
    const nomeLower = (d.name || '').toLowerCase();
    const sinAtual  = (d.synonyms || []).map(s => s.toLowerCase());

    const novos = [];

    for (const regra of REGRAS) {
      const bate = regra.match.some(m => nomeLower.includes(m));
      if (!bate) continue;

      for (const sin of regra.add) {
        if (!sinAtual.includes(sin) && !novos.includes(sin)) {
          novos.push(sin);
        }
      }
    }

    if (novos.length > 0) {
      console.log(`  ✅ ${d.name} → +[${novos.join(', ')}]`);
      batch.update(doc.ref, {
        synonyms: FieldValue.arrayUnion(...novos)
      });
      count++;
      total++;

      if (count >= BATCH_SIZE) {
        await batch.commit();
        lotes++;
        batch = db.batch();
        count = 0;
      }
    }
  }

  if (count > 0) {
    await batch.commit();
    lotes++;
  }

  console.log("\n══════════════════════════════════════");
  console.log("✅ SINÔNIMOS ENRIQUECIDOS!");
  console.log(`   Produtos atualizados: ${total}`);
  console.log("══════════════════════════════════════\n");

  // Agora atualiza a ofertas_v2 com os novos sinônimos
  console.log("🔄 Atualizando sinônimos na ofertas_v2...");
  const productsSnapNew = await db.collection("products").get();
  const productsMap = {};
  productsSnapNew.forEach(doc => {
    productsMap[doc.id] = doc.data().synonyms || [];
  });

  const ofertasSnap = await db.collection("ofertas_v2").get();
  let batch2 = db.batch();
  let count2 = 0;
  let total2 = 0;
  let lotes2 = 0;

  for (const doc of ofertasSnap.docs) {
    const productId = doc.data().productId || '';
    const novosSnon = productsMap[productId];
    if (novosSnon && novosSnon.length > 0) {
      batch2.update(doc.ref, { synonyms: novosSnon });
      count2++;
      total2++;
      if (count2 >= BATCH_SIZE) {
        await batch2.commit();
        lotes2++;
        batch2 = db.batch();
        count2 = 0;
      }
    }
  }

  if (count2 > 0) {
    await batch2.commit();
    lotes2++;
  }

  console.log(`✅ ${total2} ofertas_v2 atualizadas com novos sinônimos\n`);
  console.log("🎉 Pronto! Agora 'cerveja' vai encontrar Brahma, Skol e Heineken!");
}

enriquecerSinonimos().catch(err => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
