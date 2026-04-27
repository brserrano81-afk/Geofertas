# 🚀 QUICK REFERENCE - Geofertas User Identity

**One-page cheat sheet | Última atualização: 26/04/2026**

---

## 📍 User Identification Methods

```
┌─────────────────────────────────────────────────────┐
│ 1. PHONE-BASED        2. BUSINESS-SCOPED UID    3. LEGACY REMOTEJID  │
│ wa:5511987654321   │  bsuid:ABC123XYZ       │ 5511987654321@s...   │
│ ✅ Primary (common)   │  ✅ Secondary (Evolution) │ ⚠️ Historical      │
└─────────────────────────────────────────────────────┘
```

---

## 🏗️ Collections Map (8 Main)

```
USERS/ (Primary Storage)
├─ userId, canonicalUserId, legacyUserId
├─ remoteJid, phoneNumber, bsuid, channel
├─ name, neighborhood, preferences, interactionCount
└─ subcollections: interactions/, purchases/, lists/

CANONICAL_IDENTITIES/ (Identity Map)
├─ canonicalUserId (PRIMARY KEY)
├─ storageUserId, legacyUserId
├─ resolutionSource, requiresBackfill
└─ aliases: [phone:xxx, bsuid:xxx, remote_jid:xxx]

IDENTITY_ALIASES/ (Fast Index)
├─ aliasKey (PRIMARY KEY - "phone:xxx")
└─ canonicalUserId (FK)

MESSAGE_INBOX/ (Inbound Queue)
├─ messageId (PRIMARY KEY)
├─ userId, storageUserId, remoteJid, bsuid
└─ status: pending|processing|processed

MESSAGE_OUTBOX/ (Outbound Queue)
├─ docId (PRIMARY KEY)
├─ inboxId (FK), userId, remoteJid
└─ sendStatus: pending|retrying|sent|failed

INTEGRATION_EVENTS/ (Audit Trail)
├─ docId (PRIMARY KEY)
├─ kind, correlationId, messageId
├─ ALL IDs (userId, remoteJid, bsuid, etc)
└─ createdAt: timestamp

ANALYTICS_EVENTS/ (Business Events - ZERO PII)
├─ eventId (PRIMARY KEY)
├─ eventType, marketId, marketRegion, categorySlug
├─ weekday, hour (NOT userId or PII)
└─ createdAt: timestamp

USER_AGGREGATES/ (Per-Period Stats)
├─ userId (PRIMARY KEY)
├─ periodStart, periodEnd
├─ purchaseCount, totalSpent, topCategories
└─ NO PII FIELDS
```

---

## 🔀 How remoteJid Works

```
remoteJid FORMAT:
"5511987654321@s.whatsapp.net"
 └─ phone      └─ WhatsApp server identifier

NORMALIZATION:
  Input: "11987654321" → Output: "5511987654321@s.whatsapp.net"
  (Auto-prepends "+55" for Brazil)

WHERE IT'S USED:
  ✅ users/ {remoteJid}
  ✅ message_inbox {remoteJid}
  ✅ message_outbox {remoteJid}
  ✅ canonical_identities {remoteJid}
  ✅ identity_aliases KEY: "remote_jid:5511987654321@s..."
  ✅ integration_events {remoteJid} (MASKED in logs)
```

---

## 🔄 Identity Resolution Flow

```
WEBHOOK → normalizeEvolutionEvent()
   ↓
   Extract: remoteJid, bsuid, messageId
   ↓
resolveCanonicalIdentity()
   ├─ Lookup: identity_aliases["phone:55119..."]?
   ├─ Lookup: identity_aliases["bsuid:ABC123"]?
   └─ Lookup: identity_aliases["remote_jid:55119..."]?
   ↓
   Found? → canonicalUserId (existing user)
   Not? → Generate: "wa:5511987654321" or "bsuid:ABC123"
   ↓
persistIdentity()
   ├─ Write: canonical_identities/{canonicalUserId}
   └─ Create: identity_aliases/[all alias keys]
   ↓
enqueueInboundMessage()
   └─ Write: message_inbox/{messageId} with ALL IDs
   ↓
persistPipelineAudit()
   └─ Write: integration_events/{docId}
```

---

## 🔍 Webhook vs Worker

```
WEBHOOK (api/sefaz-proxy.js)         │ WORKER (EvolutionInboxWorker.ts)
─────────────────────────────────────┼──────────────────────────────────
1. Extract raw data                  │ 1. Fetch message_inbox (pending)
2. Normalize values                  │ 2. Resolve full identity
3. Resolve identity (lookup)         │ 3. Read user profile
4. Persist → canonical_identities    │ 4. Process + queue response
5. Queue → message_inbox             │ 5. Write interaction
6. Log → integration_events          │ 6. Update user.lastInteraction*
                                     │ 7. Queue → message_outbox
```

---

## 📊 User Profile Shape

```javascript
users/{userId} {
    // Identity (REQUIRED)
    userId: "wa:5511987654321",
    canonicalUserId: "wa:5511987654321",
    remoteJid: "5511987654321@s.whatsapp.net",
    bsuid: "ABC123XYZ",
    phoneNumber: "5511987654321",
    channel: "whatsapp",
    
    // Profile (OPTIONAL, filled over time)
    name: "João",
    neighborhood: "centro",
    transportMode: "carro",
    consumption: 8.5,
    preferences: {...},
    
    // Engagement (AUTO-UPDATED)
    interactionCount: 42,
    lastInteractionAt: Timestamp,
    lastMessagePreview: "Qual é o preco...",
    lastIntent: "price_query",
    
    // Timestamps
    createdAt: Timestamp,
    updatedAt: Timestamp,
}
```

---

## 🔑 Key Fields Reference

| Field | users/ | canonical_ids | msg_inbox | integration_events | Type |
|-------|--------|---|---|---|------|
| **userId** | ✅ KEY | - | ✅ | ✅ | ID |
| **canonicalUserId** | ✅ | ✅ | ✅ | ✅ | FK |
| **legacyUserId** | ✅ | ✅ | ✅ | ✅ | FK |
| **storageUserId** | ✅ | ✅ | ✅ | ✅ | FK |
| **remoteJid** | ✅ | ✅ | ✅ | ✅* | Phone |
| **bsuid** | ✅ | ✅ | ✅ | ✅ | UID |
| **phone** | ✅ | ✅ | - | - | Phone |
| **channel** | ✅ | ✅ | - | - | Enum |

*masked in logs

---

## 🔴 Critical Gaps

```
❌ No explicit user_id (UUID)
   └─ Fix: Add UUID v4, keep userId as identity key

❌ No user_status field
   └─ Fix: Add enum: active|suspended|deleted|anonymized

❌ IDs constructed dynamically
   └─ Fix: Separate identity key from stable user_id

❌ No cross-channel merge
   └─ Fix: Implement merge logic WhatsApp ↔ Web

❌ No public API by user_id
   └─ Fix: Create /api/v1/users/{user_id}
```

---

## ✅ Compliance (LGPD)

```
CORRECT ✅                    WRONG ❌
───────────────────────────────────────
analytics_events:            analytics_events:
  eventType: "purchase"        userId: "123"
  marketRegion: "centro"       name: "João"
  categorySlug: "frutas"       phone: "11987654321"
  weekday: 5                   coordinates: [-23.5, -46.6]
  hour: 14
  (NO userId)

Integration_events:          (PII masked in console logs only)
  remoteJid: full             "remoteJid: 551198***4321"
  (Need for audit)
```

---

## 🚀 3-Phase Migration Plan

```
🔴 PHASE 1 (NOW) - CRITICAL
├─ Add user_id UUID
├─ Add user_status field
├─ Backfill existing users
└─ Update indexes
   ETA: 2-3 weeks

🟠 PHASE 2 (2 sprints) - HIGH PRIORITY
├─ Cross-channel user merge
├─ API /users/{user_id}
└─ Auth layer
   ETA: 3-4 weeks

🟡 PHASE 3 (4+ weeks) - MEDIUM
├─ UserDiscoveryService
├─ Batch operations
├─ Admin panel
└─ User data export
   ETA: 2-3 weeks
```

---

## 📝 Code Locations

| What | Where | Type |
|------|-------|------|
| Identity interface | `src/types/identity.ts` | TypeScript |
| Resolution logic | `src/services/IdentityResolutionService.ts` | TypeScript |
| Webhook handler | `api/sefaz-proxy.js` | JavaScript |
| Message processor | `src/workers/EvolutionInboxWorker.ts` | TypeScript |
| Firestore rules | `firestore.rules` | Firestore |
| Indexes | `firestore.indexes.json` | JSON |

---

## 📚 Full Documents

```
00-INDICE_ANALISE_USUARIOS.md      ← START HERE (navigation)
├─ RESUMO_USUARIOS_EXECUTIVO.md    ← 4000 words, 7 Q&As
├─ ANALISE_ESTRUTURA_USUARIOS.md   ← 8000 words, detailed
└─ ROADMAP_USER_ID_MIGRATION.md    ← Action plan + code
```

---

## ⚡ TL;DR

**Q: How are users identified?**  
A: Via phone-based ID (`wa:5511987654321`) or bsuid. Resolved through identity_aliases collection for fast lookup.

**Q: Any user_id?**  
A: ❌ No UUID. Use canonicalUserId instead (fragile).

**Q: Collections?**  
A: 8 main (users/, canonical_identities, message_inbox/outbox, integration_events, analytics_events, user_aggregates)

**Q: Webhook → Worker flow?**  
A: Webhook resolves identity + queues → message_inbox → Worker processes → updates user + queues outbound

**Q: LGPD compliant?**  
A: ✅ Yes. Analytics = zero PII. integration_events = audit trail (masked in logs).

**Q: What to fix?**  
A: Add user_id UUID, user_status field, cross-channel merge. See ROADMAP_USER_ID_MIGRATION.md

---

**Created:** 26/04/2026 | **Words:** 15,000+ | **Diagrams:** 2 | **Code snippets:** 5+ | **Time invested:** 2h
