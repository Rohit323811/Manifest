create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  credits integer not null default 5,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists credits integer not null default 5;

alter table public.profiles
  add column if not exists created_at timestamptz not null default now();

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_credits_nonnegative'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_credits_nonnegative check (credits >= 0);
  end if;
end
$$;

alter table public.profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can read their own profile'
  ) then
    create policy "Users can read their own profile"
      on public.profiles for select to authenticated
      using ((select auth.uid()) = id);
  end if;
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

create or replace function public.deduct_profile_credits(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_credits integer;
begin
  if p_amount <= 0 then
    raise exception 'Credit amount must be positive';
  end if;

  update public.profiles
  set credits = credits - p_amount,
      updated_at = now()
  where id = p_user_id
    and credits >= p_amount
  returning credits into remaining_credits;

  return remaining_credits;
end;
$$;

revoke all on function public.deduct_profile_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.deduct_profile_credits(uuid, integer) to service_role;
