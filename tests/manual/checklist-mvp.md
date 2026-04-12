# ROTEIRO DE TESTE REAL — WHATSAPP

## 1. lista completa
- mensagem: adiciona arroz, feijão e café
- depois: onde comprar minha lista
- resultado esperado:
  lista ativa criada ou atualizada com os 3 itens e resposta com melhor mercado, ranking resumido, total estimado e cobertura completa ou parcial coerente com os dados disponíveis

## 2. lista vazia
- mensagem: onde comprar minha lista
- resultado esperado:
  resposta informando que a lista está vazia e orientando o usuário a adicionar itens antes de comparar

## 3. cobertura parcial
- mensagem: adiciona arroz, café e produto raro xyz
- depois: onde comprar minha lista
- resultado esperado:
  resposta com melhor opção parcial para a lista, cobertura menor que o total de itens e destaque claro para o item faltante, incluindo "produto raro xyz" se não houver oferta

## 4. recalcular
- mensagem: tira o café da lista
- depois: onde comprar minha lista
- resultado esperado:
  lista atualizada sem o café e novo comparativo refletindo o total, ranking e cobertura recalculados com base na lista restante
