# JourneyLogger - Guia Visual e Troubleshooting

## 🗂️ Arquivos Criados

```
src/services/
├── JourneyLogger.ts                    ← Serviço principal (TypeScript)

docs/
├── JOURNEY_LOGGER_INTEGRATION.md       ← Como integrar no código existente
├── JOURNEY_LOGGER_EXAMPLES.md          ← Snippets prontos para copiar
├── JOURNEY_LOGGER_REFERENCE.md         ← Referência rápida
└── JOURNEY_LOGGER_OVERVIEW.md          ← Este arquivo

logs/
└── message-journey/                    ← Arquivo JSON por jornada
    ├── 1703072400000_abc123de.json
    ├── 1703072401234_def456gh.json
    └── ...
```

---

## 🔄 Fluxo Completo da Jornada

```
USUÁRIO ENVIA MENSAGEM WHATSAPP
         │
         ▼
    ┌─────────────────────────────────────────────┐
    │ STAGE 1: webhook_received                   │
    │ Endpoint: POST /webhook/whatsapp-entrada    │
    │ Arquivo: api/sefaz-proxy.js                 │
    │ Duração típica: 50-100ms                    │
    │                                             │
    │ ✓ correlationId gerado                      │
    │ ✓ messageId identificado                    │
    │ ✓ remoteJid normalizado                     │
    │ ✓ messageType detectado                     │
    │ ✓ texto preview extraído                    │
    │                                             │
    │ JSON: {                                     │
    │   stage: 'webhook_received',                │
    │   timestamp: '2026-04-26T15:30:00.100Z',   │
    │   duration_from_start_ms: 0,                │
    │   correlationId: 'abc123def456'             │
    │ }                                           │
    └─────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────────────┐
    │ STAGE 2: webhook_normalized                 │
    │ normalizeEvolutionEvent()                   │
    │ Duração: 10-20ms                            │
    │                                             │
    │ ✓ messageType normalizado                   │
    │ ✓ location extraída (se houver)             │
    │ ✓ rawMessageJson serializado                │
    └─────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────────────┐
    │ STAGE 3: webhook_validation                 │
    │ validateNormalizedEvent()                   │
    │ Duração: 5-15ms                             │
    │                                             │
    │ ✓ Filtro de duplicatas                      │
    │ ✓ Validação de remoteJid                    │
    │ ✓ Detecção de status                        │
    │ ✓ Resolução de identidade                   │
    │                                             │
    │ Se falhar → logWarn + response 202          │
    └─────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────────────┐
    │ STAGE 4: inbox_enqueued                     │
    │ enqueueInboundMessage()                     │
    │ Firestore collection: message_inbox        │
    │ Duração: 100-300ms                          │
    │                                             │
    │ Documento criado:                           │
    │ {                                           │
    │   id: 'inbox_xyz789',                       │
    │   correlationId: 'abc123def456',            │
    │   status: 'pending',                        │
    │   userId: '5527998...',                     │
    │   text: 'Qual o preço do arroz?',          │
    │   createdAt: Timestamp                      │
    │ }                                           │
    └─────────────────────────────────────────────┘
         │
         │ ⏳ WEBHOOK RESPONDE COM 200 OK
         │ { ok: true, inboxId: '...', correlationId: '...' }
         │
         ▼ [PODE LEVAR MINUTOS]
         │ Worker buscará esta mensagem periodicamente
         │
    ┌─────────────────────────────────────────────┐
    │ STAGE 5: worker_started                     │
    │ EvolutionInboxWorker.ts                     │
    │ Rodado periodicamente (padrão: a cada 5s)   │
    │ Duração total: 1000-5000ms                  │
    │                                             │
    │ Worker procura por:                         │
    │ - status: 'pending'                         │
    │ - age < 24h                                 │
    │ - lease check (evitar duplicação)           │
    └─────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────────────┐
    │ STAGE 6: worker_fetched                     │
    │ Mensagem buscada do Firestore               │
    │ Duração: 100-200ms                          │
    │                                             │
    │ Status atualizado:                          │
    │ message_inbox.status = 'processing'         │
    │ message_inbox.processingStartedAt = now()   │
    └─────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────────────┐
    │ STAGE 7: chat_service_called                │
    │ chatService.processMessage()                │
    │ src/services/ChatService.ts                 │
    │ Duração: 800-2000ms                         │
    │                                             │
    │ ChatService faz:                            │
    │ - NLP do texto → identifica intenção        │
    │ - Chama OfferEngine (se for busca)          │
    │ - Consulta ChatBot/IA (Gemini)              │
    │ - Formata resposta                          │
    │                                             │
    │ Se erro aqui → logError COM stack trace     │
    └─────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────────────┐
    │ STAGE 8: chat_service_response              │
    │ Resposta obtida com sucesso                 │
    │ Duração: 0ms (já incluída acima)            │
    │                                             │
    │ Exemplo de resposta:                        │
    │ {                                           │
    │   text: '🏪 Encontrei 3 ofertas de arroz...',
    │   intent: 'consultar_preco_produto'         │
    │   confidence: 0.95                          │
    │ }                                           │
    │                                             │
    │ Metadados registrados:                      │
    │ - intent                                    │
    │ - responseLength                            │
    │ - duration_ms                               │
    └─────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────────────┐
    │ STAGE 9: evolution_send_attempted           │
    │ sendTextViaEvolution()                      │
    │ API: https://evolution.api/message/send    │
    │ Duração: 500-1500ms                         │
    │                                             │
    │ POST payload:                               │
    │ {                                           │
    │   number: '5527998862440',                  │
    │   text: '🏪 Encontrei 3 ofertas...'        │
    │   delay: 1000,                              │
    │   presence: 'composing'                     │
    │ }                                           │
    └─────────────────────────────────────────────┘
         │
         ├─── Sucesso ──────────────┐
         │                           │
         ▼                           ▼
    ┌──────────────────────┐   ┌────────────────────┐
    │ STAGE 10a:           │   │ STAGE 10b:         │
    │ evolution_send_success
    │   evolution_send_failed    │
    │ Status: sent         │   │ Status: failed     │
    │ HTTP: 200            │   │ HTTP: 4xx ou 5xx   │
    │ Duração: 0ms         │   │ Duração: 0ms       │
    │                      │   │                    │
    │ ✓ Enviado            │   │ ✗ Falha:           │
    │                      │   │   - Connection err │
    │ Metadata:            │   │   - API error      │
    │ - evolutionStatus    │   │   - Rate limit     │
    │ - duration_ms        │   │   - Invalid number │
    │                      │   │                    │
    │                      │   │ Retry logic:       │
    │                      │   │ - nextRetryAt = ?? │
    │                      │   │ - retryCount = 1   │
    └──────────────────────┘   └────────────────────┘
         │                           │
         └───────────────┬───────────┘
                         │
         ▼
    ┌─────────────────────────────────────────────┐
    │ STAGE 11: outbox_recorded                   │
    │ Firestore collection: message_outbox        │
    │ Duração: 100-200ms                          │
    │                                             │
    │ Documento criado:                           │
    │ {                                           │
    │   id: 'outbox_abc123',                      │
    │   correlationId: 'abc123def456',            │
    │   inboxId: 'inbox_xyz789',                  │
    │   userId: '5527998...',                     │
    │   text: '🏪 Encontrei...',                 │
    │   sendStatus: 'sent' | 'send_failed',       │
    │   error: null | 'ECONNREFUSED',             │
    │   sentAtIso: '2026-04-26T15:30:02Z',       │
    │   createdAt: Timestamp                      │
    │ }                                           │
    └─────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────────────┐
    │ STAGE 12: inbox_updated                     │
    │ Firestore: message_inbox atualizado         │
    │ Duração: 50-100ms                           │
    │                                             │
    │ Atualizações:                               │
    │ - status: 'sent' | 'failed'                 │
    │ - outboxId: 'outbox_abc123'                 │
    │ - sentAtIso: '2026-04-26T15:30:02Z'        │
    │ - processedAt: Timestamp                    │
    └─────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────────────┐
    │ STAGE 13: completed                         │
    │ Jornada finalizada                          │
    │                                             │
    │ ✓ finalizeJourney() chamado                 │
    │ ✓ Arquivo JSON salvo em:                    │
    │   logs/message-journey/                     │
    │   1703072402500_abc123de.json               │
    │                                             │
    │ Total duration: 2500ms                      │
    │ (100ms webhook + 1400ms chat + 1000ms send)│
    └─────────────────────────────────────────────┘

USUÁRIO RECEBE RESPOSTA NO WHATSAPP
```

---

## 🚨 Troubleshooting

### ❓ Problema: Arquivo JSON não está sendo criado

**Verificar:**
```bash
# 1. Verificar se a variável está ativada
echo $ENABLE_JOURNEY_FILE_LOGS
# Deve retornar: true

# 2. Verificar permissões de pasta
ls -la logs/message-journey/
# Deve ter permissão rw-r--r--

# 3. Verificar se finalizeJourney() está sendo chamado
grep -r "finalizeJourney" src/
```

**Solução:**
```env
ENABLE_JOURNEY_FILE_LOGS=true
```

---

### ❓ Problema: Stack trace de erro não aparece

**Verificar:**
```typescript
// ❌ ERRADO - Não vai capturar stack
journeyLogger.logStage(correlationId, 'error', 'error', 'Erro ocorreu');

// ✅ CORRETO - Vai capturar stack
try {
    // código
} catch (err) {
    journeyLogger.logError(correlationId, 'error', 'Erro', err); // ← passa Error
}
```

**Solução:**
- Sempre passe o objeto `Error` para `logError()` ou `logException()`

---

### ❓ Problema: correlationId não é consistente

**Verificar:**
```javascript
// No webhook:
const correlationId = normalizedEvent.correlationId;
journeyLogger.startJourney(correlationId, ...);

// No worker:
// Use EXATAMENTE o mesmo correlationId do inbox
journeyLogger.logSuccess(message.correlationId, ...);
```

**Solução:**
- correlationId é gerado no webhook
- Deve ser salvo no Firestore (inbox)
- Worker recupera do documento do inbox
- Nunca gere um novo correlationId

---

### ❓ Problema: Performance lenta

**Verificar:**
```json
{
  "stages": [
    { "stage": "chat_service_response", "duration_from_start_ms": 3500 }
  ]
}
```

**Análise:**
```
Total: 5000ms (5 segundos) é muito

Se chat_service_response está em 3500ms:
- ChatService está lento
- Verificar:
  - Tamanho da base de ofertas
  - Latência do Firestore
  - API do Gemini/OpenAI
  - Network latency
```

**Solução:**
- Adicionar índices no Firestore
- Cache de ofertas em memória
- Usar connection pooling
- Considerar async processing

---

### ❓ Problema: Muitos logs de erro na mesma etapa

**Verificar:**
```bash
# Contar erros por etapa
find logs/message-journey -name "*.json" -exec grep -l '"error"' {} \; | wc -l

# Ver qual erro é mais frequente
find logs/message-journey -name "*.json" -exec grep -A 3 '"stage".*"error"' {} \;
```

**Solução:**
- Implementar alerta se erro rate > 10% em 1h
- Investigar padrão de erro (código ou network?)
- Escalar para ops team

---

### ❓ Problema: Disco cheio com arquivos de log

**Verificar:**
```bash
du -sh logs/message-journey/
find logs/message-journey -type f | wc -l
```

**Solução:**
```typescript
// Rodar limpeza diária
setInterval(async () => {
    await journeyLogger.cleanupOldLogs(7); // Mantém 7 dias
}, 24 * 60 * 60 * 1000);

// Ou compactar logs antigos
await journeyLogger.cleanupOldLogs(3); // Só 3 dias
```

---

### ❓ Problema: Não consigo encontrar uma jornada específica

**Procurar por correlationId:**
```bash
grep -r "abc123def456" logs/message-journey/
find logs/message-journey -name "*abc123*"
```

**Procurar por userId:**
```bash
find logs/message-journey -name "*.json" -exec grep -l "5527998862440" {} \;
```

**Procurar por erro:**
```bash
find logs/message-journey -name "*.json" -exec grep -l "ECONNREFUSED" {} \;
```

---

## 📈 Métricas Esperadas

| Métrica | Típico | Alert |
|---------|--------|-------|
| webhook_received → inbox_enqueued | 50-200ms | > 1000ms |
| worker_started → chat_service_response | 800-2000ms | > 5000ms |
| evolution_send_attempted → evolution_send_success | 500-1500ms | > 10000ms |
| **Total duration** | 1500-3500ms | > 10000ms |
| **Error rate** | < 1% | > 5% |
| **Success rate** | > 99% | < 95% |

---

## 🔐 Dados Sensíveis

Os logs contêm:
- ❌ Número de telefone (remoteJid)
- ❌ Texto da mensagem (preview)
- ❌ Localização (se compartilhada)

**Recomendações:**
1. Usar `maskIdentifier()` para remoteJid
2. Usar `preview` (100 chars) ao invés de texto completo
3. Não logar dados de pagamento
4. Aplicar LGPD retention policy
5. Criptografar arquivos de log

---

## 🔄 Integração com Observabilidade

### Enviar para Datadog
```typescript
import { StatsD } from 'node-statsd';

const statsd = new StatsD();

journeyLogger.on('stageComplete', (entry) => {
    statsd.histogram('message.stage.duration', entry.duration_from_start_ms, {
        tags: [`stage:${entry.stage}`]
    });
});
```

### Enviar para CloudWatch
```typescript
const logs = new AWS.CloudWatchLogs();

await journeyLogger.onFinalize((journey) => {
    await logs.putLogEvents({
        logGroupName: '/whatsapp/journeys',
        logStreamName: journey.correlationId,
        logEvents: [{ message: JSON.stringify(journey) }]
    });
});
```

### Enviar para Elasticsearch
```typescript
const elastic = new Client({ node: 'http://localhost:9200' });

await journeyLogger.onFinalize((journey) => {
    await elastic.index({
        index: 'whatsapp-journeys',
        body: journey
    });
});
```

---

## 📞 Suporte

- Dúvida sobre integração? → [JOURNEY_LOGGER_INTEGRATION.md](JOURNEY_LOGGER_INTEGRATION.md)
- Procura exemplos? → [JOURNEY_LOGGER_EXAMPLES.md](JOURNEY_LOGGER_EXAMPLES.md)
- Referência rápida? → [JOURNEY_LOGGER_REFERENCE.md](JOURNEY_LOGGER_REFERENCE.md)

---

**Versão**: 1.0  
**Atualizado**: Abril 2026
