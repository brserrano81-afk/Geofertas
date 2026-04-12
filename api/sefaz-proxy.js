import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps } from 'firebase/app';
import { addDoc, collection, getDocs, getFirestore, limit, query, serverTimestamp, where } from 'firebase/firestore';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WEBHOOK_LOG_DIR = path.join(ROOT_DIR, 'logs', 'evolution-webhooks');

const fallbackFirebaseConfig = {
    apiKey: 'AIzaSyDVW8oK9luHCFZhRl28XjcoZlDgeVA2y0Y',
    authDomain: 'geofertas-325b0.firebaseapp.com',
    projectId: 'geofertas-325b0',
    storageBucket: 'geofertas-325b0.firebasestorage.app',
    messagingSenderId: '333137067503',
    appId: '1:333137067503:web:f2ad402d55e33a0c60ca1a',
};

const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || fallbackFirebaseConfig.apiKey,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || fallbackFirebaseConfig.authDomain,
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || fallbackFirebaseConfig.projectId,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || fallbackFirebaseConfig.storageBucket,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fallbackFirebaseConfig.messagingSenderId,
    appId: process.env.VITE_FIREBASE_APP_ID || fallbackFirebaseConfig.appId,
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);
const firebaseApp = hasFirebaseConfig
    ? (getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig))
    : null;
const db = firebaseApp ? getFirestore(firebaseApp) : null;

function nowIso() {
    return new Date().toISOString();
}

function ensureWebhookLogDir() {
    if (!fs.existsSync(WEBHOOK_LOG_DIR)) {
        fs.mkdirSync(WEBHOOK_LOG_DIR, { recursive: true });
    }
}

function extractMessageText(payload = {}) {
    const data = payload.data || payload;
    const message = data.message || {};

    return (
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        message.videoMessage?.caption ||
        message.documentMessage?.caption ||
        data.text ||
        ''
    );
}

function normalizeEvolutionEvent(payload = {}, routeEvent = null) {
    const data = payload.data || {};
    const key = data.key || {};
    const remoteJid = key.remoteJid || data.remoteJid || data.from || payload.sender || '';
    const fromMe = Boolean(key.fromMe ?? data.fromMe);
    const event = routeEvent || payload.event || payload.type || 'unknown';
    const messageType = data.messageType || Object.keys(data.message || {})[0] || payload.type || 'unknown';
    const text = extractMessageText(payload);

    return {
        correlationId: key.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        messageId: key.id || null,
        source: 'evolution',
        event,
        instance: payload.instance || payload.instanceName || payload.apikey || null,
        remoteJid,
        userId: remoteJid,
        fromMe,
        direction: fromMe ? 'outbound' : 'inbound',
        messageType,
        text,
        textPreview: text ? text.slice(0, 160) : '',
        raw: payload,
        receivedAtIso: new Date().toISOString(),
    };
}

function shouldEnqueueInboundMessage(normalizedEvent) {
    if (!normalizedEvent.remoteJid || normalizedEvent.fromMe) {
        return false;
    }

    const supportedTypes = new Set([
        'conversation',
        'extendedTextMessage',
        'imageMessage',
        'videoMessage',
        'audioMessage',
        'documentMessage',
        'unknown',
    ]);

    return supportedTypes.has(normalizedEvent.messageType) || Boolean(normalizedEvent.textPreview);
}

function validateNormalizedEvent(normalizedEvent) {
    if (!normalizedEvent || typeof normalizedEvent !== 'object') {
        return { ok: false, reason: 'invalid_payload' };
    }

    if (!normalizedEvent.remoteJid) {
        return { ok: false, reason: 'missing_remote_jid' };
    }

    if (normalizedEvent.fromMe) {
        return { ok: false, reason: 'outbound_event_ignored' };
    }

    if (!shouldEnqueueInboundMessage(normalizedEvent)) {
        return { ok: false, reason: 'unsupported_or_empty_message' };
    }

    return { ok: true };
}

async function findExistingInboxMessage(normalizedEvent) {
    if (!db || !normalizedEvent.messageId || !normalizedEvent.remoteJid) {
        return null;
    }

    const inboxRef = collection(db, 'message_inbox');
    const existingQuery = query(
        inboxRef,
        where('messageId', '==', normalizedEvent.messageId),
        where('remoteJid', '==', normalizedEvent.remoteJid),
        limit(1),
    );
    const snap = await getDocs(existingQuery);
    return snap.empty ? null : snap.docs[0];
}

async function persistPipelineAudit(normalizedEvent, extra = {}) {
    if (!db) {
        return;
    }

    try {
        await addDoc(collection(db, 'integration_events'), {
            source: normalizedEvent.source,
            kind: 'pipeline_audit',
            correlationId: normalizedEvent.correlationId,
            messageId: normalizedEvent.messageId || null,
            event: normalizedEvent.event,
            instance: normalizedEvent.instance,
            remoteJid: normalizedEvent.remoteJid,
            userId: normalizedEvent.userId,
            direction: normalizedEvent.direction,
            messageType: normalizedEvent.messageType,
            textPreview: normalizedEvent.textPreview,
            createdAtIso: nowIso(),
            createdAt: serverTimestamp(),
            ...extra,
        });
    } catch (err) {
        console.error('[EvolutionWebhook] Pipeline audit failed:', err.message);
    }
}

async function enqueueInboundMessage(normalizedEvent) {
    if (!db) {
        return { inboxId: null, duplicate: false };
    }

    const validation = validateNormalizedEvent(normalizedEvent);
    if (!validation.ok) {
        return { inboxId: null, duplicate: false, ignoredReason: validation.reason };
    }

    const data = normalizedEvent.raw?.data || {};
    const key = data.key || {};

    try {
        const existing = await findExistingInboxMessage({
            ...normalizedEvent,
            messageId: key.id || null,
        });
        if (existing) {
            return { inboxId: existing.id, duplicate: true };
        }

        const inboxRef = await addDoc(collection(db, 'message_inbox'), {
            correlationId: normalizedEvent.correlationId,
            source: normalizedEvent.source,
            event: normalizedEvent.event,
            instance: normalizedEvent.instance,
            userId: normalizedEvent.userId,
            remoteJid: normalizedEvent.remoteJid,
            messageType: normalizedEvent.messageType,
            text: normalizedEvent.text || '',
            textPreview: normalizedEvent.textPreview,
            fromMe: normalizedEvent.fromMe,
            direction: normalizedEvent.direction,
            messageId: key.id || null,
            mediaBase64: data.base64 || null,
            mediaUrl: data.url || null,
            status: 'pending',
            receivedAtIso: normalizedEvent.receivedAtIso,
            createdAt: serverTimestamp(),
            createdAtIso: nowIso(),
        });

        return { inboxId: inboxRef.id, duplicate: false };
    } catch (err) {
        console.error('[EvolutionWebhook] Inbox enqueue failed:', err.message);
        return { inboxId: null, duplicate: false, error: err.message };
    }
}

async function persistEvolutionEvent(normalizedEvent, extra = {}) {
    ensureWebhookLogDir();

    const safeFileName = `${Date.now()}_${(normalizedEvent.event || 'event').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    const filePath = path.join(WEBHOOK_LOG_DIR, safeFileName);
    fs.writeFileSync(filePath, JSON.stringify(normalizedEvent, null, 2), 'utf8');

    if (db) {
        try {
            await addDoc(collection(db, 'integration_events'), {
                kind: 'webhook_event',
                correlationId: normalizedEvent.correlationId,
                messageId: normalizedEvent.messageId || null,
                source: normalizedEvent.source,
                event: normalizedEvent.event,
                instance: normalizedEvent.instance,
                remoteJid: normalizedEvent.remoteJid,
                userId: normalizedEvent.userId,
                fromMe: normalizedEvent.fromMe,
                direction: normalizedEvent.direction,
                messageType: normalizedEvent.messageType,
                textPreview: normalizedEvent.textPreview,
                payload: normalizedEvent.raw,
                receivedAtIso: normalizedEvent.receivedAtIso,
                createdAtIso: nowIso(),
                createdAt: serverTimestamp(),
                ...extra,
            });
        } catch (err) {
            console.error('[EvolutionWebhook] Firestore persistence failed:', err.message);
        }
    } else {
        console.warn('[EvolutionWebhook] Firebase config ausente no .env. Evento salvo apenas em arquivo local.');
    }

    return filePath;
}

app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'geofertas-api',
        timestamp: new Date().toISOString(),
    });
});

app.get('/proxy', async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');

    // Ensure protocol
    if (!targetUrl.startsWith('http')) {
        targetUrl = 'http://' + targetUrl;
    }

    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            }
        });

        const html = await response.text();
        // Basic scraping to turn html to json (mimicking the previous API logic)

        const items = [];
        let totalValue = 0;
        let supermarket = 'Desconhecido';
        let cnpj = '';

        // Extract supermarket name
        const nameMatch = html.match(/txtTopo[^>]*>([^<]+)/i) || html.match(/xNome[^>]*>([^<]+)/i);
        if (nameMatch) supermarket = nameMatch[1].trim();

        // Extract CNPJ
        const cnpjMatch = html.match(/CNPJ[:\s]*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i) || html.match(/(\d{14})/);
        if (cnpjMatch) cnpj = cnpjMatch[1].replace(/[.\-\/]/g, '');

        // Extract Total
        const totalMatch = html.match(/vNF[^>]*>([^<]+)/i) || html.match(/Valor total[^>]*R?\$?\s*([\d.,]+)/i);
        if (totalMatch) totalValue = parseFloat(totalMatch[1].replace('.', '').replace(',', '.'));

        // Extract Items using regex
        const itemRegex = /xProd[^>]*>([^<]+).*?qCom[^>]*>([^<]+).*?vUnCom[^>]*>([^<]+).*?vProd[^>]*>([^<]+)/gis;
        let m;
        while ((m = itemRegex.exec(html)) !== null) {
            items.push({
                name: m[1].trim(),
                quantity: parseFloat(m[2].replace(',', '.')),
                unitPrice: parseFloat(m[3].replace(',', '.')),
                totalPrice: parseFloat(m[4].replace(',', '.')),
            });
        }

        res.json({ supermarket, cnpj, totalValue, items });
    } catch (err) {
        console.error('Proxy Fetch Error', err);
        res.status(500).send(err.message);
    }
});

app.post('/webhook/whatsapp-entrada', async (req, res) => {
    const normalizedEvent = normalizeEvolutionEvent(req.body);
    const validation = validateNormalizedEvent(normalizedEvent);

    try {
        const enqueueResult = validation.ok
            ? await enqueueInboundMessage(normalizedEvent)
            : { inboxId: null, duplicate: false, ignoredReason: validation.reason };
        const pipelineStatus = !validation.ok
            ? 'ignored'
            : enqueueResult.duplicate
                ? 'duplicate'
                : enqueueResult.inboxId
                    ? 'enqueued'
                    : 'enqueue_failed';
        const filePath = await persistEvolutionEvent(normalizedEvent, {
            pipelineStatus,
            ignoredReason: !validation.ok ? validation.reason : null,
            duplicate: Boolean(enqueueResult.duplicate),
            inboxId: enqueueResult.inboxId || null,
            enqueueError: enqueueResult.error || null,
        });

        if (!validation.ok) {
            await persistPipelineAudit(normalizedEvent, {
                stage: 'webhook_validation',
                status: 'ignored',
                reason: validation.reason,
            });
            console.warn(`[EvolutionWebhook] [${normalizedEvent.correlationId}] Evento ignorado: ${validation.reason}`);
            res.status(202).json({ ok: true, ignored: true, reason: validation.reason, correlationId: normalizedEvent.correlationId });
            return;
        }

        if (enqueueResult.duplicate) {
            await persistPipelineAudit(normalizedEvent, {
                stage: 'inbox_enqueue',
                status: 'duplicate',
                inboxId: enqueueResult.inboxId,
                reason: 'message_id_already_seen',
            });
            console.warn(`[EvolutionWebhook] [${normalizedEvent.correlationId}] Duplicidade detectada para ${normalizedEvent.remoteJid || 'desconhecido'}.`);
            res.status(200).json({
                ok: true,
                event: normalizedEvent.event,
                inboxId: enqueueResult.inboxId,
                duplicate: true,
                correlationId: normalizedEvent.correlationId,
            });
            return;
        }

        if (!enqueueResult.inboxId) {
            await persistPipelineAudit(normalizedEvent, {
                stage: 'inbox_enqueue',
                status: 'error',
                reason: enqueueResult.error || 'enqueue_failed',
            });
            res.status(500).json({ ok: false, error: enqueueResult.error || 'enqueue_failed', correlationId: normalizedEvent.correlationId });
            return;
        }

        await persistPipelineAudit(normalizedEvent, {
            stage: 'inbox_enqueue',
            status: 'accepted',
            inboxId: enqueueResult.inboxId,
        });
        console.log(`[EvolutionWebhook] [${normalizedEvent.correlationId}] Event ${normalizedEvent.event} recebido de ${normalizedEvent.remoteJid || 'desconhecido'} -> ${filePath}`);
        res.status(200).json({ ok: true, event: normalizedEvent.event, inboxId: enqueueResult.inboxId, correlationId: normalizedEvent.correlationId });
    } catch (err) {
        console.error('[EvolutionWebhook] Error handling webhook:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/webhook/whatsapp-entrada/:event', async (req, res) => {
    const normalizedEvent = normalizeEvolutionEvent(req.body, req.params.event);
    const validation = validateNormalizedEvent(normalizedEvent);

    try {
        const enqueueResult = validation.ok
            ? await enqueueInboundMessage(normalizedEvent)
            : { inboxId: null, duplicate: false, ignoredReason: validation.reason };
        const pipelineStatus = !validation.ok
            ? 'ignored'
            : enqueueResult.duplicate
                ? 'duplicate'
                : enqueueResult.inboxId
                    ? 'enqueued'
                    : 'enqueue_failed';
        const filePath = await persistEvolutionEvent(normalizedEvent, {
            pipelineStatus,
            ignoredReason: !validation.ok ? validation.reason : null,
            duplicate: Boolean(enqueueResult.duplicate),
            inboxId: enqueueResult.inboxId || null,
            enqueueError: enqueueResult.error || null,
        });

        if (!validation.ok) {
            await persistPipelineAudit(normalizedEvent, {
                stage: 'webhook_validation',
                status: 'ignored',
                reason: validation.reason,
            });
            console.warn(`[EvolutionWebhook] [${normalizedEvent.correlationId}] Evento ignorado: ${validation.reason}`);
            res.status(202).json({ ok: true, ignored: true, reason: validation.reason, correlationId: normalizedEvent.correlationId });
            return;
        }

        if (enqueueResult.duplicate) {
            await persistPipelineAudit(normalizedEvent, {
                stage: 'inbox_enqueue',
                status: 'duplicate',
                inboxId: enqueueResult.inboxId,
                reason: 'message_id_already_seen',
            });
            console.warn(`[EvolutionWebhook] [${normalizedEvent.correlationId}] Duplicidade detectada para ${normalizedEvent.remoteJid || 'desconhecido'}.`);
            res.status(200).json({
                ok: true,
                event: normalizedEvent.event,
                inboxId: enqueueResult.inboxId,
                duplicate: true,
                correlationId: normalizedEvent.correlationId,
            });
            return;
        }

        if (!enqueueResult.inboxId) {
            await persistPipelineAudit(normalizedEvent, {
                stage: 'inbox_enqueue',
                status: 'error',
                reason: enqueueResult.error || 'enqueue_failed',
            });
            res.status(500).json({ ok: false, error: enqueueResult.error || 'enqueue_failed', correlationId: normalizedEvent.correlationId });
            return;
        }

        await persistPipelineAudit(normalizedEvent, {
            stage: 'inbox_enqueue',
            status: 'accepted',
            inboxId: enqueueResult.inboxId,
        });
        console.log(`[EvolutionWebhook] [${normalizedEvent.correlationId}] Event ${normalizedEvent.event} recebido de ${normalizedEvent.remoteJid || 'desconhecido'} -> ${filePath}`);
        res.status(200).json({ ok: true, event: normalizedEvent.event, inboxId: enqueueResult.inboxId, correlationId: normalizedEvent.correlationId });
    } catch (err) {
        console.error('[EvolutionWebhook] Error handling event webhook:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

const PORT = Number(process.env.API_PORT || 3001);
app.listen(PORT, () => {
    const firebaseSource = process.env.VITE_FIREBASE_PROJECT_ID ? '.env' : 'fallback-local';
    console.log(`[Geofertas API] Proxy + webhook server running on port ${PORT}`);
    console.log(`[Geofertas API] Firebase config source: ${firebaseSource}`);
});
