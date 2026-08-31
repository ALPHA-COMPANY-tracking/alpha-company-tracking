-- Aparelhos inscritos para receber notificação de pedido pago/agendado.
-- Cada navegador/celular gera um endpoint único; guardamos as chaves que
-- o Web Push exige para criptografar a mensagem.
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  apelido text,
  criado_em timestamptz not null default now(),
  ultimo_envio timestamptz
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "own_select" on public.push_subscriptions;
drop policy if exists "own_insert" on public.push_subscriptions;
drop policy if exists "own_update" on public.push_subscriptions;
drop policy if exists "own_delete" on public.push_subscriptions;

create policy "own_select" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "own_insert" on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy "own_update" on public.push_subscriptions for update using (user_id = auth.uid());
create policy "own_delete" on public.push_subscriptions for delete using (user_id = auth.uid());
