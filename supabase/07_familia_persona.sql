-- Dinero con familia: de quién se recibió el dinero (solo se usa en "Recibido").
-- Ejecutar una vez en Supabase > SQL Editor (después de 04_finanzas.sql).
alter table public.fin_family
  add column person text not null default '' check (char_length(person) <= 80);
