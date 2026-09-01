-- Taxa de plataforma cobrada pelo BlueSales NESTE pagamento.
--
-- Antes a taxa era lançada à mão por dia, junto com o investimento em
-- anúncios — o que misturava tráfego pago com taxa de gateway e fazia a
-- comissão divergir do BlueSales sempre que o lançamento era esquecido
-- (ex.: R$ 58,50 aqui contra R$ 58,25 lá = 5% dos R$ 5,00 de taxa).
--
-- Agora ela mora no pagamento, que é onde ela é cobrada: o webhook grava
-- sozinho quando o BlueSales informa, e a tela "Taxas" permite corrigir.
--
-- NULL = o BlueSales não informou a taxa deste pagamento. Nesse caso o
-- P&L cai no valor do dia em afterpay_daily.taxas_plataforma, que é como
-- o histórico de agosto/2026 está registrado.
alter table public.bluesales_pedidos
  add column if not exists taxa_plataforma numeric(12,2);
