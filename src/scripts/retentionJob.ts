// ─────────────────────────────────────────────────────────────
// retentionJob.ts — Job de Retenção de Dados LGPD
// Identifica usuários inativos há >12 meses e anonimiza.
//
// Execução: npx ts-node src/scripts/retentionJob.ts
// Pode ser agendado como Cloud Function (cron mensal) ou
// chamado manualmente pelo admin.
//
// LGPD — art. 16: "Os dados pessoais serão eliminados após
// o término de seu tratamento."
// ─────────────────────────────────────────────────────────────

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import * as path from 'path';
import * as fs from 'fs';

// ── Inicializar Firebase Admin ──────────────────────────────
const serviceAccountPath = path.resolve(process.cwd(), 'service-account.json');
if (!fs.existsSync(serviceAccountPath)) {
    console.error('[RetentionJob] ERRO: service-account.json não encontrado.');
    console.error('[RetentionJob] Crie o arquivo em: ' + serviceAccountPath);
    process.exit(1);
}

initializeApp({ credential: cert(serviceAccountPath) });
const db = getFirestore();

// ── Configurações ───────────────────────────────────────────
const RETENTION_DAYS = 365;          // 12 meses = padrão LGPD
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_LIMIT = 400;

console.log(`[RetentionJob] Iniciando... DryRun=${DRY_RUN} | Retenção=${RETENTION_DAYS} dias`);

// ── Funções auxiliares ──────────────────────────────────────
function generateAnonymousId(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = (hash << 5) - hash + userId.charCodeAt(i);
        hash |= 0;
    }
    return `anon_${Math.abs(hash).toString(36)}`;
}

async function clearSubcollection(userId: string, subcollection: string): Promise<number> {
    const colRef = db.collection('users').doc(userId).collection(subcollection);
    const snap = await colRef.get();
    if (snap.empty) return 0;

    let deleted = 0;
    let batch = db.batch();
    let opCount = 0;

    for (const docSnap of snap.docs) {
        batch.delete(docSnap.ref);
        opCount++;
        deleted++;

        if (opCount >= BATCH_LIMIT) {
            if (!DRY_RUN) await batch.commit();
            batch = db.batch();
            opCount = 0;
        }
    }

    if (opCount > 0 && !DRY_RUN) await batch.commit();
    return deleted;
}

// ── Job principal ────────────────────────────────────────────
async function runRetentionJob(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

    console.log(`[RetentionJob] Cutoff: ${cutoffDate.toISOString()} (${RETENTION_DAYS} dias)`);

    const usersRef = db.collection('users');
    const snap = await usersRef.get();

    let processed = 0;
    let anonymized = 0;
    let skipped = 0;

    for (const userDoc of snap.docs) {
        processed++;
        const data = userDoc.data();
        const userId = userDoc.id;

        // Pular usuários já anonimizados
        if (data.anonymizedAt) {
            skipped++;
            continue;
        }

        // Pular usuários com consentimento personalizado de retenção maior
        const userRetentionDays = Number(data.dataRetentionDays || RETENTION_DAYS);
        const userCutoff = new Date();
        userCutoff.setDate(userCutoff.getDate() - userRetentionDays);
        const userCutoffTs = Timestamp.fromDate(userCutoff);

        // Verificar última interação
        const lastInteractionAt = data.lastInteractionAt as Timestamp | undefined;

        if (!lastInteractionAt) {
            // Sem interação registrada — verificar data de criação
            const createdAt = data.createdAt as Timestamp | undefined;
            if (!createdAt || createdAt.toMillis() > userCutoffTs.toMillis()) {
                skipped++;
                continue;
            }
        } else if (lastInteractionAt.toMillis() > userCutoffTs.toMillis()) {
            // Usuário ativo dentro da janela de retenção
            skipped++;
            continue;
        }

        // Usuário elegível para anonimização
        console.log(`[RetentionJob] Anonimizando: ${userId} (última interação: ${lastInteractionAt?.toDate().toISOString() ?? 'N/A'})`);

        if (!DRY_RUN) {
            // Anonimizar perfil raiz
            await usersRef.doc(userId).set({
                name: null,
                lastMessagePreview: null,
                lastIntent: null,
                neighborhood: null,
                transportMode: null,
                consumption: null,
                busTicket: null,
                optimizationPreference: null,
                locationDeclaredAt: null,
                locationSource: null,
                userLocation: null,
                preferences: null,
                anonymizedAt: Timestamp.now(),
                retentionJobReason: 'inactivity_ttl',
                anonymousAlias: generateAnonymousId(userId),
            }, { merge: true });

            // Limpar sub-coleções
            const deletedInteractions = await clearSubcollection(userId, 'interactions');
            const deletedPurchases = await clearSubcollection(userId, 'purchases');
            const deletedLists = await clearSubcollection(userId, 'lists');

            console.log(`[RetentionJob] ✅ ${userId} anonimizado | interactions:${deletedInteractions} purchases:${deletedPurchases} lists:${deletedLists}`);
        } else {
            console.log(`[RetentionJob] [DRY_RUN] Seria anonimizado: ${userId}`);
        }

        anonymized++;
    }

    console.log(`\n[RetentionJob] ─────────────────────────────────────`);
    console.log(`[RetentionJob] Total processados : ${processed}`);
    console.log(`[RetentionJob] Anonimizados      : ${anonymized}`);
    console.log(`[RetentionJob] Ignorados (ativos): ${skipped}`);
    console.log(`[RetentionJob] DryRun            : ${DRY_RUN}`);
    console.log(`[RetentionJob] ─────────────────────────────────────`);
    console.log(`[RetentionJob] Concluído!`);
}

runRetentionJob().catch((err) => {
    console.error('[RetentionJob] ERRO FATAL:', err);
    process.exit(1);
});
