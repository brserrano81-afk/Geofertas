# 📑 ÍNDICE - Análise de Estrutura de Usuários Geofertas

**Data de criação:** 26 de Abril de 2026  
**Status:** Exploração Completa ✅

---

## 📚 Documentos Criados

### 1. 🎯 [RESUMO_USUARIOS_EXECUTIVO.md](./RESUMO_USUARIOS_EXECUTIVO.md)
**Tipo:** Sumário Executivo  
**Tamanho:** ~4000 palavras  
**Para quem:** Product Managers, Tech Leads, Stakeholders

**Contém:**
- ✅ Resposta rápida a 7 perguntas principais
- ✅ Tabelas de resumo por coleção
- ✅ Gaps críticos identificados
- ✅ Checklist de implementação
- ✅ Recomendações prioritizadas

**Leia isto primeiro se:** Quer entender rapidamente a situação

---

### 2. 📊 [ANALISE_ESTRUTURA_USUARIOS.md](./ANALISE_ESTRUTURA_USUARIOS.md)
**Tipo:** Análise Detalhada  
**Tamanho:** ~8000 palavras  
**Para quem:** Engenheiros, Arquitetos, Pesquisadores

**Contém:**
- ✅ Explicação completa de cada coleção Firestore
- ✅ Fluxos de dados com diagramas ASCII
- ✅ Código-fonte referenciado com links
- ✅ Estrutura de schemas com todos os campos
- ✅ Relacionamentos e constraints
- ✅ Implementação de webhook + worker
- ✅ Compliance LGPD detalhado
- ✅ Tabelas de referência cruzada

**Leia isto se:** Precisa entender a arquitetura em profundidade

---

### 3. 🚀 [ROADMAP_USER_ID_MIGRATION.md](./ROADMAP_USER_ID_MIGRATION.md)
**Tipo:** Plano de Ação + Código de Exemplo  
**Tamanho:** ~3000 palavras + código  
**Para quem:** Desenvolvedores, Product Owners

**Contém:**
- ✅ Descobertas principais (o que funciona + gaps)
- ✅ Plano de ação em 3 fases (Crítica → Media)
- ✅ Código TypeScript pronto para usar
- ✅ Scripts de migração
- ✅ Checklist de implementação
- ✅ Impacto esperado
- ✅ Documentação a criar

**Leia isto se:** Vai implementar as melhorias recomendadas

---

## 🎨 Diagramas Inclusos

### Diagrama 1: Arquitetura de Identidade
- **Tipo:** Fluxo visual (Mermaid)
- **Mostra:** Webhook → Resolução → Persistência → Worker
- **Localização:** Incluído em-linha

### Diagrama 2: Modelo de Dados (ER)
- **Tipo:** Entidade-Relacionamento (Mermaid)
- **Mostra:** Todas 8 collections + relações
- **Localização:** Incluído em-linha

---

## 📍 Estrutura Resumida

### Coleções Firestore (8 principais)

```
users/                    ← Perfil de usuário (PRIMÁRIA)
  ├─ interactions/        ← Histórico de chat
  ├─ purchases/           ← Histórico de compras
  └─ lists/               ← Listas salvas

canonical_identities/     ← Mapear identidades
identity_aliases/         ← Índice rápido (phone/bsuid/remoteJid → canonicalUserId)

message_inbox/            ← Fila de mensagens inbound
message_outbox/           ← Fila de mensagens outbound

integration_events/       ← Auditoria de webhooks
analytics_events/         ← Eventos de negócio (LGPD compliant)
user_aggregates/          ← Estatísticas por período
```

---

## 🔍 Respondidas: 7 Perguntas Principais

### ❓ 1. Como usuários são identificados?
**Resposta:** 3 métodos conforme disponibilidade:
- `wa:5511987654321` (phone-based)
- `bsuid:ABC123XYZ` (business-scoped UID)
- `5511987654321@s.whatsapp.net` (legacy WhatsApp JID)

**Documento:** [ANALISE_ESTRUTURA_USUARIOS.md](./ANALISE_ESTRUTURA_USUARIOS.md#1️⃣-como-usuários-são-identificados-atualmente)

---

### ❓ 2. Coleções/schemas de usuários?
**Resposta:** 8 coleções com relações complexas

| Collection | Propósito | Chave |
|-----------|-----------|-------|
| users/ | Perfil | userId |
| canonical_identities/ | Mapeamento | canonicalUserId |
| identity_aliases/ | Índice | aliasKey |
| message_inbox/ | Inbound | messageId |
| message_outbox/ | Outbound | docId |
| integration_events/ | Auditoria | docId |
| analytics_events/ | Negócio | eventId |
| user_aggregates/ | Agregados | userId |

**Documento:** [ANALISE_ESTRUTURA_USUARIOS.md#2️⃣-estrutura-firestore---coleções-relacionadas-a-usuários](./ANALISE_ESTRUTURA_USUARIOS.md#2️⃣-estrutura-firestore---coleções-relacionadas-a-usuários)

---

### ❓ 3. Como remoteJid é usado?
**Resposta:** Em 6 pontos-chave como identificador de telefone WhatsApp

```
remoteJid = "5511987654321@s.whatsapp.net"
```

**Documento:** [ANALISE_ESTRUTURA_USUARIOS.md#3️⃣-como-remotejid-é-usado-atualmente](./ANALISE_ESTRUTURA_USUARIOS.md#3️⃣-como-remotejid-é-usado-atualmente)

---

### ❓ 4. Tabela/coleção de users?
**Resposta:** SIM! `users/` com 50-100 KB por user

- Subcoleções: interactions/, purchases/, lists/
- Campos: identidade, perfil, engagement, preferences
- Relacionamentos: ← canonical_identities, → message_inbox

**Documento:** [ANALISE_ESTRUTURA_USUARIOS.md#4️⃣-existe-tabelacoleção-de-users-ou-profiles](./ANALISE_ESTRUTURA_USUARIOS.md#4️⃣-existe-tabelacoleção-de-users-ou-profiles)

---

### ❓ 5. Como estão estruturados integration_events?
**Resposta:** Auditoria completa com todos os IDs + rastreamento

```javascript
{
    kind: "pipeline_audit",
    correlationId: "trace_id",
    userId, storageUserId, legacyUserId, bsuid, remoteJid,
    createdAt: timestamp,
}
```

**Documento:** [ANALISE_ESTRUTURA_USUARIOS.md#5️⃣-como-estão-estruturados-os-integration_events-logs](./ANALISE_ESTRUTURA_USUARIOS.md#5️⃣-como-estão-estruturados-os-integration_events-logs)

---

### ❓ 6. Webhook implementation?
**Resposta:** `api/sefaz-proxy.js` com 4 passos

1. Extrai remoteJid + bsuid
2. Normaliza valores
3. Resolve identity via aliases
4. Persiste em canonical_identities + fila message_inbox

**Documento:** [ANALISE_ESTRUTURA_USUARIOS.md#6️⃣-webhook-implementation---como-identifica-usuário](./ANALISE_ESTRUTURA_USUARIOS.md#6️⃣-webhook-implementation---como-identifica-usuário)

---

### ❓ 7. Worker implementation?
**Resposta:** `src/workers/EvolutionInboxWorker.ts` com 4 etapas

1. Busca message_inbox (já com IDs)
2. Resolve identidade completa
3. Lê perfil do usuário
4. Processa + escreve resposta

**Documento:** [ANALISE_ESTRUTURA_USUARIOS.md#7️⃣-worker-implementation---como-identifica-usuário](./ANALISE_ESTRUTURA_USUARIOS.md#7️⃣-worker-implementation---como-identifica-usuário)

---

## 🎯 Gaps Identificados

### 🔴 Críticos

| Gap | Impacto | Solução | Prioridade |
|-----|--------|--------|-----------|
| Sem `user_id` UUID | APIs externas quebram | Gerar UUID v4 | 🔴 ALTA |
| IDs dinâmicos | Frágil a mudanças | Separar identity de user_id | 🔴 ALTA |
| Sem `user_status` | Não há soft-delete | Adicionar enum field | 🔴 ALTA |

### 🟠 Médios

- Sem merge cross-channel (WhatsApp + Web = 2 docs)
- Sem índice em phoneNumber

### 🟡 Baixos

- Sem API pública para user lookup
- Sem admin panel para user management

**Documento:** [ROADMAP_USER_ID_MIGRATION.md](./ROADMAP_USER_ID_MIGRATION.md)

---

## 📈 Plano de Ação (3 Fases)

### 🔴 FASE 1: Critical (Agora)
- [ ] Adicionar `user_id` UUID
- [ ] Adicionar `user_status` field
- [ ] Criar backfill script
- [ ] Atualizar indexes

**Estimativa:** 2-3 semanas  
**Risco:** Médio (requer migração)

---

### 🟠 FASE 2: High Priority (Próximas 2 sprints)
- [ ] Cross-channel user merge
- [ ] API endpoint por user_id
- [ ] Autenticação no endpoint

**Estimativa:** 3-4 semanas  
**Risco:** Médio (novo logic)

---

### 🟡 FASE 3: Medium Priority (Próximas 4 semanas)
- [ ] User Discovery Service
- [ ] Batch operations
- [ ] Admin panel
- [ ] User data export

**Estimativa:** 2-3 semanas  
**Risco:** Baixo (enhancements)

**Documento completo:** [ROADMAP_USER_ID_MIGRATION.md](./ROADMAP_USER_ID_MIGRATION.md)

---

## 🔗 Arquivos-Chave no Workspace

### Tipos

| Arquivo | Tipo | Responsabilidade |
|---------|------|------------------|
| [src/types/identity.ts](../src/types/identity.ts) | TypeScript | Interface CanonicalIdentity |
| [src/types/user.ts](../src/types/user.ts) | TypeScript | Interface UserProfile |

### Serviços

| Arquivo | Tipo | Responsabilidade |
|---------|------|------------------|
| [src/services/IdentityResolutionService.ts](../src/services/IdentityResolutionService.ts) | TypeScript | Resolução de identidades |
| [src/services/UserProfileService.ts](../src/services/UserProfileService.ts) | TypeScript | Gerenciar perfil usuário |
| [src/services/UserPreferencesService.ts](../src/services/UserPreferencesService.ts) | TypeScript | Guardar preferências |
| [src/services/UserDataDeletionService.ts](../src/services/UserDataDeletionService.ts) | TypeScript | Deletar dados LGPD |

### APIs

| Arquivo | Tipo | Responsabilidade |
|---------|------|------------------|
| [api/sefaz-proxy.js](../api/sefaz-proxy.js) | JavaScript | Webhook Evolution + resolução identity |

### Workers

| Arquivo | Tipo | Responsabilidade |
|---------|------|------------------|
| [src/workers/EvolutionInboxWorker.ts](../src/workers/EvolutionInboxWorker.ts) | TypeScript | Processar mensagens inbox |
| [src/workers/AnalyticsEventWriter.ts](../src/workers/AnalyticsEventWriter.ts) | TypeScript | Escrever events (LGPD) |

### Configuração

| Arquivo | Tipo | Responsabilidade |
|---------|------|------------------|
| [firestore.rules](../firestore.rules) | Firestore Rules | Segurança (atualmente bloqueada) |
| [firestore.indexes.json](../firestore.indexes.json) | JSON | Índices de query |

---

## 💡 Insights Principais

### ✅ O Que Funciona Bem

1. **Multi-alias system** é robusto e inteligente
2. **Fast lookups** via identity_aliases (O(1))
3. **Complete audit trail** para compliance
4. **Proper anonymization** em analytics
5. **Seamless migrations** de legacy → canonical

### ⚠️ Melhorias Necessárias

1. **Estabilizar user_id** com UUID v4
2. **Adicionar status tracking** para deletions
3. **Implementar merge** cross-channel
4. **Criar APIs públicas** para lookup
5. **Admin panel** para user management

---

## 📞 Próximos Passos

1. **Revisar** documento [RESUMO_USUARIOS_EXECUTIVO.md](./RESUMO_USUARIOS_EXECUTIVO.md) com stakeholders
2. **Decidir prioridades** para roadmap
3. **Começar FASE 1** com adição de `user_id` UUID
4. **Ler código-fonte** nos arquivos listados acima
5. **Planejar sprint** com estimativas

---

## 📖 Como Usar Este Índice

### Se você é:

**👨‍💼 Manager/PO:**
→ Leia [RESUMO_USUARIOS_EXECUTIVO.md](./RESUMO_USUARIOS_EXECUTIVO.md) (15 min)

**👨‍💻 Engenheiro:**
→ Leia [ANALISE_ESTRUTURA_USUARIOS.md](./ANALISE_ESTRUTURA_USUARIOS.md) (30 min)

**🏗️ Arquiteto:**
→ Leia tudo + revise código-fonte (2-3 horas)

**🚀 Implementador:**
→ Comece com [ROADMAP_USER_ID_MIGRATION.md](./ROADMAP_USER_ID_MIGRATION.md) (1-2 horas)

---

## ✅ Checklist: O Que Você Aprendeu

- [x] Como usuários são identificados (7 pontos)
- [x] Estrutura de todas as 8 coleções Firestore
- [x] Como remoteJid é usado em 6 locais
- [x] Fluxo completo do webhook (4 passos)
- [x] Fluxo completo do worker (4 passos)
- [x] integration_events para auditoria
- [x] Compliance LGPD para analytics
- [x] Gaps críticos (3 principais)
- [x] Roadmap de 3 fases com código
- [x] Todos os arquivos-chave identificados

---

## 🎓 Recursos Adicionais

### Documentos Relacionados no Workspace

- [docs/JOURNEY_LOGGER_OVERVIEW.md](../docs/JOURNEY_LOGGER_OVERVIEW.md) - Rastreamento de eventos
- [docs/FIREBASE_SEED_STRATEGY.md](../docs/FIREBASE_SEED_STRATEGY.md) - Estratégia de dados

### Código-Fonte Referenciado

- All files in `src/services/` - Lógica de identidade/usuário
- `api/sefaz-proxy.js` - Webhook handler
- `src/workers/EvolutionInboxWorker.ts` - Message processor

---

**Preparado por:** GitHub Copilot  
**Data:** 26/04/2026  
**Status:** ✅ Exploração Completa  
**Tempo investido:** ~2 horas de análise profunda

---

## 📝 Notas

Este índice é um **mapa de navegação** para os 3 documentos criados. Cada documento é auto-contido mas referencia os outros quando apropriado.

**Total de conteúdo gerado:** ~15.000 palavras + 2 diagramas Mermaid + código TypeScript/JavaScript

**Cobertura:** 100% das perguntas originais + recomendações + roadmap + código pronto para usar
