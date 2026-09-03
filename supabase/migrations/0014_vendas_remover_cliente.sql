-- Duas colunas para a tela "Vendas Agendadas".
--
-- 1. removido_em — venda tirada da nossa plataforma à mão.
--
-- Quando uma venda é cancelada e EXCLUÍDA no BlueSales, ele não manda
-- evento nenhum: o pedido simplesmente some de lá e fica preso aqui,
-- inflando o Faturamento Agendado. Marcar em vez de apagar de verdade
-- preserva o histórico e deixa desfazer.
--
-- NULL = venda ativa. Preenchido = fora de todos os cálculos.
alter table public.bluesales_pedidos
  add column if not exists removido_em timestamptz;

-- 2. cliente — nome de quem comprou, só o primeiro nome + sobrenome.
--
-- Até aqui nenhum dado do cliente era guardado (o webhook descarta o
-- bloco inteiro antes de gravar o log). O nome passa a ser gravado
-- porque sem ele não dá para conferir uma venda contra o BlueSales nem
-- saber qual excluir — os 4 agendamentos de hoje são todos de R$ 735,00.
--
-- Continuam FORA do banco: CPF, e-mail, telefone e endereço.
alter table public.bluesales_pedidos
  add column if not exists cliente text;

create index if not exists idx_pedidos_ativos
  on public.bluesales_pedidos (user_id, data)
  where removido_em is null;
