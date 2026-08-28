-- Data em que o pedido foi APROVADO/PAGO (para o "Faturamento Aprovado"
-- bater com o BlueSales, que conta pela data do pagamento).
-- Um gatilho carimba a data automaticamente na transição para "pagos"
-- (não mexe em pedidos que já estavam pagos — o backfill não afeta).

alter table public.bluesales_pedidos
  add column if not exists data_aprovacao date;

create or replace function public.set_data_aprovacao()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(new.status, '')) in ('pagos', 'pago')
     and new.data_aprovacao is null
     and (tg_op = 'INSERT' or lower(coalesce(old.status, '')) not in ('pagos', 'pago'))
  then
    new.data_aprovacao := (now() at time zone 'America/Sao_Paulo')::date;
  end if;
  return new;
end $$;

drop trigger if exists trg_data_aprovacao on public.bluesales_pedidos;
create trigger trg_data_aprovacao
  before insert or update on public.bluesales_pedidos
  for each row execute function public.set_data_aprovacao();
