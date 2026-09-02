-- O que aconteceu com a notificação daquele evento.
--
-- O webhook engolia qualquer falha de push num `catch` vazio: o pedido
-- entrava, o celular não tocava e não sobrava rastro nenhum. Diagnosticar
-- virava adivinhação (foi o caso do agendamento da NEDIR, 02/09).
--
-- Guarda um resumo curto e legível: 'enviados 2/2', 'sem aviso para
-- ORDER_SHIPPED', 'nenhum aparelho inscrito', 'falha 410: ...'.
alter table public.webhook_logs
  add column if not exists push text;
