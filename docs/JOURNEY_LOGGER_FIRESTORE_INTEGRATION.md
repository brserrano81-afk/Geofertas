# ✅ JourneyLogger - Integração com Logs Existentes (Firestore)

## 🎯 Mudança Principal

O JourneyLogger **NÃO cria mais arquivo separado** (`logs/message-journey/`). Ao invés disso:

- ✅ **Integra com `integration_events`** (Firestore) - banco de dados permanente existente
- ✅ **Console output** para debugging (opcional)
- ✅ **Sem arquivo novo** - tudo no Firestore como você já usa

---

## 📊 Novo Fluxo de Dados

```
Webhook recebe mensagem
         ↓
  journeyLogger.startJourney()
         ↓
  journeyLogger.logSuccess(...)
         ↓
  ┌─────────────────────────────────────┐
  │ Firestore integration_events        │
  │ ┌─────────────────────────────────┐ │
  │ │ kind: 'journey_stage'          │ │
  │ │ correlationId: '...'           │ │
  │ │ stage: 'webhook_received'      │ │
  │ │ timestamp: '...'               │ │
  │ │ message: '...'                 │ │
  │ │ error: { stack: '...' }        │ │
  │ │ metadata: { ... }              │ │
  │ └─────────────────────────────────┘ │
  │                                     │
  │ [MÚLTIPLOS DOCUMENTOS - UM POR ETAPA]│
  └─────────────────────────────────────┘
         ↓
  journeyLogger.finalizeJourney()
         ↓
  ┌─────────────────────────────────────┐
  │ Firestore integration_events        │
  │ ┌─────────────────────────────────┐ │
  │ │ kind: 'journey_summary'        │ │
  │ │ correlationId: '...'           │ │
  │ │ totalDuration_ms: 2347         │ │
  │ │ stages: [...]                  │ │
  │ └─────────────────────────────────┘ │
  └─────────────────────────────────────┘
```

---

## 🔧 Setup (Muito Simples!)

### Etapa 1: Injetar Firestore no JourneyLogger

Arquivo: `api/sefaz-proxy.js` (ou seu arquivo de inicialização)

```javascript
import { journeyLogger } from '../src/services/JourneyLogger.js';

// Depois que admin.firestore() é inicializado:
const db = admin.firestore();

// ✅ NOVO: Injetar Firestore no JourneyLogger
journeyLogger.setFirestore(db);
```

### Etapa 2: Usar como antes

Tudo funciona igual, mas agora persiste em Firestore ao invés de arquivo:

```javascript
journeyLogger.startJourney(correlationId, messageId);
journeyLogger.logSuccess(correlationId, 'webhook_received', 'Mensagem recebida');
journeyLogger.logError(correlationId, 'error', 'Erro', err);
await journeyLogger.finalizeJourney(correlationId);
```

---

## 📁 O Que Muda

### Antes ❌
```
logs/
├── message-journey/
│   ├── 1703072400000_abc123de.json
│   ├── 1703072401234_def456gh.json
│   └── ...
```

### Depois ✅
```
Firestore - collection: integration_events
├── journey_stage (múltiplos documentos)
│   ├── stage: "webhook_received"
│   ├── timestamp: "2026-04-26T15:30:00Z"
│   ├── error: { stack: "..." }
│   ├── ...
├── journey_stage (próxima etapa)
│   ├── stage: "chat_service_response"
│   ├── ...
├── journey_summary (resumo completo)
│   ├── totalDuration_ms: 2347
│   ├── stages: [...]
```

---

## 🔍 Queries Úteis no Firestore

### Ver todas as etapas de uma jornada
```javascript
const journey = await db
  .collection('integration_events')
  .where('correlationId', '==', 'abc123def456')
  .where('kind', '==', 'journey_stage')
  .orderBy('timestamp')
  .get();

journey.docs.forEach(doc => {
  const { stage, message, timestamp, error } = doc.data();
  console.log(`${timestamp} [${stage}] ${message}`);
  if (error) console.log(`  Stack: ${error.stack}`);
});
```

### Ver erros de uma conversa
```javascript
const errors = await db
  .collection('integration_events')
  .where('remoteJid', '==', '5527998862440@s.whatsapp.net')
  .where('kind', '==', 'journey_stage')
  .where('level', '==', 'error')
  .orderBy('timestamp', 'desc')
  .get();

console.log(`Total de erros: ${errors.docs.length}`);
errors.docs.forEach(doc => {
  const { stage, message, error, timestamp } = doc.data();
  console.log(`[${stage}] ${message}`);
  if (error) console.log(`  ${error.name}: ${error.message}`);
});
```

### Ver tempo médio de processamento
```javascript
const summaries = await db
  .collection('integration_events')
  .where('kind', '==', 'journey_summary')
  .get();

const durations = summaries.docs.map(d => d.data().totalDuration_ms);
const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
console.log(`Tempo médio: ${avg.toFixed(0)}ms`);
```

### Ver qual etapa mais demora
```javascript
const stages = await db
  .collection('integration_events')
  .where('kind', '==', 'journey_stage')
  .get();

const byStage = {};
stages.docs.forEach(doc => {
  const { stage, metadata } = doc.data();
  if (!byStage[stage]) byStage[stage] = [];
  if (metadata?.duration_ms) {
    byStage[stage].push(metadata.duration_ms);
  }
});

Object.entries(byStage).forEach(([stage, durations]) => {
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  console.log(`${stage}: ${avg.toFixed(0)}ms`);
});
```

---

## 💾 Estrutura de Documentos

### Documento: journey_stage

```json
{
  "kind": "journey_stage",
  "correlationId": "abc123def456",
  "messageId": "msg_789",
  "stage": "chat_service_response",
  "level": "info",
  "timestamp": "2026-04-26T15:30:01.500Z",
  "message": "ChatService respondeu",
  "userId": "5527998862440@s.whatsapp.net",
  "remoteJid": "5527998862440@s.whatsapp.net",
  "messageType": "conversation",
  "duration_from_start_ms": 1400,
  "metadata": {
    "intent": "consultar_preco_produto",
    "responseLength": 145,
    "duration_ms": 1200
  },
  "error": null,
  "hasError": false,
  "createdAt": Timestamp
}
```

### Documento: journey_summary

```json
{
  "kind": "journey_summary",
  "correlationId": "abc123def456",
  "messageId": "msg_789",
  "userId": "5527998862440@s.whatsapp.net",
  "remoteJid": "5527998862440@s.whatsapp.net",
  "messageType": "conversation",
  "startedAtIso": "2026-04-26T15:30:00.000Z",
  "endedAtIso": "2026-04-26T15:30:02.500Z",
  "totalDuration_ms": 2500,
  "stages": [
    {
      "stage": "webhook_received",
      "timestamp": "2026-04-26T15:30:00.100Z",
      "level": "info",
      "duration_from_start_ms": 0,
      "message": "Webhook recebido"
    },
    {
      "stage": "chat_service_response",
      "timestamp": "2026-04-26T15:30:01.500Z",
      "level": "info",
      "duration_from_start_ms": 1400,
      "message": "ChatService respondeu"
    },
    {
      "stage": "error",
      "timestamp": "2026-04-26T15:30:02.000Z",
      "level": "error",
      "duration_from_start_ms": 1900,
      "message": "Falha ao enviar",
      "error": {
        "name": "ConnectionError",
        "message": "ECONNREFUSED",
        "stack": "Error: ECONNREFUSED...\n    at TCPConnectWrap..."
      }
    }
  ],
  "createdAt": Timestamp
}
```

---

## 🎨 Console Output (Opcional)

Com `ENABLE_JOURNEY_CONSOLE_LOGS=true` (padrão):

```
✓ [webhook_received] abc123de [INFO] Webhook recebido: conversation
✓ [inbox_enqueued] abc123de [INFO] Mensagem enfileirada no inbox
✓ [worker_started] abc123de [INFO] Worker iniciou processamento
✓ [chat_service_response] abc123de [INFO] ChatService respondeu
✓ [evolution_send_success] abc123de [INFO] Resposta enviada com sucesso
✓ [completed] abc123de [INFO] Jornada concluída com sucesso
```

Se houver erro:

```
✗ [error] abc123de [ERROR] Erro ao processar webhook
   Error: TypeError: Cannot read property 'map' of undefined
   Stack: TypeError: Cannot read property...
```

---

## ⚙️ Configuração

Arquivo `.env` (opcional - tem padrões bons):

```env
# Console output (padrão: true)
ENABLE_JOURNEY_CONSOLE_LOGS=true
```

Pronto! Sem variáveis de arquivo.

---

## 🚀 Implementação Rápida

Arquivo: `api/sefaz-proxy.js`

```javascript
// No topo, com outros imports
import { journeyLogger } from '../src/services/JourneyLogger.js';

// Depois de inicializar Firebase
const db = admin.firestore();

// ✅ INJETAR FIRESTORE
journeyLogger.setFirestore(db);

// No webhook handler
app.post('/webhook/whatsapp-entrada', async (req, res) => {
    const event = normalizeEvolutionEvent(req.body);
    
    // ✅ USAR COMO ANTES
    journeyLogger.startJourney(event.correlationId, event.messageId);
    
    try {
        journeyLogger.logSuccess(
            event.correlationId,
            'webhook_received',
            'Webhook recebido'
        );
        // ... resto do código ...
    } catch (err) {
        journeyLogger.logError(
            event.correlationId,
            'error',
            'Erro no webhook',
            err
        );
    }
});
```

---

## 🔐 Segurança

- ✅ Dados persistidos em Firestore (seguro)
- ✅ Stack traces capturados e armazenados
- ✅ Sem exposição em arquivos do servidor
- ✅ Acesso controlado por regras Firestore
- ✅ Retenção automática (configure em Firestore)

---

## 📊 Benefícios

| Antes | Depois |
|-------|--------|
| Arquivo separado | Firestore (banco central) |
| Sem queries | Queries Firestore completas |
| Sem index | Indexação automática |
| Cleanup manual | Retenção automática Firestore |
| Limite tamanho disco | Escalabilidade Firestore |

---

## 🆘 Troubleshooting

### "Nenhum documento foi criado"
```javascript
// Verificar se Firestore foi injetado
journeyLogger.setFirestore(db); // Certifique-se que está sendo chamado
```

### "Erro: Cannot read property 'collection' of undefined"
```javascript
// Firestore não foi passado ou é undefined
// Verificar: journeyLogger.setFirestore(db) sendo chamado?
```

### "Não vejo o console output"
```env
# Ativar
ENABLE_JOURNEY_CONSOLE_LOGS=true
```

---

## ✅ Checklist de Implementação

- [ ] Importado `journeyLogger` em `api/sefaz-proxy.js`
- [ ] Chamado `journeyLogger.setFirestore(db)` após inicializar Firebase
- [ ] Testado com webhook de teste
- [ ] Verificado que documentos aparecem em Firestore `integration_events`
- [ ] Console output aparecendo (opcional)

---

## 📈 Próximos Passos

1. **Integrar no webhook** - copie o setup acima
2. **Integrar no worker** - use os mesmo métodos
3. **Testar** - envie mensagem de teste
4. **Verificar Firestore** - veja os documentos criados
5. **Monitorar** - use as queries úteis acima

---

**Versão**: 2.0 (Integrada com Firestore)  
**Data**: Abril 2026  
**Status**: 🟢 Pronto para usar com logs existentes
