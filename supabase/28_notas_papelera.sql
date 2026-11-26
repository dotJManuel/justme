-- Docs: papelera. Eliminar un doc lo manda a la papelera (junto con sus subpáginas) y se puede restaurar; el borrado definitivo
-- (uno solo o vaciar la papelera) sigue usando DELETE, que ya existe. Pasados 30 días el cliente vacía lo viejo.
-- Ejecutar una vez en Supabase > SQL Editor, después de 27_notas_orden_y_fijadas.sql.
--
-- deleted_at: cuándo se mandó a la papelera (null = vive). Un doc y sus subpáginas llevan la MISMA marca de tiempo, así
-- al restaurar se sabe qué se fue junto con él.

begin;

alter table public.notes add column deleted_at timestamptz;
create index notes_deleted on public.notes (user_id, deleted_at) where deleted_at is not null;

-- Manda a la papelera un doc y todo lo que tiene dentro. Quita las fijaciones y suelta el bloqueo de edición.
create function public.note_trash(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ts timestamptz := now();
begin
  with recursive d(id) as (
    select id from public.notes where id = p_id and user_id = auth.uid() and deleted_at is null
    union all
    select n.id from public.notes n join d on n.parent_id = d.id
     where n.user_id = auth.uid() and n.deleted_at is null
  )
  update public.notes n
     set deleted_at = ts, pin_order = null, lock_holder = null, lock_until = null
    from d
   where n.id = d.id;
end;
$$;

-- Saca de la papelera un doc y lo que se fue junto con él. Si su padre sigue en la papelera (o ya no existe), vuelve al
-- nivel principal. 'ok' | 'missing'.
create function public.note_restore(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  ts timestamptz;
  par uuid;
begin
  select deleted_at, parent_id into ts, par from public.notes where id = p_id and user_id = auth.uid() and deleted_at is not null;
  if ts is null then
    return 'missing';
  end if;
  if par is not null and not exists (
    select 1 from public.notes where id = par and user_id = auth.uid() and deleted_at is null
  ) then
    update public.notes set parent_id = null where id = p_id and user_id = auth.uid();
  end if;
  with recursive d(id) as (
    select id from public.notes where id = p_id and user_id = auth.uid()
    union all
    select n.id from public.notes n join d on n.parent_id = d.id
     where n.user_id = auth.uid() and n.deleted_at = ts
  )
  update public.notes n set deleted_at = null from d where n.id = d.id;
  -- Al final de sus hermanas.
  update public.notes
     set sort_order = coalesce(
       (select max(s.sort_order) + 1 from public.notes s
         where s.user_id = auth.uid() and s.deleted_at is null and s.parent_id is not distinct from
               (select parent_id from public.notes where id = p_id) and s.id <> p_id), 0)
   where id = p_id and user_id = auth.uid();
  return 'ok';
end;
$$;

revoke all on function public.note_trash(uuid) from public, anon;
revoke all on function public.note_restore(uuid) from public, anon;
grant execute on function public.note_trash(uuid) to authenticated;
grant execute on function public.note_restore(uuid) to authenticated;

commit;
