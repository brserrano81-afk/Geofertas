import { chatService } from '../src/services/ChatService';
import { adminDb as db } from '../src/lib/firebase-admin';
import dotenv from 'dotenv';
dotenv.config();

async function runTest(userId: string, message: string, label: string) {
    console.log(`\n[Audit] --- ${label} ---`);
    console.log(`[Audit] Msg: "${message}"`);
    const res = await chatService.processMessage(message, userId);
    console.log(`[Audit] Response: ${res.text.substring(0, 300)}...`);
    return res;
}

async function masterAudit() {
    const userId = `master_audit_${Date.now()}`;
    console.log(`[Master Audit] Starting for user: ${userId}`);

    // Setup: Consent and preferences
    await db.collection('users').doc(userId).set({
        lgpdConsent: true,
        neighborhood: "Centro",
        transportMode: "carro",
        fuelPrice: 5.50,
        consumption: 10,
        updatedAt: new Date()
    });

    // 1. Price Check
    await runTest(userId, "kto ta o cafe", "1. Price Check");

    // 2. Brand Comparison
    await runTest(userId, "tem coisa mais barata que o Nescafé", "2. Brand Comparison");

    // 3. Market Offers
    await runTest(userId, "quais as ofertas do Extrabom?", "3. Market Offers");

    // 4. Best Market Finder
    await runTest(userId, "qual mercado tá mais barato perto de mim", "4. Best Market Finder");

    // 5. Car/Transport Cost
    await runTest(userId, "vale ir de carro no Atacadão?", "5. Car/Transport Cost");

    // 6. Add to List
    await runTest(userId, "adiciona arroz, feijão e café", "6. Add to List");

    // 7. View List
    await runTest(userId, "minha lista", "7. View List");

    // 8. Onde comprar lista
    await runTest(userId, "onde comprar minha lista", "8. List Comparison");

    // 9. Share List
    await runTest(userId, "compartilha minha lista com 27999887766", "9. Share List");

    // 10. Receipt (skipped in automated text test, requires image)
    console.log("[Audit] Skipping 10. Receipt Analysis (requires image)");

    // 11. Spending History
    await runTest(userId, "quanto gastei esse mês", "11. Spending History");

    // 12. Monthly Planning
    await runTest(userId, "me ajuda a planejar o mês", "12. Monthly Planning");

    // 13. Seasonality
    await runTest(userId, "quando o frango fica mais barato", "13. Price Seasonality");

    // 14. User Profile
    await runTest(userId, "o que você sabe sobre mim", "14. User Profile");

    // 15. BSUID Test (Verification of link between phone and business ID)
    console.log("\n[Audit] --- 15. BSUID Test ---");
    const bsuidUserId = `bsuid_test_${Date.now()}`;
    const bsuid = `BSUID_${Date.now()}`;
    console.log(`[Audit] Testing BSUID: ${bsuid} for NEW user ${bsuidUserId}`);
    // We call processMessage with a fresh user to trigger init
    const bsuidRes = await chatService.processMessage("quem sou eu?", bsuidUserId, bsuidUserId, bsuid);
    console.log(`[Audit] Response with BSUID: ${bsuidRes.text.substring(0, 100)}...`);

    console.log('\n[Master Audit] Finished.');
}

masterAudit().catch(console.error);
