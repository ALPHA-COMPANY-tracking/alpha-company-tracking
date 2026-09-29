-- Alerta de Clientes: "mesmo WhatsApp, outro CPF" é aviso próprio, não
-- "pedido duplicado" (pode ser mãe e filha no mesmo celular — ou golpe).
-- A função do vendedor passa a dizer quando o outro pedido tem CPF
-- diferente. Muda o formato da resposta, então é recriada.

drop function if exists public.alertas_vendedor();

create function public.alertas_vendedor()
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
  where v.membro_id = auth.uid();
$$;

revoke all on function public.alertas_vendedor() from anon;

select 'ok' as alertas_vendedor_atualizada;
