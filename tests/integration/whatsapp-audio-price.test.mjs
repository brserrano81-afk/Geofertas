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

function extractCheckPriceBranch(source) {
    const marker = "if (intent === 'CHECK_PRICE')";
    const start = source.indexOf(marker);
    if (start < 0) {
        throw new Error('Nao foi possivel localizar o ramo CHECK_PRICE no worker.');
    }

    const nextMarker = '\n    const newItems = parsedItems;';
    const end = source.indexOf(nextMarker, start);
    if (end < 0) {
        throw new Error('Nao foi possivel delimitar o ramo CHECK_PRICE no worker.');
    }

    return source.slice(start, end);
}

function buildAudioProcessor() {
    const workerSource = readFileSync(workerPath, 'utf8');
    const functionSource = extractFunctionSource(workerSource, 'processAudioWithGemini');
    const transpiled = ts.transpileModule(functionSource, {
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

    const fetchStub = async () => ({
        ok: true,
        async json() {
            return {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: JSON.stringify({
                                        intent: 'CHECK_PRICE',
                                        produtos: [{ nome: 'arroz', qtd: '' }],
                                    }),
                                },
                            ],
                        },
                    },
                ],
            };
        },
        async text() {
            return 'ok';
        },
    });

    const processAudioWithGemini = new Function(
        'chatService',
        'fetch',
        'console',
        'process',
        'db',
        'serverTimestamp',
        'downloadAudioViaEvolution',
        `${transpiled}\nreturn processAudioWithGemini;`,
    )(
        chatService,
        fetchStub,
        { log() {}, warn() {}, error() {} },
        { env: { GEMINI_API_KEY: 'test-key' } },
        undefined,
        undefined,
        async () => null,
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
    assert.equal(result.reason, 'audio_check_price_routed_to_chat');
    assert.equal(result.text, 'R$ 9,99 no Atacadão');
    assert.equal(result.shouldSend, true);
    assert.equal(result.usedFallback, false);
    assert.ok(!result.text.includes('Vou buscar as ofertas'));
});

test('o ramo CHECK_PRICE nao pode voltar a parar na mensagem intermediaria', () => {
    const workerSource = readFileSync(workerPath, 'utf8');
    const branch = extractCheckPriceBranch(workerSource);

    assert.match(branch, /chatService\.processMessage\(/);
    assert.match(branch, /audio_check_price_routed_to_chat/);
    assert.ok(!branch.includes('Vou buscar as ofertas'));
});
