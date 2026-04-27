import { chatService } from '../src/services/ChatService';
import { adminDb as db } from '../src/lib/firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    const userId = "test_user_ready";
    
    // Set up user state in Firestore
    console.log('[Test] Setting up user state...');
    await db.collection('users').doc(userId).set({
        lgpdConsent: true,
        neighborhood: "Centro",
        updatedAt: new Date()
    });
    
    const message = "adiciona arroz, feijão e café";
    console.log(`[Test] Processing message for ${userId}: "${message}"`);
    const res = await chatService.processMessage(message, userId);
    console.log('[Test] Response:', res.text);
    
    console.log('[Test] Verifying Firestore...');
    const listsRef = db.collection('users').doc(userId).collection('lists');
    const s = await listsRef.where('status', '==', 'active').get();
    console.log('Active lists:', s.size);
    s.docs.forEach(d => {
        const data = d.data();
        console.log(`ID: ${d.id}, Items:`, data.items);
    });
}

test().catch(console.error);
