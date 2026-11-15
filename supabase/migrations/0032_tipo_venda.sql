-- Duas regras do card "Vendas" do BlueSales (conferidas dia a dia em 15/11/2026):
--
-- 1. "A venda Antecipado não entra: ela já nasce paga e conta só no Aprovado"
--    (texto do próprio card). 07/11: lá 20 · R$ 10.765, o export 21 · R$ 11.200
--    — o de fora era o #4190, antecipado pago. Guardamos o tipo de venda que o
--    BlueSales manda (order.type_sales: "afterpay" / "antecipado").
-- 2. Desconto dado NA HORA do pagamento baixa o recebido, não a venda. 04/11:
--    lá R$ 12.925, aqui R$ 12.890 — o #3992 foi pago com R$ 35 de desconto e o
--    aviso de pagamento tinha baixado o agendado para R$ 400. O webhook não
--    mexe mais no agendado no pagamento; aqui acertamos o que já estava gravado
--    (só novembro: outubro já foi conferido pedido a pedido).

alter table public.bluesales_pedidos add column if not exists tipo_venda text;

-- 1. Tipo de venda dos pedidos que já estão aqui, pelo último aviso de cada um.
update public.bluesales_pedidos p
set tipo_venda = x.tipo
from (
  select distinct on (w.user_id, w.payload -> 'order' ->> 'id')
         w.user_id, w.payload -> 'order' ->> 'id' as id, w.payload -> 'order' ->> 'type_sales' as tipo
  from public.webhook_logs w
  where w.payload -> 'order' ->> 'type_sales' is not null
  order by w.user_id, w.payload -> 'order' ->> 'id', w.recebido_em desc
) x
where p.user_id = x.user_id and p.id = x.id and p.tipo_venda is distinct from x.tipo;

-- 2. Pago com desconto na hora do pagamento: o agendado volta ao valor do
--    último aviso ANTES do pagamento.
update public.bluesales_pedidos p
set valor_agendado = x.antes
from (
  select p2.user_id, p2.id,
         (select (w.payload -> 'payment' ->> 'amount')::numeric
            from public.webhook_logs w
           where w.user_id = p2.user_id and w.payload -> 'order' ->> 'id' = p2.id
             and upper(coalesce(w.payload ->> 'event', '')) <> 'ORDER_PAID'
             and w.payload -> 'payment' ->> 'amount' is not null
             and w.recebido_em < pg.primeiro
           order by w.recebido_em desc
           limit 1) as antes
  from public.bluesales_pedidos p2
  join lateral (
    select min(w2.recebido_em) as primeiro, max(coalesce((w2.payload -> 'payment' ->> 'discount')::numeric, 0)) as desconto
    from public.webhook_logs w2
    where w2.user_id = p2.user_id and w2.payload -> 'order' ->> 'id' = p2.id
      and upper(coalesce(w2.payload ->> 'event', '')) = 'ORDER_PAID'
  ) pg on pg.primeiro is not null and pg.desconto > 0
  where p2.data >= '2026-11-01' and lower(coalesce(p2.status, '')) ~ '^pagos?$'
) x
where p.user_id = x.user_id and p.id = x.id and x.antes > 0 and p.valor_agendado is distinct from x.antes;

-- Faz a API do Supabase enxergar a coluna nova na hora.
notify pgrst, 'reload schema';

-- Conferência: tipos de venda gravados e o agendado de 01 a 15/11 com as regras
-- novas (deve dar 233 · R$ 128.980,00, igual ao card do BlueSales).
select coalesce(tipo_venda, '(sem aviso)') as tipo_venda, count(*) as pedidos,
       sum(coalesce(valor_agendado, valor)) filter (
         where data between '2026-11-01' and '2026-11-15' and removido_em is null
           and coalesce(status, '') !~* 'recus|aguard.*pag'
           and not (coalesce(tipo_venda, '') ~* 'antecip' and lower(coalesce(status, '')) ~ '^pagos?$')
       ) as agendado_01_15_nov,
       count(*) filter (
         where data between '2026-11-01' and '2026-11-15' and removido_em is null
           and coalesce(status, '') !~* 'recus|aguard.*pag'
           and not (coalesce(tipo_venda, '') ~* 'antecip' and lower(coalesce(status, '')) ~ '^pagos?$')
       ) as qtd_01_15_nov
from public.bluesales_pedidos
group by 1
order by 2 desc;
