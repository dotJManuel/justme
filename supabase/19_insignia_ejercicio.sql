-- Misión y insignia de ejercicio por defecto: "Hacer ejercicio" y "En movimiento" (7 días de ejercicio).
-- Ejecutar una vez en Supabase > SQL Editor, después de 18_insignias.sql.
--
--   • Quien se registre desde ahora recibe la insignia con las demás (se actualiza seed_default_badges); la misión
--     la crea la app con las misiones iniciales (habits.config.ts).
--   • Quien ya usa la app recibe la misión (activa, al final de su lista) y la insignia, una sola vez.
--     Se pueden renombrar, desactivar o quitar en Perfil > Misiones y Perfil > Insignias.

begin;

create or replace function public.seed_default_badges(uid uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.badges (user_id, name, icon, kind, target, habit_key, position) values
    (uid, 'Primer paso',      'check',     'misiones', 1,  null,        0),
    (uid, 'Doble racha',      'flame',     'racha',    2,  null,        1),
    (uid, 'Semana de fuego',  'calendar',  'racha',    7,  null,        2),
    (uid, 'Madrugador',       'sun-dim',   'mision',   7,  'celular',   3),
    (uid, 'Políglota',        'languages', 'mision',   10, 'ingles',    4),
    (uid, 'Mes imparable',    'trophy',    'racha',    30, null,        5),
    (uid, 'En movimiento',    'bolt',      'mision',   7,  'ejercicio', 6);
$$;

insert into public.habits (user_id, key, name, when_text, position, active)
select s.user_id, 'ejercicio', 'Hacer ejercicio', '30 min · huecos del día',
       coalesce((select max(h.position) + 1 from public.habits h where h.user_id = s.user_id), 0), true
from public.settings s
on conflict (user_id, key) do nothing;

insert into public.badges (user_id, name, icon, kind, target, habit_key, position)
select s.user_id, 'En movimiento', 'bolt', 'mision', 7, 'ejercicio',
       coalesce((select max(b.position) + 1 from public.badges b where b.user_id = s.user_id), 0)
from public.settings s
where not exists (select 1 from public.badges b where b.user_id = s.user_id and b.habit_key = 'ejercicio');

commit;
