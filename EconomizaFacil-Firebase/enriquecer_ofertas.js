/**
 * enriquecer_ofertas.js
 * 
 * O QUE FAZ:
 *   Lê todos os mercados (markets) do Firestore e injeta os campos
 *   marketName, marketAddress, marketLat, marketLng diretamente em
 *   cada oferta ativa (offers). 
 *   
 *   Resultado: WK5A não precisa mais buscar a coleção `markets`,
 *   eliminando ~3-5 segundos de latência.
 *
 * COMO RODAR:
 *   1. npm install firebase-admin  (se ainda não instalado)
 *   2. node enriquecer_ofertas.js
 *
 * PRÉ-REQUISITO:
 *   Arquivo serviceAccount.json na mesma pasta
 *   (baixe em Firebase Console → Configurações → Contas de serviço)
 */

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccount.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "geofertas-325b0",
});

const db = admin.firestore();

async function enriquecerOfertas() {
  console.log("🚀 Iniciando enriquecimento de ofertas...\n");

  // ── 1. Carregar todos os mercados em memória ──────────────────────────────
  console.log("📦 Carregando mercados...");
  const marketsSnap = await db.collection("markets").get();

  const mercadosMap = {};
  marketsSnap.forEach((doc) => {
    const d = doc.data();
    mercadosMap[doc.id] = {
      marketName:    d.name    || d.marketName    || "",
      marketAddress: d.address || d.marketAddress || "",
      marketLat:     d.lat     ?? d.marketLat     ?? null,
      marketLng:     d.lng     ?? d.marketLng     ?? null,
    };
  });

  const totalMercados = Object.keys(mercadosMap).length;
  console.log(`   ✅ ${totalMercados} mercados carregados.\n`);

  if (totalMercados === 0) {
    console.error("❌ Nenhum mercado encontrado. Verifique a coleção 'markets'.");
    process.exit(1);
  }

  // ── 2. Buscar ofertas ativas ──────────────────────────────────────────────
  console.log("🔍 Buscando ofertas ativas...");
  const offersSnap = await db
    .collection("offers")
    .where("active", "==", true)
    .get();

  console.log(`   ✅ ${offersSnap.size} ofertas ativas encontradas.\n`);

  if (offersSnap.size === 0) {
    console.log("ℹ️  Nenhuma oferta ativa. Nada a enriquecer.");
    process.exit(0);
  }

  // ── 3. Atualizar em batches de 400 ───────────────────────────────────────
  const BATCH_SIZE = 400;
  let batch = db.batch();
  let count = 0;
  let semMercado = 0;
  let processadas = 0;

  for (const doc of offersSnap.docs) {
    const oferta = doc.data();
    const marketId = oferta.marketId || oferta.market_id || oferta.mercadoId || null;

    if (!marketId || !mercadosMap[marketId]) {
      semMercado++;
      continue; // pula ofertas sem mercado válido
    }

    const { marketName, marketAddress, marketLat, marketLng } = mercadosMap[marketId];

    batch.update(doc.ref, {
      marketName,
      marketAddress,
      marketLat,
      marketLng,
      enrichedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    count++;
    processadas++;

    // Commit quando atingir o limite do batch
    if (count === BATCH_SIZE) {
      await batch.commit();
      console.log(`   💾 Batch commitado: ${processadas} ofertas atualizadas...`);
      batch = db.batch();
      count = 0;
    }
  }

  // Commit do batch final
  if (count > 0) {
    await batch.commit();
  }

  // ── 4. Resumo ─────────────────────────────────────────────────────────────
  console.log("\n═══════════════════════════════════════");
  console.log("✅ Enriquecimento concluído!");
  console.log(`   Ofertas enriquecidas : ${processadas}`);
  console.log(`   Sem mercado válido   : ${semMercado}`);
  console.log(`   Total processadas    : ${offersSnap.size}`);
  console.log("═══════════════════════════════════════\n");
  console.log("🎯 Próximo passo: atualize o WK5A para NÃO buscar a coleção 'markets'.");
  console.log("   Use os campos marketName/marketAddress/marketLat/marketLng direto da oferta.\n");
}

enriquecerOfertas().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
