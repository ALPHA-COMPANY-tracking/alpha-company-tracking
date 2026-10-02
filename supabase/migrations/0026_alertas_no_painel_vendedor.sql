-- Painel do Vendedor: o mesmo aviso de alerta de cliente que o dono vê na
-- Demonstração de Resultados, só dos pedidos DELE. O vendedor não lê a
-- tabela alertas_clientes (RLS é do dono/sócio); esta função entrega só os
-- alertas dos pedidos em que ele é o vendedor, sem os descartados.
-- O "visto" do vendedor fica no aparelho dele — não mexe no do dono.

create or replace function public.alertas_registrados_vendedor()
returns table (
  id bigint, pedido_id text, pedido_numero bigint, nivel text, por text, texto text,
  criado_em timestamptz, atualizado_em timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.pedido_id, a.pedido_numero, a.nivel, a.por, a.texto, a.criado_em, a.atualizado_em
  from public.dashboard_vendedores v
  join public.bluesales_pedidos m
    on m.user_id = v.dono_id
   and upper(trim(m.vendedor)) = upper(trim(v.vendedor))
   and m.removido_em is null
  join public.alertas_clientes a
    on a.user_id = m.user_id
   and a.pedido_id = m.id
   and a.descartado_em is null
  where v.membro_id = auth.uid()
  order by a.criado_em desc
  limit 200;
$$;

revoke all on function public.alertas_registrados_vendedor() from anon;

select 'ok' as alertas_no_painel_do_vendedor;
