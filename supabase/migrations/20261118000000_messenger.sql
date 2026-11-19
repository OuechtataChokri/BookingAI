-- =====================================================================
-- BookAI – Facebook Messenger migration (additive, safe on live DB)
-- =====================================================================

-- 1. Customers: allow Messenger PSID (phone becomes optional when PSID exists)
alter table public.customers alter column phone drop not null;
alter table public.customers add column if not exists messenger_psid text;

alter table public.customers drop constraint if exists customers_messenger_psid_format;
alter table public.customers add constraint customers_messenger_psid_format
  check (messenger_psid is null or messenger_psid ~ '^[0-9]{5,32}$');

alter table public.customers drop constraint if exists customers_contact_required;
alter table public.customers add constraint customers_contact_required
  check (phone is not null or messenger_psid is not null);

create unique index if not exists idx_customers_business_messenger
  on public.customers(business_id, messenger_psid)
  where messenger_psid is not null;

-- 2. Appointments: allow 'messenger' as booking source
alter table public.appointments drop constraint if exists appointments_source_check;
alter table public.appointments add constraint appointments_source_check
  check (source in ('dashboard', 'whatsapp', 'messenger'));

-- 3. Conversations: support Messenger PSIDs & channel tag
alter table public.conversations drop constraint if exists conversations_wa_contact_check;
alter table public.conversations add constraint conversations_wa_contact_check
  check (wa_contact ~ '^[0-9]{5,32}$');

alter table public.conversations add column if not exists channel text not null default 'messenger';
alter table public.conversations drop constraint if exists conversations_channel_check;
alter table public.conversations add constraint conversations_channel_check
  check (channel in ('whatsapp', 'messenger'));

-- 4. Messenger connections (stores Facebook Page ID + encrypted Page Access Token)
create table if not exists public.messenger_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  mode text not null default 'live' check (mode in ('live', 'mock')),
  status text not null default 'disconnected'
    check (status in ('connected', 'disconnected', 'error', 'mock')),
  page_id text unique check (page_id is null or page_id ~ '^[0-9]{5,32}$'),
  page_name text,
  access_token_encrypted text,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_messenger_connections_updated on public.messenger_connections;
create trigger trg_messenger_connections_updated before update on public.messenger_connections
  for each row execute function public.set_updated_at();

alter table public.messenger_connections enable row level security;

drop policy if exists messenger_connections_select on public.messenger_connections;
create policy messenger_connections_select on public.messenger_connections for select to authenticated
  using (public.is_member(business_id));

revoke all on public.messenger_connections from anon, authenticated;
grant select (id, business_id, mode, status, page_id, page_name, last_verified_at, last_error, created_at, updated_at)
  on public.messenger_connections to authenticated;

-- Backfill disconnected row for existing businesses
insert into public.messenger_connections (business_id, status, mode)
select id, 'disconnected', 'live' from public.businesses
on conflict (business_id) do nothing;

-- 5. Update create_business RPC so new businesses also get a messenger_connections row
create or replace function public.create_business(
  p_name text,
  p_business_type text,
  p_timezone text,
  p_currency text,
  p_phone text default null,
  p_default_language text default 'fr'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_slug text;
  d int;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if (select count(*) from public.memberships where user_id = v_user and role = 'owner') >= 5 then
    raise exception 'business_limit_reached';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'invalid_timezone';
  end if;

  v_slug := trim(both '-' from regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'));
  if char_length(v_slug) < 3 then v_slug := 'business'; end if;
  v_slug := left(v_slug, 50) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.businesses (name, slug, business_type, timezone, currency, phone, default_language, created_by)
  values (p_name, v_slug, p_business_type, p_timezone, upper(p_currency), nullif(p_phone, ''), p_default_language, v_user)
  returning id into v_id;

  insert into public.memberships (business_id, user_id, role) values (v_id, v_user, 'owner');

  for d in 0..6 loop
    insert into public.business_hours (business_id, day_of_week, is_closed, open_time, close_time)
    values (v_id, d, d = 0, '09:00', '19:00');
  end loop;

  insert into public.subscriptions (business_id) values (v_id);
  insert into public.whatsapp_connections (business_id, status, mode) values (v_id, 'disconnected', 'live');
  insert into public.messenger_connections (business_id, status, mode) values (v_id, 'disconnected', 'live');

  return v_id;
end;
$$;
