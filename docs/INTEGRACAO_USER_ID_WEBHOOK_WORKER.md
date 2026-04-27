# 🔧 Guia de Integração - User ID Único no Webhook e Worker

**Data:** 26 de Abril de 2026  
**Objetivo:** Integrar user_id UUID e displayName no JourneyLogger v2.1

---

## 📋 Resumo das Mudanças

### O Que Mudou

| Antes | Depois |
|-------|--------|
| ❌ remoteJid / telefone como identificador | ✅ user_id UUID único |
| ❌ Sem nome de usuário nos logs | ✅ displayName em todos os logs |
| ❌ Impossível buscar "logs deste usuário" | ✅ `WHERE user_id == UUID` no Firestore |
| ❌ Sem relação webhook → logs → usuário | ✅ Jornada rastreada por UUID |

---

## 🚀 FASE 1: Setup (Já Feito ✅)

Arquivos criados/modificados:
- ✅ `src/types/UserIdentity.ts` - Tipos para user_id
- ✅ `src/services/UserDashboardService.ts` - Queries para dashboard
- ✅ `src/services/JourneyLogger.ts` - v2.1 com user_id + displayName
- ✅ `scripts/backfillUserId.ts` - Migração de dados
- ✅ `docs/PLANO_IMPLEMENTACAO_USER_ID_UNICO.md` - Documentação

---

## 🔌 FASE 2: Integrar no Webhook

### Arquivo: `api/sefaz-proxy.js`

**Localização:** POST `/webhook/whatsapp-entrada`

**Mudança (antes do enqueue):**

```javascript
// ANTES
app.post('/webhook/whatsapp-entrada', async (req, res) => {
  try {
    // ... normalizar webhook ...
    
    // Enqueue para worker
    await db.collection('message_inbox').add({
      remoteJid,
      messageData,
      // ... existing fields ...
    });
    
    res.json({ status: 'received' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
```

**DEPOIS (com user_id tracking):**

```javascript
const { UserDashboardService } = require('../src/services/UserDashboardService');
const { journeyLogger } = require('../src/services/JourneyLogger');

// ... em cima do arquivo, após inicializar db ...
journeyLogger.setFirestore(db);
const userDashboard = new UserDashboardService(db);

app.post('/webhook/whatsapp-entrada', async (req, res) => {
  const correlationId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    // 1. Normalizar webhook (existing logic)
    const normalizedData = normalizeEvolutionEvent(req.body);
    const remoteJid = normalizedData.sender || normalizedData.remoteJid;
    
    // 2. NOVO: Resolver identidade completa (get user_id)
    const userIdentity = await resolveUserIdentity(remoteJid, db);
    
    if (!userIdentity) {
      // Criar novo usuário se não existe
      const newUserId = await createNewUser(remoteJid, db);
      userIdentity = { user_id: newUserId };
    }
    
    // 3. NOVO: Iniciar jornada com user_id
    journeyLogger.startJourney(correlationId, normalizedData.messageId);
    
    // 4. NOVO: Log de webhook recebido COM user_id
    journeyLogger.logSuccess(
      correlationId,
      'webhook_received',
      `Webhook recebido: ${normalizedData.type || 'message'}`,
      {
        user_id: userIdentity.user_id,              // ← NEW: UUID
        displayName: userIdentity.displayName,      // ← NEW: Nome
        remoteJid,
        messageType: normalizedData.type,
      }
    );
    
    // 5. Validar webhook
    const validationResult = validateWebhookData(normalizedData);
    if (!validationResult.valid) {
      journeyLogger.logError(
        correlationId,
        'webhook_validation',
        'Validação falhou',
        new Error(validationResult.error),
        {
          user_id: userIdentity.user_id,
          displayName: userIdentity.displayName,
        }
      );
      
      return res.status(400).json({ error: validationResult.error });
    }
    
    journeyLogger.logSuccess(
      correlationId,
      'webhook_validation',
      'Webhook validado com sucesso',
      {
        user_id: userIdentity.user_id,
        displayName: userIdentity.displayName,
      }
    );
    
    // 6. Enqueue para worker COM user_id
    const inboxRef = await db.collection('message_inbox').add({
      remoteJid,
      messageData: normalizedData,
      
      // NEW v2.1: Persistir user_id para worker
      user_id: userIdentity.user_id,
      displayName: userIdentity.displayName,
      
      // existing fields
      status: 'pending',
      createdAt: admin.firestore.Timestamp.now(),
      correlationId,  // ← Novo: para rastrear
    });
    
    journeyLogger.logSuccess(
      correlationId,
      'inbox_enqueued',
      `Mensagem enfileirada no inbox: ${inboxRef.id}`,
      {
        user_id: userIdentity.user_id,
        displayName: userIdentity.displayName,
        inboxId: inboxRef.id,
      }
    );
    
    // 7. Finalizar jornada (sucesso)
    await journeyLogger.finalizeJourney(correlationId);
    
    return res.json({ 
      status: 'received',
      inboxId: inboxRef.id,
      correlationId,  // ← Retornar para tracking
      user_id: userIdentity.user_id,
    });
    
  } catch (err) {
    console.error('[Webhook] Erro:', err);
    
    // Log de erro COM user_id
    journeyLogger.logException(
      correlationId,
      'Erro ao processar webhook',
      err,
      {
        user_id: userIdentity?.user_id,
        displayName: userIdentity?.displayName,
      }
    );
    
    await journeyLogger.finalizeJourney(correlationId);
    
    res.status(500).json({ 
      error: err.message,
      correlationId 
    });
  }
});
```

**Função auxiliar para resolver identidade:**

```javascript
async function resolveUserIdentity(remoteJid, db) {
  // 1. Buscar em identity_aliases
  const aliasSnap = await db
    .collection('identity_aliases')
    .where('remoteJid', '==', remoteJid)
    .limit(1)
    .get();
  
  if (aliasSnap.empty) {
    return null; // Usuário novo, será criado
  }
  
  const alias = aliasSnap.docs[0].data();
  
  // 2. Buscar dados completos do usuário
  const userSnap = await db
    .collection('users')
    .doc(alias.canonicalUserId)
    .get();
  
  if (!userSnap.exists) {
    return null;
  }
  
  const userData = userSnap.data();
  
  return {
    user_id: userData.user_id,           // UUID
    displayName: userData.displayName,   // Nome
    userId: alias.canonicalUserId,
  };
}

async function createNewUser(remoteJid, db) {
  const { v4: uuidv4 } = require('uuid');
  
  // Extrair nome/telefone do remoteJid
  const phone = remoteJid.split('@')[0];
  const displayName = `User_${phone.slice(-4)}`;
  
  const user_id = uuidv4();
  const userId = `legacy_${phone}`;
  
  // Criar documento de usuário
  await db.collection('users').doc(userId).set({
    user_id,
    userId,
    user_status: 'active',
    displayName,
    firstName: 'User',
    lastName: phone.slice(-4),
    phone: phone,
    whatsappPhone: phone,
    whatsappJid: remoteJid,
    createdAt: admin.firestore.Timestamp.now(),
    createdAtUnix: Date.now(),
  });
  
  // Criar alias
  await db.collection('identity_aliases').add({
    remoteJid,
    canonicalUserId: userId,
    user_id,
  });
  
  return user_id;
}
```

---

## 🔌 FASE 3: Integrar no Worker

### Arquivo: `src/workers/EvolutionInboxWorker.ts`

**Localização:** Função main de processamento

**Mudança (início da função):**

```typescript
// ANTES
async function processMessage(message: any) {
  const correlationId = message.correlationId || `worker_${Date.now()}`;
  
  try {
    // ... processing logic ...
  } catch (err) {
    console.error(err);
  }
}
```

**DEPOIS (com user_id tracking):**

```typescript
import { journeyLogger } from '../services/JourneyLogger';
import { UserDashboardService } from '../services/UserDashboardService';

const userDashboard = new UserDashboardService(db);

async function processMessage(message: any) {
  const correlationId = message.correlationId || `worker_${Date.now()}`;
  
  // NOVO: Pegar user_id do inbox document
  const user_id = message.user_id;
  const displayName = message.displayName;
  
  try {
    // 1. Log: Worker iniciou
    journeyLogger.logSuccess(
      correlationId,
      'worker_started',
      'Worker iniciou processamento de mensagem',
      {
        user_id,
        displayName,
        inboxId: message.inboxId,
      }
    );
    
    // 2. Fetch message from inbox
    const inboxDoc = await db.collection('message_inbox').doc(message.inboxId).get();
    const inboxData = inboxDoc.data();
    
    journeyLogger.logSuccess(
      correlationId,
      'worker_fetched',
      `Mensagem carregada do inbox`,
      {
        user_id,
        displayName,
        messageType: inboxData.messageData.type,
      }
    );
    
    // 3. Call ChatService
    journeyLogger.logSuccess(
      correlationId,
      'chat_service_called',
      'ChatService sendo chamado',
      {
        user_id,
        displayName,
        messageType: inboxData.messageData.type,
      }
    );
    
    const chatResponse = await chatService.processMessage({
      text: inboxData.messageData.body,
      userId: inboxData.userId,
      remoteJid: inboxData.remoteJid,
    });
    
    journeyLogger.logSuccess(
      correlationId,
      'chat_service_response',
      'ChatService respondeu com sucesso',
      {
        user_id,
        displayName,
        chatServiceIntent: chatResponse.intent,
        metadata: { intent: chatResponse.intent },
      }
    );
    
    // 4. Send response via Evolution
    journeyLogger.logSuccess(
      correlationId,
      'evolution_send_attempted',
      'Tentando enviar resposta via Evolution',
      {
        user_id,
        displayName,
        message: chatResponse.text.slice(0, 100),
      }
    );
    
    const evolutionResponse = await evolutionClient.send({
      to: inboxData.remoteJid,
      text: chatResponse.text,
    });
    
    journeyLogger.logSuccess(
      correlationId,
      'evolution_send_success',
      'Resposta enviada com sucesso',
      {
        user_id,
        displayName,
        evolutionMessageId: evolutionResponse.messageId,
      }
    );
    
    // 5. Record in outbox
    await db.collection('message_outbox').add({
      remoteJid: inboxData.remoteJid,
      user_id,              // ← NEW
      displayName,          // ← NEW
      response: chatResponse.text,
      sentAt: admin.firestore.Timestamp.now(),
      evolutionMessageId: evolutionResponse.messageId,
    });
    
    journeyLogger.logSuccess(
      correlationId,
      'outbox_recorded',
      'Resposta registrada no outbox',
      {
        user_id,
        displayName,
      }
    );
    
    // 6. Update inbox status
    await inboxDoc.ref.update({
      status: 'processed',
      processedAt: admin.firestore.Timestamp.now(),
      outboxId: outboxRef.id,
    });
    
    journeyLogger.logSuccess(
      correlationId,
      'inbox_updated',
      'Status do inbox atualizado',
      {
        user_id,
        displayName,
      }
    );
    
    // 7. Mark as completed
    journeyLogger.logSuccess(
      correlationId,
      'completed',
      'Jornada concluída com sucesso',
      {
        user_id,
        displayName,
      }
    );
    
    // 8. Finalizar jornada (persiste summary)
    await journeyLogger.finalizeJourney(correlationId);
    
  } catch (err) {
    console.error('[Worker] Erro ao processar mensagem:', err);
    
    // Log de erro COM user_id
    journeyLogger.logException(
      correlationId,
      'Erro ao processar mensagem no worker',
      err,
      {
        user_id,
        displayName,
      }
    );
    
    // Atualizar inbox como error
    await db.collection('message_inbox').doc(message.inboxId).update({
      status: 'error',
      errorMessage: err.message,
      errorAt: admin.firestore.Timestamp.now(),
    });
    
    // Finalizar jornada (persiste com erro)
    await journeyLogger.finalizeJourney(correlationId);
    
    throw err;
  }
}
```

---

## 📊 FASE 4: Dashboard Queries

### Como Buscar Usuário por Nome (quando relata erro)

```typescript
// Arquivo: src/api/UserRoutes.ts (novo)

import { Router } from 'express';
import { UserDashboardService } from '../services/UserDashboardService';

export function createUserRoutes(db) {
  const router = Router();
  const userDashboard = new UserDashboardService(db);
  
  // GET /api/users/search?name=João
  router.get('/api/users/search', async (req, res) => {
    try {
      const { name } = req.query;
      
      if (!name || name.length < 2) {
        return res.status(400).json({ 
          error: 'Nome deve ter pelo menos 2 caracteres' 
        });
      }
      
      const results = await userDashboard.searchUserByName(name as string, 50);
      
      return res.json({
        count: results.length,
        users: results,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // GET /api/users/:user_id/logs
  router.get('/api/users/:user_id/logs', async (req, res) => {
    try {
      const { user_id } = req.params;
      const { hours = 24, limit = 50 } = req.query;
      
      const journeys = await userDashboard.getUserJourneys(
        user_id,
        {
          limit: parseInt(limit as string) || 50,
          orderBy: 'newest',
          sinceHours: parseInt(hours as string) || 24,
        }
      );
      
      return res.json({
        user_id,
        total: journeys.length,
        journeys,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // GET /api/users/:user_id/errors
  router.get('/api/users/:user_id/errors', async (req, res) => {
    try {
      const { user_id } = req.params;
      const { hours = 24 } = req.query;
      
      const errors = await userDashboard.getUserErrors(
        user_id,
        parseInt(hours as string) || 24
      );
      
      return res.json({
        user_id,
        errorCount: errors.length,
        errors,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  // GET /api/users/:user_id/stats
  router.get('/api/users/:user_id/stats', async (req, res) => {
    try {
      const { user_id } = req.params;
      
      const stats = await userDashboard.getUserStatistics(user_id);
      
      return res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  
  return router;
}
```

### Uso (Frontend/Dashboard)

```javascript
// 1. Buscar usuário por nome
const response = await fetch('/api/users/search?name=João Silva');
const { users } = await response.json();

// 2. Quando usuário reporta erro
const user = users[0];  // ou usuário selecionado
const logsResponse = await fetch(`/api/users/${user.user_id}/logs?hours=24`);
const { journeys } = await logsResponse.json();

// 3. Mostrar no dashboard
journeys.forEach(journey => {
  console.log(`${journey.startedAt}: ${journey.status}`);
  if (journey.errorMessage) {
    console.log(`  ❌ Erro: ${journey.errorMessage}`);
  }
});
```

---

## ✅ Checklist de Implementação

### Webhook
- [ ] Adicionar `resolveUserIdentity()` function
- [ ] Adicionar `createNewUser()` function  
- [ ] Modificar POST `/webhook/whatsapp-entrada`
- [ ] Adicionar logging de user_id
- [ ] Testar com webhook de teste

### Worker
- [ ] Adicionar import de JourneyLogger
- [ ] Modificar `processMessage()` para usar user_id
- [ ] Adicionar logging de user_id em cada etapa
- [ ] Testar com mensagem de teste

### Dashboard
- [ ] Criar `src/api/UserRoutes.ts`
- [ ] Integrar rotas em Express app
- [ ] Testar queries de busca

### Database
- [ ] Executar script `scripts/backfillUserId.ts`
- [ ] Verificar que todos os usuários têm user_id
- [ ] Criar índices no Firestore (opcional)

---

## 🔥 Troubleshooting

### Problema: `user_id` está null nos logs

**Solução:**
1. Verificar que `resolveUserIdentity()` não está retornando null
2. Verificar que webhook está passando `user_id` no metadata
3. Executar backfill script se dados antigos

### Problema: Logs não aparecem no Firestore

**Solução:**
1. Verificar que `journeyLogger.setFirestore(db)` foi chamado
2. Verificar permissões de Firestore write
3. Verificar que database não está offline

### Problema: Jornada não está sendo finalizada

**Solução:**
1. Chamar `await journeyLogger.finalizeJourney(correlationId)` em TODOS os paths (sucesso + erro)
2. Adicionar em catch blocks também

---

## 📚 Referência Rápida

```typescript
// Iniciar jornada COM user_id
journeyLogger.startJourney(correlationId, messageId);

// Log COM user_id e displayName
journeyLogger.logSuccess(
  correlationId,
  'webhook_received',
  'Mensagem recebida',
  {
    user_id: 'uuid-aqui',
    displayName: 'João Silva',
    customField: 'value',
  }
);

// Finalizar jornada (SEMPRE chamar!)
await journeyLogger.finalizeJourney(correlationId);
```

---

**Status:** ✅ Guia pronto para integração
