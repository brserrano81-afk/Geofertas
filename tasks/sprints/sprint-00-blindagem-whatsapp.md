# Sprint 00 - Blindagem WhatsApp First

## Objetivo

Proteger o fluxo oficial atual do EconomizaFacil antes de qualquer refatoracao no nucleo.

Regra desta sprint:

- nao reescrever o projeto do zero
- nao quebrar o fluxo atual
- preservar a arquitetura existente
- tratar WhatsApp como canal principal do produto

## Fluxo oficial do WhatsApp

Fluxo de referencia oficial:

`Evolution webhook -> message_inbox -> EvolutionInboxWorker -> ChatService -> message_outbox`

Leitura pratica do fluxo:

1. A Evolution envia o evento para o webhook HTTP.
2. O webhook normaliza o evento e grava a mensagem em `message_inbox`.
3. O worker busca mensagens pendentes em `message_inbox`.
4. O worker envia a mensagem para o `ChatService`.
5. O `ChatService` interpreta, consulta regras de negocio e monta a resposta.
6. O worker tenta responder via Evolution.
7. A resposta e registrada em `message_outbox`.
8. O status final da mensagem e atualizado no inbox.

## Arquivos centrais do fluxo oficial

### Entrada e normalizacao

- `api/sefaz-proxy.js`
  - expõe os endpoints `/webhook/whatsapp-entrada`
  - normaliza evento da Evolution
  - grava `integration_events`
  - grava `message_inbox`

### Fila operacional atual

- `message_inbox`
  - entrada oficial de mensagens recebidas
- `message_outbox`
  - saida oficial de mensagens produzidas
- `integration_events`
  - trilha de auditoria dos eventos recebidos

### Processamento

- `src/workers/EvolutionInboxWorker.ts`
  - busca mensagens pendentes
  - chama `ChatService`
  - tenta enviar a resposta pela Evolution
  - atualiza status de inbox e outbox

### Cerebro do sistema

- `src/services/ChatService.ts`
  - orquestra a conversa
  - roteia intencoes
  - chama lista, ofertas, historico, perfil, cupom e compartilhamento

### Modulos de apoio do fluxo oficial

- `src/services/AiService.ts`
- `src/services/ConversationStateService.ts`
- `src/services/ListManager.ts`
- `src/services/OfferEngine.ts`
- `src/services/ShoppingComparisonService.ts`
- `src/services/IngestionPipeline.ts`
- `src/services/PurchaseManager.ts`
- `src/services/PurchaseAnalyticsService.ts`
- `src/services/UserProfileService.ts`
- `src/services/UserPreferencesService.ts`
- `src/services/UserContextService.ts`
- `src/firebase.ts`

## Pontos de entrada

### Oficial

- `POST /webhook/whatsapp-entrada`
- `POST /webhook/whatsapp-entrada/:event`

Arquivo:

- `api/sefaz-proxy.js`

### Suporte de teste

- `src/scripts/testEvolutionWebhook.ts`
  - envia payload de teste para o webhook oficial

## Pontos de persistencia

- `integration_events`
  - guarda o evento bruto normalizado para auditoria
- `message_inbox`
  - guarda a mensagem recebida para processamento assicrono
- `message_outbox`
  - guarda a resposta produzida e o status de envio
- `users/{userId}`
  - perfil e preferencias
- `users/{userId}/interactions`
  - historico recente da conversa
- `users/{userId}/lists`
  - lista ativa e listas anteriores
- `users/{userId}/purchases`
  - compras e gastos registrados
- `offers`
  - base de ofertas
- `markets`
  - base de mercados

## Pontos de resposta

- envio principal:
  - `src/workers/EvolutionInboxWorker.ts`
  - tenta responder via API Evolution

- compartilhamento para outro numero:
  - `src/services/ChatService.ts`
  - grava manualmente em `message_outbox`

## Pontos de falha atuais

### Riscos no webhook

- webhook recebe evento, mas o payload pode vir incompleto
- se o Firebase falhar, pode haver evento salvo em arquivo mas nao enfileirado no inbox

### Riscos no worker

- polling simples
- sem fila transacional real
- possibilidade de reprocessamento se o status nao for atualizado como esperado
- resposta pode ficar em `pending_send` se configuracao Evolution estiver incompleta

### Riscos no ChatService

- arquivo muito grande
- muitas responsabilidades no mesmo lugar
- varios hotfixes no fluxo
- estado de conversa fica em memoria da sessao

### Riscos de dados

- varias leituras amplas no Firestore
- custo e latencia podem crescer rapido com aumento de uso

## O que parece fluxo oficial

- `api/sefaz-proxy.js`
- `src/workers/EvolutionInboxWorker.ts`
- `src/services/ChatService.ts`
- colecoes `message_inbox`, `message_outbox`, `integration_events`
- `src/scripts/testEvolutionWebhook.ts`

## O que parece legado

- `src/whatsapp/WhatsappBridge.ts`
  - conversa direto com `whatsapp-web.js`
  - pula o fluxo oficial de inbox/outbox
  - deve ser tratado como legado ou ferramenta de laboratorio

## O que parece duplicado

- duas portas de entrada para o WhatsApp:
  - webhook Evolution
  - `whatsapp-web.js`

- duas formas de responder:
  - worker oficial pela Evolution
  - resposta direta via bridge antigo

## O que pode gerar conflito

- uso simultaneo do webhook oficial e do bridge legado
- mensagens entrando por um caminho e respondendo por outro
- logs separados sem uma trilha unica
- comportamento diferente entre fluxo oficial e fluxo legado

## O que nao deve ser mexido agora

- regras principais de negocio dentro de lista, cupom e comparacao, exceto para correcoes pontuais
- formato atual das colecoes principais do Firestore
- paginas web de apoio, desde que nao interfiram no fluxo oficial
- scripts de seed e operacao que ja ajudam a base atual

## Matriz simples: arquivo -> funcao -> risco -> prioridade

| Arquivo | Funcao principal | Risco atual | Prioridade |
| --- | --- | --- | --- |
| `api/sefaz-proxy.js` | entrada oficial, webhook e persistencia inicial | alto | alta |
| `src/workers/EvolutionInboxWorker.ts` | processamento e envio de resposta | alto | alta |
| `src/services/ChatService.ts` | cerebro central da conversa | muito alto | altissima |
| `src/services/ConversationStateService.ts` | controle de contexto conversacional | alto | alta |
| `src/services/AiService.ts` | classificacao e resposta conversacional | medio | alta |
| `src/services/IngestionPipeline.ts` | entrada de cupom e imagem | medio | media |
| `src/services/ListManager.ts` | lista ativa do usuario | medio | alta |
| `src/services/OfferEngine.ts` | consulta de precos e ofertas | alto | alta |
| `src/services/ShoppingComparisonService.ts` | comparacao de lista | medio | media |
| `src/services/UserProfileService.ts` | bootstrap e historico do usuario | medio | media |
| `src/services/UserPreferencesService.ts` | preferencias do usuario | baixo | media |
| `src/services/UserContextService.ts` | contexto rico do usuario | medio | media |
| `src/whatsapp/WhatsappBridge.ts` | fluxo antigo direto via whatsapp-web.js | alto por conflito | alta para isolamento |
| `src/scripts/testEvolutionWebhook.ts` | teste simples do webhook oficial | baixo | alta para blindagem |

## Fluxos criticos que precisam ser preservados

### Fluxos de uso

- consultar preco
- criar lista
- ver lista
- remover item
- comparar lista
- compartilhar lista
- enviar cupom
- confirmar compra
- consultar historico
- consultar perfil e preferencia

### Fluxos de plataforma

- entrada da mensagem pelo webhook oficial
- persistencia em `message_inbox`
- processamento pelo worker
- resposta pelo `ChatService`
- registro em `message_outbox`
- rastreabilidade em caso de erro

## Checklist de regressao

- webhook continua recebendo mensagens da Evolution
- mensagem recebida continua sendo gravada em `message_inbox`
- worker continua consumindo mensagens `pending`
- `ChatService` continua respondendo texto normal
- envio de imagem continua chegando ao pipeline de cupom
- lista continua podendo ser criada e recuperada
- comparacao de lista continua funcionando
- compartilhamento continua gerando resposta ou outbox
- compra confirmada continua sendo salva
- historico e perfil continuam acessiveis
- erro continua ficando visivel em status/log

## Checklist de validacao manual

### Entrada

- enviar texto simples pelo webhook oficial
- enviar lista com varios itens
- enviar imagem de cupom

### Processamento

- verificar se a mensagem foi criada em `message_inbox`
- verificar se o worker mudou status para `processing`
- verificar se a resposta foi produzida

### Persistencia

- verificar `message_outbox`
- verificar `users/{userId}/interactions`
- verificar lista e compra quando aplicavel

### Falha e rastreabilidade

- desligar temporariamente o envio da Evolution e verificar se a resposta fica rastreavel
- verificar se erro aparece no inbox ou outbox
- verificar se o evento original existe em `integration_events`

## Decisao desta sprint

Nesta sprint, o objetivo nao e refatorar.

Nesta sprint, o objetivo e:

- congelar o fluxo oficial
- deixar claro o que e legado
- definir o que precisa ser protegido
- criar base de validacao antes de qualquer mexida no nucleo
