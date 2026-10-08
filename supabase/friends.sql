create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friend_requests_distinct_users
    check (requester_id <> recipient_id)
);

create unique index if not exists friend_requests_one_pair_uidx
  on public.friend_requests (
    least(requester_id, recipient_id),
    greatest(requester_id, recipient_id)
  );

create index if not exists friend_requests_requester_status_idx
  on public.friend_requests (requester_id, status);
create index if not exists friend_requests_recipient_status_idx
  on public.friend_requests (recipient_id, status);

alter table public.friend_requests enable row level security;
revoke all on public.friend_requests from public, anon, authenticated;

drop function if exists public.get_my_friend_connections();

create function public.get_my_friend_connections()
returns table (
  request_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  relationship_state text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    f.id,
    other_profile.id,
    other_profile.username,
    coalesce(nullif(other_profile.display_name, ''), other_profile.username),
    other_profile.avatar_url,
    case
      when f.status = 'accepted' then 'friend'
      when f.requester_id = (select auth.uid()) then 'outgoing'
      else 'incoming'
    end
  from public.friend_requests f
  join public.profiles other_profile
    on other_profile.id = case
      when f.requester_id = (select auth.uid()) then f.recipient_id
      else f.requester_id
    end
  where (f.requester_id = (select auth.uid())
      or f.recipient_id = (select auth.uid()))
    and f.status in ('accepted', 'pending')
  order by f.created_at desc;
$$;

create or replace function public.send_friend_request(p_username text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := (select auth.uid());
  target_user_id uuid;
  existing_status text;
  existing_requester_id uuid;
  normalized_username text := lower(trim(both '@' from trim(p_username)));
begin
  if caller_id is null then
    raise exception 'Authentication is required.';
  end if;
  if normalized_username = '' then
    raise exception 'Enter a username.';
  end if;

  select p.id
    into target_user_id
  from public.profiles p
  where lower(p.username) = normalized_username;
  if target_user_id is null then
    raise exception 'No account was found for that username.';
  end if;
  if target_user_id = caller_id then
    raise exception 'You cannot send a friend request to yourself.';
  end if;

  select f.status, f.requester_id
    into existing_status, existing_requester_id
  from public.friend_requests f
  where least(f.requester_id, f.recipient_id)
      = least(caller_id, target_user_id)
    and greatest(f.requester_id, f.recipient_id)
      = greatest(caller_id, target_user_id);
  if existing_status = 'accepted' then
    raise exception 'You are already friends with that user.';
  end if;
  if existing_status = 'pending' and existing_requester_id = caller_id then
    raise exception 'A friend request is already pending.';
  end if;
  if existing_status = 'pending' then
    raise exception 'That user has already sent you a friend request. Accept it from your friends page.';
  end if;

  insert into public.friend_requests (requester_id, recipient_id)
  values (caller_id, target_user_id);
end;
$$;

create or replace function public.respond_to_friend_request(
  p_request_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.';
  end if;
  if p_accept is null then
    raise exception 'Choose whether to accept or decline the friend request.';
  end if;

  if p_accept then
    update public.friend_requests
    set status = 'accepted', responded_at = now()
    where id = p_request_id
      and recipient_id = (select auth.uid())
      and status = 'pending';
    if not found then
      raise exception 'This friend request is no longer pending.';
    end if;
  else
    delete from public.friend_requests
    where id = p_request_id
      and recipient_id = (select auth.uid())
      and status = 'pending';
    if not found then
      raise exception 'This friend request is no longer pending.';
    end if;
  end if;
end;
$$;

create or replace function public.cancel_friend_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.';
  end if;

  delete from public.friend_requests
  where id = p_request_id
    and requester_id = (select auth.uid())
    and status = 'pending';
  if not found then
    raise exception 'This friend request can no longer be cancelled.';
  end if;
end;
$$;

create or replace function public.remove_friend(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication is required.';
  end if;

  delete from public.friend_requests
  where status = 'accepted'
    and (
      (requester_id = (select auth.uid()) and recipient_id = p_user_id)
      or (recipient_id = (select auth.uid()) and requester_id = p_user_id)
    );
  if not found then
    raise exception 'That friend connection was not found.';
  end if;
end;
$$;

revoke all on function public.get_my_friend_connections()
  from public, anon;
revoke all on function public.send_friend_request(text)
  from public, anon;
revoke all on function public.respond_to_friend_request(uuid, boolean)
  from public, anon;
revoke all on function public.cancel_friend_request(uuid)
  from public, anon;
revoke all on function public.remove_friend(uuid)
  from public, anon;

grant execute on function public.get_my_friend_connections()
  to authenticated;
grant execute on function public.send_friend_request(text)
  to authenticated;
grant execute on function public.respond_to_friend_request(uuid, boolean)
  to authenticated;
grant execute on function public.cancel_friend_request(uuid)
  to authenticated;
grant execute on function public.remove_friend(uuid)
  to authenticated;
