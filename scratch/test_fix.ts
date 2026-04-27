import { chatService } from '../src/services/ChatService';
import { adminDb as db } from '../src/lib/firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    const userId = "test_user_onboarding_fix";
    
    console.log('[Test] Setting up user state (consented but no location)...');
    await db.collection('users').doc(userId).set({
        lgpdConsent: true,
        lgpdConsentAt: new Date(),
        updatedAt: new Date()
    });
    
    // Step 1: Force state to AWAITING_INITIAL_LOCATION
    console.log('[Test] Step 1: Triggering initial greeting...');
    await chatService.processMessage("Oi", userId); // This will transition to AWAITING_INITIAL_LOCATION
    
    const message = "adiciona arroz, feijão e café";
    console.log(`[Test] Step 2: Processing list message for ${userId}: "${message}"`);
    const res = await chatService.processMessage(message, userId);
    
    console.log('[Test] Response:', res.text);
    
    if (res.text.includes('Beleza, vou usar')) {
        console.error('FAILED: Still caught by neighborhood fallback!');
    } else if (res.text.includes('Adicionei à sua lista')) {
        console.log('SUCCESS: Correctly identified as list addition!');
    } else {
        console.log('UNEXPECTED RESPONSE:', res.text);
    }
    
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
