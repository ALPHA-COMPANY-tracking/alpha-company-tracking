-- Valor do pedido NO MOMENTO DO AGENDAMENTO.
--
-- O "Faturamento Agendado" do BlueSales congela o valor da venda: um
-- desconto negociado depois (na cobrança) muda o que entra de receita,
-- mas não reescreve o agendado. Provado pelo Resultado Diário:
--   12/08 = R$ 1.465,00 = 735 + 730  (BLV-3GKQG2596F agendou 730 e pagou 698,25)
--   24/08 = R$ 2.940,00 = 4 x 735    (BLV-8RUBBQ8ZHC agendou 735, hoje cobra 700)
--   29/08 = R$ 2.170,00 = 735+735+700 (BLV-GDU2EG43PM já nasceu com desconto)
-- Soma de agosto: 57.540 - 5 - 35 = R$ 57.500,00, igual ao BlueSales.

alter table public.bluesales_pedidos
  add column if not exists valor_agendado numeric(12,2);

-- Histórico: o valor cheio é o do agendamento…
update public.bluesales_pedidos
  set valor_agendado = coalesce(valor_bruto, valor)
  where valor_agendado is null;

-- …exceto os dois casos que o Resultado Diário mostra diferente.
update public.bluesales_pedidos set valor_agendado = 730 where id = 'BLV-3GKQG2596F';
update public.bluesales_pedidos set valor_agendado = 700 where id = 'BLV-GDU2EG43PM';

-- Daqui pra frente: preenchido no primeiro evento do pedido e nunca mais
-- alterado (updates de status/cobrança não tocam nele).
create or replace function public.set_valor_agendado()
returns trigger
language plpgsql
as $$
begin
  if new.valor_agendado is null then
    new.valor_agendado := new.valor;
  end if;
  return new;
end $$;

drop trigger if exists trg_valor_agendado on public.bluesales_pedidos;
create trigger trg_valor_agendado
  before insert or update on public.bluesales_pedidos
  for each row execute function public.set_valor_agendado();
