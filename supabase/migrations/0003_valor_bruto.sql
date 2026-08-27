-- Adiciona o valor CHEIO do pedido (sem desconto), usado no faturamento
-- agendado. O campo `valor` continua sendo o líquido (base da receita).
alter table public.bluesales_pedidos
  add column if not exists valor_bruto numeric(12,2);
