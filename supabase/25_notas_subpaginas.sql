-- Notas: subpáginas (una nota dentro de otra) e ícono de página (un emoji).
-- Ejecutar una vez en Supabase > SQL Editor, después de 24_notas.sql.
--
-- parent_id solo se fija al crear la nota (no hay UPDATE directo), así que no pueden formarse ciclos. Borrar una nota
-- borra también sus subpáginas (on delete cascade). Los bloques nuevos (tabla, llamada, código, subpágina, índice)
-- viven dentro de `content`, que ya es jsonb: no necesitan columnas.

begin;

alter table public.notes
  add column parent_id uuid references public.notes (id) on delete cascade,
  add column icon text not null default '' check (char_length(icon) <= 16);

create index notes_parent on public.notes (parent_id);

-- ¿Es mía esta nota? Se consulta con una función (security definer) porque una política no puede leer su propia tabla
-- (Postgres lo rechaza con «infinite recursion detected in policy»).
create function public.owns_note(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.notes where id = p_id and user_id = auth.uid());
$$;

revoke all on function public.owns_note(uuid) from public, anon;
grant execute on function public.owns_note(uuid) to authenticated;

-- Crear: la nota padre debe ser también del mismo usuario.
drop policy "crear mis notas" on public.notes;
create policy "crear mis notas" on public.notes
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (parent_id is null or public.owns_note(parent_id))
  );

revoke insert on public.notes from authenticated;
grant insert (title, content, parent_id, icon) on public.notes to authenticated;

-- note_save ahora también guarda el ícono.
drop function public.note_save(uuid, text, text, jsonb);

create function public.note_save(p_id uuid, p_holder text, p_title text, p_content jsonb, p_icon text default '')
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notes
     set title = p_title, content = p_content, icon = coalesce(p_icon, ''), updated_at = now(),
         lock_until = now() + interval '45 seconds'
   where id = p_id and user_id = auth.uid() and lock_holder = p_holder;
  if found then return 'ok'; end if;
  if exists (select 1 from public.notes where id = p_id and user_id = auth.uid()) then return 'locked'; end if;
  return 'missing';
end;
$$;

revoke all on function public.note_save(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.note_save(uuid, text, text, jsonb, text) to authenticated;

commit;
