-- =====================================================================
-- BookAI – initial schema
-- Multi-tenant: every tenant table has business_id + RLS.
-- All timestamps are timestamptz (stored in UTC).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,64}$'),
  business_type text not null default 'barbershop'
    check (business_type in ('barbershop','beauty_salon','spa','clinic','other')),
  phone text check (phone is null or char_length(phone) <= 32),
  email text check (email is null or char_length(email) <= 254),
  address text check (address is null or char_length(address) <= 300),
  timezone text not null default 'Africa/Tunis',
  currency text not null default 'TND' check (currency ~ '^[A-Z]{3}$'),
  default_language text not null default 'fr' check (default_language in ('ar-TN','ar','fr','en')),
  slot_interval_minutes int not null default 15 check (slot_interval_minutes between 5 and 120),
  booking_lead_minutes int not null default 60 check (booking_lead_minutes between 0 and 10080),
  booking_horizon_days int not null default 30 check (booking_horizon_days between 1 and 365),
  ai_enabled boolean not null default true,
  ai_instructions text check (ai_instructions is null or char_length(ai_instructions) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_businesses_updated before update on public.businesses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- memberships (user <-> business)
-- ---------------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner','admin','staff')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, user_id)
);
create index idx_memberships_user on public.memberships(user_id);
create trigger trg_memberships_updated before update on public.memberships
  for each row execute function public.set_updated_at();

-- Membership helpers (SECURITY DEFINER so RLS policies can call them
-- without recursive policy evaluation).
create or replace function public.is_member(p_business_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_role(p_business_id uuid, p_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.business_id = p_business_id
      and m.user_id = auth.uid()
      and m.role = any(p_roles)
  );
$$;

-- ---------------------------------------------------------------------
-- invitations
-- ---------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  email text not null check (char_length(email) <= 254),
  role text not null default 'staff' check (role in ('admin','staff')),
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_invitations_business on public.invitations(business_id);
create trigger trg_invitations_updated before update on public.invitations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 1000),
  duration_minutes int not null check (duration_minutes between 5 and 480),
  price_cents int not null default 0 check (price_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);
create index idx_services_business on public.services(business_id);
create trigger trg_services_updated before update on public.services
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 32),
  title text check (title is null or char_length(title) <= 80),
  is_active boolean not null default true,
  -- 0 = Sunday ... 6 = Saturday
  working_days smallint[] not null default '{1,2,3,4,5,6}',
  -- null = follows business hours
  work_start time,
  work_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  check (working_days <@ array[0,1,2,3,4,5,6]::smallint[]),
  check ((work_start is null and work_end is null) or (work_start is not null and work_end is not null and work_end > work_start))
);
create index idx_staff_business on public.staff(business_id);
create trigger trg_staff_updated before update on public.staff
  for each row execute function public.set_updated_at();

-- Which staff member performs which service.
-- A staff member with no rows here can perform every service.
create table public.staff_services (
  business_id uuid not null references public.businesses(id) on delete cascade,
  staff_id uuid not null,
  service_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (staff_id, service_id),
  foreign key (staff_id, business_id) references public.staff(id, business_id) on delete cascade,
  foreign key (service_id, business_id) references public.services(id, business_id) on delete cascade
);
create index idx_staff_services_business on public.staff_services(business_id);

-- ---------------------------------------------------------------------
-- business_hours (local time of the business timezone)
-- ---------------------------------------------------------------------
create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  is_closed boolean not null default false,
  open_time time not null default '09:00',
  close_time time not null default '19:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, day_of_week),
  check (is_closed or close_time > open_time)
);
create trigger trg_business_hours_updated before update on public.business_hours
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text check (name is null or char_length(name) <= 120),
  -- digits only, international format without "+" (WhatsApp wa_id format)
  phone text not null check (phone ~ '^[0-9]{6,20}$'),
  email text check (email is null or char_length(email) <= 254),
  notes text check (notes is null or char_length(notes) <= 2000),
  language text check (language is null or language in ('ar-TN','ar','fr','en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, phone),
  unique (id, business_id)
);
create trigger trg_customers_updated before update on public.customers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- appointments
-- ---------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  service_id uuid not null,
  staff_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('pending','confirmed','completed','cancelled','no_show')),
  price_cents int not null default 0 check (price_cents >= 0),
  source text not null default 'dashboard' check (source in ('dashboard','whatsapp')),
  notes text check (notes is null or char_length(notes) <= 1000),
  cancelled_at timestamptz,
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (customer_id, business_id) references public.customers(id, business_id) on delete cascade,
  foreign key (service_id, business_id) references public.services(id, business_id) on delete restrict,
  foreign key (staff_id, business_id) references public.staff(id, business_id) on delete restrict,
  -- The database itself guarantees no double-booking of a staff member,
  -- even under simultaneous requests.
  constraint appointments_no_overlap exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending','confirmed'))
);
create index idx_appointments_business_start on public.appointments(business_id, starts_at);
create index idx_appointments_customer on public.appointments(customer_id);
create index idx_appointments_staff_start on public.appointments(staff_id, starts_at);
create trigger trg_appointments_updated before update on public.appointments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- conversations & messages
-- ---------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null,
  wa_contact text not null check (wa_contact ~ '^[0-9]{6,20}$'),
  status text not null default 'ai' check (status in ('ai','human','closed')),
  needs_human boolean not null default false,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, wa_contact),
  unique (id, business_id),
  foreign key (customer_id, business_id) references public.customers(id, business_id) on delete cascade
);
create index idx_conversations_business_last on public.conversations(business_id, last_message_at desc);
create trigger trg_conversations_updated before update on public.conversations
  for each row execute function public.set_updated_at();

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid not null,
  direction text not null check (direction in ('inbound','outbound')),
  sender text not null check (sender in ('customer','ai','staff','system')),
  body text not null check (char_length(body) <= 4096),
  -- WhatsApp message id: unique => idempotent webhook processing
  wa_message_id text unique,
  status text not null default 'received'
    check (status in ('received','queued','sent','delivered','read','failed','mock')),
  error text,
  ai_model text,
  ai_input_tokens int,
  ai_output_tokens int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (conversation_id, business_id) references public.conversations(id, business_id) on delete cascade
);
create index idx_messages_conversation on public.messages(conversation_id, created_at);
create index idx_messages_business_created on public.messages(business_id, created_at);
create trigger trg_messages_updated before update on public.messages
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- whatsapp_connections
-- ---------------------------------------------------------------------
create table public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  mode text not null default 'live' check (mode in ('live','mock')),
  status text not null default 'disconnected'
    check (status in ('connected','disconnected','error','mock')),
  phone_number_id text unique check (phone_number_id is null or phone_number_id ~ '^[0-9]{5,32}$'),
  waba_id text check (waba_id is null or waba_id ~ '^[0-9]{5,32}$'),
  display_phone_number text,
  verified_name text,
  -- AES-256-GCM encrypted token. Never readable by browser roles (see grants).
  access_token_encrypted text,
  last_verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_whatsapp_connections_updated before update on public.whatsapp_connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- subscriptions
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id) on delete cascade,
  plan text not null default 'trial' check (plan in ('trial','starter','pro','business')),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','canceled')),
  trial_ends_at timestamptz default now() + interval '14 days',
  current_period_end timestamptz,
  provider text,
  provider_customer_id text,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger trg_subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- rate limiting (server-only, shared across serverless instances)
-- ---------------------------------------------------------------------
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 0
);

create or replace function public.check_rate_limit(p_key text, p_limit int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.businesses enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.services enable row level security;
alter table public.staff enable row level security;
alter table public.staff_services enable row level security;
alter table public.business_hours enable row level security;
alter table public.customers enable row level security;
alter table public.appointments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.whatsapp_connections enable row level security;
alter table public.subscriptions enable row level security;
alter table public.rate_limits enable row level security; -- no policies => only service role

-- businesses: members read; owner/admin update; creation via create_business(); owner deletes.
create policy businesses_select on public.businesses for select to authenticated
  using (public.is_member(id));
create policy businesses_update on public.businesses for update to authenticated
  using (public.has_role(id, array['owner','admin'])) with check (public.has_role(id, array['owner','admin']));
create policy businesses_delete on public.businesses for delete to authenticated
  using (public.has_role(id, array['owner']));

-- memberships: members see their team; owner/admin manage (owner rows protected below).
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_member(business_id));
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_role(business_id, array['owner']) ) with check (public.has_role(business_id, array['owner']) and role <> 'owner');
create policy memberships_delete on public.memberships for delete to authenticated
  using (public.has_role(business_id, array['owner','admin']) and role <> 'owner');

-- invitations: owner/admin only
create policy invitations_all on public.invitations for all to authenticated
  using (public.has_role(business_id, array['owner','admin']))
  with check (public.has_role(business_id, array['owner','admin']));

-- Generic tenant tables: any member can read & write rows of their business.
create policy services_all on public.services for all to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy staff_all on public.staff for all to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy staff_services_all on public.staff_services for all to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy business_hours_all on public.business_hours for all to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy customers_all on public.customers for all to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy appointments_all on public.appointments for all to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy conversations_all on public.conversations for all to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy messages_select on public.messages for select to authenticated
  using (public.is_member(business_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (public.is_member(business_id));

-- whatsapp_connections & subscriptions: members read (writes only by the server with service role)
create policy whatsapp_connections_select on public.whatsapp_connections for select to authenticated
  using (public.is_member(business_id));
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_member(business_id));

-- Column-level protection: browser roles can never read the encrypted token.
revoke all on public.whatsapp_connections from anon, authenticated;
grant select (id, business_id, mode, status, phone_number_id, waba_id, display_phone_number,
              verified_name, last_verified_at, last_error, created_at, updated_at)
  on public.whatsapp_connections to authenticated;

revoke all on public.rate_limits from anon, authenticated;
revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

-- anon role gets nothing on tenant tables
revoke all on public.businesses, public.memberships, public.invitations, public.services, public.staff,
  public.staff_services, public.business_hours, public.customers, public.appointments,
  public.conversations, public.messages, public.subscriptions from anon;

-- =====================================================================
-- RPC: create_business (onboarding)
-- =====================================================================
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

  -- default hours: Mon–Sat 09:00–19:00, Sunday closed
  for d in 0..6 loop
    insert into public.business_hours (business_id, day_of_week, is_closed, open_time, close_time)
    values (v_id, d, d = 0, '09:00', '19:00');
  end loop;

  insert into public.subscriptions (business_id) values (v_id);
  insert into public.whatsapp_connections (business_id, status, mode) values (v_id, 'disconnected', 'live');

  return v_id;
end;
$$;
revoke execute on function public.create_business(text, text, text, text, text, text) from public, anon;
grant execute on function public.create_business(text, text, text, text, text, text) to authenticated;

-- =====================================================================
-- RPC: accept_invitation
-- =====================================================================
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_inv public.invitations%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_inv from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found then raise exception 'invitation_not_found'; end if;
  if v_inv.accepted_at is not null then raise exception 'invitation_already_used'; end if;
  if v_inv.expires_at < now() then raise exception 'invitation_expired'; end if;
  if lower(v_inv.email) <> v_email then raise exception 'invitation_email_mismatch'; end if;

  insert into public.memberships (business_id, user_id, role)
  values (v_inv.business_id, v_user, v_inv.role)
  on conflict (business_id, user_id) do nothing;

  update public.invitations set accepted_at = now() where id = v_inv.id;
  return v_inv.business_id;
end;
$$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- =====================================================================
-- RPC: book_appointment – the single, atomic source of truth for bookings
--   * validates tenant ownership of service/staff/customer
--   * checks business hours & staff working hours (business timezone)
--   * exclusion constraint prevents overlaps even with concurrent requests
--   * when p_staff_id is null, tries each eligible staff member in turn
-- SECURITY INVOKER: for dashboard users RLS + explicit membership check
-- apply; the WhatsApp webhook calls it with the service role.
-- =====================================================================
create or replace function public.book_appointment(
  p_business_id uuid,
  p_customer_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_staff_id uuid default null,
  p_source text default 'dashboard',
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business public.businesses%rowtype;
  v_service public.services%rowtype;
  v_ends timestamptz;
  v_local_start timestamp;
  v_local_end timestamp;
  v_dow int;
  v_hours public.business_hours%rowtype;
  v_staff record;
  v_appt_id uuid;
  v_tried int := 0;
begin
  -- Authorization: authenticated users must be members. Service role (auth.uid() null
  -- and role service_role) is trusted server code that already resolved the tenant.
  if auth.uid() is not null then
    if not public.is_member(p_business_id) then
      return jsonb_build_object('ok', false, 'error', 'forbidden');
    end if;
  elsif coalesce(auth.role(), '') <> 'service_role' then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  select * into v_business from public.businesses where id = p_business_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'business_not_found'); end if;

  select * into v_service from public.services
  where id = p_service_id and business_id = p_business_id and is_active;
  if not found then return jsonb_build_object('ok', false, 'error', 'service_not_found'); end if;

  if not exists (select 1 from public.customers where id = p_customer_id and business_id = p_business_id) then
    return jsonb_build_object('ok', false, 'error', 'customer_not_found');
  end if;

  if p_starts_at < now() + make_interval(mins => v_business.booking_lead_minutes) then
    return jsonb_build_object('ok', false, 'error', 'too_soon');
  end if;
  if p_starts_at > now() + make_interval(days => v_business.booking_horizon_days) then
    return jsonb_build_object('ok', false, 'error', 'too_far');
  end if;

  v_ends := p_starts_at + make_interval(mins => v_service.duration_minutes);
  v_local_start := p_starts_at at time zone v_business.timezone;
  v_local_end := v_ends at time zone v_business.timezone;
  v_dow := extract(dow from v_local_start)::int;

  if v_local_end::date <> v_local_start::date then
    return jsonb_build_object('ok', false, 'error', 'outside_business_hours');
  end if;

  select * into v_hours from public.business_hours where business_id = p_business_id and day_of_week = v_dow;
  if not found or v_hours.is_closed
     or v_local_start::time < v_hours.open_time or v_local_end::time > v_hours.close_time then
    return jsonb_build_object('ok', false, 'error', 'outside_business_hours');
  end if;

  for v_staff in
    select s.* from public.staff s
    where s.business_id = p_business_id
      and s.is_active
      and (p_staff_id is null or s.id = p_staff_id)
      and v_dow = any(s.working_days)
      and (s.work_start is null or (v_local_start::time >= s.work_start and v_local_end::time <= s.work_end))
      and (
        not exists (select 1 from public.staff_services ss where ss.staff_id = s.id)
        or exists (select 1 from public.staff_services ss where ss.staff_id = s.id and ss.service_id = p_service_id)
      )
    order by (
      select count(*) from public.appointments a
      where a.staff_id = s.id and a.status in ('pending','confirmed')
        and a.starts_at >= date_trunc('day', p_starts_at) and a.starts_at < date_trunc('day', p_starts_at) + interval '1 day'
    ), s.created_at
  loop
    v_tried := v_tried + 1;
    begin
      insert into public.appointments
        (business_id, customer_id, service_id, staff_id, starts_at, ends_at, status, price_cents, source, notes, created_by)
      values
        (p_business_id, p_customer_id, p_service_id, v_staff.id, p_starts_at, v_ends, 'confirmed',
         v_service.price_cents, p_source, nullif(p_notes, ''), auth.uid())
      returning id into v_appt_id;

      return jsonb_build_object(
        'ok', true,
        'appointment_id', v_appt_id,
        'staff_id', v_staff.id,
        'staff_name', v_staff.name,
        'service_name', v_service.name,
        'starts_at', p_starts_at,
        'ends_at', v_ends,
        'price_cents', v_service.price_cents
      );
    exception when exclusion_violation then
      -- staff member is busy at that time; try the next one
      null;
    end;
  end loop;

  if v_tried = 0 then
    return jsonb_build_object('ok', false, 'error', case when p_staff_id is null then 'no_staff_available' else 'staff_unavailable' end);
  end if;
  return jsonb_build_object('ok', false, 'error', 'slot_taken');
end;
$$;
revoke execute on function public.book_appointment(uuid, uuid, uuid, timestamptz, uuid, text, text) from public, anon;
grant execute on function public.book_appointment(uuid, uuid, uuid, timestamptz, uuid, text, text) to authenticated, service_role;
