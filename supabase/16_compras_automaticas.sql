-- Compras automáticas desde los correos de alerta del banco.
--   • fin_cards.last4: últimos 4 dígitos de la tarjeta (la terminación que trae la alerta) para saber a qué
--     tarjeta pertenece cada compra. Opcional; se captura en Administrar > Tarjetas de crédito.
--   • fin_expenses.source_id: identificador del correo de donde salió el gasto. Evita registrar dos veces la
--     misma alerta. Es nulo en los gastos que capturas tú.
-- Ejecutar una vez en Supabase > SQL Editor, después de 15_pagos_y_pagados.sql.

begin;

alter table public.fin_cards
  add column last4 text not null default '' check (last4 ~ '^([0-9]{4})?$');

-- Dos tarjetas tuyas no pueden compartir terminación (si no, no se sabría a cuál va la compra)
create unique index fin_cards_last4 on public.fin_cards (user_id, last4) where last4 <> '';

alter table public.fin_expenses
  add column source_id text check (char_length(source_id) <= 200);

create unique index fin_expenses_source on public.fin_expenses (user_id, source_id) where source_id is not null;

commit;
