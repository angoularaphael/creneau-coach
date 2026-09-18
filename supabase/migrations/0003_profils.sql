-- =============================================================================
-- 0003 — coach_profiles
-- =============================================================================
-- Le profil métier du coach, à côté de auth.users que possède GoTrue.
--
-- POINT CRITIQUE : `status` FAIT FOI, PAS LE JWT.
-- Un coach suspendu conserve un jeton valide jusqu'à son expiration (1 heure par
-- défaut chez Supabase). Si `SUSPENDED` se vérifiait sur un claim, un coach
-- suspendu à 14h00 pourrait encore réserver à 14h55. Le contrôle se fait donc
-- EN BASE, dans coach_create_hold et coach_cancel_reservation.
-- Même raisonnement pour app_metadata.club_id d'un manager : un changement de
-- club met jusqu'à une heure à prendre effet.
-- =============================================================================

create table public.coach_profiles (
  id                   uuid primary key references auth.users(id) on delete restrict,

  -- Identité (cahier §3.1)
  first_name           text,
  last_name            text,
  birth_date           date,
  phone                text,          -- E.164, validé côté applicatif (zod)
  email                text,          -- copie de auth.users, pour les jointures staff
  address_line         text,
  postal_code          text,
  city                 text,
  diploma              text,
  disciplines          text[] not null default '{}',
  photo_path           text,          -- bucket PRIVÉ, jamais d'URL publique

  -- Cycle de vie
  status               public.coach_profile_status not null default 'active',
  suspended_at         timestamptz,
  suspended_reason     text,

  -- Consentements — cases NON pré-cochées (cahier §3.1). Un NULL veut dire
  -- « jamais consenti », ce qui est une information, pas une absence de donnée.
  consent_privacy_at   timestamptz,
  consent_cgu_at       timestamptz,

  -- Colonnes sensibles : grantées à PERSONNE côté API (0013 §13.2).
  -- Ni au coach, ni au manager, ni à la direction.
  payplug_customer_id  text,
  paypal_vault_id      text,
  deciplus_member_id   text,          -- lot A. Jamais dans le QR, jamais au manager.

  -- RGPD : soft-delete. coach_reservations.coach_id est en ON DELETE RESTRICT,
  -- on ne peut donc pas supprimer un profil qui a des réservations. On pose
  -- deleted_at et on anonymise les colonnes d'identité ; la ligne de réservation
  -- reste, parce qu'elle porte une écriture comptable.
  deleted_at           timestamptz,

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Un statut « suspended » sans date de suspension, ou l'inverse, est un bug.
  -- Le CHECK le rend inécrivable.
  constraint coach_profiles_suspension_coherente
    check ((status = 'suspended') = (suspended_at is not null))
);

comment on table public.coach_profiles is
  'Profil métier du coach. status fait foi pour SUSPENDED, jamais le claim JWT (le jeton survit jusqu''à 1 h à une suspension).';

comment on column public.coach_profiles.deciplus_member_id is
  'Lot A. Jamais granté à anon/authenticated, jamais dans un QR, jamais exposé au manager.';

-- Recherche staff par nom. L'index partiel ignore les profils supprimés :
-- il est plus petit et il rappelle au lecteur que deleted_at existe.
create index coach_profiles_recherche_staff
  on public.coach_profiles (last_name, first_name)
  where deleted_at is null;

-- updated_at tenu par la base, jamais par l'appelant.
create or replace function public.coach_profiles_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger coach_profiles_touch_trg
  before update on public.coach_profiles
  for each row execute function public.coach_profiles_touch();
