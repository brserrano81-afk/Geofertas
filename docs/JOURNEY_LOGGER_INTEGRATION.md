# Integração do JourneyLogger no Pipeline WhatsApp

## Visão Geral

O `JourneyLogger` captura toda a jornada de uma mensagem desde o webhook até a entrega final, incluindo stack traces de erros em cada etapa.

```
┌─────────────────────────────────────────────────────────────────┐
│ Webhook Recebe                                                  │
│ correlationId gerado → startJourney()                           │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Normaliza + Valida                                              │
│ logSuccess() → webhook_normalized, webhook_validation          │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Enfileira no Inbox                                              │
│ logSuccess() → inbox_enqueued (inboxId = metadata)             │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Worker Processa                                                 │
│ logSuccess() → worker_started, worker_fetched                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ ChatService Responde                                            │
│ logSuccess() → chat_service_called, chat_service_response     │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Evolution Envia                                                 │
│ logSuccess() → evolution_send_attempted, evolution_send_...   │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Registra Outbox                                                 │
│ logSuccess() → outbox_recorded                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│ Finaliza                                                        │
│ finalizeJourney() → arquivo JSON com all stages                │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. No Webhook (api/sefaz-proxy.js)

### Iniciar jornada ao receber webhook

```javascript
import { journeyLogger } from '../src/services/JourneyLogger.js';

app.post('/webhook/whatsapp-entrada', webhookRateLimit, async (req, res) => {
    const normalizedEvent = normalizeEvolutionEvent(req.body);
    
    // ✅ NOVO: Iniciar jornada
    const journey = journeyLogger.startJourney(
        normalizedEvent.correlationId,
        normalizedEvent.messageId
    );
    
    const identity = await resolveCanonicalIdentity(normalizedEvent);
    normalizedEvent.userId = identity.canonicalUserId;
    normalizedEvent.storageUserId = identity.storageUserId;
    normalizedEvent.legacyUserId = identity.legacyUserId;
    normalizedEvent.bsuid = identity.bsuid;
    
    // ✅ NOVO: Log de recebimento
    journeyLogger.logSuccess(
        normalizedEvent.correlationId,
        'webhook_received',
        `Webhook recebido: ${normalizedEvent.messageType}`,
        {
            userId: normalizedEvent.userId,
            remoteJid: normalizedEvent.remoteJid,
            messageType: normalizedEvent.messageType,
            textPreview: normalizedEvent.textPreview,
        }
    );
    
    const validation = validateNormalizedEvent(normalizedEvent);

    try {
        // ✅ NOVO: Log de validação
        if (!validation.ok) {
            journeyLogger.logWarn(
                normalizedEvent.correlationId,
                'webhook_validation',
                `Validação falhou: ${validation.reason}`,
                { reason: validation.reason }
            );
        } else {
            journeyLogger.logSuccess(
                normalizedEvent.correlationId,
                'webhook_validation',
                'Validação OK',
                { validated: true }
            );
        }
        
        const enqueueResult = validation.ok
            ? await enqueueInboundMessage(normalizedEvent)
            : { inboxId: null, duplicate: false, ignoredReason: validation.reason };

        if (validation.ok && enqueueResult.inboxId && !enqueueResult.duplicate) {
            // ✅ NOVO: Log de enfileiramento
            journeyLogger.logSuccess(
                normalizedEvent.correlationId,
                'inbox_enqueued',
                `Mensagem enfileirada no inbox`,
                {
                    inboxId: enqueueResult.inboxId,
                    userId: normalizedEvent.userId,
                    remoteJid: normalizedEvent.remoteJid,
                }
            );
            
            console.log(`[EvolutionWebhook] [${normalizedEvent.correlationId}] Enfileirado: ${normalizedEvent.messageType}...`);
        }

        res.status(200).json({
            ok: true,
            event: normalizedEvent.event,
            inboxId: enqueueResult.inboxId,
            correlationId: normalizedEvent.correlationId,
        });
        
    } catch (err) {
        // ✅ NOVO: Log de erro com stack trace
        journeyLogger.logError(
            normalizedEvent.correlationId,
            'error',
            'Erro ao processar webhook',
            err,
            {
                userId: normalizedEvent.userId,
                remoteJid: normalizedEvent.remoteJid,
                errorType: err.name,
            }
        );
        
        console.error('[EvolutionWebhook] Error handling webhook:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});
```

---

## 2. No Worker (src/workers/EvolutionInboxWorker.ts)

### Continuar jornada durante processamento

```typescript
import { journeyLogger } from '../services/JourneyLogger';

async function processInboxMessage(message: InboxMessage) {
    try {
        // ✅ Log: Worker iniciou processamento
        journeyLogger.logSuccess(
            message.correlationId!,
            'worker_started',
            `Worker iniciou processamento`,
            {
                inboxId: message.id,
                userId: message.userId,
                remoteJid: message.remoteJid,
                messageType: message.messageType,
            }
        );
        
        // Marcar como em processamento
        await db.collection('message_inbox').doc(message.id).update({
            status: 'processing',
            processingStartedAt: serverTimestamp(),
        });
        
        // ✅ Log: Mensagem foi buscada
        journeyLogger.logSuccess(
            message.correlationId!,
            'worker_fetched',
            `Mensagem buscada do inbox`,
            {
                inboxId: message.id,
                status: message.status,
            }
        );
        
        // Chamar ChatService
        let responseText: string | null = null;
        let intent: string | undefined;
        
        try {
            const location = extractInboxLocation(message);
            
            // ✅ Log: ChatService sendo chamado
            const startChatTime = Date.now();
            journeyLogger.logSuccess(
                message.correlationId!,
                'chat_service_called',
                `ChatService chamado`,
                {
                    hasLocation: !!location,
                    hasMedia: !!message.mediaBase64,
                    messageType: message.messageType,
                }
            );
            
            const response = await chatService.processMessage({
                userId: message.userId,
                storageUserId: message.storageUserId,
                legacyUserId: message.legacyUserId,
                bsuid: message.bsuid,
                remoteJid: message.remoteJid,
                text: message.text,
                location,
                mediaBase64: message.mediaBase64,
                messageType: message.messageType,
            });
            
            responseText = response?.text || null;
            intent = response?.intent;
            
            const chatDuration = Date.now() - startChatTime;
            
            // ✅ Log: Resposta do ChatService
            journeyLogger.logSuccess(
                message.correlationId!,
                'chat_service_response',
                `ChatService respondeu`,
                {
                    intent,
                    responseLength: responseText?.length || 0,
                    duration_ms: chatDuration,
                    chatServiceIntent: intent,
                }
            );
            
        } catch (chatErr) {
            // ✅ Log: Erro no ChatService COM STACK TRACE
            journeyLogger.logError(
                message.correlationId!,
                'chat_service_response',
                `Erro no ChatService`,
                chatErr as Error,
                {
                    messageType: message.messageType,
                    intent: 'unknown',
                }
            );
            
            console.error('[Worker] ChatService error:', chatErr);
            responseText = '❌ Desculpe, ocorreu um erro ao processar sua mensagem.';
        }
        
        if (!responseText) {
            await db.collection('message_inbox').doc(message.id).update({
                status: 'processed',
                processedAt: serverTimestamp(),
                error: 'no_response',
            });
            
            journeyLogger.logWarn(
                message.correlationId!,
                'chat_service_response',
                `ChatService retornou sem resposta`,
                { inboxId: message.id }
            );
            
            return;
        }
        
        // Tentar enviar pela Evolution
        try {
            const startSendTime = Date.now();
            
            // ✅ Log: Tentando enviar
            journeyLogger.logSuccess(
                message.correlationId!,
                'evolution_send_attempted',
                `Tentando enviar resposta`,
                {
                    textLength: responseText.length,
                    remoteJid: message.remoteJid,
                }
            );
            
            const sendResult = await sendTextViaEvolution(message.remoteJid, responseText);
            
            const sendDuration = Date.now() - startSendTime;
            
            if (sendResult.status === 'sent') {
                // ✅ Log: Enviado com sucesso
                journeyLogger.logSuccess(
                    message.correlationId!,
                    'evolution_send_success',
                    `Resposta enviada com sucesso`,
                    {
                        textLength: responseText.length,
                        duration_ms: sendDuration,
                        evolutionStatus: 'sent',
                    }
                );
                
                // Registrar no outbox
                const outboxDoc = await db.collection('message_outbox').add({
                    correlationId: message.correlationId,
                    sourceMessageId: message.messageId,
                    inboxId: message.id,
                    userId: message.userId,
                    storageUserId: message.storageUserId,
                    legacyUserId: message.legacyUserId,
                    bsuid: message.bsuid,
                    remoteJid: message.remoteJid,
                    text: responseText,
                    sendStatus: 'sent',
                    sentAtIso: new Date().toISOString(),
                    createdAt: serverTimestamp(),
                });
                
                // ✅ Log: Outbox registrado
                journeyLogger.logSuccess(
                    message.correlationId!,
                    'outbox_recorded',
                    `Resposta registrada no outbox`,
                    {
                        outboxId: outboxDoc.id,
                        sendStatus: 'sent',
                    }
                );
                
                // Atualizar inbox
                await db.collection('message_inbox').doc(message.id).update({
                    status: 'sent',
                    sentAtIso: new Date().toISOString(),
                    processedAt: serverTimestamp(),
                    outboxId: outboxDoc.id,
                });
                
                // ✅ Log: Jornada completa
                journeyLogger.logSuccess(
                    message.correlationId!,
                    'completed',
                    `Jornada concluída com sucesso`,
                    {
                        inboxId: message.id,
                        outboxId: outboxDoc.id,
                        totalDuration_ms: Date.now() - startSendTime,
                    }
                );
                
            } else {
                // ✅ Log: Falha no envio
                journeyLogger.logError(
                    message.correlationId!,
                    'evolution_send_failed',
                    `Falha ao enviar resposta`,
                    new Error(sendResult.status || 'unknown_error'),
                    {
                        sendStatus: sendResult.status,
                        duration_ms: sendDuration,
                        evolutionStatus: sendResult.status,
                    }
                );
                
                // Registrar como falha
                const outboxDoc = await db.collection('message_outbox').add({
                    correlationId: message.correlationId,
                    sourceMessageId: message.messageId,
                    inboxId: message.id,
                    userId: message.userId,
                    remoteJid: message.remoteJid,
                    text: responseText,
                    sendStatus: 'send_failed',
                    error: sendResult.status || 'unknown_error',
                    retryCount: 1,
                    createdAt: serverTimestamp(),
                });
                
                journeyLogger.logWarn(
                    message.correlationId!,
                    'outbox_recorded',
                    `Falha registrada no outbox`,
                    {
                        outboxId: outboxDoc.id,
                        sendStatus: 'send_failed',
                    }
                );
            }
            
        } catch (sendErr) {
            // ✅ Log: Erro crítico no envio COM STACK TRACE
            journeyLogger.logError(
                message.correlationId!,
                'evolution_send_failed',
                `Erro crítico ao enviar resposta`,
                sendErr as Error,
                {
                    remoteJid: message.remoteJid,
                    responseLength: responseText.length,
                }
            );
            
            console.error('[Worker] Send error:', sendErr);
            
            // Ainda assim registrar no outbox como falha
            await db.collection('message_outbox').add({
                correlationId: message.correlationId,
                sourceMessageId: message.messageId,
                inboxId: message.id,
                userId: message.userId,
                remoteJid: message.remoteJid,
                text: responseText,
                sendStatus: 'send_failed',
                error: (sendErr as Error).message,
                createdAt: serverTimestamp(),
            });
        }
        
        // ✅ Finalizar jornada (persistir em arquivo JSON)
        await journeyLogger.finalizeJourney(message.correlationId!);
        
    } catch (err) {
        // ✅ Log: Erro não previsto
        journeyLogger.logException(
            message.correlationId!,
            `Erro não previsto no processamento`,
            err as Error,
            {
                inboxId: message.id,
                messageType: message.messageType,
            }
        );
        
        console.error('[Worker] Unexpected error:', err);
        
        // Finalizar jornada mesmo com erro
        await journeyLogger.finalizeJourney(message.correlationId!);
    }
}
```

---

## 3. Variáveis de Ambiente

Adicione ao seu `.env`:

```env
# Journey Logger
ENABLE_JOURNEY_FILE_LOGS=true
ENABLE_JOURNEY_CONSOLE_LOGS=true
```

---

## 4. Estrutura de Arquivo de Log

Cada jornada gera um arquivo JSON em `logs/message-journey/`:

```json
{
  "correlationId": "abc123def456",
  "messageId": "msg_789",
  "userId": "5527998862440@s.whatsapp.net",
  "remoteJid": "5527998862440@s.whatsapp.net",
  "messageType": "conversation",
  "startedAt": "2026-04-26T15:30:00.000Z",
  "endedAt": "2026-04-26T15:30:02.500Z",
  "totalDuration_ms": 2500,
  "stages": [
    {
      "correlationId": "abc123def456",
      "stage": "webhook_received",
      "timestamp": "2026-04-26T15:30:00.100Z",
      "timestamp_ms": 1703072400100,
      "level": "info",
      "message": "Webhook recebido: conversation",
      "metadata": {
        "messageType": "conversation",
        "textPreview": "Qual o preço do arroz?"
      }
    },
    {
      "correlationId": "abc123def456",
      "stage": "webhook_validation",
      "timestamp": "2026-04-26T15:30:00.200Z",
      "timestamp_ms": 1703072400200,
      "level": "info",
      "message": "Validação OK",
      "duration_from_start_ms": 100
    },
    {
      "correlationId": "abc123def456",
      "stage": "inbox_enqueued",
      "timestamp": "2026-04-26T15:30:00.300Z",
      "timestamp_ms": 1703072400300,
      "level": "info",
      "message": "Mensagem enfileirada no inbox",
      "metadata": {
        "inboxId": "inbox_xyz789"
      },
      "duration_from_start_ms": 200
    },
    {
      "correlationId": "abc123def456",
      "stage": "chat_service_response",
      "timestamp": "2026-04-26T15:30:01.500Z",
      "timestamp_ms": 1703072401500,
      "level": "info",
      "message": "ChatService respondeu",
      "metadata": {
        "intent": "consultar_preco_produto",
        "responseLength": 145,
        "duration_ms": 1200
      },
      "duration_from_start_ms": 1400
    },
    {
      "correlationId": "abc123def456",
      "stage": "evolution_send_success",
      "timestamp": "2026-04-26T15:30:02.000Z",
      "timestamp_ms": 1703072402000,
      "level": "info",
      "message": "Resposta enviada com sucesso",
      "metadata": {
        "evolutionStatus": "sent",
        "duration_ms": 500
      },
      "duration_from_start_ms": 1900
    },
    {
      "correlationId": "abc123def456",
      "stage": "outbox_recorded",
      "timestamp": "2026-04-26T15:30:02.100Z",
      "timestamp_ms": 1703072402100,
      "level": "info",
      "message": "Resposta registrada no outbox",
      "metadata": {
        "outboxId": "outbox_abc123",
        "sendStatus": "sent"
      },
      "duration_from_start_ms": 2000
    },
    {
      "correlationId": "abc123def456",
      "stage": "completed",
      "timestamp": "2026-04-26T15:30:02.500Z",
      "timestamp_ms": 1703072402500,
      "level": "info",
      "message": "Jornada concluída com sucesso",
      "metadata": {
        "outboxId": "outbox_abc123",
        "totalDuration_ms": 2500
      },
      "duration_from_start_ms": 2400
    }
  ]
}
```

---

## 5. Exemplo com Erro

Se ocorrer um erro, ele será incluído com stack trace completo:

```json
{
  "stage": "chat_service_response",
  "timestamp": "2026-04-26T15:30:01.500Z",
  "level": "error",
  "message": "Erro no ChatService",
  "error": {
    "name": "TypeError",
    "message": "Cannot read property 'intent' of undefined",
    "stack": "TypeError: Cannot read property 'intent' of undefined\n    at ChatService.processMessage (src/services/ChatService.ts:150:15)\n    at processInboxMessage (src/workers/EvolutionInboxWorker.ts:420:10)\n    at processMessages (src/workers/EvolutionInboxWorker.ts:250:5)\n    ...",
    "code": undefined
  }
}
```

---

## 6. Queries Úteis

### Ver jornadas ativas:

```typescript
import { journeyLogger } from '../services/JourneyLogger';

const activeJourneys = journeyLogger.getAllActiveJourneys();
console.log(activeJourneys);
// Output:
// [
//   { correlationId: 'abc123...', userId: '552799...', startedAt: '2026-04-26T15:30:00Z', stageCount: 3 }
// ]
```

### Recuperar jornada em progresso:

```typescript
const journey = journeyLogger.getJourney('abc123def456');
console.log(journey);
```

### Limpar logs antigos:

```typescript
await journeyLogger.cleanupOldLogs(7); // Mantém últimos 7 dias
```

---

## 7. Logs no Console

Com `ENABLE_JOURNEY_CONSOLE_LOGS=true`, você verá no console:

```
✓ [webhook_received] abc123de [INFO] Webhook recebido: conversation
✓ [webhook_validation] abc123de [INFO] Validação OK
✓ [inbox_enqueued] abc123de [INFO] Mensagem enfileirada no inbox
✓ [worker_started] abc123de [INFO] Worker iniciou processamento
✓ [chat_service_called] abc123de [INFO] ChatService chamado
✓ [chat_service_response] abc123de [INFO] ChatService respondeu
✓ [evolution_send_attempted] abc123de [INFO] Tentando enviar resposta
✓ [evolution_send_success] abc123de [INFO] Resposta enviada com sucesso
✓ [outbox_recorded] abc123de [INFO] Resposta registrada no outbox
✓ [completed] abc123de [INFO] Jornada concluída com sucesso

⚠ [evolution_send_failed] def456ab [WARN] Falha ao enviar resposta
   Error: ECONNREFUSED: Connection refused

✗ [error] ghi789jk [ERROR] Erro não previsto no processamento
   Error: TypeError: Cannot read property 'map' of undefined
```

---

## 8. Integração com Dashboard (Opcional)

Endpoint para visualizar jornadas:

```typescript
app.get('/admin/journeys', (req, res) => {
    const journeys = journeyLogger.getAllActiveJourneys();
    res.json({ active: journeys });
});

app.get('/admin/journeys/:correlationId', (req, res) => {
    const journey = journeyLogger.getJourney(req.params.correlationId);
    if (!journey) {
        return res.status(404).json({ error: 'Journey not found' });
    }
    res.json(journey);
});
```

---

## 9. Benefícios

✅ **Rastreabilidade completa** - Siga uma mensagem do início ao fim  
✅ **Stack traces** - Identificar exatamente onde ocorreram erros  
✅ **Timing** - Meça duração de cada etapa  
✅ **Auditoria** - Arquivo permanente de cada jornada  
✅ **Debugging** - Correlação com outras ferramentas de observabilidade  
✅ **Alertas** - Identifique padrões de falha  
