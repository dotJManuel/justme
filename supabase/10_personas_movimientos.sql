-- Panel de administración, paso 3: personas y conceptos de movimientos (Pendiente > Dinero que me deben).
-- Ejecutar una vez en Supabase > SQL Editor, después de 09_conceptos.sql. Si vas a correr también
-- 05_importar_excel.sql, córrelo ANTES de este archivo (usa las columnas viejas "person" y "concept").
--
-- Relaciones:
--   fin_people    1 ──< fin_debts   (movimientos de esa persona)
--   fin_concepts  1 ──< fin_debts   (movimientos con ese concepto; scope = 'movimiento')
--   fin_debts     1 ──< fin_debts   (abonos aplicados a un cargo; ya existía)
-- Todas las claves foráneas son compuestas (user_id, id): un movimiento nunca puede apuntar a una persona
-- ni a un concepto de otro usuario. Borrar una persona o un concepto borra los movimientos que lo usan
-- y, por la relación de abonos, los abonos aplicados a los cargos borrados (ON DELETE CASCADE); la app
-- avisa cuántos son antes de confirmar. Desactivar no borra nada: solo deja de ofrecerse en el formulario.
--
-- El Tipo (cargo / abono) se queda fijo: de él dependen las cuentas.
--
-- Todo va en una transacción: si algo falla, no se aplica nada.

begin;

-- Personas. "scope" separa los catálogos por uso: hoy solo 'deudor' (quien me debe).
create table public.fin_people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  scope text not null check (scope in ('deudor')),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- necesario para las claves foráneas compuestas de fin_debts
  unique (user_id, id)
);

-- Sin nombres repetidos por usuario y catálogo, sin distinguir mayúsculas ni espacios de más
create unique index fin_people_name on public.fin_people (user_id, scope, lower(btrim(name)));

alter table public.fin_people enable row level security;

create policy "mis personas" on public.fin_people
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.fin_people to authenticated;

-- Una persona por cada nombre distinto que ya tienes ("YO" y "yo" cuentan como la misma)
insert into public.fin_people (user_id, scope, name)
select user_id, 'deudor', (array_agg(btrim(person) order by created_at))[1]
from public.fin_debts
group by user_id, lower(btrim(person));

-- Los conceptos de movimientos viven en la misma tabla que los de gastos, con otro scope
alter table public.fin_concepts drop constraint fin_concepts_scope_check;
alter table public.fin_concepts
  add constraint fin_concepts_scope_check check (scope in ('gasto', 'movimiento'));

-- Los conceptos de movimientos eran texto de hasta 200 caracteres
alter table public.fin_concepts drop constraint fin_concepts_name_check;
alter table public.fin_concepts
  add constraint fin_concepts_name_check check (char_length(btrim(name)) between 1 and 200);

insert into public.fin_concepts (user_id, scope, name)
select user_id, 'movimiento', (array_agg(btrim(concept) order by created_at))[1]
from public.fin_debts
where btrim(concept) <> ''
group by user_id, lower(btrim(concept));

-- Movimientos: de los textos "person" y "concept" a las referencias person_id y concept_id
alter table public.fin_debts add column person_id uuid, add column concept_id uuid;

update public.fin_debts d
set person_id = p.id
from public.fin_people p
where p.user_id = d.user_id
  and p.scope = 'deudor'
  and lower(btrim(p.name)) = lower(btrim(d.person));

update public.fin_debts d
set concept_id = c.id
from public.fin_concepts c
where c.user_id = d.user_id
  and c.scope = 'movimiento'
  and btrim(d.concept) <> ''
  and lower(btrim(c.name)) = lower(btrim(d.concept));

-- La persona es obligatoria; el concepto es opcional (un movimiento puede no tener)
alter table public.fin_debts alter column person_id set not null;

alter table public.fin_debts
  add constraint fin_debts_person_fk
    foreign key (user_id, person_id) references public.fin_people (user_id, id) on delete cascade,
  add constraint fin_debts_concept_fk
    foreign key (user_id, concept_id) references public.fin_concepts (user_id, id) on delete cascade;

create index fin_debts_person on public.fin_debts (user_id, person_id);
create index fin_debts_concept on public.fin_debts (user_id, concept_id) where concept_id is not null;
-- Acelera el borrado en cascada de abonos al borrar un cargo
create index fin_debts_applies on public.fin_debts (user_id, applies_to) where applies_to is not null;

-- Al quitar las columnas viejas se van también sus checks de longitud
alter table public.fin_debts drop column person, drop column concept;

commit;
