-- Notas: orden manual, notas fijadas (en el orden que se quiera) y mover una nota dentro de otra (agrupar).
-- Ejecutar una vez en Supabase > SQL Editor, después de 26_notas_imagenes_y_arreglo.sql.
--
-- sort_order: lugar de la nota entre sus hermanas (las del mismo padre). pin_order: lugar entre las fijadas (null = no fijada).
-- La tabla sigue sin admitir UPDATE directo: todo cambio pasa por estas funciones, que solo tocan notas de quien las llama.
-- Ya no es cierto que parent_id solo se fije al crear: note_move lo cambia y se encarga de que no se formen ciclos.

begin;

alter table public.notes
  add column sort_order int not null default 0,
  add column pin_order int;

create index notes_pin on public.notes (user_id, pin_order) where pin_order is not null;
create index notes_sort on public.notes (user_id, parent_id, sort_order);

-- Al crear, la nota puede traer su lugar (el cliente la pone al final de sus hermanas).
grant insert (sort_order) on public.notes to authenticated;

-- Las notas fijadas, en este orden (lo que no está en la lista deja de estar fijado).
create function public.note_set_pins(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notes set pin_order = null where user_id = auth.uid() and pin_order is not null;
  update public.notes n set pin_order = t.ord - 1
    from unnest(p_ids) with ordinality as t(id, ord)
   where n.id = t.id and n.user_id = auth.uid();
end;
$$;

-- El orden de un grupo de notas hermanas: cada una toma como lugar su posición en la lista.
create function public.note_reorder(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notes n set sort_order = t.ord - 1
    from unnest(p_ids) with ordinality as t(id, ord)
   where n.id = t.id and n.user_id = auth.uid();
end;
$$;

-- Mueve una nota dentro de otra (o al nivel principal con p_parent null), al final de sus nuevas hermanas.
-- 'ok' | 'missing' (alguna de las dos no existe o no es tuya) | 'cycle' (no se puede meter una nota dentro de sí misma
-- ni de una de sus subpáginas).
create function public.note_move(p_id uuid, p_parent uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.notes where id = p_id and user_id = auth.uid()) then
    return 'missing';
  end if;
  if p_parent is not null then
    if not exists (select 1 from public.notes where id = p_parent and user_id = auth.uid()) then
      return 'missing';
    end if;
    if p_parent = p_id or exists (
      with recursive d(id) as (
        select id from public.notes where parent_id = p_id and user_id = auth.uid()
        union all
        select n.id from public.notes n join d on n.parent_id = d.id where n.user_id = auth.uid()
      )
      select 1 from d where d.id = p_parent
    ) then
      return 'cycle';
    end if;
  end if;
  update public.notes
     set parent_id = p_parent,
         sort_order = coalesce(
           (select max(s.sort_order) + 1 from public.notes s
             where s.user_id = auth.uid() and s.parent_id is not distinct from p_parent and s.id <> p_id), 0)
   where id = p_id and user_id = auth.uid();
  return 'ok';
end;
$$;

revoke all on function public.note_set_pins(uuid[]) from public, anon;
revoke all on function public.note_reorder(uuid[]) from public, anon;
revoke all on function public.note_move(uuid, uuid) from public, anon;
grant execute on function public.note_set_pins(uuid[]) to authenticated;
grant execute on function public.note_reorder(uuid[]) to authenticated;
grant execute on function public.note_move(uuid, uuid) to authenticated;

commit;
