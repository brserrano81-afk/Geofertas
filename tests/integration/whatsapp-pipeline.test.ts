import { adminDb as db } from '../../src/lib/firebase-admin';
import { execSync } from 'child_process';
import http from 'http';

/**
 * Teste de Integração: Pipeline WhatsApp First
 * 
 * Simula a chegada de uma mensagem no Firestore e verifica se o Worker
 * processa e gera a resposta no Outbox corretamente.
 */

async function runTest() {
    const testUserId = 'qa_test_flow_' + Date.now();
    const testText = 'Qual o preço do arroz?';
    
    console.log('🚀 Iniciando Teste de Pipeline WhatsApp...');

    // 1. Injeta mensagem Mock no Inbox
    console.log('📥 Injetando mensagem no Inbox...');
    const inboxRef = db.collection('message_inbox');
    const inboxDoc = await inboxRef.add({
        userId: testUserId,
        remoteJid: `${testUserId}@s.whatsapp.net`,
        text: testText,
        messageType: 'conversation',
        status: 'pending',
        receivedAtIso: new Date().toISOString(),
        createdAt: new Date()
    });

    // 2. Roda o Worker em modo "uma vez" (--once)
    // Para capturar o envio para a Evolution API, poderíamos mockar a URL nas envs,
    // mas aqui vamos focar em ver se ele gera o registro de 'message_outbox'.
    console.log('⚙️ Rodando EvolutionInboxWorker...');
    try {
        // Usamos tsx para rodar o arquivo TypeScript diretamente
        execSync('npx tsx src/workers/EvolutionInboxWorker.ts --once --verbose', {
            env: { ...process.env, EVOLUTION_WORKER_POLL_MS: '100', EVOLUTION_WORKER_USER_ID: testUserId },
            stdio: 'inherit'
        });
    } catch (err) {
        console.error('❌ Erro ao rodar o Worker:', err);
    }

    // 3. Verifica se gerou resposta no Outbox
    console.log('📤 Verificando Outbox...');
    const outboxSnap = await db.collection('message_outbox')
        .where('userId', '==', testUserId)
        .limit(1)
        .get();

    if (outboxSnap.empty) {
        throw new Error('❌ Falha: Nenhuma resposta gerada no message_outbox.');
    }

    const outboxData = outboxSnap.docs[0].data();
    console.log(`✅ Sucesso! Resposta encontrada: "${outboxData.text.slice(0, 50)}..."`);
    
    // Cleanup
    console.log('🧹 Limpando dados de teste...');
    await inboxDoc.delete();
    await outboxSnap.docs[0].ref.delete();
}

runTest()
    .then(() => {
        console.log('🎉 Teste de Integração Finalizado com Sucesso!');
        process.exit(0);
    })
    .catch(err => {
        console.error('💥 Teste Falhou:', err);
        process.exit(1);
    });
