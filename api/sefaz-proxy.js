import express from 'express';
import admin from 'firebase-admin';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

// --- Mascaramento de identificadores pessoais (LGPD) ---
function maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return '***';
    const digits = phone.replace(/\D/g, '');
    if (digits.length <= 10) return '***' + digits.slice(-4);
    const prefix = digits.slice(0, 6);
    const suffix = digits.slice(-4);
    const masked = '*'.repeat(Math.max(digits.length - 10, 3));
    return `${prefix}${masked}${suffix}`;
}
function maskIdentifier(value) {
    if (!value) return 'desconhecido';
    if (value.includes('@')) {
        const atIdx = value.indexOf('@');
        return `${maskPhone(value.slice(0, atIdx))}${value.slice(atIdx)}`;
    }
    return maskPhone(value);
}
// --------------------------------------------------------

// --- Rate limiting simples por IP (sem dependência externa) ---
// Limita /webhook/* a 60 req/min por IP. Adequado para instância única.
const _rlWindows = new Map(); // ip -> { count, windowStart }
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
function webhookRateLimit(req, res, next) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = _rlWindows.get(ip);
    if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
        _rlWindows.set(ip, { count: 1, windowStart: now });
        return next();
    }
    entry.count++;
    if (entry.count > RATE_LIMIT_MAX) {
        console.warn(`[RateLimit] IP ${ip} excedeu ${RATE_LIMIT_MAX} req/min no webhook.`);
        return res.status(429).json({ ok: false, error: 'too_many_requests' });
    }
    next();
}
// Limpeza periódica para evitar vazamento de memória
setInterval(() => {
    const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS * 2;
    for (const [ip, e] of _rlWindows.entries()) {
        if (e.windowStart < cutoff) _rlWindows.delete(ip);
    }
}, RATE_LIMIT_WINDOW_MS);
// ---------------------------------------------------------------

const app = express();
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
    }

    next();
});
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WEBHOOK_LOG_DIR = path.join(ROOT_DIR, 'logs', 'evolution-webhooks');

function readEnv(...names) {
    for (const name of names) {
        const value = process.env[name];
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }

    return '';
}

function getServiceAccount(rootDir) {
    // Prioridade 1: variáveis individuais (nova forma — sem limite de tamanho no Railway)
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
        return { projectId, clientEmail, privateKey };
    }

    // Prioridade 2: JSON completo (legado)
    const envJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (envJson) {
        try { return JSON.parse(envJson); } catch (err) {}
    }

    // Prioridade 3: arquivo local (desenvolvimento)
    const saPath = path.join(rootDir, 'service-account.json');
    if (fs.existsSync(saPath)) {
        try { return JSON.parse(fs.readFileSync(saPath, 'utf8')); } catch (err) {}
    }

    return undefined;
}

// Identity and config initialization

if (!admin.apps.length) {
    const sa = getServiceAccount(ROOT_DIR);
    if (sa) {
        admin.initializeApp({ credential: admin.credential.cert(sa) });
    } else {
        admin.initializeApp();
    }
}

const db = admin.firestore();
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
const ENABLE_FILE_LOGS = process.env.ENABLE_FILE_LOGS?.toLowerCase() === 'true';

function nowIso() {
    return new Date().toISOString();
}

function normalizeValue(value = '') {
    return String(value || '').trim().toLowerCase();
}

function normalizeRemoteJid(remoteJid = '') {
    const normalized = normalizeValue(remoteJid);
    if (!normalized) return '';
    if (normalized.includes('@')) return normalized;
    return `${normalized}@s.whatsapp.net`;
}

function extractPhoneNumber(remoteJid = '') {
    const digits = normalizeRemoteJid(remoteJid).split('@')[0].replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 11 && !digits.startsWith('55')) {
        return `55${digits}`;
    }
    return digits;
}

function normalizeBsuid(bsuid = '') {
    return normalizeValue(bsuid).replace(/\s+/g, '');
}

function buildLegacyUserId(remoteJid = '') {
    return normalizeRemoteJid(remoteJid);
}

function buildCanonicalUserId({ bsuid = '', phoneNumber = '', legacyUserId = '' }) {
    if (bsuid) return `bsuid:${bsuid}`;
    if (phoneNumber) return `wa:${phoneNumber}`;
    return legacyUserId || 'default_user';
}

function aliasKey(kind, value) {
    return `${kind}:${normalizeValue(value)}`;
}

function extractBsuidCandidate(payload = {}) {
    const data = payload.data || {};
    const key = data.key || {};
    return normalizeBsuid(
        payload.bsuid ||
        payload.businessScopedUserId ||
        data.bsuid ||
        data.businessScopedUserId ||
        data.senderLid ||
        data.lid ||
        key.senderLid ||
        key.lid ||
        '',
    );
}

async function readAliasTarget(alias) {
    if (!alias) return null;
    const snap = await db.collection('identity_aliases').doc(alias).get();
    return snap.exists ? String(snap.data().canonicalUserId || '').trim() || null : null;
}

async function hasUserDocument(userId) {
    if (!userId) return false;
    const snap = await db.collection('users').doc(userId).get();
    return snap.exists;
}

async function resolveCanonicalIdentity(normalizedEvent) {
    const remoteJid = normalizeRemoteJid(normalizedEvent.remoteJid);
    const legacyUserId = buildLegacyUserId(remoteJid);
    const phoneNumber = extractPhoneNumber(remoteJid);
    const bsuid = extractBsuidCandidate(normalizedEvent.raw || {});

    const aliasCandidates = [
        bsuid ? { key: aliasKey('bsuid', bsuid), source: 'bsuid_alias' } : null,
        phoneNumber ? { key: aliasKey('phone', phoneNumber), source: 'phone_alias' } : null,
        remoteJid ? { key: aliasKey('remoteJid', remoteJid), source: 'remote_jid_alias' } : null,
    ].filter(Boolean);

    let canonicalUserId = '';
    let resolutionSource = bsuid ? 'bsuid_generated' : 'phone_generated';

    for (const candidate of aliasCandidates) {
        const target = await readAliasTarget(candidate.key);
        if (target) {
            canonicalUserId = target;
            resolutionSource = candidate.source;
            break;
        }
    }

    if (!canonicalUserId) {
        canonicalUserId = buildCanonicalUserId({ bsuid, phoneNumber, legacyUserId });
    }

    const canonicalUserExists = await hasUserDocument(canonicalUserId);
    const legacyUserExists = legacyUserId && legacyUserId !== canonicalUserId
        ? await hasUserDocument(legacyUserId)
        : false;
    const storageUserId = legacyUserExists && !canonicalUserExists
        ? legacyUserId
        : canonicalUserId;

    const identity = {
        canonicalUserId,
        storageUserId,
        legacyUserId: legacyUserId || canonicalUserId,
        bsuid: bsuid || null,
        phoneNumber: phoneNumber || null,
        remoteJid: remoteJid || null,
        channel: 'whatsapp',
        resolutionSource,
        requiresBackfill: Boolean(legacyUserExists && storageUserId !== canonicalUserId),
        aliases: aliasCandidates.map((candidate) => candidate.key),
    };

    await db.collection('canonical_identities').doc(canonicalUserId).set({
        ...identity,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
    }, { merge: true });

    await Promise.all(identity.aliases.map((alias) => db.collection('identity_aliases').doc(alias).set({
        canonicalUserId,
        storageUserId,
        legacyUserId: identity.legacyUserId,
        bsuid: identity.bsuid,
        remoteJid: identity.remoteJid,
        phoneNumber: identity.phoneNumber,
        channel: 'whatsapp',
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
    }, { merge: true })));

    return identity;
}

function ensureWebhookLogDir() {
    if (!fs.existsSync(WEBHOOK_LOG_DIR)) {
        fs.mkdirSync(WEBHOOK_LOG_DIR, { recursive: true });
    }
}

function extractMessageText(payload = {}) {
    const data = payload.data || payload;
    const message = data.message || {};

    const text = (
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        message.videoMessage?.caption ||
        message.documentMessage?.caption ||
        data.text ||
        ''
    );

    // Se não houver texto mas for áudio comprovado, injetamos placeholder para o inbox
    if (!text && (message.audioMessage || message.ptt || message.voice || data.messageType === 'audioMessage')) {
        return '[audio]';
    }

    return text;
}

function normalizeEvolutionEvent(payload = {}, routeEvent = null) {
    const data = payload.data || {};
    const key = data.key || {};
    const message = data.message || {};
    const remoteJid = normalizeRemoteJid(key.remoteJid || data.remoteJid || data.from || payload.sender || '');
    const fromMe = Boolean(key.fromMe ?? data.fromMe);
    const event = routeEvent || payload.event || payload.type || 'unknown';

    // Mapeamento robusto de tipo de mensagem
    let messageType = data.messageType || Object.keys(message)[0] || payload.type || 'unknown';

    // Normalização forçada para áudio (Evolution v1/v2 variam chaves)
    if (message.audioMessage || message.ptt || message.voice || data.audio || (data.media && data.media.audio)) {
        messageType = 'audioMessage';
    }

    const text = extractMessageText(payload);

    return {
        correlationId: key.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        messageId: key.id || null,
        source: 'evolution',
        event,
        instance: payload.instance || payload.instanceName || payload.apikey || null,
        remoteJid,
        userId: remoteJid,
        storageUserId: remoteJid,
        legacyUserId: remoteJid,
        bsuid: extractBsuidCandidate(payload) || null,
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

    // Task 2: Impedir explicitamente que eventos de status como chats.update entrem no inbox
    if (normalizedEvent.event === 'chats.update' || normalizedEvent.event === 'presence.update') {
        return false;
    }

    // Suporte prioritário para áudio
    if (normalizedEvent.messageType === 'audioMessage') {
        return true;
    }

    const supportedTypes = new Set([
        'conversation',
        'extendedTextMessage',
        'imageMessage',
        'videoMessage',
        'audioMessage',
        'documentMessage',
    ]);

    if (supportedTypes.has(normalizedEvent.messageType)) {
        return true;
    }

    // Task 3: 'unknown' só entra se tiver texto real extraído
    return normalizedEvent.messageType === 'unknown' && Boolean(normalizedEvent.textPreview);
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
    if (!db || !normalizedEvent.messageId) {
        return null;
    }

    if (normalizedEvent.userId) {
        const canonicalSnap = await db.collection('message_inbox')
            .where('messageId', '==', normalizedEvent.messageId)
            .where('userId', '==', normalizedEvent.userId)
            .limit(1)
            .get();
        if (!canonicalSnap.empty) {
            return canonicalSnap.docs[0];
        }
    }

    if (normalizedEvent.remoteJid) {
        const legacySnap = await db.collection('message_inbox')
            .where('messageId', '==', normalizedEvent.messageId)
            .where('remoteJid', '==', normalizedEvent.remoteJid)
            .limit(1)
            .get();
        if (!legacySnap.empty) {
            return legacySnap.docs[0];
        }
    }

    return null;
}

async function persistPipelineAudit(normalizedEvent, extra = {}) {
    try {
        await db.collection('integration_events').add({
            source: normalizedEvent.source,
            kind: 'pipeline_audit',
            correlationId: normalizedEvent.correlationId,
            messageId: normalizedEvent.messageId || null,
            event: normalizedEvent.event,
            instance: normalizedEvent.instance,
            remoteJid: normalizedEvent.remoteJid,
            userId: normalizedEvent.userId,
            storageUserId: normalizedEvent.storageUserId || normalizedEvent.userId,
            legacyUserId: normalizedEvent.legacyUserId || normalizedEvent.userId,
            bsuid: normalizedEvent.bsuid || null,
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

        const inboxRef = await db.collection('message_inbox').add({
            correlationId: normalizedEvent.correlationId,
            source: normalizedEvent.source,
            event: normalizedEvent.event,
            instance: normalizedEvent.instance,
            userId: normalizedEvent.userId,
            storageUserId: normalizedEvent.storageUserId || normalizedEvent.userId,
            legacyUserId: normalizedEvent.legacyUserId || normalizedEvent.userId,
            bsuid: normalizedEvent.bsuid || null,
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
    let filePath = null;

    if (ENABLE_FILE_LOGS) {
        ensureWebhookLogDir();
        const safeFileName = `${Date.now()}_${(normalizedEvent.event || 'event').replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
        filePath = path.join(WEBHOOK_LOG_DIR, safeFileName);
        fs.writeFileSync(filePath, JSON.stringify(normalizedEvent, null, 2), 'utf8');
    }

    try {
        await db.collection('integration_events').add({
            kind: 'webhook_event',
            correlationId: normalizedEvent.correlationId,
            messageId: normalizedEvent.messageId || null,
            source: normalizedEvent.source,
            event: normalizedEvent.event,
            instance: normalizedEvent.instance,
            remoteJid: normalizedEvent.remoteJid,
            userId: normalizedEvent.userId,
            storageUserId: normalizedEvent.storageUserId || normalizedEvent.userId,
            legacyUserId: normalizedEvent.legacyUserId || normalizedEvent.userId,
            bsuid: normalizedEvent.bsuid || null,
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

    return filePath || 'firestore-only';
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

app.post('/webhook/whatsapp-entrada', webhookRateLimit, async (req, res) => {
    const normalizedEvent = normalizeEvolutionEvent(req.body);
    const identity = await resolveCanonicalIdentity(normalizedEvent);
    normalizedEvent.userId = identity.canonicalUserId;
    normalizedEvent.storageUserId = identity.storageUserId;
    normalizedEvent.legacyUserId = identity.legacyUserId;
    normalizedEvent.bsuid = identity.bsuid;
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
            console.warn(`[EvolutionWebhook] [${normalizedEvent.correlationId}] Duplicidade detectada para ${maskIdentifier(normalizedEvent.remoteJid)}.`);
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
        console.log(`[EvolutionWebhook] [${normalizedEvent.correlationId}] Event ${normalizedEvent.event} recebido de ${maskIdentifier(normalizedEvent.remoteJid)} -> ${filePath}`);
        res.status(200).json({ ok: true, event: normalizedEvent.event, inboxId: enqueueResult.inboxId, correlationId: normalizedEvent.correlationId });
    } catch (err) {
        console.error('[EvolutionWebhook] Error handling webhook:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

app.post('/webhook/whatsapp-entrada/:event', webhookRateLimit, async (req, res) => {
    const normalizedEvent = normalizeEvolutionEvent(req.body, req.params.event);
    const identity = await resolveCanonicalIdentity(normalizedEvent);
    normalizedEvent.userId = identity.canonicalUserId;
    normalizedEvent.storageUserId = identity.storageUserId;
    normalizedEvent.legacyUserId = identity.legacyUserId;
    normalizedEvent.bsuid = identity.bsuid;
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
            console.warn(`[EvolutionWebhook] [${normalizedEvent.correlationId}] Duplicidade detectada para ${maskIdentifier(normalizedEvent.remoteJid)}.`);
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
        console.log(`[EvolutionWebhook] [${normalizedEvent.correlationId}] Event ${normalizedEvent.event} recebido de ${maskIdentifier(normalizedEvent.remoteJid)} -> ${filePath}`);
        res.status(200).json({ ok: true, event: normalizedEvent.event, inboxId: enqueueResult.inboxId, correlationId: normalizedEvent.correlationId });
    } catch (err) {
        console.error('[EvolutionWebhook] Error handling event webhook:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

const PORT =
    Number(process.env.PORT) ||
    Number(process.env.API_PORT) ||
    3001;

app.get('/', (_req, res) => {
    res.status(200).send('Geofertas API online');
});

app.listen(PORT, () => {
    console.log(`[Geofertas API] Proxy + webhook server running on port ${PORT}`);
    console.log('[Geofertas API] Firebase config source: env');
    console.log(`[Geofertas API] File webhook logs: ${ENABLE_FILE_LOGS ? 'enabled' : 'disabled'}`);
});
