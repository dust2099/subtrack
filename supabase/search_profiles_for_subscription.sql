drop function if exists public.search_profiles_for_subscription(text);

create function public.search_profiles_for_subscription(
  p_query text
)
returns table (
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
  select
    p.id,
    p.username,
    coalesce(nullif(p.display_name, ''), p.username),
    p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and p.id <> (select auth.uid())
    and char_length(trim(coalesce(p_query, ''))) between 2 and 50
    and (
      position(lower(trim(p_query)) in lower(p.username)) > 0
      or position(
        lower(trim(p_query)) in lower(coalesce(p.display_name, ''))
      ) > 0
    )
  order by
    lower(coalesce(nullif(p.display_name, ''), p.username)),
    lower(p.username)
  limit 20;
$$;

revoke all on function public.search_profiles_for_subscription(text)
  from public, anon;
grant execute on function public.search_profiles_for_subscription(text)
  to authenticated;
