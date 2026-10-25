do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can spend credits on their own profile'
  ) then
    create policy "Users can spend credits on their own profile"
      on public.profiles for update to authenticated
      using ((select auth.uid()) = id)
      with check ((select auth.uid()) = id);
  end if;
end
$$;

create or replace function public.enforce_profile_credit_debit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.credits is distinct from old.credits
    and coalesce(auth.role(), '') <> 'service_role'
    and new.credits <> old.credits - 5 then
    raise exception 'Credits can only be reduced in five-credit increments';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_profile_credit_debit on public.profiles;
create trigger enforce_profile_credit_debit
  before update of credits on public.profiles
  for each row execute procedure public.enforce_profile_credit_debit();
