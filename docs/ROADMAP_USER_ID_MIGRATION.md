# 🎯 RECOMENDAÇÕES - Próximos Passos para User Identity

**Data:** 26/04/2026  
**Baseado em:** Exploração completa do workspace Geofertas

---

## DESCOBERTAS PRINCIPAIS

### ✅ O Que Funciona Bem

1. **Multi-alias resolution** — Sistema inteligente que mapeia bsuid + phone + remoteJid para IDs canônicos únicos
2. **Fast lookups** — Collection `identity_aliases/` fornece acesso O(1) para resolver identidades
3. **Complete audit trail** — `integration_events/` registra tudo para compliance + debugging
4. **Proper LGPD handling** — Analytics events completamente anonimizados, PII mascarado em logs
5. **Seamless user data sync** — Migrations de legacy → canonical users funcionam com backfill automático

### ⚠️ Gaps Críticos

| Gap | Impacto | Solução |
|-----|--------|--------|
| **Sem `user_id` UUID** | APIs externas não conseguem referenciar users de forma estável | Gerar UUID v4 ao criar user |
| **IDs construídos dinamicamente** | Se formato mudar (ex: phone format), quebra tudo | Separar "identity key" de "user_id" |
| **Sem `user.status`** | Impossível marcar usuarios deletados/inativos | Adicionar enum field |
| **Sem cross-channel merge** | WhatsApp + Web = 2 users separados | Implementar merge strategy |

---

## 🚀 PLANO DE AÇÃO (Priorizado)

### 🔴 FASE 1: Critical (Fazer primeiro)

#### 1.1 Adicionar `user_id` UUID

**Arquivo:** `src/types/identity.ts`

```typescript
// ADICIONAR interface
export interface UserIdMigration {
    user_id: string;  // UUID v4, gerado uma única vez
    userId: string;   // Existing identity key (canônico ou legacy)
    created_at_unix: number;
    migrated_at_unix: number;
}

// ADICIONAR ao CanonicalIdentity
export interface CanonicalIdentity {
    // ... existing fields
    user_id?: string;           // ← NEW: UUID v4
    migrated_to_uuid_at?: number; // ← NEW: Timestamp da migração
}
```

**Arquivo:** `src/services/IdentityResolutionService.ts`

```typescript
async resolveWhatsAppIdentity(params: {
    remoteJid?: string;
    bsuid?: string;
    channel?: 'whatsapp' | 'web';
}): Promise<CanonicalIdentity> {
    // ... existing logic ...
    
    // ADD: Gerar user_id ao criar novo user
    if (!canonicalUserExists) {
        const user_id = crypto.randomUUID();  // ← NEW
        
        await persistIdentity({
            ...identity,
            user_id,  // ← NEW
        });
    }
    
    return identity;
}
```

**Script de migração:** `scripts/backfillUserId.ts`

```typescript
import { v4 as uuidv4 } from 'uuid';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

async function backfillUserId() {
    const db = getFirestore();
    
    // 1. Todos os usuarios sem user_id
    const usersSnap = await db.collection('users')
        .where('user_id', '==', undefined)
        .get();
    
    console.log(`Found ${usersSnap.size} users to migrate`);
    
    let migrated = 0;
    for (const userDoc of usersSnap.docs) {
        const user_id = uuidv4();
        const userId = userDoc.id;
        
        // 2. Escrever user_id
        await userDoc.ref.update({
            user_id,
            user_id_migrated_at: Timestamp.now(),
        });
        
        // 3. Atualizar canonical_identities
        const canonicalDoc = await db.collection('canonical_identities')
            .doc(userId)
            .get();
        
        if (canonicalDoc.exists) {
            await canonicalDoc.ref.update({
                user_id,
                user_id_backfilled_at: Timestamp.now(),
            });
        }
        
        // 4. Atualizar identity_aliases
        const aliasSnap = await db.collection('identity_aliases')
            .where('canonicalUserId', '==', userId)
            .get();
        
        for (const aliasDoc of aliasSnap.docs) {
            await aliasDoc.ref.update({ user_id });
        }
        
        migrated++;
        if (migrated % 100 === 0) {
            console.log(`Migrated: ${migrated}`);
        }
    }
    
    console.log(`✅ Backfill complete: ${migrated} users`);
}

// RUN: npx ts-node scripts/backfillUserId.ts
```

---

#### 1.2 Adicionar `user_status` Field

**Arquivo:** `src/types/identity.ts`

```typescript
export type UserStatus = 'active' | 'suspended' | 'deleted' | 'anonymized';

export interface UserProfile {
    userId: string;
    user_id?: string;         // NEW UUID
    user_status: UserStatus;  // ← NEW
    createdAt?: unknown;
    deletedAt?: unknown;      // ← NEW
    // ... rest
}
```

**Arquivo:** `src/services/UserDataDeletionService.ts`

```typescript
async deleteUserDataPermanent(userId: string): Promise<void> {
    const identity = await identityResolutionService.getIdentitySnapshot(userId);
    
    // 1. Mark as deleted (dont actually delete, for compliance)
    for (const userDocId of [identity.canonicalUserId, identity.storageUserId]) {
        await db.collection('users').doc(userDocId).set({
            user_status: 'deleted',
            deletedAt: serverTimestamp(),
            
            // Anonymize PII
            name: null,
            neighborhood: null,
            lastMessagePreview: null,
            lastIntent: null,
        }, { merge: true });
    }
    
    // 2. Keep user_id for audit purposes (may needed for compliance)
    // But clear all PII
}
```

---

#### 1.3 Firestore Index: `user_id`

**Arquivo:** `firestore.indexes.json`

```json
{
  "indexes": [
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "user_id", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "user_status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    // ... existing indexes ...
  ]
}
```

---

### 🟠 FASE 2: High Priority (Próximos 2 sprints)

#### 2.1 Cross-Channel User Merge

**Arquivo:** `src/services/IdentityResolutionService.ts`

```typescript
async mergeUsers(
    sourceUserId: string,
    targetUserId: string
): Promise<void> {
    const sourceIdentity = await this.getIdentitySnapshot(sourceUserId);
    const targetIdentity = await this.getIdentitySnapshot(targetUserId);
    
    // Validar: nao merging user com ele mesmo
    if (sourceIdentity.canonicalUserId === targetIdentity.canonicalUserId) {
        throw new Error('Cannot merge user with itself');
    }
    
    // 1. Copiar subcoleções
    for (const subcol of ['interactions', 'purchases', 'lists']) {
        await this.copySubcollection(
            sourceIdentity.canonicalUserId,
            targetIdentity.canonicalUserId,
            subcol as any
        );
    }
    
    // 2. Merge analytics aggregates
    await analyticsEventWriter.mergeAggregateDocuments(
        targetIdentity.canonicalUserId,
        [sourceIdentity.canonicalUserId]
    );
    
    // 3. Mark source as merged
    await db.collection('users').doc(sourceIdentity.canonicalUserId).set({
        user_status: 'merged',
        merged_to_user_id: targetIdentity.user_id,
        merged_to_canonical_id: targetIdentity.canonicalUserId,
        mergedAt: serverTimestamp(),
    }, { merge: true });
    
    // 4. Create alias for old user_id → new
    await db.collection('identity_aliases').doc(
        `user_id:${sourceIdentity.user_id}`
    ).set({
        canonicalUserId: targetIdentity.canonicalUserId,
        user_id: targetIdentity.user_id,
        mergedFrom: sourceIdentity.user_id,
    });
}
```

**Usar em:** ChatService quando detectar mesmo user em canais diferentes

---

#### 2.2 API Endpoint: Lookup user by `user_id`

**Arquivo:** `src/pages/api/v1/users/[user_id].ts`

```typescript
export default async function handler(req, res) {
    const { user_id } = req.query;
    
    if (!user_id || typeof user_id !== 'string') {
        return res.status(400).json({ error: 'Invalid user_id' });
    }
    
    try {
        // 1. Find user by user_id
        const usersSnap = await db.collection('users')
            .where('user_id', '==', user_id)
            .limit(1)
            .get();
        
        if (usersSnap.empty) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const userDoc = usersSnap.docs[0];
        const userData = userDoc.data();
        
        // 2. Check auth (add your auth layer here)
        // ...
        
        // 3. Return sanitized profile
        res.status(200).json({
            user_id: userData.user_id,
            userId: userData.userId,
            name: userData.name,
            neighborhood: userData.neighborhood,
            // ... other public fields
        });
        
    } catch (err) {
        console.error('Error fetching user:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
}
```

---

### 🟡 FASE 3: Medium Priority (Próximos 3-4 sprints)

#### 3.1 User Discovery by Phone/Email

```typescript
// Arquivo: src/services/UserDiscoveryService.ts

class UserDiscoveryService {
    async findByPhone(phoneNumber: string): Promise<CanonicalIdentity | null> {
        const aliasKey = buildAliasKey('phone', phoneNumber);
        const aliasSnap = await db.collection('identity_aliases')
            .doc(aliasKey)
            .get();
        
        if (!aliasSnap.exists) return null;
        
        return this.identityResolutionService.getIdentitySnapshot(
            aliasSnap.data().canonicalUserId
        );
    }
    
    async findByBsuid(bsuid: string): Promise<CanonicalIdentity | null> {
        const aliasKey = buildAliasKey('bsuid', bsuid);
        // ... similar
    }
    
    async findByUserId(user_id: string): Promise<CanonicalIdentity | null> {
        const usersSnap = await db.collection('users')
            .where('user_id', '==', user_id)
            .limit(1)
            .get();
        
        if (usersSnap.empty) return null;
        
        return this.identityResolutionService.getIdentitySnapshot(
            usersSnap.docs[0].id
        );
    }
}

export const userDiscoveryService = new UserDiscoveryService();
```

---

#### 3.2 Batch User Operations

```typescript
// Arquivo: src/services/BatchUserService.ts

async function bulkUpdateUserStatus(
    userIds: string[],
    newStatus: UserStatus
): Promise<void> {
    const batch = db.batch();
    
    for (const user_id of userIds) {
        const usersSnap = await db.collection('users')
            .where('user_id', '==', user_id)
            .get();
        
        for (const userDoc of usersSnap.docs) {
            batch.update(userDoc.ref, {
                user_status: newStatus,
                updatedAt: serverTimestamp(),
            });
        }
    }
    
    await batch.commit();
}

async function bulkExportUserData(userIds: string[]): Promise<UserDataExport[]> {
    const exports: UserDataExport[] = [];
    
    for (const user_id of userIds) {
        const usersSnap = await db.collection('users')
            .where('user_id', '==', user_id)
            .get();
        
        for (const userDoc of usersSnap.docs) {
            const userData = userDoc.data();
            
            // Buscar todas as subcoleções
            const interactions = await userDoc.ref.collection('interactions').get();
            const purchases = await userDoc.ref.collection('purchases').get();
            const lists = await userDoc.ref.collection('lists').get();
            
            exports.push({
                user_id,
                profile: userData,
                interactions: interactions.docs.map(d => d.data()),
                purchases: purchases.docs.map(d => d.data()),
                lists: lists.docs.map(d => d.data()),
            });
        }
    }
    
    return exports;
}
```

---

#### 3.3 Admin Panel: User Search & Management

```typescript
// Arquivo: src/pages/admin/users/search.tsx

export default function UserSearchPage() {
    const [searchBy, setSearchBy] = useState<'user_id' | 'phone' | 'bsuid'>('user_id');
    const [query, setQuery] = useState('');
    const [result, setResult] = useState(null);
    
    const handleSearch = async () => {
        let identity;
        
        switch (searchBy) {
            case 'user_id':
                identity = await userDiscoveryService.findByUserId(query);
                break;
            case 'phone':
                identity = await userDiscoveryService.findByPhone(query);
                break;
            case 'bsuid':
                identity = await userDiscoveryService.findByBsuid(query);
                break;
        }
        
        if (identity) {
            const userSnap = await db.collection('users')
                .doc(identity.canonicalUserId)
                .get();
            setResult(userSnap.data());
        }
    };
    
    return (
        <div>
            <h1>🔍 Buscar Usuário</h1>
            
            <div>
                <label>Buscar por:</label>
                <select value={searchBy} onChange={e => setSearchBy(e.target.value as any)}>
                    <option value="user_id">User ID</option>
                    <option value="phone">Telefone</option>
                    <option value="bsuid">BSUID</option>
                </select>
            </div>
            
            <input 
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Digite aqui..."
            />
            
            <button onClick={handleSearch}>Buscar</button>
            
            {result && (
                <div>
                    <h2>Resultado:</h2>
                    <pre>{JSON.stringify(result, null, 2)}</pre>
                </div>
            )}
        </div>
    );
}
```

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO

### Fase 1 (Crítica)
- [ ] Adicionar `user_id` UUID ao CanonicalIdentity interface
- [ ] Implementar geração de UUID ao criar novo user
- [ ] Criar script de backfill para existing users
- [ ] Adicionar `user_status` field e enum
- [ ] Atualizar firestore.indexes.json com novos índices
- [ ] Testar backfill em staging

### Fase 2 (Alta Prioridade)
- [ ] Implementar merge de usuários cross-channel
- [ ] Criar API endpoint para lookup por user_id
- [ ] Adicionar autenticação ao endpoint
- [ ] Documentar merge strategy em docs/

### Fase 3 (Média Prioridade)
- [ ] Implementar UserDiscoveryService
- [ ] Criar batch operations
- [ ] Desenvolver admin panel para user search
- [ ] Adicionar export de dados de usuário

---

## 📊 Impacto Esperado

| Métrica | Antes | Depois |
|---------|-------|--------|
| **Estabilidade de User ID** | Dinâmica (quebra se mudar formato) | ✅ Estável (UUID v4) |
| **Tempo para lookup por ID** | ~50-100ms (query) | ~10ms (direct doc access) |
| **Capacidade de marcar deleted** | ❌ Não | ✅ Sim |
| **Cross-channel users** | 2 docs | 1 doc (após merge) |
| **API compatibility** | Baixa (userId varia) | ✅ Alta (user_id fixo) |

---

## 🎓 Documentação a Criar

- [ ] `docs/USER_ID_MIGRATION.md` - Guia de migração
- [ ] `docs/USER_API.md` - API endpoints para usuários
- [ ] `docs/USER_MERGE_STRATEGY.md` - Cross-channel merge
- [ ] `docs/ADMIN_PANEL.md` - User management interface

---

**Preparado por:** Copilot  
**Data:** 26/04/2026  
**Status:** Pronto para implementação
