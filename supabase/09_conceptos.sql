-- Panel de administración, paso 2: conceptos de gastos como catálogo (agregar, desactivar y eliminar).
-- Ejecutar una vez en Supabase > SQL Editor, después de 08_tarjetas.sql. Si vas a correr también
-- 05_importar_excel.sql, córrelo ANTES de este archivo (usa la columna vieja "concept").
--
-- Relaciones:
--   fin_concepts  1 ──< fin_expenses   (gastos que usan ese concepto)
-- La clave foránea es compuesta (user_id, concept_id): un gasto nunca puede usar un concepto de otro
-- usuario. Borrar un concepto borra los gastos que lo usan (ON DELETE CASCADE); la app avisa cuántos son
-- antes de confirmar. Desactivarlo no borra nada: solo deja de ofrecerse al capturar gastos nuevos.
--
-- "scope" separa los catálogos por uso: hoy solo 'gasto'. Los pasos siguientes (movimientos, recibido,
-- dado) ampliarán el check y reutilizarán esta misma tabla.
--
-- Todo va en una transacción: si algo falla, no se aplica nada.

begin;

create table public.fin_concepts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  scope text not null check (scope in ('gasto')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- necesario para la clave foránea compuesta de abajo
  unique (user_id, id)
);

-- Sin nombres repetidos por usuario y catálogo, sin distinguir mayúsculas ni espacios de más
create unique index fin_concepts_name on public.fin_concepts (user_id, scope, lower(btrim(name)));

alter table public.fin_concepts enable row level security;

create policy "mis conceptos" on public.fin_concepts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.fin_concepts to authenticated;

-- Un concepto por cada texto distinto que ya usan tus gastos ("rec" y "rec " cuentan como el mismo)
insert into public.fin_concepts (user_id, scope, name)
select user_id, 'gasto', (array_agg(btrim(concept) order by created_at))[1]
from public.fin_expenses
group by user_id, lower(btrim(concept));

-- Gastos: del texto "concept" a la referencia concept_id
alter table public.fin_expenses add column concept_id uuid;

update public.fin_expenses e
set concept_id = c.id
from public.fin_concepts c
where c.user_id = e.user_id
  and c.scope = 'gasto'
  and lower(btrim(c.name)) = lower(btrim(e.concept));

alter table public.fin_expenses alter column concept_id set not null;

alter table public.fin_expenses
  add constraint fin_expenses_concept_fk
    foreign key (user_id, concept_id) references public.fin_concepts (user_id, id) on delete cascade;

create index fin_expenses_concept on public.fin_expenses (user_id, concept_id);

-- Al quitar la columna vieja se va también su check de longitud
alter table public.fin_expenses drop column concept;

commit;
