# Firebase Seed Strategy

## Objetivo

Manter o Firebase forte para busca e recomendação sem inventar dados nem poluir o catálogo.

## Regra de ouro

- GitHub guarda código.
- Firebase guarda dados do produto.
- Não inventar ofertas nem preços.
- Só criar produtos novos quando houver evidência real na base ou fonte confiável.

## Modo de teste

Para testes funcionais com base povoada:

- usar ofertas marcadas com `source: test_seed`
- usar `environment: staging`
- usar `synthetic: true`

Controle por ambiente:

- `OFFER_DATA_MODE=real` mostra só ofertas reais
- `OFFER_DATA_MODE=test` mostra só ofertas sintéticas
- `OFFER_DATA_MODE=all` mistura tudo

Scripts:

- `npm run offers:test-seed`
- `npm run offers:test-seed -- --apply`
- `npm run offers:test-clear`
- `npm run offers:test-clear -- --apply`

## O que pode subir no Firebase

- `products`
- `offers`
- `markets`
- `categories`
- `users`
- interações, listas e memória do app

## O que não sobe no Firebase

- código-fonte
- `.env`
- sessão do WhatsApp
- logs locais
- cache técnico

## Estratégia de seed

### 1. Catálogo

Criar ou atualizar produto quando:

- o item aparece em ofertas reais
- existe categoria válida
- o nome é claro
- há repetição suficiente para justificar canonização

Evitar criar produto quando:

- o nome parece ruído técnico
- o item aparece só uma vez e de forma ambígua
- a marca ou variação não está clara

### 2. Ofertas

Subir oferta quando:

- preço é real
- mercado é identificável
- produto é identificável
- categoria é válida

Nunca criar oferta fictícia só para “preencher buraco”.

### 3. Prioridade

1. Mercearia básica
2. Bebidas
3. Laticínios
4. Limpeza
5. Higiene pessoal
6. Açougue e hortifruti

## Diagnóstico atual

Relatório gerado por:

- `npm run catalog:coverage`
- `npm run catalog:staple-template`

Arquivo mais recente:

- `logs/runtime/catalog-coverage-report-1775354162315.json`

## Leitura atual da base

- `products`: 466
- `activeOffers`: 245
- `categories`: 14
- `markets`: 151

## Principais achados

- O catálogo está mais forte que a cobertura de ofertas.
- `cerveja` está bem coberta em marcas.
- `arroz`, `feijao`, `oleo`, `cafe`, `leite` ainda têm baixa diversidade de marcas nas ofertas ativas.
- `refrigerante` e `shampoo` têm catálogo, mas sem ofertas ativas suficientes.
- `congelados`, `padaria`, `doces_biscoitos` e `bazar` estão fracos em ofertas.

## Próximos passos seguros

1. Repetir `npm run catalog:coverage` sempre antes de uma nova carga.
2. Gerar o template com `npm run catalog:staple-template`.
3. Preencher apenas preços reais, data de coleta e fonte.
4. Validar com `npm run catalog:import-staples -- caminho-do-arquivo.csv` em modo dry-run.
5. Aplicar só depois com `npm run catalog:import-staples -- caminho-do-arquivo.csv --apply`.
6. Criar produto canônico novo só quando surgir evidência estável nas ofertas.
7. Fazer cargas pequenas por categoria e validar no WhatsApp.
