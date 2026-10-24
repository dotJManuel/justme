-- Fecha y hora de cada compra de tarjeta, y corte automático por mes.
-- Ejecutar una vez en Supabase > SQL Editor (después de 04_finanzas.sql).

-- Cuándo se hizo la compra (solo Santander y BBVA; en gastos fijos queda vacía)
alter table public.fin_expenses add column purchased_at timestamptz;

-- Día en que termina el corte (la app lo calcula: Santander el 12, BBVA el 24 de cada mes).
-- Los cortes importados del Excel quedan sin fecha y ya no se muestran.
alter table public.fin_cuts add column period_end date;

-- Un solo registro por tarjeta y corte
create unique index fin_cuts_card_period on public.fin_cuts (user_id, card, period_end)
  where period_end is not null;
