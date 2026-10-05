-- Conferência automática com a planilha "[PayAfter] Pagamentos Aprovados".
--
-- Um script dentro da própria planilha (Apps Script) manda para
-- /api/planilha, de hora em hora, SÓ: código do pedido, valor, data de
-- pagamento, vendedor e método — o nome da cliente não sai da planilha.
-- A planilha é a verdade: o servidor corrige sozinho o que é seguro e
-- registra cada ajuste em planilha_ajustes.

create table if not exists public.planilha_pagamentos (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  aba text not null,
  linha integer,
  pedido_id text not null,
  valor numeric(12,2) not null,
  data_pagamento date not null,
  vendedor text,
  metodo text,
  recebido_em timestamptz not null default now()
);
create index if not exists idx_planilha_pedido on public.planilha_pagamentos (user_id, pedido_id);

create table if not exists public.planilha_ajustes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  pedido_id text not null,
  internal_id bigint,
  campo text not null,
  de text,
  para text,
  origem text not null default 'automatico',
  aplicado_em timestamptz not null default now()
);
create index if not exists idx_planilha_ajustes on public.planilha_ajustes (user_id, aplicado_em desc);

-- Vendedor corrigido pela planilha: o webhook regrava o vendedor a cada
-- evento do BlueSales; com vendedor_manual ele fica (mesma ideia do
-- valor_manual da 0015). O valor e a data de pagamento já ficam: o valor
-- pelo valor_manual, a data porque o banco só a preenche quando está vazia.
alter table public.bluesales_pedidos
  add column if not exists vendedor_manual boolean not null default false;

create or replace function public.preservar_vendedor_manual()
returns trigger
language plpgsql
as $$
begin
  if old.vendedor_manual
     and new.vendedor_manual
     and new.atualizado_em is distinct from old.atualizado_em
  then
    new.vendedor := old.vendedor;
  end if;
  return new;
end $$;

drop trigger if exists trg_vendedor_manual on public.bluesales_pedidos;
create trigger trg_vendedor_manual
  before update on public.bluesales_pedidos
  for each row execute function public.preservar_vendedor_manual();

alter table public.planilha_pagamentos enable row level security;
alter table public.planilha_ajustes enable row level security;
drop policy if exists "planilha_select" on public.planilha_pagamentos;
drop policy if exists "ajustes_select" on public.planilha_ajustes;
drop policy if exists "ajustes_insert" on public.planilha_ajustes;
create policy "planilha_select" on public.planilha_pagamentos for select using (public.pode_acessar(user_id));
create policy "ajustes_select" on public.planilha_ajustes for select using (public.pode_acessar(user_id));
create policy "ajustes_insert" on public.planilha_ajustes for insert with check (public.pode_acessar(user_id));

-- Deve dar: tabelas_planilha = 2 e vendedor_manual = true.
select
  (select count(*) from information_schema.tables where table_name in ('planilha_pagamentos', 'planilha_ajustes')) as tabelas_planilha,
  exists (select 1 from information_schema.columns where table_name = 'bluesales_pedidos' and column_name = 'vendedor_manual') as vendedor_manual;
