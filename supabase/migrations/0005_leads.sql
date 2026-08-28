-- Quantidade de leads/dia (métrica de marketing lançada manualmente,
-- junto do investimento em anúncios).
alter table public.afterpay_daily
  add column if not exists leads integer not null default 0;
