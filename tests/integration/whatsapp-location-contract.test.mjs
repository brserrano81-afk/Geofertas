import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const webhookPath = path.resolve(__dirname, '../../api/sefaz-proxy.js');
const workerPath = path.resolve(__dirname, '../../src/workers/EvolutionInboxWorker.ts');
const chatServicePath = path.resolve(__dirname, '../../src/services/ChatService.ts');
const lgpdConsentServicePath = path.resolve(__dirname, '../../src/services/LgpdConsentService.ts');

function extractSlice(source, startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    if (start < 0) {
        throw new Error(`Nao foi possivel localizar o marcador inicial: ${startMarker}`);
    }

    const end = source.indexOf(endMarker, start);
    if (end < 0) {
        throw new Error(`Nao foi possivel localizar o marcador final: ${endMarker}`);
    }

    return source.slice(start, end);
}

function buildWebhookHelpers() {
    const webhookSource = readFileSync(webhookPath, 'utf8');
    const extractMessageTextSource = extractSlice(
        webhookSource,
        'function extractMessageText',
        'function extractLocationPayload',
    );
    const extractLocationPayloadSource = extractSlice(
        webhookSource,
        'function extractLocationPayload',
        'function normalizeEvolutionEvent',
    );
    const normalizeEvolutionEventSource = extractSlice(
        webhookSource,
        'function normalizeEvolutionEvent',
        'function shouldEnqueueInboundMessage',
    );
    const shouldEnqueueSource = extractSlice(
        webhookSource,
        'function shouldEnqueueInboundMessage',
        'function validateNormalizedEvent',
    );

    return new Function(
        'normalizeRemoteJid',
        'extractBsuidCandidate',
        'Date',
        'Math',
        'console',
        `
return (() => {
${extractMessageTextSource}
${extractLocationPayloadSource}
${normalizeEvolutionEventSource}
${shouldEnqueueSource}
return { normalizeEvolutionEvent, shouldEnqueueInboundMessage };
})();
        `,
    )(
        (jid) => jid,
        () => null,
        Date,
        Math,
        { log() {}, warn() {}, error() {} },
    );
}

function buildNeighborhoodFallbackDetector() {
    const chatSource = readFileSync(chatServicePath, 'utf8');
    const normalizeTextSource = extractSlice(
        chatSource,
        'function normalizeText',
        'function detectOptimizationPreference',
    );
    const detectorSource = extractSlice(
        chatSource,
        'function looksLikeNeighborhoodFallback',
        'function isIntentResolved',
    );
    const transpiled = ts.transpileModule(`${normalizeTextSource}\n${detectorSource}`, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText;

    return new Function(
        'COURTESY_WORDS',
        `${transpiled}\nreturn looksLikeNeighborhoodFallback;`,
    )(
        new Set([
            'oi', 'ola', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'obrigado',
            'obrigada', 'valeu', 'e ai', 'e aí', 'show', 'blz', 'beleza',
        ]),
    );
}

function buildWorkerBuildResponse() {
    const workerSource = readFileSync(workerPath, 'utf8');
    const extractInboxLocationSource = extractSlice(
        workerSource,
        'function extractInboxLocation',
        'async function processAudioWithGemini',
    );
    const buildResponseSource = extractSlice(
        workerSource,
        'async function buildResponse',
        'async function claimInboxItem',
    );
    const transpiled = ts.transpileModule(`${extractInboxLocationSource}\n${buildResponseSource}`, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText;

    const capturedQueries = [];
    const chatService = {
        async processMessage(message) {
            capturedQueries.push(message);
            return { text: 'Localizacao recebida e processada.' };
        },
        async processImage() {
            return { text: 'image' };
        },
    };

    const buildResponse = new Function(
        'chatService',
        'processAudioWithGemini',
        'Buffer',
        'isMasterAdmin',
        'masterAdminService',
        'console',
        `${transpiled}\nreturn buildResponse;`,
    )(
        chatService,
        async () => ({ text: 'audio', shouldSend: true, usedFallback: false, reason: 'audio' }),
        Buffer,
        () => false,
        { async processCommand() { return { handled: false, text: '' }; } },
        { log() {}, warn() {}, error() {} },
    );

    return { buildResponse, capturedQueries };
}

test('webhook deve aceitar locationMessage e normalizar lat/lng no evento de inbox', () => {
    const { normalizeEvolutionEvent, shouldEnqueueInboundMessage } = buildWebhookHelpers();

    const payload = {
        event: 'messages.upsert',
        data: {
            key: {
                id: 'msg-location-1',
                remoteJid: '5511999999999@s.whatsapp.net',
                fromMe: false,
            },
            message: {
                locationMessage: {
                    degreesLatitude: -20.3349,
                    degreesLongitude: -40.2921,
                    address: 'Praia da Costa, Vila Velha - ES',
                },
            },
        },
    };

    const normalized = normalizeEvolutionEvent(payload);

    assert.equal(normalized.messageType, 'locationMessage');
    assert.equal(shouldEnqueueInboundMessage(normalized), true);
    assert.deepEqual(normalized.location, {
        lat: -20.3349,
        lng: -40.2921,
        address: 'Praia da Costa, Vila Velha - ES',
    });
});

test('worker oficial deve converter locationMessage na trilha [GPS_LOCATION_UPDATE]', async () => {
    const { buildResponse, capturedQueries } = buildWorkerBuildResponse();

    const result = await buildResponse({
        userId: 'qa-location-user',
        storageUserId: 'qa-location-storage',
        remoteJid: '5511999999999@s.whatsapp.net',
        messageType: 'locationMessage',
        text: '',
        location: {
            lat: -20.3349,
            lng: -40.2921,
            address: 'Praia da Costa, Vila Velha - ES',
        },
    });

    assert.equal(capturedQueries.length, 1);
    assert.equal(capturedQueries[0], '[GPS_LOCATION_UPDATE] -20.3349, -40.2921');
    assert.equal(result.text, 'Localizacao recebida e processada.');
    assert.equal(result.shouldSend, true);
    assert.notEqual(result.reason, 'empty_message');
});

test('ChatService deve aceitar bairro em texto no estado AWAITING_INITIAL_LOCATION', () => {
    const chatSource = readFileSync(chatServicePath, 'utf8');
    const awaitingLocationBlock = extractSlice(
        chatSource,
        "if (conversationState.current === 'AWAITING_INITIAL_LOCATION') {",
        "if (conversationState.current === 'CRIANDO_LISTA' || conversationState.current === 'AWAITING_ADD_TO_LIST') {",
    );
    const neighborhoodFallbackSource = extractSlice(
        chatSource,
        'private handleNeighborhoodFallback(message: string): ChatResponse {',
        'private async handleFindNearbyMarkets(): Promise<ChatResponse> {',
    );

    assert.match(awaitingLocationBlock, /looksLikeNeighborhoodFallback\(message\)/);
    assert.match(awaitingLocationBlock, /return this\.handleNeighborhoodFallback\(message\)/);
    assert.match(neighborhoodFallbackSource, /savePreferences\(\s*this\.context\.userId,\s*\{\s*neighborhood,/);
    assert.match(neighborhoodFallbackSource, /this\.conversationState\.reset\(\)/);
    assert.match(neighborhoodFallbackSource, /regiao por enquanto/i);
});

test('detector de bairro deve aceitar regiao simples e rejeitar pedido de preco', () => {
    const looksLikeNeighborhoodFallback = buildNeighborhoodFallbackDetector();

    assert.equal(looksLikeNeighborhoodFallback('Praia da Costa'), true);
    assert.equal(looksLikeNeighborhoodFallback('perto do Shopping Praia da Costa'), true);
    assert.equal(looksLikeNeighborhoodFallback('quanto ta o arroz?'), false);
    assert.equal(looksLikeNeighborhoodFallback('oi'), false);
});

test('depois de resposta valida de localizacao o fluxo nao deve recair na mensagem generica de pendencia', () => {
    const chatSource = readFileSync(chatServicePath, 'utf8');
    const awaitingLocationBlock = extractSlice(
        chatSource,
        "if (conversationState.current === 'AWAITING_INITIAL_LOCATION') {",
        "if (conversationState.current === 'CRIANDO_LISTA' || conversationState.current === 'AWAITING_ADD_TO_LIST') {",
    );

    assert.ok(
        !/ainda estou aguardando sua resposta anterior/i.test(awaitingLocationBlock),
        'O bloco de localizacao precisa resolver GPS ou bairro antes do guard de pendencia.',
    );
});

test('saudacao inicial deve pedir localizacao', () => {
    const chatSource = readFileSync(chatServicePath, 'utf8');
    const saudacaoBlock = extractSlice(
        chatSource,
        'private handleSaudacao(): ChatResponse {',
        'private handleLocation(): ChatResponse {',
    );

    assert.match(saudacaoBlock, /requestLocation:\s*true/);
    assert.match(saudacaoBlock, /me manda sua localiza/i);
});

test('GPS sem LGPD deve entrar no gate antes de liberar localizacao', () => {
    const chatSource = readFileSync(chatServicePath, 'utf8');
    const processBlock = extractSlice(
        chatSource,
        'private async _processMessageInternal(message: string): Promise<ChatResponse> {',
        'conversationState.addMessage(this.context.userId, \'user\', message);',
    );

    const gpsParseIndex = processBlock.indexOf("parseGpsLocationUpdate(message)");
    const consentCheckIndex = processBlock.indexOf('lgpdConsentService.hasConsented');
    const gateIndex = processBlock.indexOf('lgpdConsentService.evaluateConsentGate');
    const lgpdStateIndex = processBlock.indexOf("conversationState.transition(\n                'AWAITING_LGPD_CONSENT'");
    const gateReturnIndex = processBlock.indexOf("return { text: consentGate.responseText || '' };");
    const legacyGpsIndex = processBlock.indexOf("if (message.startsWith('[GPS_LOCATION_UPDATE]'))");
    const locationReleaseIndex = processBlock.indexOf('return this.handleCoords(lat, lng)');

    assert.ok(gpsParseIndex >= 0, 'GPS precisa ser extraido antes do gate.');
    assert.ok(consentCheckIndex > gpsParseIndex, 'GPS precisa consultar consentimento antes do handler legado.');
    assert.ok(gateIndex > consentCheckIndex, 'GPS sem consentimento precisa avaliar o gate LGPD.');
    assert.ok(lgpdStateIndex > gateIndex, 'GPS sem consentimento precisa entrar em AWAITING_LGPD_CONSENT.');
    assert.ok(gateReturnIndex > lgpdStateIndex, 'GPS sem consentimento deve retornar a mensagem LGPD.');
    assert.ok(locationReleaseIndex > legacyGpsIndex, 'Liberacao de localizacao deve ficar depois do caminho protegido.');
    assert.ok(gateReturnIndex < legacyGpsIndex, 'GPS sem consentimento deve retornar antes do handler que libera uso normal.');
});

test('comandos normais sem LGPD devem ser bloqueados antes do fluxo normal', () => {
    const chatSource = readFileSync(chatServicePath, 'utf8');
    const processBlock = extractSlice(
        chatSource,
        'const consentGate = await lgpdConsentService.evaluateConsentGate(this.context.userId, message);',
        'conversationState.addMessage(this.context.userId, \'user\', message);',
    );

    assert.match(processBlock, /if \(!consentGate\.allowed\)/);
    assert.match(processBlock, /return \{ text: consentGate\.responseText \|\| '' \}/);
});

test('aceite LGPD com GPS pendente deve processar localizacao e limpar estado', () => {
    const chatSource = readFileSync(chatServicePath, 'utf8');
    const processBlock = extractSlice(
        chatSource,
        'const consentGate = await lgpdConsentService.evaluateConsentGate(this.context.userId, message);',
        'if (!consentGate.allowed) {',
    );

    assert.match(processBlock, /consentGate\.justConsented/);
    assert.match(processBlock, /conversationState\.current === 'AWAITING_LGPD_CONSENT'/);
    assert.match(processBlock, /isPendingGpsLocation\(conversationState\.data\)/);
    assert.match(processBlock, /return this\.handleCoords\(pendingLocation\.lat, pendingLocation\.lng\)/);
    assert.match(processBlock, /conversationState\.reset\(\)/);
});

test('LGPD deve aceitar continuar como aceite explicito', () => {
    const lgpdSource = readFileSync(lgpdConsentServicePath, 'utf8');

    assert.match(lgpdSource, /ACCEPTANCE_WORDS = new Set\(\[[^\]]*'continuar'[^\]]*\]\)/);
});
