-- Pagamento em partes.
--
-- A planilha "[PayAfter] Pagamentos Aprovados" (a verdade dos pagamentos)
-- às vezes tem o MESMO pedido em mais de uma linha: a cliente pagou uma
-- parte num dia e o resto depois — em 16/10/2026: #1170 (300 em 30/09 +
-- 350 em 07/10) e #1289 (340 em 30/09 + 140 em 03/10). A dashboard guardava
-- um valor só por pedido e a segunda parcela sumia do mês dela.
--
-- parcelas = [{"data": "2026-09-30", "valor": 300}, {"data": "2026-10-07", "valor": 350}]
-- Vazio (null) = pagamento único (data_aprovacao + valor, como sempre).
-- Com parcelas, cada uma conta na receita do DIA dela; produto e frete
-- continuam uma vez só, no primeiro pagamento. O webhook não mexe nesta
-- coluna (o upsert não a envia).

alter table public.bluesales_pedidos
  add column if not exists parcelas jsonb;

-- Conferência: deve dar parcelas = true.
select exists (
  select 1 from information_schema.columns
  where table_name = 'bluesales_pedidos' and column_name = 'parcelas'
) as parcelas;
