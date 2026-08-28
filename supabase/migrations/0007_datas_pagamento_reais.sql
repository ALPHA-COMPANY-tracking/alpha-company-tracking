-- Datas de pagamento REAIS, tiradas do "Resultado Diário" do BlueSales
-- (01/08 a 28/08/2026). Substitui a reconstrução aproximada da 0006, que
-- tinha sido encaixada num único print e não sobrevivia ao deslizar das
-- janelas (7D/30D).
--
-- Conferência por dia (Qtd. Aprovados / Fat. Aprovados do BlueSales):
--   05/08 1 = 735,00      10/08 1 = 735,00      12/08 1 = 435,00
--   14/08 2 = 1.470,00    15/08 2 = 1.470,00    18/08 4 = 2.903,25
--   19/08 6 = 3.810,00    20/08 2 = 1.170,00    21/08 6 = 4.410,00
--   24/08 2 = 1.470,00    26/08 5 = 3.375,00    27/08 3 = 2.205,00
--   28/08 1 =   435,00  → total 36 pagamentos = R$ 24.623,25
-- Toda data de pagamento é >= data da venda.

update public.bluesales_pedidos set data_aprovacao = '2026-08-05' where id in ('BLV-A6PM6E5G5W');
update public.bluesales_pedidos set data_aprovacao = '2026-08-10' where id in ('BLV-E5QECDZLJD');
update public.bluesales_pedidos set data_aprovacao = '2026-08-12' where id in ('BLV-F0HB3NGTNX');
update public.bluesales_pedidos set data_aprovacao = '2026-08-14' where id in ('BLV-INFPZ3LNX8','BLV-FZNXBDE9QU');
update public.bluesales_pedidos set data_aprovacao = '2026-08-15' where id in ('BLV-5GD7H5AWXW','BLV-2A9473VWSK');
update public.bluesales_pedidos set data_aprovacao = '2026-08-18' where id in ('BLV-67GN6PGHJ5','BLV-3XV0C25H93','BLV-J8ZMYL5WP5','BLV-3GKQG2596F');
update public.bluesales_pedidos set data_aprovacao = '2026-08-19' where id in ('BLV-CVDWDXYC6V','BLV-VNYEU3LH2P','BLV-VVQGKG4ZCG','BLV-1YO65NC94J','BLV-HOMRU3V2YU','BLV-VWU6SW82BV');
update public.bluesales_pedidos set data_aprovacao = '2026-08-20' where id in ('BLV-G79ADLAV3Q','BLV-WAAB64WXPU');
update public.bluesales_pedidos set data_aprovacao = '2026-08-21' where id in ('BLV-6258NZYXV5','BLV-UIIREGSUWW','BLV-9AFVTE2ZSU','BLV-SBX8UJZETR','BLV-UXXXWLE3BN','BLV-TR9KYBMWQQ');
update public.bluesales_pedidos set data_aprovacao = '2026-08-24' where id in ('BLV-VWOVW3G898','BLV-CAKDGS9GZJ');
update public.bluesales_pedidos set data_aprovacao = '2026-08-26' where id in ('BLV-MJVQUJM8Z6','BLV-29RPJN5RFJ','BLV-E1K4KZ8UY3','BLV-DBM7LLL66R','BLV-3OZA8YSJDF');
update public.bluesales_pedidos set data_aprovacao = '2026-08-27' where id in ('BLV-58E2N27WJU','BLV-PZJ745DSZT','BLV-6I2CBR8RCT');

-- Taxas de plataforma reais por dia (derivadas do lucro diário do
-- BlueSales). Não são calculáveis a partir dos pedidos: 14/08 e 15/08
-- tiveram 2x R$ 735 e cobraram R$ 5,00 e R$ 0,00. Total do mês: R$ 25,00.
insert into public.afterpay_daily (user_id, data, taxas_plataforma)
values
  ('fabbf23a-e34b-4445-b563-222c18642189', '2026-08-12', 2.50),
  ('fabbf23a-e34b-4445-b563-222c18642189', '2026-08-14', 5.00),
  ('fabbf23a-e34b-4445-b563-222c18642189', '2026-08-18', 2.50),
  ('fabbf23a-e34b-4445-b563-222c18642189', '2026-08-19', 5.00),
  ('fabbf23a-e34b-4445-b563-222c18642189', '2026-08-21', 5.00),
  ('fabbf23a-e34b-4445-b563-222c18642189', '2026-08-24', 2.50),
  ('fabbf23a-e34b-4445-b563-222c18642189', '2026-08-28', 2.50)
on conflict (user_id, data) do update set taxas_plataforma = excluded.taxas_plataforma;
