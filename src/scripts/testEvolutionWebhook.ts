const targetUrl = process.env.TEST_WEBHOOK_URL || 'http://127.0.0.1:3001/webhook/whatsapp-entrada';
const remoteJid = process.env.TEST_REMOTE_JID || '5527998862440@s.whatsapp.net';
const text = process.argv.slice(2).join(' ') || 'teste controlado economizafacil';

const payload = {
    event: 'messages.upsert',
    instance: process.env.EVOLUTION_INSTANCE_ID || 'local-test',
    data: {
        key: {
            remoteJid,
            fromMe: false,
            id: `test-${Date.now()}`,
        },
        messageType: 'conversation',
        message: {
            conversation: text,
        },
        pushName: 'Teste Local',
    },
};

async function main() {
    console.log(`[testEvolutionWebhook] POST ${targetUrl}`);
    console.log(`[testEvolutionWebhook] Payload text: ${text}`);

    const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const bodyText = await response.text();
    console.log(`[testEvolutionWebhook] Status: ${response.status}`);
    console.log(bodyText);

    if (!response.ok) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error('[testEvolutionWebhook] Error:', err);
    process.exit(1);
});
