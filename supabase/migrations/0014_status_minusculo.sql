-- Padroniza os status em minúsculo.
--
-- O backfill de agosto/2026 gravou os status como a tela do BlueSales
-- mostra ("Pagos", "Frustrados", "Devolvido", "Aguard. Coleta") e o
-- webhook grava como a API manda ("pagos", "frustrados", "devolvido",
-- "aguard_coleta"). As duas grafias convivem na mesma tabela.
--
-- O app trata certo (normaliza antes de comparar), mas qualquer consulta
-- escrita à mão erra em silêncio: `status = 'frustrados'` devolve 7 dos
-- 11 pedidos, e ninguém desconfia do número.
--
-- Conferido em 08/09/2026 contra as abas do BlueSales — Pagos 61,
-- Devolvido 3, Frustrados 11, Aguard. Devolução 1 — todas fechando só ao
-- somar as duas grafias.
--
-- Daqui pra frente o webhook já grava minúsculo, então isto roda uma vez
-- e resolve. "Aguard. Coleta" também vira "aguard_coleta", que é como a
-- API nomeia o mesmo estado.
update public.bluesales_pedidos
   set status = case
         when lower(status) = 'aguard. coleta' then 'aguard_coleta'
         when lower(status) = 'aguard. devolução' then 'aguardando_devolucao'
         else lower(status)
       end
 where status is not null
   and status <> case
         when lower(status) = 'aguard. coleta' then 'aguard_coleta'
         when lower(status) = 'aguard. devolução' then 'aguardando_devolucao'
         else lower(status)
       end;
