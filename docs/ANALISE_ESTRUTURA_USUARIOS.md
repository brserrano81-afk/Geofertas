# Análise: Estrutura de Usuários e Identidades - Geofertas

**Data:** 26 de Abril de 2026  
**Versão:** 1.0  
**Status:** Exploração Completa

---

## 📋 Sumário Executivo

O Geofertas utiliza uma **arquitetura multi-alias de resolução de identidade** onde usuários são identificados através de múltiplos canais (WhatsApp, Web) com IDs canônicos centralizados. **Não existe atualmente um campo `user_id` explícito** - a identificação depende de IDs construídos dinamicamente a partir de números de telefone ou UIDs com escopo de negócio (bsuid).

---

## 1️⃣ COMO USUÁRIOS SÃO IDENTIFICADOS ATUALMENTE

### Métodos de Identificação

```
┌─────────────────────────────────────────┐
│  IDENTIFICADORES DE USUÁRIO             │
├─────────────────────────────────────────┤
│                                         │
│  1. Phone-based ID:                     │
│     wa:55XXXXX9999                      │
│     └─ Extraído de remoteJid            │
│                                         │
│  2. Business-Scoped UID (bsuid):        │
│     bsuid:ABC123XYZ                     │
│     └─ Vem da API Evolution             │
│                                         │
│  3. Legacy RemoteJid:                   │
│     5511987654321@s.whatsapp.net        │
│     └─ Formato histórico do WhatsApp    │
│                                         │
│  4. Web Default:                        │
│     default_user                        │
│     └─ Usuários sem autenticação        │
│                                         │
└─────────────────────────────────────────┘
```

### Fluxo de Resolução de Identidade

```
Evento Webhook (Evolution API)
    ↓
    ├─ Extrai: remoteJid, bsuid
    └─ Normaliza: número de telefone
    ↓
    ├─ Busca em identity_aliases por bsuid?
    ├─ Busca em identity_aliases por phone?
    └─ Busca em identity_aliases por remoteJid?
    ↓
    ├─ SE ENCONTRAR: usa canonicalUserId
    └─ SE NÃO: gera novo:
       ├─ Tem bsuid? → "bsuid:ABC123XYZ"
       ├─ Tem phone? → "wa:5511987654321"
       └─ Senão → usa remoteJid como legacy
    ↓
    ├─ Salva em canonical_identities/{canonicalUserId}
    └─ Cria aliases em identity_aliases/
```

---

## 2️⃣ ESTRUTURA FIRESTORE - COLEÇÕES RELACIONADAS A USUÁRIOS

### Coleção Principal: `users/`

```
users/{userId}
├─ userId: "wa:5511987654321"        ← Pode ser ID canônico ou legacy
├─ canonicalUserId: "wa:5511987654321"
├─ legacyUserId: "55119...@s.whatsapp.net" (se migrado)
├─ storageUserId: "wa:5511987654321" ← Onde o doc está realmente armazenado
├─
├─ remoteJid: "5511987654321@s.whatsapp.net"
├─ phoneNumber: "5511987654321"
├─ bsuid: "ABC123XYZ" (ou null)
├─ channel: "whatsapp" | "web"
├─
├─ name: string
├─ neighborhood: string
├─ transportMode: string
├─ consumption: number
├─ preferences: {...nested object...}
├─ lastMessagePreview: string
├─ lastIntent: string
├─ interactionCount: number
├─
├─ createdAt: timestamp
├─ updatedAt: timestamp
│
└─ Subcoleções:
    ├─ interactions/{docId}
    │  ├─ role: "user" | "assistant"
    │  ├─ content: string (full message)
    │  ├─ contentPreview: string (80 chars max)
    │  ├─ intent: string
    │  └─ createdAt: timestamp
    │
    ├─ purchases/{docId}
    │  └─ (registros de compras)
    │
    └─ lists/{docId}
       ├─ name: string
       ├─ status: "active" | "archived"
       ├─ items: array
       └─ updatedAt: timestamp
```

### Coleção: `canonical_identities/`

**Propósito:** Mapear identidades fragmentadas para IDs canônicos únicos

```
canonical_identities/{canonicalUserId}
├─ canonicalUserId: "wa:5511987654321"    ← PRIMARY KEY
├─ storageUserId: "wa:5511987654321"      ← Onde users/ realmente armazena
├─ legacyUserId: "55119...@s.whatsapp.net" (histórico)
├─
├─ remoteJid: "5511987654321@s.whatsapp.net"
├─ phoneNumber: "5511987654321"
├─ bsuid: "ABC123XYZ"
├─ channel: "whatsapp"
├─
├─ resolutionSource: "bsuid_alias"        ← Como foi resolvido
│                  | "phone_alias"
│                  | "remote_jid_alias"
│                  | "bsuid_generated"
│                  | "phone_generated"
│                  | "legacy_passthrough"
├─
├─ requiresBackfill: boolean               ← Precisa migração de legacy?
├─ aliases: ["phone:5511987654321", ...]  ← Chaves em identity_aliases
├─
├─ createdAt: timestamp
└─ updatedAt: timestamp
```

### Coleção: `identity_aliases/` ⭐

**Propósito:** Índice O(1) para lookups rápidos durante webhook processing

```
identity_aliases/{aliasKey}
├─ Chaves possíveis:
│  ├─ "phone:5511987654321"
│  ├─ "remote_jid:5511987654321@s.whatsapp.net"
│  └─ "bsuid:ABC123XYZ"
│
├─ canonicalUserId: "wa:5511987654321"    ← FOREIGN KEY
├─ storageUserId: "wa:5511987654321"
├─ legacyUserId: "..."
├─ remoteJid: "5511987654321@s.whatsapp.net"
├─ phoneNumber: "5511987654321"
├─ bsuid: "ABC123XYZ"
├─ channel: "whatsapp"
├─
├─ createdAt: timestamp
└─ updatedAt: timestamp
```

---

## 3️⃣ COMO remoteJid É USADO ATUALMENTE

### Formato WhatsApp JID

```
remoteJid = "{phoneNumber}@s.whatsapp.net"

Exemplo:
  remoteJid = "5511987654321@s.whatsapp.net"
  phoneNumber = "5511987654321"
  
Normalização automática:
  Entrada: "11987654321" → Saída: "5511987654321@s.whatsapp.net"
  (Prepende código BR "55" se necessário)
```

### Pontos de Uso

| Local | Propósito | Campo |
|-------|-----------|-------|
| **message_inbox** | Rastrear origem | `remoteJid` |
| **message_outbox** | Enviar resposta | `remoteJid` |
| **users/** | Mapear telefone | `remoteJid` |
| **canonical_identities** | Resolver identidade | `remoteJid` |
| **identity_aliases** | Lookup rápido | `remoteJid` (como chave) |
| **integration_events** | Auditoria/rastreamento | `remoteJid` (mascarado) |

### Mascaramento LGPD

```javascript
function maskPhone(phone) {
    // "5511987654321" → "551198***4321"
    const digits = phone.replace(/\D/g, '');
    const prefix = digits.slice(0, 6);
    const suffix = digits.slice(-4);
    const masked = '*'.repeat(digits.length - 10);
    return `${prefix}${masked}${suffix}`;
}
```

---

## 4️⃣ WEBHOOK IMPLEMENTATION (api/sefaz-proxy.js)

### Fluxo Completo de Processamento

```
POST /webhook/evolution
    ↓ normalizeEvolutionEvent()
    ├─ Extrai do payload:
    │  ├─ remoteJid = "5511987654321@s.whatsapp.net"
    │  ├─ bsuid = payload.bsuid (Business-Scoped UID)
    │  ├─ messageId = key.id (Evolution msg ID)
    │  ├─ messageType = "audioMessage" | "conversation" | etc.
    │  └─ text = mensagem do usuário
    ↓
    ├─ resolveCanonicalIdentity()
    │  ├─ Tenta encontrar em identity_aliases:
    │  │  ├─ aliasKey = "bsuid:ABC123XYZ" → canonicalUserId?
    │  │  ├─ aliasKey = "phone:5511987654321" → canonicalUserId?
    │  │  └─ aliasKey = "remote_jid:55119...@s.whatsapp.net" → canonicalUserId?
    │  └─ Se não encontrar: gera novo com buildCanonicalUserId()
    ↓
    ├─ persistIdentity()
    │  ├─ Escreve canonical_identities/{canonicalUserId}
    │  └─ Cria entries em identity_aliases/[todos os alias keys]
    ↓
    ├─ enqueueInboundMessage()
    │  └─ Escreve message_inbox/{messageId} com IDs canônicos
    │     ├─ userId: canonicalUserId
    │     ├─ storageUserId: onde realmente armazenar
    │     ├─ legacyUserId: histórico
    │     └─ bsuid: Business-scoped UID
    ↓
    └─ persistPipelineAudit()
       └─ Escreve integration_events/{docId} para rastreamento
```

### Estrutura de integration_events

```javascript
// Cada webhook é registrado em integration_events para auditoria:
{
    kind: "pipeline_audit",
    source: "evolution",
    correlationId: "unique-trace-id-xyz",
    messageId: "msg-12345",
    event: "messages.upsert",          // Tipo de evento Evolution
    instance: "instance-name-123",     // Instância Evolution
    
    // Identificadores (TUDO salvo para rastreamento):
    remoteJid: "5511987654321@s.whatsapp.net",
    userId: "wa:5511987654321",
    storageUserId: "wa:5511987654321",
    legacyUserId: "5511987654321@s.whatsapp.net",
    bsuid: "ABC123XYZ",
    
    // Metadados da mensagem:
    direction: "inbound",
    messageType: "audioMessage",
    textPreview: "primeiros 160 caracteres...",
    
    // Timestamps:
    createdAtIso: "2026-04-26T10:30:00Z",
    createdAt: Timestamp.now(),
}

// Índice: (kind, createdAt DESC)
// Uso: debugging, compliance, tracing
```

---

## 5️⃣ WORKER IMPLEMENTATION (src/workers/EvolutionInboxWorker.ts)

### Como o Worker Identifica Usuários

```typescript
// 1. Worker busca mensagens no message_inbox
const query = db.collection('message_inbox')
    .where('status', '==', 'pending');

// 2. Cada documento em message_inbox JÁ contém os IDs:
const message = {...};
message.userId              // ID canônico (ou legacy)
message.storageUserId       // Onde realmente armazenar dados
message.legacyUserId        // Referência histórica
message.bsuid               // Business-scoped ID
message.remoteJid           // WhatsApp JID para responder

// 3. Worker resolve a identidade completa:
const identity = await identityResolutionService
    .getIdentitySnapshot(message.userId);

// 4. Encontra compatível UserIds para leitura:
const compatibleUserIds = [
    identity.canonicalUserId,
    identity.storageUserId,
    identity.legacyUserId,
].filter(Boolean);

// 5. Lê dados do usuário de locais compatíveis:
let userProfile;
for (const userId of compatibleUserIds) {
    const snap = await db.collection('users').doc(userId).get();
    if (snap.exists) {
        userProfile = snap.data();
        break;
    }
}

// 6. Busca interações recentes:
const interactions = await db.collection('users')
    .doc(userProfile.userId)
    .collection('interactions')
    .orderBy('createdAt', 'desc')
    .limit(8)
    .get();
```

### Escrita de Dados do Usuário

```typescript
// Escreve para TODOS os locais compatíveis:
const writeUserIds = [
    identity.canonicalUserId,
    identity.storageUserId,
].filter(Boolean);

for (const userId of writeUserIds) {
    // Nova interação (subcoleção)
    await db.collection('users')
        .doc(userId)
        .collection('interactions')
        .add({
            role: 'user' | 'assistant',
            content: messageText,
            contentPreview: messageText.slice(0, 80),
            intent: detectadoIntent,
            createdAt: serverTimestamp(),
        });

    // Atualiza metadata do usuário
    await db.collection('users').doc(userId).set({
        userId: identity.canonicalUserId,
        canonicalUserId: identity.canonicalUserId,
        legacyUserId: identity.legacyUserId,
        storageUserId: identity.storageUserId,
        remoteJid: identity.remoteJid,
        lastInteractionAt: serverTimestamp(),
        interactionCount: nextCount,
        lastMessagePreview: messageText.slice(0, 160),
    }, { merge: true });
}
```

---

## 6️⃣ DIAGRAMAS DE RELACIONAMENTO

### Fluxo de Dados Completo

```
┌────────────────────────────────────────────────────────────────┐
│                    WEBHOOK (Evolution API)                     │
│  remoteJid="5511987654321@s.whatsapp.net"                      │
│  bsuid="ABC123XYZ"                                             │
│  messageId="msg-12345"                                         │
└────────────────────────┬───────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────────────┐
        │  RESOLVE IDENTITY (api/sefaz-proxy)    │
        └────────────────────┬───────────────────┘
                             │
                ┌────────────▼────────────┐
                │  identity_aliases/    │
                │  lookup:              │
                │  "phone:55119..."     │
                │  "bsuid:ABC123"       │
                │  "remote_jid:55119"   │
                └────────────┬───────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │  Found? → Use canonicalUserId          │
        │  Not found? → Generate new             │
        └────────────┬───────────────────────────┘
                     │
         ┌───────────▼─────────────┐
         │ canonical_identities/   │ ← PERSIST IDENTITY
         │ {canonicalUserId}       │   com relacionamentos
         └───────────┬─────────────┘
                     │
    ┌────────────────▼────────────────┐
    │ identity_aliases/ (CREATE)      │ ← CRIAR ALIASES
    │ "phone:5511987654321" →         │   para lookups futuros
    │   canonicalUserId               │
    └────────────────┬────────────────┘
                     │
    ┌────────────────▼────────────────┐
    │ message_inbox/{messageId}       │ ← FILA MENSAGEM
    │ ├─ userId: canonicalUserId      │   com IDs completos
    │ ├─ storageUserId: ...           │
    │ ├─ remoteJid: "55119...@s..."   │
    │ └─ bsuid: "ABC123XYZ"           │
    └────────────────┬────────────────┘
                     │
    ┌────────────────▼────────────────┐
    │ integration_events/ (AUDIT)     │ ← LOG AUDITORIA
    │ ├─ kind: "pipeline_audit"       │   com traces
    │ ├─ correlationId: "..."         │
    │ └─ [todos os IDs]               │
    └────────────────────────────────┘
                     │
                     │ (Pulled by EvolutionInboxWorker)
                     ▼
    ┌────────────────────────────────┐
    │ users/{storageUserId}          │ ← READ PROFILE
    │ ├─ name: string                │
    │ ├─ neighborhood: string        │
    │ ├─ preferences: {...}          │
    │ └─ interactions/{docId} SUB... │
    └────────────────┬───────────────┘
                     │
                     ├─ ChatService processes message
                     │
                     ▼
    ┌────────────────────────────────┐
    │ users/{storageUserId}/         │ ← WRITE INTERACTION
    │   interactions/{docId}         │
    └────────────────────────────────┘
```

---

## 7️⃣ GAPS IDENTIFICADOS

### Problemas Atuais

| Item | Status | Impacto |
|------|--------|--------|
| **Sem user_id explícito** | ❌ | Difícil para APIs/integrações externas |
| **userIds construídos dinamicamente** | ⚠️ | Instáveis se formato mudar |
| **Sem campo user.status** | ❌ | Impossível marcar usuários deletados/inativos |
| **Sem timestamp de criação de account** | ⚠️ | Existe mas só internamente |
| **Sem merge de contas cross-channel** | ❌ | Se usuário usar WhatsApp + Web, cria 2 docs |

### Recomendações de Migração

```javascript
// ADICIONAR aos users/:
{
    userId: "wa:5511987654321",              // EXISTE
    user_id: "550e8400-e29b-41d4-a716...",  // ✅ ADD: UUID v4
    user_status: "active" | "deleted",       // ✅ ADD: Status
    created_at_unix: 1703068400000,          // ✅ ADD: Timestamp numérico
    // ... resto dos campos
}

// ADICIONAR aos canonical_identities/:
{
    canonicalUserId: "wa:5511987654321",
    user_id: "550e8400-e29b-41d4-a716...",  // ✅ ADD: Back-reference
    // ... resto
}

// ADICIONAR aos identity_aliases/:
{
    // chave = "phone:5511987654321"
    canonicalUserId: "wa:5511987654321",
    user_id: "550e8400-e29b-41d4-a716...",  // ✅ ADD: Para reverse lookup
    // ... resto
}
```

---

## 8️⃣ ANALYTICS & COMPLIANCE (LGPD)

### Coleção: `integration_events/` - Completo com PII

```javascript
// Rastreamento COMPLETO (fins de auditoria):
integration_events/{docId} {
    kind: "pipeline_audit",
    source: "evolution",
    remoteJid: "5511987654321@s.whatsapp.net",
    userId: "wa:5511987654321",
    bsuid: "ABC123XYZ",
    textPreview: "primeiros 160 caracteres...",
    // ... todos os campos para debug
}

// USO: Rastreamento de auditoria, debugging, compliance
// RETENÇÃO: ~90 dias (conforme JOURNEY_LOGGER_README)
// ACESSO: Apenas backend, LOG MASCARADO no console
```

### Coleção: `analytics_events/` - ZERO PII ✅

```javascript
// SEM userId campo:
analytics_events/{docId} {
    eventType: "purchase_recorded",
    marketId: "market_123",              // ✅ Referência apenas
    marketRegion: "centro",              // ✅ Slug de bairro (≥1 km²)
    categorySlug: "frutas",              // ✅ Categoria
    pricePoint: 12.50,
    basketSize: 5,
    totalAmount: 62.50,
    weekday: 5,                          // ✅ Dia da semana (não data)
    hour: 14,                            // ✅ Hora do dia (não timestamp)
    createdAt: Timestamp.now(),
    // ❌ NUNCA: userId, name, phone, coordinates, address exato
}
```

### Coleção: `user_aggregates/` - Agregados por Período

```javascript
// userId PODE ser usado como chave (para período):
user_aggregates/{userId} {
    periodStart: "2026-04-01",
    periodEnd: "2026-04-30",
    purchaseCount: 12,
    totalSpent: 450.75,
    averageTicket: 37.56,
    topCategories: ["frutas", "mercearia", "acougue"],
    topMarketIds: ["market_001", "market_003"],
    basketAvgSize: 8.3,
    estimatedSavings: 125.00,
    // ❌ NUNCA: name, phone, coordinates
}
```

---

## 9️⃣ TABELA RESUMIDA: TODOS OS CAMPOS & COLEÇÕES

| Campo | users/ | canonical_identities | message_inbox | integration_events | Propósito |
|-------|--------|----------------------|----------------|-------------------|-----------|
| **userId** | ✅ Chave | - | ✅ | ✅ | ID primário (canônico ou legacy) |
| **canonicalUserId** | ✅ | ✅ | ✅ | ✅ | ID canônico unificado |
| **legacyUserId** | ✅ | ✅ | ✅ | ✅ | Referência histórica (migração) |
| **storageUserId** | ✅ | ✅ | ✅ | ✅ | Localização real do documento |
| **remoteJid** | ✅ | ✅ | ✅ | ✅ (mascarado) | WhatsApp JID |
| **phoneNumber** | ✅ | ✅ | - | - | Telefone extraído |
| **bsuid** | ✅ | ✅ | ✅ | ✅ | Business-Scoped UID (Evolution) |
| **channel** | ✅ | ✅ | - | - | "whatsapp" \| "web" |
| **resolutionSource** | - | ✅ | - | - | Como foi resolvido |
| **requiresBackfill** | - | ✅ | - | - | Precisa migração? |
| **createdAt** | ✅ | ✅ | ✅ | ✅ | Timestamp de criação |
| **updatedAt** | ✅ | ✅ | - | ✅ | Timestamp de atualização |

---

## 🔟 CONCLUSÃO & PRÓXIMOS PASSOS

### Status Atual ✅

- ✅ Sistema de identidade multi-alias funcionando
- ✅ Resolução de identidade rápida via aliases
- ✅ Rastreamento completo via integration_events
- ✅ Webchat e WhatsApp integrados
- ✅ Compliance LGPD para analytics

### Melhorias Recomendadas

1. **Adicionar `user_id` UUID** para APIs externas
2. **Adicionar `user_status`** field para deletions
3. **Criar backfill script** para existing users
4. **Documentar merge strategy** para contas cross-channel
5. **Adicionar índices** em `users/` para busca por phoneNumber

### Arquivos-Chave para Revisão

- [IdentityResolutionService.ts](../../src/services/IdentityResolutionService.ts)
- [api/sefaz-proxy.js](../../api/sefaz-proxy.js) - Webhook
- [EvolutionInboxWorker.ts](../../src/workers/EvolutionInboxWorker.ts) - Worker
- [firestore.rules](../../firestore.rules) - Segurança
- [firestore.indexes.json](../../firestore.indexes.json) - Índices

---

**Documento preparado por:** Analista  
**Última atualização:** 26/04/2026  
**Próxima revisão:** Após implementação de user_id UUID
