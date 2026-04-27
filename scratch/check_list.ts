import { adminDb as db } from '../src/lib/firebase-admin';

async function check() {
    const listsRef = db.collection('users').doc('test_user_qa').collection('lists');
    const s = await listsRef.where('status', '==', 'active').get();
    console.log('Active lists:', s.size);
    s.docs.forEach(d => {
        const data = d.data();
        console.log(`ID: ${d.id}, Status: ${data.status}, Items:`, data.items);
    });
}

check().catch(console.error);
