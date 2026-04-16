import dotenv from 'dotenv';
import { adminDb as db, admin } from '../lib/firebase-admin';
const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
import { chatService } from '../services/ChatService';
import { isMasterAdmin, masterAdminService } from '../services/MasterAdminService';
import { maskIdentifier } from '../utils/maskSensitiveData';

dotenv.config();

interface InboxMessage {
    correlationId?: string;
    messageId?: string | null;
    userId: string;
    storageUserId?: string;
    legacyUserId?: string;
    bsuid?: string | null;
    remoteJid: string;
    messageType?: string;
    text?: string;
    mediaBase64?: string | null;
    mediaUrl?: string | null;
    status?: string;
    event?: string;
    source?: string;
    receivedAtIso?: string;
    leaseOwner?: string | null;
    leaseAcquiredAtIso?: string | null;
    leaseExpiresAtIso?: string | null;
}

interface OutboxMessage {
    correlationId?: string;
    sourceMessageId?: string | null;
    inboxId: string;
    userId: string;
    storageUserId?: string;
    legacyUserId?: string;
    bsuid?: string | null;
    remoteJid: string;
    text: string;
    sendStatus?: 'pending_send' | 'retrying' | 'sent' | 'send_failed';
    evolutionRequest?: unknown;
    evolutionResponse?: unknown;
    error?: string | null;
    retryCount?: number;
    lastRetryAtIso?: string | null;
    nextRetryAtIso?: string | null;
    sentAtIso?: string | null;
}

interface ResponseBuildResult {
    text: string | null;
    shouldSend: boolean;
    usedFallback: boolean;
    reason: string;
}

const POLL_INTERVAL_MS = Number(process.env.EVOLUTION_WORKER_POLL_MS || 4000);
const RUN_ONCE = process.argv.includes('--once');
const VERBOSE = process.argv.includes('--verbose');
const EVOLUTION_SEND_FORMAT = (process.env.EVOLUTION_SEND_FORMAT || 'auto').toLowerCase();
const EVOLUTION_TYPING_ENABLED = process.env.EVOLUTION_TYPING_ENABLED !== 'false';
const EVOLUTION_TYPING_MS = Number(process.env.EVOLUTION_TYPING_MS || 1500);
const MAX_SEND_RETRIES = Number(process.env.EVOLUTION_MAX_SEND_RETRIES || 3);
const RETRY_BASE_DELAY_MS = Number(process.env.EVOLUTION_RETRY_BASE_DELAY_MS || 15000);
const PROCESSING_LEASE_MS = Number(process.env.EVOLUTION_PROCESSING_LEASE_MS || 120000);
const WORKER_INSTANCE_ID = process.env.EVOLUTION_WORKER_INSTANCE_ID || `worker-${process.pid}`;

function nowIso(): string {
    return new Date().toISOString();
}

function isoPlusMs(baseIso: string, deltaMs: number): string {
    return new Date(Date.parse(baseIso) + deltaMs).toISOString();
}

function computeRetryDelayMs(retryCount: number): number {
    return RETRY_BASE_DELAY_MS * Math.max(1, retryCount);
}

function isRetryDue(nextRetryAtIso?: string | null): boolean {
    if (!nextRetryAtIso) {
        return true;
    }

    return Date.parse(nextRetryAtIso) <= Date.now();
}

function sanitizePhoneNumber(remoteJid: string): string {
    const digits = String(remoteJid || '').split('@')[0].replace(/\D/g, '');
    if (digits.length === 11 && !digits.startsWith('55')) {
        return `55${digits}`;
    }
    return digits;
}

function buildAbsoluteEvolutionUrl(pathOrUrl: string | undefined, fallbackPath: string): string | null {
    const baseUrl = process.env.EVOLUTION_API_BASE_URL?.trim();
    const candidate = pathOrUrl?.trim();

    if (candidate) {
        try {
            return new URL(candidate).toString();
        } catch {
            if (!baseUrl) {
                return null;
            }

            return new URL(candidate.replace(/^\//, ''), `${baseUrl.replace(/\/+$/, '')}/`).toString();
        }
    }

    if (!baseUrl) {
        return null;
    }

    return new URL(fallbackPath.replace(/^\//, ''), `${baseUrl.replace(/\/+$/, '')}/`).toString();
}

function ensureEvolutionEndpointInstance(url: string, endpointPrefix: string, instance: string): string {
    const parsedUrl = new URL(url);
    const normalizedPath = parsedUrl.pathname.replace(/\/+$/, '');
    const normalizedPrefix = `/${endpointPrefix.replace(/^\/+|\/+$/g, '')}`;
    const encodedInstance = encodeURIComponent(instance);

    if (
        normalizedPath === normalizedPrefix ||
        normalizedPath === `${normalizedPrefix}/`
    ) {
        parsedUrl.pathname = `${normalizedPrefix}/${encodedInstance}`;
        return parsedUrl.toString();
    }

    if (!normalizedPath.startsWith(`${normalizedPrefix}/`)) {
        parsedUrl.pathname = `${normalizedPrefix}/${encodedInstance}`;
        return parsedUrl.toString();
    }

    return parsedUrl.toString();
}

function getEvolutionInstance(): string | null {
    const instance =
        process.env.EVOLUTION_SEND_INSTANCE ||
        process.env.EVOLUTION_INSTANCE ||
        process.env.EVOLUTION_INSTANCE_ID;

    if (!instance) {
        return null;
    }

    return instance.trim();
}

function getEvolutionSendUrl(): string | null {
    const instance = getEvolutionInstance();
    if (!instance) {
        return null;
    }

    const sendUrl = buildAbsoluteEvolutionUrl(
        process.env.EVOLUTION_SEND_TEXT_URL,
        `message/sendText/${instance}`,
    );

    if (!sendUrl) {
        return null;
    }

    return ensureEvolutionEndpointInstance(sendUrl, 'message/sendText', instance);
}

function getEvolutionPresenceUrl(): string | null {
    const instance = getEvolutionInstance();
    if (!instance) {
        return null;
    }

    const presenceUrl = buildAbsoluteEvolutionUrl(
        process.env.EVOLUTION_PRESENCE_URL,
        `chat/sendPresence/${instance}`,
    );

    if (!presenceUrl) {
        return null;
    }

    return ensureEvolutionEndpointInstance(presenceUrl, 'chat/sendPresence', instance);
}

async function loadPendingMessages(): Promise<Array<{ id: string; data: InboxMessage }>> {
    const snapshot = await db.collection('message_inbox')
        .where('status', '==', 'pending')
        .limit(10)
        .get();

    if (snapshot.empty) return [];

    return snapshot.docs
        .map((docSnap: any) => ({
            id: docSnap.id,
            data: docSnap.data() as InboxMessage,
        }))
        .sort((a: any, b: any) => {
            const aTime = String((a.data as any).receivedAtIso || '');
            const bTime = String((b.data as any).receivedAtIso || '');
            return aTime.localeCompare(bTime);
        });
}

async function loadPendingOutboxMessages(): Promise<Array<{ id: string; data: OutboxMessage }>> {
    const snapshot = await db.collection('message_outbox')
        .where('sendStatus', 'in', ['pending_send', 'retrying'])
        .limit(10)
        .get();

    return snapshot.docs
        .map((docSnap: any) => ({
            id: docSnap.id,
            data: docSnap.data() as OutboxMessage,
        }))
        .filter((item: any) => isRetryDue(item.data.nextRetryAtIso))
        .sort((a: any, b: any) => a.id.localeCompare(b.id));
}

async function markInboxStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
    const docRef = db.collection('message_inbox').doc(id);
    await docRef.update({
        status,
        ...(status === 'processing' ? { processingStartedAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
        ...extra,
    });
}

async function markOutboxStatus(id: string, status: OutboxMessage['sendStatus'], extra: Record<string, unknown> = {}) {
    const outboxDoc = db.collection('message_outbox').doc(id);
    await outboxDoc.update({
        sendStatus: status,
        ...(status === 'send_failed' ? {} : { error: null }),
        ...(status === 'sent' ? { sentAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
        ...extra,
    });
}

async function persistPipelineAudit(payload: {
    correlationId: string;
    stage: string;
    status: string;
    inboxId?: string;
    outboxId?: string;
    remoteJid?: string;
    userId?: string;
    sourceMessageId?: string | null;
    reason?: string | null;
    durationMs?: number | null;
    retryCount?: number | null;
    metadata?: Record<string, unknown> | null;
}) {
    try {
        await db.collection('integration_events').add({
            source: 'evolution-worker',
            kind: 'pipeline_audit',
            correlationId: payload.correlationId,
            stage: payload.stage,
            status: payload.status,
            inboxId: payload.inboxId || null,
            outboxId: payload.outboxId || null,
            remoteJid: payload.remoteJid || null,
            userId: payload.userId || null,
            sourceMessageId: payload.sourceMessageId || null,
            reason: payload.reason || null,
            durationMs: payload.durationMs ?? null,
            retryCount: payload.retryCount ?? null,
            metadata: payload.metadata || null,
            createdAtIso: nowIso(),
            createdAt: serverTimestamp(),
        });
    } catch (err: any) {
        console.error(`[EvolutionInboxWorker] [${payload.correlationId}] Falha ao gravar audit trail:`, err?.message || err);
    }
}

async function persistOutboxMessage(inboxId: string, payload: {
    correlationId?: string;
    sourceMessageId?: string | null;
    userId: string;
    storageUserId?: string;
    legacyUserId?: string;
    bsuid?: string | null;
    remoteJid: string;
    text: string;
    sendStatus: 'pending_send' | 'retrying' | 'sent' | 'send_failed';
    evolutionRequest?: unknown;
    evolutionResponse?: unknown;
    error?: string | null;
    retryCount?: number;
    lastRetryAtIso?: string | null;
    nextRetryAtIso?: string | null;
}) {
    const outboxRef = await db.collection('message_outbox').add({
        inboxId,
        source: 'economizafacil-worker',
        correlationId: payload.correlationId || inboxId,
        sourceMessageId: payload.sourceMessageId || null,
        userId: payload.userId,
        storageUserId: payload.storageUserId || payload.userId,
        legacyUserId: payload.legacyUserId || payload.userId,
        bsuid: payload.bsuid || null,
        remoteJid: payload.remoteJid,
        text: payload.text,
        sendStatus: payload.sendStatus,
        evolutionRequest: payload.evolutionRequest || null,
        evolutionResponse: payload.evolutionResponse || null,
        error: payload.error || null,
        retryCount: payload.retryCount || 0,
        lastRetryAtIso: payload.lastRetryAtIso || null,
        nextRetryAtIso: payload.nextRetryAtIso || null,
        sentAtIso: payload.sendStatus === 'sent' ? nowIso() : null,
        maxRetryCount: MAX_SEND_RETRIES,
        createdAt: serverTimestamp(),
        createdAtIso: nowIso(),
    });

    return outboxRef.id;
}

async function postEvolutionText(
    sendUrl: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
) {
    const response = await fetch(sendUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    });

    const rawText = await response.text();
    let parsedResponse: unknown = rawText;

    try {
        parsedResponse = JSON.parse(rawText);
    } catch {
        parsedResponse = rawText;
    }

    return {
        ok: response.ok,
        statusCode: response.status,
        requestBody: body,
        parsedResponse,
        rawText,
    };
}

async function sendPresenceViaEvolution(remoteJid: string) {
    if (!EVOLUTION_TYPING_ENABLED) {
        return;
    }

    const presenceUrl = getEvolutionPresenceUrl();
    if (!presenceUrl) {
        return;
    }

    const apiKey = process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_APIKEY || '';
    const apiKeyHeader = process.env.EVOLUTION_API_KEY_HEADER || 'apikey';
    const number = sanitizePhoneNumber(remoteJid);

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (apiKey) {
        headers[apiKeyHeader] = apiKey;
    }

    const response = await fetch(presenceUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
            number,
            options: {
                delay: EVOLUTION_TYPING_MS,
                presence: 'composing',
            },
        }),
    });

    if (!response.ok && VERBOSE) {
        const rawText = await response.text();
        console.warn(`[EvolutionInboxWorker] sendPresence falhou (${response.status}): ${rawText}`);
    }
}

async function sendTextViaEvolution(remoteJid: string, text: string) {
    const sendUrl = getEvolutionSendUrl();
    if (!sendUrl) {
        return { attempted: false, status: 'pending_send' as const };
    }

    const apiKey = process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_APIKEY || '';
    const apiKeyHeader = process.env.EVOLUTION_API_KEY_HEADER || 'apikey';
    const number = sanitizePhoneNumber(remoteJid);

    const requestBody = {
        number,
        text,
    };

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (apiKey) {
        headers[apiKeyHeader] = apiKey;
    }

    const requestBodies =
        EVOLUTION_SEND_FORMAT === 'v1'
            ? [{
                number,
                textMessage: { text },
                options: {
                    delay: EVOLUTION_TYPING_MS,
                    presence: 'composing',
                },
            }]
            : EVOLUTION_SEND_FORMAT === 'v2'
                ? [{
                    ...requestBody,
                    delay: EVOLUTION_TYPING_MS,
                }]
                : [
                    {
                        ...requestBody,
                        delay: EVOLUTION_TYPING_MS,
                    },
                    {
                        number,
                        textMessage: { text },
                        options: {
                            delay: EVOLUTION_TYPING_MS,
                            presence: 'composing',
                        },
                    },
                ];

    let lastFailure: { statusCode: number; rawText: string } | null = null;

    for (const candidateBody of requestBodies) {
        const result = await postEvolutionText(sendUrl, headers, candidateBody);
        if (result.ok) {
            return {
                attempted: true,
                status: 'sent' as const,
                requestBody: result.requestBody,
                parsedResponse: result.parsedResponse,
            };
        }

        lastFailure = {
            statusCode: result.statusCode,
            rawText: result.rawText,
        };

        if (VERBOSE) {
            console.warn(
                `[EvolutionInboxWorker] Tentativa sendText falhou (${result.statusCode}) com payload ${JSON.stringify(candidateBody)}`,
            );
        }
    }

    throw new Error(
        `Evolution send failed (${lastFailure?.statusCode || 'unknown'}): ${lastFailure?.rawText || 'no response body'}`,
    );
}

async function processAudioWithGemini(message: InboxMessage): Promise<ResponseBuildResult> {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
        console.error(`[AudioProcessor] user=${message.userId} — GEMINI_API_KEY não configurada`);
        return {
            text: 'Ainda não consigo processar áudio por aqui. Pode me mandar em texto?',
            shouldSend: true,
            usedFallback: true,
            reason: 'audio_gemini_key_missing',
        };
    }

    const mediaUrl = message.mediaUrl;
    if (!mediaUrl) {
        console.error(`[AudioProcessor] user=${message.userId} — mediaUrl ausente na InboxMessage`);
        return {
            text: 'Recebi seu áudio, mas não consegui acessá-lo. Pode tentar de novo?',
            shouldSend: true,
            usedFallback: true,
            reason: 'audio_no_media_url',
        };
    }

    // Baixa o arquivo de áudio
    let audioBase64: string;
    let mimeType = 'audio/ogg'; // padrão WhatsApp
    try {
        console.log(`[AudioProcessor] user=${message.userId} — Baixando áudio de: ${mediaUrl}`);
        const audioResp = await fetch(mediaUrl);
        if (!audioResp.ok) {
            const body = await audioResp.text().catch(() => '');
            console.error(`[AudioProcessor] user=${message.userId} — Falha HTTP ${audioResp.status} ao baixar áudio: ${body}`);
            return {
                text: 'Recebi seu áudio, mas não consegui acessá-lo. Pode tentar de novo?',
                shouldSend: true,
                usedFallback: true,
                reason: 'audio_download_failed',
            };
        }
        const contentType = audioResp.headers.get('content-type');
        if (contentType) mimeType = contentType.split(';')[0].trim();
        const buffer = await audioResp.arrayBuffer();
        audioBase64 = Buffer.from(buffer).toString('base64');
        console.log(`[AudioProcessor] user=${message.userId} — Áudio baixado OK — mimeType: ${mimeType}, tamanho: ${buffer.byteLength} bytes`);
    } catch (err: any) {
        console.error(`[AudioProcessor] user=${message.userId} — Erro ao baixar áudio:`, err);
        return {
            text: 'Recebi seu áudio, mas não consegui acessá-lo. Pode tentar de novo?',
            shouldSend: true,
            usedFallback: true,
            reason: 'audio_download_error',
        };
    }

    // Envia para o Gemini 1.5 Flash
    const systemPrompt = 'Você é o assistente do Economiza Fácil. Ouça este áudio e extraia os produtos e quantidades citados. Retorne APENAS um JSON no formato: {"produtos": [{"nome": "item", "qtd": "valor"}]}. Se não houver produtos, retorne um JSON vazio.';

    const geminiPayload = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mimeType, data: audioBase64 } }] }],
        generationConfig: { responseMimeType: 'application/json' },
    };

    let geminiJson: any;
    try {
        console.log(`[AudioProcessor] user=${message.userId} — Chamando Gemini 1.5 Flash...`);
        const geminiResp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(geminiPayload) },
        );
        if (!geminiResp.ok) {
            const errText = await geminiResp.text();
            console.error(`[AudioProcessor] user=${message.userId} — Gemini API erro HTTP ${geminiResp.status}:`, errText);
            return {
                text: 'Tive um problema ao processar seu áudio. Pode repetir em texto?',
                shouldSend: true,
                usedFallback: true,
                reason: 'audio_gemini_api_error',
            };
        }
        geminiJson = await geminiResp.json();
        console.log(`[AudioProcessor] user=${message.userId} — Resposta bruta Gemini:`, JSON.stringify(geminiJson));
    } catch (err: any) {
        console.error(`[AudioProcessor] user=${message.userId} — Erro na chamada Gemini:`, err);
        return {
            text: 'Tive um problema ao processar seu áudio. Pode repetir em texto?',
            shouldSend: true,
            usedFallback: true,
            reason: 'audio_gemini_fetch_error',
        };
    }

    // Parseia resposta
    let produtos: Array<{ nome: string; qtd: string }> = [];
    try {
        const rawText: string = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        console.log(`[AudioProcessor] user=${message.userId} — Texto bruto Gemini:`, rawText);
        const parsed = JSON.parse(rawText);
        produtos = Array.isArray(parsed.produtos) ? parsed.produtos : [];
    } catch (err: any) {
        console.error(`[AudioProcessor] user=${message.userId} — Falha ao parsear JSON do Gemini:`, err);
        return {
            text: 'Entendi seu áudio mas não identifiquei produtos. Pode me mandar em texto?',
            shouldSend: true,
            usedFallback: true,
            reason: 'audio_gemini_parse_error',
        };
    }

    if (!produtos.length) {
        return {
            text: 'Ouvi seu áudio mas não identifiquei produtos. Pode repetir ou mandar em texto?',
            shouldSend: true,
            usedFallback: false,
            reason: 'audio_no_products',
        };
    }

    const newItems = produtos
        .map((p, i) => ({
            id: `audio_${Date.now()}_${i}`,
            name: String(p.nome || '').trim(),
            quantity: p.qtd ? (parseFloat(String(p.qtd).replace(',', '.')) || 1) : 1,
        }))
        .filter((item) => item.name);

    if (!newItems.length) {
        return {
            text: 'Ouvi seu áudio mas não identifiquei produtos válidos. Pode tentar de novo?',
            shouldSend: true,
            usedFallback: false,
            reason: 'audio_invalid_products',
        };
    }

    // Salva na lista ativa do usuário no Firestore
    const userId = message.storageUserId || message.userId;
    try {
        const listsRef = db.collection('users').doc(userId).collection('lists');
        const activeSnap = await listsRef.where('status', '==', 'active').limit(1).get();

        if (!activeSnap.empty) {
            const activeDoc = activeSnap.docs[0];
            const existingItems: unknown[] = activeDoc.data().items || [];
            await activeDoc.ref.update({
                items: [...existingItems, ...newItems],
                updatedAt: serverTimestamp(),
            });
        } else {
            await listsRef.add({
                items: newItems,
                status: 'active',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        }
    } catch (err: any) {
        console.error(`[AudioProcessor] user=${message.userId} — Erro ao salvar itens no Firestore:`, err);
        return {
            text: 'Identifiquei os produtos mas não consegui salvar na sua lista. Tente novamente.',
            shouldSend: true,
            usedFallback: true,
            reason: 'audio_firestore_error',
        };
    }

    const itemLines = newItems
        .map((i) => `• ${i.name}${i.quantity !== 1 ? ` (${i.quantity})` : ''}`)
        .join('\n');

    console.log(`[AudioProcessor] user=${message.userId} — ${newItems.length} item(ns) adicionado(s) à lista`);

    return {
        text: `✅ Adicionei à sua lista:\n${itemLines}\n\nDigite *minha lista* para ver tudo! 🛒`,
        shouldSend: true,
        usedFallback: false,
        reason: 'audio_processed_gemini',
    };
}

async function buildResponse(rawMessage: InboxMessage): Promise<ResponseBuildResult> {
    const message = rawMessage;

    // ── Áudio: processa via Gemini 1.5 Flash ─────────────────────────────────
    // Evolution API v2 envia mediaUrl (não mediaBase64). O processamento Gemini
    // faz download, transcrição e já persiste os itens na lista do usuário.
    if (message.messageType === 'audioMessage') {
        return processAudioWithGemini(message);
    }
    // ─────────────────────────────────────────────────────────────────────────

    if (message.messageType === 'imageMessage' && message.mediaBase64) {
        const buffer = Buffer.from(message.mediaBase64, 'base64');
        const response = await chatService.processImage(
            new Uint8Array(buffer),
            message.userId,
            message.storageUserId || message.userId,
        );
        console.log(`[INTENT_RESOLVED] user=${message.userId} channel=whatsapp source=imageMessage`);
        return {
            text: response.text,
            shouldSend: true,
            usedFallback: false,
            reason: 'image_processed',
        };
    }

    if (message.messageType === 'imageMessage' && !message.mediaBase64) {
        console.warn(`[FALLBACK_TRIGGERED] user=${message.userId} reason=invalid_media imageMessage_without_mediaBase64`);
        return {
            text: 'Recebi sua imagem, mas ela chegou incompleta pra mim. Pode mandar de novo, de preferência mais nítida?',
            shouldSend: true,
            usedFallback: true,
            reason: 'invalid_media',
        };
    }

    const text = String(message.text || '').trim();
    if (!text) {
        console.log(
            `[FALLBACK_SKIPPED] user=${message.userId} reason=empty_message messageType=${message.messageType || 'unknown'}`,
        );
        return {
            text: null,
            shouldSend: false,
            usedFallback: false,
            reason: 'empty_message',
        };
    }

    // MASTER ADMIN INTERCEPTION
    if (isMasterAdmin(message.remoteJid)) {
        const adminResult = await masterAdminService.processCommand(text, message.remoteJid);
        if (adminResult.handled) {
            console.log(`[INTENT_RESOLVED] user=${message.userId} channel=whatsapp source=master_admin`);
            return {
                text: adminResult.text,
                shouldSend: true,
                usedFallback: false,
                reason: 'master_admin',
            };
        }
    }

    const response = await chatService.processMessage(text, message.userId, message.storageUserId || message.userId);
    if (!String(response.text || '').trim()) {
        console.warn(`[FALLBACK_TRIGGERED] user=${message.userId} reason=empty_chat_response`);
        return {
            text: 'Recebi sua mensagem, mas ainda nao consegui montar uma resposta. Pode tentar escrever de outro jeito?',
            shouldSend: true,
            usedFallback: true,
            reason: 'empty_chat_response',
        };
    }

    return {
        text: response.text,
        shouldSend: true,
        usedFallback: false,
        reason: 'chat_response',
    };
}

async function claimInboxItem(id: string): Promise<InboxMessage | null> {
    const inboxDoc = db.collection('message_inbox').doc(id);
    const claimedAtIso = nowIso();

    return await db.runTransaction(async (transaction: any) => {
        const docSnap = await transaction.get(inboxDoc);
        if (!docSnap.exists) {
            return null;
        }

        const data = docSnap.data() as InboxMessage;
        if (data.status !== 'pending') {
            return null;
        }

        transaction.update(inboxDoc, {
            status: 'processing',
            processingStartedAt: serverTimestamp(),
            processingStartedAtIso: claimedAtIso,
            leaseOwner: WORKER_INSTANCE_ID,
            leaseAcquiredAtIso: claimedAtIso,
            leaseExpiresAtIso: isoPlusMs(claimedAtIso, PROCESSING_LEASE_MS),
            queueLatencyMs: data.receivedAtIso ? Math.max(0, Date.parse(claimedAtIso) - Date.parse(data.receivedAtIso)) : null,
            updatedAt: serverTimestamp(),
            error: null,
        });

        return {
            ...data,
            status: 'processing',
            leaseOwner: WORKER_INSTANCE_ID,
            leaseAcquiredAtIso: claimedAtIso,
            leaseExpiresAtIso: isoPlusMs(claimedAtIso, PROCESSING_LEASE_MS),
        };
    });
}

async function scheduleOutboxRetry(params: {
    outboxId?: string;
    inboxId: string;
    correlationId: string;
    sourceMessageId?: string | null;
    userId: string;
    storageUserId?: string;
    legacyUserId?: string;
    bsuid?: string | null;
    remoteJid: string;
    text: string;
    errorMessage: string;
    retryCount: number;
}) {
    const retryAtIso = isoPlusMs(nowIso(), computeRetryDelayMs(params.retryCount));

    if (params.outboxId) {
        await markOutboxStatus(params.outboxId, 'retrying', {
            correlationId: params.correlationId,
            sourceMessageId: params.sourceMessageId || null,
            error: params.errorMessage,
            retryCount: params.retryCount,
            lastRetryAtIso: nowIso(),
            nextRetryAtIso: retryAtIso,
        });
        return params.outboxId;
    }

    return persistOutboxMessage(params.inboxId, {
        correlationId: params.correlationId,
        sourceMessageId: params.sourceMessageId || null,
        userId: params.userId,
        storageUserId: params.storageUserId || params.userId,
        legacyUserId: params.legacyUserId || params.userId,
        bsuid: params.bsuid || null,
        remoteJid: params.remoteJid,
        text: params.text,
        sendStatus: 'retrying',
        error: params.errorMessage,
        retryCount: params.retryCount,
        lastRetryAtIso: nowIso(),
        nextRetryAtIso: retryAtIso,
    });
}

async function processInboxItem(item: { id: string; data: InboxMessage }) {
    const { id, data } = item;
    const correlationId = data.correlationId || id;
    const sourceMessageId = data.messageId || null;
    const processingStartedAtMs = Date.now();
    console.log(`[EvolutionInboxWorker] [${correlationId}] Iniciando processamento do inbox ${id}.`);
    await persistPipelineAudit({
        correlationId,
        stage: 'inbox_processing',
        status: 'started',
        inboxId: id,
        remoteJid: data.remoteJid,
        userId: data.userId,
        sourceMessageId,
    });

    try {
        await sendPresenceViaEvolution(data.remoteJid);
        const responseBuild = await buildResponse(data);
        if (!responseBuild.shouldSend || !responseBuild.text) {
            await markInboxStatus(id, 'done', {
                correlationId,
                sourceMessageId,
                responsePreview: null,
                processedAt: serverTimestamp(),
                processedAtIso: nowIso(),
                processingDurationMs: Date.now() - processingStartedAtMs,
                leaseOwner: null,
                leaseExpiresAtIso: null,
                skippedSendReason: responseBuild.reason,
            });

            await persistPipelineAudit({
                correlationId,
                stage: 'outbox_delivery',
                status: 'skipped',
                inboxId: id,
                remoteJid: data.remoteJid,
                userId: data.userId,
                sourceMessageId,
                reason: responseBuild.reason,
            });

            console.log(
                `[FALLBACK_SKIPPED] [${correlationId}] Inbox ${id} sem resposta enviavel (${responseBuild.reason}).`,
            );
            return;
        }

        const responseText = responseBuild.text;
        try {
            const sendResult = await sendTextViaEvolution(data.remoteJid, responseText);
            const outboxId = await persistOutboxMessage(id, {
                correlationId,
                sourceMessageId,
                userId: data.userId,
                storageUserId: data.storageUserId || data.userId,
                legacyUserId: data.legacyUserId || data.userId,
                bsuid: data.bsuid || null,
                remoteJid: data.remoteJid,
                text: responseText,
                sendStatus: sendResult.status,
                evolutionRequest: 'requestBody' in sendResult ? sendResult.requestBody : null,
                evolutionResponse: 'parsedResponse' in sendResult ? sendResult.parsedResponse : null,
                error: null,
            });

            const processingDurationMs = Date.now() - processingStartedAtMs;
            const inboxToOutboxMs = data.receivedAtIso
                ? Math.max(0, Date.now() - Date.parse(data.receivedAtIso))
                : null;

            await markInboxStatus(id, sendResult.status === 'sent' ? 'done' : 'awaiting_send', {
                correlationId,
                sourceMessageId,
                responsePreview: responseText.slice(0, 200),
                processedAt: serverTimestamp(),
                processedAtIso: nowIso(),
                processingDurationMs,
                inboxToOutboxMs,
                leaseOwner: null,
                leaseExpiresAtIso: null,
            });

            await persistPipelineAudit({
                correlationId,
                stage: 'outbox_delivery',
                status: sendResult.status === 'sent' ? 'sent' : 'queued',
                inboxId: id,
                outboxId,
                remoteJid: data.remoteJid,
                userId: data.userId,
                sourceMessageId,
                durationMs: inboxToOutboxMs,
                metadata: responseBuild.usedFallback ? { responseType: 'fallback', reason: responseBuild.reason } : { responseType: 'resolved' },
            });

            console.log(`[EvolutionInboxWorker] [${correlationId}] Inbox ${id} processada para ${maskIdentifier(data.remoteJid)} (${sendResult.status}).`);
            return;
        } catch (sendErr: any) {
            const errorMessage = sendErr?.message || 'unknown_send_error';
            const outboxId = await scheduleOutboxRetry({
                inboxId: id,
                correlationId,
                sourceMessageId,
                userId: data.userId,
                storageUserId: data.storageUserId || data.userId,
                legacyUserId: data.legacyUserId || data.userId,
                bsuid: data.bsuid || null,
                remoteJid: data.remoteJid,
                text: responseText,
                errorMessage,
                retryCount: 1,
            });

            await markInboxStatus(id, 'awaiting_send', {
                correlationId,
                sourceMessageId,
                responsePreview: responseText.slice(0, 200),
                processedAt: serverTimestamp(),
                processedAtIso: nowIso(),
                processingDurationMs: Date.now() - processingStartedAtMs,
                leaseOwner: null,
                leaseExpiresAtIso: null,
                lastRetryAtIso: nowIso(),
            });

            await persistPipelineAudit({
                correlationId,
                stage: 'outbox_delivery',
                status: 'retry_scheduled',
                inboxId: id,
                outboxId,
                remoteJid: data.remoteJid,
                userId: data.userId,
                sourceMessageId,
                reason: errorMessage,
                retryCount: 1,
            });

            console.warn(`[EvolutionInboxWorker] [${correlationId}] Falha temporaria no envio. Retry agendado para inbox ${id}.`);
            return;
        }
    } catch (err: any) {
        console.error(`[EvolutionInboxWorker] [${correlationId}] Erro ao processar inbox ${id}:`, err);

        await markInboxStatus(id, 'error', {
            correlationId,
            sourceMessageId,
            error: err.message || 'unknown_error',
            failedAt: serverTimestamp(),
            failedAtIso: nowIso(),
            processingDurationMs: Date.now() - processingStartedAtMs,
            leaseOwner: null,
            leaseExpiresAtIso: null,
        });

        await persistPipelineAudit({
            correlationId,
            stage: 'inbox_processing',
            status: 'error',
            inboxId: id,
            remoteJid: data.remoteJid,
            userId: data.userId,
            sourceMessageId,
            reason: err.message || 'unknown_error',
        });
    }
}

async function processPendingBatch() {
    const pending = await loadPendingMessages();
    if (VERBOSE) {
        console.log(`[EvolutionInboxWorker] Pending inbox count: ${pending.length}`);
    }
    if (pending.length === 0) {
        return;
    }

    for (const item of pending) {
        const claimed = await claimInboxItem(item.id);
        if (!claimed) {
            if (VERBOSE) {
                console.log(`[EvolutionInboxWorker] Inbox ${item.id} nao estava mais disponivel para claim.`);
            }
            continue;
        }

        await processInboxItem({ id: item.id, data: claimed });
    }
}

async function flushPendingOutboxBatch() {
    const sendUrl = getEvolutionSendUrl();
    if (!sendUrl) {
        if (VERBOSE) {
            console.log('[EvolutionInboxWorker] Evolution send URL ausente. Outbox pendente sera mantido.');
        }
        return;
    }

    const pending = await loadPendingOutboxMessages();
    if (VERBOSE) {
        console.log(`[EvolutionInboxWorker] Pending outbox count: ${pending.length}`);
    }
    if (pending.length === 0) {
        return;
    }

    for (const item of pending) {
        try {
            const correlationId = item.data.correlationId || item.data.inboxId || item.id;
            const currentRetryCount = Number(item.data.retryCount || 0);
            const sendResult = await sendTextViaEvolution(item.data.remoteJid, item.data.text);
            await markOutboxStatus(item.id, sendResult.status, {
                correlationId,
                evolutionRequest: 'requestBody' in sendResult ? sendResult.requestBody : null,
                evolutionResponse: 'parsedResponse' in sendResult ? sendResult.parsedResponse : null,
                error: null,
                sentAtIso: sendResult.status === 'sent' ? nowIso() : null,
                nextRetryAtIso: null,
            });
            await markInboxStatus(item.data.inboxId, sendResult.status === 'sent' ? 'done' : 'awaiting_send', {
                correlationId,
                responsePreview: item.data.text.slice(0, 200),
                processedAt: serverTimestamp(),
                processedAtIso: nowIso(),
                inboxToOutboxMs: null,
            });

            await persistPipelineAudit({
                correlationId,
                stage: 'outbox_retry',
                status: sendResult.status === 'sent' ? 'sent' : 'queued',
                inboxId: item.data.inboxId,
                outboxId: item.id,
                remoteJid: item.data.remoteJid,
                userId: item.data.userId,
                sourceMessageId: item.data.sourceMessageId || null,
                retryCount: currentRetryCount,
            });

            console.log(`[EvolutionInboxWorker] [${correlationId}] Outbox ${item.id} reenviado para ${maskIdentifier(item.data.remoteJid)} (${sendResult.status}).`);
        } catch (err: any) {
            const correlationId = item.data.correlationId || item.data.inboxId || item.id;
            console.error(`[EvolutionInboxWorker] [${correlationId}] Erro ao reenviar outbox ${item.id}:`, err);
            const nextRetryCount = Number(item.data.retryCount || 0) + 1;
            const errorMessage = err.message || 'unknown_error';

            if (nextRetryCount <= MAX_SEND_RETRIES) {
                const retryAtIso = isoPlusMs(nowIso(), computeRetryDelayMs(nextRetryCount));
                await markOutboxStatus(item.id, 'retrying', {
                    correlationId,
                    error: errorMessage,
                    retryCount: nextRetryCount,
                    lastRetryAtIso: nowIso(),
                    nextRetryAtIso: retryAtIso,
                });
                await markInboxStatus(item.data.inboxId, 'awaiting_send', {
                    correlationId,
                    error: null,
                    lastRetryAtIso: nowIso(),
                });
                await persistPipelineAudit({
                    correlationId,
                    stage: 'outbox_retry',
                    status: 'retry_scheduled',
                    inboxId: item.data.inboxId,
                    outboxId: item.id,
                    remoteJid: item.data.remoteJid,
                    userId: item.data.userId,
                    sourceMessageId: item.data.sourceMessageId || null,
                    reason: errorMessage,
                    retryCount: nextRetryCount,
                    metadata: { nextRetryAtIso: retryAtIso },
                });
                continue;
            }

            await markOutboxStatus(item.id, 'send_failed', {
                correlationId,
                error: errorMessage,
                retryCount: nextRetryCount,
                lastRetryAtIso: nowIso(),
                nextRetryAtIso: null,
            });
            await markInboxStatus(item.data.inboxId, 'error', {
                correlationId,
                error: errorMessage,
                failedAt: serverTimestamp(),
                failedAtIso: nowIso(),
            });
            await persistPipelineAudit({
                correlationId,
                stage: 'outbox_retry',
                status: 'failed',
                inboxId: item.data.inboxId,
                outboxId: item.id,
                remoteJid: item.data.remoteJid,
                userId: item.data.userId,
                sourceMessageId: item.data.sourceMessageId || null,
                reason: errorMessage,
                retryCount: nextRetryCount,
            });
        }
    }
}

async function main() {
    console.log(
        `[EvolutionInboxWorker] Iniciado. Poll interval: ${POLL_INTERVAL_MS}ms${RUN_ONCE ? ' | modo: once' : ''}${VERBOSE ? ' | verbose' : ''}`,
    );

    await processPendingBatch();
    await flushPendingOutboxBatch();
    if (RUN_ONCE) {
        console.log('[EvolutionInboxWorker] Execucao unica concluida.');
        return;
    }

    setInterval(() => {
        Promise.all([
            processPendingBatch(),
            flushPendingOutboxBatch(),
        ]).catch((err) => {
            console.error('[EvolutionInboxWorker] Loop error:', err);
        });
    }, POLL_INTERVAL_MS);
}

main().catch((err) => {
    console.error('[EvolutionInboxWorker] Fatal error:', err);
    process.exit(1);
});
