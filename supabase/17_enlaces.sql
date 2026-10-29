-- Enlaces externos de Perfil (por ejemplo "Prep de entrevistas"): cada persona agrega y quita los suyos.
-- Ejecutar una vez en Supabase > SQL Editor, después de 16_compras_automaticas.sql.
-- Solo se aceptan direcciones http(s). Quita un enlace y se borra sin más: nada depende de él.

begin;

create table public.links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  url text not null check (char_length(url) <= 500 and url ~* '^https?://'),
  note text not null default '' check (char_length(note) <= 120),
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index links_user on public.links (user_id, position);

alter table public.links enable row level security;

create policy "mis enlaces" on public.links
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.links to authenticated;

-- Quien ya usa la app conserva el enlace que tenía fijo en Perfil.
insert into public.links (user_id, title, url, note, position)
select user_id, 'Prep de entrevistas', 'https://interview-prepjm.netlify.app/', 'Preguntas y respuestas para repasar', 0
from public.settings;

commit;
