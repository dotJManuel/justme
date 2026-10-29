-- Insignias administrables (Racha › Logros): cada persona agrega, edita, activa y quita las suyas.
-- Ejecutar una vez en Supabase > SQL Editor, después de 17_enlaces.sql.
--
-- Una insignia se gana cuando su avance llega a la meta ("target"). El avance depende del tipo ("kind"):
--   racha     la mejor racha, en días
--   misiones  las misiones marcadas en toda la historia
--   xp        los puntos de experiencia (10 por misión)
--   mision    los días en que se marcó una misión concreta ("habit_key")
-- Nada se guarda sobre si la ganaste: se calcula siempre con tus días. Quitar una insignia no toca tus días.

begin;

create table public.badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  icon text not null default 'trophy'
    check (icon in ('check','flame','calendar','sun-dim','languages','trophy','bolt','heart','snowflake','users','wallet','history')),
  kind text not null check (kind in ('racha','misiones','xp','mision')),
  target int not null check (target between 1 and 100000),
  habit_key text check (char_length(habit_key) between 1 and 40),
  active boolean not null default true,
  position int not null default 0,
  created_at timestamptz not null default now(),
  -- "mision" necesita saber cuál; los demás tipos no la usan
  check ((kind = 'mision') = (habit_key is not null))
);

create index badges_user on public.badges (user_id, position);

alter table public.badges enable row level security;

create policy "mis insignias" on public.badges
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.badges to authenticated;

-- Las seis insignias de siempre. Se usan para quien ya existe (abajo) y para quien se registre
-- (al crearse sus ajustes, la primera vez que entra a la app).
create function public.seed_default_badges(uid uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.badges (user_id, name, icon, kind, target, habit_key, position) values
    (uid, 'Primer paso',      'check',     'misiones', 1,  null,       0),
    (uid, 'Doble racha',      'flame',     'racha',    2,  null,       1),
    (uid, 'Semana de fuego',  'calendar',  'racha',    7,  null,       2),
    (uid, 'Madrugador',       'sun-dim',   'mision',   7,  'celular',  3),
    (uid, 'Políglota',        'languages', 'mision',   10, 'ingles',   4),
    (uid, 'Mes imparable',    'trophy',    'racha',    30, null,       5);
$$;

revoke all on function public.seed_default_badges(uuid) from public, anon, authenticated;

create function public.seed_badges_for_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_default_badges(new.user_id);
  return new;
end;
$$;

create trigger settings_seed_badges
  after insert on public.settings
  for each row execute function public.seed_badges_for_new_user();

-- Quien ya usa la app recibe las seis una sola vez.
select public.seed_default_badges(user_id) from public.settings;

commit;
