-- Registro de alertas de clientes: cada pedido que chega do BlueSales é
-- conferido sozinho (webhook) e, se a cliente já roubou, frustrou, tem
-- outro pedido em aberto ou usa o WhatsApp de outra pessoa, o alerta fica
-- GRAVADO aqui — para aparecer na Demonstração de Resultados e ficar
-- registrado. Nada é apagado; "visto" só tira o aviso da tela principal.
--
-- Um registro por pedido. Se o alerta do pedido piorar (ex.: duplicado →
-- roubo), ele é atualizado e volta a aparecer como novo; nunca é
-- rebaixado sozinho.

create table if not exists public.alertas_clientes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  pedido_id text not null,
  pedido_numero bigint,
  nivel text not null check (nivel in ('roubo', 'frustracao', 'duplicado', 'whatsapp')),
  por text,
  -- Os pedidos que motivaram o alerta: só número, etapa e data.
  outros jsonb not null default '[]'::jsonb,
  texto text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  visto_em timestamptz,
  unique (user_id, pedido_id)
);

create index if not exists idx_alertas_clientes_novos on public.alertas_clientes (user_id, visto_em, criado_em desc);

alter table public.alertas_clientes enable row level security;
drop policy if exists "alertas_select" on public.alertas_clientes;
drop policy if exists "alertas_insert" on public.alertas_clientes;
drop policy if exists "alertas_update" on public.alertas_clientes;
create policy "alertas_select" on public.alertas_clientes for select using (public.pode_acessar(user_id));
create policy "alertas_insert" on public.alertas_clientes for insert with check (public.pode_acessar(user_id));
create policy "alertas_update" on public.alertas_clientes for update using (public.pode_acessar(user_id)) with check (public.pode_acessar(user_id));

-- Grava (ou piora) o alerta de um pedido. Mais grave primeiro:
-- roubo > frustracao > duplicado > whatsapp.
create or replace function public.registrar_alerta_cliente(
  conta uuid, pedido text, numero bigint, nivel_novo text, por_onde text, outros_pedidos jsonb, texto_alerta text
)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.alertas_clientes (user_id, pedido_id, pedido_numero, nivel, por, outros, texto)
  values (conta, pedido, numero, nivel_novo, por_onde, coalesce(outros_pedidos, '[]'::jsonb), texto_alerta)
  on conflict (user_id, pedido_id) do update
  set nivel = excluded.nivel,
      por = excluded.por,
      outros = excluded.outros,
      texto = excluded.texto,
      pedido_numero = coalesce(excluded.pedido_numero, alertas_clientes.pedido_numero),
      atualizado_em = now(),
      visto_em = null
  where array_position(array['roubo','frustracao','duplicado','whatsapp'], excluded.nivel)
      < array_position(array['roubo','frustracao','duplicado','whatsapp'], alertas_clientes.nivel);
$$;

-- Conferência.
select count(*) as tabela_alertas_ok from information_schema.tables where table_name = 'alertas_clientes';
