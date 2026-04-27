# 📊 RESUMO EXECUTIVO - Estrutura de Usuários Geofertas

**Preparado em:** 26 de Abril de 2026  
**Versão:** 1.0  
**Tempo de exploração:** Completo

---

## ⚡ Resposta Rápida às Perguntas

### ❓ 1. Como usuários são identificados atualmente?

**Resposta:** 3 métodos (selecionados conforme disponibilidade):

| Método | Formato | Situação |
|--------|---------|----------|
| **Phone + WhatsApp** | `wa:5511987654321` | ✅ Principal (extraído de remoteJid) |
| **Business-Scoped UID** | `bsuid:ABC123XYZ` | ✅ Secundário (da API Evolution) |
| **Legacy Remote JID** | `5511987654321@s.whatsapp.net` | ⚠️ Histórico (users migrados) |

**⚠️ Detalhe importante:** Não existe campo `user_id` explícito. Os IDs são **construídos dinamicamente** e armazenados em `userId` ou `canonicalUserId`.

---

### ❓ 2. Coleções/schemas no Firestore relacionadas a usuários?

**Resposta:** 7 coleções principais:

| # | Coleção | Propósito | Chave Primária | Relacionamentos |
|---|---------|----------|---|--|
| 1 | **users/** | Perfil de usuário | `userId` | ← canonical_identities |
| 2 | **canonical_identities/** | Mapa de identidades | `canonicalUserId` | → users/, identity_aliases |
| 3 | **identity_aliases/** | Índice de lookups rápidos | `aliasKey` | → canonical_identities |
| 4 | **message_inbox/** | Fila de mensagens inbound | `messageId` | → users/, message_outbox |
| 5 | **message_outbox/** | Fila de mensagens outbound | `docId` | ← message_inbox |
| 6 | **integration_events/** | Auditoria de webhooks | `docId` | (denormalizado) |
| 7 | **analytics_events/** | Eventos de negócio (LGPD) | `eventId` | → user_aggregates |
| 8 | **user_aggregates/** | Agregados por período/user | `userId` | ← analytics_events |

**Subcoleções em users/{userId}:**
- `interactions/` - Mensagens do chat
- `purchases/` - Histórico de compras
- `lists/` - Listas de compras salvas

---

### ❓ 3. Como o remoteJid é atualmente usado?

**Resposta:** Em 6 pontos-chave:

```
remoteJid = "{phoneNumber}@s.whatsapp.net"
Exemplo: "5511987654321@s.whatsapp.net"
```

| Local | Campo | Uso | Mascarado? |
|-------|-------|-----|-----------|
| **users/** | `remoteJid` | Armazenar mapeamento telefone→user | Não |
| **message_inbox** | `remoteJid` | Rastrear origem da mensagem | Não |
| **message_outbox** | `remoteJid` | Enviar resposta ao user | Não |
| **canonical_identities** | `remoteJid` | Resolver identidades | Não |
| **identity_aliases** | (chave) | Lookup O(1) `remote_jid:55119...` | Não |
| **integration_events** | `remoteJid` | Auditoria de webhook | ✅ Sim (logs console) |

**Normalização automática:**
```
Entrada: "11987654321" 
→ Normaliza: "5511987654321"
→ Formata: "5511987654321@s.whatsapp.net"
```

---

### ❓ 4. Existe tabela/coleção de users ou profiles?

**Resposta:** SIM, e com muita profundidade:

```
users/{userId}
├─ Campos de identidade (OBRIGATÓRIO)
│  ├─ userId: string (PK)
│  ├─ canonicalUserId: string
│  ├─ remoteJid: string
│  ├─ bsuid: string (nullable)
│  ├─ phoneNumber: string (nullable)
│  └─ channel: "whatsapp" | "web"
│
├─ Perfil (PREENCHIDO GRADUALMENTE)
│  ├─ name: string
│  ├─ neighborhood: string (bairro)
│  ├─ transportMode: string (carro/ônibus)
│  ├─ consumption: number (km/l)
│  ├─ busTicket: number
│  └─ preferences: {...nested object...}
│
├─ Engagement (ATUALIZADO A CADA MENSAGEM)
│  ├─ lastInteractionAt: timestamp
│  ├─ lastMessagePreview: string
│  ├─ lastIntent: string
│  ├─ interactionCount: number
│  └─ createdAt: timestamp
│
└─ Subcoleções (DADO RELACIONADO)
   ├─ interactions/{docId}
   │  └─ { role, content, intent, createdAt }
   │
   ├─ purchases/{docId}
   │  └─ { itemId, price, purchasedAt, marketId, ... }
   │
   └─ lists/{docId}
      └─ { name, status, items[], updatedAt }
```

**Tamanho típico:** ~50-100 KB por user (sem histórico)

---

### ❓ 5. Como estão estruturados os integration_events logs?

**Resposta:** Auditoria completa + rastreamento:

```javascript
integration_events/{docId}
{
    // Classificação
    kind: "pipeline_audit",
    source: "evolution",
    
    // Rastreamento
    correlationId: "unique_trace_id",
    messageId: "msg_id_xyz",
    
    // Origem do evento
    event: "messages.upsert",
    instance: "evolution_instance_1",
    
    // Identificadores (TODOS armazenados para debug)
    remoteJid: "5511987654321@s.whatsapp.net",
    userId: "wa:5511987654321",
    storageUserId: "wa:5511987654321",
    legacyUserId: "5511987654321@s.whatsapp.net",
    bsuid: "ABC123XYZ",
    
    // Metadados
    direction: "inbound",
    messageType: "audioMessage",
    textPreview: "primeiros 160 caracteres...",
    
    // Timestamps
    createdAtIso: "2026-04-26T10:30:00Z",
    createdAt: Timestamp.now(),
}

// Indexado em: (kind, createdAt DESC)
// Retenção: ~90 dias
// Uso: Debugging, compliance, rastreamento
```

---

### ❓ 6. Webhook Implementation - Como identifica usuário?

**Resposta:** 4 passos no `api/sefaz-proxy.js`:

**PASSO 1: Extrair**
```javascript
const remoteJid = payload.remoteJid;      // "5511987654321@s.whatsapp.net"
const bsuid = payload.bsuid;               // "ABC123XYZ"
```

**PASSO 2: Normalizar**
```javascript
const normalized_jid = normalizeRemoteJid(remoteJid);
const phone = extractPhoneNumber(normalized_jid);  // "5511987654321"
const normalized_bsuid = normalizeBsuid(bsuid);
```

**PASSO 3: Resolver**
```javascript
// Tenta encontrar em identity_aliases:
aliasKey = `phone:${phone}`;  // "phone:5511987654321"
const target = await readAliasTarget(aliasKey);
if (target) {
    canonicalUserId = target;  // Usuário já existe!
} else {
    // Gera novo:
    canonicalUserId = `wa:${phone}`;  // "wa:5511987654321"
}
```

**PASSO 4: Persistir**
```javascript
// Escreve mapping
await db.collection('canonical_identities').doc(canonicalUserId).set({...});
await db.collection('identity_aliases').doc(aliasKey).set({
    canonicalUserId: canonicalUserId,
    ...
});

// Fila mensagem
await db.collection('message_inbox').doc(messageId).set({
    userId: canonicalUserId,
    remoteJid: normalized_jid,
    bsuid: bsuid,
    ...
});
```

**⏱️ Performance:** Lookup é O(1) via Firestore document access

---

### ❓ 7. Worker Implementation - Como identifica usuário?

**Resposta:** 3 passos no `src/workers/EvolutionInboxWorker.ts`:

**PASSO 1: Buscar mensagem**
```typescript
const message = await db.collection('message_inbox')
    .where('status', '==', 'pending')
    .limit(1)
    .get();

// Message já contém IDs:
message.data().userId           // "wa:5511987654321"
message.data().storageUserId    // Onde realmente está
message.data().remoteJid        // Para responder
```

**PASSO 2: Resolver identidade completa**
```typescript
const identity = await identityResolutionService.getIdentitySnapshot(
    message.data().userId
);

// Retorna:
{
    canonicalUserId: "wa:5511987654321",
    storageUserId: "wa:5511987654321",
    legacyUserId: "5511987654321@s.whatsapp.net",
    remoteJid: "5511987654321@s.whatsapp.net",
    bsuid: "ABC123XYZ",
    channel: "whatsapp",
    ...
}
```

**PASSO 3: Ler perfil do usuário**
```typescript
// Tenta locais compatíveis (em ordem):
const compatibleUserIds = [
    identity.canonicalUserId,
    identity.storageUserId,
    identity.legacyUserId,
].filter(Boolean);

let userProfile;
for (const userId of compatibleUserIds) {
    const snap = await db.collection('users').doc(userId).get();
    if (snap.exists) {
        userProfile = snap.data();
        break;
    }
}

// Busca interações recentes:
const interactions = await db.collection('users')
    .doc(userProfile.userId)
    .collection('interactions')
    .orderBy('createdAt', 'desc')
    .limit(8)
    .get();
```

**PASSO 4: Processa e escreve resposta**
```typescript
// ChatService processa com o contexto do usuário
const response = await chatService.chat(
    userProfile,
    interactions,
    messageText
);

// Escreve interação em TODOS os locais compatíveis
for (const userId of compatibleUserIds) {
    await db.collection('users')
        .doc(userId)
        .collection('interactions')
        .add({
            role: 'assistant',
            content: response.text,
            createdAt: serverTimestamp(),
        });
}

// Fila mensagem outbound
await db.collection('message_outbox').add({
    inboxId: message.id,
    userId: userProfile.userId,
    remoteJid: message.data().remoteJid,
    text: response.text,
    sendStatus: 'pending_send',
});
```

---

## 📋 CHECKLIST: Estrutura de Dados

- [x] **users/** collection com perfil + subcoleções (interactions/purchases/lists)
- [x] **canonical_identities/** para mapear identidades fragmentadas
- [x] **identity_aliases/** para lookups O(1) por phone/bsuid/remoteJid
- [x] **message_inbox/** para fila de processamento com user IDs
- [x] **message_outbox/** para mensagens a enviar
- [x] **integration_events/** para auditoria de webhooks
- [x] **analytics_events/** para eventos sem PII
- [x] **user_aggregates/** para estatísticas por período
- [x] Relacionamentos via foregin keys denormalizados
- [x] Índices Firestore para queries principais

---

## 🔴 GAPS CRÍTICOS ENCONTRADOS

| # | Gap | Impacto | Prioridade |
|---|-----|--------|-----------|
| 1 | **Sem `user_id` UUID explícito** | Impossível usar em APIs externas | 🔴 ALTA |
| 2 | **Sem `user.status` field** | Não há forma de marcar deleted/inactive | 🔴 ALTA |
| 3 | **IDs construídos dinamicamente** | Se formato mudar, quebra tudo | 🟠 MÉDIA |
| 4 | **Sem merge cross-channel** | Usuário WhatsApp + Web = 2 docs | 🟠 MÉDIA |
| 5 | **Sem índice em phoneNumber** | Buscas por telefone lentas | 🟡 BAIXA |

---

## ✅ RECOMENDAÇÕES DE MIGRAÇÃO

### Adicionar campo `user_id` (UUID v4)

**Em `users/{userId}`:**
```javascript
{
    userId: "wa:5511987654321",                    // Mantém (construído)
    user_id: "550e8400-e29b-41d4-a716-446655440000", // ✅ NOVO
    user_status: "active" | "deleted",             // ✅ NOVO
    created_at_unix: 1703068400000,                // ✅ NOVO
    // ... resto dos campos
}
```

**Em `canonical_identities/{canonicalUserId}`:**
```javascript
{
    canonicalUserId: "wa:5511987654321",
    user_id: "550e8400-e29b-41d4-a716-446655440000", // ✅ NOVO (back-ref)
    // ... resto
}
```

**Em `identity_aliases/{aliasKey}`:**
```javascript
{
    canonicalUserId: "wa:5511987654321",
    user_id: "550e8400-e29b-41d4-a716-446655440000", // ✅ NOVO (reverse lookup)
    // ... resto
}
```

### Etapas de Implementação

1. **Criar script de migração** para gerar `user_id` UUID em users/ existentes
2. **Atualizar IdentityResolutionService** para gerar UUID ao criar novo user
3. **Adicionar índice** em `user_id` para buscas rápidas
4. **Backfill** de `user_id` em canonical_identities e identity_aliases
5. **Atualizar APIs externas** para usar `user_id` ao invés de `userId`

---

## 📚 ARQUIVOS-CHAVE PARA REVISÃO

| Arquivo | Tipo | Responsabilidade |
|---------|------|------------------|
| [src/types/identity.ts](../src/types/identity.ts) | TypeScript | Interface CanonicalIdentity |
| [src/services/IdentityResolutionService.ts](../src/services/IdentityResolutionService.ts) | TypeScript | Resolução de identidades |
| [api/sefaz-proxy.js](../api/sefaz-proxy.js) | JavaScript | Webhook + primeira resolução |
| [src/workers/EvolutionInboxWorker.ts](../src/workers/EvolutionInboxWorker.ts) | TypeScript | Processamento de mensagens |
| [firestore.rules](../firestore.rules) | Firestore | Segurança (atualmente bloqueada) |
| [firestore.indexes.json](../firestore.indexes.json) | JSON | Índices de consulta |

---

## 🔐 Compliance LGPD

### ✅ Correto (analytics_events)

```javascript
analytics_events/{docId} {
    eventType: "purchase_recorded",
    marketRegion: "centro",        // ✅ Apenas slug
    categorySlug: "frutas",        // ✅ Categoria
    weekday: 5,                    // ✅ Dia da semana (0-6)
    hour: 14,                      // ✅ Hora do dia (0-23)
    // userId NÃO incluído
}

user_aggregates/{userId} {
    // userId PODE ser chave (para agregar período)
    // Mas sem PII nos campos
    topCategories: ["frutas", "mercearia"],
    totalSpent: 450.75,
}
```

### ❌ Nunca Fazer

```javascript
analytics_events/{docId} {
    userId: "wa:5511987654321",     // ❌ ERRADO
    name: "João",                   // ❌ ERRADO
    phone: "11987654321",           // ❌ ERRADO
    latitude: -23.5505,             // ❌ ERRADO
    address: "Rua X, número Y",    // ❌ ERRADO
}
```

---

## 🎯 Conclusão

A arquitetura de identidade do Geofertas é **sólida e bem-estruturada**, com:

✅ Sistema multi-alias funcionando  
✅ Resolução rápida de identidades  
✅ Rastreamento completo via integration_events  
✅ Compliance LGPD para analytics  

⚠️ Mas precisa:

- [ ] Adicionar `user_id` UUID explícito
- [ ] Adicionar `user_status` field
- [ ] Criar backfill script
- [ ] Documentar merge strategy cross-channel
- [ ] Adicionar índices adicionais

---

**Próximo passo:** Revisar documento detalhado em `ANALISE_ESTRUTURA_USUARIOS.md`

---

*Documento preparado: 26/04/2026*  
*Status: Análise Completa ✅*  
*Próxima revisão: Após implementação de user_id UUID*
