create or replace function public.refund_profile_credits(
  p_user_id uuid,
  p_amount integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_credits integer;
begin
  -- Refunds are intentionally limited to the generation cost and callable only
  -- by the trusted server role. The API calls this only after a successful debit.
  if p_amount <> 5 then
    raise exception 'Invalid credit refund amount';
  end if;

  update public.profiles
    set credits = credits + p_amount,
        updated_at = now()
    where id = p_user_id
    returning credits into remaining_credits;

  if not found then
    return null;
  end if;

  return remaining_credits;
end;
$$;

revoke all on function public.refund_profile_credits(uuid, integer) from public, anon, authenticated;
grant execute on function public.refund_profile_credits(uuid, integer) to service_role;
