-- =============================================================================
-- 0001 — Types énumérés et fonctions d'aide (fuseau, rôle métier, erreurs)
-- =============================================================================
-- Les valeurs d'enum viennent d'`openapi.yaml` et de `src/domain/contrat.ts`.
-- Aucune n'est inventée : un statut de plus est un changement de contrat (§14 du
-- cahier), et coûte DEUX migrations, pas une — « ALTER TYPE … ADD VALUE » peut
-- tourner dans une transaction mais la nouvelle valeur n'est utilisable qu'après
-- le COMMIT (https://www.postgresql.org/docs/current/sql-altertype.html).
--
-- Extensions : aucune n'est requise. gen_random_uuid() est natif depuis
-- Postgres 13, md5() est natif, et la solution de capacité du 0004 n'utilise pas
-- de contrainte EXCLUDE — donc pas de btree_gist.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enums
-- ─────────────────────────────────────────────────────────────────────────────
create type public.coach_reservation_status as enum (
  'held',
  'awaiting_signature',
  'confirmed',
  'consumed',
  'expired',
  'payment_failed',
  'cancelled_credit',
  'no_show'
);

create type public.coach_payment_status   as enum ('unpaid','paid','failed','waived_credit');
create type public.coach_payment_provider as enum ('payplug','paypal','credit');
create type public.coach_signature_status as enum ('none','signed');
create type public.coach_deciplus_status  as enum ('none','queued','granted','revoked','error');
create type public.coach_credit_status    as enum ('available','consumed','expired');
create type public.coach_profile_status   as enum ('active','suspended','deleted');
create type public.coach_tariff_kind      as enum ('offpeak','peak');
create type public.coach_document_kind    as enum ('cgv','reglement','decharge','other');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fuseau — la règle qui se perd si on ne l'écrit pas une bonne fois
--
--   Durée      (hold 10 min, annulation 24 h) : timestamptz contre timestamptz.
--                                               Le fuseau n'intervient pas.
--   Calendrier (dimanche, 10h–19h, tarif)     : AT TIME ZONE 'Europe/Paris'
--                                               EXPLICITE. Jamais le TimeZone de
--                                               session, qui dépend du client.
--
-- Ces trois fonctions sont IMMUTABLE : `timestamptz AT TIME ZONE <literal>` ne
-- dépend d'aucun paramètre de session, contrairement à date_trunc(text, timestamptz).
-- Elles sont donc utilisables en index et en contrainte.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_paris(p_ts timestamptz)
returns timestamp
language sql
immutable
parallel safe
as $$ select p_ts at time zone 'Europe/Paris' $$;

comment on function public.coach_paris(timestamptz) is
  'Heure murale de Paris. Toute règle calendaire du lot C passe par ici.';

create or replace function public.coach_isodow_paris(p_ts timestamptz)
returns int
language sql
immutable
parallel safe
as $$ select extract(isodow from (p_ts at time zone 'Europe/Paris'))::int $$;

comment on function public.coach_isodow_paris(timestamptz) is
  '1 = lundi … 7 = dimanche, en heure de Paris. 7 n''est jamais ouvrable.';

create or replace function public.coach_hour_paris(p_ts timestamptz)
returns int
language sql
immutable
parallel safe
as $$ select extract(hour from (p_ts at time zone 'Europe/Paris'))::int $$;

comment on function public.coach_hour_paris(timestamptz) is
  'Heure de début en heure de Paris. Les créneaux vont de 10 à 18 INCLUS (le dernier finit à 19h).';

create or replace function public.coach_est_heure_pile_paris(p_ts timestamptz)
returns boolean
language sql
immutable
parallel safe
as $$
  select (p_ts at time zone 'Europe/Paris')
       = date_trunc('hour', (p_ts at time zone 'Europe/Paris'))
$$;

comment on function public.coach_est_heure_pile_paris(timestamptz) is
  'Vrai si l''instant tombe sur une heure pile murale de Paris (cahier §3.3).';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Rôle métier — lu dans app_metadata, jamais dans user_metadata
--
-- `coach`, `manager_salle`, `direction`, `service` (cahier §1.1) sont des CLAIMS,
-- pas des rôles Postgres. Postgres n'en connaît que trois : anon, authenticated,
-- service_role. Conséquence : un GRANT s'applique au coach ET au manager ET à la
-- direction en même temps. La séparation des trois se fait par RLS (lignes) et
-- par vues (colonnes) — jamais par GRANT.
--
-- `raw_app_meta_data` n'est pas modifiable par l'utilisateur, `user_metadata` l'est.
-- On ne lit donc JAMAIS user_metadata dans une policy.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_role()
returns text
language sql
stable
set search_path = public, pg_temp
as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'role', '') $$;

comment on function public.coach_role() is
  'Rôle métier du cahier §1.1, lu dans app_metadata. À appeler en (select public.coach_role()) dans les policies : Postgres en fait un initPlan, donc UN appel par requête au lieu d''un par ligne.';

create or replace function public.coach_club()
returns text
language sql
stable
set search_path = public, pg_temp
as $$ select nullif(auth.jwt() -> 'app_metadata' ->> 'club_id', '') $$;

comment on function public.coach_club() is
  'Club d''affectation d''un manager_salle, lu dans app_metadata.';

revoke execute on function public.coach_role() from public;
revoke execute on function public.coach_club() from public;
grant  execute on function public.coach_role() to anon, authenticated, service_role;
grant  execute on function public.coach_club() to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Enveloppe d'erreur — format du contrat §1.3, identique à src/lib/http/erreurs.ts
--
-- Les fonctions métier du lot C RETOURNENT un refus, elles ne le RAISE pas :
--   1. un RAISE annule la transaction, donc la trace d'idempotence avec ;
--   2. les SQLSTATE `PGRST` / `PTxyz` sont un détail de PostgREST, et le contrat
--      lie trois lots pour des mois ;
--   3. la route Next.js choisit déjà le statut HTTP, PostgREST n'a rien à en savoir.
-- Le seul RAISE conservé est celui de l'audit append-only (0009) : c'est une
-- violation d'invariant, pas un refus métier.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_err(
  p_code    text,
  p_message text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language sql
immutable
parallel safe
as $$
  select jsonb_build_object(
    'ok', false,
    'error', jsonb_build_object(
      'code',    p_code,
      'message', p_message,
      'details', coalesce(p_details, '{}'::jsonb)
    )
  )
$$;

comment on function public.coach_err(text, text, jsonb) is
  'Corps de refus métier { ok:false, error:{code,message,details} } — contrat §1.3.';

revoke execute on function public.coach_err(text, text, jsonb) from public, anon;
grant  execute on function public.coach_err(text, text, jsonb) to authenticated, service_role;
