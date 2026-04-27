/**
 * Exemplo Prático: Usando JourneyLogger
 * 
 * Copie e adapte estes snippets para integrar ao seu código
 */

// ═══════════════════════════════════════════════════════════════
// 1️⃣ WEBHOOK (api/sefaz-proxy.js)
// ═══════════════════════════════════════════════════════════════

import { journeyLogger } from '../src/services/JourneyLogger.js';

// No handler do webhook:
app.post('/webhook/whatsapp-entrada', webhookRateLimit, async (req, res) => {
    const normalizedEvent = normalizeEvolutionEvent(req.body);
    
    // ✅ Iniciar jornada
    journeyLogger.startJourney(
        normalizedEvent.correlationId,
        normalizedEvent.messageId
    );
    
    try {
        // Log de recebimento
        journeyLogger.logSuccess(
            normalizedEvent.correlationId,
            'webhook_received',
            `Mensagem ${normalizedEvent.messageType} recebida`,
            {
                remoteJid: normalizedEvent.remoteJid,
                textPreview: normalizedEvent.textPreview,
            }
        );
        
        const identity = await resolveCanonicalIdentity(normalizedEvent);
        normalizedEvent.userId = identity.canonicalUserId;
        
        // ... resto do código ...
        
        // Log de validação
        journeyLogger.logSuccess(
            normalizedEvent.correlationId,
            'webhook_validation',
            'Validação passou',
        );
        
        // Log de enfileiramento
        if (enqueueResult.inboxId) {
            journeyLogger.logSuccess(
                normalizedEvent.correlationId,
                'inbox_enqueued',
                'Enfileirado no inbox',
                { inboxId: enqueueResult.inboxId }
            );
        }
        
    } catch (err) {
        // Log de erro COM stack trace
        journeyLogger.logError(
            normalizedEvent.correlationId,
            'error',
            'Erro no webhook',
            err,
        );
    }
});


// ═══════════════════════════════════════════════════════════════
// 2️⃣ WORKER (src/workers/EvolutionInboxWorker.ts)
// ═══════════════════════════════════════════════════════════════

import { journeyLogger } from '../services/JourneyLogger';

async function processInboxMessage(message: InboxMessage) {
    try {
        // Log: Worker iniciou
        journeyLogger.logSuccess(
            message.correlationId!,
            'worker_started',
            `Processando mensagem`,
            { inboxId: message.id }
        );
        
        // Chamar ChatService
        const response = await chatService.processMessage({...});
        
        // Log: ChatService respondeu
        journeyLogger.logSuccess(
            message.correlationId!,
            'chat_service_response',
            'Resposta obtida',
            {
                intent: response?.intent,
                responseLength: response?.text?.length || 0,
            }
        );
        
        // Enviar resposta
        const sendResult = await sendTextViaEvolution(message.remoteJid, response.text);
        
        if (sendResult.status === 'sent') {
            // Log: Sucesso
            journeyLogger.logSuccess(
                message.correlationId!,
                'evolution_send_success',
                'Resposta enviada',
                { evolutionStatus: 'sent' }
            );
        } else {
            // Log: Falha
            journeyLogger.logWarn(
                message.correlationId!,
                'evolution_send_failed',
                `Falha ao enviar: ${sendResult.status}`,
            );
        }
        
        // Finalizar jornada (salva arquivo JSON)
        await journeyLogger.finalizeJourney(message.correlationId!);
        
    } catch (err) {
        // Log de exceção
        journeyLogger.logError(
            message.correlationId!,
            'error',
            'Erro ao processar mensagem',
            err as Error,
        );
        
        await journeyLogger.finalizeJourney(message.correlationId!);
    }
}


// ═══════════════════════════════════════════════════════════════
// 3️⃣ CHAT SERVICE (src/services/ChatService.ts)
// ═══════════════════════════════════════════════════════════════

import { journeyLogger } from './JourneyLogger';

class ChatService {
    async processMessage(params: ProcessMessageParams) {
        const { correlationId } = params;
        
        try {
            journeyLogger.logSuccess(
                correlationId,
                'chat_service_called',
                'ChatService processando',
                {
                    userId: params.userId,
                    messageType: params.messageType,
                }
            );
            
            // ... lógica do ChatService ...
            
            return {
                text: response,
                intent: 'consultar_preco_produto',
            };
            
        } catch (err) {
            journeyLogger.logError(
                correlationId,
                'error',
                'Erro no ChatService',
                err as Error,
            );
            throw err;
        }
    }
}


// ═══════════════════════════════════════════════════════════════
// 4️⃣ VISUALIZAR LOGS
// ═══════════════════════════════════════════════════════════════

// Jornadas ativas
import { journeyLogger } from '../services/JourneyLogger';

// Ver todas as jornadas ativas
const active = journeyLogger.getAllActiveJourneys();
console.log('Jornadas ativas:', active);
// Output:
// [
//   {
//     correlationId: 'abc123...',
//     userId: '5527998...',
//     startedAt: '2026-04-26T15:30:00Z',
//     stageCount: 5
//   }
// ]

// Ver detalhes de uma jornada
const journey = journeyLogger.getJourney('abc123def456');
console.log('Jornada detalhada:', journey);
// Output:
// {
//   correlationId: 'abc123def456',
//   userId: '5527998862440@s.whatsapp.net',
//   startedAt: '2026-04-26T15:30:00Z',
//   stages: [
//     { stage: 'webhook_received', timestamp: '2026-04-26T15:30:00.100Z', ... },
//     { stage: 'inbox_enqueued', timestamp: '2026-04-26T15:30:00.300Z', ... },
//     ...
//   ]
// }


// ═══════════════════════════════════════════════════════════════
// 5️⃣ PADRÕES DE MÉTODOS
// ═══════════════════════════════════════════════════════════════

// ✅ Sucesso simples
journeyLogger.logSuccess(
    correlationId,
    'webhook_received',
    'Webhook recebido'
);

// ✅ Sucesso com metadados
journeyLogger.logSuccess(
    correlationId,
    'inbox_enqueued',
    'Mensagem enfileirada',
    {
        inboxId: 'inbox_123',
        userId: '5527998...',
        messageType: 'conversation',
    }
);

// ⚠️ Aviso
journeyLogger.logWarn(
    correlationId,
    'evolution_send_failed',
    'Falha ao enviar, tentando novamente'
);

// ✗ Erro COM stack trace
try {
    // ... código ...
} catch (err) {
    journeyLogger.logError(
        correlationId,
        'error',
        'Erro ao processar',
        err,
        {
            stage: 'chat_service',
            userId: message.userId,
        }
    );
}

// ℹ️ Log customizado
journeyLogger.logStage(
    correlationId,
    'custom_stage',
    'debug', // 'info', 'warn', 'error', 'debug'
    'Mensagem customizada',
    {
        customField: 'valor',
        duration_ms: 1234,
    }
);


// ═══════════════════════════════════════════════════════════════
// 6️⃣ LIMPEZA DE LOGS ANTIGOS
// ═══════════════════════════════════════════════════════════════

// Rodar periodicamente (ex: a cada 24h)
setInterval(async () => {
    await journeyLogger.cleanupOldLogs(7); // Mantém últimos 7 dias
}, 24 * 60 * 60 * 1000);

// Ou rodar manualmente
await journeyLogger.cleanupOldLogs(7);


// ═══════════════════════════════════════════════════════════════
// 7️⃣ VARIÁVEIS DE AMBIENTE
// ═══════════════════════════════════════════════════════════════

// .env
// ENABLE_JOURNEY_FILE_LOGS=true        # Salva em arquivo JSON
// ENABLE_JOURNEY_CONSOLE_LOGS=true     # Exibe no console


// ═══════════════════════════════════════════════════════════════
// 8️⃣ TIPOS
// ═══════════════════════════════════════════════════════════════

// JourneyStage (tipos de etapas):
type JourneyStage = 
  | 'webhook_received'        // Webhook chegou
  | 'webhook_normalized'      // Evento normalizado
  | 'webhook_validation'      // Validação passou
  | 'inbox_enqueued'          // No inbox
  | 'worker_started'          // Worker começou
  | 'worker_fetched'          // Mensagem buscada
  | 'chat_service_called'     // ChatService chamado
  | 'chat_service_response'   // Resposta do ChatService
  | 'evolution_send_attempted'// Tentando enviar
  | 'evolution_send_success'  // Enviado com sucesso
  | 'evolution_send_failed'   // Falha ao enviar
  | 'outbox_recorded'         // Registrado no outbox
  | 'inbox_updated'           // Inbox atualizado
  | 'completed'               // Concluído
  | 'error';                  // Erro geral

// LogLevel (níveis):
type LogLevel = 'info' | 'warn' | 'error' | 'debug';


// ═══════════════════════════════════════════════════════════════
// 9️⃣ DASHBOARD SIMPLES (opcional)
// ═══════════════════════════════════════════════════════════════

import express from 'express';
import { journeyLogger } from './services/JourneyLogger';

const app = express();

// Ver jornadas ativas
app.get('/admin/journeys', (_req, res) => {
    const active = journeyLogger.getAllActiveJourneys();
    res.json({
        active,
        count: active.length,
        timestamp: new Date().toISOString(),
    });
});

// Ver detalhes de uma jornada
app.get('/admin/journeys/:correlationId', (req, res) => {
    const journey = journeyLogger.getJourney(req.params.correlationId);
    if (!journey) {
        return res.status(404).json({
            error: 'Journey not found',
            correlationId: req.params.correlationId,
        });
    }
    res.json(journey);
});

// Exemplo:
// GET http://localhost:3000/admin/journeys
// GET http://localhost:3000/admin/journeys/abc123def456
