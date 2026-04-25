# 🚀 Geofertas — Quick Start Guide para Delivery com Agentes

> Sua arquitetura de entrega está pronta. Use este guia para começar.

---

## 📦 O Que Foi Criado

### ✅ 4 Agentes Customizados (em `.agent/agents/`)
```
1. geofertas-delivery-lead.md       → Coordenador de projeto
2. sefaz-integration-specialist.md  → Especialista em NF-e
3. whatsapp-architect.md            → Especialista em WhatsApp
4. supermarket-data-specialist.md   → Especialista em catálogo
```

### ✅ 4 Squads de Execução (em `squads/`)
```
1. geofertas-delivery/              → Master orchestrator
2. geofertas-backend/               → APIs + SEFAZ + Firebase
3. geofertas-frontend/              → Dashboard + integração
4. geofertas-quality/               → Testes + segurança + deploy
5. geofertas-data/                  → Catálogo + precificação
```

### ✅ Estratégia de Entrega (em `.agent/DELIVERY_STRATEGY.md`)
```
Análise dos 3 cenários
Recomendação híbrida
Paralelo máximo (4-6 agentes)
Timeline: 5-7 dias
```

---

## 🎬 Como Começar Agora

### Passo 1: Verificar a Estrutura (5 min)
```bash
# Listar novos agentes
ls -la .agent/agents/geofertas-*.md

# Listar novos squads
ls -la squads/geofertas-*/

# Ver estratégia de entrega
cat .agent/DELIVERY_STRATEGY.md
```

### Passo 2: Rodar Discovery (1 hora)
**Goal**: Diagnóstico do status real do projeto

**Comando**:
```
Use the explorer-agent to perform fast codebase exploration
Query: Map Geofertas project status:
  - Frontend status (% complete)
  - Backend status (% complete)
  - Integration status
  - Missing features
  - Critical gaps
```

**Output esperado**:
- Status % de cada componente
- Gaps identificados
- Prioridades claras

### Passo 3: Confirmar o Cenário (5 min)
Baseado no Discovery:

**Cenário 1**: MVP 90% pronto → Bugfixes + otimização (2-3 dias)  
**Cenário 2**: Features faltando → Desenvolvimento ativo (5-7 dias)  
**Cenário 3**: Base pronta → Integração (3-5 dias)

### Passo 4: Criar Squad Master Delivery (30 min)
**Goal**: Inicializar orquestração

**Comando**: Type `/opensquad create`
```
Name: geofertas-delivery-master
Description: Master orchestrator for Geofertas delivery
Agents: 
  - orchestrator (lead)
  - geofertas-delivery-lead
  - explorer-agent
Skills:
  - parallel-agents
  - plan-writing
  - architecture
```

### Passo 5: Rodar Dia 1 - Discovery (4 horas)
**Foco**: Criar plano detalhado

**Squad A (Backend Lead)**:
```
backend-specialist: Code audit + API mapping
sefaz-integration-specialist: SEFAZ status check
database-architect: Firestore schema review
```

**Squad B (Frontend Lead)**:
```
frontend-specialist: Component inventory
test-engineer: Test infrastructure audit
```

**Squad C (Data Lead)**:
```
supermarket-data-specialist: Catalog status
database-architect: Query performance check
```

**Squad D (Quality Lead)**:
```
test-engineer: Test coverage assessment
security-auditor: Security audit scope
devops-engineer: Deploy pipeline check
```

### Passo 6: Paralelo - Dias 2-5 (40 horas)
**Rodar 4 squads em paralelo**:

```bash
# Comando no /opensquad
/opensquad run geofertas-backend
/opensquad run geofertas-frontend
/opensquad run geofertas-quality
/opensquad run geofertas-data
```

Cada squad trabalha independentemente:
- Backend: APIs + SEFAZ + Firebase
- Frontend: Componentes + integração
- Quality: Testes + segurança + deploy
- Data: Catálogo + precificação

### Passo 7: Consolidação - Dias 6-7 (12 horas)
**Foco**: Qualidade + Deploy

1. Backend + Frontend: Integração completa
2. Quality: Testes E2E 100% passando
3. Data: Catálogo pronto para uso
4. Deploy: Pipeline testado

---

## 📊 Dashboard de Status

Abra este arquivo para monitorar progresso:
```
squads/geofertas-delivery/output/YYYY-MM-DD/status.json
```

Atualiza automaticamente com:
- Progress % de cada squad
- Blockers identificados
- Próximos passos
- ETA para conclusão

---

## 🎯 Checklist Semanal

### Segunda-feira (Day 1)
- [ ] Discovery completo
- [ ] PLAN.md criado
- [ ] Cenário confirmado
- [ ] Squads criados

### Terça-feira (Day 2)
- [ ] Backend: APIs core 50%
- [ ] Frontend: Páginas principais 30%
- [ ] Quality: Test infra pronta
- [ ] Data: Schema pronto

### Quarta-feira (Day 3)
- [ ] Backend: APIs 100%
- [ ] Frontend: Páginas 70%
- [ ] Quality: Unit tests 50%
- [ ] Data: Produtos 50%

### Quinta-feira (Day 4)
- [ ] Backend: SEFAZ integrado
- [ ] Frontend: Integração 80%
- [ ] Quality: E2E tests 50%
- [ ] Data: Catálogo 100%

### Sexta-feira (Day 5)
- [ ] Backend: Tudo pronto
- [ ] Frontend: Tudo pronto
- [ ] Quality: Tests + Security passing
- [ ] Data: Quality checks passing

### Sexta-feira (Day 6)
- [ ] Security audit 0 criticals
- [ ] Lighthouse 90+
- [ ] Deploy pipeline working
- [ ] Go-live checklist

### Sábado (Day 7)
- [ ] 🚀 DEPLOY EM PRODUÇÃO
- [ ] Monitoramento ativo
- [ ] Usuários podem usar

---

## 🚨 Se Você Não Está Pronto

### Precisa de Discovery Primeiro?
```
Execute: explorer-agent (1 hora)
Então volte aqui e escolha o cenário correto
```

### Precisa Entender Melhor a Estrutura?
```
Leia: .agent/DELIVERY_STRATEGY.md
Leia: .agent/ARCHITECTURE.md
Leia: _opensquad/core/architect.agent.yaml
```

### Precisa de Agentes Customizados Diferentes?
```
1. Analise quais agentes você realmente precisa
2. Crie novos em .agent/agents/seu-agente.md
3. Referencie-os nos squads YAML
```

### Precisa Ajustar Timeline?
```
Dia 1: +2 horas para discovery mais aprofundado
Dia 2-5: Pode ser paralelo (máximo 4 agentes)
Dia 6-7: Pode ser +1 dia se tiver muitos bugs
```

---

## 💡 Dicas de Ouro

### 1. **Start Small, Iterate Fast**
- Comece com 1 squad
- Veja como funciona
- Depois aumente paralelismo

### 2. **Blocker Escalation**
Se algum squad ficar bloqueado:
1. Tente resolver em 1 hora
2. Se não resolver → escalpe para delivery-lead
3. Delivery-lead decide: resolve em paralelo ou corta escopo

### 3. **Quality Gates são Mandatórios**
```
✅ Não deploy com:
- Security issues críticos
- Lighthouse < 90
- Testes falhando
```

### 4. **Documentação é Código**
- Cada squad mantém seu README
- PLAN.md atualizado diariamente
- Blockers documentados em tempo real

### 5. **Comunicação Diária**
- 15 min standup cada squad
- 1 hora sync entre squads
- Delivery-lead consolida status

---

## 🔗 Recursos

| Recurso | Localização |
|---------|------------|
| **Agentes Core** | `.agent/agents/` (20 agents existentes) |
| **Agentes Geofertas** | `.agent/agents/geofertas-*.md` (4 novos) |
| **Squads** | `squads/geofertas-**/squad.yaml` |
| **Estratégia** | `.agent/DELIVERY_STRATEGY.md` |
| **Arquitetura** | `.agent/ARCHITECTURE.md` |
| **Regras Opensquad** | `.agent/rules/opensquad.md` |

---

## ❓ Perguntas Frequentes

### P: Posso cortar algum squad?
**R**: Squad C (Quality) é mandatório. Os outros podem ser reduzidos mas não cortados.

### P: Quanto tempo isso leva?
**R**: 5-7 dias com parallelismo máximo. Mínimo 3 dias se muito otimizado.

### P: E se haver muitos bugs?
**R**: Use o agente `debugger` especializado. Debugger + test-engineer juntos.

### P: Como monitoro progresso?
**R**: Verifique `squads/geofertas-delivery/state.json` e `status.json` em tempo real.

### P: Posso parar e retomar depois?
**R**: Sim, todos os squads salvam estado. Retome com `/opensquad run --resume geofertas-backend`

---

## 🎉 Próximo Passo

**AGORA**: Execute o Discovery (explorer-agent)  
**DEPOIS**: Escolha o cenário correto  
**ENTÃO**: Rode os 4 squads em paralelo

---

**Você está pronto para delivery rápido e paralelo! 🚀**
