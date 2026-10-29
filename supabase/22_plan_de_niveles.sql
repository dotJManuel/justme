-- Plan de niveles: cuánta experiencia pide cada nivel, hasta un nivel máximo, pensado para llegar en un año.
-- Ejecutar en Supabase > SQL Editor, ANTES de desplegar la app que lo usa, después de 21_insignias_por_niveles.sql.
-- Se puede correr más de una vez (también si ya corriste una versión anterior de este archivo).
--
-- La experiencia que pide cada nivel se guarda en tus ajustes (public.settings) y la app la ajusta sola:
-- los niveles que ya alcanzaste no cambian; los que faltan se recalculan cuando agregas, quitas o activas misiones
-- o cambias tu meta diaria, para que llegar al nivel máximo siga tomando un año (si te pasas unos días no pasa nada).
--
--   level_cap    el nivel máximo (50 por defecto)
--   level_ratio  qué parte de tus misiones activas esperas cumplir cada día (tu meta entre tus misiones activas)
--   level_start  desde cuándo cuenta el año
--   level_xp     la experiencia total que pide cada nivel, del 1 al máximo (el primero es 0).
--                Queda vacío hasta que la app la calcula la primera vez que abres la app.
--
-- Tu experiencia no cambia: sale de las misiones que marcaste. Solo cambia cuánto pide cada nivel que aún no alcanzas.
-- A quien ya usa la app se le calcula el plan con su meta diaria y sus misiones activas de hoy.

begin;

alter table public.settings add column if not exists level_cap int not null default 50;
alter table public.settings add column if not exists level_ratio numeric(5,4);
alter table public.settings add column if not exists level_start date not null default current_date;
alter table public.settings add column if not exists level_xp int[];

update public.settings s
set level_ratio = least(1, greatest(0.05,
  s.goal::numeric / greatest(1, (select count(*) from public.habits h where h.user_id = s.user_id and h.active))))
where s.level_ratio is null;

alter table public.settings alter column level_ratio set default 0.6;
alter table public.settings alter column level_ratio set not null;

-- Una versión anterior guardaba solo la experiencia del año; ya no hace falta
alter table public.settings drop column if exists level_year_xp;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settings_level_cap_check') then
    alter table public.settings add constraint settings_level_cap_check check (level_cap between 5 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'settings_level_ratio_check') then
    alter table public.settings add constraint settings_level_ratio_check check (level_ratio between 0.05 and 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'settings_level_xp_check') then
    alter table public.settings add constraint settings_level_xp_check check (
      level_xp is null or (array_length(level_xp, 1) = level_cap and level_xp[1] = 0)
    );
  end if;
end
$$;

commit;
