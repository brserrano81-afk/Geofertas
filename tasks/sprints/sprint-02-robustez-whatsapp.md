# Sprint 02 - Robustez operacional do WhatsApp

## Fluxo oficial encontrado

Fluxo oficial identificado no codigo:

`Evolution webhook -> message_inbox -> EvolutionInboxWorker -> ChatService -> message_outbox`

Leitura pratica:

1. o webhook recebe o evento da Evolution
2. o evento e normalizado
3. o evento e salvo em `integration_events`
4. a mensagem e gravada em `message_inbox`
5. o worker busca itens `pending`
6. o worker chama `ChatService`
7. a resposta e enviada pela Evolution
8. a resposta fica registrada em `message_outbox`
9. o inbox recebe status final

## Arquivos centrais

- `api/sefaz-proxy.js`
- `src/workers/EvolutionInboxWorker.ts`
- `src/services/ChatService.ts`
- `src/whatsapp/WhatsappBridge.ts`

## Riscos encontrados

- webhook aceitava entradas ruins com pouca validacao
- havia risco de duplicidade basica por `messageId`
- faltava correlation id claro entre webhook, inbox, worker e outbox
- outbox tinha vinculo ao inbox, mas pouca rastreabilidade da origem
- erro podia existir, mas sem padrao unico de correlacao
- fluxo legado `WhatsappBridge` continua coexistindo com o oficial

## Melhorias feitas

- adicionado `correlationId` no webhook normalizado
- persistencia de `correlationId` em `integration_events`
- persistencia de `correlationId` e `sourceMessageId` em `message_outbox`
- logs do worker com `correlationId`
- validacao basica de evento antes do enqueue
- ignorar eventos invalidos com resposta `202` e motivo claro
- checagem basica de duplicidade por `messageId + remoteJid`
- status de processamento com mais contexto
- avisos explicitos de que `WhatsappBridge` e legado/local

## Legado identificado

- `src/whatsapp/WhatsappBridge.ts`
  - conversa direto com `whatsapp-web.js`
  - nao usa inbox/outbox como fluxo principal
  - deve ser tratado como ferramenta local, nao como operacao oficial

## Proximos riscos

- estado conversacional ainda fica em memoria
- worker ainda usa polling simples
- nao existe fila transacional real
- ainda pode haver concorrencia se o legado for usado junto com o oficial
- ainda faltam testes operacionais mais automaticos

## Proximos passos recomendados

- validar manualmente o pipeline oficial com o checklist desta sprint
- decidir operacionalmente que o bridge legado nao sera usado em producao
- depois atacar observabilidade e politicas de retry com mais profundidade
