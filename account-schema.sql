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

-- Names are compared without case or outer spaces so Viewer and viewer cannot both register
create unique index viewer_profiles_unique_name
on public.viewer_profiles (lower(btrim(display_name)));

-- Older accounts may not have opened Me yet but their chosen name still needs reserving
insert into public.viewer_profiles (user_id, display_name)
select u.id, coalesce(nullif(left(btrim(u.raw_user_meta_data->>'display_name'), 30), ''), 'Viewer')
from auth.users u
where not exists (select 1 from public.viewer_profiles p where p.user_id = u.id);

-- A browser check is helpful but this insert is what stops simultaneous signups claiming 1 name
create function public.reserve_viewer_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.viewer_profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(left(btrim(new.raw_user_meta_data->>'display_name'), 30), ''), 'Viewer')
  );
  return new;
end;
$$;

revoke all on function public.reserve_viewer_name() from public, anon, authenticated;

create trigger reserve_viewer_name_on_signup
after insert on auth.users
for each row execute function public.reserve_viewer_name();

-- Return only availability so checking a name never exposes account details or preferences
create function public.username_available(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select char_length(btrim(p_name)) between 1 and 30
    and not exists (
      select 1 from public.viewer_profiles
      where lower(btrim(display_name)) = lower(btrim(p_name))
    );
$$;

revoke all on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

