import { adminDb as db } from '../src/lib/firebase-admin';

async function check() {
    const s = await db.collection('message_inbox').where('userId', '==', 'test_user_qa').get();
    console.log('Total documents for test_user_qa:', s.size);
    s.docs.forEach(d => {
        const data = d.data();
        console.log(`ID: ${d.id}, User: ${data.userId}, Status: ${data.status}, Text: ${data.text}, Error: ${data.error}`);
    });
}

check().catch(console.error);
