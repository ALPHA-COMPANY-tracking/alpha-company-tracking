-- Taxa do dólar com data (Jonas, 20/11/2026).
--
-- Trocar a taxa (5,40 → 6,15, o que o cartão BTG passou a cobrar) refazia o
-- gasto de TODOS os dias sincronizados. Agora:
--   cotacoes_usd  [{ "desde": "AAAA-MM-DD", "valor": 6.15 }, …] — cada taxa vale
--                 a partir do seu dia; os dias de antes ficam com a anterior.
--                 "0001-01-01" = a taxa que já valia antes de qualquer troca.
--   cotacoes_dia  { "AAAA-MM-DD": 6.12, … } — o dólar exato cobrado num dia
--                 só; tem prioridade sobre a taxa a partir de.
-- cotacao_usd continua sendo a taxa de hoje (a que aparece na tela).

alter table public.meta_integracao
  add column if not exists cotacoes_usd jsonb not null default '[]'::jsonb,
  add column if not exists cotacoes_dia jsonb not null default '{}'::jsonb;

-- Histórico: R$ 5,40 em todos os dias até 19/11 (conferido no gasto gravado:
-- até 21/10, que o "Sincronizar agora" não refez, a taxa usada era 5,40) e
-- R$ 6,15 a partir de 20/11, quando o Jonas trocou (00:49 de 20/11).
update public.meta_integracao
set cotacoes_usd = '[{"desde": "2026-11-20", "valor": 6.15}, {"desde": "0001-01-01", "valor": 5.40}]'::jsonb
where user_id = 'fabbf23a-e34b-4445-b563-222c18642189' and cotacoes_usd = '[]'::jsonb;

notify pgrst, 'reload schema';

-- Conferência: deve mostrar as duas taxas e nenhum dia avulso.
select cotacao_usd, cotacoes_usd, cotacoes_dia from public.meta_integracao;
