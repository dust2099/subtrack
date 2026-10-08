-- Shared subscriptions use pending/active rows in subscription_members.
-- share_amount is the invited member's contribution; the owner pays the
-- remaining subscription cost. Resolve any duplicate member rows before
-- applying this script if the unique index creation fails.

create unique index if not exists subscription_members_subscription_user_uidx
  on public.subscription_members (subscription_id, user_id);

create or replace function public.owns_subscription(p_subscription_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_subscriptions s
    where s.id = p_subscription_id
      and s.owner_id = (select auth.uid())
  );
$$;

create or replace function public.is_active_subscription_member(
  p_subscription_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.subscription_members m
    where m.subscription_id = p_subscription_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

revoke all on function public.owns_subscription(uuid) from public, anon;
revoke all on function public.is_active_subscription_member(uuid) from public, anon;
grant execute on function public.owns_subscription(uuid) to authenticated;
grant execute on function public.is_active_subscription_member(uuid) to authenticated;

alter table public.user_subscriptions enable row level security;
alter table public.subscription_members enable row level security;

-- Replace previous recursive subscription policies with non-recursive policies.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('user_subscriptions', 'subscription_members')
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

create policy "Owners and active members can read subscriptions"
  on public.user_subscriptions
  for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or public.is_active_subscription_member(id)
  );

create policy "Owners can add subscriptions"
  on public.user_subscriptions
  for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "Owners can update subscriptions"
  on public.user_subscriptions
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "Owners can delete subscriptions"
  on public.user_subscriptions
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "Members and owners can read subscription members"
  on public.subscription_members
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or public.owns_subscription(subscription_id)
  );

revoke insert, update, delete on public.subscription_members
  from public, anon, authenticated;
grant select on public.subscription_members to authenticated;

create or replace function public.invite_subscription_member(
  p_subscription_id uuid,
  p_username text,
  p_share_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  target_user_id uuid;
  subscription_cost numeric;
  allocated_amount numeric;
  existing_status text;
  normalized_username text := lower(trim(both '@' from trim(p_username)));
begin
  if caller_id is null then
    raise exception 'Authentication is required.';
  end if;
  if normalized_username = '' or p_share_amount is null or p_share_amount <= 0 then
    raise exception 'Enter a username and a share amount greater than zero.';
  end if;

  select s.cost
    into subscription_cost
  from public.user_subscriptions s
  where s.id = p_subscription_id
    and s.owner_id = caller_id
  for update;
  if not found then
    raise exception 'Only the subscription owner can invite members.';
  end if;

  select p.id
    into target_user_id
  from public.profiles p
  where lower(p.username) = normalized_username;
  if target_user_id is null then
    raise exception 'No account was found for that username.';
  end if;
  if target_user_id = caller_id then
    raise exception 'You cannot invite yourself.';
  end if;

  select m.status
    into existing_status
  from public.subscription_members m
  where m.subscription_id = p_subscription_id
    and m.user_id = target_user_id;
  if existing_status in ('pending', 'active') then
    raise exception 'That user already has a pending invitation or active share.';
  end if;

  select coalesce(sum(m.share_amount), 0)
    into allocated_amount
  from public.subscription_members m
  where m.subscription_id = p_subscription_id
    and m.status in ('pending', 'active')
    and m.user_id <> target_user_id;
  if allocated_amount + p_share_amount > subscription_cost then
    raise exception 'Member shares cannot exceed the subscription cost.';
  end if;

  insert into public.subscription_members (
    subscription_id, user_id, share_amount, status
  )
  values (p_subscription_id, target_user_id, p_share_amount, 'pending')
  on conflict (subscription_id, user_id)
  do update set
    share_amount = excluded.share_amount,
    status = 'pending',
    created_at = now();
end;
$$;

create or replace function public.respond_to_subscription_invitation(
  p_subscription_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if p_accept is null then
    raise exception 'Choose whether to accept or decline the invitation.';
  end if;

  update public.subscription_members
  set status = case when p_accept then 'active' else 'declined' end
  where subscription_id = p_subscription_id
    and user_id = (select auth.uid())
    and status = 'pending';
  if not found then
    raise exception 'This invitation is no longer pending.';
  end if;
end;
$$;

create or replace function public.update_subscription_member_share(
  p_subscription_id uuid,
  p_user_id uuid,
  p_share_amount numeric
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  subscription_cost numeric;
  allocated_amount numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if p_share_amount is null or p_share_amount <= 0 then
    raise exception 'Enter a share amount greater than zero.';
  end if;

  select s.cost
    into subscription_cost
  from public.user_subscriptions s
  where s.id = p_subscription_id
    and s.owner_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Only the subscription owner can change member shares.';
  end if;

  perform 1
  from public.subscription_members m
  where m.subscription_id = p_subscription_id
    and m.user_id = p_user_id
    and m.status in ('pending', 'active');
  if not found then
    raise exception 'The member or invitation could not be found.';
  end if;

  select coalesce(sum(m.share_amount), 0)
    into allocated_amount
  from public.subscription_members m
  where m.subscription_id = p_subscription_id
    and m.status in ('pending', 'active')
    and m.user_id <> p_user_id;
  if allocated_amount + p_share_amount > subscription_cost then
    raise exception 'Member shares cannot exceed the subscription cost.';
  end if;

  update public.subscription_members
  set share_amount = p_share_amount
  where subscription_id = p_subscription_id
    and user_id = p_user_id;
end;
$$;

create or replace function public.update_subscription_with_member_shares(
  p_subscription_id uuid,
  p_name text,
  p_cost numeric,
  p_currency text,
  p_billing_cycle text,
  p_next_billing_date date,
  p_category text,
  p_member_ids uuid[],
  p_member_shares numeric[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_member_count integer;
  requested_member_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if p_name is null or length(trim(p_name)) = 0
    or p_category is null or length(trim(p_category)) = 0
    or p_cost is null or p_cost <= 0
    or p_currency is null or p_currency !~ '^[A-Z]{3}$'
    or p_billing_cycle is null
    or p_billing_cycle not in ('monthly', 'yearly', 'weekly')
    or p_next_billing_date is null then
    raise exception 'Subscription details are invalid.';
  end if;
  if p_member_ids is null or p_member_shares is null
    or cardinality(p_member_ids) <> cardinality(p_member_shares) then
    raise exception 'Member contributions are invalid.';
  end if;
  if exists (
    select 1
    from unnest(p_member_ids, p_member_shares) as requested(user_id, share_amount)
    where requested.user_id is null
      or requested.share_amount is null
      or requested.share_amount <= 0
  ) then
    raise exception 'Member contributions must be greater than zero.';
  end if;
  if coalesce((select sum(share_amount) from unnest(p_member_shares) as shares(share_amount)), 0) > p_cost then
    raise exception 'Member shares cannot exceed the subscription cost.';
  end if;

  perform 1
  from public.user_subscriptions s
  where s.id = p_subscription_id
    and s.owner_id = (select auth.uid())
  for update;
  if not found then
    raise exception 'Only the subscription owner can edit this subscription.';
  end if;

  select count(*) into existing_member_count
  from public.subscription_members m
  where m.subscription_id = p_subscription_id
    and m.status in ('pending', 'active');

  select count(*) into requested_member_count
  from (
    select distinct user_id
    from unnest(p_member_ids) as requested(user_id)
  ) requested_members;

  if requested_member_count <> cardinality(p_member_ids)
    or requested_member_count <> existing_member_count
    or exists (
      select 1
      from unnest(p_member_ids) as requested(user_id)
      left join public.subscription_members m
        on m.subscription_id = p_subscription_id
        and m.user_id = requested.user_id
        and m.status in ('pending', 'active')
      where m.user_id is null
    ) then
    raise exception 'The subscription member list changed. Reload and try again.';
  end if;

  update public.user_subscriptions
  set name = trim(p_name),
      cost = p_cost,
      currency = p_currency,
      billing_cycle = p_billing_cycle,
      next_billing_date = p_next_billing_date,
      category = trim(p_category)
  where id = p_subscription_id
    and owner_id = (select auth.uid());

  update public.subscription_members m
  set share_amount = requested.share_amount
  from unnest(p_member_ids, p_member_shares) as requested(user_id, share_amount)
  where m.subscription_id = p_subscription_id
    and m.user_id = requested.user_id
    and m.status in ('pending', 'active');
end;
$$;

create or replace function public.remove_subscription_member(
  p_subscription_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  subscription_owner_id uuid;
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    raise exception 'Authentication is required.';
  end if;

  select s.owner_id
    into subscription_owner_id
  from public.user_subscriptions s
  where s.id = p_subscription_id;
  if not found then
    raise exception 'Subscription not found.';
  end if;
  if caller_id <> subscription_owner_id and caller_id <> p_user_id then
    raise exception 'Only the owner can remove another member.';
  end if;
  if caller_id = subscription_owner_id and p_user_id = subscription_owner_id then
    raise exception 'The owner cannot remove themselves from the subscription.';
  end if;

  delete from public.subscription_members
  where subscription_id = p_subscription_id
    and user_id = p_user_id;
  if not found then
    raise exception 'Member or invitation not found.';
  end if;
end;
$$;

drop function if exists public.get_subscription_members(uuid);

create function public.get_subscription_members(
  p_subscription_id uuid
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  share_amount numeric,
  status text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.owns_subscription(p_subscription_id) then
    raise exception 'Only the subscription owner can view its member list.';
  end if;

  return query
  select
    m.user_id,
    p.username,
    coalesce(nullif(p.display_name, ''), p.username),
    p.avatar_url,
    m.share_amount,
    m.status
  from public.subscription_members m
  join public.profiles p on p.id = m.user_id
  where m.subscription_id = p_subscription_id
  order by m.created_at, p.username;
end;
$$;

create or replace function public.get_my_subscription_invitations()
returns table (
  subscription_id uuid,
  subscription_name text,
  share_amount numeric,
  currency text,
  billing_cycle text,
  next_billing_date date,
  owner_username text,
  owner_display_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    s.id,
    s.name,
    m.share_amount,
    s.currency,
    s.billing_cycle,
    s.next_billing_date,
    owner_profile.username,
    coalesce(nullif(owner_profile.display_name, ''), owner_profile.username)
  from public.subscription_members m
  join public.user_subscriptions s on s.id = m.subscription_id
  join public.profiles owner_profile on owner_profile.id = s.owner_id
  where m.user_id = (select auth.uid())
    and m.status = 'pending'
  order by m.created_at;
$$;

revoke all on function public.invite_subscription_member(uuid, text, numeric)
  from public, anon;
revoke all on function public.respond_to_subscription_invitation(uuid, boolean)
  from public, anon;
revoke all on function public.update_subscription_member_share(uuid, uuid, numeric)
  from public, anon;
revoke all on function public.update_subscription_with_member_shares(
  uuid, text, numeric, text, text, date, text, uuid[], numeric[]
) from public, anon;
revoke all on function public.remove_subscription_member(uuid, uuid)
  from public, anon;
revoke all on function public.get_subscription_members(uuid)
  from public, anon;
revoke all on function public.get_my_subscription_invitations()
  from public, anon;

grant execute on function public.invite_subscription_member(uuid, text, numeric)
  to authenticated;
grant execute on function public.respond_to_subscription_invitation(uuid, boolean)
  to authenticated;
grant execute on function public.update_subscription_member_share(uuid, uuid, numeric)
  to authenticated;
grant execute on function public.update_subscription_with_member_shares(
  uuid, text, numeric, text, text, date, text, uuid[], numeric[]
) to authenticated;
grant execute on function public.remove_subscription_member(uuid, uuid)
  to authenticated;
grant execute on function public.get_subscription_members(uuid)
  to authenticated;
grant execute on function public.get_my_subscription_invitations()
  to authenticated;
