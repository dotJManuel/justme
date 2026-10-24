-- Impide, desde la API (app web y extensión), crear, editar o borrar días que no sean de "hoy".
-- Ejecutar una vez en Supabase > SQL Editor.
--
-- Zona horaria: la base de datos usa UTC y no sabe en qué zona estás. Para no bloquearte a ciertas
-- horas, se acepta el día UTC de hoy +/- 1: eso cubre el "hoy" de cualquier zona horaria (UTC-12 a
-- UTC+14). Cualquier día más antiguo queda bloqueado. La app ya limita la pantalla a tu "hoy" exacto.
--
-- Esta regla solo aplica cuando hay un usuario con sesión (auth.uid() no es nulo). El SQL Editor y las
-- tareas internas (por ejemplo, el borrado en cascada al eliminar un usuario) no tienen restricción.

create or replace function public.days_only_recent()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  utc_today date := (now() at time zone 'UTC')::date;
  target date;
begin
  if auth.uid() is null then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    target := old.date;
  else
    target := new.date;
  end if;

  if target < utc_today - 1 or target > utc_today + 1 then
    raise exception 'Solo se pueden modificar los días de hoy, no los anteriores'
      using errcode = 'check_violation';
  end if;

  -- Al editar tampoco se puede "mover" una fila antigua a una fecha válida.
  if tg_op = 'UPDATE' and (old.date < utc_today - 1 or old.date > utc_today + 1) then
    raise exception 'Solo se pueden modificar los días de hoy, no los anteriores'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.days_only_recent() from public, anon, authenticated;

drop trigger if exists days_only_recent on public.days;
create trigger days_only_recent
  before insert or update or delete on public.days
  for each row execute function public.days_only_recent();
