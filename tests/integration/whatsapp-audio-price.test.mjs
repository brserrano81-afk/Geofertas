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
        throw new Error(`Nao foi possivel localizar ${functionName} no worker.`);
    }

    const openBrace = source.indexOf('{', start);
    if (openBrace < 0) {
        throw new Error(`Nao foi possivel localizar a abertura de ${functionName}.`);
    }

    let depth = 0;
    for (let i = openBrace; i < source.length; i += 1) {
        const char = source[i];
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return source.slice(start, i + 1);
            }
        }
    }

    throw new Error(`Nao foi possivel delimitar ${functionName}.`);
}

function extractFunctionBlock(source, functionName) {
    const signature = `function ${functionName}`;
    const start = source.indexOf(signature);
    if (start < 0) {
        throw new Error(`Nao foi possivel localizar ${functionName} no worker.`);
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

function buildAudioProcessor() {
    const workerSource = readFileSync(workerPath, 'utf8');
    const helperSource = extractFunctionBlock(workerSource, 'truncateForLog');
    const functionSource = extractFunctionSource(workerSource, 'processAudioWithGemini');
    const transpiled = ts.transpileModule(`${helperSource}\n${functionSource}`, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ES2022,
        },
    }).outputText;

    const capturedQueries = [];
    const chatService = {
        async processMessage(message) {
            capturedQueries.push(message);
            return {
                text: 'R$ 9,99 no Atacadão',
            };
        },
    };
    const aiService = {
        async transcribeAudio() {
            return 'consultar preço de arroz';
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

    return { processAudioWithGemini, capturedQueries };
}

test('CHECK_PRICE no audio deve ser roteado para o motor de consulta e retornar a resposta real', async () => {
    const { processAudioWithGemini, capturedQueries } = buildAudioProcessor();

    const result = await processAudioWithGemini({
        userId: 'qa-audio-user',
        storageUserId: 'qa-audio-storage',
        messageType: 'audioMessage',
        mediaBase64: 'ZHVtbXktYXVkaW8=',
    });

    assert.equal(capturedQueries.length, 1);
    assert.equal(capturedQueries[0], 'consultar preço de arroz');
    assert.equal(result.reason, 'audio_transcribed');
    assert.equal(result.text, 'R$ 9,99 no Atacadão');
    assert.equal(result.shouldSend, true);
    assert.equal(result.usedFallback, false);
    assert.ok(!result.text.includes('Vou buscar as ofertas'));
});

test('audio deve transcrever antes de delegar intencao ao ChatService', () => {
    const workerSource = readFileSync(workerPath, 'utf8');

    assert.match(workerSource, /aiService\.transcribeAudio\(/);
    assert.match(workerSource, /chatService\.processMessage\(\s*cleanTranscription,/);
    assert.doesNotMatch(workerSource, /audio_no_products/);
});
