-- RLS + vues staff (sans PDF, token QR, id Deciplus). Junior.

alter table public.coach_clubs enable row level security;
alter table public.coach_spaces enable row level security;
alter table public.coach_settings enable row level security;
alter table public.coach_tariffs enable row level security;
alter table public.coach_slot_templates enable row level security;
alter table public.coach_slot_block_rules enable row level security;
alter table public.coach_slot_blocks enable row level security;
alter table public.coach_profiles enable row level security;
alter table public.coach_reservations enable row level security;
alter table public.coach_credits enable row level security;
alter table public.coach_documents enable row level security;
alter table public.coach_signatures enable row level security;
alter table public.coach_deciplus_jobs enable row level security;
alter table public.coach_events enable row level security;
alter table public.coach_audit_logs enable row level security;
alter table public.coach_idempotency enable row level security;

-- Lecture publique catalogues
drop policy if exists coach_clubs_select on public.coach_clubs;
create policy coach_clubs_select on public.coach_clubs for select using (true);

drop policy if exists coach_spaces_select on public.coach_spaces;
create policy coach_spaces_select on public.coach_spaces for select using (true);

drop policy if exists coach_tariffs_select on public.coach_tariffs;
create policy coach_tariffs_select on public.coach_tariffs for select using (true);

drop policy if exists coach_templates_select on public.coach_slot_templates;
create policy coach_templates_select on public.coach_slot_templates for select using (true);

drop policy if exists coach_block_rules_select on public.coach_slot_block_rules;
create policy coach_block_rules_select on public.coach_slot_block_rules for select using (enabled);

drop policy if exists coach_blocks_select on public.coach_slot_blocks;
create policy coach_blocks_select on public.coach_slot_blocks for select using (true);

drop policy if exists coach_blocks_write_staff on public.coach_slot_blocks;
create policy coach_blocks_write_staff on public.coach_slot_blocks
  for all
  using (
    public.coach_jwt_role() = 'direction'
    or (public.coach_jwt_role() = 'manager_salle' and club_id = public.coach_jwt_club_id())
  )
  with check (
    public.coach_jwt_role() = 'direction'
    or (public.coach_jwt_role() = 'manager_salle' and club_id = public.coach_jwt_club_id())
  );

drop policy if exists coach_settings_select on public.coach_settings;
create policy coach_settings_select on public.coach_settings
  for select
  using (
    public_read
    or public.coach_jwt_role() in ('direction', 'manager_salle')
  );

drop policy if exists coach_settings_write_direction on public.coach_settings;
create policy coach_settings_write_direction on public.coach_settings
  for all
  using (public.coach_jwt_role() = 'direction')
  with check (public.coach_jwt_role() = 'direction');

-- Profils : soi + direction. Managers : vue staff seulement (colonnes limitées).
drop policy if exists coach_profiles_self on public.coach_profiles;
create policy coach_profiles_self on public.coach_profiles
  for select
  using (id = auth.uid() or public.coach_jwt_role() = 'direction');

drop policy if exists coach_profiles_manager_club on public.coach_profiles;
create policy coach_profiles_manager_club on public.coach_profiles
  for select
  using (
    public.coach_jwt_role() = 'manager_salle'
    and exists (
      select 1
      from public.coach_reservations r
      where r.coach_id = coach_profiles.id
        and r.club_id = public.coach_jwt_club_id()
    )
  );

drop policy if exists coach_profiles_self_update on public.coach_profiles;
create policy coach_profiles_self_update on public.coach_profiles
  for update
  using (id = auth.uid() or public.coach_jwt_role() = 'direction')
  with check (id = auth.uid() or public.coach_jwt_role() = 'direction');

drop policy if exists coach_profiles_insert_self on public.coach_profiles;
create policy coach_profiles_insert_self on public.coach_profiles
  for insert
  with check (id = auth.uid() or public.coach_jwt_role() = 'direction');

revoke all on public.coach_profiles from anon, authenticated;
grant select (
  id, first_name, last_name, birth_date, phone, email,
  address_line, postal_code, city, diploma, disciplines,
  photo_path, status, consent_privacy_at, consent_cgu_at,
  created_at, updated_at
) on public.coach_profiles to authenticated;
grant update (
  first_name, last_name, birth_date, phone, address_line, postal_code, city,
  diploma, disciplines, photo_path, consent_privacy_at, consent_cgu_at
) on public.coach_profiles to authenticated;
grant insert on public.coach_profiles to authenticated;

-- Réservations
drop policy if exists coach_reservations_select on public.coach_reservations;
create policy coach_reservations_select on public.coach_reservations
  for select
  using (
    coach_id = auth.uid()
    or public.coach_jwt_role() = 'direction'
    or (public.coach_jwt_role() = 'manager_salle' and club_id = public.coach_jwt_club_id())
  );

drop policy if exists coach_reservations_insert_self on public.coach_reservations;
create policy coach_reservations_insert_self on public.coach_reservations
  for insert
  with check (coach_id = auth.uid());

drop policy if exists coach_reservations_update on public.coach_reservations;
create policy coach_reservations_update on public.coach_reservations
  for update
  using (
    coach_id = auth.uid()
    or public.coach_jwt_role() = 'direction'
  )
  with check (
    coach_id = auth.uid()
    or public.coach_jwt_role() = 'direction'
  );

-- Avoirs
drop policy if exists coach_credits_select on public.coach_credits;
create policy coach_credits_select on public.coach_credits
  for select
  using (coach_id = auth.uid() or public.coach_jwt_role() = 'direction');

-- Documents : lecture versions courantes
drop policy if exists coach_documents_select on public.coach_documents;
create policy coach_documents_select on public.coach_documents for select using (true);

-- Signatures : owner + direction
drop policy if exists coach_signatures_select on public.coach_signatures;
create policy coach_signatures_select on public.coach_signatures
  for select
  using (coach_id = auth.uid() or public.coach_jwt_role() = 'direction');

drop policy if exists coach_signatures_insert on public.coach_signatures;
create policy coach_signatures_insert on public.coach_signatures
  for insert
  with check (coach_id = auth.uid() or public.coach_jwt_role() = 'direction');

-- Jobs Deciplus : pas le détail membre aux managers — statut via vue résa
drop policy if exists coach_deciplus_jobs_direction on public.coach_deciplus_jobs;
create policy coach_deciplus_jobs_direction on public.coach_deciplus_jobs
  for all
  using (public.coach_jwt_role() = 'direction')
  with check (public.coach_jwt_role() = 'direction');

-- Audit append-only
drop policy if exists coach_audit_select on public.coach_audit_logs;
create policy coach_audit_select on public.coach_audit_logs
  for select
  using (
    public.coach_jwt_role() = 'direction'
    or (public.coach_jwt_role() = 'manager_salle' and club_id = public.coach_jwt_club_id())
  );

drop policy if exists coach_audit_insert on public.coach_audit_logs;
create policy coach_audit_insert on public.coach_audit_logs
  for insert
  with check (public.coach_jwt_role() in ('direction', 'manager_salle', 'service', 'coach'));

revoke update, delete on public.coach_audit_logs from anon, authenticated;

drop policy if exists coach_events_staff on public.coach_events;
create policy coach_events_staff on public.coach_events
  for select
  using (public.coach_jwt_role() in ('direction', 'manager_salle'));

drop policy if exists coach_idempotency_self on public.coach_idempotency;
create policy coach_idempotency_self on public.coach_idempotency
  for all
  using (coach_id = auth.uid() or public.coach_jwt_role() = 'direction')
  with check (coach_id = auth.uid() or public.coach_jwt_role() = 'direction');

-- Vues staff (security_invoker) : pas de PDF / jti / id Deciplus
create or replace view public.coach_reservations_staff
with (security_invoker = true) as
select
  id,
  coach_id,
  club_id,
  space_id,
  starts_at,
  ends_at,
  amount_cents,
  currency,
  status,
  payment_status,
  payment_provider,
  signature_status,
  signed_at,
  deciplus_job_status,
  (status = 'confirmed' and qr_jti is not null) as qr_ready,
  hold_expires_at,
  cancelled_at,
  created_at,
  updated_at
from public.coach_reservations;

create or replace view public.coach_profiles_staff
with (security_invoker = true) as
select
  p.id,
  p.first_name,
  p.last_name,
  p.phone,
  p.email,
  p.city,
  p.status,
  p.photo_path,
  p.created_at
from public.coach_profiles p
where
  public.coach_jwt_role() = 'direction'
  or p.id = auth.uid()
  or (
    public.coach_jwt_role() = 'manager_salle'
    and exists (
      select 1
      from public.coach_reservations r
      where r.coach_id = p.id
        and r.club_id = public.coach_jwt_club_id()
    )
  );

grant select on public.coach_reservations_staff to authenticated;
grant select on public.coach_profiles_staff to authenticated;

-- Colonnes sensibles résas : pas aux authenticated (API service_role / owner via grants ciblés)
revoke all on public.coach_reservations from anon, authenticated;
grant select (
  id, coach_id, club_id, space_id, starts_at, ends_at, amount_cents, currency,
  status, payment_status, payment_provider, signature_status, signed_at,
  deciplus_job_status, hold_expires_at, cancelled_at, credit_id, created_at, updated_at
) on public.coach_reservations to authenticated;
grant insert, update on public.coach_reservations to authenticated;
