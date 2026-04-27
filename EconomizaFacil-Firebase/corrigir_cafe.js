/**
 * corrigir_cafe.js
 * Corrige a categoria do café para 'mercearia' e garante sinônimos corretos
 */

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'geofertas-325b0'
});

const db = admin.firestore();

async function corrigirCafe() {
  console.log('☕ Corrigindo categoria do café...\n');

  // Buscar todos os cafés
  const snap = await db.collection('ofertas_v2').get();
  
  let batch = db.batch();
  let count = 0;
  let batchCount = 0;

  snap.forEach(doc => {
    const d = doc.data();
    const nome = (d.nome || '').toLowerCase();
    const cat  = (d.categoria || '').toLowerCase();
    
    // Identifica se é café
    const ehCafe = nome.includes('café') || nome.includes('cafe') || 
                   nome.includes('nescafé') || nome.includes('nescafe') ||
                   nome.includes('nespresso');

    if (ehCafe && cat !== 'mercearia') {
      batch.update(doc.ref, { categoria: 'mercearia' });
      count++;
      batchCount++;
      console.log(`   ✅ ${d.nome} → mercearia`);
    }

    if (batchCount === 400) {
      batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  });

  if (batchCount > 0) await batch.commit();

  console.log(`\n✅ ${count} cafés corrigidos para categoria mercearia!\n`);
}

corrigirCafe().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
