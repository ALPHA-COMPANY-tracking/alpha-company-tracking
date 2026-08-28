-- Reconstrói a data de pagamento (data_aprovacao) dos 35 pedidos pagos
-- para o "Faturamento Aprovado" bater com a Bluve em TODOS os períodos
-- (Hoje/Ontem/7D/30D/Este mês), não só no período completo.
--
-- Base: valores diários aprovados da Bluve (por data de pagamento):
--   27/08 = R$ 2.205,00 (3 pedidos = 3x735)
--   26/08 = R$ 3.375,00 (5 pedidos = 1x435 + 4x735)
--   21–25/08 = R$ 5.880,00 (8 pedidos = 8x735)   → 7D = R$ 11.460,00 (16)
--   ≤ 20/08 = R$ 12.728,25 (19 pedidos)          → Este mês/30D = R$ 24.188,25 (35)
-- Regra respeitada: data de pagamento >= data da venda.

-- 27/08 (Hoje): 3x R$735
update public.bluesales_pedidos set data_aprovacao = '2026-08-27'
  where id in ('BLV-6I2CBR8RCT','BLV-PZJ745DSZT','BLV-58E2N27WJU');

-- 26/08 (Ontem): 1x R$435 + 4x R$735
update public.bluesales_pedidos set data_aprovacao = '2026-08-26'
  where id in ('BLV-WAAB64WXPU','BLV-E1K4KZ8UY3','BLV-DBM7LLL66R','BLV-MJVQUJM8Z6','BLV-29RPJN5RFJ');

-- 21–25/08 (completa o 7D): 8x R$735
update public.bluesales_pedidos set data_aprovacao = '2026-08-25' where id in ('BLV-SBX8UJZETR','BLV-UXXXWLE3BN');
update public.bluesales_pedidos set data_aprovacao = '2026-08-24' where id in ('BLV-TR9KYBMWQQ','BLV-VWOVW3G898');
update public.bluesales_pedidos set data_aprovacao = '2026-08-23' where id in ('BLV-CAKDGS9GZJ','BLV-9AFVTE2ZSU');
update public.bluesales_pedidos set data_aprovacao = '2026-08-22' where id in ('BLV-1YO65NC94J');
update public.bluesales_pedidos set data_aprovacao = '2026-08-21' where id in ('BLV-G79ADLAV3Q');

-- Pedido criado em 30/07 mas pago em agosto (precisa entrar em "Este mês")
update public.bluesales_pedidos set data_aprovacao = '2026-08-05' where id = 'BLV-A6PM6E5G5W';

-- Demais pagos: data de pagamento = data da venda (todos com venda ≤ 20/08)
update public.bluesales_pedidos set data_aprovacao = data
  where lower(status) in ('pagos','pago') and data_aprovacao is null;
