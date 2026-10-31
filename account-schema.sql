-- Keep the profile tied to the account so deleting the account removes it too
create table public.viewer_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Bound the name here too since requests do not have to come from our form
  display_name text not null default 'Viewer' check (char_length(display_name) between 1 and 30),

  -- New accounts start empty rather than silently inheriting a shared device's history
  preferences jsonb not null default '{"likes":[],"following":[],"scores":{},"seen":[]}'::jsonb,

  -- Use this to catch saves from another tab or device
  revision integer not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),

  -- Put the size limit here too since browser checks can be bypassed
  constraint bounded_preferences check (
    octet_length(preferences::text) <= 131072
    and jsonb_typeof(preferences) = 'object'
    and jsonb_typeof(preferences->'likes') = 'array'
    and jsonb_typeof(preferences->'following') = 'array'
    and jsonb_typeof(preferences->'seen') = 'array'
    and jsonb_typeof(preferences->'scores') = 'object'
    and preferences ?& array['likes','following','scores','seen']
  )
);

-- No guest access and signed-in accounts only get their own row
alter table public.viewer_profiles enable row level security;
revoke all on public.viewer_profiles from anon, authenticated;

-- No delete grant since account deletion owns the profile lifecycle
grant select, insert, update on public.viewer_profiles to authenticated;

-- The browser key alone should not grant access to another account's preferences
create policy "read own profile" on public.viewer_profiles for select to authenticated
  using ((select auth.uid()) = user_id);

-- Clients may create their own row but cannot choose another account as its owner
create policy "create own profile" on public.viewer_profiles for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- Check ownership before and after updates so user_id cannot be reassigned
create policy "update own profile" on public.viewer_profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
