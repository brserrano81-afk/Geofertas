// ============================================================
// criar_ofertas_v2.js — SCRIPT DEFINITIVO
// Cria coleção "ofertas_v2" unindo:
//   offers    → preço, nome, categoria, validade
//   markets   → location.lat, location.lng, address, name
//   products  → synonyms
//
// Documento final pronto para o WK5A buscar em UMA só coleção
// ID do documento: {marketId}_{productId}
// ============================================================

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function criarOfertasV2() {
  console.log("🚀 Criando ofertas_v2 (coleção definitiva)...\n");

  // ── 1. Mercados ──────────────────────────────────────────────
  console.log("📦 Carregando markets...");
  const marketsSnap = await db.collection("markets").get();
  const marketsMap = {};
  marketsSnap.forEach((doc) => {
    const d = doc.data();
    marketsMap[doc.id] = {
      marketName:    d.name    || "",
      marketAddress: d.address || "",
      marketLat:     d.location ? (d.location.lat ?? null) : null,
      marketLng:     d.location ? (d.location.lng ?? null) : null,
      networkId:     d.networkId || "",
    };
  });
  console.log(`✅ ${Object.keys(marketsMap).length} mercados\n`);

  // ── 2. Produtos ──────────────────────────────────────────────
  console.log("📦 Carregando products...");
  const productsSnap = await db.collection("products").get();
  const productsMap = {};
  productsSnap.forEach((doc) => {
    const d = doc.data();
    productsMap[doc.id] = {
      productName: d.name     || "",
      category:    d.category || "",
      synonyms:    d.synonyms || [],
    };
  });
  console.log(`✅ ${Object.keys(productsMap).length} produtos\n`);

  // ── 3. Ofertas ativas ────────────────────────────────────────
  console.log("📋 Carregando offers ativas...");
  const offersSnap = await db.collection("offers").where("active", "==", true).get();
  console.log(`✅ ${offersSnap.size} ofertas ativas\n`);

  // ── 4. Apagar ofertas_v2 anterior ────────────────────────────
  console.log("🗑️  Limpando ofertas_v2 anterior...");
  const antigasSnap = await db.collection("ofertas_v2").get();
  if (!antigasSnap.empty) {
    let delBatch = db.batch();
    let delCount = 0;
    for (const doc of antigasSnap.docs) {
      delBatch.delete(doc.ref);
      delCount++;
      if (delCount >= 400) {
        await delBatch.commit();
        delBatch = db.batch();
        delCount = 0;
      }
    }
    if (delCount > 0) await delBatch.commit();
    console.log(`✅ ${antigasSnap.size} removidos\n`);
  } else {
    console.log("✅ Já estava vazia\n");
  }

  // ── 5. Montar e salvar ───────────────────────────────────────
  console.log("💾 Criando documentos...");

  // Validade de 1 ano (para testes)
  const dataValidade = new Date();
  dataValidade.setFullYear(dataValidade.getFullYear() + 1);
  const validadeISO = dataValidade.toISOString();

  let batch    = db.batch();
  let count    = 0;
  let total    = 0;
  let erros    = 0;
  let lotes    = 0;
  const semLat = [];

  for (const doc of offersSnap.docs) {
    const o = doc.data();

    const marketId  = o.marketId  || null;
    const productId = o.productId || null;

    if (!marketId || !productId) {
      console.warn(`  ⚠️ Pulando ${doc.id} — marketId ou productId vazio`);
      erros++;
      continue;
    }

    const market  = marketsMap[marketId];
    const product = productsMap[productId];

    if (!market) {
      console.warn(`  ⚠️ Mercado não encontrado: ${marketId}`);
      erros++;
      continue;
    }

    if (!product) {
      console.warn(`  ⚠️ Produto não encontrado: ${productId}`);
      erros++;
      continue;
    }

    if (!market.marketLat) {
      semLat.push(marketId);
    }

    // ID limpo e previsível
    const novoId = `${marketId}_${productId}`;

    const novoDoc = {
      // ── Produto
      name:       o.productName || o.name || product.productName,
      productId:  productId,
      category:   product.category || o.category || "",
      synonyms:   product.synonyms || [],
      price:      o.price || 0,

      // ── Mercado
      marketId:      marketId,
      marketName:    market.marketName,
      marketAddress: market.marketAddress,
      marketLat:     market.marketLat,
      marketLng:     market.marketLng,
      networkName:   o.networkName || market.networkId || "",

      // ── Validade
      active:    true,
      startsAt:  o.startsAt  || null,
      expiresAt: validadeISO,

      // ── Controle
      _criadoEm: new Date().toISOString(),
    };

    const novoRef = db.collection("ofertas_v2").doc(novoId);
    batch.set(novoRef, novoDoc);
    count++;
    total++;

    if (count >= 400) {
      await batch.commit();
      lotes++;
      console.log(`  ✅ Lote ${lotes} — ${total} documentos`);
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    lotes++;
    console.log(`  ✅ Lote ${lotes} — ${total} documentos`);
  }

  // ── 6. Resumo ────────────────────────────────────────────────
  console.log("\n══════════════════════════════════════");
  console.log("✅ OFERTAS_V2 CRIADA COM SUCESSO!");
  console.log(`   Total salvo:     ${total}`);
  console.log(`   Erros/pulados:   ${erros}`);
  console.log(`   Lotes:           ${lotes}`);
  if (semLat.length > 0) {
    const unicos = [...new Set(semLat)];
    console.log(`\n⚠️  Mercados SEM lat/lng (${unicos.length}):`);
    unicos.forEach(m => console.log(`     → ${m}`));
    console.log("   (verifique o campo 'location' nesses mercados no Firestore)");
  }
  console.log("══════════════════════════════════════\n");

  // ── 7. Verificação rápida ────────────────────────────────────
  console.log("🔍 Verificação — buscando arroz:");
  const check = await db.collection("ofertas_v2")
    .where("productId", "==", "arroz-tio-joao-5kg")
    .get();

  if (check.empty) {
    console.log("  ❌ Nenhum arroz encontrado — verifique os dados");
  } else {
    check.forEach(d => {
      const data = d.data();
      console.log(`  ✅ ${data.name} | ${data.marketName} | R$${data.price}`);
      console.log(`     lat: ${data.marketLat} | lng: ${data.marketLng}`);
      console.log(`     sinônimos: ${data.synonyms.slice(0,4).join(", ")}`);
    });
  }
}

criarOfertasV2().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
