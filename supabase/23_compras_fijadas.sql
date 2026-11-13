-- Compras fijadas (recurrentes): una compra de tarjeta marcada como fijada se queda al terminar el corte;
-- las demás compras de contado se pueden limpiar cuando el corte termina.
-- Ejecutar una vez en Supabase > SQL Editor, después de 22_plan_de_niveles.sql.

begin;

alter table public.fin_expenses
  add column pinned boolean not null default false;

commit;
