/**
 * @file backfillUserId.ts
 * @description Script de migração: adicionar user_id UUID a todos os usuários existentes
 * @date 2026-04-26
 * 
 * Uso:
 *   npx ts-node scripts/backfillUserId.ts --dry-run  (visualizar mudanças)
 *   npx ts-node scripts/backfillUserId.ts             (executar migração)
 *   npx ts-node scripts/backfillUserId.ts --verify    (verificar resultado)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Configuração
const BATCH_SIZE = 100;
const DRY_RUN = process.argv.includes('--dry-run');
const VERIFY_ONLY = process.argv.includes('--verify');

interface MigrationStats {
  totalUsers: number;
  migratedUsers: number;
  failedUsers: number;
  skippedUsers: number;
  canonicalUpdated: number;
  aliasesUpdated: number;
  duration_ms: number;
}

const stats: MigrationStats = {
  totalUsers: 0,
  migratedUsers: 0,
  failedUsers: 0,
  skippedUsers: 0,
  canonicalUpdated: 0,
  aliasesUpdated: 0,
  duration_ms: 0,
};

// ===== INICIALIZAÇÃO =====

function initializeFirebase() {
  const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');

  if (fs.existsSync(serviceAccountPath)) {
    return initializeApp({
      credential: cert(serviceAccountPath),
    });
  }

  console.log('[Backfill] service-account.json nao encontrado, usando credenciais padrao');
  return initializeApp();

}

// ===== VERIFICAÇÃO =====

async function verifyMigration() {
  console.log('\n📊 VERIFICANDO MIGRAÇÃO...\n');
  
  const db = getFirestore();
  
  // 1. Contar usuários COM user_id
  const withUuid = await db
    .collection('users')
    .where('user_id', '!=', '')
    .count()
    .get();
  
  console.log(`✓ Usuários com user_id: ${withUuid.data().count}`);
  
  // 2. Contar usuários SEM user_id
  const withoutUuid = await db
    .collection('users')
    .where('user_id', '==', undefined)
    .count()
    .get();
  
  console.log(`✗ Usuários SEM user_id: ${withoutUuid.data().count}`);
  
  if (withoutUuid.data().count === 0) {
    console.log('\n✅ MIGRAÇÃO COMPLETA! Todos os usuários têm user_id');
  } else {
    console.log(`\n⚠️  Ainda há ${withoutUuid.data().count} usuários para migrar`);
  }
}

// ===== MIGRAÇÃO =====

async function migrateUsers() {
  const startTime = Date.now();
  const db = getFirestore();

  try {
    console.log(`\n🚀 INICIANDO MIGRAÇÃO${DRY_RUN ? ' (DRY RUN)' : ''}...\n`);

    // 1. Buscar todos os usuários sem user_id
    let query = db.collection('users').where('user_id', '==', undefined);
    let snap = await query.get();
    
    stats.totalUsers = snap.size;
    console.log(`📋 Total de usuários a migrar: ${stats.totalUsers}\n`);

    if (stats.totalUsers === 0) {
      console.log('✅ Nenhum usuário para migrar! Já estão todos com user_id.\n');
      return;
    }

    // 2. Processar em batches
    let batchCount = 0;
    let currentBatch = 0;

    for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const docs = snap.docs.slice(i, i + BATCH_SIZE);
      currentBatch++;

      console.log(`\n📦 Batch ${currentBatch}/${Math.ceil(stats.totalUsers / BATCH_SIZE)}`);
      console.log(`   Processando usuários ${i + 1}-${Math.min(i + BATCH_SIZE, stats.totalUsers)}...`);

      for (const userDoc of docs) {
        try {
          const userData = userDoc.data();
          const userId = userDoc.id;

          // Verificar se já migrado
          if (userData.user_id && userData.user_id !== '') {
            console.log(`   ⊘ ${userId}: já tem user_id`);
            stats.skippedUsers++;
            continue;
          }

          // Gerar novo UUID
          const user_id = randomUUID();
          const now = Timestamp.now();

          // 1. Atualizar document em users/
          batch.update(userDoc.ref, {
            user_id,
            user_id_migrated_at: now,
          });

          // 2. Atualizar canonical_identities
          const canonicalRef = db.collection('canonical_identities').doc(userId);
          const canonicalSnap = await canonicalRef.get();

          if (canonicalSnap.exists) {
            batch.update(canonicalRef, {
              user_id,
              user_id_backfilled_at: now,
            });
            stats.canonicalUpdated++;
          }

          // 3. Atualizar identity_aliases
          const aliasSnap = await db.collection('identity_aliases')
            .where('canonicalUserId', '==', userId)
            .get();

          for (const aliasDoc of aliasSnap.docs) {
            batch.update(aliasDoc.ref, { user_id });
            stats.aliasesUpdated++;
          }

          stats.migratedUsers++;
          console.log(`   ✓ ${userId}: novo user_id = ${user_id}`);
        } catch (err) {
          stats.failedUsers++;
          console.error(`   ✗ ${userDoc.id}: erro -`, err);
        }
      }

      // Executar batch
      if (!DRY_RUN) {
        await batch.commit();
        console.log(`   ✅ Batch ${currentBatch} commitado`);
      } else {
        console.log(`   📋 DRY RUN: 0 mudanças confirmadas (modo preview)`);
      }

      batchCount++;
    }

    stats.duration_ms = Date.now() - startTime;

    // Resultado
    console.log('\n' + '='.repeat(60));
    console.log('📊 RELATÓRIO DE MIGRAÇÃO');
    console.log('='.repeat(60));
    console.log(`✓ Usuários migrados:     ${stats.migratedUsers}`);
    console.log(`⊘ Usuários pulados:      ${stats.skippedUsers}`);
    console.log(`✗ Usuários com erro:     ${stats.failedUsers}`);
    console.log(`→ Canonical atualizados: ${stats.canonicalUpdated}`);
    console.log(`→ Aliases atualizados:   ${stats.aliasesUpdated}`);
    console.log(`⏱️  Tempo total:          ${stats.duration_ms}ms (${(stats.duration_ms / 1000).toFixed(2)}s)`);
    console.log('='.repeat(60));

    if (DRY_RUN) {
      console.log('\n📋 DRY RUN MODO: Nenhuma mudança foi confirmada.');
      console.log('   Execute sem --dry-run para aplicar as mudanças.\n');
    } else {
      console.log('\n✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!\n');
    }
  } catch (err) {
    console.error('\n❌ ERRO DURANTE MIGRAÇÃO:', err);
    process.exit(1);
  }
}

// ===== MAIN =====

async function main() {
  try {
    initializeFirebase();

    if (VERIFY_ONLY) {
      await verifyMigration();
    } else {
      await migrateUsers();
      
      // Verificar resultado
      console.log('Verificando resultado...');
      await verifyMigration();
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ ERRO FATAL:', err);
    process.exit(1);
  }
}

main();
