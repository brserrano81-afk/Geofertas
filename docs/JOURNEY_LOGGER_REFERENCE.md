# JourneyLogger - Referência Rápida

## 🎯 Objetivo

Rastrear **toda a jornada** de uma mensagem WhatsApp desde o webhook até a entrega, capturando **timestamps**, **stack traces** de erros, e **metadados** em cada etapa.

---

## 📊 Estrutura do Log

```
Correlação ID
    ↓
┌─────────────────────────────────────────┐
│ 1. webhook_received                     │
│    ✓ Mensagem chegou no endpoint        │
└─────────────────────────────────────────┘
         ↓ (timestamp + duração)
┌─────────────────────────────────────────┐
│ 2. webhook_normalized                   │
│    ✓ Evento normalizado (Evolution API) │
└─────────────────────────────────────────┘
         ↓ (timestamp + duração)
┌─────────────────────────────────────────┐
│ 3. webhook_validation                   │
│    ✓ Validação passou                   │
└─────────────────────────────────────────┘
         ↓ (timestamp + duração)
┌─────────────────────────────────────────┐
│ 4. inbox_enqueued                       │
│    ✓ Adicionado à fila de processamento │
└─────────────────────────────────────────┘
         ↓ (Worker pega depois)
┌─────────────────────────────────────────┐
│ 5. worker_started                       │
│    ✓ Worker iniciou processamento       │
└─────────────────────────────────────────┘
         ↓ (timestamp + duração)
┌─────────────────────────────────────────┐
│ 6. worker_fetched                       │
│    ✓ Mensagem buscada do Firestore      │
└─────────────────────────────────────────┘
         ↓ (timestamp + duração)
┌─────────────────────────────────────────┐
│ 7. chat_service_called                  │
│    ✓ ChatService acionado                │
└─────────────────────────────────────────┘
         ↓ (timestamp + duração)
┌─────────────────────────────────────────┐
│ 8. chat_service_response                │
│    ✓ IA retornou resposta               │
│    ✗ [OU] Erro com stack trace          │
└─────────────────────────────────────────┘
         ↓ (timestamp + duração)
┌─────────────────────────────────────────┐
│ 9. evolution_send_attempted             │
│    ✓ Tentando enviar via Evolution API  │
└─────────────────────────────────────────┘
         ↓ (timestamp + duração)
┌─────────────────────────────────────────┐
│ 10a. evolution_send_success             │
│     ✓ Enviado com sucesso               │
│                                         │
│ 10b. evolution_send_failed              │
│     ✗ Falha ao enviar (com erro)        │
└─────────────────────────────────────────┘
         ↓ (timestamp + duração)
┌─────────────────────────────────────────┐
│ 11. outbox_recorded                     │
│    ✓ Resposta registrada no Firestore   │
└─────────────────────────────────────────┘
         ↓ (timestamp + duração)
┌─────────────────────────────────────────┐
│ 12. inbox_updated                       │
│    ✓ Status do inbox atualizado         │
└─────────────────────────────────────────┘
         ↓ (timestamp + duração)
┌─────────────────────────────────────────┐
│ 13. completed                           │
│    ✓ Jornada finalizada com sucesso     │
│    📄 JSON salvo em logs/message-journey│
└─────────────────────────────────────────┘

TEMPO TOTAL: ~2-5 segundos (típico)
```

---

## 🔧 API Rápida

### Iniciar jornada
```typescript
journeyLogger.startJourney(correlationId, messageId)
```

### Registrar sucesso
```typescript
journeyLogger.logSuccess(
    correlationId,
    'webhook_received',
    'Mensagem recebida',
    { remoteJid, messageType }
)
```

### Registrar aviso
```typescript
journeyLogger.logWarn(
    correlationId,
    'evolution_send_failed',
    'Falha ao enviar, retentando'
)
```

### Registrar erro COM stack trace
```typescript
try {
    // código que falha
} catch (err) {
    journeyLogger.logError(
        correlationId,
        'chat_service_response',
        'Erro no ChatService',
        err, // ← O stack trace vem aqui
        { userId, intent }
    )
}
```

### Registrar exceção não prevista
```typescript
journeyLogger.logException(
    correlationId,
    'Erro inesperado',
    error,
    { stage: 'worker_started' }
)
```

### Finalizar e salvar
```typescript
await journeyLogger.finalizeJourney(correlationId)
// Salva arquivo JSON em logs/message-journey/
```

### Recuperar jornada em progresso
```typescript
const journey = journeyLogger.getJourney(correlationId)
console.log(journey.stages)
```

### Ver jornadas ativas
```typescript
const active = journeyLogger.getAllActiveJourneys()
```

---

## 📁 Saída (Arquivo JSON)

**Localização**: `logs/message-journey/1703072400000_abc123de.json`

**Conteúdo**:
```json
{
  "correlationId": "abc123def456",
  "userId": "5527998862440@s.whatsapp.net",
  "messageType": "conversation",
  "totalDuration_ms": 2347,
  "stages": [
    {
      "stage": "webhook_received",
      "timestamp": "2026-04-26T15:30:00.100Z",
      "duration_from_start_ms": 0,
      "level": "info",
      "message": "Webhook recebido",
      "metadata": { "textPreview": "Qual o preço do arroz?" }
    },
    {
      "stage": "chat_service_response",
      "timestamp": "2026-04-26T15:30:01.500Z",
      "duration_from_start_ms": 1400,
      "level": "info",
      "message": "ChatService respondeu",
      "metadata": { "intent": "consultar_preco_produto" }
    },
    {
      "stage": "error",
      "timestamp": "2026-04-26T15:30:02.000Z",
      "duration_from_start_ms": 1900,
      "level": "error",
      "message": "Falha ao enviar resposta",
      "error": {
        "name": "ConnectionError",
        "message": "ECONNREFUSED: Connection refused",
        "stack": "Error: ECONNREFUSED...\n    at TCPConnectWrap.afterConnect..."
      }
    },
    {
      "stage": "completed",
      "timestamp": "2026-04-26T15:30:02.400Z",
      "duration_from_start_ms": 2300,
      "level": "info",
      "message": "Jornada finalizada"
    }
  ]
}
```

---

## 🎨 Console Output

Com `ENABLE_JOURNEY_CONSOLE_LOGS=true`:

```
✓ [webhook_received] abc123de [INFO] Webhook recebido: conversation
  Duração: 100ms

✓ [inbox_enqueued] abc123de [INFO] Mensagem enfileirada no inbox
  Duração: 200ms

✓ [worker_started] abc123de [INFO] Worker iniciou processamento
  Duração: 1050ms

✓ [chat_service_response] abc123de [INFO] ChatService respondeu
  Intent: consultar_preco_produto
  Duração: 450ms

⚠ [evolution_send_failed] abc123de [WARN] Falha ao enviar resposta
  Status: pending_send
  Duração: 200ms

✗ [error] abc123de [ERROR] Erro inesperado
   Erro: TypeError: Cannot read property 'map' of undefined
   Stack: TypeError: Cannot read property 'map'...
   Duração: 100ms
```

---

## 🚀 Setup Rápido

### 1. Variáveis de ambiente

```env
ENABLE_JOURNEY_FILE_LOGS=true
ENABLE_JOURNEY_CONSOLE_LOGS=true
```

### 2. Webhook (api/sefaz-proxy.js)

```javascript
import { journeyLogger } from '../src/services/JourneyLogger.js';

app.post('/webhook/whatsapp-entrada', async (req, res) => {
    const event = normalizeEvolutionEvent(req.body);
    journeyLogger.startJourney(event.correlationId, event.messageId);
    
    try {
        journeyLogger.logSuccess(event.correlationId, 'webhook_received', 'OK');
        // ... resto do código ...
    } catch (err) {
        journeyLogger.logError(event.correlationId, 'error', 'Erro', err);
    }
});
```

### 3. Worker (src/workers/EvolutionInboxWorker.ts)

```typescript
import { journeyLogger } from '../services/JourneyLogger';

async function processInboxMessage(message) {
    try {
        journeyLogger.logSuccess(message.correlationId, 'worker_started', 'OK');
        
        const response = await chatService.processMessage({...});
        journeyLogger.logSuccess(message.correlationId, 'chat_service_response', 'OK');
        
        const result = await sendTextViaEvolution(...);
        if (result.status === 'sent') {
            journeyLogger.logSuccess(message.correlationId, 'evolution_send_success', 'OK');
        }
        
        await journeyLogger.finalizeJourney(message.correlationId);
    } catch (err) {
        journeyLogger.logError(message.correlationId, 'error', 'Erro', err);
        await journeyLogger.finalizeJourney(message.correlationId);
    }
}
```

---

## 📊 Estágios Definidos

| Etapa | Significado | Local |
|-------|-------------|-------|
| `webhook_received` | Webhook HTTP recebido | api/sefaz-proxy.js |
| `webhook_normalized` | Evento normalizado | api/sefaz-proxy.js |
| `webhook_validation` | Validação passou | api/sefaz-proxy.js |
| `inbox_enqueued` | Adicionado ao inbox | api/sefaz-proxy.js |
| `worker_started` | Worker iniciou | EvolutionInboxWorker.ts |
| `worker_fetched` | Mensagem buscada | EvolutionInboxWorker.ts |
| `chat_service_called` | ChatService chamado | EvolutionInboxWorker.ts |
| `chat_service_response` | Resposta obtida | EvolutionInboxWorker.ts |
| `evolution_send_attempted` | Tentando enviar | EvolutionInboxWorker.ts |
| `evolution_send_success` | Enviado com sucesso | EvolutionInboxWorker.ts |
| `evolution_send_failed` | Falha ao enviar | EvolutionInboxWorker.ts |
| `outbox_recorded` | Registrado no outbox | EvolutionInboxWorker.ts |
| `inbox_updated` | Inbox atualizado | EvolutionInboxWorker.ts |
| `completed` | Jornada concluída | EvolutionInboxWorker.ts |
| `error` | Erro não previsto | Qualquer etapa |

---

## 💡 Dicas

✅ **Sempre finalizar a jornada** - Mesmo com erro, chame `finalizeJourney()`  
✅ **Use o mesmo correlationId** - Começa no webhook e segue até o final  
✅ **Inclua contexto nos metadados** - userId, messageType, intent, etc  
✅ **Deixar logs ativados** - Performance impact é mínimo  
✅ **Monitorar logs antigos** - Rode `cleanupOldLogs(7)` periodicamente  

---

## 🔍 Casos de Uso

### Debugging: "Por que a mensagem não chegou?"
```
$ find logs/message-journey -name "*abc123*"
$ cat logs/message-journey/1703072400000_abc123de.json

Veja toda a jornada, identifique em qual etapa falhou e se há stack trace de erro
```

### Auditoria: "Qual o histórico dessa conversa?"
```
Todos os correlationId da mesma conversa (userId + remoteJid) podem ser rastreados
```

### Performance: "Por que tá lento?"
```
Compare duração_from_start_ms de cada etapa
Identifique qual estágio leva mais tempo
```

### Alertas: "Existe padrão de erro?"
```
Parse os arquivos JSON e procure por padrões de erro
Alerte se mais de N falhas no mesmo stage
```

---

## 📚 Documentação Completa

Veja também:
- [JOURNEY_LOGGER_INTEGRATION.md](JOURNEY_LOGGER_INTEGRATION.md) - Integração passo a passo
- [JOURNEY_LOGGER_EXAMPLES.md](JOURNEY_LOGGER_EXAMPLES.md) - Exemplos de código

---

**Versão**: 1.0  
**Última atualização**: Abril 2026  
**Autor**: DevOps Team
