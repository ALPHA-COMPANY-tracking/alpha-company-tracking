-- Valor pago corrigido à mão, que o BlueSales não sobrescreve.
--
-- A planilha "[PayAfter] Pagamentos Aprovados" é a conferência do que de
-- fato entrou. Em 16/09/2026 ela fechou R$ 30.801,00 contra R$ 31.571,00
-- do BlueSales — R$ 770,00 de diferença, exatamente:
--   · #393 (pago 05/09, R$ 735, boleto, PETER) não está na planilha;
--   · Ivanilda Maria Silva Vieira (11/09, MATEUS) pagou R$ 700, não 735.
-- Decisão do Jonas: a planilha manda, em tudo (receita, comissões, custos).
--
-- O webhook grava `valor` a cada evento do pedido; sem proteção, a próxima
-- atualização do BlueSales traria os R$ 735 de volta. Com valor_manual o
-- valor fica congelado para o WEBHOOK (que sempre grava atualizado_em);
-- uma correção feita à mão aqui no SQL continua funcionando.

alter table public.bluesales_pedidos
  add column if not exists valor_manual boolean not null default false;

create or replace function public.preservar_valor_manual()
returns trigger
language plpgsql
as $$
begin
  if old.valor_manual
     and new.valor_manual
     and new.atualizado_em is distinct from old.atualizado_em
  then
    new.valor := old.valor;
  end if;
  return new;
end $$;

drop trigger if exists trg_valor_manual on public.bluesales_pedidos;
create trigger trg_valor_manual
  before update on public.bluesales_pedidos
  for each row execute function public.preservar_valor_manual();

-- ── Correções de 16/09/2026 ──────────────────────────────────

-- #393: fora da plataforma (mesmo efeito da lixeira da tela Vendas; volta
-- com removido_em = null).
update public.bluesales_pedidos
  set removido_em = now()
  where internal_id = 393 and removido_em is null;

-- Ivanilda: pagou R$ 700. O agendado continua R$ 735 (é o valor do
-- agendamento, congelado — ver 0008); muda só o que entrou.
update public.bluesales_pedidos
  set valor = 700, valor_manual = true
  where cliente ilike '%ivanilda%'
    and data_aprovacao = '2026-09-11'
    and removido_em is null;

-- Conferência: devem aparecer as duas linhas abaixo.
select internal_id, cliente, valor, valor_bruto, valor_agendado, valor_manual,
       removido_em is not null as removido, data_aprovacao, vendedor
from public.bluesales_pedidos
where internal_id = 393 or cliente ilike '%ivanilda%'
order by internal_id;
