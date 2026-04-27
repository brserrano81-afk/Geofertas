import { chatService } from '../src/services/ChatService';
import { adminDb as db } from '../src/lib/firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

async function runTest(userId: string, message: string, expectedInResponse: string[]) {
    console.log(`\n[Audit] User: ${userId} | Msg: "${message}"`);
    const res = await chatService.processMessage(message, userId);
    console.log(`[Audit] Response: ${res.text}`);
    
    const matches = expectedInResponse.every(term => res.text.toLowerCase().includes(term.toLowerCase()));
    if (matches) {
        console.log('✅ PASS');
    } else {
        console.error(`❌ FAIL: Expected to include [${expectedInResponse.join(', ')}]`);
    }
    return res;
}

async function audit() {
    const userId = `audit_user_${Date.now()}`;
    console.log(`[Audit] Starting audit for new user: ${userId}`);

    // Setup: Consent and Location
    await db.collection('users').doc(userId).set({
        lgpdConsent: true,
        neighborhood: "Centro",
        updatedAt: new Date()
    });

    // 1. Adding multiple items (LISINHO test)
    await runTest(userId, "adiciona 2kg de arroz, um feijão e 3 pacotes de café", ["arroz", "feijão", "café", "lista"]);

    // 2. Viewing list
    await runTest(userId, "minha lista", ["arroz", "feijão", "café"]);

    // 3. Adding duplicates (Smoothness test)
    await runTest(userId, "coloca arroz de novo", ["arroz", "já está"]);

    // 4. Removing items (Fuzzy match test)
    await runTest(userId, "tira o café", ["removi", "item"]);

    // 5. Clearing list
    await runTest(userId, "limpa tudo", ["limpa", "sucesso"]);

    // 6. Verifying empty list
    await runTest(userId, "ver lista", ["vazia"]);

    // 7. Contextual addition (Conversation smoothness)
    await runTest(userId, "quero criar uma lista com leite", ["leite"]);
    await runTest(userId, "e pão", ["pão", "leite"]);

    // 8. Sharing list (Formatting test)
    await runTest(userId, "enviar para 27999887766", ["enviada", "27999887766"]);

    console.log('\n[Audit] Finished. Checking Firestore for consistency...');
    const listsRef = db.collection('users').doc(userId).collection('lists');
    const s = await listsRef.where('status', '==', 'active').get();
    console.log(`Active lists: ${s.size}`);
    s.docs.forEach(d => console.log(`Items:`, d.data().items));
}

audit().catch(console.error);
