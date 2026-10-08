create table if not exists public.subscription_appearance_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid not null
    references public.user_subscriptions(id) on delete cascade,
  avatar_color text not null
    check (avatar_color ~ '^#[0-9A-Fa-f]{6}$'),
  primary key (user_id, subscription_id)
);

alter table public.subscription_appearance_preferences enable row level security;

revoke all on public.subscription_appearance_preferences from anon, public;
grant select, insert, update, delete
  on public.subscription_appearance_preferences to authenticated;

drop policy if exists "Users manage their own subscription appearance"
  on public.subscription_appearance_preferences;

create policy "Users manage their own subscription appearance"
  on public.subscription_appearance_preferences
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
