import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerPath = path.resolve(__dirname, '../../src/workers/EvolutionInboxWorker.ts');

function extractFunctionSource(source, functionName) {
    const signature = `async function ${functionName}`;
    const start = source.indexOf(signature);
    if (start < 0) {
        throw new Error(`Nao foi possivel localizar ${functionName}.`);
    }

    const openBrace = source.indexOf('{', start);
    let depth = 0;
    for (let i = openBrace; i < source.length; i += 1) {
        if (source[i] === '{') depth += 1;
        if (source[i] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }

    throw new Error(`Nao foi possivel delimitar ${functionName}.`);
}

function extractFunctionBlock(source, functionName) {
    const signature = `function ${functionName}`;
    const start = source.indexOf(signature);
    if (start < 0) {
        throw new Error(`Nao foi possivel localizar ${functionName}.`);
    }

    const openBrace = source.indexOf('{', start);
    let depth = 0;
    for (let i = openBrace; i < source.length; i += 1) {
        if (source[i] === '{') depth += 1;
        if (source[i] === '}') {
            depth -= 1;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }

    throw new Error(`Nao foi possivel delimitar ${functionName}.`);
}

function buildAudioProcessor({ transcription, transcribeThrows = false, chatResponseText = 'ok' }) {
    const workerSource = readFileSync(workerPath, 'utf8');
    const helperSource = extractFunctionBlock(workerSource, 'truncateForLog');
    const functionSource = extractFunctionSource(workerSource, 'processAudioWithGemini');
    const transpiled = ts.transpileModule(`${helperSource}\n${functionSource}`, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText;

    const capturedChatMessages = [];
    const capturedTranscriptions = [];
    const aiService = {
        async transcribeAudio(audioData, mimeType) {
            capturedTranscriptions.push({ audioLength: audioData.length, mimeType });
            if (transcribeThrows) throw new Error('transcription failed');
            return transcription;
        },
    };
    const chatService = {
        async processMessage(message, userId, storageUserId) {
            capturedChatMessages.push({ message, userId, storageUserId });
            return { text: chatResponseText };
        },
    };

    const processAudioWithGemini = new Function(
        'aiService',
        'chatService',
        'downloadAudioViaEvolution',
        'Buffer',
        'console',
        `${transpiled}\nreturn processAudioWithGemini;`,
    )(
        aiService,
        chatService,
        async () => null,
        Buffer,
        { log() {}, warn() {}, error() {} },
    );

    return { processAudioWithGemini, capturedChatMessages, capturedTranscriptions };
}

function audioMessage(overrides = {}) {
    return {
        userId: 'wa:5511999999999',
        storageUserId: 'wa-storage-5511999999999',
        remoteJid: '5511999999999@s.whatsapp.net',
        messageType: 'audioMessage',
        mediaBase64: Buffer.from('fake-audio').toString('base64'),
        ...overrides,
    };
}

test('audio com transcricao "preco do cafe" deve chamar ChatService e retornar consulta de preco', async () => {
    const { processAudioWithGemini, capturedChatMessages, capturedTranscriptions } = buildAudioProcessor({
        transcription: 'preco do cafe',
        chatResponseText: 'Cafe encontrado por R$ 12,99.',
    });

    const result = await processAudioWithGemini(audioMessage());

    assert.equal(capturedTranscriptions.length, 1);
    assert.equal(capturedTranscriptions[0].mimeType, 'audio/ogg');
    assert.deepEqual(capturedChatMessages, [{
        message: 'preco do cafe',
        userId: 'wa:5511999999999',
        storageUserId: 'wa-storage-5511999999999',
    }]);
    assert.equal(result.text, 'Cafe encontrado por R$ 12,99.');
    assert.equal(result.reason, 'audio_transcribed');
});

test('audio com transcricao "preco do cafe Melitta" deve preservar marca no texto enviado ao ChatService', async () => {
    const { processAudioWithGemini, capturedChatMessages } = buildAudioProcessor({
        transcription: 'preco do cafe Melitta',
        chatResponseText: 'Cafe Melitta encontrado.',
    });

    const result = await processAudioWithGemini(audioMessage());

    assert.equal(capturedChatMessages[0].message, 'preco do cafe Melitta');
    assert.equal(result.text, 'Cafe Melitta encontrado.');
    assert.equal(result.reason, 'audio_transcribed');
});

test('audio com transcricao de lista deve usar fluxo normal do ChatService', async () => {
    const { processAudioWithGemini, capturedChatMessages } = buildAudioProcessor({
        transcription: 'adiciona arroz e feijao na lista',
        chatResponseText: 'Adicionei arroz e feijao.',
    });

    const result = await processAudioWithGemini(audioMessage());

    assert.equal(capturedChatMessages[0].message, 'adiciona arroz e feijao na lista');
    assert.equal(result.text, 'Adicionei arroz e feijao.');
    assert.equal(result.reason, 'audio_transcribed');
});

test('audio com transcricao vazia deve retornar mensagem amigavel sem chamar ChatService', async () => {
    const { processAudioWithGemini, capturedChatMessages } = buildAudioProcessor({
        transcription: '',
    });

    const result = await processAudioWithGemini(audioMessage());

    assert.equal(capturedChatMessages.length, 0);
    assert.equal(result.text, 'Ouvi seu áudio, mas não consegui entender bem. Pode repetir ou mandar em texto?');
    assert.equal(result.reason, 'audio_empty');
    assert.equal(result.usedFallback, true);
});

test('audio antes do aceite LGPD deve passar pelo ChatService e respeitar o gate como texto normal', async () => {
    const consentText = 'Antes de começarmos, preciso te informar sobre a Política de Privacidade. Responda SIM para continuar.';
    const { processAudioWithGemini, capturedChatMessages } = buildAudioProcessor({
        transcription: 'preco do cafe',
        chatResponseText: consentText,
    });

    const result = await processAudioWithGemini(audioMessage());

    assert.equal(capturedChatMessages[0].message, 'preco do cafe');
    assert.equal(result.text, consentText);
    assert.equal(result.reason, 'audio_transcribed');
});

test('falha no servico de transcricao nao deve travar o worker', async () => {
    const { processAudioWithGemini, capturedChatMessages } = buildAudioProcessor({
        transcription: null,
        transcribeThrows: true,
    });

    const result = await processAudioWithGemini(audioMessage());

    assert.equal(capturedChatMessages.length, 0);
    assert.equal(result.text, 'Tive um problema ao processar seu áudio. Pode repetir em texto?');
    assert.equal(result.reason, 'audio_transcription_failed');
    assert.equal(result.usedFallback, true);
});
