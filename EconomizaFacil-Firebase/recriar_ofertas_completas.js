// ============================================================
// recriar_ofertas_completas.js
// Recria a coleção "ofertas_completas" corretamente
// ✅ Extrai productId do nome do documento (ex: carone_arroz-tio-joao-5kg)
// ✅ Copia sinônimos do produto correto
// ✅ Corrige category vinda do produto (não da oferta)
// ============================================================

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function recriarOfertasCompletas() {
  console.log("🚀 Recriando ofertas_completas com sinônimos corretos...\n");

  // 1. Carregar mercados
  console.log("📦 Carregando markets...");
  const marketsSnap = await db.collection("markets").get();
  const marketsMap = {};
  marketsSnap.forEach((doc) => {
    const d = doc.data();
    marketsMap[doc.id] = {
      marketName:    d.name    || "Mercado sem nome",
      marketAddress: d.address || "",
      marketLat:     d.location ? (d.location.lat || null) : null,
      marketLng:     d.location ? (d.location.lng || null) : null,
      networkId:     d.networkId || "",
    };
  });
  console.log(`✅ ${Object.keys(marketsMap).length} mercados carregados.\n`);

  // 2. Carregar produtos
  console.log("📦 Carregando products...");
  const productsSnap = await db.collection("products").get();
  const productsMap = {};
  productsSnap.forEach((doc) => {
    const d = doc.data();
    productsMap[doc.id] = {
      category: d.category || "",
      synonyms: d.synonyms || [],
      name:     d.name     || "",
    };
  });
  console.log(`✅ ${Object.keys(productsMap).length} produtos carregados.\n`);

  // 3. Carregar ofertas ativas
  console.log("📋 Carregando ofertas ativas...");
  const offersSnap = await db.collection("offers").where("active", "==", true).get();
  console.log(`✅ ${offersSnap.size} ofertas ativas encontradas.\n`);

  // 4. Apagar coleção anterior
  console.log("🗑️  Limpando ofertas_completas anteriores...");
  const antigasSnap = await db.collection("ofertas_completas").get();
  if (!antigasSnap.empty) {
    const BATCH_DEL = 400;
    let delBatch = db.batch();
    let delCount = 0;
    for (const doc of antigasSnap.docs) {
      delBatch.delete(doc.ref);
      delCount++;
      if (delCount >= BATCH_DEL) {
        await delBatch.commit();
        delBatch = db.batch();
        delCount = 0;
      }
    }
    if (delCount > 0) await delBatch.commit();
    console.log(`✅ ${antigasSnap.size} documentos removidos.\n`);
  } else {
    console.log("✅ Coleção estava vazia.\n");
  }

  // 5. Recriar com dados corretos
  console.log("💾 Recriando ofertas_completas...");

  const BATCH_SIZE = 400;
  let batch = db.batch();
  let count = 0;
  let total = 0;
  let semMarket = 0;
  let semProduto = 0;
  let lotes = 0;

  const novaData = new Date();
  novaData.setFullYear(novaData.getFullYear() + 1);
  const novaDataISO = novaData.toISOString();

  for (const doc of offersSnap.docs) {
    const o = doc.data();

    // Pegar marketId
    const marketId = o.marketId || o.market_id || null;
    const market = marketId ? (marketsMap[marketId] || null) : null;
    if (!market) {
      console.warn(`  ⚠️ Sem mercado: ${doc.id}`);
      semMarket++;
      continue;
    }

    // Extrair productId do nome do documento
    // Padrão: "mercadoId_productId" ex: "carone_arroz-tio-joao-5kg"
    let productId = o.productId || "";
    if (!productId) {
      const docId = doc.id;
      const underscoreIdx = docId.indexOf("_");
      if (underscoreIdx !== -1) {
        productId = docId.substring(underscoreIdx + 1);
      }
    }

    const product = productId ? (productsMap[productId] || null) : null;
    if (!product) {
      console.warn(`  ⚠️ Sem produto: ${doc.id} → productId: "${productId}"`);
      semProduto++;
    }

    const novoDoc = {
      // Identificação
      ofertaId:   doc.id,
      productId:  productId || "",
      marketId:   marketId,

      // Produto
      name:            o.productName || o.name || "",
      productNameBase: product ? product.name : "",
      category:        product ? product.category : (o.category || ""),
      synonyms:        product ? product.synonyms : [],
      price:           o.price || 0,

      // Mercado
      marketName:    market.marketName,
      marketAddress: market.marketAddress,
      marketLat:     market.marketLat,
      marketLng:     market.marketLng,
      networkName:   o.networkName || market.networkId || "",

      // Validade — estendida para teste
      active:    true,
      startsAt:  o.startsAt  || null,
      expiresAt: novaDataISO,

      // Controle
      _criadoEm:       new Date().toISOString(),
      _testeExtendido: true,
    };

    const novoRef = db.collection("ofertas_completas").doc(doc.id);
    batch.set(novoRef, novoDoc);
    count++;
    total++;

    if (count >= BATCH_SIZE) {
      await batch.commit();
      lotes++;
      console.log(`  ✅ Lote ${lotes} salvo (${total} documentos)`);
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    lotes++;
    console.log(`  ✅ Lote ${lotes} salvo (${total} documentos)`);
  }

  // 6. Resumo
  console.log("\n======================================");
  console.log("✅ OFERTAS_COMPLETAS RECRIADA!");
  console.log(`   Ofertas salvas:          ${total}`);
  console.log(`   Sem mercado (puladas):   ${semMarket}`);
  console.log(`   Sem produto (sem sinon): ${semProduto}`);
  console.log("======================================\n");

  // 7. Mostrar exemplo de verificação
  console.log("🔍 Verificando arroz...");
  const check = await db.collection("ofertas_completas")
    .where("productId", "==", "arroz-tio-joao-5kg")
    .limit(3)
    .get();
  if (check.empty) {
    console.log("  ⚠️ Nenhum arroz encontrado — verifique o productId");
  } else {
    check.forEach(d => {
      const data = d.data();
      console.log(`  ✅ ${data.name} | ${data.marketName} | R$${data.price} | sinônimos: ${data.synonyms.join(", ")}`);
    });
  }
}

recriarOfertasCompletas().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
