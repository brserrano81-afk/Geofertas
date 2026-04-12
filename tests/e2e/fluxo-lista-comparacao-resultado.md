# TESTE E2E — FLUXO PRINCIPAL MVP

## Objetivo
Validar o fluxo completo:
lista → comparação → resultado

---

## Cenário 1 — criar lista

### Entrada
Usuário acessa CriarLista

### Ação
Adicionar itens:
- arroz
- leite
- pão

### Resultado esperado
Lista salva com sucesso

---

## Cenário 2 — comparar preços

### Ação
Clicar em "Comparar preços"

### Resultado esperado
Sistema executa ShoppingComparisonService

---

## Cenário 3 — exibir ranking

### Resultado esperado
Exibir 3 mercados mais baratos

Exemplo:
1. Mercado A — R$ 48,90
2. Mercado B — R$ 52,30
3. Mercado C — R$ 55,00

---

## Cenário 4 — itens sem preço

### Resultado esperado
Itens não encontrados exibidos separadamente

Exemplo:
- pão integral

---

## Cenário 5 — compartilhamento

### Resultado esperado
Botão compartilhar funcionando