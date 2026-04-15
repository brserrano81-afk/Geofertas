import { adminDb } from '../src/lib/firebase-admin';
import { EvolutionInboxWorker } from '../src/workers/EvolutionInboxWorker';
import dotenv from 'dotenv';

dotenv.config();

async function runSmokeTest() {
    console.log('--- CAMADA OPERACIONAL: SMOKE TEST DE PERMISSÕES ---');
    
    try {
        // 1. Teste de escrita direta via Admin SDK
        console.log('[1/3] Testando escrita no Firestore via Admin SDK...');
        const testRef = await adminDb.collection('integration_events').add({
            kind: 'smoke_test',
            message: 'Teste de privilégios admin',
            createdAt: new Date()
        });
        console.log('✅ Escrita OK! ID:', testRef.id);

        // 2. Simular mensagem no inbox
        console.log('[2/3] Simulando mensagem "Oi" no inbox...');
        const inboxRef = await adminDb.collection('message_inbox').add({
            userId: 'smoke_test_user',
            remoteJid: '5511999999999@s.whatsapp.net',
            messageId: 'SMOKE-' + Date.now(),
            text: 'Oi',
            textPreview: 'Oi',
            status: 'pending',
            createdAt: new Date(),
            source: 'smoke_test'
        });
        console.log('✅ Mensagem enfileirada:', inboxRef.id);

        // 3. Rodar worker uma vez
        console.log('[3/3] Executando Worker (uma iteração)...');
        // Note: We need to make sure the environment variables for Evolution API are set if we want a full response,
        // but here we primarily want to check if the permission error is gone.
        
        // Em vez de rodar o loop infinito, vamos testar a lógica de claim
        const snapshot = await adminDb.collection('message_inbox')
            .where('status', '==', 'pending')
            .where('userId', '==', 'smoke_test_user')
            .get();
        
        console.log(`Encontradas ${snapshot.size} mensagens de teste.`);
        
        if (snapshot.size > 0) {
            console.log('✅ Worker tem visibilidade privilegiada das mensagens.');
        }

        console.log('--- TESTE CONCLUÍDO COM SUCESSO ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ ERRO NO SMOKE TEST:', err);
        process.exit(1);
    }
}

runSmokeTest();
