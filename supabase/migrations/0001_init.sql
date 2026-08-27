-- ============================================================
--  Dashboard Financeiro (Afterpay / CTWA) — schema inicial
--  Cole este arquivo inteiro no SQL Editor do Supabase e rode.
--  RLS ligado: cada usuário só enxerga os próprios dados.
-- ============================================================

-- ---------- Snapshot diário vindo do Afterpay ----------
create table if not exists public.afterpay_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data date not null,

  receita_aprovada numeric(12,2) not null default 0,
  qtd_pagamentos int not null default 0,

  taxas_plataforma numeric(12,2) not null default 0,

  custo_produtos numeric(12,2) not null default 0,
  frete numeric(12,2) not null default 0,
  comissoes_vendedor numeric(12,2) not null default 0,
  comissoes_cobranca numeric(12,2) not null default 0,

  investimento_ads numeric(12,2) not null default 0,
  taxas_investimento numeric(12,2) not null default 0,

  valor_frustrado numeric(12,2) not null default 0,
  qtd_frustrados int not null default 0,

  valor_agendado numeric(12,2) not null default 0,
  qtd_agendados int not null default 0,

  sincronizado_em timestamptz not null default now(),
  unique (user_id, data)
);

-- ---------- Categorias de custo variável ----------
create table if not exists public.categorias_custo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null,
  icone text,
  cor text,
  ativo boolean not null default true,
  ordem int not null default 0
);

-- ---------- Custos variáveis (o que o Afterpay não conhece) ----------
create table if not exists public.custos_variaveis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data date not null,
  categoria_id uuid references public.categorias_custo (id) on delete set null,
  descricao text not null,
  valor numeric(12,2) not null check (valor >= 0),

  recorrencia text not null default 'unico',
  recorrencia_fim date,
  ratear_por_dias boolean not null default true,

  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ---------- Log de webhooks (para debug da integração) ----------
create table if not exists public.webhook_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  recebido_em timestamptz not null default now(),
  evento text,
  payload jsonb,
  processado boolean not null default false
);

create index if not exists idx_custos_data on public.custos_variaveis (user_id, data);
create index if not exists idx_daily_data on public.afterpay_daily (user_id, data);

-- ============================================================
--  Row Level Security
-- ============================================================
alter table public.afterpay_daily enable row level security;
alter table public.categorias_custo enable row level security;
alter table public.custos_variaveis enable row level security;
alter table public.webhook_logs enable row level security;

-- Políticas: dono do registro = usuário logado
do $$
declare
  t text;
begin
  foreach t in array array['afterpay_daily', 'categorias_custo', 'custos_variaveis', 'webhook_logs']
  loop
    execute format('drop policy if exists "own_select" on public.%I;', t);
    execute format('drop policy if exists "own_insert" on public.%I;', t);
    execute format('drop policy if exists "own_update" on public.%I;', t);
    execute format('drop policy if exists "own_delete" on public.%I;', t);
    execute format('create policy "own_select" on public.%I for select using (user_id = auth.uid());', t);
    execute format('create policy "own_insert" on public.%I for insert with check (user_id = auth.uid());', t);
    execute format('create policy "own_update" on public.%I for update using (user_id = auth.uid());', t);
    execute format('create policy "own_delete" on public.%I for delete using (user_id = auth.uid());', t);
  end loop;
end $$;

-- ============================================================
--  Semente das 14 categorias ao criar um usuário novo
-- ============================================================
create or replace function public.semear_categorias()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.categorias_custo (user_id, nome, icone, cor, ordem) values
    (new.id, 'Chips / Números WhatsApp', 'smartphone', '#22d3ee', 0),
    (new.id, 'Ferramentas e SaaS', 'wrench', '#60a5fa', 1),
    (new.id, 'Disparador / Automação', 'zap', '#818cf8', 2),
    (new.id, 'CRM', 'contact', '#38bdf8', 3),
    (new.id, 'Equipe / Freelancer', 'users', '#a855f7', 4),
    (new.id, 'Criativos / UGC', 'clapperboard', '#f472b6', 5),
    (new.id, 'Embalagem e Insumos', 'package', '#fbbf24', 6),
    (new.id, 'Estorno / Chargeback', 'rotate-ccw', '#fb7185', 7),
    (new.id, 'Taxas Bancárias', 'landmark', '#f59e0b', 8),
    (new.id, 'Tráfego fora do Meta', 'megaphone', '#34d399', 9),
    (new.id, 'Contador / Jurídico', 'scale', '#94a3b8', 10),
    (new.id, 'Pró-labore', 'wallet', '#c084fc', 11),
    (new.id, 'Infraestrutura (servidor, domínio)', 'server', '#2dd4bf', 12),
    (new.id, 'Outros', 'ellipsis', '#6b7280', 13);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.semear_categorias();
