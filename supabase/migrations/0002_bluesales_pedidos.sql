-- ============================================================
--  Pedidos espelhados do BlueSales (via webhook).
--  Uma linha por pedido, atualizada pela chave (user_id, id).
--  NÃO guardamos dados pessoais do cliente (CPF, e-mail, etc.) —
--  só o que o P&L precisa.
--  Cole no SQL Editor do Supabase e rode (depois do 0001_init.sql).
-- ============================================================

create table if not exists public.bluesales_pedidos (
  id text not null,                       -- ex.: 'BLV-0GT0Q9F2K7'
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  internal_id bigint,
  status text,                            -- status cru do BlueSales (cadastrados, enviados, pagos, frustrados…)
  data date not null,                     -- competência (created_at convertido p/ SP)
  valor numeric(12,2) not null default 0, -- valor do pedido (pagamento.valor)
  produto_nome text,
  produto_plano text,
  codigo_plano text,
  metodo_pagamento text,
  vendedor text,                          -- atendente (vendedor.nome)
  rastreamento text,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists idx_pedidos_data on public.bluesales_pedidos (user_id, data);
create index if not exists idx_pedidos_status on public.bluesales_pedidos (user_id, status);

alter table public.bluesales_pedidos enable row level security;

drop policy if exists "own_select" on public.bluesales_pedidos;
drop policy if exists "own_insert" on public.bluesales_pedidos;
drop policy if exists "own_update" on public.bluesales_pedidos;
drop policy if exists "own_delete" on public.bluesales_pedidos;
create policy "own_select" on public.bluesales_pedidos for select using (user_id = auth.uid());
create policy "own_insert" on public.bluesales_pedidos for insert with check (user_id = auth.uid());
create policy "own_update" on public.bluesales_pedidos for update using (user_id = auth.uid());
create policy "own_delete" on public.bluesales_pedidos for delete using (user_id = auth.uid());
