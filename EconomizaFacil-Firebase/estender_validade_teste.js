// ============================================================
// estender_validade_teste.js
// Estende expiresAt de todas as ofertas em "ofertas_completas"
// para daqui 1 ano — apenas para testes
// NÃO apaga nada, só atualiza a data
// ============================================================

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const serviceAccount = require("./serviceAccountKey.json");
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function estenderValidade() {
  console.log("🚀 Estendendo validade das ofertas para testes...\n");

  const snap = await db.collection("ofertas_completas").get();
  console.log(`📋 ${snap.size} documentos encontrados.\n`);

  const novaData = new Date();
  novaData.setFullYear(novaData.getFullYear() + 1);
  const novaDataISO = novaData.toISOString();

  const BATCH_SIZE = 400;
  let batch = db.batch();
  let count = 0;
  let total = 0;
  let lotes = 0;

  for (const doc of snap.docs) {
    batch.update(doc.ref, {
      expiresAt: novaDataISO,
      active: true,
      _testeExtendido: true
    });
    count++;
    total++;

    if (count >= BATCH_SIZE) {
      await batch.commit();
      lotes++;
      console.log(`  ✅ Lote ${lotes} salvo`);
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    lotes++;
    console.log(`  ✅ Lote ${lotes} salvo`);
  }

  console.log("\n======================================");
  console.log("✅ VALIDADE ESTENDIDA COM SUCESSO!");
  console.log(`   Ofertas atualizadas: ${total}`);
  console.log(`   Nova data: ${novaDataISO}`);
  console.log("======================================\n");
  console.log("⚠️  Lembre de reverter antes de ir para produção!");
}

estenderValidade().catch((err) => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
