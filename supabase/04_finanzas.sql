-- Módulo de finanzas: gastos del mes, cortes de tarjeta, dinero que me deben y dinero con familia.
-- Ejecutar una vez en Supabase > SQL Editor. Cada usuario solo ve y modifica sus propias filas.

-- Ingreso mensual (una fila por usuario)
create table public.fin_settings (
  user_id uuid primary key default auth.uid()
    references auth.users (id) on delete cascade,
  monthly_income numeric(12,2) not null default 0 check (monthly_income >= 0),
  updated_at timestamptz not null default now()
);

-- Tarjeta Santander, tarjeta BBVA y gastos fijos mensuales
--   installment: "a meses", por ejemplo "05/09" (vacío si es un pago único)
--   total:       monto total de la compra (vacío en gastos fijos)
--   amount:      lo que toca pagar este mes (en gastos fijos, el monto mensual)
create table public.fin_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  section text not null check (section in ('santander', 'bbva', 'fijos')),
  concept text not null check (char_length(concept) between 1 and 120),
  installment text not null default '' check (char_length(installment) <= 20),
  total numeric(12,2) check (total is null or total >= 0),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  created_at timestamptz not null default now()
);

-- Cortes de tarjeta: periodo, monto del corte y cuánto se ha pagado (lo pendiente se calcula)
create table public.fin_cuts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  card text not null check (card in ('santander', 'bbva')),
  period text not null check (char_length(period) between 1 and 60),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  paid numeric(12,2) not null default 0 check (paid >= 0),
  created_at timestamptz not null default now()
);

-- Dinero que me deben: cargos (lo que presté) y abonos (lo que me han pagado).
-- Un abono puede "aplicarse" a un cargo concreto; si se borra el cargo, se borran sus abonos.
create table public.fin_debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  person text not null check (char_length(person) between 1 and 60),
  kind text not null check (kind in ('cargo', 'abono')),
  concept text not null default '' check (char_length(concept) <= 200),
  amount numeric(12,2) not null check (amount > 0),
  date date,
  applies_to uuid,
  created_at timestamptz not null default now(),
  unique (user_id, id),
  check (kind = 'abono' or applies_to is null),
  -- La referencia incluye user_id: no se puede aplicar un abono a un cargo de otra cuenta.
  foreign key (user_id, applies_to) references public.fin_debts (user_id, id) on delete cascade
);

-- Dinero con familia: lo recibido (concepto) y lo dado (para quién)
create table public.fin_family (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  direction text not null check (direction in ('recibido', 'dado')),
  name text not null check (char_length(name) between 1 and 80),
  date date,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

alter table public.fin_settings enable row level security;
alter table public.fin_expenses enable row level security;
alter table public.fin_cuts enable row level security;
alter table public.fin_debts enable row level security;
alter table public.fin_family enable row level security;

create policy "mis finanzas" on public.fin_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "mis gastos" on public.fin_expenses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "mis cortes" on public.fin_cuts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "mis deudas" on public.fin_debts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "mi familia" on public.fin_family
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.fin_settings to authenticated;
grant select, insert, update, delete on public.fin_expenses to authenticated;
grant select, insert, update, delete on public.fin_cuts to authenticated;
grant select, insert, update, delete on public.fin_debts to authenticated;
grant select, insert, update, delete on public.fin_family to authenticated;
