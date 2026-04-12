# Checklist de Blindagem WhatsApp

## Objetivo

Validar manualmente se o fluxo oficial continua inteiro:

`Evolution webhook -> message_inbox -> EvolutionInboxWorker -> ChatService -> message_outbox`

## Preparacao

- subir o proxy/webhook local
- subir o worker Evolution
- confirmar que o Firestore esta acessivel
- confirmar que as variaveis de ambiente principais estao configuradas

## Bloco 1 - Entrada da mensagem

### Teste 1: texto simples

- acao:
  - enviar payload de teste para o webhook oficial
- validar:
  - webhook responde `200`
  - evento fica registrado em `integration_events`
  - mensagem aparece em `message_inbox`
  - status inicial fica como `pending`

### Teste 2: mensagem com varios produtos

- acao:
  - enviar texto como `arroz, feijao e cafe`
- validar:
  - mensagem entra no inbox
  - nao ocorre erro no webhook

### Teste 3: imagem ou simulacao de imagem

- acao:
  - enviar mensagem de imagem pelo canal disponivel de teste
- validar:
  - worker identifica o tipo de mensagem
  - processamento segue para o fluxo de imagem/cupom

## Bloco 2 - Processamento

### Teste 4: consumo do inbox

- validar:
  - worker encontra itens `pending`
  - worker muda status para `processing`
  - nao deixa mensagem parada sem motivo

### Teste 5: chamada ao ChatService

- validar:
  - texto simples gera resposta
  - resposta nao vem vazia
  - erro de IA, se ocorrer, fica visivel no log ou status

## Bloco 3 - Contexto da conversa

### Teste 6: criar e continuar lista

- acao:
  - mandar `lista: arroz e feijao`
  - depois mandar `cafe`
  - depois mandar `ver lista`
- validar:
  - lista fica vinculada ao mesmo usuario
  - o segundo passo continua o contexto
  - `ver lista` mostra a lista atual

### Teste 7: confirmar compra

- acao:
  - enviar cupom
  - responder `OK`
- validar:
  - contexto pendente e respeitado
  - compra e salva para o usuario certo

## Bloco 4 - Resposta

### Teste 8: resposta normal

- validar:
  - resposta sai pelo worker oficial
  - resposta e registrada em `message_outbox`
  - status final do inbox muda para `done` ou equivalente

### Teste 9: compartilhamento

- acao:
  - acionar fluxo de compartilhar lista
- validar:
  - ha registro de saida
  - numero e tratado como destino especifico

## Bloco 5 - Persistencia

### Teste 10: historico

- validar:
  - interacao de usuario e assistente fica em `users/{userId}/interactions`

### Teste 11: lista

- validar:
  - lista ativa aparece em `users/{userId}/lists`

### Teste 12: compra

- validar:
  - compra confirmada aparece em `users/{userId}/purchases`

## Bloco 6 - Falha e rastreabilidade

### Teste 13: falha no envio

- acao:
  - simular indisponibilidade de envio Evolution
- validar:
  - erro fica registrado
  - `message_outbox` nao some
  - `message_inbox` mostra status de falha ou pendencia

### Teste 14: falha no processamento

- acao:
  - enviar payload invalido ou mensagem que gere erro controlado
- validar:
  - erro fica visivel no log
  - mensagem nao desaparece sem rastreio

## Resultado esperado da blindagem

Se este checklist passar, o projeto esta protegido para iniciar a proxima sprint tecnica com menos risco.

Se este checklist falhar, a prioridade nao e refatorar.

A prioridade passa a ser estabilizar o fluxo oficial.
