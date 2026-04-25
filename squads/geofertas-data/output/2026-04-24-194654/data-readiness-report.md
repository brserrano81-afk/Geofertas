# Geofertas Data Run - 2026-04-24

## Resultado executivo

Status: aprovado para uso controlado, com pendencias de higiene e performance.

O catalogo nao esta vazio: existe uma base real forte para MVP. O gargalo atual e qualidade/higiene de ofertas legadas e tempo de execucao do relatorio completo.

## Gates executados

| Gate | Resultado | Observacao |
| --- | --- | --- |
| `npm run catalog:coverage` | PASS | 466 produtos, 3973 ofertas ativas, 1 nome sem match. |
| `npm run offers:report` | TIMEOUT | Gerou arquivo parcial/completo em `logs/runtime/offer-hygiene-report-1777070788091.json`, mas o comando nao encerrou em 5 minutos. |

## Cobertura de catalogo

Totais atuais:

- Produtos catalogados: 466
- Ofertas ativas: 3973
- Nomes de oferta sem match: 1
- Seed candidates sugeridos: 0

Termos basicos com cobertura:

- arroz: 8 produtos, 72 ofertas ativas
- feijao: 4 produtos, 40 ofertas ativas
- oleo: 8 produtos, 72 ofertas ativas
- cafe: 20 produtos, 168 ofertas ativas
- leite: 27 produtos, 224 ofertas ativas
- cerveja: 22 produtos, 250 ofertas ativas
- refrigerante: 8 produtos, 72 ofertas ativas
- papel higienico: 8 produtos, 70 ofertas ativas
- detergente: 10 produtos, 86 ofertas ativas
- shampoo: 6 produtos, 48 ofertas ativas

Categorias mais fracas por ratio:

- congelados: 28 produtos, 224 ofertas, ratio 8
- bazar: 2 produtos, 16 ofertas, ratio 8
- doces_biscoitos: 12 produtos, 96 ofertas, ratio 8
- padaria: 11 produtos, 88 ofertas, ratio 8
- higiene_pessoal: 34 produtos, 278 ofertas, ratio 8.18
- laticinios: 52 produtos, 430 ofertas, ratio 8.27
- acougue: 65 produtos, 539 ofertas, ratio 8.29
- frios_embutidos: 21 produtos, 174 ofertas, ratio 8.29

Unmatched principal:

- `Marcas mais baratas Econômica`

## Higiene de ofertas

Arquivo gerado:

- `logs/runtime/offer-hygiene-report-1777070788091.json`

Resumo do relatorio:

- Total analisado: 5556 ofertas
- Archive candidates: 0
- Review candidates: 1756
- Principais motivos tecnicos:
  - `technical_name`: 1583
  - `category_outros_without_catalog_match`: 1423
- Principais motivos de revisao:
  - `suspicious_source`: 1755
  - `already_inactive`: 1583
  - `category_outros_but_catalog_match`: 160
  - `catalog_miss`: 1

Observacao: o script cria o arquivo, mas nao encerra dentro de 5 minutos. Deve haver custo alto de matching ou handle pendente mantendo o processo aberto.

## Inventario de scripts

Scripts modernos em `src/scripts`:

- `reportCatalogCoverage.ts`
- `reportOfferHygiene.ts`
- `seedTestOfferUniverse.ts`
- `upsertPopularCatalogProducts.ts`
- `importStapleOffersFromCsv.ts`
- `generateStapleGapTemplate.ts`
- `archiveBadOffers.ts`
- `masterSeed.ts`
- seeds Atacadao/Extrabom

Scripts legados em `EconomizaFacil-Firebase`:

- Muitos scripts operacionais antigos ainda existem.
- A pasta contem `serviceAccountKey.json` rastreado, que deve ser removido/rotacionado.

## Achados

1. A meta original do squad de 1000+ produtos ainda nao foi atingida, mas a base atual ja e suficiente para MVP controlado.
2. A cobertura de staples esta boa para fluxos de arroz, cafe, leite, cerveja e itens recorrentes.
3. O relatorio de higiene encontrou muita oferta que precisa revisao por `suspicious_source`.
4. O pipeline de higiene precisa ser otimizado para encerrar corretamente e rodar em CI.
5. O schema real diverge do schema ideal do squad: o produto usa `catalog_products`/`offers` na pratica, nao exatamente `/products` com refs fortes.

## Proximas tarefas data

1. Corrigir `npm run offers:report` para encerrar em menos de 2 minutos.
2. Limpar ou normalizar `source` das 1755 ofertas com `suspicious_source`.
3. Resolver `Marcas mais baratas Econômica` como dado sintetico, sinonimo ou item excluido da cobertura.
4. Expandir catalogo para 1000 produtos apenas depois da higiene dos 466 atuais.
5. Criar um score simples de data quality versionado em JSON para CI.
6. Separar scripts legados de scripts oficiais e documentar qual roda em producao.

## Decisao

Pode usar os dados atuais no MVP. Nao escalar importacao massiva antes de corrigir higiene/performance do relatorio e remover credencial rastreada.
