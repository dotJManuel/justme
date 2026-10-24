-- Panel de administración, paso 1: tarjetas de crédito como catálogo (se pueden agregar, desactivar y eliminar).
-- Ejecutar una vez en Supabase > SQL Editor, después de 04 a 07. Si vas a correr también
-- 05_importar_excel.sql, córrelo ANTES de este archivo (usa las columnas viejas).
--
-- Relaciones:
--   fin_cards  1 ──< fin_expenses   (gastos de esa tarjeta)
--   fin_cards  1 ──< fin_cuts       (cortes de esa tarjeta)
-- Las dos llevan clave foránea compuesta (user_id, card_id): una fila de un usuario nunca puede apuntar
-- a una tarjeta de otro. Borrar una tarjeta borra sus gastos y cortes (ON DELETE CASCADE); la app avisa
-- cuántos son antes de confirmar. Desactivarla no borra nada: solo la oculta.
--
-- Todo va en una transacción: si algo falla, no se aplica nada.

begin;

create table public.fin_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  -- día del mes en que corta la tarjeta; si el mes es más corto, cuenta el último día
  cut_day int not null check (cut_day between 1 and 31),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- necesario para las claves foráneas compuestas de abajo
  unique (user_id, id)
);

-- Sin nombres repetidos por usuario, sin distinguir mayúsculas
create unique index fin_cards_name on public.fin_cards (user_id, lower(btrim(name)));

alter table public.fin_cards enable row level security;

create policy "mis tarjetas" on public.fin_cards
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.fin_cards to authenticated;

-- Las dos tarjetas que ya existían (Santander corta el 12 y BBVA el 24), solo para quien tenga datos
insert into public.fin_cards (user_id, name, cut_day)
select u.id, v.name, v.cut_day
from auth.users u
cross join (values ('Santander', 12), ('BBVA', 24)) as v(name, cut_day)
where exists (select 1 from public.fin_expenses e where e.user_id = u.id and e.section in ('santander', 'bbva'))
   or exists (select 1 from public.fin_cuts c where c.user_id = u.id);

-- Gastos: de "section = santander/bbva" a "section = tarjeta" + card_id
alter table public.fin_expenses add column card_id uuid;

update public.fin_expenses e
set card_id = c.id
from public.fin_cards c
where c.user_id = e.user_id
  and lower(c.name) = e.section
  and e.section in ('santander', 'bbva');

alter table public.fin_expenses drop constraint fin_expenses_section_check;
update public.fin_expenses set section = 'tarjeta' where section in ('santander', 'bbva');

alter table public.fin_expenses
  add constraint fin_expenses_section_check check (section in ('tarjeta', 'fijos')),
  -- una compra de tarjeta siempre tiene tarjeta; un gasto fijo nunca
  add constraint fin_expenses_card_check check ((section = 'tarjeta') = (card_id is not null)),
  add constraint fin_expenses_card_fk
    foreign key (user_id, card_id) references public.fin_cards (user_id, id) on delete cascade;

create index fin_expenses_card on public.fin_expenses (user_id, card_id);

-- Cortes: de "card = santander/bbva" a card_id
alter table public.fin_cuts add column card_id uuid;

update public.fin_cuts cu
set card_id = c.id
from public.fin_cards c
where c.user_id = cu.user_id
  and lower(c.name) = cu.card;

alter table public.fin_cuts alter column card_id set not null;

-- Al quitar la columna vieja se van también su check y el índice único (user_id, card, period_end)
alter table public.fin_cuts drop column card;

alter table public.fin_cuts
  add constraint fin_cuts_card_fk
    foreign key (user_id, card_id) references public.fin_cards (user_id, id) on delete cascade;

-- Un solo registro por tarjeta y corte
create unique index fin_cuts_card_period on public.fin_cuts (user_id, card_id, period_end)
  where period_end is not null;

commit;
