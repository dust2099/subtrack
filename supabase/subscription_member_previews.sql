create or replace function public.get_subscription_member_previews(
  p_subscription_ids uuid[]
)
returns table (
  subscription_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, p.id, p.username,
    coalesce(nullif(p.display_name, ''), p.username), p.avatar_url
  from public.user_subscriptions s
  join public.subscription_members m
    on m.subscription_id = s.id and m.status = 'active'
  join public.profiles p on p.id = m.user_id
  where s.id = any(coalesce(p_subscription_ids, '{}'::uuid[]))
    and p.id <> (select auth.uid())
    and (
      s.owner_id = (select auth.uid())
      or public.is_active_subscription_member(s.id)
    )
  order by s.id, p.username
  limit 500;
$$;

revoke all on function public.get_subscription_member_previews(uuid[])
  from public, anon;
grant execute on function public.get_subscription_member_previews(uuid[])
  to authenticated;
