# Checklist manual - escala inicial e robustez do WhatsApp

## Objetivo

Validar se o pipeline oficial continua confiavel com:

- duplicidade
- concorrencia
- retry
- erro de envio
- latencia
- volume inicial

Pipeline oficial:

`Evolution webhook -> message_inbox -> EvolutionInboxWorker -> ChatService -> message_outbox`

## 1. Duplicidade

- enviar o mesmo evento duas vezes com o mesmo `messageId`
- validar que:
  - o webhook responde sem quebrar
  - o segundo evento fica marcado como duplicado
  - nao surgem dois itens validos para a mesma mensagem no `message_inbox`

## 2. Concorrencia

- iniciar dois workers ao mesmo tempo
- enviar uma mensagem nova
- validar que:
  - apenas um worker faz o claim do inbox
  - a mensagem nao recebe duas respostas
  - o `status` nao fica alternando de forma estranha

## 3. Retry

- simular falha temporaria de envio na Evolution
- validar que:
  - o inbox vai para `awaiting_send`
  - o outbox vai para `retrying`
  - `retryCount` aumenta
  - `lastRetryAtIso` e `nextRetryAtIso` sao preenchidos

## 4. Erro de envio final

- forcar falha repetida ate estourar o limite de retries
- validar que:
  - o outbox vai para `send_failed`
  - o inbox vai para `error`
  - a falha continua auditavel em `integration_events`

## 5. Latencia

- enviar uma mensagem simples
- validar que:
  - `queueLatencyMs` foi preenchido
  - `processingDurationMs` foi preenchido
  - `processedAtIso` foi preenchido

## 6. Volume inicial

- enviar um pequeno lote de mensagens em sequencia
- validar que:
  - o worker continua escoando o backlog
  - nao aumenta duplicidade indevida
  - nao cresce erro sem rastreabilidade

## 7. Auditoria

- consultar `integration_events`
- validar que existem eventos de:
  - `webhook_validation`
  - `inbox_enqueue`
  - `inbox_processing`
  - `outbox_delivery`
  - `outbox_retry`

## 8. Fluxo real

- testar pelo menos uma mensagem normal de usuario
- validar que:
  - o usuario continua recebendo resposta normal
  - o pipeline oficial continua sendo o mesmo
  - nenhuma mudanca da sprint alterou a experiencia principal
