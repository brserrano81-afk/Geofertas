# Geofertas Quality Run - 2026-04-24

## Resultado executivo

Status: aprovado com ressalvas operacionais.

O projeto esta com build e testes principais passando, dados reais carregados e contratos criticos do WhatsApp protegidos. Ainda nao esta pronto para producao sem corrigir os riscos de seguranca/operacao abaixo.

## Gates executados

| Gate | Resultado | Observacao |
| --- | --- | --- |
| `npm run build` | PASS | Build Vite/TypeScript concluido. Aviso de chunk grande: `index-HEMUFIS2.js` 598.74 kB, gzip 182.39 kB. |
| `npm run test:e2e` | PASS | 6/6 testes Playwright passaram. |
| `npm run test:whatsapp` | PASS com ressalva | Pipeline cria resposta/outbox, mas envio Evolution retornou 400 e foi para retry. |
| `node --test tests/integration/whatsapp-location-contract.test.mjs` | PASS | 5/5 contratos de localizacao passaram. |
| `node --test tests/integration/whatsapp-audio-price.test.mjs` | PASS | 2/2 contratos de audio/preco passaram. |
| `npm run catalog:coverage` | PASS | 466 produtos, 3973 ofertas ativas, 1 nome sem match. |
| `npm audit --audit-level=moderate` | PASS | 0 vulnerabilidades reportadas. |
| `npm run lint` | FAIL | 199 erros de lint. Predominam `any`, whitespace irregular e regras React. |

## Achados criticos

1. Firestore ainda permite acesso publico de leitura/escrita em colecoes operacionais:
   - `markets`
   - `offers`
   - `campaigns`
   - `offer_queue`

   Arquivo: `firestore.rules`.
   Isso e blocker de producao ate migrar para Auth + custom claims ou backend-only writes.

2. Credencial Firebase versionada:
   - `EconomizaFacil-Firebase/serviceAccountKey.json`

   `.gitignore` protege `service-account.json`, mas este caminho antigo continua rastreado. Deve ser removido do Git e a chave deve ser rotacionada.

3. Envio real pela Evolution falha no teste WhatsApp:
   - `sendPresence` retorna 400: payload esperado requer `presence` e `delay` em formato diferente.
   - `sendText` tambem retorna 400 para os payloads tentados.
   - O teste passa porque valida outbox, mas a entrega real fica em retry.

4. CI/CD nao existe no repo:
   - Sem `.github/workflows`.
   - Build/test/lint nao rodam automaticamente em PR.

## Achados altos

1. Lint esta muito longe de virar gate:
   - 199 erros.
   - Muitos sao divida tecnica (`no-explicit-any`), mas alguns sao bugs/padroes ruins: componente criado durante render, `setState` sincrono em effect, unused expressions, unused vars.

2. Bundle principal acima do alvo do squad:
   - Target do squad: <150 kB gzip.
   - Atual: 182.39 kB gzip.
   - Recomendado: code splitting para admin/Firebase/rotas pesadas.

3. Config Firebase web usa fallback quando env vars Vite ausentes:
   - O build/test continua, mas isso pode mascarar ambiente incompleto.

4. Testes unitarios de `src/` inexistentes:
   - Ha E2E e integracao, mas nenhum `*.test.ts[x]` em `src`.
   - Cobertura numerica ainda nao existe.

## O que esta saudavel

- Build passa.
- E2E passa.
- Contratos de localizacao, audio e preco passam.
- Catalogo tem massa real forte: 466 produtos e 3973 ofertas ativas.
- `npm audit` nao aponta vulnerabilidades.
- Storage rules estao melhores que Firestore: receipts/admin protegidos, offers public read e writes por admin.

## Proximas acoes recomendadas

1. Corrigir entrega Evolution no `EvolutionInboxWorker`.
   - Ajustar payload de `sendPresence`.
   - Validar formato de `sendText` contra a instancia atual.
   - Adicionar teste que falha quando envio real retorna 400, nao apenas quando outbox e criado.

2. Remover credencial versionada e rotacionar chave.
   - Remover `EconomizaFacil-Firebase/serviceAccountKey.json` do Git.
   - Confirmar que nenhuma chave antiga continua valida.

3. Travar Firestore para producao.
   - Substituir `allow read, write: if true` por regras com auth/custom claims.
   - Manter writes sensiveis via Admin SDK/backend.

4. Criar CI minimo.
   - `npm run build`
   - `npm run test:e2e`
   - `node --test tests/integration/whatsapp-location-contract.test.mjs`
   - `node --test tests/integration/whatsapp-audio-price.test.mjs`
   - `npm audit --audit-level=moderate`

5. Transformar lint em plano incremental.
   - Primeiro corrigir erros comportamentais.
   - Depois reduzir `any` por modulo, sem bloquear build ate estabilizar.

## Decisao do squad

Pode avancar para squads de backend/data com seguranca de regressao basica, mas nao publicar producao antes dos tres blockers:

- Firestore publico em colecoes operacionais.
- Credencial Firebase rastreada no Git.
- Evolution retornando 400 no envio real.
