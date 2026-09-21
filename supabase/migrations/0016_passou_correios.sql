-- Pedido que ficou em "Retirar nos Correios" alguma vez.
--
-- Quando a cliente não retira, o BlueSales muda a etapa para Aguard.
-- Devolução / Devolvido — e o "foi para os Correios" se perde. Para a aba
-- de Frustração separar "voltou dos Correios (não retirado)" das outras
-- devoluções, o pedido guarda que passou por lá.
--
-- Daqui para frente: o trigger marca sozinho quando o status chega como
-- retirar_nos_correios, e a marca nunca é desfeita pelo webhook (o
-- upsert não mexe nesta coluna).
-- Para trás: o histórico dos avisos do BlueSales (webhook_logs) mostra
-- quem já passou por lá.

alter table public.bluesales_pedidos
  add column if not exists passou_correios boolean not null default false;

create or replace function public.marcar_passou_correios()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(new.status, '')) like '%retirar%' then
    new.passou_correios := true;
  end if;
  return new;
end $$;

drop trigger if exists trg_passou_correios on public.bluesales_pedidos;
create trigger trg_passou_correios
  before insert or update on public.bluesales_pedidos
  for each row execute function public.marcar_passou_correios();

-- Histórico: o próprio status atual e todos os avisos já recebidos.
update public.bluesales_pedidos p
  set passou_correios = true
  where not p.passou_correios
    and (
      lower(coalesce(p.status, '')) like '%retirar%'
      or exists (
        select 1
        from public.webhook_logs w
        where coalesce(w.payload -> 'order' ->> 'id', w.payload -> 'pedido' ->> 'id') = p.id
          and lower(coalesce(w.payload -> 'order' ->> 'status', w.payload -> 'pedido' ->> 'status', '')) like '%retirar%'
      )
    );

-- Conferência: quem passou pelos Correios e onde está hoje.
select internal_id, status, data, valor_agendado
from public.bluesales_pedidos
where passou_correios and removido_em is null
order by data desc;
