import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const workerPath = path.resolve(__dirname, '../../src/workers/EvolutionInboxWorker.ts');
const pipelineTestPath = path.resolve(__dirname, './whatsapp-pipeline.test.ts');

test('worker deve permitir filtro por usuario para testes nao consumirem fila real', () => {
    const workerSource = readFileSync(workerPath, 'utf8');

    assert.match(
        workerSource,
        /const WORKER_USER_FILTER = process\.env\.EVOLUTION_WORKER_USER_ID\?\.trim\(\) \|\| '';/,
        'Worker precisa aceitar EVOLUTION_WORKER_USER_ID como filtro operacional.',
    );
    assert.match(
        workerSource,
        /queryRef = queryRef\.where\('userId', '==', WORKER_USER_FILTER\);/,
        'Worker precisa filtrar message_inbox/message_outbox pelo usuario quando o filtro existir.',
    );
});

test('teste whatsapp deve isolar o worker no usuario fake criado pelo proprio teste', () => {
    const testSource = readFileSync(pipelineTestPath, 'utf8');

    assert.match(
        testSource,
        /EVOLUTION_WORKER_USER_ID:\s*testUserId/,
        'Teste de pipeline nao pode rodar worker sem limitar ao usuario fake.',
    );
});
