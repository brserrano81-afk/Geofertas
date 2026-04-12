# Checklist de operacao do WhatsApp

## Objetivo

Validar o pipeline oficial:

`Evolution webhook -> message_inbox -> EvolutionInboxWorker -> ChatService -> message_outbox`

## 1. Webhook recebe

- enviar um evento de teste para `/webhook/whatsapp-entrada`
- validar que a resposta HTTP volta com `ok: true`
- validar que existe `correlationId` na resposta

## 2. Inbox grava

- conferir se a mensagem foi criada em `message_inbox`
- conferir se `status` inicial ficou como `pending`
- conferir se `messageId` e `correlationId` ficaram registrados

## 3. Worker pega item pending

- rodar o worker
- validar se ele encontrou o item `pending`
- validar log com `correlationId`

## 4. Item muda para processing

- conferir no `message_inbox` se o item mudou para `processing`
- conferir se existe `processingStartedAt`

## 5. ChatService processa

- validar que o item gera resposta textual
- testar pelo menos:
  - preco de 1 item
  - ver lista
  - preferencia

## 6. Outbox registra

- conferir se existe item em `message_outbox`
- conferir se o `inboxId` bate com a origem
- conferir se `correlationId` e `sourceMessageId` ficaram registrados

## 7. Falha fica auditavel

- simular falha de envio da Evolution
- validar se:
  - o outbox fica com `send_failed` ou `pending_send`
  - o inbox nao some
  - o erro fica registrado
  - ainda existe `correlationId` para rastrear a origem

## 8. Mensagem nao e processada duas vezes sem controle

- reenviar o mesmo evento com mesmo `messageId`
- validar se nao cria outra mensagem nova no inbox
- validar se o sistema reutiliza o registro existente ou ignora a duplicidade
