-- Gasto do Meta Ads sincronizado automaticamente (api/meta-ads.ts).
--
-- O valor continua em afterpay_daily.investimento_ads — é ele que o P&L,
-- o CPA e o ROAS usam. Estas colunas só dizem DE ONDE ele veio:
--   ads_origem           'meta' (sincronizado) · 'manual' (tela Anúncios)
--   ads_detalhe          como cada conta entrou: moeda, valor, cotação, R$
--   ads_sincronizado_em  última vez que o Meta foi consultado para o dia

alter table public.afterpay_daily
  add column if not exists ads_origem text,
  add column if not exists ads_detalhe jsonb,
  add column if not exists ads_sincronizado_em timestamptz;

-- Conferência: devem aparecer as três colunas.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'afterpay_daily'
  and column_name like 'ads_%'
order by column_name;
