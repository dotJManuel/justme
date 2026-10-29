-- Insignias por niveles, como las medallas de Pokémon GO: Bronce, Plata, Oro y Platino.
-- Ejecutar en Supabase > SQL Editor, ANTES de desplegar la app que las usa, después de 20_grupos_de_misiones.sql.
-- Se puede correr más de una vez.
--
-- Antes cada insignia tenía una sola meta ("target"). Ahora tiene cuatro, una por nivel ("targets", de menor a mayor):
--   targets = {bronce, plata, oro, platino}
-- El tipo ("kind") y la misión ligada ("habit_key") siguen igual. Un nivel se gana al llegar a su meta; el nivel que
-- tienes es el más alto que alcanzaste. Nada se guarda sobre eso: se calcula siempre con tus días.
--
-- Tus insignias actuales no cambian de nombre, ícono, tipo ni misión, y lo que ya habías ganado sigue ganado:
-- su meta de antes pasa a ser la de Bronce. Las siete de siempre reciben metas de Plata, Oro y Platino pensadas para
-- ellas; las que creaste tú reciben x3, x10 y x30 su meta. Todas se pueden cambiar en Perfil > Insignias.

begin;

alter table public.badges add column if not exists targets int[];

do $$
declare
  r record;
  cur int[];
  b int;
  s int;
  g int;
  p int;
begin
  -- Solo si todavía existe la meta de antes (si ya se corrió, no hay nada que convertir)
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'badges' and column_name = 'target'
  ) then
    for r in select id, name, kind, target from public.badges where targets is null loop
      cur := case
        when r.name = 'Primer paso'     and r.kind = 'misiones' and r.target = 1  then array[1, 25, 100, 500]
        when r.name = 'Doble racha'     and r.kind = 'racha'    and r.target = 2  then array[2, 7, 14, 30]
        when r.name = 'Semana de fuego' and r.kind = 'racha'    and r.target = 7  then array[7, 14, 30, 60]
        when r.name = 'Madrugador'      and r.kind = 'mision'   and r.target = 7  then array[7, 30, 100, 365]
        when r.name = 'Políglota'       and r.kind = 'mision'   and r.target = 10 then array[10, 30, 100, 365]
        when r.name = 'Mes imparable'   and r.kind = 'racha'    and r.target = 30 then array[30, 60, 100, 365]
        when r.name = 'En movimiento'   and r.kind = 'mision'   and r.target = 7  then array[7, 30, 100, 365]
        else null
      end;

      if cur is null then
        b := least(r.target, 99997);
        s := greatest(b + 1, least(b * 3, 99998));
        g := greatest(s + 1, least(b * 10, 99999));
        p := greatest(g + 1, least(b * 30, 100000));
        cur := array[b, s, g, p];
      end if;

      update public.badges set targets = cur where id = r.id;
    end loop;

    alter table public.badges drop column target;
  end if;
end
$$;

alter table public.badges alter column targets set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'badges_targets_check') then
    alter table public.badges add constraint badges_targets_check check (
      array_length(targets, 1) = 4
      and array_position(targets, null) is null
      and targets[1] >= 1
      and targets[1] < targets[2]
      and targets[2] < targets[3]
      and targets[3] < targets[4]
      and targets[4] <= 100000
    );
  end if;
end
$$;

-- Lo que recibe quien se registre desde ahora
create or replace function public.seed_default_badges(uid uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.badges (user_id, name, icon, kind, targets, habit_key, position) values
    (uid, 'Primer paso',      'check',     'misiones', array[1, 25, 100, 500],   null,        0),
    (uid, 'Doble racha',      'flame',     'racha',    array[2, 7, 14, 30],      null,        1),
    (uid, 'Semana de fuego',  'calendar',  'racha',    array[7, 14, 30, 60],     null,        2),
    (uid, 'Madrugador',       'sun-dim',   'mision',   array[7, 30, 100, 365],   'celular',   3),
    (uid, 'Políglota',        'languages', 'mision',   array[10, 30, 100, 365],  'ingles',    4),
    (uid, 'Mes imparable',    'trophy',    'racha',    array[30, 60, 100, 365],  null,        5),
    (uid, 'En movimiento',    'bolt',      'mision',   array[7, 30, 100, 365],   'ejercicio', 6);
$$;

revoke all on function public.seed_default_badges(uuid) from public, anon, authenticated;

commit;
