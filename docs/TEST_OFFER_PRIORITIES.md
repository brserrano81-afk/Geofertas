# Test Offer Priorities

## Objetivo

Povoar a base de teste com itens que melhoram a percepção do produto no WhatsApp, sem bagunçar a base real.

## Família 1: Arroz

Prioridade alta porque o usuário espera variedade de marcas quando pergunta só `arroz`.

Marcas prioritárias:

- Tio João
- Camil
- Prato Fino
- Saboroso
- Alegre
- Puro Grão

Produtos canônicos já existentes:

- `arroz-tio-joao-5kg`
- `p_arroz_camil_5kg`
- `p_arroz_pratofino_5kg`
- `prod_6e032ae791419601`
- `prod_9dd23acc62eaaf83`
- `prod_f3f9c551d28c15f8`

## Família 2: Refrigerante

Prioridade alta porque amplia muito a sensação de catálogo cheio.

Marcas prioritárias:

- Coca-Cola
- Fanta
- Coroa
- UAI

Produtos canônicos já existentes:

- `refrigerante-coca-2l`
- `prod_90b99835ed363811`
- `prod_5c178a962c87bf85`
- `prod_aef6e365283db42a`
- `prod_681bea5d9a031409`
- `prod_7d743a8362179ca1`
- `prod_7e20ef65a4c2a0d7`
- `prod_cacbfaa5ef46a782`

## Família 3: Shampoo

Prioridade alta porque hoje o catálogo existe, mas as ofertas estão zeradas.

Usar só itens de cabelo mesmo.

Produtos prioritários:

- `prod_8fdd8746fa21764b` — Shampoo Dove
- `prod_a7b009eddf323ace` — Shampoo Palmolive SOS Cuidados Especiais
- `prod_41dda2f81db3465f` — Kit Shampoo + Condicionador Griffus 1L

Não usar no primeiro lote:

- `prod_6193a75cabb4ce30` — condicionador
- `prod_94a431676500cf6f` — sabonete
- `prod_f6af0af9bd96196a` — desodorante

## Mercados Prioritários

Usar primeiro os mercados com mais força de teste:

- Assaí Atacadista Goiabeiras
- Carone Praia da Costa
- Atacadão Camburi
- BH Supermercados Camburi
- Casagrande Serra
- Extrabom Praia de Campista
- Assaí Serra
- Assaí Atacadista Laranjeiras

## Estratégia Recomendada

1. Popular primeiro em `test_seed`
2. Validar no WhatsApp
3. Depois preencher os mesmos itens com preço real no CSV de importação
4. Só então reforçar a base real
