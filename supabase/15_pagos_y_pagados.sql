-- Pagos repartidos y cargos pagados:
--   • payment_id: los abonos de un mismo pago repartido entre varios conceptos comparten este número.
--   • archived: un cargo que ya quedó pagado pasa solo al Historial (pestaña "Pagados") junto con sus abonos;
--     desde ahí se puede regresar a pendiente. Los abonos siguen a su cargo.
-- Ejecutar una vez en Supabase > SQL Editor, después de 14_borrar_historial.sql.

begin;

alter table public.fin_debts
  add column payment_id uuid,
  add column archived boolean not null default false;

create index fin_debts_payment on public.fin_debts (user_id, payment_id) where payment_id is not null;

-- Lo que ya estaba totalmente pagado antes de esta función pasa también al historial de pagados
update public.fin_debts c
set archived = true
where c.kind = 'cargo'
  and c.amount > 0
  and c.amount <= coalesce((select sum(a.amount) from public.fin_debts a where a.applies_to = c.id and a.kind = 'abono'), 0);

commit;
