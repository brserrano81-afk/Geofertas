import { adminDb as db } from '../src/lib/firebase-admin';

async function checkAudio() {
    console.log('--- BUSCANDO MENSAGENS DE ÁUDIO RECENTES ---');
    const snap = await db.collection('message_inbox')
        .where('messageType', 'in', ['audioMessage', 'ptt', 'audio'])
        .orderBy('receivedAtIso', 'desc')
        .limit(3)
        .get();

    if (snap.empty) {
        console.log('Nenhuma mensagem de áudio encontrada no inbox.');
        return;
    }

    for (const doc of snap.docs) {
        const data = doc.data();
        console.log(`\n🔊 Áudio recebido em: ${data.receivedAtIso} | ID: ${doc.id}`);
        console.log(`👤 Usuário: ${data.userId} | Tipo: ${data.messageType} | Status Inbox: ${data.status}`);
        console.log(`📎 Fonte: mediaBase64=${Boolean(data.mediaBase64)} | mediaUrl=${Boolean(data.mediaUrl)} | rawMessageJson=${Boolean(data.rawMessageJson)}`);
        
        // Busca resposta no outbox
        const outSnap = await db.collection('message_outbox')
            .where('inboxId', '==', doc.id)
            .limit(1)
            .get();
        
        if (!outSnap.empty) {
            const outData = outSnap.docs[0].data();
            console.log(`✅ Resposta gerada: "${outData.text.slice(0, 100)}..."`);
            console.log(`📊 Status Envio: ${outData.sendStatus}`);
        } else {
            console.log('❌ Nenhuma resposta encontrada no outbox para este áudio.');
            
            // Busca eventos de erro
            const errSnap = await db.collection('integration_events')
                .where('inboxId', '==', doc.id)
                .where('status', '==', 'error')
                .limit(1)
                .get();
            
            if (!errSnap.empty) {
                console.log(`💥 ERRO DETECTADO: ${errSnap.docs[0].data().reason}`);
            }
        }
    }
}

checkAudio().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
});
