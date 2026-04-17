import { adminDb as db } from '../../src/lib/firebase-admin';
import { execSync } from 'child_process';

/**
 * Limpa o banco de dados para um usuário de teste
 */
async function clearTestUser(userId: string) {
    await db.collection('users').doc(userId).delete();
    await db.collection('user_conversations').doc(userId).delete();
    
    const inboxSnap = await db.collection('message_inbox').where('userId', '==', userId).get();
    for (const doc of inboxSnap.docs) await doc.ref.delete();
    
    const outboxSnap = await db.collection('message_outbox').where('userId', '==', userId).get();
    for (const doc of outboxSnap.docs) await doc.ref.delete();
}

/**
 * Roda o worker e verifica a saída gerada no message_outbox
 */
async function runWorkerAndCheckOutput(userId: string, expectedPattern: RegExp, stepName: string) {
    // Garante consentimento LGPD para o teste não travar no gate
    await db.collection('users').doc(userId).set({
        lgpdConsent: true,
        lgpdConsentAt: new Date(),
        updatedAt: new Date()
    }, { merge: true });

    console.log(`\n⚙️  Rodando Worker para: ${stepName}...`);
    try {
        execSync('npx tsx src/workers/EvolutionInboxWorker.ts --once', {
            env: { ...process.env, EVOLUTION_WORKER_POLL_MS: '100' },
            stdio: 'inherit'
        });
    } catch (err: any) {
        console.error('❌ Erro no Worker:', err);
    }

    const outboxSnap = await db.collection('message_outbox')
        .where('userId', '==', userId)
        .get();

    if (outboxSnap.empty) {
        const inboxSnap = await db.collection('message_inbox').where('userId', '==', userId).get();
        if (!inboxSnap.empty) {
            console.error('INBOX STATE:', inboxSnap.docs[0].data());
        }
        throw new Error(`❌ Falha [${stepName}]: Nenhuma resposta gerada no message_outbox.`);
    }

    const docs = outboxSnap.docs.sort((a, b) => {
        const tA = new Date(a.data().createdAtIso || a.data().createdAt?.toDate() || 0).getTime();
        const tB = new Date(b.data().createdAtIso || b.data().createdAt?.toDate() || 0).getTime();
        return tB - tA;
    });

    const outboxData = docs[0].data();
    if (!expectedPattern.test(outboxData.text)) {
        throw new Error(`❌ Falha [${stepName}]: Resposta incorreta.\nEsperado regex: ${expectedPattern}\nRecebido: "${outboxData.text}"`);
    }

    console.log(`✅ Sucesso [${stepName}]! Resposta bate com o esperado.`);
}

/**
 * 1. Teste do Fluxo de GPS
 * Simula a chegada de um locationMessage via webhook e valida o ChatService.
 */
async function testGpsFlow() {
    const userId = 'qa_loc_gps_' + Date.now();
    console.log(`\n=== INICIANDO TESTE 1: GPS (Worker -> ChatService) | User: ${userId} ===`);

    try {
        // Força estado AWAITING_INITIAL_LOCATION
        await db.collection('user_conversations').doc(userId).set({
            userId,
            current: 'AWAITING_INITIAL_LOCATION',
            prompt: 'Me manda sua localização',
            updatedAt: new Date().toISOString()
        });

        // Injeta locationMessage no inbox
        await db.collection('message_inbox').add({
            userId,
            remoteJid: `${userId}@s.whatsapp.net`,
            messageType: 'locationMessage',
            location: { lat: -20.2976, lng: -40.2958 },
            status: 'pending_test',
            receivedAtIso: new Date().toISOString(),
            createdAt: new Date()
        });

        // Verifica saída. Espera-se "Localização recebida"
        await runWorkerAndCheckOutput(userId, /Localiza\u00e7\u00e3o recebida/i, 'GPS Inbox');

        // Verifica estado atual
        const stateDoc = await db.collection('user_conversations').doc(userId).get();
        if (stateDoc.data()?.current !== 'IDLE') {
            throw new Error(`❌ Falha: Estado da conversa não resetou para IDLE após GPS. Estado atual: ${stateDoc.data()?.current}`);
        }
    } finally {
        await clearTestUser(userId);
    }
}

/**
 * 2. Teste do Fallback de Texto (Bairro) no estado AWAITING_INITIAL_LOCATION
 */
async function testTextFallbackFlow() {
    const userId = 'qa_loc_txt_' + Date.now();
    console.log(`\n=== INICIANDO TESTE 2: Fallback de Bairro em Texto | User: ${userId} ===`);

    try {
        // Força estado
        await db.collection('user_conversations').doc(userId).set({
            userId,
            current: 'AWAITING_INITIAL_LOCATION',
            prompt: 'Me manda sua localização',
            updatedAt: new Date().toISOString()
        });

        // Injeta texto simples com nome de bairro no inbox
        await db.collection('message_inbox').add({
            userId,
            remoteJid: `${userId}@s.whatsapp.net`,
            messageType: 'conversation',
            text: 'Jardim da Penha', // fallback tipico de texto
            status: 'pending_test',
            receivedAtIso: new Date().toISOString(),
            createdAt: new Date()
        });

        await runWorkerAndCheckOutput(userId, /vou usar \*Jardim da Penha\*/i, 'Text Fallback Inbox');

        // Verifica estado atual
        const stateDoc = await db.collection('user_conversations').doc(userId).get();
        if (stateDoc.data()?.current !== 'IDLE') {
            throw new Error(`❌ Falha: Estado não resetou após fallback de texto. Estado atual: ${stateDoc.data()?.current}`);
        }
    } finally {
        await clearTestUser(userId);
    }
}

/**
 * 3. Teste do Amnesia Guard
 * Verifica se, após responder à pergunta pendente, a próxima mensagem não 
 * recebe a mesma pergunta ("ainda estou aguardando...").
 */
async function testAmnesiaGuard() {
    const userId = 'qa_loc_amnesia_' + Date.now();
    console.log(`\n=== INICIANDO TESTE 3: Amnesia Guard | User: ${userId} ===`);

    try {
        await db.collection('user_conversations').doc(userId).set({
            userId,
            current: 'AWAITING_INITIAL_LOCATION',
            prompt: 'Me manda sua localização',
            updatedAt: new Date().toISOString()
        });

        // Primeiro: Injeta locationMessage para satisfazer a pendência
        await db.collection('message_inbox').add({
            userId,
            remoteJid: `${userId}@s.whatsapp.net`,
            messageType: 'locationMessage',
            location: { lat: -20.2976, lng: -40.2958 },
            status: 'pending_test',
            receivedAtIso: new Date().toISOString(),
            createdAt: new Date()
        });

        // Executa worker
        await runWorkerAndCheckOutput(userId, /Localiza\u00e7\u00e3o recebida/i, 'Satisfy State');

        // Segundo: Injeta uma mensagem genérica (ex: saudação)
        // O Amnesia Guard NÃO deve bloquear pois o estado deve ser IDLE.
        await db.collection('message_inbox').add({
            userId,
            remoteJid: `${userId}@s.whatsapp.net`,
            messageType: 'conversation',
            text: 'Oi',
            status: 'pending_test',
            receivedAtIso: new Date().toISOString(),
            createdAt: new Date()
        });

        // Verifica se a resposta foi normal (ex: saudação)
        // Se falhasse, receberia: "Desculpe, ainda estou aguardando..."
        await runWorkerAndCheckOutput(userId, /Eu sou o Economiza F\u00e1cil/i, 'Amnesia Guard Verify');
        
    } finally {
        await clearTestUser(userId);
    }
}

async function runAll() {
    console.log('🚀 Iniciando Suíte de Testes do Bloco de Localização...');
    try {
        await testGpsFlow();
        await testTextFallbackFlow();
        await testAmnesiaGuard();
        console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
        process.exit(0);
    } catch (err: any) {
        console.error('\n💥 TESTE FALHOU:', err.message);
        process.exit(1);
    }
}

runAll();
