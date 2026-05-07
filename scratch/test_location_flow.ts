import 'dotenv/config';
import { chatService } from '../src/services/ChatService';

process.env.GOOGLE_GEMINI_API_KEY = 'AIzaSyA-4YNLWUC7vCZbZ7Q3DmcCkjMzaCRAjqw';

async function testLocationFlow() {
    const userId = 'debug_user_' + Date.now();
    console.log(`\n🧪 Testing Location Flow for user: ${userId}`);

    // Step 1: First contact → greeting + LGPD
    console.log('\n--- Step 1: First Contact (Oi) ---');
    let response = await chatService.processMessage('Oi', userId);
    console.log('Bot:', response.text?.substring(0, 200));

    // Step 2: Accept LGPD → bot asks for location
    console.log('\n--- Step 2: Accept LGPD (Aceito) ---');
    response = await chatService.processMessage('Aceito', userId);
    console.log('Bot:', response.text?.substring(0, 200));

    // Step 3: Send address → geocoding → bot asks confirmation
    console.log('\n--- Step 3: Send Address ---');
    response = await chatService.processMessage('Rua Carijós, 625, Vila Velha', userId);
    console.log('Bot:', response.text?.substring(0, 300));

    // Step 4: Confirm location → proactive market search
    console.log('\n--- Step 4: Confirm (Sim) ---');
    response = await chatService.processMessage('Sim', userId);
    console.log('Bot:', response.text?.substring(0, 400));

    const text = response.text || '';
    if (text.includes('mercado') || text.includes('Mercado') || text.includes('km') || text.includes('perto')) {
        console.log('\n✅ SUCCESS: Proactive search triggered after confirmation!');
    } else {
        console.log('\n❌ FAILURE: Proactive search NOT triggered.');
        console.log('Full response:', text);
    }
}

testLocationFlow()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('💥 Test crashed:', err);
        process.exit(1);
    });
