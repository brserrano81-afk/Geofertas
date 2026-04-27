# ✅ Checklist de Implementação - JourneyLogger

## 📋 Pre-requisitos

- [ ] Node.js v18+ instalado
- [ ] TypeScript configurado
- [ ] Firestore configurado
- [ ] Railway ou ambiente de produção pronto

---

## 1️⃣ Instalação

### Etapa 1.1: Copiar arquivo de serviço

```bash
# ✅ Verificar que o arquivo existe
ls -la src/services/JourneyLogger.ts

# Deve retornar:
# -rw-r--r-- ... JourneyLogger.ts
```

**Checklist:**
- [ ] Arquivo `src/services/JourneyLogger.ts` existe
- [ ] Arquivo tem ~500 linhas de código
- [ ] Imports estão corretos (fs, path)

---

### Etapa 1.2: Instalar dependências (se necessário)

```bash
# JourneyLogger usa apenas módulos built-in (fs, path)
# Nenhuma instalação adicional necessária

# ✅ Verificar que o TypeScript compila
npx tsc --noEmit src/services/JourneyLogger.ts
```

**Checklist:**
- [ ] Nenhum erro de compilação
- [ ] Tipos TypeScript validados

---

## 2️⃣ Configuração

### Etapa 2.1: Variáveis de Ambiente

```bash
# Abrir seu arquivo .env
nano .env

# Adicionar:
ENABLE_JOURNEY_FILE_LOGS=true
ENABLE_JOURNEY_CONSOLE_LOGS=true

# Salvar (Ctrl+O, Enter, Ctrl+X)
```

**Checklist:**
- [ ] `.env` tem `ENABLE_JOURNEY_FILE_LOGS=true`
- [ ] `.env` tem `ENABLE_JOURNEY_CONSOLE_LOGS=true`
- [ ] Arquivo foi salvo

---

### Etapa 2.2: Criar diretório de logs

```bash
# Criar pasta de logs
mkdir -p logs/message-journey

# Verificar
ls -la logs/message-journey/
```

**Checklist:**
- [ ] Diretório `logs/message-journey/` existe
- [ ] Diretório tem permissão de escrita

---

## 3️⃣ Integração no Webhook

### Etapa 3.1: Importar JourneyLogger

Arquivo: `api/sefaz-proxy.js`

```javascript
// ✅ Adicionar no topo do arquivo (após outros imports)

import { journeyLogger } from '../src/services/JourneyLogger.js';
```

**Checklist:**
- [ ] Import adicionado corretamente
- [ ] Caminho está correto (use `.js` em Node.js puro)

---

### Etapa 3.2: Iniciar jornada no webhook

Arquivo: `api/sefaz-proxy.js`, função `app.post('/webhook/whatsapp-entrada')`

```javascript
app.post('/webhook/whatsapp-entrada', webhookRateLimit, async (req, res) => {
    const normalizedEvent = normalizeEvolutionEvent(req.body);
    
    // ✅ NOVO: Iniciar jornada aqui
    journeyLogger.startJourney(
        normalizedEvent.correlationId,
        normalizedEvent.messageId
    );
    
    // ... resto do código ...
});
```

**Checklist:**
- [ ] `journeyLogger.startJourney()` chamado após normalizeEvolutionEvent
- [ ] correlationId passado corretamente
- [ ] messageId passado corretamente

---

### Etapa 3.3: Log de recebimento

```javascript
try {
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
    
    // ... resto do código ...
```

**Checklist:**
- [ ] Log adicionado no início do try block
- [ ] Metadados incluem userId, remoteJid, messageType

---

### Etapa 3.4: Log de validação

```javascript
    const validation = validateNormalizedEvent(normalizedEvent);

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
        );
    }
```

**Checklist:**
- [ ] Log de validação adicionado
- [ ] Diferencia entre sucesso e falha

---

### Etapa 3.5: Log de enfileiramento

```javascript
    if (validation.ok && enqueueResult.inboxId && !enqueueResult.duplicate) {
        // ✅ NOVO: Log de enfileiramento
        journeyLogger.logSuccess(
            normalizedEvent.correlationId,
            'inbox_enqueued',
            'Mensagem enfileirada no inbox',
            {
                inboxId: enqueueResult.inboxId,
                userId: normalizedEvent.userId,
                remoteJid: normalizedEvent.remoteJid,
            }
        );
    }
```

**Checklist:**
- [ ] Log adicionado após successful enqueue
- [ ] inboxId incluído nos metadados

---

### Etapa 3.6: Log de erro no webhook

```javascript
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
        }
    );
    
    console.error('[EvolutionWebhook] Error handling webhook:', err);
    res.status(500).json({ ok: false, error: err.message });
}
```

**Checklist:**
- [ ] `logError()` chamado com objeto Error
- [ ] Stack trace será capturado automaticamente

---

## 4️⃣ Integração no Worker

### Etapa 4.1: Importar JourneyLogger

Arquivo: `src/workers/EvolutionInboxWorker.ts`

```typescript
// ✅ Adicionar no topo (após outros imports)

import { journeyLogger } from '../services/JourneyLogger';
```

**Checklist:**
- [ ] Import adicionado corretamente

---

### Etapa 4.2: Log de início do worker

Função: `processInboxMessage()`

```typescript
async function processInboxMessage(message: InboxMessage) {
    try {
        // ✅ NOVO: Log de início
        journeyLogger.logSuccess(
            message.correlationId!,
            'worker_started',
            'Worker iniciou processamento',
            {
                inboxId: message.id,
                userId: message.userId,
                remoteJid: message.remoteJid,
                messageType: message.messageType,
            }
        );
```

**Checklist:**
- [ ] Log adicionado no início da função
- [ ] Usa `message.correlationId!` (com assertivo)

---

### Etapa 4.3: Log de busca de mensagem

```typescript
        // Marcar como em processamento
        await db.collection('message_inbox').doc(message.id).update({
            status: 'processing',
            processingStartedAt: serverTimestamp(),
        });
        
        // ✅ NOVO: Log de busca
        journeyLogger.logSuccess(
            message.correlationId!,
            'worker_fetched',
            'Mensagem buscada do inbox',
            {
                inboxId: message.id,
                status: message.status,
            }
        );
```

**Checklist:**
- [ ] Log adicionado após update de status
- [ ] Informações corretas de inboxId

---

### Etapa 4.4: Log de chamada ao ChatService

```typescript
        try {
            // ✅ NOVO: Log de chamada
            const startChatTime = Date.now();
            journeyLogger.logSuccess(
                message.correlationId!,
                'chat_service_called',
                'ChatService chamado',
                {
                    hasLocation: !!location,
                    hasMedia: !!message.mediaBase64,
                    messageType: message.messageType,
                }
            );
            
            const response = await chatService.processMessage({...});
            
            const chatDuration = Date.now() - startChatTime;
            
            // ✅ NOVO: Log de resposta
            journeyLogger.logSuccess(
                message.correlationId!,
                'chat_service_response',
                'ChatService respondeu',
                {
                    intent: response?.intent,
                    responseLength: response?.text?.length || 0,
                    duration_ms: chatDuration,
                    chatServiceIntent: response?.intent,
                }
            );
```

**Checklist:**
- [ ] Logs antes e depois de ChatService
- [ ] duration_ms calculada corretamente
- [ ] intent incluído

---

### Etapa 4.5: Log de erro no ChatService

```typescript
        } catch (chatErr) {
            // ✅ NOVO: Log de erro COM stack trace
            journeyLogger.logError(
                message.correlationId!,
                'chat_service_response',
                'Erro no ChatService',
                chatErr as Error,
                {
                    messageType: message.messageType,
                    intent: 'unknown',
                }
            );
```

**Checklist:**
- [ ] Error capturado e passado para logError
- [ ] Stack trace será salvo no JSON

---

### Etapa 4.6: Log de envio pela Evolution

```typescript
            // ✅ NOVO: Log de tentativa de envio
            const startSendTime = Date.now();
            journeyLogger.logSuccess(
                message.correlationId!,
                'evolution_send_attempted',
                'Tentando enviar resposta',
                {
                    textLength: responseText.length,
                    remoteJid: message.remoteJid,
                }
            );
            
            const sendResult = await sendTextViaEvolution(message.remoteJid, responseText);
            const sendDuration = Date.now() - startSendTime;
            
            if (sendResult.status === 'sent') {
                // ✅ NOVO: Log de sucesso
                journeyLogger.logSuccess(
                    message.correlationId!,
                    'evolution_send_success',
                    'Resposta enviada com sucesso',
                    {
                        textLength: responseText.length,
                        duration_ms: sendDuration,
                        evolutionStatus: 'sent',
                    }
                );
            } else {
                // ✅ NOVO: Log de falha
                journeyLogger.logError(
                    message.correlationId!,
                    'evolution_send_failed',
                    'Falha ao enviar resposta',
                    new Error(sendResult.status || 'unknown_error'),
                    {
                        sendStatus: sendResult.status,
                        duration_ms: sendDuration,
                        evolutionStatus: sendResult.status,
                    }
                );
            }
```

**Checklist:**
- [ ] Log de tentativa adicionado
- [ ] Logs diferenciados para sucesso e falha
- [ ] duration_ms incluída

---

### Etapa 4.7: Log de registro no outbox

```typescript
                // ✅ NOVO: Log de outbox
                journeyLogger.logSuccess(
                    message.correlationId!,
                    'outbox_recorded',
                    'Resposta registrada no outbox',
                    {
                        outboxId: outboxDoc.id,
                        sendStatus: 'sent',
                    }
                );
```

**Checklist:**
- [ ] Log adicionado após criar outbox
- [ ] outboxId incluído

---

### Etapa 4.8: Log de conclusão

```typescript
                // ✅ NOVO: Log de jornada completa
                journeyLogger.logSuccess(
                    message.correlationId!,
                    'completed',
                    'Jornada concluída com sucesso',
                    {
                        inboxId: message.id,
                        outboxId: outboxDoc.id,
                        totalDuration_ms: Date.now() - startSendTime,
                    }
                );
```

**Checklist:**
- [ ] Log de conclusão adicionado

---

### Etapa 4.9: Finalizar jornada

```typescript
        // ✅ NOVO: Finalizar jornada (salva arquivo JSON)
        await journeyLogger.finalizeJourney(message.correlationId!);
        
    } catch (err) {
        // ✅ NOVO: Log de erro não previsto
        journeyLogger.logException(
            message.correlationId!,
            'Erro não previsto no processamento',
            err as Error,
            {
                inboxId: message.id,
                messageType: message.messageType,
            }
        );
        
        // Finalizar jornada mesmo com erro
        await journeyLogger.finalizeJourney(message.correlationId!);
    }
}
```

**Checklist:**
- [ ] `finalizeJourney()` chamado no final (com ou sem erro)
- [ ] Arquivo JSON será salvo automaticamente

---

## 5️⃣ Testes

### Etapa 5.1: Compilar TypeScript

```bash
# Compilar
npx tsc -b

# Verificar erros
# Deve retornar sem mensagens de erro
```

**Checklist:**
- [ ] Nenhum erro de compilação
- [ ] Tipos estão validados

---

### Etapa 5.2: Rodar webhook de teste

```bash
# Em um terminal
npm run proxy

# Em outro terminal
npx tsx src/scripts/testEvolutionWebhook.ts "teste"
```

**Checklist:**
- [ ] Webhook retorna `ok: true`
- [ ] Log aparece no console com ✓
- [ ] Arquivo JSON foi criado em `logs/message-journey/`

---

### Etapa 5.3: Verificar arquivo JSON

```bash
# Listar arquivos criados
ls -la logs/message-journey/

# Ver conteúdo do primeiro arquivo
cat logs/message-journey/$(ls -t logs/message-journey/ | head -1) | jq .
```

**Checklist:**
- [ ] Arquivo foi criado
- [ ] JSON é válido (pode fazer parse)
- [ ] Tem stages: webhook_received, webhook_validation, inbox_enqueued

---

### Etapa 5.4: Rodar worker de teste

```bash
# Opcional: injetar mensagem de teste
# Ver docs/JOURNEY_LOGGER_INTEGRATION.md section "Exemplo com Teste"

# Rodar worker uma vez
npx tsx src/workers/EvolutionInboxWorker.ts --once
```

**Checklist:**
- [ ] Worker inicia sem erro
- [ ] Processa mensagem de teste
- [ ] Novo arquivo JSON é criado com mais stages

---

### Etapa 5.5: Verificar logs completos

```bash
# Ver arquivo mais recente
cat logs/message-journey/$(ls -t logs/message-journey/ | head -1) | jq '.stages[] | {stage, timestamp, duration_from_start_ms}'
```

**Checklist:**
- [ ] Tem stages: worker_started, chat_service_called, evolution_send_*
- [ ] Timestamps estão em ordem crescente
- [ ] Durations aumentam logicamente

---

## 6️⃣ Validação Final

### Etapa 6.1: Verificar console output

```bash
# Deve ver linhas como:
✓ [webhook_received] abc123de [INFO] Webhook recebido
✓ [inbox_enqueued] abc123de [INFO] Mensagem enfileirada
✓ [worker_started] abc123de [INFO] Worker iniciou
✓ [chat_service_response] abc123de [INFO] ChatService respondeu
✓ [evolution_send_success] abc123de [INFO] Resposta enviada
✓ [completed] abc123de [INFO] Jornada concluída
```

**Checklist:**
- [ ] Emojis aparecem (✓, ⚠, ✗)
- [ ] correlationId aparece (8 caracteres)
- [ ] Etapas estão na ordem correta

---

### Etapa 6.2: Teste de erro

```bash
# Simulate error in ChatService by sending invalid input
# Ou mockar falha na Evolution API

# Verificar que erro foi capturado
grep -r "error" logs/message-journey/ | grep -i "stack"
```

**Checklist:**
- [ ] Stack trace capturado em arquivo JSON
- [ ] Error.name, Error.message, Error.stack presentes

---

### Etapa 6.3: Limpeza de logs antigos

```typescript
// Em seu código de inicialização (ou cron job)
import { journeyLogger } from './services/JourneyLogger';

// Rodar limpeza de logs com mais de 7 dias
await journeyLogger.cleanupOldLogs(7);
console.log('Logs antigos removidos');
```

**Checklist:**
- [ ] Função `cleanupOldLogs()` funciona
- [ ] Arquivos antigos removidos
- [ ] Arquivos recentes mantidos

---

## 7️⃣ Monitoramento

### Etapa 7.1: Criar queries úteis

```bash
# Ver todas as jornadas do último dia
find logs/message-journey -type f -mtime -1 | wc -l

# Ver jornadas com erro
find logs/message-journey -type f -exec grep -l '"level":"error"' {} \;

# Ver tempo médio de processamento
find logs/message-journey -type f -exec jq '.totalDuration_ms' {} \; | \
  awk '{sum += $1; count++} END {print "Média:", sum/count, "ms"}'
```

**Checklist:**
- [ ] Queries executadas com sucesso
- [ ] Dados são lógicos (tempo em ms, contagens positivas)

---

### Etapa 7.2: Alertas (Opcional)

```bash
# Script para alertar se muitos erros
find logs/message-journey -type f -mtime -1 -exec grep -l '"level":"error"' {} \; | \
  wc -l | awk '{if ($1 > 10) print "ALERT: " $1 " errors in last 24h"}'
```

**Checklist:**
- [ ] Script de monitoramento criado (opcional)
- [ ] Alertas serão acionados se necessário

---

## ✅ Conclusão

Parabéns! 🎉 Você completou a integração do JourneyLogger!

**Próximos passos:**
1. [ ] Deploy para staging
2. [ ] Testar com tráfego real
3. [ ] Monitorar logs e performance
4. [ ] Ajustar variáveis se necessário
5. [ ] Deploy para produção

**Documentação disponível:**
- [JOURNEY_LOGGER_REFERENCE.md](JOURNEY_LOGGER_REFERENCE.md) - Referência rápida
- [JOURNEY_LOGGER_EXAMPLES.md](JOURNEY_LOGGER_EXAMPLES.md) - Exemplos de código
- [JOURNEY_LOGGER_INTEGRATION.md](JOURNEY_LOGGER_INTEGRATION.md) - Integração detalhada
- [JOURNEY_LOGGER_OVERVIEW.md](JOURNEY_LOGGER_OVERVIEW.md) - Visão geral com diagrama

---

**Tempo estimado de implementação:** 1-2 horas  
**Dificuldade:** ⭐⭐ (Fácil a Médio)
