-- Soft delete back-office : archive dans deleted_records, deleted_at, plus de DELETE.

create table if not exists public.deleted_records (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_id text not null,
  payload jsonb not null,
  deleted_at timestamptz not null default now(),
  deleted_by text
);

create index if not exists deleted_records_source_idx
  on public.deleted_records (source_table, source_id, deleted_at desc);

alter table public.deleted_records enable row level security;

alter table public.coach_reservations add column if not exists deleted_at timestamptz;

create index if not exists coach_reservations_alive_idx
  on public.coach_reservations (club_id, starts_at)
  where deleted_at is null;

create or replace function public.coach_bo_supprimer_reservation(p_id uuid, p_acteur text)
returns text[]
language plpgsql
security definer
set search_path = public
as $$
declare
  r        public.coach_reservations%rowtype;
  chemins  text[];
begin
  select * into r from public.coach_reservations where id = p_id for update;
  if not found then
    return '{}';
  end if;
  if r.deleted_at is not null then
    return '{}';
  end if;

  select coalesce(array_agg(distinct c), '{}') into chemins
  from (
    select pdf_path as c from public.coach_signatures where reservation_id = p_id
    union
    select r.signature_pdf_path
  ) s
  where c is not null and c <> '';

  insert into public.deleted_records (source_table, source_id, payload, deleted_by)
  values ('coach_reservations', p_id::text, to_jsonb(r), p_acteur);

  update public.coach_reservations
    set deleted_at = now(),
        status = case
          when status in ('held', 'awaiting_signature', 'confirmed') then 'cancelled_credit'
          else status
        end,
        cancelled_at = coalesce(cancelled_at, now())
    where id = p_id;

  insert into public.coach_audit_logs (actor_id, role, action, club_id, target_type, target_id, meta)
  values (null, 'back_office', 'reservation.supprimee', r.club_id, 'reservation', p_id::text,
          jsonb_build_object(
            'par', p_acteur,
            'coach_id', r.coach_id,
            'debut', r.starts_at,
            'statut', r.status,
            'paiement', r.payment_status,
            'montant_cents', r.amount_cents,
            'soft_delete', true
          ));

  return chemins;
end;
$$;

create or replace function public.coach_bo_supprimer_coach(p_id uuid, p_acteur text)
returns text[]
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  p        public.coach_profiles%rowtype;
  chemins  text[] := '{}';
  resa     uuid;
  nb       int := 0;
begin
  select * into p from public.coach_profiles where id = p_id for update;
  if not found then
    return '{}';
  end if;

  for resa in select id from public.coach_reservations where coach_id = p_id and deleted_at is null loop
    chemins := chemins || public.coach_bo_supprimer_reservation(resa, p_acteur);
    nb := nb + 1;
  end loop;

  if p.deleted_at is null then
    insert into public.deleted_records (source_table, source_id, payload, deleted_by)
    values ('coach_profiles', p_id::text, to_jsonb(p), p_acteur);

    update public.coach_profiles
      set deleted_at = now(),
          status = 'deleted'
      where id = p_id;
  end if;

  if coalesce(p.photo_path, '') <> '' then
    chemins := chemins || p.photo_path;
  end if;

  update auth.users
    set email = 'deleted_' || p_id::text || '@deleted.invalid'
    where id = p_id;

  insert into public.coach_audit_logs (actor_id, role, action, target_type, target_id, meta)
  values (null, 'back_office', 'coach.supprime', 'coach', p_id::text,
          jsonb_build_object('par', p_acteur, 'reservations', nb, 'soft_delete', true));

  return chemins;
end;
$$;
