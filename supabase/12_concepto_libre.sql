-- Concepto de texto libre: además de elegir un concepto del catálogo, se puede escribir uno único.
-- Ejecutar una vez en Supabase > SQL Editor, después de 11_familia.sql.
--
-- Cada registro usa UNA de las dos formas:
--   concept_id    → un concepto del catálogo (se puede renombrar, desactivar o eliminar desde Administrar)
--   concept_text  → texto libre que solo vive en ese registro (no es parte del catálogo)
-- Las dos a la vez no se permiten. Qué tan obligatorio es el concepto depende de la tabla:
--   fin_expenses : obligatorio (catálogo O texto)
--   fin_debts    : opcional
--   fin_family   : obligatorio en "recibido"; opcional en "dado" (ahí lo obligatorio es la persona)
-- Los registros que ya tienes siguen igual: usan su concepto del catálogo.
--
-- Todo va en una transacción: si algo falla, no se aplica nada.

begin;

-- Gastos: ya no hay concepto de catálogo obligatorio; basta con uno de los dos
alter table public.fin_expenses
  add column concept_text text not null default '' check (char_length(concept_text) <= 120),
  alter column concept_id drop not null,
  add constraint fin_expenses_concept_one_check
    check ((concept_id is not null) <> (btrim(concept_text) <> ''));

-- Movimientos: opcional, pero no los dos a la vez
alter table public.fin_debts
  add column concept_text text not null default '' check (char_length(concept_text) <= 200),
  add constraint fin_debts_concept_both_check
    check (not (concept_id is not null and btrim(concept_text) <> ''));

-- Familia: el recibido necesita concepto (catálogo o texto); el dado necesita persona
alter table public.fin_family drop constraint fin_family_required_check;
alter table public.fin_family
  add column concept_text text not null default '' check (char_length(concept_text) <= 120),
  add constraint fin_family_concept_both_check
    check (not (concept_id is not null and btrim(concept_text) <> '')),
  add constraint fin_family_required_check check (
    (direction = 'recibido' and (concept_id is not null or btrim(concept_text) <> ''))
    or (direction = 'dado' and person_id is not null)
  );

commit;
