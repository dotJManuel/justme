-- Grupos de misiones ("¿Cuándo?": Mañana, Durante el día, Noche y los tuyos) como datos propios.
-- Ejecutar en Supabase > SQL Editor, ANTES de desplegar la app que los usa, después de 19_insignia_ejercicio.sql.
-- Se puede correr más de una vez: lo que ya existe no se vuelve a crear ni se duplica.
--
--   mission_groups  1 ──< habits   (cada misión pertenece a un grupo; el grupo tiene nombre y orden)
--
-- Quitar un grupo deja sus misiones sin grupo (la app solo deja quitar uno vacío). Hasta ahora el grupo se deducía
-- de la hora de cada misión; esta migración lo guarda: a cada misión sin grupo le asigna el que le tocaba. Si usaste
-- una marca "[Tarde] 15:00" en el horario, se crea el grupo "Tarde" y la marca se quita del texto.
-- Requiere PostgreSQL 15 o más (ON DELETE SET NULL con columnas), que es lo que usa Supabase.

begin;

create table if not exists public.mission_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24 and name !~ '[\[\]]'),
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, id)
);

-- Dos grupos tuyos no pueden llamarse igual (sin importar mayúsculas)
create unique index if not exists mission_groups_name on public.mission_groups (user_id, lower(name));
create index if not exists mission_groups_user on public.mission_groups (user_id, position);

alter table public.mission_groups enable row level security;

drop policy if exists "mis grupos" on public.mission_groups;
create policy "mis grupos" on public.mission_groups
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.mission_groups to authenticated;

-- La misión apunta a su grupo con clave compuesta: nunca puede apuntar a un grupo de otra persona.
alter table public.habits add column if not exists group_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'habits_group_fk') then
    alter table public.habits
      add constraint habits_group_fk foreign key (user_id, group_id)
      references public.mission_groups (user_id, id) on delete set null (group_id);
  end if;
end
$$;

-- Los tres grupos de siempre. Se usan para quien ya existe (abajo) y para quien se registre (al crearse sus ajustes,
-- antes de que la app cree sus misiones iniciales).
create or replace function public.seed_default_groups(uid uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.mission_groups (user_id, name, position) values
    (uid, 'Mañana', 0), (uid, 'Durante el día', 1), (uid, 'Noche', 2)
  on conflict do nothing;
$$;

revoke all on function public.seed_default_groups(uuid) from public, anon, authenticated;

create or replace function public.seed_groups_for_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_groups(new.user_id);
  return new;
end;
$$;

drop trigger if exists settings_seed_groups on public.settings;
create trigger settings_seed_groups
  after insert on public.settings
  for each row execute function public.seed_groups_for_new_user();

-- ── Quien ya usa la app ──────────────────────────────────────────────────

select public.seed_default_groups(user_id) from public.settings;

-- Solo las misiones que todavía no tienen grupo: su marca "[Grupo]" si la tienen y, si no, el grupo que dice su hora
-- (igual que la app lo deducía: "hueco" = durante el día; antes de las 12 = mañana; de 12 a 18 = durante el día;
-- desde las 18 o sin hora = noche). Un grupo propio (una marca que no es de los tres de siempre) se crea al vuelo.
do $$
declare
  r record;
  grp text;
begin
  for r in
    select h.user_id, h.key,
           nullif(trim(substring(h.when_text from '^\[([^\]]{1,24})\]')), '') as mark,
           trim(regexp_replace(h.when_text, '^\[[^\]]{1,24}\]\s*', '')) as detail
    from public.habits h
    where h.group_id is null
    order by h.user_id, h.position
  loop
    grp := coalesce(r.mark,
      case
        when r.detail ~* 'hueco' then 'Durante el día'
        when r.detail ~ '\d{1,2}:\d{2}' then
          case
            when (substring(r.detail from '(\d{1,2}):\d{2}'))::int < 12 then 'Mañana'
            when (substring(r.detail from '(\d{1,2}):\d{2}'))::int < 18 then 'Durante el día'
            else 'Noche'
          end
        else 'Noche'
      end);

    -- Si el grupo no existe todavía, va al final de los que ya tiene esa persona
    insert into public.mission_groups (user_id, name, position)
    select r.user_id, grp, coalesce(max(m.position), 2) + 1
    from public.mission_groups m
    where m.user_id = r.user_id
      and not exists (
        select 1 from public.mission_groups x where x.user_id = r.user_id and lower(x.name) = lower(grp)
      )
    on conflict do nothing;

    update public.habits
    set group_id = (
          select g.id from public.mission_groups g where g.user_id = r.user_id and lower(g.name) = lower(grp)
        ),
        when_text = r.detail
    where user_id = r.user_id and key = r.key;
  end loop;
end
$$;

commit;
