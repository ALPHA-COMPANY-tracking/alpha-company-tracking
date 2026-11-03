-- Metas & Lucro: a simulação salva como META de cada mês.
--
-- Uma meta por mês por conta (o dia 1 do mês). Guarda as premissas, as
-- faixas de bônus e o snapshot do resultado da hora em que foi salva — é
-- esse snapshot que a coluna "Meta salva" do comparativo mostra. Salvar de
-- novo o mesmo mês sobrescreve.
--
-- Mesmo acesso das outras tabelas: o dono e os sócios da conta
-- (public.pode_acessar, migração 0017).

create table if not exists public.metas_mensais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  premissas jsonb not null,
  faixas jsonb not null,
  resultado jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, mes)
);

alter table public.metas_mensais enable row level security;
drop policy if exists "own_select" on public.metas_mensais;
drop policy if exists "own_insert" on public.metas_mensais;
drop policy if exists "own_update" on public.metas_mensais;
drop policy if exists "own_delete" on public.metas_mensais;
create policy "own_select" on public.metas_mensais for select using (public.pode_acessar(user_id));
create policy "own_insert" on public.metas_mensais for insert with check (public.pode_acessar(user_id));
create policy "own_update" on public.metas_mensais for update using (public.pode_acessar(user_id)) with check (public.pode_acessar(user_id));
create policy "own_delete" on public.metas_mensais for delete using (public.pode_acessar(user_id));

-- Conferência: deve dar metas_mensais = true e rls = true.
select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'metas_mensais') as metas_mensais,
       (select relrowsecurity from pg_class where oid = 'public.metas_mensais'::regclass) as rls;
