# PLAYBOOK — INCIDENTE DE SEGURANÇA E PRIVACIDADE
**Economiza Fácil | Versão 1.0 | 2026-04-15**

---

## 1. PAPÉIS

| Papel | Responsabilidade no incidente |
|---|---|
| **CTO** | Declara incidente, coordena resposta, assina comunicações externas |
| **Tech Lead / Backend** | Contenção técnica, análise de impacto, correção |
| **DevOps** | Acesso a logs, rotação de credenciais, revogação de acessos |
| **PO** | Comunica impacto a stakeholders internos |

> Em estrutura enxuta: uma pessoa pode acumular papéis. O que importa é que alguém **declare** e alguém **execute**.

---

## 2. TIPOS DE INCIDENTE COBERTOS

| Código | Tipo | Exemplos |
|---|---|---|
| `INC-01` | Vazamento de dados pessoais | Dados de usuário expostos publicamente, dump de banco |
| `INC-02` | Exposição de logs com dados sensíveis | remoteJid/telefone em logs de produção sem mascaramento |
| `INC-03` | Falha de webhook com dado sensível | Payload com dado pessoal entregue a endpoint errado |
| `INC-04` | Acesso indevido ao Firebase | Login não autorizado, regras Firestore abertas demais |
| `INC-05` | Credencial comprometida | Chave de API, service account ou token vazado |
| `INC-06` | Coleta ou retenção irregular | Dado coletado sem consentimento ou retido além do prazo |

---

## 3. FLUXO DE RESPOSTA

```
DETECÇÃO → CONTENÇÃO → AVALIAÇÃO → CORREÇÃO → COMUNICAÇÃO → AUDITORIA
```

### 3.1 Detecção

**Quem detecta:** qualquer membro da equipe, alerta automático, relato externo.

**Ações imediatas:**
- Registrar data/hora e quem detectou
- Abrir issue privada no repositório com label `incidente-seguranca` OU registrar em canal seguro
- Notificar CTO em até **15 minutos**

**Fontes de detecção:**
- Logs operacionais (Railway, Console)
- Alertas do Firebase (acesso anômalo)
- Relato de usuário
- Auditoria interna de código
- Terceiro (pesquisador, parceiro)

---

### 3.2 Contenção

**Objetivo:** impedir que o dano aumente. Agir antes de entender completamente.

| Tipo | Ação de contenção |
|---|---|
| `INC-01` Vazamento | Desativar endpoint exposto, revogar chaves, bloquear acesso público imediatamente |
| `INC-02` Logs | Remover ou rotacionar acesso ao sistema de logs, deploy imediato com mascaramento |
| `INC-03` Webhook | Desativar instância Evolution/webhook temporariamente, verificar destino dos payloads |
| `INC-04` Firebase | Revogar token/service account, endurecer regras Firestore, verificar Firebase Console > Auditoria |
| `INC-05` Credencial | Revogar credencial comprometida imediatamente (Firebase Console, Railway, Evolution), rotacionar todas as credenciais adjacentes |
| `INC-06` Coleta irregular | Suspender fluxo de coleta, iniciar rotina de deleção para dados sem consentimento |

**Regra:** contenção tem prioridade sobre diagnóstico completo.

---

### 3.3 Avaliação de Impacto

Responder as seguintes perguntas:

1. **Quais dados foram expostos?** (telefone, jid, histórico de conversa, dados de compra)
2. **Quantos usuários afetados?** (estimativa mínima e máxima)
3. **Por quanto tempo o dado esteve exposto?** (janela temporal)
4. **O dado foi acessado por terceiros?** (evidência de acesso, IPs, timestamps)
5. **O dado pode ser usado para causar dano?** (sensibilidade, combinação com outros dados)
6. **O incidente ainda está ativo ou foi contido?**

**Output desta etapa:** resumo escrito com as 6 respostas acima. Esse documento é a base para comunicação e auditoria.

---

### 3.4 Correção

- Corrigir a causa-raiz (não apenas o sintoma)
- Deploy de correção com revisão obrigatória de pelo menos uma pessoa além do autor
- Verificar se a mesma vulnerabilidade existe em outros pontos do sistema
- Confirmar que a correção está em produção e funcionando
- Registrar o hash do commit de correção no registro do incidente

---

### 3.5 Comunicação

#### 3.5.1 Comunicação Interna
- Informar toda a equipe após contenção confirmada
- Registrar linha do tempo completa (detecção → contenção → correção)
- Documentar lições aprendidas

#### 3.5.2 Comunicação a Usuários Afetados

**Comunicar quando qualquer uma das condições abaixo for verdadeira:**
- Dado pessoal foi exposto a terceiros (confirmado ou provável)
- Dado pode ter sido usado para causar dano ao usuário
- Incidente envolveu dado de saúde, financeiro ou localização
- Usuário pergunta diretamente (sempre responder com verdade)

**Prazo:** assim que possível após contenção, sem aguardar investigação completa.

**Canal:** WhatsApp (canal primário do produto) + e-mail se disponível.

**Texto mínimo:**
> "Identificamos um problema de segurança que pode ter afetado seus dados. Já corrigimos o problema. [Descrever brevemente o que aconteceu e o que foi feito.] Se tiver dúvidas, entre em contato."

#### 3.5.3 Comunicação à ANPD (Autoridade Nacional de Proteção de Dados)

**Avaliar notificação quando:**
- Dado pessoal de 1 ou mais titulares foi acessado por terceiro não autorizado
- Há risco real de dano (fraude, discriminação, dano financeiro)
- Incidente envolve dados sensíveis (mesmo que de poucos usuários)

**Prazo legal:** 3 dias úteis após conhecimento do incidente (LGPD, art. 48).

**Canal:** Portal gov.br/ANPD — formulário de comunicação de incidente.

**Conteúdo mínimo da notificação:**
- Data/hora da ocorrência e da detecção
- Natureza dos dados afetados
- Número estimado de titulares
- Medidas adotadas de contenção e correção
- Contato do responsável (DPO ou pessoa designada)

> **Critério prático:** em caso de dúvida, notificar. O custo de notificar desnecessariamente é menor que o custo de não notificar quando deveria.

---

### 3.6 Auditoria Pós-Incidente

Realizar até **7 dias** após encerramento do incidente.

**Perguntas obrigatórias:**
1. Como o incidente poderia ter sido detectado mais cedo?
2. A contenção foi rápida o suficiente?
3. A causa-raiz foi realmente corrigida?
4. Existe risco similar em outros pontos do sistema?
5. Alguma política, processo ou controle técnico precisa ser atualizado?

**Output:** documento de lições aprendidas registrado em `docs/03-operacao/` com data do incidente no nome.

---

## 4. CHECKLIST DE RESPOSTA RÁPIDA

Usar no momento do incidente. Marcar cada item conforme executado.

```
FASE 1 — PRIMEIROS 15 MINUTOS
[ ] Registrei data/hora e descrição inicial do incidente
[ ] Notifiquei o CTO
[ ] Abri registro do incidente (issue privada ou doc interno)
[ ] Identifiquei o tipo de incidente (INC-01 a INC-06)

FASE 2 — CONTENÇÃO (antes de qualquer outra ação)
[ ] Executei a ação de contenção para o tipo identificado
[ ] Confirmei que o dado não está mais sendo exposto ativamente
[ ] Não deletei evidências (logs, dumps) antes de capturá-las

FASE 3 — AVALIAÇÃO (em até 2 horas)
[ ] Identifiquei quais dados foram expostos
[ ] Estimei quantos usuários afetados
[ ] Determinei a janela temporal de exposição
[ ] Avaliei se houve acesso de terceiros
[ ] Respondi: o incidente ainda está ativo?

FASE 4 — CORREÇÃO
[ ] Corrigi a causa-raiz
[ ] Obtive revisão de pelo menos uma pessoa
[ ] Confirmei correção em produção
[ ] Registrei hash do commit de correção

FASE 5 — COMUNICAÇÃO
[ ] Avaliei se usuários devem ser comunicados → [ ] Sim [ ] Não
[ ] Se sim: enviei comunicação via WhatsApp/e-mail
[ ] Avaliei se ANPD deve ser notificada → [ ] Sim [ ] Não
[ ] Se sim: iniciei notificação no portal da ANPD (prazo: 3 dias úteis)
[ ] Comuniquei equipe interna

FASE 6 — PÓS-INCIDENTE (em até 7 dias)
[ ] Realizei auditoria pós-incidente
[ ] Documentei lições aprendidas
[ ] Identifiquei e corrigi riscos similares em outros pontos
[ ] Atualizei este playbook se necessário
```

---

## 5. CONTATOS E REFERÊNCIAS OPERACIONAIS

| Recurso | Onde acessar |
|---|---|
| Firebase Console (acessos, regras, auditoria) | console.firebase.google.com |
| Railway (logs, variáveis, deploy) | railway.app |
| Evolution API (instâncias WhatsApp) | painel da instância configurada |
| ANPD — formulário de notificação | gov.br/anpd |
| Repositório do projeto | GitHub privado do projeto |

---

## 6. HISTÓRICO DE INCIDENTES

| Data | Tipo | Resumo | Status |
|---|---|---|---|
| — | — | Nenhum incidente registrado | — |

> Registrar cada incidente aqui após encerramento, com link para o documento de lições aprendidas.

---

## 7. REVISÃO DESTE PLAYBOOK

Este documento deve ser revisado:
- Após cada incidente real
- A cada 6 meses (próxima revisão: **2026-10-15**)
- Sempre que houver mudança significativa na arquitetura ou nas leis aplicáveis

**Responsável pela revisão:** CTO
