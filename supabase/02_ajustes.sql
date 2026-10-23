-- Ajustes por usuario y lista de misiones. Ejecutar una vez en Supabase > SQL Editor.

create table public.settings (
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  goal int not null default 6 check (goal between 1 and 50),
  freeze_min int not null default 15 check (freeze_min between 1 and 365),
  -- días obligatorios: 0 = domingo ... 6 = sábado
  active_days int[] not null default '{1,2,3,4,5}'
    check (cardinality(active_days) >= 1 and active_days <@ array[0,1,2,3,4,5,6]),
  updated_at timestamptz not null default now()
);

create table public.habits (
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 40),
  name text not null check (char_length(name) between 1 and 80),
  when_text text not null default '' check (char_length(when_text) <= 80),
  position int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.settings enable row level security;
alter table public.habits enable row level security;

create policy "mis ajustes" on public.settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "mis misiones" on public.habits
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.settings to authenticated;
grant select, insert, update, delete on public.habits to authenticated;
