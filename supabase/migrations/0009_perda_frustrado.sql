-- Perda REAL de um pedido frustrado.
--
-- O valor do pedido (ex.: R$ 735) é a receita que não entrou, não o
-- dinheiro que saiu do caixa. O que se perde de fato é o custo do
-- produto + o frete de ida. Por padrão a perda é calculada assim;
-- esta coluna guarda o ajuste manual quando o caso é diferente
-- (ex.: o produto voltou e só o frete foi perdido).
--
-- NULL = usar o cálculo automático (COGS do plano + frete).
alter table public.bluesales_pedidos
  add column if not exists perda_real numeric(12,2);
