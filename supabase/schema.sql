create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id text not null,
  home text not null,
  away text not null,
  kickoff timestamptz not null,
  market_type text not null default 'match_result',
  market_line numeric(6, 2),
  selection text not null,
  selection_label text not null,
  stake integer not null,
  odds numeric(8, 2) not null check (odds > 1),
  bookmaker text,
  odds_source text,
  placed_at timestamptz not null default now()
);

alter table public.bets add column if not exists market_type text not null default 'match_result';
alter table public.bets add column if not exists market_line numeric(6, 2);

alter table public.bets drop constraint if exists bets_selection_check;
alter table public.bets add constraint bets_selection_check check (selection in ('HOME', 'DRAW', 'AWAY', 'OVER', 'UNDER'));

alter table public.bets drop constraint if exists bets_market_type_check;
alter table public.bets add constraint bets_market_type_check check (market_type in ('match_result', 'totals'));

alter table public.bets drop constraint if exists bets_stake_check;
alter table public.bets add constraint bets_stake_check check (stake >= 10 and stake <= 200);

alter table public.bets drop constraint if exists bets_user_id_match_id_key;
drop index if exists public.bets_one_market_per_match_idx;
create unique index if not exists bets_one_market_per_match_idx on public.bets (user_id, match_id, market_type);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Player'
    )
  )
  on conflict (id) do update
  set
    email = excluded.email,
    display_name = coalesce(nullif(excluded.display_name, ''), public.profiles.display_name),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user();

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.bets to authenticated;

alter table public.profiles enable row level security;
alter table public.bets enable row level security;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Users can read their own bets" on public.bets;
create policy "Users can read their own bets"
on public.bets
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can place their own bets" on public.bets;
create policy "Users can place their own bets"
on public.bets
for insert
to authenticated
with check ((select auth.uid()) = user_id);
