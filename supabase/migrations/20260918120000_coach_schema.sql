-- Réservation coachs — schéma (Junior). Préfixe coach_*. Europe/Paris. Montants en centimes.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.coach_profile_status as enum ('active', 'suspended', 'deleted');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.coach_reservation_status as enum (
    'held',
    'awaiting_payment',
    'awaiting_signature',
    'confirmed',
    'consumed',
    'expired',
    'payment_failed',
    'cancelled_credit',
    'no_show'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.coach_payment_status as enum ('unpaid', 'paid', 'failed', 'waived_credit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.coach_payment_provider as enum ('payplug', 'paypal', 'credit');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.coach_signature_status as enum ('none', 'signed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.coach_deciplus_job_status as enum ('none', 'queued', 'granted', 'revoked', 'error');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.coach_credit_status as enum ('available', 'consumed', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.coach_tariff_kind as enum ('offpeak', 'peak');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.coach_document_kind as enum ('cgv', 'reglement', 'decharge');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.coach_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.coach_jwt_role()
returns text
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() -> 'app_metadata' ->> 'role', ''), 'coach');
$$;

create or replace function public.coach_jwt_club_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'club_id', '');
$$;

-- ---------------------------------------------------------------------------
-- Clubs / espaces
-- ---------------------------------------------------------------------------
create table if not exists public.coach_clubs (
  id text primary key
    check (id in ('minimes', 'st-cyprien', 'etats-unis', 'ramonville', 'portet')),
  name text not null,
  city text not null,
  address_short text not null default '',
  hero_path text,
  presentation text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.coach_spaces (
  id text not null,
  club_id text not null references public.coach_clubs (id) on delete cascade,
  label text not null,
  sort_order int not null default 0,
  primary key (club_id, id)
);

-- ---------------------------------------------------------------------------
-- Settings + tarifs + templates + blocages
-- ---------------------------------------------------------------------------
create table if not exists public.coach_settings (
  key text primary key,
  value jsonb not null,
  public_read boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_tariffs (
  id uuid primary key default gen_random_uuid(),
  kind public.coach_tariff_kind not null,
  hour_start smallint not null check (hour_start between 10 and 18),
  amount_cents int not null check (amount_cents > 0),
  unique (kind, hour_start)
);

create table if not exists public.coach_slot_templates (
  id uuid primary key default gen_random_uuid(),
  club_id text not null references public.coach_clubs (id) on delete cascade,
  space_id text not null,
  dow smallint not null check (dow between 1 and 6),
  hour_start smallint not null check (hour_start between 10 and 18),
  enabled boolean not null default true,
  unique (club_id, space_id, dow, hour_start),
  foreign key (club_id, space_id) references public.coach_spaces (club_id, id) on delete cascade
);

-- Règles hebdo (éducative). Portet : aucune par défaut, BO.
create table if not exists public.coach_slot_block_rules (
  id uuid primary key default gen_random_uuid(),
  club_id text not null references public.coach_clubs (id) on delete cascade,
  space_id text,
  dow smallint not null check (dow between 1 and 6),
  hour_start smallint not null check (hour_start between 10 and 18),
  reason text not null default 'educative',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (club_id, space_id, dow, hour_start)
);

create table if not exists public.coach_slot_blocks (
  id uuid primary key default gen_random_uuid(),
  club_id text not null references public.coach_clubs (id) on delete cascade,
  space_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text not null default 'manual',
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (club_id, space_id) references public.coach_spaces (club_id, id) on delete cascade
);

create index if not exists coach_slot_blocks_slot_idx
  on public.coach_slot_blocks (club_id, space_id, starts_at);

-- ---------------------------------------------------------------------------
-- Profils (1-1 auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.coach_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '',
  last_name text not null default '',
  birth_date date,
  phone text,
  email text,
  address_line text,
  postal_code text,
  city text,
  diploma text,
  disciplines text[] not null default '{}',
  photo_path text,
  status public.coach_profile_status not null default 'active',
  suspended_at timestamptz,
  suspended_reason text,
  consent_privacy_at timestamptz,
  consent_cgu_at timestamptz,
  payplug_customer_id text,
  paypal_vault_id text,
  deciplus_member_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists coach_profiles_updated_at on public.coach_profiles;
create trigger coach_profiles_updated_at
  before update on public.coach_profiles
  for each row execute function public.coach_set_updated_at();

create or replace function public.coach_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.coach_profiles (id, email, first_name, last_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists coach_on_auth_user_created on auth.users;
create trigger coach_on_auth_user_created
  after insert on auth.users
  for each row execute function public.coach_handle_new_user();

-- ---------------------------------------------------------------------------
-- Réservations
-- ---------------------------------------------------------------------------
create table if not exists public.coach_reservations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles (id),
  club_id text not null,
  space_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  amount_cents int not null check (amount_cents > 0),
  currency text not null default 'eur' check (currency = 'eur'),
  status public.coach_reservation_status not null default 'held',
  payment_status public.coach_payment_status not null default 'unpaid',
  payment_provider public.coach_payment_provider,
  payment_id text,
  signature_status public.coach_signature_status not null default 'none',
  signed_at timestamptz,
  signature_pdf_path text,
  qr_jti text,
  qr_valid_from timestamptz,
  qr_valid_to timestamptz,
  deciplus_job_status public.coach_deciplus_job_status not null default 'none',
  hold_expires_at timestamptz,
  cancelled_at timestamptz,
  credit_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (club_id, space_id) references public.coach_spaces (club_id, id),
  check (ends_at = starts_at + interval '1 hour'),
  check (status <> 'confirmed' or (payment_status in ('paid', 'waived_credit') and signature_status = 'signed'))
);

create unique index if not exists coach_reservations_payment_id_uidx
  on public.coach_reservations (payment_id)
  where payment_id is not null;

create unique index if not exists coach_reservations_qr_jti_uidx
  on public.coach_reservations (qr_jti)
  where qr_jti is not null;

create unique index if not exists coach_reservations_one_coach_per_slot
  on public.coach_reservations (coach_id, club_id, space_id, starts_at)
  where status in ('held', 'awaiting_signature', 'confirmed');

create index if not exists coach_reservations_slot_active_idx
  on public.coach_reservations (club_id, space_id, starts_at)
  where status in ('held', 'awaiting_signature', 'confirmed');

create index if not exists coach_reservations_coach_status_idx
  on public.coach_reservations (coach_id, status);

drop trigger if exists coach_reservations_updated_at on public.coach_reservations;
create trigger coach_reservations_updated_at
  before update on public.coach_reservations
  for each row execute function public.coach_set_updated_at();

create or replace function public.coach_setting_int(p_key text, p_default int)
returns int
language sql
stable
as $$
  select coalesce((select (value #>> '{}')::int from public.coach_settings where key = p_key), p_default);
$$;

create or replace function public.coach_reservations_freeze_price()
returns trigger
language plpgsql
as $$
declare
  h int;
  cents int;
  iso_dow int;
begin
  iso_dow := extract(isodow from timezone('Europe/Paris', new.starts_at));
  h := extract(hour from timezone('Europe/Paris', new.starts_at));
  if iso_dow not between 1 and 6 or h not between 10 and 18 then
    raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at then
    select t.amount_cents into cents
    from public.coach_tariffs t
    where t.hour_start = h
    limit 1;
    if cents is null then
      raise exception 'VALIDATION_ERROR' using errcode = 'P0001';
    end if;
    new.amount_cents := cents;
    new.ends_at := new.starts_at + interval '1 hour';
  elsif new.amount_cents is distinct from old.amount_cents and public.coach_jwt_role() <> 'direction' then
    new.amount_cents := old.amount_cents;
  end if;
  return new;
end;
$$;

drop trigger if exists coach_reservations_freeze_price on public.coach_reservations;
create trigger coach_reservations_freeze_price
  before insert or update of starts_at, amount_cents, ends_at
  on public.coach_reservations
  for each row execute function public.coach_reservations_freeze_price();

create or replace function public.coach_reservations_guard()
returns trigger
language plpgsql
as $$
declare
  cap int;
  taken int;
  max_active int;
  n_active int;
begin
  if new.status not in ('held', 'awaiting_signature', 'confirmed') then
    return new;
  end if;

  cap := public.coach_setting_int('capacity_per_slot', 2);
  select count(*) into taken
  from public.coach_reservations r
  where r.club_id = new.club_id
    and r.space_id = new.space_id
    and r.starts_at = new.starts_at
    and r.status in ('held', 'awaiting_signature', 'confirmed')
    and r.id is distinct from new.id;
  if taken >= cap then
    raise exception 'SLOT_FULL' using errcode = 'P0001';
  end if;

  max_active := public.coach_setting_int('max_active_reservations', 3);
  select count(*) into n_active
  from public.coach_reservations r
  where r.coach_id = new.coach_id
    and r.status in ('held', 'awaiting_signature', 'confirmed')
    and r.id is distinct from new.id;
  if n_active >= max_active then
    raise exception 'ACTIVE_LIMIT' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists coach_reservations_guard on public.coach_reservations;
create trigger coach_reservations_guard
  before insert or update of status, club_id, space_id, starts_at, coach_id
  on public.coach_reservations
  for each row execute function public.coach_reservations_guard();

-- ---------------------------------------------------------------------------
-- Avoirs, documents, signatures
-- ---------------------------------------------------------------------------
create table if not exists public.coach_credits (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.coach_profiles (id),
  amount_cents int not null check (amount_cents > 0),
  origin_reservation_id uuid references public.coach_reservations (id),
  status public.coach_credit_status not null default 'available',
  created_at timestamptz not null default now()
);

alter table public.coach_reservations
  drop constraint if exists coach_reservations_credit_id_fkey;
alter table public.coach_reservations
  add constraint coach_reservations_credit_id_fkey
  foreign key (credit_id) references public.coach_credits (id);

create table if not exists public.coach_documents (
  id uuid primary key default gen_random_uuid(),
  kind public.coach_document_kind not null,
  title text not null,
  version text not null,
  body_html text not null default '',
  current boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists coach_documents_one_current
  on public.coach_documents (kind)
  where current;

create table if not exists public.coach_signatures (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.coach_reservations (id) on delete cascade,
  coach_id uuid not null references public.coach_profiles (id),
  document_ids uuid[] not null,
  pdf_path text not null,
  sha256 text not null,
  ip inet,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Jobs Deciplus, events, audit, idempotency
-- ---------------------------------------------------------------------------
create table if not exists public.coach_deciplus_jobs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.coach_reservations (id) on delete cascade,
  coach_id uuid references public.coach_profiles (id),
  action text not null check (action in ('grant', 'revoke', 'revoke_coach')),
  status public.coach_deciplus_job_status not null default 'queued',
  deciplus_member_id text,
  error text,
  attempts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists coach_deciplus_jobs_updated_at on public.coach_deciplus_jobs;
create trigger coach_deciplus_jobs_updated_at
  before update on public.coach_deciplus_jobs
  for each row execute function public.coach_set_updated_at();

create table if not exists public.coach_events (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  reservation_id uuid,
  coach_id uuid,
  club_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists coach_events_topic_idx on public.coach_events (topic, created_at desc);

create table if not exists public.coach_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  role text not null,
  action text not null,
  club_id text,
  target_type text,
  target_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists coach_audit_logs_club_idx on public.coach_audit_logs (club_id, created_at desc);

create table if not exists public.coach_idempotency (
  key text not null,
  coach_id uuid,
  method text not null,
  path text not null,
  reservation_id uuid,
  response jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (key, method, path)
);

create index if not exists coach_idempotency_expires_idx on public.coach_idempotency (expires_at);
