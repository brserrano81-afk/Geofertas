// ============================================================
// criar_ofertas_completas.js
// Cria coleção "ofertas_completas" unindo:
//   - offers     (preço, validade, categoria)
//   - markets    (nome, endereço, lat, lng)
//   - products   (sinônimos para busca)
// Resultado: WK5A busca EM UMA SÓ coleção, sem joins
// ============================================================

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");

initializeApp({ credential: cert(serviceAccount) });

const db = getFirestore();

async function criarOfertasCompletas() {
  console.log("🚀 Iniciando criação da coleção ofertas_completas...\n");

  // ── 1. Carregar mercados em memória ──────────────────────────
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

  // ── 2. Carregar produtos em memória ──────────────────────────
  console.log("📦 Carregando products...");
  const productsSnap = await db.collection("products").get();
  const productsMap = {};
  productsSnap.forEach((doc) => {
    const d = doc.data();
    productsMap[doc.id] = {
      productCategory: d.category  || "",
      synonyms:        d.synonyms  || [],
      productNameBase: d.name      || "",
    };
  });
  console.log(`✅ ${Object.keys(productsMap).length} produtos carregados.\n`);

  // ── 3. Carregar ofertas ativas ───────────────────────────────
  console.log("📋 Carregando ofertas ativas...");
  const offersSnap = await db
    .collection("offers")
    .where("active", "==", true)
    .get();
  console.log(`✅ ${offersSnap.size} ofertas ativas encontradas.\n`);

  if (offersSnap.size === 0) {
    console.log("⚠️ Nenhuma oferta ativa. Encerrando.");
    return;
  }

  // ── 4. Apagar coleção anterior (se existir) ─────────────────
  console.log("🗑️  Limpando ofertas_completas anteriores...");
  const antigasSnap = await db.collection("ofertas_completas").get();
  const BATCH_SIZE = 400;
  if (!antigasSnap.empty) {
    let delBatch = db.batch();
    let delCount = 0;
    let delLotes = 0;
    for (const doc of antigasSnap.docs) {
      delBatch.delete(doc.ref);
      delCount++;
      if (delCount >= BATCH_SIZE) {
        await delBatch.commit();
        delLotes++;
        delBatch = db.batch();
        delCount = 0;
      }
    }
    if (delCount > 0) await delBatch.commit();
    console.log(`✅ ${antigasSnap.size} documentos antigos removidos.\n`);
  } else {
    console.log("✅ Coleção estava vazia, nada a remover.\n");
  }

  // ── 5. Montar e salvar ofertas_completas ────────────────────
  console.log("💾 Montando e salvando ofertas_completas...");

  let batch     = db.batch();
  let count     = 0;
  let total     = 0;
  let semMarket = 0;
  let lotes     = 0;

  for (const doc of offersSnap.docs) {
    const o = doc.data();

    const marketId = o.marketId || o.market_id || null;
    const market   = marketId ? (marketsMap[marketId] || null) : null;

    if (!market) {
      console.warn(`  ⚠️ Oferta ${doc.id} sem mercado válido — pulando`);
      semMarket++;
      continue;
    }

    const productId = o.productId || null;
    const product   = productId ? (productsMap[productId] || {}) : {};

    // Monta documento unificado
    const novoDoc = {
      // --- Identificação ---
      ofertaId:   doc.id,
      productId:  productId || "",
      marketId:   marketId,

      // --- Produto ---
      name:            o.productName || o.name || "",
      productNameBase: product.productNameBase || "",
      category:        o.category || product.productCategory || "",
      synonyms:        product.synonyms || [],
      price:           o.price || 0,

      // --- Mercado ---
      marketName:    market.marketName,
      marketAddress: market.marketAddress,
      marketLat:     market.marketLat,
      marketLng:     market.marketLng,
      networkName:   o.networkName || market.networkId || "",

      // --- Validade ---
      active:    true,
      startsAt:  o.startsAt  || null,
      expiresAt: o.expiresAt || null,

      // --- Controle ---
      _criadoEm: new Date().toISOString(),
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

  // Último lote
  if (count > 0) {
    await batch.commit();
    lotes++;
    console.log(`  ✅ Lote ${lotes} salvo (${total} documentos)`);
  }

  // ── 6. Resumo ────────────────────────────────────────────────
  console.log("\n======================================");
  console.log("✅ OFERTAS_COMPLETAS CRIADA COM SUCESSO!");
  console.log(`   Ofertas ativas:            ${offersSnap.size}`);
  console.log(`   Documentos salvos:         ${total}`);
  console.log(`   Puladas (sem mercado):     ${semMarket}`);
  console.log(`   Lotes gravados:            ${lotes}`);
  console.log("======================================\n");
  console.log("👉 Próximo passo: atualizar WK5A para buscar em 'ofertas_completas'");
  console.log("   → Filtrar por active == true");
  console.log("   → Buscar por synonyms, name e category");
  console.log("   → marketLat e marketLng já embutidos!\n");
}

criarOfertasCompletas().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
