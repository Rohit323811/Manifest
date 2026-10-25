create table if not exists public.credit_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  reference_id text not null,
  payment_link_id text not null unique,
  payment_id text unique,
  short_url text not null,
  amount integer not null,
  currency text not null,
  status text not null default 'created' check (status in ('created', 'paid')),
  credits_granted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists credit_payments_one_open_link_per_user
  on public.credit_payments (user_id)
  where status = 'created';

alter table public.credit_payments enable row level security;
revoke all on table public.credit_payments from anon, authenticated;
grant all on table public.credit_payments to service_role;

create or replace function public.apply_razorpay_credit_payment(
  p_payment_link_id text,
  p_payment_id text,
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_user_id uuid;
  stored_payment_id text;
  already_granted boolean;
  remaining_credits integer;
begin
  select user_id, payment_id, credits_granted
    into payment_user_id, stored_payment_id, already_granted
    from public.credit_payments
    where payment_link_id = p_payment_link_id
    for update;

  if not found or payment_user_id <> p_user_id then
    return null;
  end if;

  if already_granted then
    if stored_payment_id <> p_payment_id then
      return null;
    end if;
    select credits into remaining_credits
      from public.profiles
      where id = p_user_id;
    return remaining_credits;
  end if;

  update public.profiles
    set credits = credits + 25,
        updated_at = now()
    where id = p_user_id
    returning credits into remaining_credits;

  if not found then
    return null;
  end if;

  update public.credit_payments
    set payment_id = p_payment_id,
        status = 'paid',
        credits_granted = true,
        updated_at = now()
    where payment_link_id = p_payment_link_id;

  return remaining_credits;
end;
$$;

revoke all on function public.apply_razorpay_credit_payment(text, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_razorpay_credit_payment(text, text, uuid) to service_role;
