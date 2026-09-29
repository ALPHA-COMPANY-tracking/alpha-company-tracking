-- Alerta de Clientes: DESCARTAR um alerta que foi erro (ex.: atendente
-- cadastrou o WhatsApp errado). O registro continua guardado, só sai da
-- tela. Se o alerta do pedido PIORAR depois (ex.: vira roubo), ele volta.

alter table public.alertas_clientes
  add column if not exists descartado_em timestamptz,
  add column if not exists motivo_descarte text;

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
      visto_em = null,
      descartado_em = null,
      motivo_descarte = null
  where array_position(array['roubo','frustracao','duplicado','whatsapp'], excluded.nivel)
      < array_position(array['roubo','frustracao','duplicado','whatsapp'], alertas_clientes.nivel);
$$;

-- O painel do vendedor também não mostra o alerta descartado.
create or replace function public.alertas_vendedor()
returns table (pedido_id text, outro_numero bigint, outro_status text, outro_data date, por text, outro_cpf boolean)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, o.internal_id, o.status, o.data,
         case when m.cpf_hash is not null and o.cpf_hash = m.cpf_hash then 'cpf' else 'telefone' end,
         coalesce(m.cpf_hash is not null and o.cpf_hash is not null and o.cpf_hash <> m.cpf_hash, false)
  from public.dashboard_vendedores v
  join public.bluesales_pedidos m
    on m.user_id = v.dono_id
   and upper(trim(m.vendedor)) = upper(trim(v.vendedor))
   and m.removido_em is null
  join public.bluesales_pedidos o
    on o.user_id = m.user_id
   and o.id <> m.id
   and o.removido_em is null
   and ((m.cpf_hash is not null and o.cpf_hash = m.cpf_hash)
     or (m.tel_hash is not null and o.tel_hash = m.tel_hash))
  where v.membro_id = auth.uid()
    and not exists (
      select 1 from public.alertas_clientes a
      where a.user_id = m.user_id and a.pedido_id = m.id and a.descartado_em is not null
    );
$$;

revoke all on function public.alertas_vendedor() from anon;

select count(*) as colunas_descarte
from information_schema.columns
where table_name = 'alertas_clientes' and column_name in ('descartado_em', 'motivo_descarte');
