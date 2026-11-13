-- =====================================================================
-- Green Pledge Wall (Zayed University – Environmental Science &
-- Sustainability) – database setup for Supabase
--
-- Run this once in: Supabase Dashboard -> SQL Editor -> New query.
-- It creates NEW tables only. The existing "leads" table is not touched.
--
-- Creates:
--   pledges          what the wall shows (first name + message), public read
--   zayed_uni_leads  contact details, private (admins only)
--   admins           staff accounts allowed to moderate
--   settings         one row: pledging_open on/off
--   submit_pledge()  the ONLY way the public key can add a pledge + lead
--   is_admin()       helper used by the security rules and the admin page
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. pledges: what appears on the wall (no contact details here)
-- ---------------------------------------------------------------------
create table if not exists public.pledges (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  display_name  text not null check (char_length(display_name) between 1 and 20),
  preset_id     text check (preset_id ~ '^[a-z0-9-]{1,30}$'),
  custom_text   text check (char_length(custom_text) between 1 and 90),
  topic         text not null,
  leaf_color    text not null check (leaf_color ~ '^#[0-9a-fA-F]{6}$'),
  source        text not null check (source in ('kiosk','qr')),
  lang          text not null check (lang in ('en','ar')),
  -- exactly one of preset_id / custom_text
  constraint pledges_preset_or_custom check (
    (preset_id is not null and custom_text is null) or
    (preset_id is null and custom_text is not null)
  )
);

create index if not exists pledges_created_at_idx on public.pledges (created_at desc);

-- Custom pledges use topic 'custom' with a leaf colour the student picks;
-- presets always use a real topic. (Written as drop/add so this also
-- updates a database where an earlier version of this script was run.)
alter table public.pledges drop constraint if exists pledges_topic_check;
alter table public.pledges add constraint pledges_topic_check
  check (topic in ('water','waste','coasts','environment','farming','science','custom'));

alter table public.pledges drop constraint if exists pledges_custom_topic;
alter table public.pledges add constraint pledges_custom_topic
  check ((custom_text is not null) = (topic = 'custom'));

-- ---------------------------------------------------------------------
-- 2. zayed_uni_leads: private contact details (all mandatory)
-- ---------------------------------------------------------------------
create table if not exists public.zayed_uni_leads (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  full_name       text not null check (char_length(full_name) between 2 and 80),
  phone           text not null check (phone ~ '^\+?[0-9 ()-]{7,20}$'),
  email           text not null check (char_length(email) <= 120 and email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  interest_topic  text not null check (interest_topic in ('water','waste','coasts','environment','farming')),
  pledge_id       uuid references public.pledges(id) on delete set null,
  source          text not null check (source in ('kiosk','qr')),
  lang            text not null check (lang in ('en','ar')),
  consent_text    text not null check (char_length(consent_text) between 10 and 300),
  consent_at      timestamptz not null default now(),
  client_ref      uuid not null unique   -- id made on the device; stops duplicate leads on retry
);

create index if not exists zayed_uni_leads_created_at_idx on public.zayed_uni_leads (created_at desc);

-- ---------------------------------------------------------------------
-- 3. admins: Supabase Auth users allowed to moderate
-- ---------------------------------------------------------------------
create table if not exists public.admins (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  added_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. settings: a single row with the pause switch
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id             int primary key default 1 check (id = 1),
  pledging_open  boolean not null default true,
  updated_at     timestamptz not null default now()
);

insert into public.settings (id, pledging_open) values (1, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 5. is_admin(): true when the logged-in user is in admins
--    (security definer so policies can check admins without recursion)
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. submit_pledge(): the only public way in.
--    Checks the pause switch, honeypot and fields, then saves the
--    pledge and the lead together. A retry with the same client_ref
--    returns the original pledge id instead of creating a duplicate.
-- ---------------------------------------------------------------------
create or replace function public.submit_pledge(
  p_client_ref      uuid,
  p_full_name       text,
  p_phone           text,
  p_email           text,
  p_interest_topic  text,
  p_preset_id       text,
  p_custom_text     text,
  p_topic           text,
  p_leaf_color      text,
  p_source          text,
  p_lang            text,
  p_consent_text    text,
  p_website         text default null   -- honeypot: real users leave it empty
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing   uuid;
  v_pledge_id  uuid;
  v_first      text;
begin
  -- honeypot filled -> bot; pretend success, save nothing
  if coalesce(trim(p_website), '') <> '' then
    return gen_random_uuid();
  end if;

  -- pause switch
  if not (select pledging_open from public.settings where id = 1) then
    raise exception 'PLEDGING_PAUSED' using errcode = 'P0001';
  end if;

  if p_client_ref is null then
    raise exception 'MISSING_CLIENT_REF' using errcode = 'P0001';
  end if;

  -- retry of a pledge that was already saved
  select pledge_id into v_existing
  from public.zayed_uni_leads where client_ref = p_client_ref;
  if found then
    return v_existing;
  end if;

  -- first name only for the wall
  v_first := left(split_part(regexp_replace(trim(p_full_name), '\s+', ' ', 'g'), ' ', 1), 20);

  insert into public.pledges (display_name, preset_id, custom_text, topic, leaf_color, source, lang)
  values (
    v_first,
    nullif(trim(p_preset_id), ''),
    nullif(regexp_replace(trim(p_custom_text), '\s+', ' ', 'g'), ''),
    p_topic, p_leaf_color, p_source, p_lang
  )
  returning id into v_pledge_id;

  insert into public.zayed_uni_leads
    (full_name, phone, email, interest_topic, pledge_id, source, lang, consent_text, client_ref)
  values (
    regexp_replace(trim(p_full_name), '\s+', ' ', 'g'),
    trim(p_phone),
    lower(trim(p_email)),
    p_interest_topic, v_pledge_id, p_source, p_lang, p_consent_text, p_client_ref
  );

  return v_pledge_id;

exception
  -- two retries arriving at the same moment: the second one hits the
  -- unique client_ref; its own inserts are rolled back, return the first
  when unique_violation then
    select pledge_id into v_existing
    from public.zayed_uni_leads where client_ref = p_client_ref;
    return v_existing;
end;
$$;

revoke all on function public.submit_pledge(uuid,text,text,text,text,text,text,text,text,text,text,text,text) from public;
grant execute on function public.submit_pledge(uuid,text,text,text,text,text,text,text,text,text,text,text,text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Row-level security (who can do what)
-- ---------------------------------------------------------------------
alter table public.pledges          enable row level security;
alter table public.zayed_uni_leads  enable row level security;
alter table public.admins           enable row level security;
alter table public.settings         enable row level security;

-- Direct table writes from the public key are removed entirely;
-- pledges and leads can only be added through submit_pledge().
revoke all on public.pledges, public.zayed_uni_leads, public.admins, public.settings from anon;
revoke insert, update, truncate on public.pledges from authenticated;
revoke insert, update, delete, truncate on public.zayed_uni_leads from authenticated;
revoke insert, update, delete, truncate on public.admins from authenticated;
revoke insert, delete, truncate on public.settings from authenticated;

grant select on public.pledges  to anon, authenticated;
grant delete on public.pledges  to authenticated;
grant select on public.zayed_uni_leads to authenticated;
grant select on public.admins   to authenticated;
grant select on public.settings to anon, authenticated;
grant update (pledging_open, updated_at) on public.settings to authenticated;

-- pledges: everyone can read; only admins can delete
drop policy if exists pledges_read on public.pledges;
create policy pledges_read on public.pledges
  for select to anon, authenticated using (true);

drop policy if exists pledges_admin_delete on public.pledges;
create policy pledges_admin_delete on public.pledges
  for delete to authenticated using (public.is_admin());

-- zayed_uni_leads: only admins can read (for CSV export); nobody writes directly
drop policy if exists leads_admin_read on public.zayed_uni_leads;
create policy leads_admin_read on public.zayed_uni_leads
  for select to authenticated using (public.is_admin());

-- admins: a logged-in user can see only their own row
drop policy if exists admins_self_read on public.admins;
create policy admins_self_read on public.admins
  for select to authenticated using (user_id = auth.uid());

-- settings: everyone can read; only admins can change
drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings
  for select to anon, authenticated using (true);

drop policy if exists settings_admin_update on public.settings;
create policy settings_admin_update on public.settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 8. Realtime: the wall and admin page hear inserts and deletes
-- ---------------------------------------------------------------------
alter table public.pledges replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pledges'
  ) then
    alter publication supabase_realtime add table public.pledges;
  end if;
  -- admin pages hear the pause switch change when another staff member flips it
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'settings'
  ) then
    alter publication supabase_realtime add table public.settings;
  end if;
end $$;

commit;

-- =====================================================================
-- AFTER RUNNING: add each staff member as an admin
--   1. Dashboard -> Authentication -> Users -> Add user (email + password)
--   2. Copy their User UID, then run:
--        insert into public.admins (user_id) values ('PASTE-USER-UID-HERE');
-- =====================================================================
