-- Integração Facebook: cadastro de contas de anúncio por BM, como no BlueSales.
--
--   meta_integracao.cadastro  contas cadastradas (Importar BM ou Manual):
--                             [{id, nome, moeda, status, ativa, business, bm_id, origem}]
--                             É daqui que sai a lista para marcar no P&L.
--   meta_bms                  o Access Token de cada BM importada.
--
-- O token é segredo: meta_bms fica com RLS ligado, SEM nenhuma política e
-- sem acesso para anon/authenticated — só o servidor (chave de serviço)
-- lê. Ninguém logado no app consegue ler o token, nem pela API do
-- Supabase; a tela só sabe se a BM tem token ou não.

alter table public.meta_integracao
  add column if not exists cadastro jsonb not null default '[]'::jsonb;

create table if not exists public.meta_bms (
  user_id uuid not null references auth.users (id) on delete cascade,
  bm_id text not null,
  token text not null,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, bm_id)
);

alter table public.meta_bms enable row level security;
revoke all on public.meta_bms from anon, authenticated;

-- A conta que já está ligada entra no cadastro, com o token da Vercel.
update public.meta_integracao
set cadastro = '[{"id":"652943883845467","nome":"BM 03 - Valentin_Wafer 01","moeda":"USD","status":"Ativa","ativa":true,"business":"Valentin Wafer","bm_id":null,"origem":"bm"}]'::jsonb
where cadastro = '[]'::jsonb
  and contas ? '652943883845467';

-- Conferência: 1 conta no cadastro, a mesma marcada no P&L.
select jsonb_array_length(cadastro) as contas_no_cadastro, contas as marcadas_no_pnl
from public.meta_integracao;
