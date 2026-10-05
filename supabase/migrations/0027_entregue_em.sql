-- Dia em que o pedido foi ENTREGUE (Fila de Cobrança).
--
-- O BlueSales não manda a data da entrega. Daqui para frente o banco anota
-- sozinho: quando o status chega como entregue/cobrado pela primeira vez,
-- grava o momento. A marca nunca é desfeita pelo webhook (o upsert não
-- mexe nesta coluna) — mesma ideia do passou_correios (0016).
-- Para trás: o histórico dos avisos do BlueSales (webhook_logs) mostra
-- quando cada pedido virou entregue.

alter table public.bluesales_pedidos
  add column if not exists entregue_em timestamptz;

create or replace function public.marcar_entregue_em()
returns trigger
language plpgsql
as $$
begin
  if new.entregue_em is null
     and (lower(coalesce(new.status, '')) like '%entregue%' or lower(coalesce(new.status, '')) like '%cobrad%')
  then
    new.entregue_em := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_entregue_em on public.bluesales_pedidos;
create trigger trg_entregue_em
  before insert or update on public.bluesales_pedidos
  for each row execute function public.marcar_entregue_em();

-- Histórico: o primeiro aviso do BlueSales com o pedido entregue/cobrado.
update public.bluesales_pedidos p
  set entregue_em = h.primeiro
  from (
    select coalesce(w.payload -> 'order' ->> 'id', w.payload -> 'pedido' ->> 'id') as pedido_id,
           w.user_id,
           min(w.recebido_em) as primeiro
    from public.webhook_logs w
    where lower(coalesce(w.payload -> 'order' ->> 'status', w.payload -> 'pedido' ->> 'status', '')) like any (array['%entregue%', '%cobrad%'])
    group by 1, 2
  ) h
  where h.pedido_id = p.id
    and h.user_id = p.user_id
    and (p.entregue_em is null or h.primeiro < p.entregue_em);

-- Conferência (só contagem): dos pedidos entregues e ainda sem pagar,
-- quantos já têm o dia da entrega.
select
  count(*) filter (where entregue_em is not null) as com_dia_da_entrega,
  count(*) filter (where entregue_em is null) as sem_dia_da_entrega
from public.bluesales_pedidos
where removido_em is null
  and (lower(coalesce(status, '')) like '%entregue%' or lower(coalesce(status, '')) like '%cobrad%');
