# 🎯 Plano de Implementação - User ID Único + JourneyLogger Integrado

**Data:** 26 de Abril de 2026  
**Objetivo:** Criar login único por usuário (não telefone) + Integrar com JourneyLogger para auditoria

---

## 📋 Resumo Executivo

**Problema:**
- Usuários identificados por telefone (frágil, pode mudar)
- Novos requerimentos BSUID do META
- Logs de erros sem identificação clara do usuário
- Impossível "buscar usuário no dashboard"

**Solução:**
- Criar `user_id` UUID único (não muda nunca)
- Ligar a identificador humano (nome, email)
- Modificar JourneyLogger para rastrear por `user_id`
- Criar queries para buscar usuário em logs/dashboard

---

## 🏗️ Arquitetura

### Fluxo Atual (Problema)
```
WhatsApp (5527998862440)
    ↓
remoteJid (5527998862440@s.whatsapp.net)
    ↓
identity_aliases lookup
    ↓
canonical userId
    ↓
JourneyLogger.logStage(correlationId, ...)
    ↓
integration_events (sem user_id único)
    ↓
❌ Impossível buscar "mostre logs deste usuário"
```

### Fluxo Novo (Solução)
```
WhatsApp (5527998862440)
    ↓
remoteJid → identity_aliases lookup
    ↓
canonical userId → user_id (UUID) + name
    ↓
JourneyLogger.logStage(correlationId, {user_id, userName})
    ↓
integration_events {
    user_id: "550e8400-e29b-41d4-a716-446655440000",
    userName: "João Silva",
    remoteJid: "5527998862440@s.whatsapp.net"
}
    ↓
✅ Query Firestore: WHERE user_id == UUID → todos os logs deste usuário
✅ Dashboard: "Procure por usuário" → busca em real-time
```

---

## 📊 Mudanças no Schema

### 1. Collection: `users/`

**NOVO:**
```javascript
{
    userId: "canonical_user_123",  // existing key
    user_id: "550e8400-e29b-41d4-a716-446655440000",  // ← NEW UUID
    user_status: "active",          // ← NEW ('active'|'suspended'|'deleted')
    
    // Human identification (obrigatório para buscar no dashboard)
    firstName: "João",              // ← NEW
    lastName: "Silva",              // ← NEW
    email: "joao@example.com",      // ← NEW (opcional)
    displayName: "João Silva",      // ← NEW (derivado)
    
    // Existing fields continuam
    createdAt: Timestamp,
    updatedAt: Timestamp,
    ...
}
```

### 2. Collection: `canonical_identities/`

**NOVO:**
```javascript
{
    canonicalUserId: "canonical_user_123",
    user_id: "550e8400-e29b-41d4-a716-446655440000",  // ← NEW
    user_status: "active",                             // ← NEW
    displayName: "João Silva",                        // ← NEW
    
    // Existing fields continuam
    identities: { whatsapp: "550e8400-e29b-41d4-a716-446655440000", ... },
    createdAt: Timestamp,
    ...
}
```

### 3. Collection: `integration_events/` (enhancement)

**Mudança em journey_stage:**
```javascript
{
    kind: "journey_stage",
    
    // Existing fields continuam
    correlationId: "abc123def456",
    stage: "webhook_received",
    timestamp: "2026-04-26T15:30:00.100Z",
    
    // NEW: User identification (único lugar para buscar)
    user_id: "550e8400-e29b-41d4-a716-446655440000",      // ← NEW UUID
    displayName: "João Silva",                             // ← NEW nome
    
    // Keep existing para compatibility
    remoteJid: "5527998862440@s.whatsapp.net",
    userId: "canonical_user_123",
}
```

**Mudança em journey_summary:**
```javascript
{
    kind: "journey_summary",
    
    // NEW fields
    user_id: "550e8400-e29b-41d4-a716-446655440000",      // ← NEW UUID
    displayName: "João Silva",                             // ← NEW nome
    
    // Existing fields continuam
    correlationId: "abc123def456",
    stages: [...]
}
```

---

## 🔧 Mudanças no Código

### Fase 1: Core Types (1-2 horas)

**1.1 Novo tipo: `UserIdentity.ts`**
```typescript
export interface UserIdentity {
    user_id: string;           // UUID v4
    userId: string;            // canonical key
    user_status: 'active' | 'suspended' | 'deleted' | 'anonymized';
    firstName: string;
    lastName: string;
    displayName: string;       // firstName + lastName
    email?: string;
    phone?: string;
    createdAt: Timestamp;
    createdAtUnix: number;
}
```

### Fase 2: IdentityResolutionService (2-3 horas)

**2.1 Adicionar geração de `user_id` UUID**
```typescript
import { v4 as uuidv4 } from 'uuid';

async resolveWhatsAppIdentity(params: {...}): Promise<UserIdentity> {
    // ... existing logic ...
    
    if (!existingUser) {
        const user_id = uuidv4();  // ← NOVO
        const userIdentity = await this.createUserIdentity({
            user_id,
            userId: canonicalUserId,
            firstName: extractedName || 'User',
            lastName: '',
            ...
        });
    }
}
```

### Fase 3: JourneyLogger Enhancement (2-3 horas)

**3.1 Modificar JourneyLoggerService**
```typescript
class JourneyLoggerService {
    private contexts: Map<correlationId, JourneyContext> = new Map();
}

interface JourneyContext {
    correlationId: string;
    
    // NEW fields
    user_id?: string;          // UUID único
    displayName?: string;      // Nome para dashboard
    
    // Existing fields
    messageId?: string;
    startTime: number;
    userId?: string;
    remoteJid?: string;
    ...
}

logStage(correlationId: string, stage: JourneyStage, {
    user_id,        // ← NEW parameter
    displayName,    // ← NEW parameter
    message,
    error,
    metadata,
}: LogStageParams): void {
    
    const context = this.contexts.get(correlationId);
    if (context && !context.user_id && user_id) {
        context.user_id = user_id;        // ← Armazenar no context
        context.displayName = displayName;
    }
}

private async persistToFirestore(entry: LogEntry, context: JourneyContext) {
    const stageDoc: any = {
        kind: 'journey_stage',
        ...
        // NEW: Add user identification
        user_id: context.user_id,           // ← UUID
        displayName: context.displayName,   // ← Nome
    };
    
    await this.db.collection('integration_events').add(stageDoc);
}
```

### Fase 4: Webhook Integration (2-3 horas)

**4.1 Modificar `api/sefaz-proxy.js`**
```javascript
app.post('/webhook/whatsapp-entrada', async (req, res) => {
    // ... existing normalization ...
    
    // NOVO: Resolver identidade completa
    const userIdentity = await identityService.resolveWhatsAppIdentity({
        remoteJid,
        bsuid
    });
    
    // NOVO: Iniciar journey com user_id
    await journeyLogger.startJourney(correlationId, messageId);
    await journeyLogger.logStage(correlationId, 'webhook_received', {
        user_id: userIdentity.user_id,           // ← NEW
        displayName: userIdentity.displayName,   // ← NEW
        message: `Webhook recebido`,
        metadata: { messageType: normalizedData.type }
    });
    
    // ... rest of logic ...
});
```

### Fase 5: Worker Integration (2-3 horas)

**5.1 Modificar `src/workers/EvolutionInboxWorker.ts`**
```typescript
async function processMessage(message, userIdentity) {
    
    // NOVO: Pegar user_id do message ou resolver
    const user_id = userIdentity.user_id;
    const displayName = userIdentity.displayName;
    
    await journeyLogger.logStage(correlationId, 'worker_started', {
        user_id,
        displayName,
        message: 'Worker iniciou'
    });
    
    // ... rest of logic ...
    
    await journeyLogger.logStage(correlationId, 'chat_service_called', {
        user_id,
        displayName,
        message: 'Chamando ChatService'
    });
}
```

### Fase 6: Dashboard Queries (1-2 horas)

**6.1 Criar `src/services/UserDashboardService.ts`**
```typescript
export class UserDashboardService {
    
    // Buscar todos os logs de um usuário
    async getUserJourney(user_id: string, options: {
        limit?: number;
        orderBy?: 'newest' | 'oldest';
    } = {}) {
        const query = this.db
            .collection('integration_events')
            .where('kind', '==', 'journey_summary')
            .where('user_id', '==', user_id)
            .orderBy('startedAtIso', options.orderBy === 'oldest' ? 'asc' : 'desc')
            .limit(options.limit || 50);
        
        return query.get();
    }
    
    // Buscar usuário por nome
    async searchUserByName(displayName: string, limit = 20) {
        // Buscar em users/ collection
        const query = this.db
            .collection('users')
            .where('displayName', '>=', displayName)
            .where('displayName', '<=', displayName + '\uf8ff')
            .limit(limit);
        
        return query.get();
    }
    
    // Buscar últimos erros de um usuário
    async getUserErrors(user_id: string, hours = 24) {
        const since = new Date(Date.now() - hours * 3600000).toISOString();
        
        const query = this.db
            .collection('integration_events')
            .where('user_id', '==', user_id)
            .where('kind', '==', 'journey_stage')
            .where('level', '==', 'error')
            .where('timestamp', '>=', since)
            .orderBy('timestamp', 'desc')
            .limit(50);
        
        return query.get();
    }
}
```

---

## 📝 Checklist de Implementação

### ✅ Fase 1: Setup (1 dia)
- [ ] Criar `src/types/UserIdentity.ts`
- [ ] Criar `src/services/UserDashboardService.ts`
- [ ] Adicionar `uuid` package em `package.json`
- [ ] Testes unitários para tipos

### ✅ Fase 2: Database (1-2 dias)
- [ ] Criar script de migração: `scripts/backfillUserId.ts`
- [ ] Executar migração em dev (Firestore emulator)
- [ ] Validar dados pós-migração
- [ ] Backup da base antiga

### ✅ Fase 3: Services (2-3 dias)
- [ ] Modificar IdentityResolutionService
- [ ] Modificar JourneyLogger
- [ ] Criar UserDashboardService
- [ ] Adicionar testes unitários

### ✅ Fase 4: Integration (2-3 dias)
- [ ] Integrar em webhook (api/sefaz-proxy.js)
- [ ] Integrar em worker
- [ ] Integrar em ChatService
- [ ] Testes end-to-end

### ✅ Fase 5: Dashboard (1-2 dias)
- [ ] Criar rota GET /api/users/{user_id}/logs
- [ ] Criar rota GET /api/users/search
- [ ] Criar rota GET /api/users/{user_id}/errors
- [ ] Frontend: componente de busca de usuário

### ✅ Fase 6: Testing & Deployment (1-2 dias)
- [ ] Testes em dev environment
- [ ] Testes em staging
- [ ] Load testing (Firestore queries)
- [ ] Deploy em produção

---

## 🚀 Benefícios

| Antes | Depois |
|-------|--------|
| ❌ "Qual logs deste usuário?" | ✅ `WHERE user_id == UUID` |
| ❌ "Usuário relata erro, busco como?" | ✅ Dashboard: Procure por nome |
| ❌ IDs frágeis (mudam com telefone) | ✅ UUIDs permanentes |
| ❌ Sem compliance BSUID META | ✅ Suporta BSUID + UUID + phone |
| ❌ Sem status de usuário | ✅ active/suspended/deleted/anonymized |
| ❌ Auditoria desconexa | ✅ Todos os logs em um lugar |

---

## 📅 Timeline Estimada

**Total: 10-14 dias** (desenvolvimento full-time)

- Dia 1-2: Setup + tipos
- Dia 3: Database migration
- Dia 4-6: Services + JourneyLogger
- Dia 7-8: Webhook + Worker integration
- Dia 9: Dashboard + API
- Dia 10-11: Testing
- Dia 12-14: Staging + Production deploy

---

## 🔗 Próximos Passos

1. **Ler:** `docs/RESUMO_USUARIOS_EXECUTIVO.md` (5 min)
2. **Ler:** `docs/ANALISE_ESTRUTURA_USUARIOS.md` (20 min)
3. **Começar Fase 1:** Criar tipos em `src/types/UserIdentity.ts`
4. **Começar Fase 2:** Script de backfill
5. **Começar Fase 3:** Modificar services

---

**Status:** ✅ Documentação pronta para implementação
