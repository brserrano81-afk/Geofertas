# Sprint 01 - Estabilizacao do nucleo conversacional

## Antes

- `ChatService.ts` concentrava onboarding, lista, cupom, perfil, historico, ofertas, compartilhamento e varios hotfixes no mesmo fluxo grande.
- `ConversationStateService.ts` tinha a logica principal funcionando, mas com normalizacao repetida, listas de palavras embutidas e resolucao de estado dificil de ler.
- o contrato externo ja funcionava, mas o cerebro estava ficando pesado e dificil de manter.

## Depois

- o contrato publico foi preservado:
  - `chatService.processMessage(...)`
  - `chatService.processImage(...)`
- o `ChatService` continua sendo a fachada principal, mas varios trechos foram reorganizados em helpers internos por dominio.
- o `ConversationStateService` ficou mais legivel com helpers internos para:
  - normalizacao de mensagem
  - expiracao de estado
  - estados quentes
  - resolucao padronizada de pendencias

## O que foi preservado

- fluxo oficial WhatsApp First
- interface publica do `ChatService`
- estados existentes do `ConversationStateService`
- comportamento principal de lista, cupom, historico, ofertas e perfil
- estrutura geral do state machine

## O que foi reorganizado

### ChatService

Foram extraidos helpers internos para reduzir mistura de responsabilidades:

- confirmacao pendente de compra
- tratamento de acoes pendentes do state machine
- recuperacao de lista
- adicao de itens na lista
- decisao de multi escolha
- confirmacao de gasto
- fluxo de construcao de lista
- fluxo de cupom
- confirmacao e cancelamento de compra
- preferencias
- ofertas por mercado
- ofertas por categoria
- historico de preco
- registro e analise de gasto
- exibicao de lista
- historico recente
- criacao, adicao e remocao de lista
- preco unitario

### ConversationStateService

Foi reorganizado para reduzir fragilidade interna:

- criacao de `PendingResolution`
- centralizacao de listas de confirmacao e negacao
- centralizacao dos estados quentes
- helper de normalizacao
- helper de expiracao
- helper de montagem do resultado pendente

## Risco evitado

- crescer ainda mais um unico metodo gigante
- repetir regras de lista em varios trechos
- espalhar mais hotfixes pelo arquivo
- dificultar futuras mudancas seguras no fluxo oficial

## O que ainda nao foi mexido

- persistencia distribuida do estado conversacional
- estrategia de fila real para o worker
- otimizacao pesada de consultas do Firestore
- separacao do `ChatService` em arquivos externos por dominio
- limpeza definitiva do fluxo legado `WhatsappBridge`

## Proximos riscos

- o `ChatService` continua grande, mesmo mais organizado
- o estado da conversa ainda vive em memoria da sessao
- ainda existem hotfixes no fluxo principal
- ainda ha risco operacional se fluxo oficial e fluxo legado forem usados ao mesmo tempo
