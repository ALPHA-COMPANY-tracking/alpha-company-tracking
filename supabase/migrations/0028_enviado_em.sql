-- Dia em que o pedido SAIU para entrega.
--
-- Cancelado só custa o frete se o pacote chegou a sair. Até aqui a
-- dashboard usava "tem código de rastreio" como sinal de postado — mas o
-- BlueSales gera a etiqueta ainda em "Aguard. Coleta", antes de sair. Em
-- 12/10/2026 isso cobrou R$ 66 de frete de dois cancelados (#2801, #2802)
-- que nunca saíram e que o BlueSales (certo) não cobra.
--
-- Daqui para frente o banco anota sozinho a primeira vez que o status
-- chega como enviado / saiu para entrega / em rota / retirar nos Correios /
-- entregue / cobrado. A marca nunca é desfeita pelo webhook (o upsert não
-- mexe nesta coluna) — mesma ideia do entregue_em (0027).
-- Para trás: o histórico dos avisos do BlueSales (webhook_logs).

alter table public.bluesales_pedidos
  add column if not exists enviado_em timestamptz;

create or replace function public.marcar_enviado_em()
returns trigger
language plpgsql
as $$
begin
  if new.enviado_em is null
     and lower(coalesce(new.status, '')) ~ 'enviad|saiu|transit|rota|retir|correio|entregue|cobrad'
  then
    new.enviado_em := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_enviado_em on public.bluesales_pedidos;
create trigger trg_enviado_em
  before insert or update on public.bluesales_pedidos
  for each row execute function public.marcar_enviado_em();

-- Histórico: o primeiro aviso do BlueSales com o pedido já fora.
update public.bluesales_pedidos p
  set enviado_em = h.primeiro
  from (
    select coalesce(w.payload -> 'order' ->> 'id', w.payload -> 'pedido' ->> 'id') as pedido_id,
           w.user_id,
           min(w.recebido_em) as primeiro
    from public.webhook_logs w
    where lower(coalesce(w.payload -> 'order' ->> 'status', w.payload -> 'pedido' ->> 'status', '')) ~ 'enviad|saiu|transit|rota|retir|correio|entregue|cobrad'
    group by 1, 2
  ) h
  where h.pedido_id = p.id
    and h.user_id = p.user_id
    and (p.enviado_em is null or h.primeiro < p.enviado_em);

-- Quem já passou pelos Correios ou foi entregue saiu, mesmo sem aviso no histórico.
update public.bluesales_pedidos
  set enviado_em = coalesce(entregue_em, atualizado_em)
  where enviado_em is null and (passou_correios or entregue_em is not null);

-- Conferência: os cancelados de outubro e se chegaram a sair.
-- Esperado: #2801 e #2802 com saiu = false.
select internal_id, status, enviado_em is not null as saiu, removido_em is not null as na_lixeira
from public.bluesales_pedidos
where data >= '2026-10-01' and lower(coalesce(status, '')) like '%cancel%'
order by internal_id;
