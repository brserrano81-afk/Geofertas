# Geofertas Backend Run - 2026-04-24

## Resultado executivo

Status: parcialmente aprovado.

O backend oficial WhatsApp-first esta operando ate a criacao de outbox, mas ainda ha blockers de producao em seguranca Firebase, credencial rastreada e entrega real Evolution.

## Execucao realizada

| Item | Resultado |
| --- | --- |
| API audit | `api/sefaz-proxy.js` e fluxo Evolution mapeados. |
| Patch Evolution | `sendPresenceViaEvolution` agora aceita `EVOLUTION_PRESENCE_FORMAT` e tenta formatos alternativos em modo `auto`. |
| `npm run build` | PASS |
| `npm run test:whatsapp` | PASS com ressalva |
| Credenciais | `EconomizaFacil-Firebase/serviceAccountKey.json` esta rastreado no Git. `.gitignore` foi reforcado para impedir novos `serviceAccountKey.json`. |
| Firestore indexes | Indices operacionais existem para `message_inbox`, `message_outbox`, `integration_events`, `analytics_events` e `lists`. |

## Mapa de endpoints/backend

### API HTTP

- `POST /webhook/whatsapp-entrada`
- `POST /webhook/whatsapp-entrada/:event`

Arquivo: `api/sefaz-proxy.js`.

### Fluxo oficial preservado

`Evolution webhook -> message_inbox -> EvolutionInboxWorker -> ChatService -> message_outbox`

### Colecoes centrais

- `message_inbox`
- `message_outbox`
- `integration_events`
- `users`
- `offers`
- `markets`
- `campaigns`
- `offer_queue`

## Achados

### Critico: Firestore aberto em colecoes operacionais

`firestore.rules` ainda permite `allow read, write: if true` em:

- `markets`
- `offers`
- `campaigns`
- `offer_queue`

Isso deve ser resolvido antes de producao. A Home hoje le `offers` diretamente pelo client, entao bloquear a regra sem API substituta quebraria a landing. Recomendacao:

1. manter `offers` somente leitura publica se necessario para landing;
2. mover writes para Admin SDK/backend;
3. exigir admin custom claim para painel;
4. bloquear `offer_queue`, `campaigns` e writes em `markets/offers`.

### Critico: credencial Firebase rastreada

Arquivo rastreado:

- `EconomizaFacil-Firebase/serviceAccountKey.json`

Acao feita:

- `.gitignore` agora ignora `serviceAccountKey.json` em qualquer pasta.

Acao pendente:

- remover do indice Git;
- rotacionar a service account no Firebase/GCP;
- limpar historico se este repo foi ou sera publicado.

### Alto: Evolution ainda rejeita envio para numero de teste

`npm run test:whatsapp` passou porque valida resposta/outbox, mas a Evolution retornou 400 para o envio final. A mudanca adicionada deixa `sendPresence` tolerante a formatos:

- `EVOLUTION_PRESENCE_FORMAT=root`
- `EVOLUTION_PRESENCE_FORMAT=options`
- `EVOLUTION_PRESENCE_FORMAT=auto`

Mesmo assim, com o usuario fake do teste, o envio real ainda falha. Proximo passo tecnico:

- criar teste de contrato de payload sem chamar a Evolution real;
- testar envio com um `remoteJid` real controlado;
- se a instancia exigir schema especifico, fixar `EVOLUTION_SEND_FORMAT` e `EVOLUTION_PRESENCE_FORMAT` no ambiente.

### Medio: endpoints REST de produto/oferta ainda nao existem

O app web e admin acessam Firestore diretamente. Para travar as rules sem quebrar UX, o backend precisa assumir:

- leitura publica controlada de ofertas;
- administracao de mercados/ofertas/campanhas;
- fila de ofertas enviadas por usuario;
- rate limiting e validacao centralizada.

## Proximas tarefas backend

1. Criar API backend para leitura publica de ofertas da Home.
2. Criar API/admin backend para writes em `markets`, `offers`, `campaigns` e `offer_queue`.
3. Trocar painel admin para Auth + custom claims.
4. Remover credencial rastreada e rotacionar chave.
5. Adicionar teste de contrato para payloads Evolution.
6. Criar GitHub Actions com build + testes de contrato.

## Decisao

Pode continuar desenvolvimento backend, mas nao publicar producao ate resolver:

- rules Firestore;
- chave rastreada;
- contrato real de envio Evolution.
