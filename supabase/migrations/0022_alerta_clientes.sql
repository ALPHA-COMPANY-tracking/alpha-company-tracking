-- Alerta de Clientes: reconhecer a mesma cliente em pedidos diferentes
-- (pedido duplicado, cliente que já roubou ou frustrou).
--
-- NÃO se guarda CPF nem telefone. Guarda-se um CÓDIGO de cada um
-- (HMAC-SHA256 com a chave CLIENTE_HASH_KEY, que fica só na Vercel): o
-- mesmo CPF dá sempre o mesmo código, e do código não dá para voltar ao
-- CPF sem a chave. Serve só para comparar um pedido com outro.

alter table public.bluesales_pedidos
  add column if not exists cpf_hash text,
  add column if not exists tel_hash text;

create index if not exists idx_pedidos_cpf_hash on public.bluesales_pedidos (user_id, cpf_hash) where cpf_hash is not null;
create index if not exists idx_pedidos_tel_hash on public.bluesales_pedidos (user_id, tel_hash) where tel_hash is not null;

-- Histórico (uma vez, pelo CSV do BlueSales): o servidor gera os códigos e
-- grava de uma vez, pelo número do pedido. Roda com a permissão de quem
-- chama: só dono ou sócio alteram.
create or replace function public.definir_codigos_cliente(conta uuid, itens jsonb)
returns integer
language sql
security invoker
set search_path = public
as $$
  with v as (
    select (e->>'internal_id')::bigint as internal_id,
           nullif(e->>'cpf_hash', '') as cpf_hash,
           nullif(e->>'tel_hash', '') as tel_hash
    from jsonb_array_elements(itens) e
  ),
  feitos as (
    update public.bluesales_pedidos p
    set cpf_hash = coalesce(v.cpf_hash, p.cpf_hash),
        tel_hash = coalesce(v.tel_hash, p.tel_hash)
    from v
    where p.user_id = conta and p.internal_id = v.internal_id
    returning 1
  )
  select count(*)::integer from feitos;
$$;

-- Vendedor: o alerta dos PRÓPRIOS pedidos precisa olhar os pedidos de
-- todos (a cliente pode ter roubado de outro vendedor). Esta função faz a
-- comparação no banco e devolve dos outros pedidos só número, etapa e data.
create or replace function public.alertas_vendedor()
returns table (pedido_id text, outro_numero bigint, outro_status text, outro_data date, por text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, o.internal_id, o.status, o.data,
         case when m.cpf_hash is not null and o.cpf_hash = m.cpf_hash then 'cpf' else 'telefone' end
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

-- Conferência: as duas colunas novas.
select count(*) as colunas_codigo
from information_schema.columns
where table_name = 'bluesales_pedidos' and column_name in ('cpf_hash', 'tel_hash');
