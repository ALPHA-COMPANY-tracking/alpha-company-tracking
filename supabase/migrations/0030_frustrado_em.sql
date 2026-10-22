-- Dia em que o pedido VIROU frustração (a "baixa" no BlueSales).
--
-- Até aqui a frustração contava no mês em que o pedido foi FEITO. Decisão
-- do Jonas em 22/10/2026: conta no mês em que foi dada a baixa — o roubo
-- de um pedido de agosto marcado em outubro é perda de OUTUBRO (é assim que
-- a tela de Pedidos do BlueSales mostra: 66 roubos em outubro, contra 14
-- dos pedidos feitos em outubro).
--
-- Daqui para frente o banco anota sozinho a primeira vez que o status chega
-- como roubo / devolvido / voltando / cancelado / frustrado etc. Se o pedido
-- sair da frustração (voltou para a rota, foi pago), a marca é apagada; se
-- frustrar de novo, vale a nova data. Mesma ideia do enviado_em (0028).
-- Para trás: o histórico dos avisos do BlueSales (webhook_logs). Quem não
-- tem aviso (corrigido à mão) fica no dia em que o pedido foi feito.

alter table public.bluesales_pedidos
  add column if not exists frustrado_em timestamptz;

create or replace function public.marcar_frustrado_em()
returns trigger
language plpgsql
as $$
begin
  if lower(coalesce(new.status, '')) ~ 'frustr|devol|voltand|retorn|roub|furt|extravi|sinistr|recus|cancel|perd|apreend' then
    if new.frustrado_em is null then
      new.frustrado_em := now();
    end if;
  elsif new.status is not null then
    new.frustrado_em := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_frustrado_em on public.bluesales_pedidos;
create trigger trg_frustrado_em
  before insert or update on public.bluesales_pedidos
  for each row execute function public.marcar_frustrado_em();

-- Histórico: o primeiro aviso do BlueSales com o pedido já em frustração.
update public.bluesales_pedidos p
  set frustrado_em = h.primeiro
  from (
    select coalesce(w.payload -> 'order' ->> 'id', w.payload -> 'pedido' ->> 'id') as pedido_id,
           w.user_id,
           min(w.recebido_em) as primeiro
    from public.webhook_logs w
    where lower(coalesce(w.payload -> 'order' ->> 'status', w.payload -> 'pedido' ->> 'status', ''))
          ~ 'frustr|devol|voltand|retorn|roub|furt|extravi|sinistr|recus|cancel|perd|apreend'
    group by 1, 2
  ) h
  where h.pedido_id = p.id
    and h.user_id = p.user_id
    and lower(coalesce(p.status, '')) ~ 'frustr|devol|voltand|retorn|roub|furt|extravi|sinistr|recus|cancel|perd|apreend';

-- Sem aviso no histórico (corrigido à mão): fica no dia em que foi feito.
update public.bluesales_pedidos
  set frustrado_em = (data + time '12:00') at time zone 'America/Sao_Paulo'
  where frustrado_em is null
    and lower(coalesce(status, '')) ~ 'frustr|devol|voltand|retorn|roub|furt|extravi|sinistr|recus|cancel|perd|apreend';

-- Conferência: frustrações por MÊS DA BAIXA (fora da lixeira).
-- Outubro deve mostrar os roubos da tela de Pedidos do BlueSales.
select case
         when lower(status) ~ 'perda|cobranc' then 'Perda de cobrança'
         when lower(status) ~ 'roub|furt|perdid|apreend|extravi' then 'Roubo / perdido'
         when lower(status) ~ 'cancel' then 'Cancelados'
         when lower(status) ~ 'aguard.*devol' then 'Aguardando devolução'
         when lower(status) ~ 'voltand|retorn' then 'Voltando'
         when lower(status) ~ 'devol' then 'Devolvido'
         when lower(status) ~ 'recus' then 'Recusado'
         else 'Frustrados (antigo)'
       end as motivo,
       to_char(frustrado_em at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes_da_baixa,
       count(*) as pedidos,
       count(*) filter (where data < date_trunc('month', frustrado_em at time zone 'America/Sao_Paulo')) as de_meses_anteriores,
       sum(coalesce(valor_agendado, valor)) as valor
from public.bluesales_pedidos
where frustrado_em is not null and removido_em is null
group by 1, 2
order by 2 desc, 1;
