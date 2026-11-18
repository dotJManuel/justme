-- Notas (estilo Notion / Docs de Claude): páginas hechas de bloques (texto, títulos, listas, tareas, citas, separadores).
-- Ejecutar una vez en Supabase > SQL Editor, después de 23_compras_fijadas.sql.
--
-- Una sola persona edita a la vez: quien abre una nota para editar toma un "bloqueo" de 45 s que su pantalla renueva
-- cada 15 s. Mientras el bloqueo es de otra pestaña o dispositivo, la nota solo se puede leer. El bloqueo se hace
-- cumplir aquí: la tabla no admite UPDATE directo, solo note_save(), que rechaza a quien no tenga el bloqueo.

begin;

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 200),
  -- [{ "id": "...", "type": "p|h1|h2|ul|ol|todo|quote|hr", "text": "...", "done": false }]
  content jsonb not null default '[]'
    check (jsonb_typeof(content) = 'array' and pg_column_size(content) <= 500000),
  lock_holder text check (char_length(lock_holder) <= 64),
  lock_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_user on public.notes (user_id, updated_at desc);

alter table public.notes enable row level security;

create policy "ver mis notas" on public.notes
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "crear mis notas" on public.notes
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "borrar mis notas" on public.notes
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Sin UPDATE: el contenido solo cambia por note_save (que revisa el bloqueo).
grant select, delete on public.notes to authenticated;
grant insert (title, content) on public.notes to authenticated;

-- Toma el bloqueo. 'ok' = es tuyo; 'locked' = lo tiene otra pestaña o dispositivo; 'missing' = la nota no existe.
-- Con p_force se lo quita a quien lo tenga ("Editar aquí"). Llamarla de nuevo con el mismo p_holder lo renueva.
create function public.note_lock(p_id uuid, p_holder text, p_force boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notes
     set lock_holder = p_holder, lock_until = now() + interval '45 seconds'
   where id = p_id and user_id = auth.uid()
     and (p_force or lock_holder is null or lock_holder = p_holder or lock_until is null or lock_until < now());
  if found then return 'ok'; end if;
  if exists (select 1 from public.notes where id = p_id and user_id = auth.uid()) then return 'locked'; end if;
  return 'missing';
end;
$$;

-- Suelta el bloqueo (solo si sigue siendo tuyo).
create function public.note_unlock(p_id uuid, p_holder text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notes set lock_holder = null, lock_until = null
   where id = p_id and user_id = auth.uid() and lock_holder = p_holder;
$$;

-- Guarda título y contenido. Solo lo logra quien tiene el bloqueo; además lo renueva.
-- 'ok' | 'locked' (otra sesión lo tomó) | 'missing' (la nota ya no existe).
create function public.note_save(p_id uuid, p_holder text, p_title text, p_content jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notes
     set title = p_title, content = p_content, updated_at = now(), lock_until = now() + interval '45 seconds'
   where id = p_id and user_id = auth.uid() and lock_holder = p_holder;
  if found then return 'ok'; end if;
  if exists (select 1 from public.notes where id = p_id and user_id = auth.uid()) then return 'locked'; end if;
  return 'missing';
end;
$$;

revoke all on function public.note_lock(uuid, text, boolean) from public, anon;
revoke all on function public.note_unlock(uuid, text) from public, anon;
revoke all on function public.note_save(uuid, text, text, jsonb) from public, anon;
grant execute on function public.note_lock(uuid, text, boolean) to authenticated;
grant execute on function public.note_unlock(uuid, text) to authenticated;
grant execute on function public.note_save(uuid, text, text, jsonb) to authenticated;

commit;
