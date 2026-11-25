-- Notas: (1) ARREGLO de «Nueva nota» (error 500) y (2) almacenamiento privado para las imágenes de las notas.
-- Ejecutar una vez en Supabase > SQL Editor, después de 25_notas_subpaginas.sql. Es seguro correrlo más de una vez.
--
-- (1) La política «crear mis notas» de 25_notas_subpaginas.sql consultaba la propia tabla `notes` desde su condición, y
--     Postgres lo rechaza con «infinite recursion detected in policy for relation notes» (por eso «Nueva nota» devolvía
--     500). Ahora la condición llama a una función que consulta sin pasar por la política (security definer).
-- (2) Bucket privado `note-images`: cada persona solo ve, sube y borra lo que está en su carpeta (<su id>/...).
--     Las imágenes se leen con direcciones firmadas temporales; nada es público.

begin;

-- (1) Arreglo de la política de crear notas -------------------------------------------------------------------------

create or replace function public.owns_note(p_id uuid)
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

drop policy if exists "crear mis notas" on public.notes;
create policy "crear mis notas" on public.notes
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (parent_id is null or public.owns_note(parent_id))
  );

-- (2) Imágenes de las notas ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-images', 'note-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ver mis imagenes de notas" on storage.objects;
create policy "ver mis imagenes de notas" on storage.objects
  for select to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "subir mis imagenes de notas" on storage.objects;
create policy "subir mis imagenes de notas" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'note-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "borrar mis imagenes de notas" on storage.objects;
create policy "borrar mis imagenes de notas" on storage.objects
  for delete to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

commit;
