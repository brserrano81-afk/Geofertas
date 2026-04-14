import dotenv from 'dotenv';
import {
    addDoc,
    collection,
    doc,
    getDocs,
    limit,
    query,
    runTransaction,
    serverTimestamp,
    updateDoc,
    where,
} from 'firebase/firestore';

import { db } from '../firebase';
import { chatService } from '../services/ChatService';
import { isMasterAdmin, masterAdminService } from '../services/MasterAdminService';

dotenv.config();

interface InboxMessage {
    correlationId?: string;
    messageId?: string | null;
    userId: string;
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
    const inboxRef = collection(db, 'message_inbox');
    const pendingQuery = query(inboxRef, where('status', '==', 'pending'), limit(5));
    const snap = await getDocs(pendingQuery);

    return snap.docs
        .map((docSnap) => ({
            id: docSnap.id,
            data: docSnap.data() as InboxMessage,
        }))
        .sort((a, b) => {
            const aTime = String((a.data as any).receivedAtIso || '');
            const bTime = String((b.data as any).receivedAtIso || '');
            return aTime.localeCompare(bTime);
        });
}

async function loadPendingOutboxMessages(): Promise<Array<{ id: string; data: OutboxMessage }>> {
    const outboxRef = collection(db, 'message_outbox');
    const pendingQuery = query(outboxRef, where('sendStatus', 'in', ['pending_send', 'retrying']), limit(10));
    const snap = await getDocs(pendingQuery);

    return snap.docs
        .map((docSnap) => ({
            id: docSnap.id,
            data: docSnap.data() as OutboxMessage,
        }))
        .filter((item) => isRetryDue(item.data.nextRetryAtIso))
        .sort((a, b) => a.id.localeCompare(b.id));
}

async function markInboxStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
    const inboxDoc = doc(db, 'message_inbox', id);
    await updateDoc(inboxDoc, {
        status,
        ...(status === 'error' ? {} : { error: null }),
        ...(status === 'processing' ? { processingStartedAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
        ...extra,
    });
}

async function markOutboxStatus(id: string, status: OutboxMessage['sendStatus'], extra: Record<string, unknown> = {}) {
    const outboxDoc = doc(db, 'message_outbox', id);
    await updateDoc(outboxDoc, {
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
        await addDoc(collection(db, 'integration_events'), {
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
    const outboxRef = await addDoc(collection(db, 'message_outbox'), {
        inboxId,
        source: 'economizafacil-worker',
        correlationId: payload.correlationId || inboxId,
        sourceMessageId: payload.sourceMessageId || null,
        userId: payload.userId,
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

async function buildResponse(message: InboxMessage): Promise<string> {
    if (message.messageType === 'imageMessage' && message.mediaBase64) {
        const buffer = Buffer.from(message.mediaBase64, 'base64');
        const response = await chatService.processImage(new Uint8Array(buffer), message.userId);
        return response.text;
    }

    const text = String(message.text || '').trim();
    if (!text) {
        return 'Recebi sua mensagem, mas ainda nao consegui interpretar esse formato. Pode mandar em texto ou imagem?';
    }

    // MASTER ADMIN INTERCEPTION
    if (isMasterAdmin(message.remoteJid)) {
        const adminResult = await masterAdminService.processCommand(text, message.remoteJid);
        if (adminResult.handled) {
            return adminResult.text;
        }
    }

    const response = await chatService.processMessage(text, message.userId);
    return response.text;
}

async function claimInboxItem(id: string): Promise<InboxMessage | null> {
    const inboxDoc = doc(db, 'message_inbox', id);
    const claimedAtIso = nowIso();

    return runTransaction(db, async (transaction) => {
        const snap = await transaction.get(inboxDoc);
        if (!snap.exists()) {
            return null;
        }

        const data = snap.data() as InboxMessage;
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
        const responseText = await buildResponse(data);
        try {
            const sendResult = await sendTextViaEvolution(data.remoteJid, responseText);
            const outboxId = await persistOutboxMessage(id, {
                correlationId,
                sourceMessageId,
                userId: data.userId,
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
            });

            console.log(`[EvolutionInboxWorker] [${correlationId}] Inbox ${id} processada para ${data.remoteJid} (${sendResult.status}).`);
            return;
        } catch (sendErr: any) {
            const errorMessage = sendErr?.message || 'unknown_send_error';
            const outboxId = await scheduleOutboxRetry({
                inboxId: id,
                correlationId,
                sourceMessageId,
                userId: data.userId,
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

            console.log(`[EvolutionInboxWorker] [${correlationId}] Outbox ${item.id} reenviado para ${item.data.remoteJid} (${sendResult.status}).`);
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
