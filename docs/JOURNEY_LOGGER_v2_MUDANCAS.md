# 🔄 JourneyLogger v2 - O Que Mudou

## ✨ Resumo das Mudanças

**Antes (v1):**
- ❌ Criava arquivo JSON em `logs/message-journey/`
- ❌ Arquivo separado do fluxo de logs existente
- ❌ Sem integração com Firestore

**Agora (v2):**
- ✅ Integrado com `integration_events` do Firestore
- ✅ Sem arquivo separado
- ✅ Um único lugar para todos os logs
- ✅ Queries poderosas no Firestore

---

## 📝 Código Muda Assim

### ANTES (v1)
```javascript
// Nenhuma mudança necessária no webhook
// Arquivo era criado automaticamente em logs/message-journey/
await journeyLogger.finalizeJourney(correlationId);
```

### DEPOIS (v2)
```javascript
// Uma única linha de setup (no início da aplicação)
journeyLogger.setFirestore(db);

// Resto do código é IDÊNTICO!
// Finalizar jornada agora persiste em Firestore
await journeyLogger.finalizeJourney(correlationId);
```

---

## 🎯 O Que Você Ganha

```
ANTES                      DEPOIS
├── logs/                  ├── Firestore
│   ├── *.log              │   ├── integration_events
│   └── evolution-webhooks/│   │   ├── journey_stage
│                          │   │   ├── journey_stage
│                          │   │   ├── journey_summary
```

**Vantagens:**
- ✅ Tudo em um banco de dados
- ✅ Queries complexas funcionam
- ✅ Sem limite de espaço em disco
- ✅ Retenção automática
- ✅ Melhor integração com sistema existente

---

## 🚀 Setup Mínimo (3 passos)

### 1. Importar

```javascript
import { journeyLogger } from '../src/services/JourneyLogger.js';
```

### 2. Injetar Firestore

```javascript
const db = admin.firestore();
journeyLogger.setFirestore(db); // ← ÚNICA LINHA NECESSÁRIA
```

### 3. Usar (código existente continua igual)

```javascript
journeyLogger.logSuccess(correlationId, 'webhook_received', 'OK');
```

---

## 📊 Exemplo de Dados no Firestore

### Documento por etapa

```
collection: integration_events
├── Document: journey_stage_001
│   ├── kind: "journey_stage"
│   ├── correlationId: "abc123def456"
│   ├── stage: "webhook_received"
│   ├── timestamp: "2026-04-26T15:30:00Z"
│   ├── message: "Webhook recebido"
│   ├── error: null
```

### Resumo completo

```
collection: integration_events
├── Document: journey_summary_001
│   ├── kind: "journey_summary"
│   ├── correlationId: "abc123def456"
│   ├── totalDuration_ms: 2347
│   ├── stages: [...]
```

---

## 🔍 Query Rápida

### Ver jornada completa

```javascript
const docs = await db
  .collection('integration_events')
  .where('correlationId', '==', 'abc123def456')
  .orderBy('timestamp')
  .get();

docs.forEach(doc => {
  const { stage, message, error } = doc.data();
  console.log(`${stage}: ${message}`);
  if (error) console.log(`  Stack: ${error.stack}`);
});
```

---

## ⚙️ Variáveis de Ambiente

```env
# Opcional (padrão: true)
ENABLE_JOURNEY_CONSOLE_LOGS=true

# Remover! (não mais necessário)
# ENABLE_JOURNEY_FILE_LOGS=true  ❌ NÃO USE
```

---

## 📁 Arquivos Atualizados

- ✅ `src/services/JourneyLogger.ts` - Versão v2 com Firestore
- ✅ `docs/JOURNEY_LOGGER_FIRESTORE_INTEGRATION.md` - Nova guia

---

## 🎯 Próximos Passos

1. Leia [JOURNEY_LOGGER_FIRESTORE_INTEGRATION.md](JOURNEY_LOGGER_FIRESTORE_INTEGRATION.md)
2. Copie a linha: `journeyLogger.setFirestore(db);`
3. Use como antes
4. Pronto! Logs já estão em Firestore

---

## ✅ Checklist Rápido

- [ ] Importei `journeyLogger`
- [ ] Chamei `journeyLogger.setFirestore(db)`
- [ ] Testei com webhook
- [ ] Vi documentos em Firestore `integration_events`

---

**Status:** 🟢 Pronto para produção  
**Integração:** Firestore (banco de dados existente)  
**Arquivos separados:** ❌ Nenhum  
**ROI:** Máximo (sem mudanças de código, tudo em Firestore)
