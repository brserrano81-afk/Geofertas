import dotenv from 'dotenv';
import { adminDb as db } from '../src/lib/firebase-admin';

dotenv.config();

async function simulateIncomingMessage(userId: string, text: string) {
    const remoteJid = `${userId}@s.whatsapp.net`;
    const inboxRef = db.collection('message_inbox');
    
    console.log(`🤖 Simulating message from ${userId}: "${text}"`);
    
    const doc = await inboxRef.add({
        userId,
        remoteJid,
        text,
        messageType: 'conversation',
        status: 'pending',
        source: 'simulator',
        receivedAtIso: new Date().toISOString(),
        createdAt: new Date()
    });
    
    console.log(`✅ Message added with ID: ${doc.id}`);
    return doc.id;
}

const userId = process.argv[2] || 'test_user_qa';
const text = process.argv.slice(3).join(' ') || 'quero arroz';

simulateIncomingMessage(userId, text)
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Failed to simulate message:', err);
        process.exit(1);
    });
