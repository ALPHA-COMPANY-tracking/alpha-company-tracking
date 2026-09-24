-- Integração Facebook: escolhas feitas na tela, em vez de variáveis da Vercel.
--
--   contas           ids das contas de anúncio que entram no P&L
--   cotacao_usd      R$ por US$ para as contas em dólar (BlueSales: 5,40)
--   imposto_brl_pct  imposto do Meta sobre as contas em REAL (12,5%) —
--                    contas em dólar não pagam
--
-- Uma linha por dashboard (a conta do dono). O token do Meta continua
-- só na Vercel (META_ACCESS_TOKEN): segredo não fica no banco.

create table if not exists public.meta_integracao (
  user_id uuid primary key references auth.users (id) on delete cascade,
  contas jsonb not null default '[]'::jsonb,
  cotacao_usd numeric(10,4) not null default 5.40,
  imposto_brl_pct numeric(5,2) not null default 12.5,
  atualizado_em timestamptz not null default now()
);

alter table public.meta_integracao enable row level security;
drop policy if exists "own_select" on public.meta_integracao;
drop policy if exists "own_insert" on public.meta_integracao;
drop policy if exists "own_update" on public.meta_integracao;
create policy "own_select" on public.meta_integracao for select using (public.pode_acessar(user_id));
create policy "own_insert" on public.meta_integracao for insert with check (public.pode_acessar(user_id));
create policy "own_update" on public.meta_integracao for update using (public.pode_acessar(user_id)) with check (public.pode_acessar(user_id));

-- Começa com o que já está ligado: a conta em dólar BM 03 - Valentin_Wafer 01.
insert into public.meta_integracao (user_id, contas)
values ('fabbf23a-e34b-4445-b563-222c18642189', '["652943883845467"]'::jsonb)
on conflict (user_id) do nothing;

-- Conferência.
select contas, cotacao_usd, imposto_brl_pct from public.meta_integracao;
