# Sprint 03 - Observabilidade, retry e escala inicial do WhatsApp

## Objetivo

Fortalecer o pipeline oficial do WhatsApp sem reescrever a arquitetura:

`Evolution webhook -> message_inbox -> EvolutionInboxWorker -> ChatService -> message_outbox`

O foco desta sprint foi dar mais visibilidade operacional, reduzir risco de reprocessamento e preparar o caminho para crescimento gradual.

## Estado atual encontrado

Antes desta sprint, o pipeline ja tinha:

- `correlationId` no fluxo oficial
- validacao basica no webhook
- `message_inbox` e `message_outbox`
- worker assincrono
- separacao mais clara entre oficial e legado

Mas ainda faltava:

- saber quantas mensagens foram ignoradas, duplicadas, processadas e falharam
- saber onde o tempo estava sendo gasto
- retry controlado para falha temporaria de envio
- trava mais segura para dois workers nao pegarem o mesmo `pending`

## Gargalos praticos encontrados

### Observabilidade

- existiam logs de console, mas nao uma trilha operacional simples para contar eventos do pipeline
- nao havia registro consistente de `retryCount`, `lastRetryAt` e `nextRetryAt`
- nao havia medicao clara de `queueLatencyMs`, `processingDurationMs` e `inboxToOutboxMs`

### Retry

- falha de envio podia cair direto em erro final cedo demais
- nao existia um backoff simples e previsivel
- faltava diferenciar "erro terminal" de "falha temporaria"

### Concorrencia

- dois workers podiam enxergar o mesmo `pending` antes da troca de status
- o claim da mensagem ainda nao era transacional

### Escala inicial

- o worker continua baseado em polling
- o `ChatService` ainda e o maior bloco de CPU/logica
- Firestore continua sendo a principal camada de custo e consulta

## Melhorias aplicadas

### 1. Audit trail operacional

Foram adicionados eventos estruturados em `integration_events` com `kind: pipeline_audit`.

Agora fica mais facil medir:

- total recebido
- total ignorado
- total duplicado
- total aceito para inbox
- total processado
- total com erro
- retries agendados
- falhas finais de envio

### 2. Metricas leves no inbox/outbox

Foram adicionados ou reforcados campos como:

- `createdAtIso`
- `processingStartedAtIso`
- `processedAtIso`
- `queueLatencyMs`
- `processingDurationMs`
- `inboxToOutboxMs`
- `retryCount`
- `lastRetryAtIso`
- `nextRetryAtIso`
- `sentAtIso`

Isso nao troca o modelo do produto. So melhora a auditabilidade.

### 3. Retry inteligente e simples

Foi aplicado retry incremental no envio:

- maximo padrao: 3 tentativas
- status intermediario: `retrying`
- intervalo progressivo via `EVOLUTION_RETRY_BASE_DELAY_MS`
- campos de controle:
  - `retryCount`
  - `lastRetryAtIso`
  - `nextRetryAtIso`

O objetivo e evitar perder mensagem por falha temporaria da Evolution ou rede.

### 4. Claim transacional do inbox

Antes de processar, o worker agora faz um claim transacional no `message_inbox`.

Isso reduz o risco de:

- dois workers pegarem o mesmo `pending`
- processamento simultaneo da mesma mensagem

### 5. Webhook mais auditavel

O webhook passou a registrar melhor:

- evento ignorado
- evento duplicado
- evento aceito
- falha ao enfileirar

## Riscos remanescentes

Ainda continuam como riscos importantes:

- estado conversacional ainda depende de memoria em partes do fluxo
- polling do worker nao e fila real
- `ChatService` continua sendo o principal gargalo logico
- o `WhatsappBridge` continua existindo como legado/local
- ha pelo menos um fluxo especial que grava em `message_outbox` fora do worker

## Leitura pratica de escala

### Ate 100 usuarios

- deve aguentar bem se o uso for moderado
- os ganhos desta sprint ja melhoram rastreabilidade e falha temporaria

### Ate 1.000 usuarios

- ainda e viavel, mas o polling e o Firestore passam a pesar mais
- retry e logs ajudam operacao, mas custo e latencia comecam a aparecer

### Ate 10.000 usuarios

- o maior gargalo passa a ser:
  - polling do worker
  - custo do Firestore
  - custo/latencia do `ChatService`
  - volume de logs em `integration_events`

Nesse nivel, o proximo passo natural sera:

- fila mais madura
- agregacao de metricas
- leitura mais seletiva
- controle melhor de concorrencia por lote

## O que foi preservado

- contrato externo do pipeline oficial
- `ChatService` como cerebro principal
- `message_inbox` e `message_outbox`
- webhook oficial da Evolution

## Proximos passos recomendados

1. rodar o checklist manual desta sprint
2. validar duplicidade e retry em ambiente real
3. criar uma visao simples de metricas operacionais a partir de `integration_events`
4. revisar fluxos especiais que ainda escrevem em `message_outbox` fora do worker
5. planejar uma futura camada de fila/lease mais robusta se o volume subir
