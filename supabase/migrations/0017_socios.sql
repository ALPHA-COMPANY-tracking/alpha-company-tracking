-- Sócios: outros logins que enxergam (e editam) a MESMA dashboard.
--
-- Até aqui cada login só via os próprios registros (user_id = auth.uid()),
-- e todos os dados — pedidos do webhook, custos, anúncios — são da conta
-- do Jonas. Um login novo abriria a dashboard vazia. Agora:
--   · dashboard_membros liga o login do sócio à conta do dono;
--   · as políticas deixam cada tabela ser lida e editada pelo dono E
--     pelos sócios dele;
--   · conta_do_usuario() diz ao app de qual conta são os dados.
--
-- O login do sócio é criado à parte, no painel do Supabase
-- (Authentication → Users → Add user). Este arquivo só faz o vínculo.

create table if not exists public.dashboard_membros (
  membro_id uuid primary key references auth.users (id) on delete cascade,
  dono_id uuid not null references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.dashboard_membros enable row level security;
drop policy if exists "membros_select" on public.dashboard_membros;
create policy "membros_select" on public.dashboard_membros
  for select using (membro_id = auth.uid() or dono_id = auth.uid());

-- De qual conta são os dados do login atual: a do dono, para um sócio;
-- a própria, para todo o resto.
create or replace function public.conta_do_usuario()
returns uuid
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select dono_id from public.dashboard_membros where membro_id = auth.uid()),
    auth.uid()
  );
$$;

-- O login atual pode mexer nos dados desta conta?
create or replace function public.pode_acessar(conta uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select conta = auth.uid()
      or exists (select 1 from public.dashboard_membros where membro_id = auth.uid() and dono_id = conta);
$$;

-- Políticas de todas as tabelas: dono ou sócio.
do $$
declare
  t text;
begin
  foreach t in array array[
    'afterpay_daily', 'categorias_custo', 'custos_variaveis',
    'webhook_logs', 'bluesales_pedidos', 'push_subscriptions'
  ]
  loop
    execute format('drop policy if exists "own_select" on public.%I;', t);
    execute format('drop policy if exists "own_insert" on public.%I;', t);
    execute format('drop policy if exists "own_update" on public.%I;', t);
    execute format('drop policy if exists "own_delete" on public.%I;', t);
    execute format('create policy "own_select" on public.%I for select using (public.pode_acessar(user_id));', t);
    execute format('create policy "own_insert" on public.%I for insert with check (public.pode_acessar(user_id));', t);
    execute format('create policy "own_update" on public.%I for update using (public.pode_acessar(user_id)) with check (public.pode_acessar(user_id));', t);
    execute format('create policy "own_delete" on public.%I for delete using (public.pode_acessar(user_id));', t);
  end loop;
end $$;

-- ── Sócio: Alyenderson ───────────────────────────────────────
-- Rode DEPOIS de criar o login dele no painel. Se ainda não existir,
-- não vincula nada (e a conferência abaixo volta vazia).
insert into public.dashboard_membros (membro_id, dono_id)
select id, 'fabbf23a-e34b-4445-b563-222c18642189'
from auth.users
where lower(email) = 'alyenderson@gmail.com'
on conflict (membro_id) do update set dono_id = excluded.dono_id;

-- As categorias-padrão que o Supabase cria para todo login novo: no
-- sócio elas sobram (ele usa as da conta do dono).
delete from public.categorias_custo c
using public.dashboard_membros m
where c.user_id = m.membro_id
  and not exists (select 1 from public.custos_variaveis v where v.categoria_id = c.id);

-- Conferência: deve aparecer o e-mail do sócio.
select u.email as socio, m.dono_id, m.criado_em
from public.dashboard_membros m
join auth.users u on u.id = m.membro_id;
