-- Panel de administración, paso 4: conceptos y personas de "Dinero con familia" (Recibido y Dado).
-- Ejecutar una vez en Supabase > SQL Editor, después de 10_personas_movimientos.sql (y de 07_familia_persona.sql).
-- Si vas a correr también 05_importar_excel.sql, córrelo ANTES (usa las columnas viejas "name" y "person").
--
-- Relaciones:
--   fin_people    1 ──< fin_family   (de quién se recibió / para quién se dio; scope = 'familia')
--   fin_concepts  1 ──< fin_family   (concepto del movimiento; scope = 'familia')
-- Las claves foráneas son compuestas (user_id, id): un registro nunca puede apuntar a una persona ni a un
-- concepto de otro usuario. Borrar una persona o un concepto borra los registros que lo usan (ON DELETE
-- CASCADE); la app avisa cuántos son antes de confirmar. Desactivar no borra nada.
--
-- Recibido y Dado comparten los mismos catálogos de personas y conceptos de familia ("Abuelita" puede
-- darte y recibir). Reglas: un recibido siempre lleva concepto; un dado siempre lleva persona (para quién).
-- Lo demás es opcional.
--
-- Todo va en una transacción: si algo falla, no se aplica nada.

begin;

-- Los catálogos aceptan el nuevo uso 'familia'
alter table public.fin_people drop constraint fin_people_scope_check;
alter table public.fin_people add constraint fin_people_scope_check check (scope in ('deudor', 'familia'));

alter table public.fin_concepts drop constraint fin_concepts_scope_check;
alter table public.fin_concepts
  add constraint fin_concepts_scope_check check (scope in ('gasto', 'movimiento', 'familia'));

-- Los nombres de familia eran texto de hasta 80 caracteres
alter table public.fin_people drop constraint fin_people_name_check;
alter table public.fin_people add constraint fin_people_name_check check (char_length(btrim(name)) between 1 and 80);

-- Personas: cada "para quién" de lo dado y cada "de quién" de lo recibido (sin repetir)
insert into public.fin_people (user_id, scope, name)
select user_id, 'familia', (array_agg(n order by created_at))[1]
from (
  select user_id, btrim(name) as n, created_at from public.fin_family where direction = 'dado'
  union all
  select user_id, btrim(person), created_at from public.fin_family where direction = 'recibido' and btrim(person) <> ''
) t
where n <> ''
group by user_id, lower(n);

-- Conceptos: los de lo recibido (el campo "name" de Recibido era el concepto)
insert into public.fin_concepts (user_id, scope, name)
select user_id, 'familia', (array_agg(btrim(name) order by created_at))[1]
from public.fin_family
where direction = 'recibido' and btrim(name) <> ''
group by user_id, lower(btrim(name));

alter table public.fin_family add column person_id uuid, add column concept_id uuid;

-- Recibido: concepto = name, de quién = person
update public.fin_family f
set concept_id = c.id
from public.fin_concepts c
where f.direction = 'recibido'
  and c.user_id = f.user_id and c.scope = 'familia'
  and lower(btrim(c.name)) = lower(btrim(f.name));

update public.fin_family f
set person_id = p.id
from public.fin_people p
where f.direction = 'recibido' and btrim(f.person) <> ''
  and p.user_id = f.user_id and p.scope = 'familia'
  and lower(btrim(p.name)) = lower(btrim(f.person));

-- Dado: para quién = name
update public.fin_family f
set person_id = p.id
from public.fin_people p
where f.direction = 'dado'
  and p.user_id = f.user_id and p.scope = 'familia'
  and lower(btrim(p.name)) = lower(btrim(f.name));

alter table public.fin_family
  add constraint fin_family_person_fk
    foreign key (user_id, person_id) references public.fin_people (user_id, id) on delete cascade,
  add constraint fin_family_concept_fk
    foreign key (user_id, concept_id) references public.fin_concepts (user_id, id) on delete cascade,
  -- recibido => concepto obligatorio; dado => persona (para quién) obligatoria
  add constraint fin_family_required_check check (
    (direction = 'recibido' and concept_id is not null)
    or (direction = 'dado' and person_id is not null)
  );

create index fin_family_person on public.fin_family (user_id, person_id) where person_id is not null;
create index fin_family_concept on public.fin_family (user_id, concept_id) where concept_id is not null;

-- Al quitar las columnas viejas se van también sus checks de longitud
alter table public.fin_family drop column name, drop column person;

commit;
