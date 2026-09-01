-- Marca que a taxa do dia foi conferida no BlueSales.
--
-- `taxas_plataforma` é `not null default 0`, então R$ 0,00 significa duas
-- coisas diferentes: "o BlueSales não cobrou nada neste dia" (comum — em
-- agosto/2026 foram 6 dos 13 dias com pagamento) e "ninguém olhou ainda".
-- Sem separar as duas, a tela Taxas acusaria dia certo como pendente e o
-- aviso viraria ruído.
--
-- true = alguém lançou o valor do dia (mesmo que seja zero).
alter table public.afterpay_daily
  add column if not exists taxa_conferida boolean not null default false;

-- Os dias de agosto/2026 já vieram do Resultado Diário do BlueSales
-- (migração 0007): estão conferidos, inclusive os que deram zero.
update public.afterpay_daily
   set taxa_conferida = true
 where taxas_plataforma > 0;
