-- 1. Região do pedido — para o Mapa de Frustração.
--
-- Só ESTADO (UF) e CIDADE. Rua, número, bairro e CEP continuam fora do
-- banco (LGPD): para ver onde roubo e devolução se concentram, estado e
-- cidade bastam.

alter table public.bluesales_pedidos
  add column if not exists uf text,
  add column if not exists cidade text;

-- Grava estado e cidade de vários pedidos de uma vez — o botão "Importar
-- regiões" da tela Mapa de Frustração lê o CSV do BlueSales no navegador
-- e manda só [{internal_id, uf, cidade}]. Roda com a permissão de quem
-- chama (security invoker): só dono ou sócio conseguem alterar.
create or replace function public.definir_regioes(conta uuid, itens jsonb)
returns integer
language sql
security invoker
set search_path = public
as $$
  with v as (
    select (e->>'internal_id')::bigint as internal_id,
           upper(e->>'uf') as uf,
           nullif(e->>'cidade', '') as cidade
    from jsonb_array_elements(itens) e
  ),
  feitos as (
    update public.bluesales_pedidos p
    set uf = v.uf, cidade = v.cidade
    from v
    where p.user_id = conta and p.internal_id = v.internal_id
    returning 1
  )
  select count(*)::integer from feitos;
$$;

-- 2. Painel do Vendedor — login próprio que só enxerga os PRÓPRIOS pedidos.
--
-- dashboard_vendedores liga o login a um vendedor do BlueSales (o nome como
-- vem no pedido: PETER, Matheus…). Ele NÃO entra em dashboard_membros:
-- não vê P&L, custos, anúncios, nem os pedidos dos outros. O login é
-- criado à parte no painel do Supabase; o vínculo é feito por SQL (os
-- e-mails ficam fora deste arquivo — o repositório é público).

create table if not exists public.dashboard_vendedores (
  membro_id uuid primary key references auth.users (id) on delete cascade,
  dono_id uuid not null references auth.users (id) on delete cascade,
  vendedor text not null,
  criado_em timestamptz not null default now()
);

alter table public.dashboard_vendedores enable row level security;
drop policy if exists "vendedores_select" on public.dashboard_vendedores;
create policy "vendedores_select" on public.dashboard_vendedores
  for select using (membro_id = auth.uid() or public.pode_acessar(dono_id));

-- O vendedor lê só os pedidos em que ele é o vendedor. Só leitura: as
-- políticas de insert/update/delete continuam exigindo dono ou sócio.
drop policy if exists "vendedor_select" on public.bluesales_pedidos;
create policy "vendedor_select" on public.bluesales_pedidos
  for select using (
    exists (
      select 1 from public.dashboard_vendedores v
      where v.membro_id = auth.uid()
        and v.dono_id = bluesales_pedidos.user_id
        and upper(trim(bluesales_pedidos.vendedor)) = upper(trim(v.vendedor))
    )
  );

-- Conferência: as duas colunas novas e a tabela de vendedores (vazia).
select
  (select count(*) from information_schema.columns
    where table_name = 'bluesales_pedidos' and column_name in ('uf', 'cidade')) as colunas_regiao,
  (select count(*) from public.dashboard_vendedores) as vendedores_ligados;
