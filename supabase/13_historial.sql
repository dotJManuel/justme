-- Historial: cada alta, cambio y borrado de Finanzas queda registrado para poder consultarlo desde la app
-- (pestaña "Historial"): por ejemplo, ver qué pagos recibiste y cuándo, aunque después se editen o se eliminen.
-- Ejecutar una vez en Supabase > SQL Editor, después de 11_familia.sql y 12_concepto_libre.sql.
--
-- Cómo funciona:
--   • Un disparador (trigger) en cada tabla de Finanzas guarda en fin_audit una copia de la fila antes y después.
--     Los borrados en cascada también se registran: al borrar una persona quedan guardados todos sus movimientos.
--   • Los registros del historial no se pueden editar ni borrar desde la app: solo se pueden leer.
--   • No se borra nada automáticamente. Cada evento pesa unos cientos de bytes (con uso diario, del orden de
--     1 a 2 MB por año), muy lejos de los 500 MB del plan gratuito. Si algún día quieres limitarlo, se puede
--     programar una limpieza con pg_cron.
--   • Al borrar tu cuenta, su historial se borra con ella.
--
-- Todo va en una transacción: si algo falla, no se aplica nada.

begin;

create table public.fin_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  table_name text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  -- id de la fila afectada (en fin_settings, que no tiene id, el del usuario)
  row_id uuid not null,
  old_row jsonb,
  new_row jsonb,
  -- los cambios hechos en una misma operación (por ejemplo, un borrado en cascada) comparten este número
  batch bigint not null default txid_current()
);

create index fin_audit_user_at on public.fin_audit (user_id, at desc, id desc);
create index fin_audit_user_table on public.fin_audit (user_id, table_name, at desc, id desc);
create index fin_audit_user_row on public.fin_audit (user_id, row_id);

alter table public.fin_audit enable row level security;

-- Solo lectura y solo de lo propio: ni insertar, ni editar, ni borrar desde la app
create policy "mi historial" on public.fin_audit
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.fin_audit to authenticated;

create function public.fin_audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  j_old jsonb;
  j_new jsonb;
  j jsonb;
  uid uuid;
begin
  if tg_op = 'INSERT' then
    j_new := to_jsonb(new);
    j := j_new;
  elsif tg_op = 'UPDATE' then
    j_old := to_jsonb(old);
    j_new := to_jsonb(new);
    j := j_new;
    -- Un guardado que no cambió nada no es un evento.
    if j_old = j_new then
      return null;
    end if;
  else
    j_old := to_jsonb(old);
    j := j_old;
  end if;

  uid := (j ->> 'user_id')::uuid;

  -- Si se está borrando la cuenta completa, no hay a quién guardarle el historial.
  if not exists (select 1 from auth.users where id = uid) then
    return null;
  end if;

  insert into public.fin_audit (user_id, table_name, action, row_id, old_row, new_row)
  values (uid, tg_table_name, lower(tg_op), coalesce(j ->> 'id', j ->> 'user_id')::uuid, j_old, j_new);

  return null;
end;
$$;

revoke all on function public.fin_audit_row() from public, anon, authenticated;

create trigger fin_audit after insert or update or delete on public.fin_settings
  for each row execute function public.fin_audit_row();
create trigger fin_audit after insert or update or delete on public.fin_cards
  for each row execute function public.fin_audit_row();
create trigger fin_audit after insert or update or delete on public.fin_concepts
  for each row execute function public.fin_audit_row();
create trigger fin_audit after insert or update or delete on public.fin_people
  for each row execute function public.fin_audit_row();
create trigger fin_audit after insert or update or delete on public.fin_expenses
  for each row execute function public.fin_audit_row();
create trigger fin_audit after insert or update or delete on public.fin_cuts
  for each row execute function public.fin_audit_row();
create trigger fin_audit after insert or update or delete on public.fin_debts
  for each row execute function public.fin_audit_row();
create trigger fin_audit after insert or update or delete on public.fin_family
  for each row execute function public.fin_audit_row();

-- Lo que ya tienes entra al historial como "agregado" en la fecha en que se creó el registro,
-- para que no empiece vacío (de aquí en adelante se registra todo solo).
insert into public.fin_audit (user_id, table_name, action, row_id, new_row, at)
select user_id, 'fin_cards', 'insert', id, to_jsonb(t), created_at from public.fin_cards t
union all
select user_id, 'fin_concepts', 'insert', id, to_jsonb(t), created_at from public.fin_concepts t
union all
select user_id, 'fin_people', 'insert', id, to_jsonb(t), created_at from public.fin_people t
union all
select user_id, 'fin_expenses', 'insert', id, to_jsonb(t), created_at from public.fin_expenses t
union all
select user_id, 'fin_cuts', 'insert', id, to_jsonb(t), created_at from public.fin_cuts t
union all
select user_id, 'fin_debts', 'insert', id, to_jsonb(t), created_at from public.fin_debts t
union all
select user_id, 'fin_family', 'insert', id, to_jsonb(t), created_at from public.fin_family t;

commit;
