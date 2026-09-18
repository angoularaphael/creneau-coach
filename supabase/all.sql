-- Réservation coachs — SQL Editor (0000–0017 + storage coach-private).
-- Postgres 15+ / Supabase. Idempotent autant que chaque migration l’est.
-- 0000 est no-op sur un vrai projet Supabase. pg_cron (0012) est conditionnel.


-- =============================================================================
-- 0000_compat_supabase.sql
-- =============================================================================

-- =============================================================================
-- 0000 — Compatibilité Supabase sur un Postgres nu
-- =============================================================================
-- Un Postgres local n'a ni le schéma `auth`, ni les rôles d'API de Supabase.
-- Toutes les policies de ce lot s'appuient sur `auth.uid()` / `auth.jwt()` et sur
-- les rôles `anon` / `authenticated` / `service_role` : sans eux, rien ne se crée.
--
-- Tout ici est CONDITIONNEL. Sur un vrai projet Supabase ces objets existent déjà
-- et cette migration ne fait donc strictement rien. C'est la seule façon d'avoir
-- le même jeu de migrations en local, en CI et en production.
--
-- Les définitions reproduisent celles de Supabase : lecture des claims JWT posés
-- par PostgREST dans les GUC `request.jwt.claims` (objet JSON complet) et
-- `request.jwt.claim.<nom>` (forme dépréciée, encore émise par certaines versions).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Schéma auth
-- ─────────────────────────────────────────────────────────────────────────────
create schema if not exists auth;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rôles d'API
--    NOLOGIN : on ne s'y connecte pas directement, PostgREST fait un SET ROLE.
--    NOINHERIT : un rôle ne récupère pas passivement les droits d'un autre.
--    BYPASSRLS sur service_role : le cron, les webhooks et le bot en ont besoin.
--    C'est exactement pourquoi SUPABASE_SERVICE_ROLE_KEY ne doit jamais atteindre
--    le navigateur.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;

  -- Rattrapage : un service_role créé sans BYPASSRLS ne pourrait pas faire tourner
  -- le cron. Sur Supabase l'attribut est déjà posé, cette branche ne s'exécute pas.
  if exists (select 1 from pg_roles where rolname = 'service_role' and not rolbypassrls) then
    execute 'alter role service_role with bypassrls';
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth   to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. auth.users — cible de la clé étrangère de coach_profiles
--    Sur Supabase, c'est GoTrue qui possède cette table et elle est déjà là.
--    En local on en crée le strict minimum : l'identifiant et l'e-mail.
--    Aucune logique d'authentification n'est reproduite ici, ce n'est pas le sujet.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users'
  ) then
    execute $ddl$
      create table auth.users (
        id                uuid primary key default gen_random_uuid(),
        email             text,
        raw_app_meta_data jsonb not null default '{}'::jsonb,
        created_at        timestamptz not null default now()
      )
    $ddl$;
    execute $ddl$ comment on table auth.users is
      'Doublure locale de la table GoTrue. Sur Supabase, la vraie table existe déjà et celle-ci n''est jamais créée.' $ddl$;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. auth.jwt() / auth.uid() / auth.role()
--    Créées seulement si absentes : sur Supabase on ne réécrit jamais par-dessus
--    les fonctions de la plateforme.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'jwt'
  ) then
    execute $fn$
      create function auth.jwt() returns jsonb
      language sql stable
      as $body$
        select coalesce(
          nullif(current_setting('request.jwt.claim',  true), ''),
          nullif(current_setting('request.jwt.claims', true), '')
        )::jsonb
      $body$
    $fn$;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute $fn$
      create function auth.uid() returns uuid
      language sql stable
      as $body$
        select nullif(
          coalesce(
            nullif(current_setting('request.jwt.claim.sub', true), ''),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
          ), ''
        )::uuid
      $body$
    $fn$;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'role'
  ) then
    execute $fn$
      create function auth.role() returns text
      language sql stable
      as $body$
        select nullif(
          coalesce(
            nullif(current_setting('request.jwt.claim.role', true), ''),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
          ), ''
        )
      $body$
    $fn$;
  end if;
end
$$;

-- Les policies appellent ces fonctions en tant qu'utilisateur courant : sans
-- EXECUTE, toute requête d'un coach échouerait en 42501.
grant execute on function auth.jwt()  to anon, authenticated, service_role;
grant execute on function auth.uid()  to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;


-- =============================================================================
-- 0001_extensions_et_types.sql
-- =============================================================================

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


-- =============================================================================
-- 0002_referentiel.sql
-- =============================================================================

-- =============================================================================
-- 0002 — Référentiel : clubs, espaces, créneaux types, tarifs, blocages, réglages
-- =============================================================================
-- Rien ici n'est saisi par un coach. C'est la direction, via le back-office, qui
-- possède ces tables. Elles sont lues par la grille publique (SEO) et par le
-- moteur de réservation.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Clubs — cahier §3.2. Les identifiants sont les slugs de la boutique, figés par
-- src/domain/contrat.ts. Le CHECK interdit qu'un sixième club apparaisse par
-- accident : en ajouter un est une décision, donc une migration.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.coach_clubs (
  id          text primary key,
  name        text not null,
  city        text,
  hero_image  text,
  description text,
  amenities   text[]  not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint coach_clubs_slug_connu
    check (id in ('minimes','st-cyprien','etats-unis','ramonville','portet'))
);

comment on table public.coach_clubs is 'Les 5 clubs Boxing Center. Slugs alignés sur la boutique (cahier §3.2).';

-- ─────────────────────────────────────────────────────────────────────────────
-- Espaces — la capacité vit ICI, pas seulement dans coach_settings.
-- openapi.yaml expose Space.capacity ; coach_settings.capacity_per_slot ne sert
-- que de défaut à la création d'un espace. Un espace pourra donc passer à 3
-- places sans migration.
--
-- lock_key : entier stable, unique, servant de première clé à
-- pg_advisory_xact_lock (0010). Pourquoi une colonne et pas un hash du slug —
-- `hashtext()` est une fonction interne NON DOCUMENTÉE, et
-- `('x'||substr(md5(s),1,8))::bit(32)::int` est un idiome, pas une API. Une
-- colonne entière seedée 1..8 est déterministe, sans collision, et se relit
-- dans six mois.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.coach_spaces (
  id         text not null,
  club_id    text not null references public.coach_clubs(id) on delete restrict,
  name       text not null,
  capacity   smallint not null default 2 check (capacity between 1 and 8),
  lock_key   integer  not null,
  is_active  boolean  not null default true,
  created_at timestamptz not null default now(),
  primary key (club_id, id),
  constraint coach_spaces_lock_key_unique unique (lock_key)
);

comment on column public.coach_spaces.lock_key is
  'Clé entière stable pour pg_advisory_xact_lock. Unique par espace, jamais recyclée.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Créneaux types — l'EXISTENCE d'un créneau, pas son occupation.
-- Les créneaux sont VIRTUELS : aucune ligne « 22/09 11h MMA-Sol Portet » n'existe.
-- C'est ce qui rend le SELECT … FOR UPDATE du cahier §6.6 inapplicable tel quel,
-- et c'est pour ça que 0010 prend un verrou consultatif à la place.
--
-- isodow 1..6 : dimanche (7) n'est jamais ouvrable.
-- start_hour 10..18 : NEUF créneaux d'une heure, le dernier commence à 18h et
-- finit à 19h. « 10h→19h » du cahier se lit comme une amplitude, pas comme une
-- dernière heure de départ à 19h.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.coach_slot_templates (
  club_id     text     not null,
  space_id    text     not null,
  isodow      smallint not null check (isodow between 1 and 6),
  start_hour  smallint not null check (start_hour between 10 and 18),
  is_active   boolean  not null default true,
  primary key (club_id, space_id, isodow, start_hour),
  foreign key (club_id, space_id)
    references public.coach_spaces(club_id, id) on delete cascade
);

comment on table public.coach_slot_templates is
  'Planning type hebdomadaire. 9 créneaux (10h..18h de début) × 6 jours (lun..sam) par espace.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Tarifs — cahier §3.4. Le montant est SERVEUR, figé au hold, jamais fourni par
-- le client. Deux tables : le découpage horaire d'un côté, le montant de l'autre.
-- Changer le prix des heures pleines, c'est UNE ligne.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.coach_tariff_hours (
  start_hour smallint primary key check (start_hour between 10 and 18),
  kind       public.coach_tariff_kind not null
);

create table public.coach_tariffs (
  kind         public.coach_tariff_kind primary key,
  amount_cents integer not null check (amount_cents >= 0),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);

comment on table public.coach_tariffs is
  'Source de vérité UNIQUE des montants, en centimes (cahier §1.4). offpeak_cents / peak_cents de .env.example ne sont PAS recopiés ici : deux sources pour un prix, c''est la garantie qu''elles divergeront.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Blocages RÉCURRENTS (boxe éducative) — n'existe pas au contrat §3.3, ajout du
-- lot C. L'éducative est une règle hebdomadaire permanente ; coach_slot_blocks du
-- contrat est DATÉ (POST /admin/slot-blocks prend un starts_at). Sans table de
-- règles, il faudrait générer des blocages datés à l'infini.
--
-- Portet : les lignes sont créées mais is_active = false. La direction bascule le
-- booléen au back-office, sans migration.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.coach_slot_block_rules (
  id         uuid primary key default gen_random_uuid(),
  club_id    text not null,
  space_id   text not null,
  isodow     smallint not null check (isodow between 1 and 7),
  start_hour smallint not null check (start_hour between 10 and 18),
  reason     text not null default 'educative',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (club_id, space_id)
    references public.coach_spaces(club_id, id) on delete cascade,
  constraint coach_block_rules_unique unique (club_id, space_id, isodow, start_hour)
);

comment on table public.coach_slot_block_rules is
  'Blocages hebdomadaires récurrents (boxe éducative). AJOUT AU CONTRAT — à valider en PR sur CAHIER-API.md §3.3.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Blocages DATÉS — ponctuels, posés par un manager sur son club ou par la
-- direction partout (POST /admin/slot-blocks).
-- ─────────────────────────────────────────────────────────────────────────────
create table public.coach_slot_blocks (
  id         uuid primary key default gen_random_uuid(),
  club_id    text not null,
  space_id   text not null,
  starts_at  timestamptz not null,
  reason     text not null default 'educative',
  created_by uuid,
  created_at timestamptz not null default now(),
  foreign key (club_id, space_id)
    references public.coach_spaces(club_id, id) on delete cascade,
  -- club_id dans la clé : 'salle' existe à Minimes, St-Cyprien ET Ramonville.
  -- Sans lui, bloquer Minimes 15h bloquerait aussi Ramonville 15h.
  constraint coach_slot_blocks_unique unique (club_id, space_id, starts_at)
);

create index coach_slot_blocks_par_espace_date
  on public.coach_slot_blocks (club_id, space_id, starts_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Réglages direction — cahier §3.9. La source de vérité en exécution, jamais les
-- constantes de src/domain/contrat.ts (qui ne sont que des DÉFAUTS).
--
-- is_public : le cahier §12 dit « coach : SELECT public keys ». Sans cette
-- colonne, la policy ne saurait pas quoi filtrer.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.coach_settings (
  key        text primary key,
  value      jsonb   not null,
  is_public  boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on column public.coach_settings.is_public is
  'Lisible par un coach et par le public (grille). Les clés non publiques sont réservées au staff.';


-- =============================================================================
-- 0003_profils.sql
-- =============================================================================

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


-- =============================================================================
-- 0004_reservations.sql
-- =============================================================================

-- =============================================================================
-- 0004 — coach_reservations : le point dur du lot C
-- =============================================================================
-- LE PROBLÈME
-- Le cahier §3.5 demande « une contrainte unique partielle : au plus 2 lignes
-- actives par (space_id, starts_at) ». Or aucun CREATE UNIQUE INDEX ne sait dire
-- « au plus N ». Le cahier décrit l'intention, pas l'outil.
--
-- Et la vraie difficulté est ailleurs : LES CRÉNEAUX SONT VIRTUELS. Ils sont
-- engendrés depuis coach_slot_templates ; il n'existe aucune ligne
-- « 22/09 11h MMA-Sol Portet ». Le SELECT … FOR UPDATE du cahier §6 étape 6
-- n'a donc RIEN à verrouiller. C'est une erreur du cahier, pas un détail.
--
-- LA SOLUTION, EN DEUX PIÈCES QUI NE FONT PAS LE MÊME TRAVAIL
--
--   (a) colonne `seat` + index unique partiel (space_id, starts_at, seat)
--       → transforme « au plus N » en « au plus 1 par siège », ce qu'un index
--         unique sait dire. C'est le DERNIER MUR : il rend l'état invalide
--         impossible à écrire, y compris par un INSERT direct en service_role
--         ou par une migration maladroite.
--
--   (d) pg_advisory_xact_lock sur (espace, heure) — dans 0010
--       → crée le point de rendez-vous qui manque, sans ligne à verrouiller.
--         Il rend le chemin normal PROPRE : sans lui, deux POST simultanés sur
--         le dernier siège finissent en unique_violation qu'il faut traduire en
--         SLOT_FULL ; avec lui, la seconde transaction attend, recompte, et
--         renvoie un vrai refus métier avec ses `details`.
--
-- Ce qui a été REJETÉ, et pourquoi :
--   (b) trigger BEFORE INSERT qui compte → en READ COMMITTED (défaut, et
--       PostgREST ne le change pas), deux transactions concurrentes comptent
--       toutes les deux « 1 < 2 » et insèrent toutes les deux. 3 lignes.
--       Fausse sécurité. On ne peut pas passer en SERIALIZABLE depuis l'intérieur
--       d'une fonction, la transaction est déjà ouverte.
--   (c) table de créneaux matérialisée + SELECT FOR UPDATE → correct, mais
--       impose ~22 000 lignes/an, un job de génération, un backfill et une
--       désynchronisation possible avec les templates. Gardé en réserve pour le
--       jour où un créneau portera des métadonnées propres.
--
-- LIBÉRATION AUTOMATIQUE : un hold qui expire passe à `expired`, une annulation à
-- `cancelled_credit` ; dans les deux cas la ligne SORT du prédicat partiel, donc
-- le siège se libère tout seul. Aucun DELETE, aucune ligne fantôme, historique
-- complet. C'est la propriété qui rend le siège supérieur à un compteur.
-- =============================================================================

create table public.coach_reservations (
  id                  uuid primary key default gen_random_uuid(),
  coach_id            uuid not null references public.coach_profiles(id) on delete restrict,
  club_id             text not null,
  space_id            text not null,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,           -- dérivé, posé par trigger

  -- Le siège : 1..coach_spaces.capacity. C'est lui qui rend l'invariant exprimable.
  seat                smallint not null,

  -- FIGÉ au hold, calculé par le serveur. Aucun paramètre client ne l'influence.
  amount_cents        integer not null check (amount_cents >= 0),
  currency            text not null default 'eur' check (currency = 'eur'),

  status              public.coach_reservation_status not null default 'held',
  payment_status      public.coach_payment_status     not null default 'unpaid',
  payment_provider    public.coach_payment_provider,
  payment_id          text,

  signature_status    public.coach_signature_status   not null default 'none',
  signed_at           timestamptz,
  signature_pdf_path  text,                            -- jamais granté au navigateur

  qr_jti              text,                            -- jamais granté au navigateur
  qr_valid_from       timestamptz,
  qr_valid_to         timestamptz,

  deciplus_job_status public.coach_deciplus_status not null default 'none',

  hold_expires_at     timestamptz,
  cancelled_at        timestamptz,
  cancel_reason       text,                            -- 'coach' | 'direction' | 'hold_expired'
  credit_id           uuid,                            -- FK posée en 0005 (cycle)
  idempotency_key     uuid,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  foreign key (club_id, space_id)
    references public.coach_spaces(club_id, id) on delete restrict,

  -- La barrière du cahier §2, écrite EN BASE et pas seulement dans le code du
  -- lot A : `confirmed` est interdit tant que ce n'est pas payé ET signé.
  constraint coach_res_confirmed_exige_paye_et_signe
    check (status <> 'confirmed'
           or (payment_status in ('paid','waived_credit') and signature_status = 'signed')),

  constraint coach_res_hold_a_une_expiration
    check (status <> 'held' or hold_expires_at is not null),

  constraint coach_res_avoir_seulement_sur_annulation
    check (credit_id is null or status = 'cancelled_credit'),

  constraint coach_res_siege_positif check (seat >= 1),
  constraint coach_res_fin_apres_debut check (ends_at > starts_at)
);

comment on table public.coach_reservations is
  'Réservations. Aucune policy INSERT/UPDATE/DELETE pour authenticated : tout passe par coach_create_hold / coach_cancel_reservation (SECURITY DEFINER) ou par service_role.';

comment on column public.coach_reservations.seat is
  'Siège 1..coach_spaces.capacity. Rend « au plus N par créneau » exprimable par un index unique partiel.';

comment on column public.coach_reservations.amount_cents is
  'Figé au hold par le serveur depuis coach_tariffs. Non granté en écriture au navigateur (test contractuel §13.13).';

-- ─────────────────────────────────────────────────────────────────────────────
-- INVARIANT 1 — au plus `capacity` réservations actives par (space_id, starts_at).
-- Un siège ne peut être occupé qu'une fois. Combiné au contrôle de borne du
-- trigger (seat <= coach_spaces.capacity), cela donne exactement « au plus capacity ».
-- Cet index tient MÊME SI l'applicatif est contourné.
-- ─────────────────────────────────────────────────────────────────────────────
-- ATTENTION : `club_id` FAIT PARTIE DE LA CLÉ, et ce n'est pas décoratif.
-- `space_id = 'salle'` existe à Minimes, à St-Cyprien ET à Ramonville. Sans `club_id`,
-- le siège 1 du 22/09 11h serait le MÊME objet dans les trois clubs : la capacité de 2
-- serait partagée entre trois salles au lieu d'être de 2 par salle. Le cahier §3.5 écrit
-- la clé « (space_id, starts_at) » ; c'est une erreur du cahier, corrigée ici.
-- `coach_spaces` a d'ailleurs déjà une clé primaire composite (club_id, id).
create unique index coach_res_un_siege_par_creneau
  on public.coach_reservations (club_id, space_id, starts_at, seat)
  where status in ('held','awaiting_signature','confirmed');

-- ─────────────────────────────────────────────────────────────────────────────
-- INVARIANT 2 — un coach, une seule réservation active sur le même créneau.
-- ─────────────────────────────────────────────────────────────────────────────
create unique index coach_res_un_coach_par_creneau
  on public.coach_reservations (coach_id, club_id, space_id, starts_at)
  where status in ('held','awaiting_signature','confirmed');

-- Variante plus stricte, en attente d'arbitrage (spec-02 §19 q.2) : un coach ne
-- peut pas être physiquement dans deux salles à 11h. Le contrat ne l'interdit pas,
-- donc on ne l'impose pas unilatéralement — ce serait un refus non prévu au cahier.
-- create unique index coach_res_un_coach_une_heure
--   on public.coach_reservations (coach_id, starts_at)
--   where status in ('held','awaiting_signature','confirmed');

-- Anti-rejeu webhook (cahier §7) : un identifiant prestataire n'apparaît qu'une fois.
create unique index coach_res_payment_id_unique
  on public.coach_reservations (payment_id)
  where payment_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Index de service
-- ─────────────────────────────────────────────────────────────────────────────
create index coach_res_holds_a_expirer on public.coach_reservations (hold_expires_at)
  where status = 'held';

create index coach_res_a_consommer on public.coach_reservations (ends_at)
  where status = 'confirmed';

create index coach_res_actives_par_coach on public.coach_reservations (coach_id)
  where status in ('held','awaiting_signature','confirmed');

create index coach_res_par_coach_date on public.coach_reservations (coach_id, starts_at desc);
create index coach_res_par_club_date  on public.coach_reservations (club_id, starts_at desc);

create index coach_res_grille on public.coach_reservations (club_id, space_id, starts_at)
  where status in ('held','awaiting_signature','confirmed');

-- ─────────────────────────────────────────────────────────────────────────────
-- Normalisation et bornes — pourquoi un TRIGGER et pas un CHECK
--
-- Un CHECK doit être IMMUTABLE pour survivre à un dump/restore et à une
-- reconstruction d'index. `date_trunc(text, timestamptz)` et `timestamptz + interval`
-- dépendent du paramètre TimeZone et sont STABLE : un
-- GENERATED ALWAYS AS (starts_at + interval '1 hour') STORED serait refusé pour
-- la même raison. Le trigger n'a pas cette contrainte.
--
-- Et `capacity` est une DONNÉE modifiable par la direction : un CHECK ne peut pas
-- contenir de sous-requête, donc la borne du siège ne peut pas être un CHECK.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_reservations_normalize()
returns trigger
language plpgsql
set search_path = public, pg_temp          -- lint Supabase 0011 function_search_path_mutable
as $$
declare
  v_capacity smallint;
begin
  -- ends_at est DÉRIVÉ, jamais fourni par l'appelant.
  new.ends_at := new.starts_at + interval '1 hour';

  -- Heure pile murale de Paris (cahier §3.3), en AT TIME ZONE explicite : la règle
  -- ne dépend pas du TimeZone de session, donc pas du client.
  -- Contrôlé à l'insertion, et à la mise à jour uniquement si starts_at bouge :
  -- un cron qui passe un lot en `expired` ne doit pas échouer sur une ligne
  -- historique.
  if tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at then
    if not public.coach_est_heure_pile_paris(new.starts_at) then
      raise exception 'starts_at doit être une heure pile Europe/Paris (reçu %)', new.starts_at
        using errcode = '22007';
    end if;
  end if;

  -- Borne du siège contre la capacité RÉELLE de l'espace.
  -- Idem : on ne revalide que si le siège ou l'espace change. Baisser la capacité
  -- d'un espace ne doit pas rendre inmodifiables les réservations déjà posées —
  -- l'index unique, lui, continue de tenir dans tous les cas.
  if tg_op = 'INSERT'
     or new.seat     is distinct from old.seat
     or new.space_id is distinct from old.space_id
     or new.club_id  is distinct from old.club_id
  then
    select s.capacity into v_capacity
    from public.coach_spaces s
    where s.club_id = new.club_id and s.id = new.space_id;

    if v_capacity is null then
      raise exception 'espace inconnu %/%', new.club_id, new.space_id using errcode = '23503';
    end if;

    if new.seat < 1 or new.seat > v_capacity then
      raise exception 'siège % hors capacité % pour %/%',
        new.seat, v_capacity, new.club_id, new.space_id using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create trigger coach_reservations_normalize_trg
  before insert or update on public.coach_reservations
  for each row execute function public.coach_reservations_normalize();


-- =============================================================================
-- 0005_credits.sql
-- =============================================================================

-- =============================================================================
-- 0005 — coach_credits (avoirs) et bouclage de la FK circulaire
-- =============================================================================
-- Cahier §6 : une annulation à plus de 24 h d'un créneau PAYÉ ne rembourse pas,
-- elle crée un AVOIR. amount_cents est le RESTE disponible (cahier §3.6 : « int (reste) »).
-- Un avoir de 15 € consommé sur un créneau à 10 € laisse donc 5 €.
-- (Lecture à confirmer : le §7 écrit « débiter l'avoir », qui se lit aussi
-- « consommer l'avoir entier ». Voir la question 7 de spec-02 §19.)
-- =============================================================================

create table public.coach_credits (
  id                    uuid primary key default gen_random_uuid(),
  coach_id              uuid not null references public.coach_profiles(id) on delete restrict,

  amount_cents          integer not null check (amount_cents >= 0),          -- le RESTE
  initial_amount_cents  integer not null check (initial_amount_cents > 0),   -- à l'émission

  origin_reservation_id uuid references public.coach_reservations(id) on delete restrict,
  status                public.coach_credit_status not null default 'available',

  -- Aucune règle de durée de validité n'est écrite au contrat. NULL = jamais
  -- expiré. C'est le choix le moins destructeur en attendant l'arbitrage
  -- direction (spec-02 §19 q.6) : on ne peut pas faire réapparaître un avoir
  -- effacé, on peut toujours en poser une date plus tard.
  expires_at            timestamptz,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint coach_credits_reste_coherent
    check (amount_cents <= initial_amount_cents),

  -- Un avoir « disponible » à 0 € n'est pas disponible. Le CHECK force à passer
  -- le statut à `consumed` au moment où on le vide.
  constraint coach_credits_epuise_est_consomme
    check (status <> 'available' or amount_cents > 0)
);

comment on table public.coach_credits is
  'Avoirs. amount_cents = le RESTE disponible, pas le montant d''origine (cahier §3.6).';

create index coach_credits_disponibles on public.coach_credits (coach_id)
  where status = 'available';

-- Un avoir par réservation annulée, pas deux. C'est le filet contre le rejeu
-- d'annulation : même si coach_cancel_reservation était contournée, la base
-- refuserait le second avoir.
create unique index coach_credits_un_par_resa
  on public.coach_credits (origin_reservation_id)
  where origin_reservation_id is not null;

create or replace function public.coach_credits_touch()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger coach_credits_touch_trg
  before update on public.coach_credits
  for each row execute function public.coach_credits_touch();

-- ─────────────────────────────────────────────────────────────────────────────
-- FK circulaire coach_reservations <-> coach_credits : posée maintenant que les
-- deux tables existent. ON DELETE SET NULL parce qu'un avoir purgé ne doit pas
-- faire disparaître la réservation qui l'a produit.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.coach_reservations
  add constraint coach_res_credit_fk
  foreign key (credit_id) references public.coach_credits(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Solde — exposé par GET /me (cahier §5) et consommé par le checkout du lot A (§7).
-- SECURITY DEFINER parce qu'il faut agréger sans dépendre de la RLS de l'appelant ;
-- le paramètre p_coach_id est donc à contrôler par l'appelant (la route ne passe
-- jamais autre chose que l'utilisateur de la session).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_credit_balance(p_coach_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(amount_cents), 0)::int
  from public.coach_credits
  where coach_id = p_coach_id
    and status = 'available'
    and (expires_at is null or expires_at > now());
$$;

revoke execute on function public.coach_credit_balance(uuid) from public, anon;
grant   execute on function public.coach_credit_balance(uuid) to authenticated, service_role;


-- =============================================================================
-- 0006_documents_signatures.sql
-- =============================================================================

-- =============================================================================
-- 0006 — Documents, signatures, jobs Deciplus, bus d'événements
-- =============================================================================
-- Les PDF et les tokens ne transitent JAMAIS par une URL : pdf_path n'est granté
-- à personne (0013 §13.2), le fichier se lit par un flux authentifié du lot A.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Documents contractuels (CGV, règlement intérieur, décharge)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.coach_documents (
  id           uuid primary key default gen_random_uuid(),
  kind         public.coach_document_kind not null,
  title        text not null,
  version      text not null,
  body_path    text not null,                 -- bucket PRIVÉ
  is_current   boolean not null default false,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);

-- Une seule version courante par type de document. L'index partiel rend
-- l'ambiguïté impossible : on ne peut pas se retrouver avec deux CGV « en cours ».
create unique index coach_documents_une_version_courante
  on public.coach_documents (kind)
  where is_current;

-- ─────────────────────────────────────────────────────────────────────────────
-- Signatures — la preuve. pdf_sha256 permet de vérifier qu'un PDF ressorti du
-- bucket est bien celui qui a été signé.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.coach_signatures (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.coach_reservations(id) on delete restrict,
  coach_id       uuid not null references public.coach_profiles(id)     on delete restrict,
  document_id    uuid not null references public.coach_documents(id)    on delete restrict,
  pdf_path       text not null,               -- jamais granté au navigateur
  pdf_sha256     text not null,
  signed_ip      inet,
  user_agent     text,
  signed_at      timestamptz not null default now(),
  constraint coach_signatures_unique unique (reservation_id, document_id)
);

create index coach_signatures_par_resa  on public.coach_signatures (reservation_id);
create index coach_signatures_par_coach on public.coach_signatures (coach_id, signed_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- File d'attente Deciplus (lot A). Le lot C ne fait que produire les lignes ;
-- c'est le lot A qui les consomme et qui gère le retry.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.coach_deciplus_jobs (
  id             uuid primary key default gen_random_uuid(),
  reservation_id uuid references public.coach_reservations(id) on delete restrict,
  coach_id       uuid references public.coach_profiles(id)     on delete restrict,
  action         text not null check (action in ('grant','revoke','revoke_coach')),
  status         public.coach_deciplus_status not null default 'queued',
  attempts       smallint not null default 0,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index coach_deciplus_jobs_a_traiter on public.coach_deciplus_jobs (created_at)
  where status = 'queued';

-- ─────────────────────────────────────────────────────────────────────────────
-- Bus interne — cahier §11. Le lot C produit `reservation.held`,
-- `reservation.cancelled` et `coach.suspended` ; le lot A consomme.
-- Table, pas NOTIFY : un NOTIFY perdu est perdu, une ligne se rejoue.
-- ─────────────────────────────────────────────────────────────────────────────
create table public.coach_events (
  id          bigint generated always as identity primary key,
  topic       text  not null,
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  consumed_at timestamptz,
  attempts    smallint not null default 0,
  last_error  text
);

comment on table public.coach_events is
  'Bus interne (cahier §11). Producteur lot C, consommateur lot A. Aucun secret, aucun token, aucun PAN dans payload.';

create index coach_events_a_consommer on public.coach_events (created_at)
  where consumed_at is null;

create index coach_events_par_topic on public.coach_events (topic, created_at desc);


-- =============================================================================
-- 0007_idempotence.sql
-- =============================================================================

-- =============================================================================
-- 0007 — Idempotence 24 h (spec-04 §4.2)
-- =============================================================================
-- `Idempotency-Key` est obligatoire sur POST /reservations, POST …/checkout et
-- POST …/cancel (cahier §1.2). Conservation 24 h. Test contractuel §13.13 :
-- « clé rejouée → même reservation_id, pas de double hold ».
--
-- LE PIÈGE DE SÉCURITÉ QUE LE CAHIER NE NOMME PAS
-- Si la clé était l'unique identifiant du cache, le coach B qui devine ou
-- intercepte la clé du coach A relirait la RÉPONSE de A — c'est-à-dire une
-- réservation entière qui ne lui appartient pas. IDOR complet, et il contourne
-- le 404 anti-énumération du §1.3.
-- → LA CLÉ PRIMAIRE EST (key, coach_id, endpoint). Une clé rejouée par un autre
--   coach n'est pas un rejeu : c'est une nouvelle requête pour ce coach-là.
--
-- LE PIÈGE DE CORRECTION : le rejeu EN VOL
-- Deux requêtes identiques parties en même temps (double-clic, retry réseau).
-- Un « SELECT … IF NOT FOUND THEN INSERT » les laisse passer toutes les deux et
-- produit deux holds. La séquence correcte est « RÉSERVER D'ABORD » :
--   1. INSERT de la ligne AVANT tout travail, state = 'in_flight'.
--   2. Sur unique_violation, Postgres a fait attendre le second INSERT jusqu'au
--      COMMIT/ROLLBACK du premier :
--        — premier commité  → on relit et on renvoie response_body TEL QUEL ;
--        — premier échoué   → sa ligne est partie au ROLLBACK, on prend la main.
--   3. À la fin, UPDATE avec la réponse et state = 'completed'.
--   4. SUR REFUS MÉTIER, on SUPPRIME la ligne : un SLOT_FULL à 14h02 ne doit pas
--      être figé 24 h alors qu'un siège peut se libérer à 14h03. Seules les
--      réussites sont mémorisées.
--
-- LE BAIL (lease_until) — indispensable en serverless
-- Une fonction Vercel peut être tuée entre l'INSERT et l'UPDATE final. Sans bail,
-- la clé reste `in_flight` pour toujours et le coach ne peut plus jamais réserver
-- avec cette clé. Avec bail, la requête suivante reprend la main par CAS optimiste.
-- =============================================================================

create type public.coach_idem_state as enum ('in_flight', 'completed');

create table public.coach_idempotency_keys (
  -- Le contrat impose un UUID v4 (cahier §1.2). On type la colonne en `uuid`
  -- plutôt qu'en `text` : la base refuse alors une clé malformée, et les
  -- fonctions RPC reçoivent un uuid sans transtypage hasardeux.
  key             uuid not null,
  coach_id        uuid not null references public.coach_profiles(id) on delete cascade,
  endpoint        text not null,          -- 'POST /reservations', 'POST /reservations/:id/cancel'

  -- Empreinte du corps. Côté route TypeScript : sha256 du corps BRUT, jamais
  -- sha256(JSON.stringify(JSON.parse(x))) — l'ordre des clés, les espaces, les
  -- échappements unicode et la notation des nombres changent au aller-retour.
  -- Côté RPC : md5 des arguments normalisés, calculé par la fonction elle-même.
  request_hash    text not null,

  state           public.coach_idem_state not null default 'in_flight',
  response_status smallint,
  response_body   jsonb,

  lease_until     timestamptz not null default now() + interval '60 seconds',
  completed_at    timestamptz,
  expires_at      timestamptz not null default now() + interval '24 hours',
  created_at      timestamptz not null default now(),

  primary key (key, coach_id, endpoint),

  -- Une ligne terminée porte sa réponse ; une ligne en vol n'en a pas.
  constraint coach_idem_etat_coherent
    check ((state = 'completed') = (response_body is not null))
);

comment on table public.coach_idempotency_keys is
  'Idempotence 24 h. PK (key, coach_id, endpoint) : une clé rejouée par un AUTRE coach ne lui rend jamais la réponse du premier (spec-04 §4.1).';

comment on column public.coach_idempotency_keys.lease_until is
  'Bail de 60 s. Une fonction serverless tuée en vol ne bloque pas la clé pour toujours.';

create index coach_idem_purge on public.coach_idempotency_keys (expires_at);

-- Personne côté navigateur. Ni lecture, ni écriture, ni pour la direction.
revoke all on table public.coach_idempotency_keys from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Libération sur refus métier. Ne touche QUE les lignes en vol : une réponse
-- déjà mémorisée est immuable pendant 24 h, c'est tout l'intérêt.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_idem_release(
  p_key      uuid,
  p_coach    uuid,
  p_endpoint text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.coach_idempotency_keys
  where key = p_key
    and coach_id = p_coach
    and endpoint = p_endpoint
    and state = 'in_flight';
$$;

comment on function public.coach_idem_release(uuid, uuid, text) is
  'Supprime la réservation de clé sur refus métier. Seules les réussites restent mémorisées 24 h.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Clôture. Un seul endroit qui pose state + response_* + completed_at, pour que
-- le CHECK de cohérence ne puisse pas être contourné par distraction.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_idem_complete(
  p_key      uuid,
  p_coach    uuid,
  p_endpoint text,
  p_body     jsonb,
  p_status   smallint
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.coach_idempotency_keys
  set state           = 'completed',
      response_body   = p_body,
      response_status = p_status,
      completed_at    = now()
  where key = p_key
    and coach_id = p_coach
    and endpoint = p_endpoint;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Purge — appelée par le cron (0012) et par un cron Vercel de secours.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_idem_purge()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  delete from public.coach_idempotency_keys where expires_at < now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.coach_idem_release(uuid, uuid, text)          from public, anon, authenticated;
revoke execute on function public.coach_idem_complete(uuid, uuid, text, jsonb, smallint) from public, anon, authenticated;
revoke execute on function public.coach_idem_purge()                            from public, anon, authenticated;
grant  execute on function public.coach_idem_release(uuid, uuid, text)          to service_role;
grant  execute on function public.coach_idem_complete(uuid, uuid, text, jsonb, smallint) to service_role;
grant  execute on function public.coach_idem_purge()                            to service_role;


-- =============================================================================
-- 0008_rate_limit.sql
-- =============================================================================

-- =============================================================================
-- 0008 — Rate limit, fenêtre glissante en Postgres (spec-04 §3.4)
-- =============================================================================
-- POURQUOI PAS UN Map() EN MÉMOIRE (le modèle repris d'AMAZ) — deux défauts :
--   1. la mémoire ne survit pas. Un `const store = new Map()` vit dans UNE
--      instance de fonction Vercel. Cold start, scale-out : le compteur repart à
--      zéro. « 5/min » devient « 5/min par instance », c'est-à-dire aucune limite.
--   2. pire : `listeNoire.push(ip)` = bannissement DÉFINITIF, sans TTL. Le wifi
--      du club des Minimes, c'est UNE IP publique pour tous les coachs présents.
--      Un coach qui rafraîchit sa grille un peu vite bannit tout le club jusqu'au
--      prochain déploiement. Ce comportement est supprimé, pas porté.
--
-- POURQUOI POSTGRES ET PAS REDIS / @vercel/firewall :
--   — aucun service de plus à facturer ni à surveiller, Supabase est déjà là ;
--   — toutes les régions tapent la MÊME base, donc la limite est exacte
--     (le WAF Vercel compte par région, Upstash déconseille slidingWindow en
--     multi-région) ;
--   — les dépassements sont directement joignables à coach_audit_logs.
-- RATE_LIMIT_REDIS_URL reste dans .env.example comme échappatoire : le jour où la
-- charge le justifie, seule l'implémentation derrière checkRateLimit() change.
-- =============================================================================

create table if not exists public.coach_rate_limit_hits (
  id      bigserial   primary key,
  bucket  text        not null,
  hit_at  timestamptz not null default now()
);

comment on table public.coach_rate_limit_hits is
  'Compteur de fenêtre glissante. AUCUNE donnée personnelle : bucket = route + IP hachée, ou route + coach_id.';

-- L'index qui porte à la fois la fenêtre glissante et le DELETE de purge.
create index if not exists coach_rate_limit_hits_bucket_time_idx
  on public.coach_rate_limit_hits (bucket, hit_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Clé d'advisory lock dérivée d'un texte, avec des fonctions DOCUMENTÉES
-- (md5 + cast bit(64) -> bigint). On évite volontairement hashtext() /
-- hashtextextended(), absentes du manuel PostgreSQL.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_bucket_lock_key(p_bucket text)
returns bigint
language sql
immutable
parallel safe
as $$
  select ('x' || substr(md5(p_bucket), 1, 16))::bit(64)::bigint;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérifie ET consomme N buckets de façon atomique.
--
-- Sémantique TOUT OU RIEN : si un seul bucket dépasse, AUCUN jeton n'est
-- consommé. C'est ce qui permet de limiter par IP **et** par coach_id
-- (cahier §1.5) sans qu'un refus sur une dimension ne brûle un jeton sur l'autre.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_rate_limit_check(
  p_buckets  text[],
  p_limit    int,
  p_window_s int
)
returns table (allowed boolean, remaining int, retry_after_s int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz := now() - make_interval(secs => p_window_s);
  v_bucket       text;
  v_count        int;
  v_oldest       timestamptz;
  v_worst_retry  int := 0;
  v_min_remain   int := p_limit;
  v_denied       boolean := false;
begin
  if p_buckets is null or array_length(p_buckets, 1) is null then
    raise exception 'coach_rate_limit_check: p_buckets vide';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'coach_rate_limit_check: p_limit invalide (%)', p_limit;
  end if;
  if p_window_s is null or p_window_s < 1 then
    raise exception 'coach_rate_limit_check: p_window_s invalide (%)', p_window_s;
  end if;

  -- Verrous pris dans un ORDRE STABLE (tri alphabétique) : deux requêtes qui
  -- partagent deux buckets ne peuvent pas former de cycle. pg_advisory_xact_lock
  -- se relâche à la fin de la transaction, sans action explicite.
  for v_bucket in select distinct b from unnest(p_buckets) as t(b) order by b loop
    perform pg_advisory_xact_lock(public.coach_bucket_lock_key(v_bucket));
  end loop;

  -- Purge ciblée : garde la table petite sans job séparé sur les buckets actifs.
  delete from public.coach_rate_limit_hits
   where bucket = any(p_buckets)
     and hit_at < v_window_start;

  -- Phase 1 : on REGARDE, on ne consomme rien.
  foreach v_bucket in array p_buckets loop
    select count(*), min(hit_at)
      into v_count, v_oldest
      from public.coach_rate_limit_hits
     where bucket = v_bucket
       and hit_at >= v_window_start;

    if v_count >= p_limit then
      v_denied := true;
      v_worst_retry := greatest(
        v_worst_retry,
        greatest(1, ceil(extract(epoch from
          (v_oldest + make_interval(secs => p_window_s)) - now()
        ))::int)
      );
    else
      v_min_remain := least(v_min_remain, p_limit - v_count - 1);
    end if;
  end loop;

  if v_denied then
    allowed := false; remaining := 0; retry_after_s := v_worst_retry;
    return next;
    return;
  end if;

  -- Phase 2 : tout est vert, on consomme sur TOUTES les dimensions.
  insert into public.coach_rate_limit_hits (bucket)
  select unnest(p_buckets);

  allowed := true; remaining := v_min_remain; retry_after_s := 0;
  return next;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Purge des buckets abandonnés : un visiteur qui ne revient pas laisse ses lignes.
-- 2 h couvrent la plus longue fenêtre du cahier §1.5 (POST /contact : 5/h).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_rate_limit_purge()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  delete from public.coach_rate_limit_hits where hit_at < now() - interval '2 hours';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Personne d'autre que le serveur n'appelle ça.
revoke all on table public.coach_rate_limit_hits from public, anon, authenticated;
revoke all on function public.coach_rate_limit_check(text[], int, int) from public, anon, authenticated;
revoke all on function public.coach_rate_limit_purge()                 from public, anon, authenticated;
grant execute on function public.coach_rate_limit_check(text[], int, int) to service_role;
grant execute on function public.coach_rate_limit_purge()                 to service_role;

-- bigserial crée une séquence : sans ce revoke, anon pourrait la consommer.
revoke all on sequence public.coach_rate_limit_hits_id_seq from public, anon, authenticated;


-- =============================================================================
-- 0009_audit.sql
-- =============================================================================

-- =============================================================================
-- 0009 — coach_audit_logs, append-only
-- =============================================================================
-- « Append-only » veut dire : personne ne réécrit l'histoire. Pas le coach, pas
-- le manager, pas la direction, pas le propriétaire de la table.
--
-- QUATRE MURS SUPERPOSÉS, du plus faible au plus fort :
--   1. REVOKE des privilèges de mutation pour les rôles d'API ;
--   2. RLS activée SANS aucune policy UPDATE/DELETE — « If enabled and no
--      policies exist for the table, then a default-deny policy is applied » ;
--   3. FORCE ROW LEVEL SECURITY — sans elle, « row-level security will not be
--      applied when the user is the table owner ». Le propriétaire sur Supabase
--      est `postgres` : sans FORCE, toute la RLS de ce lot est contournée dès
--      qu'on se connecte en postgres ;
--   4. des TRIGGERS — le seul mur qui vaut AUSSI pour le propriétaire.
--
-- LIMITE ÉNONCÉE HONNÊTEMENT : un superutilisateur peut faire
-- ALTER TABLE … DISABLE TRIGGER. Aucun dispositif interne à Postgres n'y résiste.
-- Au-delà de ce point, ce qui fait foi ce sont les journaux Supabase et la
-- rotation des accès service_role. On ne promet pas plus que ça.
-- =============================================================================

create table public.coach_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  role        text,
  action      text not null,
  club_id     text,
  target_type text,
  target_id   text,
  -- meta : JAMAIS de PAN, JAMAIS de token QR, JAMAIS de secret, JAMAIS de
  -- chemin de PDF signé (cahier §3.8 et spec-04 §10).
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.coach_audit_logs is
  'Journal d''audit append-only. Ni UPDATE, ni DELETE, ni TRUNCATE — y compris pour la direction et le propriétaire.';

comment on column public.coach_audit_logs.meta is
  'Aucune donnée de paiement, aucun token, aucun secret, aucun chemin de PDF. Seulement de quoi rejouer une décision.';

create index coach_audit_par_club  on public.coach_audit_logs (club_id, created_at desc);
create index coach_audit_par_cible on public.coach_audit_logs (target_type, target_id, created_at desc);
create index coach_audit_par_acteur on public.coach_audit_logs (actor_id, created_at desc);

-- ── Mur 1 : privilèges ───────────────────────────────────────────────────────
revoke update, delete, truncate on public.coach_audit_logs from anon, authenticated, service_role;
grant  insert, select           on public.coach_audit_logs to   service_role;

-- ── Mur 2 et 3 : RLS activée et FORCÉE ──────────────────────────────────────
alter table public.coach_audit_logs enable row level security;
alter table public.coach_audit_logs force  row level security;

-- ── Mur 4 : les triggers ────────────────────────────────────────────────────
create or replace function public.coach_audit_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'coach_audit_logs est append-only (tentative de %)', tg_op
    using errcode = '42501';
end;
$$;

create trigger coach_audit_no_update
  before update on public.coach_audit_logs
  for each row execute function public.coach_audit_append_only();

create trigger coach_audit_no_delete
  before delete on public.coach_audit_logs
  for each row execute function public.coach_audit_append_only();

-- TRUNCATE ne déclenche AUCUN trigger de ligne : c'est le trou classique, et
-- c'est exactement la commande qu'on utiliserait pour effacer des traces.
create trigger coach_audit_no_truncate
  before truncate on public.coach_audit_logs
  for each statement execute function public.coach_audit_append_only();


-- =============================================================================
-- 0010_fonction_hold.sql
-- =============================================================================

-- =============================================================================
-- 0010 — coach_create_hold : POST /reservations, en UNE transaction
-- =============================================================================
-- POURQUOI UNE SEULE FONCTION ET PAS DU TYPESCRIPT
-- PostgREST ne donne pas de transaction multi-instructions. Or la création du
-- hold et la clôture de la clé d'idempotence DOIVENT être dans la même
-- transaction : sinon le hold est créé, la fonction meurt, la clé reste
-- `in_flight`, le coach rejoue, et au bout de 60 s de bail il crée un DEUXIÈME
-- hold. Exactement ce que le test contractuel §13.13 interdit.
--
-- ORDRE DE VERROUILLAGE — RÈGLE ABSOLUE DU LOT C, jamais un autre ordre :
--   1. coach_profiles du coach (FOR UPDATE) — sérialise les holds D'UN MÊME
--      coach, ce qui rend la limite de 3 actives réellement atomique. Un simple
--      count(*) ne l'est pas : quatre requêtes parallèles verraient toutes
--      « 3 < 3 » si personne ne sérialise.
--   2. le verrou consultatif du créneau.
--   3. la ligne coach_reservations s'il y a lieu (cas de l'annulation, 0011).
-- Deux coachs différents sur le même créneau ne peuvent pas former de cycle :
-- chacun prend d'abord SON profil, puis attend le même verrou consultatif.
--
-- LE COACH EST TOUJOURS auth.uid(), JAMAIS UN PARAMÈTRE. Sinon n'importe quel
-- coach réserverait au nom d'un autre et la limite de 3 deviendrait décorative.
--
-- LE PRIX EST CALCULÉ ICI, côté serveur, depuis coach_tariffs. Aucun paramètre
-- client ne peut l'influencer.
-- =============================================================================

create or replace function public.coach_create_hold(
  p_club_id         text,
  p_space_id        text,
  p_starts_at       timestamptz,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer                    -- indispensable : compter les résas des AUTRES coachs
set search_path = public, pg_temp   -- lint Supabase 0011 function_search_path_mutable
as $fn$
declare
  c_endpoint constant text := 'POST /reservations';
  v_coach       uuid := auth.uid();
  v_profil      public.coach_profiles%rowtype;
  v_space       public.coach_spaces%rowtype;
  v_local       timestamp;
  v_isodow      int;
  v_hour        int;
  v_kind        public.coach_tariff_kind;
  v_amount      int;
  v_ttl         int;
  v_max_active  int;
  v_actives     int;
  v_taken       int;
  v_seat        smallint;
  v_hash        text;
  v_hash_stocke text;
  v_state       public.coach_idem_state;
  v_lease       timestamptz;
  v_stored      jsonb;
  v_res         public.coach_reservations%rowtype;
  v_body        jsonb;
begin
  if v_coach is null then
    return public.coach_err('UNAUTHENTICATED', 'Session requise.');
  end if;
  if p_idempotency_key is null then
    return public.coach_err('VALIDATION_ERROR', 'Idempotency-Key obligatoire.');
  end if;

  -- ══════════════════════════════════════════ verrou 1 : LE COACH, EN PREMIER
  -- CE VERROU DOIT ÊTRE PRIS AVANT L'INSERT D'IDEMPOTENCE, et ce n'est pas un
  -- détail de style : c'est la correction d'un INTERBLOCAGE REPRODUCTIBLE.
  --
  -- coach_idempotency_keys.coach_id porte une clé étrangère vers coach_profiles.
  -- Un INSERT dans cette table prend donc un FOR KEY SHARE (verrou PARTAGÉ) sur la
  -- ligne de profil, pour empêcher qu'on la supprime sous ses pieds. Si l'INSERT
  -- vient en premier, la séquence devient :
  --     1. les N requêtes du MÊME coach prennent toutes le KEY SHARE (compatible
  --        entre elles : elles l'obtiennent toutes) ;
  --     2. chacune demande ensuite FOR UPDATE, un verrou EXCLUSIF sur la même
  --        ligne — donc chacune attend que TOUTES les autres finissent.
  -- C'est une montée en verrou circulaire : quatre holds parallèles d'un même
  -- coach se terminaient en « deadlock detected », donc en 500, au lieu de
  -- produire trois succès et un ACTIVE_LIMIT.
  --
  -- En prenant le FOR UPDATE d'abord, la transaction détient déjà le verrou le
  -- plus fort : le KEY SHARE de l'INSERT est absorbé, il n'y a plus de montée,
  -- et les requêtes d'un même coach se sérialisent proprement. C'est d'ailleurs
  -- l'ordre de verrouillage annoncé en tête de ce fichier — l'INSERT
  -- d'idempotence le violait sans le dire.
  select * into v_profil from public.coach_profiles where id = v_coach for update;

  if not found or v_profil.deleted_at is not null then
    -- Rien n'a encore été écrit : il n'y a aucune clé à libérer.
    return public.coach_err('NOT_FOUND', 'Profil introuvable.');
  end if;

  -- ══════════════════════════════════════════ idempotence : RÉSERVER D'ABORD
  -- On pose la clé AVANT tout TRAVAIL. Le rejeu dangereux n'est pas celui d'après
  -- la réponse, c'est le rejeu EN VOL (double-clic, retry réseau).
  v_hash := md5(coalesce(p_club_id,'') || '|' || coalesce(p_space_id,'') || '|'
                || coalesce(to_char(p_starts_at at time zone 'UTC',
                                    'YYYY-MM-DD"T"HH24:MI:SS'), ''));
  begin
    insert into public.coach_idempotency_keys (key, coach_id, endpoint, request_hash)
    values (p_idempotency_key, v_coach, c_endpoint, v_hash);

  exception when unique_violation then
    -- On arrive ici APRÈS avoir attendu la transaction concurrente sur l'index
    -- unique : la ligne est donc commitée et visible.
    select i.response_body, i.request_hash, i.state, i.lease_until
      into v_stored, v_hash_stocke, v_state, v_lease
    from public.coach_idempotency_keys i
    where i.key = p_idempotency_key
      and i.coach_id = v_coach
      and i.endpoint = c_endpoint;

    if not found then
      return public.coach_err('CONFLICT', 'Requête identique déjà en cours.',
        jsonb_build_object('reason', 'idempotency_race', 'retry_after_s', 1));

    elsif v_state = 'completed' then
      -- Même clé, corps DIFFÉRENT : le contrat n'a pas de code dédié (§19 q.8).
      -- CONFLICT + details.reason, plutôt que d'inventer un code hors enum.
      if v_hash_stocke is distinct from v_hash then
        return public.coach_err('CONFLICT',
          'Cette clé d''idempotence a déjà été utilisée avec un autre contenu.',
          jsonb_build_object('reason', 'idempotency_key_reuse'));
      end if;
      -- Rejeu légitime : la réponse mémorisée, TELLE QUELLE.
      -- Même reservation_id, aucun second hold.
      return v_stored;

    elsif v_lease > now() then
      -- Une autre requête détient le bail. On ne fait pas attendre : en
      -- serverless, attendre c'est payer, et une fonction bloquée peut être tuée
      -- en laissant la ligne `in_flight`.
      return public.coach_err('CONFLICT', 'Requête identique déjà en cours.',
        jsonb_build_object('reason', 'idempotency_in_flight', 'retry_after_s', 1));

    else
      -- Bail expiré : la fonction précédente est morte en vol. Reprise par CAS
      -- optimiste — si un autre nous double, il a la ligne, pas nous.
      update public.coach_idempotency_keys
      set lease_until  = now() + interval '60 seconds',
          request_hash = v_hash
      where key = p_idempotency_key
        and coach_id = v_coach
        and endpoint = c_endpoint
        and state = 'in_flight'
        and lease_until = v_lease;

      if not found then
        return public.coach_err('CONFLICT', 'Requête identique déjà en cours.',
          jsonb_build_object('reason', 'idempotency_in_flight', 'retry_after_s', 1));
      end if;
      -- Bail repris : on continue le traitement normal.
    end if;
  end;

  -- ══════════════════════════════════════════ suspension
  -- Contrôlée APRÈS la réservation de clé, et volontairement : un rejeu d'une clé
  -- déjà close doit rendre la réponse mémorisée à l'identique, même si le coach a
  -- été suspendu entre-temps. Sinon la même clé renverrait deux réponses
  -- différentes selon le moment, ce qui n'est plus de l'idempotence.
  --
  -- SUSPENDED se lit EN BASE, pas dans le JWT : un jeton émis avant la
  -- suspension reste valide jusqu'à une heure (test contractuel §13.12).
  if v_profil.status <> 'active' or v_profil.suspended_at is not null then
    perform public.coach_idem_release(p_idempotency_key, v_coach, c_endpoint);
    return public.coach_err('SUSPENDED', 'Compte suspendu.',
      jsonb_build_object('reason', v_profil.suspended_reason));
  end if;

  -- ══════════════════════════════════════════ validation du créneau
  if p_starts_at is null or p_starts_at <= now() then
    perform public.coach_idem_release(p_idempotency_key, v_coach, c_endpoint);
    return public.coach_err('VALIDATION_ERROR', 'Créneau dans le passé.');
  end if;

  -- Heure murale de Paris, EXPLICITEMENT. Jamais le TimeZone de session.
  v_local  := p_starts_at at time zone 'Europe/Paris';
  v_isodow := public.coach_isodow_paris(p_starts_at);
  v_hour   := public.coach_hour_paris(p_starts_at);

  if v_local <> date_trunc('hour', v_local) then
    perform public.coach_idem_release(p_idempotency_key, v_coach, c_endpoint);
    return public.coach_err('VALIDATION_ERROR', 'Les créneaux sont à l''heure pile.');
  end if;

  if v_isodow = 7 then
    perform public.coach_idem_release(p_idempotency_key, v_coach, c_endpoint);
    return public.coach_err('VALIDATION_ERROR', 'Fermé le dimanche.');
  end if;

  -- 10h..18h en heure de DÉBUT : le dernier créneau commence à 18h et finit à 19h.
  if v_hour < 10 or v_hour > 18 then
    perform public.coach_idem_release(p_idempotency_key, v_coach, c_endpoint);
    return public.coach_err('VALIDATION_ERROR', 'Hors des horaires 10h–19h.');
  end if;

  -- ══════════════════════════════════════════ espace (404, anti-énumération)
  select * into v_space from public.coach_spaces
  where club_id = p_club_id and id = p_space_id and is_active;

  if not found then
    perform public.coach_idem_release(p_idempotency_key, v_coach, c_endpoint);
    return public.coach_err('NOT_FOUND', 'Espace introuvable.');
  end if;

  -- Le créneau existe-t-il au planning type ?
  if not exists (
    select 1 from public.coach_slot_templates t
    where t.club_id = p_club_id and t.space_id = p_space_id
      and t.isodow = v_isodow and t.start_hour = v_hour and t.is_active
  ) then
    perform public.coach_idem_release(p_idempotency_key, v_coach, c_endpoint);
    return public.coach_err('NOT_FOUND', 'Ce créneau n''existe pas pour cet espace.');
  end if;

  -- ══════════════════════════════════════════ blocages (éducative + back-office)
  if exists (
        select 1 from public.coach_slot_block_rules r
        where r.club_id = p_club_id and r.space_id = p_space_id
          and r.isodow = v_isodow and r.start_hour = v_hour and r.is_active)
     or exists (
        select 1 from public.coach_slot_blocks b
        where b.club_id = p_club_id and b.space_id = p_space_id
          and b.starts_at = p_starts_at)
  then
    perform public.coach_idem_release(p_idempotency_key, v_coach, c_endpoint);
    return public.coach_err('SLOT_BLOCKED', 'Ce créneau est réservé à la boxe éducative.',
      jsonb_build_object('space_id', p_space_id, 'starts_at', p_starts_at));
  end if;

  -- ══════════════════════════════════════════ tarif : SERVEUR, jamais le client
  select th.kind, tf.amount_cents into v_kind, v_amount
  from public.coach_tariff_hours th
  join public.coach_tariffs tf on tf.kind = th.kind
  where th.start_hour = v_hour;

  if v_amount is null then
    perform public.coach_idem_release(p_idempotency_key, v_coach, c_endpoint);
    return public.coach_err('VALIDATION_ERROR', 'Aucun tarif défini pour cette heure.');
  end if;

  -- ══════════════════════════════════════════ limite de réservations actives
  select (value #>> '{}')::int into v_max_active
  from public.coach_settings where key = 'max_active_reservations';
  v_max_active := coalesce(v_max_active, 3);

  select count(*) into v_actives
  from public.coach_reservations
  where coach_id = v_coach
    and status in ('held','awaiting_signature','confirmed');

  if v_actives >= v_max_active then
    perform public.coach_idem_release(p_idempotency_key, v_coach, c_endpoint);
    return public.coach_err('ACTIVE_LIMIT',
      format('Vous avez déjà %s réservations en cours.', v_actives),
      jsonb_build_object('active', v_actives, 'max', v_max_active));
  end if;

  -- ══════════════════════════════════════════ verrou 2 : le créneau
  -- Les créneaux sont VIRTUELS : aucune ligne à verrouiller avec SELECT … FOR UPDATE.
  -- Le verrou consultatif de transaction crée le point de rendez-vous qui manque,
  -- et il se relâche tout seul au COMMIT comme au ROLLBACK.
  perform pg_advisory_xact_lock(
    v_space.lock_key,
    (extract(epoch from p_starts_at) / 3600)::int
  );

  select count(*) into v_taken
  from public.coach_reservations
  where club_id = p_club_id and space_id = p_space_id and starts_at = p_starts_at
    and status in ('held','awaiting_signature','confirmed');

  if v_taken >= v_space.capacity then
    perform public.coach_idem_release(p_idempotency_key, v_coach, c_endpoint);
    return public.coach_err('SLOT_FULL',
      format('Ce créneau est complet (%s coachs).', v_space.capacity),
      jsonb_build_object('space_id', p_space_id, 'starts_at', p_starts_at,
                         'capacity', v_space.capacity, 'taken', v_taken));
  end if;

  -- Plus petit siège libre. SOUS LE VERROU, ce calcul est exact.
  select g.n::smallint into v_seat
  from generate_series(1, v_space.capacity) as g(n)
  where not exists (
    select 1 from public.coach_reservations r
    where r.club_id = p_club_id and r.space_id = p_space_id
      and r.starts_at = p_starts_at and r.seat = g.n
      and r.status in ('held','awaiting_signature','confirmed'))
  order by g.n
  limit 1;

  if v_seat is null then
    -- Ne peut pas arriver : v_taken < capacity garantit un siège libre. Si ça
    -- arrive, une ligne active porte un siège hors bornes — donc un écrivain a
    -- contourné cette fonction.
    perform public.coach_idem_release(p_idempotency_key, v_coach, c_endpoint);
    return public.coach_err('SLOT_FULL', 'Ce créneau est complet.',
      jsonb_build_object('space_id', p_space_id, 'starts_at', p_starts_at));
  end if;

  -- ══════════════════════════════════════════ insertion
  select (value #>> '{}')::int into v_ttl
  from public.coach_settings where key = 'hold_ttl_seconds';
  v_ttl := coalesce(v_ttl, 600);

  begin
    insert into public.coach_reservations
      (coach_id, club_id, space_id, starts_at, ends_at, seat, amount_cents,
       status, hold_expires_at, idempotency_key)
    values
      (v_coach, p_club_id, p_space_id, p_starts_at, p_starts_at + interval '1 hour',
       v_seat, v_amount, 'held', now() + make_interval(secs => v_ttl), p_idempotency_key)
    returning * into v_res;

  exception when unique_violation then
    -- FILET. Sous le verrou consultatif ceci ne devrait jamais se déclencher :
    -- si ça arrive, c'est qu'un écrivain a contourné coach_create_hold et que
    -- l'index a fait son travail de dernier mur.
    perform public.coach_idem_release(p_idempotency_key, v_coach, c_endpoint);
    if position('un_coach_par_creneau' in coalesce(sqlerrm,'')) > 0 then
      return public.coach_err('CONFLICT', 'Vous avez déjà une réservation sur ce créneau.',
        jsonb_build_object('space_id', p_space_id, 'starts_at', p_starts_at));
    end if;
    return public.coach_err('SLOT_FULL', 'Ce créneau est complet.',
      jsonb_build_object('space_id', p_space_id, 'starts_at', p_starts_at));
  end;

  -- ══════════════════════════════════════════ audit + événement + réponse
  insert into public.coach_audit_logs (actor_id, role, action, club_id, target_type, target_id, meta)
  values (v_coach, 'coach', 'reservation.held', p_club_id, 'reservation', v_res.id::text,
          jsonb_build_object('amount_cents', v_amount, 'seat', v_seat, 'tariff', v_kind));

  insert into public.coach_events (topic, payload)
  values ('reservation.held',
          jsonb_build_object('reservation_id', v_res.id, 'coach_id', v_coach,
                             'club_id', v_res.club_id, 'space_id', v_res.space_id,
                             'starts_at', v_res.starts_at));

  v_body := jsonb_build_object(
    'ok', true,
    'reservation', jsonb_build_object(
      'id',               v_res.id,
      'status',           v_res.status,
      'club_id',          v_res.club_id,
      'space_id',         v_res.space_id,
      'starts_at',        v_res.starts_at,
      'ends_at',          v_res.ends_at,
      'amount_cents',     v_res.amount_cents,
      'currency',         v_res.currency,
      'hold_expires_at',  v_res.hold_expires_at,
      'payment_status',   v_res.payment_status,
      'signature_status', v_res.signature_status
    ));

  -- Clôture de la clé dans LA MÊME transaction que l'INSERT du hold.
  -- Ne jamais mémoriser ici : token QR, chemin de PDF signé, deciplus_member_id.
  perform public.coach_idem_complete(p_idempotency_key, v_coach, c_endpoint, v_body, 201::smallint);

  return v_body;
end;
$fn$;

comment on function public.coach_create_hold(text, text, timestamptz, uuid) is
  'POST /reservations. Retourne {ok:true, reservation:{…}} ou {ok:false, error:{code,message,details}} — ne RAISE jamais pour un refus métier.';

revoke execute on function public.coach_create_hold(text, text, timestamptz, uuid) from public, anon;
grant   execute on function public.coach_create_hold(text, text, timestamptz, uuid) to authenticated, service_role;


-- =============================================================================
-- 0011_fonction_cancel.sql
-- =============================================================================

-- =============================================================================
-- 0011 — coach_cancel_reservation : POST /reservations/:id/cancel
-- =============================================================================
-- Cahier §6 :
--   — un `held` non payé se libère SANS avoir ;
--   — un créneau payé annulé à plus de 24 h donne un AVOIR, pas un remboursement ;
--   — à moins de 24 h, CANCEL_TOO_LATE ;
--   — le manager n'annule pas : propriétaire ou direction seulement.
--
-- ANTI-ÉNUMÉRATION : hors périmètre ⇒ 404, JAMAIS 403 (cahier §1.3). Un 403 dirait
-- « cette réservation existe mais elle n'est pas à vous », ce qui est déjà une fuite.
--
-- LA RÈGLE DES 24 H EST UNE DURÉE ABSOLUE : deux timestamptz, aucun fuseau
-- n'intervient. Aux changements d'heure (fin octobre, fin mars) « 24 h absolues »
-- et « 24 h d'horloge murale » diffèrent d'une heure ; l'absolu est le
-- comportement qui ne surprend personne en dehors de deux nuits par an.
-- =============================================================================

create or replace function public.coach_cancel_reservation(
  p_reservation_id  uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  c_endpoint constant text := 'POST /reservations/:id/cancel';
  v_actor         uuid := auth.uid();
  v_role          text := public.coach_role();
  v_res           public.coach_reservations%rowtype;
  v_statut_avant  public.coach_reservation_status;
  v_profil        public.coach_profiles%rowtype;
  v_min_hours     int;
  v_credit        public.coach_credits%rowtype;
  v_hash          text;
  v_hash_stocke   text;
  v_state         public.coach_idem_state;
  v_lease         timestamptz;
  v_stored        jsonb;
  v_body          jsonb;
begin
  if v_actor is null then
    return public.coach_err('UNAUTHENTICATED', 'Session requise.');
  end if;
  if p_idempotency_key is null then
    return public.coach_err('VALIDATION_ERROR', 'Idempotency-Key obligatoire.');
  end if;
  if p_reservation_id is null then
    return public.coach_err('VALIDATION_ERROR', 'Identifiant de réservation manquant.');
  end if;

  -- ══════════════════════════════════════════ idempotence (même motif qu'en 0010)
  v_hash := md5(p_reservation_id::text);
  begin
    insert into public.coach_idempotency_keys (key, coach_id, endpoint, request_hash)
    values (p_idempotency_key, v_actor, c_endpoint, v_hash);

  exception when unique_violation then
    select i.response_body, i.request_hash, i.state, i.lease_until
      into v_stored, v_hash_stocke, v_state, v_lease
    from public.coach_idempotency_keys i
    where i.key = p_idempotency_key
      and i.coach_id = v_actor
      and i.endpoint = c_endpoint;

    if not found then
      return public.coach_err('CONFLICT', 'Requête identique déjà en cours.',
        jsonb_build_object('reason', 'idempotency_race', 'retry_after_s', 1));

    elsif v_state = 'completed' then
      if v_hash_stocke is distinct from v_hash then
        return public.coach_err('CONFLICT',
          'Cette clé d''idempotence a déjà été utilisée avec un autre contenu.',
          jsonb_build_object('reason', 'idempotency_key_reuse'));
      end if;
      return v_stored;

    elsif v_lease > now() then
      return public.coach_err('CONFLICT', 'Requête identique déjà en cours.',
        jsonb_build_object('reason', 'idempotency_in_flight', 'retry_after_s', 1));

    else
      update public.coach_idempotency_keys
      set lease_until  = now() + interval '60 seconds',
          request_hash = v_hash
      where key = p_idempotency_key
        and coach_id = v_actor
        and endpoint = c_endpoint
        and state = 'in_flight'
        and lease_until = v_lease;

      if not found then
        return public.coach_err('CONFLICT', 'Requête identique déjà en cours.',
          jsonb_build_object('reason', 'idempotency_in_flight', 'retry_after_s', 1));
      end if;
    end if;
  end;

  -- ══════════════════════════════════════════ verrou : la ligne
  -- Empêche deux annulations simultanées de créer deux avoirs.
  --
  -- NE JAMAIS AJOUTER « for update » AU SELECT SUR coach_profiles PLUS BAS.
  -- L'INSERT d'idempotence ci-dessus a déjà pris un FOR KEY SHARE (partagé) sur
  -- la ligne de profil, via la clé étrangère coach_idempotency_keys.coach_id.
  -- Demander ensuite un FOR UPDATE sur cette même ligne serait une MONTÉE EN
  -- VERROU : N annulations parallèles du même coach détiendraient toutes le
  -- verrou partagé et attendraient toutes les autres — interblocage garanti.
  -- C'est exactement le défaut corrigé dans 0010 en remontant le FOR UPDATE
  -- avant l'INSERT. Ici, l'annulation n'a pas besoin de sérialiser le coach :
  -- c'est la LIGNE DE RÉSERVATION qui porte l'unicité de l'avoir, et l'index
  -- coach_credits_un_par_resa est le filet.
  select * into v_res from public.coach_reservations
  where id = p_reservation_id
  for update;

  if not found
     or (v_role is distinct from 'direction' and v_res.coach_id <> v_actor)
  then
    perform public.coach_idem_release(p_idempotency_key, v_actor, c_endpoint);
    return public.coach_err('NOT_FOUND', 'Réservation introuvable.');
  end if;

  v_statut_avant := v_res.status;

  -- SUSPENDED se lit en base (cahier §1.1 : 403 sur tout write, y compris
  -- l'annulation). La direction, elle, peut toujours annuler — c'est la seule
  -- porte de sortie d'un coach suspendu qui a des créneaux payés.
  if v_role is distinct from 'direction' then
    select * into v_profil from public.coach_profiles where id = v_actor;
    if not found or v_profil.status <> 'active' then
      perform public.coach_idem_release(p_idempotency_key, v_actor, c_endpoint);
      return public.coach_err('SUSPENDED', 'Votre compte est suspendu. Contactez Boxing Center.');
    end if;
  end if;

  select (value #>> '{}')::int into v_min_hours
  from public.coach_settings where key = 'cancel_min_hours';
  v_min_hours := coalesce(v_min_hours, 24);

  -- ══════════════════════════════════════════ cas 1 : hold non payé
  if v_res.status = 'held' then
    -- Libération SANS avoir (cahier §6). Le siège se libère seul : la ligne sort
    -- du prédicat de l'index partiel dès que le statut n'est plus actif.
    -- L'enum du contrat n'a pas de valeur `cancelled` pour un hold abandonné ;
    -- on pose `expired` + cancel_reason pour distinguer l'abandon volontaire du
    -- hold périmé par le cron (spec-02 §19 q.1 — ajouter `cancelled` à l'enum
    -- serait une PR sur openapi.yaml et DEUX migrations).
    update public.coach_reservations
    set status        = 'expired',
        cancelled_at  = now(),
        cancel_reason = case when v_role = 'direction' then 'direction' else 'coach' end
    where id = v_res.id
    returning * into v_res;

  -- ══════════════════════════════════════════ cas 2 : payé / confirmé
  elsif v_res.status in ('awaiting_signature','confirmed') then

    if now() >= v_res.starts_at - make_interval(hours => v_min_hours) then
      perform public.coach_idem_release(p_idempotency_key, v_actor, c_endpoint);
      return public.coach_err('CANCEL_TOO_LATE',
        format('L''annulation n''est plus possible à moins de %s heures du créneau.', v_min_hours),
        jsonb_build_object('starts_at', v_res.starts_at, 'cancel_min_hours', v_min_hours));
    end if;

    -- Avoir du montant de la réservation. Pas de remboursement prestataire (cahier §6).
    insert into public.coach_credits
      (coach_id, amount_cents, initial_amount_cents, origin_reservation_id, status)
    values (v_res.coach_id, v_res.amount_cents, v_res.amount_cents, v_res.id, 'available')
    returning * into v_credit;

    update public.coach_reservations
    set status        = 'cancelled_credit',
        cancelled_at  = now(),
        credit_id     = v_credit.id,
        cancel_reason = case when v_role = 'direction' then 'direction' else 'coach' end
    where id = v_res.id
    returning * into v_res;

    -- Cahier §6 : si la résa était confirmée, le lot A doit révoquer l'accès
    -- Deciplus et invalider le QR. On publie l'événement, on ne fait pas l'appel.
    insert into public.coach_events (topic, payload)
    values ('reservation.cancelled', jsonb_build_object(
      'reservation_id', v_res.id,
      'coach_id',       v_res.coach_id,
      'club_id',        v_res.club_id,
      'previous_status', v_statut_avant,
      'was_confirmed',  (v_statut_avant = 'confirmed'),
      'credit_id',      v_credit.id,
      'amount_cents',   v_credit.amount_cents));

  -- ══════════════════════════════════════════ cas 3 : transition illégale
  else
    perform public.coach_idem_release(p_idempotency_key, v_actor, c_endpoint);
    return public.coach_err('CONFLICT',
      'Cette action n''est pas possible dans l''état actuel de la réservation.',
      jsonb_build_object('status', v_res.status));
  end if;

  insert into public.coach_audit_logs (actor_id, role, action, club_id, target_type, target_id, meta)
  values (v_actor, coalesce(v_role, 'coach'), 'reservation.cancelled', v_res.club_id,
          'reservation', v_res.id::text,
          jsonb_build_object('previous_status', v_statut_avant,
                             'new_status',      v_res.status,
                             'credit_id',       v_res.credit_id));

  v_body := jsonb_build_object(
    'ok', true,
    'reservation', jsonb_build_object(
      'id',           v_res.id,
      'status',       v_res.status,
      'cancelled_at', v_res.cancelled_at,
      'credit_id',    v_res.credit_id
    ));

  perform public.coach_idem_complete(p_idempotency_key, v_actor, c_endpoint, v_body, 200::smallint);

  return v_body;
end;
$fn$;

comment on function public.coach_cancel_reservation(uuid, uuid) is
  'POST /reservations/:id/cancel. 404 (jamais 403) hors périmètre. Avoir si payé et >24 h, rien si simple hold.';

revoke execute on function public.coach_cancel_reservation(uuid, uuid) from public, anon;
grant   execute on function public.coach_cancel_reservation(uuid, uuid) to authenticated, service_role;


-- =============================================================================
-- 0012_fonctions_crons.sql
-- =============================================================================

-- =============================================================================
-- 0012 — Tâches périodiques : expiration des holds, passage en consumed, purges
-- =============================================================================
-- Les FONCTIONS sont créées inconditionnellement : elles sont appelables par
-- service_role depuis un cron Vercel, un job GitHub Actions ou psql.
-- La PLANIFICATION pg_cron, elle, est conditionnelle : l'extension n'existe ni
-- sur un Postgres local nu, ni sur toutes les offres. Une migration qui échoue
-- parce qu'une extension manque est une migration qui bloque toute l'équipe.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Hold expiré -> expired. Le siège se libère TOUT SEUL : la ligne sort du
-- prédicat de l'index unique partiel. Aucun DELETE, aucune ligne fantôme.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_expire_holds()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  with expirees as (
    update public.coach_reservations
    set status        = 'expired',
        cancel_reason = 'hold_expired'
    where status = 'held'
      and hold_expires_at < now()
    returning id, club_id
  )
  insert into public.coach_audit_logs (actor_id, role, action, club_id, target_type, target_id)
  select null, 'service', 'reservation.expired', e.club_id, 'reservation', e.id::text
  from expirees e;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.coach_expire_holds() is
  'Passe les holds périmés en expired et trace chacun. Retourne le nombre de lignes traitées.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Créneau écoulé -> consumed. Comparaison à now(), aucune règle calendaire :
-- le fuseau du planificateur est donc sans effet.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_mark_consumed()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  update public.coach_reservations
  set status = 'consumed'
  where status = 'confirmed'
    and ends_at < now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Avoirs arrivés à échéance. Aucune règle de durée n'est écrite au contrat :
-- tant qu'expires_at reste NULL au seed, cette fonction ne touche rien. Elle
-- existe pour que le jour où la direction tranche, il n'y ait rien à écrire.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_expire_credits()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  update public.coach_credits
  set status = 'expired'
  where status = 'available'
    and expires_at is not null
    and expires_at <= now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.coach_expire_holds()   from public, anon, authenticated;
revoke execute on function public.coach_mark_consumed()  from public, anon, authenticated;
revoke execute on function public.coach_expire_credits() from public, anon, authenticated;
grant  execute on function public.coach_expire_holds()   to service_role;
grant  execute on function public.coach_mark_consumed()  to service_role;
grant  execute on function public.coach_expire_credits() to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Planification pg_cron — conditionnelle.
--
-- Signature : cron.schedule(job_name, schedule_string, command), retrait par
-- cron.unschedule('nom'). Le planificateur tourne en GMT sur Supabase, mais
-- AUCUN de ces jobs n'a de règle calendaire (ils comparent tous à now()), donc
-- le fuseau du planificateur est sans effet. Le jour où un job devra tourner
-- « à 3 h heure de Paris », il faudra écrire l'heure GMT et la corriger deux fois
-- par an, ou tester l'heure locale dans le corps du job.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_jobs constant text[][] := array[
    ['coach-expire-holds',      '* * * * *', 'select public.coach_expire_holds();'],
    ['coach-mark-consumed',     '5 * * * *', 'select public.coach_mark_consumed();'],
    ['coach-expire-credits',    '10 3 * * *','select public.coach_expire_credits();'],
    ['coach-purge-idempotence', '0 3 * * *', 'select public.coach_idem_purge();'],
    ['coach-purge-rate-limit',  '*/30 * * * *', 'select public.coach_rate_limit_purge();']
  ];
  v_i int;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponible : planification ignorée. Les fonctions restent appelables par service_role (cron Vercel, CRON_SECRET).';
    return;
  end if;

  begin
    execute 'create extension if not exists pg_cron';
  exception when others then
    raise notice 'pg_cron non installable ici (%). Planification ignorée.', sqlerrm;
    return;
  end;

  for v_i in 1 .. array_length(v_jobs, 1) loop
    -- Idempotent : on retire avant de reposer, sinon une seconde application de
    -- la migration créerait un doublon de job.
    begin
      execute format('select cron.unschedule(%L)', v_jobs[v_i][1]);
    exception when others then
      null;   -- le job n'existait pas : c'est le cas nominal au premier passage
    end;
    execute format('select cron.schedule(%L, %L, %L)',
                   v_jobs[v_i][1], v_jobs[v_i][2], v_jobs[v_i][3]);
  end loop;

  raise notice 'pg_cron : % jobs planifiés.', array_length(v_jobs, 1);
end
$$;


-- =============================================================================
-- 0013_rls.sql
-- =============================================================================

-- =============================================================================
-- 0013 — Row Level Security : toute la matrice du cahier §12
-- =============================================================================
-- LA CONFUSION À NE PAS FAIRE
-- Supabase n'a que TROIS rôles Postgres côté API : anon, authenticated,
-- service_role. `coach`, `manager_salle`, `direction`, `service` du cahier §1.1
-- sont des CLAIMS JWT, pas des rôles Postgres. Conséquences directes :
--   — un GRANT/REVOKE s'applique à `authenticated`, donc AU COACH ET AU MANAGER
--     ET À LA DIRECTION en même temps. On ne peut pas cacher une colonne au
--     manager seul par un GRANT ;
--   — la séparation manager / direction se fait UNIQUEMENT par RLS (lignes) et
--     par vues (colonnes, voir 0014).
--
-- LE PIÈGE DOCUMENTÉ, ET C'EST LE PLUS IMPORTANT DE CE FICHIER
-- « A user may perform SELECT, INSERT, etc. on a column if they hold that
--   privilege for either the specific column OR ITS WHOLE TABLE. Granting the
--   privilege at the table level and then revoking it for one column will not do
--   what one might wish. » (postgresql.org/docs/current/sql-grant.html)
-- Donc GRANT SELECT ON coach_reservations puis REVOKE SELECT (qr_jti) NE CACHE
-- RIEN. Il faut révoquer LA TABLE ENTIÈRE, puis granter la liste de colonnes.
-- C'est exactement ce que fait ce fichier, dans cet ordre.
--
-- Conséquence opérationnelle à connaître : avec des privilèges au niveau colonne,
-- un `select=*` sur une table de base échoue en 42501. C'est VOULU. Le navigateur
-- interroge des vues, dont la liste de colonnes est fermée.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Activation — ENABLE **et** FORCE
--
-- Sans FORCE, « row-level security will not be applied when the user is the
-- table owner ». Le propriétaire sur Supabase est `postgres` : sans FORCE, toute
-- la RLS ci-dessous est contournée dès qu'on se connecte en postgres.
-- (Les superutilisateurs et les rôles BYPASSRLS passent outre de toute façon —
-- c'est voulu pour service_role, et c'est précisément pourquoi
-- SUPABASE_SERVICE_ROLE_KEY ne doit JAMAIS atteindre le navigateur.)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'coach_profiles','coach_clubs','coach_spaces','coach_slot_templates',
    'coach_tariff_hours','coach_tariffs','coach_slot_block_rules','coach_slot_blocks',
    'coach_settings','coach_reservations','coach_credits','coach_documents',
    'coach_signatures','coach_deciplus_jobs','coach_events','coach_audit_logs',
    'coach_idempotency_keys','coach_rate_limit_hits'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Table rase côté navigateur, puis re-grant colonne par colonne
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- service_role a besoin d'un accès plein (cron, webhooks, bot du lot A).
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- … sauf sur l'audit, qui reste append-only même pour lui (0009, mur 1).
-- Ce REVOKE vient APRÈS le GRANT ALL ci-dessus : l'ordre n'est pas décoratif.
revoke update, delete, truncate on public.coach_audit_logs from service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. coach_profiles — cahier §12 : « SELECT/UPDATE soi »
--
-- Colonnes ABSENTES des grants, donc invisibles et inécrivables pour TOUT LE
-- MONDE côté API (coach, manager ET direction) : payplug_customer_id,
-- paypal_vault_id, deciplus_member_id, deleted_at.
-- Colonnes lisibles mais NON modifiables par le coach : status, suspended_at,
-- suspended_reason, email, photo_path, consentements. Un PATCH dessus est refusé
-- par POSTGRES, pas par une validation applicative qu'on peut oublier.
-- ─────────────────────────────────────────────────────────────────────────────
grant select (id, first_name, last_name, birth_date, phone, email, address_line,
              postal_code, city, diploma, disciplines, photo_path, status,
              suspended_at, suspended_reason, consent_privacy_at, consent_cgu_at,
              created_at, updated_at)
  on public.coach_profiles to authenticated;

grant update (first_name, last_name, birth_date, phone, address_line,
              postal_code, city, diploma, disciplines)
  on public.coach_profiles to authenticated;

create policy coach_profiles_lecture_soi on public.coach_profiles
  for select to authenticated
  using ( (select auth.uid()) = id );

create policy coach_profiles_maj_soi on public.coach_profiles
  for update to authenticated
  using      ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

create policy coach_profiles_lecture_direction on public.coach_profiles
  for select to authenticated
  using ( (select public.coach_role()) = 'direction' );

-- PAS de policy manager ici : la matrice §12 exige des COLONNES limitées, ce
-- qu'une policy ne sait pas faire. Le manager passe par coach_coaches_staff (0014).

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. coach_reservations
-- Non grantées, donc invisibles à tous : qr_jti, signature_pdf_path, payment_id,
-- seat, idempotency_key, cancel_reason.
-- ─────────────────────────────────────────────────────────────────────────────
grant select (id, coach_id, club_id, space_id, starts_at, ends_at, amount_cents,
              currency, status, payment_status, payment_provider,
              signature_status, signed_at, deciplus_job_status, hold_expires_at,
              qr_valid_from, qr_valid_to, cancelled_at, credit_id, created_at)
  on public.coach_reservations to authenticated;

create policy coach_res_lecture_soi on public.coach_reservations
  for select to authenticated
  using ( (select auth.uid()) = coach_id );

create policy coach_res_lecture_manager on public.coach_reservations
  for select to authenticated
  using ( (select public.coach_role()) = 'manager_salle'
          and club_id = (select public.coach_club()) );

create policy coach_res_lecture_direction on public.coach_reservations
  for select to authenticated
  using ( (select public.coach_role()) = 'direction' );

-- AUCUNE policy INSERT / UPDATE / DELETE pour authenticated. « If enabled and no
-- policies exist for the table, then a default-deny policy is applied. »
-- Toutes les écritures passent par coach_create_hold / coach_cancel_reservation
-- (SECURITY DEFINER) ou par service_role. Le client ne peut donc écrire ni
-- amount_cents, ni payment_status, ni status : c'est la garantie du test §13.13.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. coach_credits — coach : soi · manager : RIEN · direction : tout
-- ─────────────────────────────────────────────────────────────────────────────
grant select (id, coach_id, amount_cents, initial_amount_cents,
              origin_reservation_id, status, expires_at, created_at)
  on public.coach_credits to authenticated;

create policy coach_credits_lecture_soi on public.coach_credits
  for select to authenticated
  using ( (select auth.uid()) = coach_id );

create policy coach_credits_lecture_direction on public.coach_credits
  for select to authenticated
  using ( (select public.coach_role()) = 'direction' );
-- Manager : aucune policy = refus (matrice §12, colonne « — »).

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. coach_signatures et coach_documents
-- pdf_path n'est granté à PERSONNE : le PDF se lit par flux authentifié (lot A),
-- jamais par une URL qu'on pourrait faire fuiter dans un Referer ou un log.
-- ─────────────────────────────────────────────────────────────────────────────
grant select (id, reservation_id, coach_id, document_id, pdf_sha256, signed_at)
  on public.coach_signatures to authenticated;

create policy coach_sign_lecture_soi on public.coach_signatures
  for select to authenticated
  using ( (select auth.uid()) = coach_id );

create policy coach_sign_lecture_direction on public.coach_signatures
  for select to authenticated
  using ( (select public.coach_role()) = 'direction' );
-- Manager : AUCUNE policy. Matrice §12 : « coach_signatures / PDF — manager : non ».

grant select (id, kind, title, version, is_current, published_at)
  on public.coach_documents to authenticated;

create policy coach_docs_lecture_versions_courantes on public.coach_documents
  for select to authenticated
  using ( is_current or (select public.coach_role()) = 'direction' );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Référentiel public — lisible sans session (grille SEO, pages clubs)
-- ─────────────────────────────────────────────────────────────────────────────
grant select on public.coach_clubs,
                public.coach_spaces,
                public.coach_slot_templates,
                public.coach_tariff_hours,
                public.coach_tariffs
  to anon, authenticated;

create policy coach_clubs_lecture_publique on public.coach_clubs
  for select to anon, authenticated using ( is_active );

create policy coach_spaces_lecture_publique on public.coach_spaces
  for select to anon, authenticated using ( is_active );

create policy coach_tpl_lecture_publique on public.coach_slot_templates
  for select to anon, authenticated using ( is_active );

create policy coach_th_lecture_publique on public.coach_tariff_hours
  for select to anon, authenticated using ( true );

create policy coach_tf_lecture_publique on public.coach_tariffs
  for select to anon, authenticated using ( true );

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Blocages — lecture publique (afficher l'état `blocked` de la grille),
--    écriture manager sur SON club, direction partout.
--
-- Le WITH CHECK n'est pas décoratif : sans lui, un manager de Minimes pourrait
-- CRÉER un blocage sur Portet, parce que le USING ne filtre que les lignes
-- EXISTANTES. C'est l'oubli classique qui fait passer le test §13.2 du cahier en
-- lecture et échouer en écriture.
-- ─────────────────────────────────────────────────────────────────────────────
grant select on public.coach_slot_blocks, public.coach_slot_block_rules
  to anon, authenticated;

create policy coach_blocks_lecture on public.coach_slot_blocks
  for select to anon, authenticated using ( true );

create policy coach_rules_lecture on public.coach_slot_block_rules
  for select to anon, authenticated using ( is_active );

grant insert, update, delete on public.coach_slot_blocks to authenticated;

create policy coach_blocks_ecriture_manager on public.coach_slot_blocks
  for all to authenticated
  using      ( (select public.coach_role()) = 'manager_salle'
               and club_id = (select public.coach_club()) )
  with check ( (select public.coach_role()) = 'manager_salle'
               and club_id = (select public.coach_club()) );

create policy coach_blocks_ecriture_direction on public.coach_slot_blocks
  for all to authenticated
  using      ( (select public.coach_role()) = 'direction' )
  with check ( (select public.coach_role()) = 'direction' );

-- Règles récurrentes : la direction les pilote depuis le back-office.
grant insert, update, delete on public.coach_slot_block_rules to authenticated;

create policy coach_rules_ecriture_direction on public.coach_slot_block_rules
  for all to authenticated
  using      ( (select public.coach_role()) = 'direction' )
  with check ( (select public.coach_role()) = 'direction' );

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. coach_settings — coach : clés publiques · staff : tout · direction : UPDATE
-- ─────────────────────────────────────────────────────────────────────────────
grant select on public.coach_settings to anon, authenticated;
grant update on public.coach_settings to authenticated;

create policy coach_settings_cles_publiques on public.coach_settings
  for select to anon, authenticated
  using ( is_public );

create policy coach_settings_staff on public.coach_settings
  for select to authenticated
  using ( (select public.coach_role()) in ('manager_salle','direction') );

create policy coach_settings_maj_direction on public.coach_settings
  for update to authenticated
  using      ( (select public.coach_role()) = 'direction' )
  with check ( (select public.coach_role()) = 'direction' );

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. coach_audit_logs — SELECT seul (les murs anti-mutation sont en 0009)
-- ─────────────────────────────────────────────────────────────────────────────
grant select on public.coach_audit_logs to authenticated;

create policy coach_audit_lecture_manager on public.coach_audit_logs
  for select to authenticated
  using ( (select public.coach_role()) = 'manager_salle'
          and club_id = (select public.coach_club()) );

create policy coach_audit_lecture_direction on public.coach_audit_logs
  for select to authenticated
  using ( (select public.coach_role()) = 'direction' );
-- Coach : aucune policy (matrice §12 : « — »). L'INSERT vient des fonctions
-- SECURITY DEFINER et de service_role, jamais d'authenticated.

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. coach_deciplus_jobs, coach_events, coach_idempotency_keys,
--     coach_rate_limit_hits — AUCUN grant, AUCUNE policy pour anon/authenticated.
--
-- La matrice §12 dit que le manager voit « le statut agrégé via résa » : c'est
-- exactement coach_reservations.deciplus_job_status, déjà granté au §4 ci-dessus.
-- La table de jobs, elle, reste fermée. Le blanket REVOKE du §2 a déjà fait le
-- travail ; on le réaffirme ici pour que ce soit lisible sans dérouler le fichier.
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on public.coach_deciplus_jobs      from anon, authenticated;
revoke all on public.coach_events             from anon, authenticated;
revoke all on public.coach_idempotency_keys   from anon, authenticated;
revoke all on public.coach_rate_limit_hits    from anon, authenticated;


-- =============================================================================
-- 0014_vues_staff.sql
-- =============================================================================

-- =============================================================================
-- 0014 — Vues staff et le piège `security_invoker`
-- =============================================================================
-- LE PIÈGE, ÉNONCÉ
-- Postgres évalue les relations de base d'une vue AVEC LES DROITS DU PROPRIÉTAIRE
-- de la vue, pas de l'appelant. Sur Supabase le propriétaire est `postgres`, qui
-- a BYPASSRLS : une vue créée normalement CONTOURNE DONC TOUTE LA RLS.
--
-- `security_invoker` (Postgres 15+) : « If the view has the security_invoker
-- property set to true, access to the underlying base relations is determined by
-- the permissions of the user executing the query, rather than the view owner. »
-- Supabase en a fait une règle de lint : 0010_security_definer_view.
--
-- ET LE PIÈGE DANS LE PIÈGE
-- `CREATE OR REPLACE VIEW` RÉINITIALISE LES reloptions. Une vue passée en
-- security_invoker par un ALTER VIEW PERD SILENCIEUSEMENT l'option à la première
-- redéfinition. L'option est donc écrite DANS le CREATE OR REPLACE VIEW lui-même,
-- jamais en ALTER. Le lint doit tourner en CI après chaque migration.
--
-- LA RÈGLE, EN UNE PHRASE
-- Une vue security_invoker protège les LIGNES (elle délègue à la RLS de base) ;
-- elle ne protège pas les COLONNES (il faut les REVOKE, c'est fait en 0013).
-- Une vue SECURITY DEFINER protège les deux, mais uniquement si son WHERE est
-- juste — et personne ne le vérifie à votre place.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A) coach_reservations_staff — INVOKER
--
-- Elle s'appuie sur une seule table, dont la RLS exprime déjà exactement la règle
-- (manager -> son club, direction -> tout, coach -> soi). Les colonnes interdites
-- ne sont grantées à personne (0013), donc l'invoker ne peut pas les lire même en
-- attaquant la table de base.
-- LA VUE NE CACHE RIEN PAR ELLE-MÊME : ELLE PROJETTE. C'EST LE GRANT QUI CACHE.
--
-- security_barrier empêche un opérateur non-LEAKPROOF fourni par l'appelant
-- d'être évalué avant les quals de la vue.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.coach_reservations_staff
with (security_invoker = true, security_barrier = true) as
select
  r.id,
  r.coach_id,
  r.club_id,
  r.space_id,
  r.starts_at,
  r.ends_at,
  r.amount_cents,
  r.currency,
  r.status,
  r.payment_status,
  r.payment_provider,
  (r.signature_status = 'signed')                            as signed,     -- booléen (cahier §6)
  r.signed_at,
  r.deciplus_job_status,
  (r.status = 'confirmed' and r.qr_valid_to > now())         as qr_ready,   -- booléen, PAS le token
  r.hold_expires_at,
  r.cancelled_at,
  r.credit_id,
  r.created_at
from public.coach_reservations r;

comment on view public.coach_reservations_staff is
  'Vue staff des réservations, security_invoker : la RLS de coach_reservations fait le filtrage des lignes. Absents volontairement : qr_jti, signature_pdf_path, payment_id, seat, idempotency_key.';

grant select on public.coach_reservations_staff to authenticated;
revoke all on public.coach_reservations_staff from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- B) coach_coaches_staff — DEFINER, À DESSEIN
--
-- Ici la matrice §12 demande des COLONNES LIMITÉES SELON LE RÔLE, ce qu'aucun
-- GRANT ne peut exprimer : un GRANT s'applique à `authenticated` entier, donc au
-- coach ET au manager ET à la direction. On assume donc une vue definer, et le
-- WHERE ci-dessous DEVIENT UN ÉLÉMENT DE SÉCURITÉ CRITIQUE : c'est lui, et lui
-- seul, qui remplace la RLS. Il est couvert par les tests d'invariants.
--
-- Colonnes exposées = exactement openapi CoachStaffView. birth_date, address_line,
-- postal_code, diploma, deciplus_member_id, tokens prestataire : ABSENTS.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.coach_coaches_staff
with (security_barrier = true) as
select
  p.id,
  p.first_name,
  p.last_name,
  p.email,
  p.phone,
  p.status,
  (select count(*)
     from public.coach_reservations r2
    where r2.coach_id = p.id
      and r2.status in ('held','awaiting_signature','confirmed'))::int as active_reservations_count
from public.coach_profiles p
where p.deleted_at is null
  and (
        -- direction : tous les coachs
        (select public.coach_role()) = 'direction'
     or (
        -- manager : UNIQUEMENT les coachs ayant une résa sur SON club
            (select public.coach_role()) = 'manager_salle'
        and (select public.coach_club()) is not null
        and exists (select 1
                      from public.coach_reservations r
                     where r.coach_id = p.id
                       and r.club_id = (select public.coach_club()))
        )
  );

comment on view public.coach_coaches_staff is
  'Vue staff des coachs. SECURITY DEFINER ASSUMÉE (le lint Supabase 0010 la signalera) : la matrice §12 exige des colonnes limitées par rôle, ce qu''un GRANT ne sait pas faire. Le WHERE remplace la RLS — le modifier, c''est modifier un contrôle d''accès.';

grant select on public.coach_coaches_staff to authenticated;
revoke all on public.coach_coaches_staff from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- C) coach_slot_occupancy — DEFINER, publique, AGRÉGÉE
--
-- La grille publique (pages clubs, SEO) doit afficher « complet / 1 place / libre »
-- SANS session. Or `anon` n'a aucun grant sur coach_reservations, et c'est très
-- bien ainsi : il n'a rien à savoir de QUI réserve.
-- Cette vue ne rend qu'un COMPTE. Aucun coach_id, aucun montant, aucun statut
-- individuel : rien qui permette de suivre une personne.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace view public.coach_slot_occupancy
with (security_barrier = true) as
select
  r.club_id,
  r.space_id,
  r.starts_at,
  count(*)::int as taken
from public.coach_reservations r
where r.status in ('held','awaiting_signature','confirmed')
group by r.club_id, r.space_id, r.starts_at;

comment on view public.coach_slot_occupancy is
  'Occupation agrégée d''un créneau pour la grille publique. AJOUT du lot C : sans elle, anon ne peut pas afficher « complet » sans qu''on lui grante coach_reservations. Ne rend qu''un compte — jamais une identité.';

grant select on public.coach_slot_occupancy to anon, authenticated;


-- =============================================================================
-- 0015_seed.sql
-- =============================================================================

-- =============================================================================
-- 0015 — Seed du référentiel
-- =============================================================================
-- Ce seed est IDEMPOTENT (on conflict do nothing) : il peut être rejoué sans
-- écraser un réglage modifié au back-office. C'est ce qui permet de le faire
-- tourner en préproduction sans casser ce que la direction y a réglé.
--
-- Il ne crée AUCUN utilisateur, AUCUN coach, AUCUNE réservation. Les comptes
-- viennent de GoTrue, pas d'une migration.
-- =============================================================================

-- ── Clubs (cahier §3.2) ──────────────────────────────────────────────────────
insert into public.coach_clubs (id, name, city) values
  ('minimes',    'Boxing Center Minimes',      'Toulouse'),
  ('st-cyprien', 'Boxing Center Saint-Cyprien','Toulouse'),
  ('etats-unis', 'Boxing Center États-Unis',   'Toulouse'),
  ('ramonville', 'Boxing Center Ramonville',   'Ramonville-Saint-Agne'),
  ('portet',     'Boxing Center Portet',       'Portet-sur-Garonne')
on conflict (id) do nothing;

-- ── Espaces (cahier §3.2, miroir de ESPACES_PAR_CLUB dans src/domain/contrat.ts)
-- lock_key : entier stable pour pg_advisory_xact_lock. Ces valeurs sont FIGÉES —
-- les permuter reviendrait à déplacer les verrous d'un espace vers un autre.
-- Un nouvel espace prend le prochain entier libre, jamais un recyclé.
insert into public.coach_spaces (club_id, id, name, capacity, lock_key) values
  ('minimes',    'salle',        'Salle',          2, 1),
  ('st-cyprien', 'salle',        'Salle',          2, 2),
  ('ramonville', 'salle',        'Salle',          2, 3),
  ('etats-unis', 'boxe',         'Boxe',           2, 4),
  ('etats-unis', 'mma-sol',      'MMA / Sol',      2, 5),
  ('etats-unis', 'fitness',      'Fitness',        2, 6),
  ('portet',     'boxe-fitness', 'Boxe / Fitness', 2, 7),
  ('portet',     'mma-sol',      'MMA / Sol',      2, 8)
on conflict (club_id, id) do nothing;

-- ── Tarifs (cahier §3.4) ─────────────────────────────────────────────────────
insert into public.coach_tariffs (kind, amount_cents) values
  ('offpeak', 1000),          -- 10,00 €
  ('peak',    1500)           -- 15,00 €
on conflict (kind) do nothing;

-- Découpage heures creuses / heures pleines :
--   offpeak : 10-11, 11-12, 14-15, 15-16, 16-17   (5 créneaux)
--   peak    : 12-13, 13-14, 17-18, 18-19          (4 créneaux)
--   => 9 créneaux au total, de 10h à 19h. Le dernier COMMENCE à 18h.
insert into public.coach_tariff_hours (start_hour, kind) values
  (10,'offpeak'), (11,'offpeak'), (12,'peak'),    (13,'peak'),    (14,'offpeak'),
  (15,'offpeak'), (16,'offpeak'), (17,'peak'),    (18,'peak')
on conflict (start_hour) do nothing;

-- ── Créneaux types : lun(1)–sam(6), heures de début 10..18, pour chaque espace ─
-- 8 espaces × 6 jours × 9 heures = 432 lignes.
insert into public.coach_slot_templates (club_id, space_id, isodow, start_hour)
select s.club_id, s.id, d.isodow, h.start_hour
from public.coach_spaces s
cross join generate_series(1, 6)   as d(isodow)
cross join generate_series(10, 18) as h(start_hour)
on conflict do nothing;

-- ── Blocages boxe éducative (cahier §3.3) ────────────────────────────────────
-- Mercredi (3) et samedi (6), les créneaux qui COMMENCENT à 15h et à 16h.
-- Portet : les lignes sont créées mais INACTIVES — le club est paramétrable par
-- le back-office et ne suit pas ce défaut. Les créer inactives plutôt que de ne
-- pas les créer, c'est laisser à la direction un interrupteur au lieu d'un ticket.
insert into public.coach_slot_block_rules (club_id, space_id, isodow, start_hour, reason, is_active)
select s.club_id, s.id, d.isodow, h.start_hour, 'educative', (s.club_id <> 'portet')
from public.coach_spaces s
cross join (values (3), (6))   as d(isodow)
cross join (values (15), (16)) as h(start_hour)
on conflict (club_id, space_id, isodow, start_hour) do nothing;

-- ── Réglages direction (cahier §3.9) ─────────────────────────────────────────
-- is_public = true : lisible par un coach et par la grille publique.
-- offpeak_cents / peak_cents de .env.example ne sont PAS recopiés ici : la vérité
-- des montants est coach_tariffs, une seule fois. Deux sources pour un prix,
-- c'est la garantie qu'elles divergeront.
insert into public.coach_settings (key, value, is_public) values
  ('max_active_reservations', '3'::jsonb,    true),
  ('capacity_per_slot',       '2'::jsonb,    true),   -- défaut à la création d'un espace
  ('hold_ttl_seconds',        '600'::jsonb,  true),
  ('cancel_min_hours',        '24'::jsonb,   true),
  ('qr_early_minutes',        '5'::jsonb,    true),
  ('credit_validity_months',  'null'::jsonb, false)   -- null = jamais expiré (§19 q.6)
on conflict (key) do nothing;

-- ── Garde-fous du seed ───────────────────────────────────────────────────────
-- Un seed silencieusement incomplet est pire qu'un seed absent : on construit
-- dessus sans le savoir. On vérifie donc les comptes ici, dans la transaction de
-- la migration — si ça ne colle pas, la migration est annulée entièrement.
do $$
declare
  v_clubs   int;
  v_spaces  int;
  v_tariffs int;
  v_hours   int;
  v_tpl     int;
  v_rules   int;
begin
  select count(*) into v_clubs   from public.coach_clubs;
  select count(*) into v_spaces  from public.coach_spaces;
  select count(*) into v_tariffs from public.coach_tariffs;
  select count(*) into v_hours   from public.coach_tariff_hours;
  select count(*) into v_tpl     from public.coach_slot_templates;
  select count(*) into v_rules   from public.coach_slot_block_rules;

  if v_clubs <> 5 then
    raise exception 'seed : % clubs au lieu de 5', v_clubs;
  end if;
  if v_spaces <> 8 then
    raise exception 'seed : % espaces au lieu de 8', v_spaces;
  end if;
  if v_tariffs <> 2 then
    raise exception 'seed : % tarifs au lieu de 2 (offpeak, peak)', v_tariffs;
  end if;
  if v_hours <> 9 then
    raise exception 'seed : % heures tarifées au lieu de 9 (10h..18h de début)', v_hours;
  end if;
  if v_tpl <> 432 then
    raise exception 'seed : % créneaux types au lieu de 432 (8 espaces × 6 jours × 9 heures)', v_tpl;
  end if;
  if v_rules <> 32 then
    raise exception 'seed : % règles éducative au lieu de 32 (8 espaces × 2 jours × 2 heures)', v_rules;
  end if;

  raise notice 'seed : % clubs, % espaces, % créneaux types, % règles éducative (dont % actives).',
    v_clubs, v_spaces, v_tpl, v_rules,
    (select count(*) from public.coach_slot_block_rules where is_active);
end $$;


-- =============================================================================
-- 0016_vues_lecture_seule.sql
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — Les vues sont des surfaces de LECTURE. Rien ne s'écrit à travers.
--
-- POURQUOI CETTE MIGRATION EXISTE
--
-- Elle corrige un défaut qui n'existait QUE sur Supabase, et pas en local — donc
-- invisible pour qui ne teste que sur sa machine.
--
-- Supabase applique, par défaut, sur le schéma `public` :
--     grant all on all tables in schema public to anon, authenticated;
-- « all tables » inclut les VUES. Les trois vues créées en 0014 ont donc hérité
-- de DELETE, INSERT, UPDATE, TRUNCATE, REFERENCES et TRIGGER pour `authenticated`,
-- et pour `anon` sur coach_slot_occupancy. Personne ne les a accordés : ils étaient
-- déjà là quand la vue est née.
--
-- CE QUE ÇA OUVRAIT
--
-- `coach_reservations_staff` est en `security_invoker = true` : une écriture
-- retombe sur la RLS de la table de base, qui n'a aucune policy d'écriture pour
-- `authenticated`. Vérifié : « permission denied for table coach_reservations ».
-- Cette vue-là était protégée.
--
-- `coach_coaches_staff` est en `security_definer` — à dessein, parce qu'elle
-- projette des colonnes différentes selon le rôle, ce qu'aucun GRANT ne sait
-- exprimer. Mais « definer » veut dire qu'elle s'exécute avec les droits du
-- propriétaire, donc **en contournant la RLS**. Un manager de salle y voit les
-- coachs de son club ; avec un droit d'UPDATE, il pouvait écrire dessus, alors que
-- le cahier §10 réserve `suspend` / `unsuspend` à la direction.
--
-- Deux hasards l'ont empêché le jour où ça a été testé :
--   1. la contrainte `coach_profiles_suspension_coherente` refuse `status='active'`
--      tant que `suspended_at` est renseigné ;
--   2. la vue n'expose pas `suspended_at`, donc on ne peut pas l'effacer.
-- Le jour où un écran de back-office aura besoin d'afficher le motif de suspension
-- et qu'on ajoutera la colonne à la vue, le trou s'ouvre. On ne laisse pas une
-- frontière de sécurité reposer sur une colonne qu'on a oublié d'exposer.
--
-- CE QU'ON NE TOUCHE PAS
--
-- Les droits d'écriture sur les TABLES de base (coach_slot_blocks,
-- coach_slot_block_rules, coach_settings) sont volontaires : ils sont gouvernés
-- par les policies RLS de 0013, qui vérifient le rôle et le club. Y toucher
-- casserait le back-office.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_vue text;
begin
  foreach v_vue in array array[
    'coach_reservations_staff',
    'coach_coaches_staff',
    'coach_slot_occupancy'
  ]
  loop
    if to_regclass('public.' || v_vue) is null then
      raise notice 'vue % absente, ignorée', v_vue;
      continue;
    end if;

    execute format(
      'revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated, public',
      v_vue
    );
  end loop;
end
$$;

-- On réaffirme la lecture, pour que l'intention soit lisible dans le fichier et
-- pas seulement déduite de ce qui n'a pas été révoqué.
grant select on public.coach_slot_occupancy      to anon, authenticated;
grant select on public.coach_reservations_staff  to authenticated;
grant select on public.coach_coaches_staff       to authenticated;

comment on view public.coach_coaches_staff is
  'LECTURE SEULE. security_definer assumé : la projection de colonnes par rôle ne '
  's''exprime pas en GRANT. Son WHERE est donc une frontière de sécurité — toute '
  'modification de cette vue doit être relue comme du code de sécurité, et aucune '
  'colonne de suspension ne doit y entrer sans repasser sur les droits.';

-- ───────────────────────────────────────────────────────────────────────────
-- Garde-fou permanent : cette migration échoue si un droit d'écriture subsiste
-- sur une vue. Elle protège aussi les futures vues, parce que le contrôle porte
-- sur `relkind = 'v'` et pas sur une liste de noms.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_restants text;
begin
  select string_agg(format('%s→%s(%s)', table_name, grantee, privilege_type), ', ')
    into v_restants
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.grantee in ('anon', 'authenticated', 'public')
    and g.privilege_type <> 'SELECT'
    and exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = g.table_name and c.relkind = 'v'
    );

  if v_restants is not null then
    raise exception 'Droit d''écriture encore accordé sur une vue : %', v_restants;
  end if;
end
$$;


-- =============================================================================
-- 0017_passerelle_lot_a.sql
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 0017 — La passerelle que le lot C doit au lot A
--
-- LE PROBLÈME QUE CETTE MIGRATION RÉPARE
--
-- Le lot C a décidé (et il a eu raison) qu'aucune policy d'écriture ne serait
-- accordée à `authenticated` sur `coach_reservations` : le navigateur ne doit pas
-- pouvoir écrire `amount_cents` ni `payment_status`. Toutes les écritures passent
-- par des fonctions `SECURITY DEFINER`.
--
-- Sauf qu'on n'a écrit ces fonctions que pour NOS routes — le hold et l'annulation.
-- Regardons ce que Raphael doit écrire, et depuis où :
--
--   POST /webhooks/payplug          → client service_role   → OK, il écrit
--   POST /webhooks/paypal           → client service_role   → OK
--   POST /internal/deciplus/callback→ client service_role   → OK
--   POST /reservations/{id}/checkout  (provider=credit)     → session coach → BLOQUÉ
--   POST /reservations/{id}/signature                       → session coach → BLOQUÉ
--
-- Les deux routes les plus sensibles du lot A tournent sur une session coach, donc
-- en rôle `authenticated`, qui n'a aucune policy d'écriture. Sans cette migration,
-- « payer avec un avoir » et « signer » ne peuvent physiquement pas aboutir.
--
-- C'est une décision du lot C qui bloquait le lot A, prise dans un document que
-- Raphael n'a jamais lu. `REPARTITION-TACHES.md` §3.1 l'annonçait pourtant :
-- « Bloque Raphael : amount_cents figé + events cancel/suspend + solde avoir ».
--
-- CE QUE CETTE MIGRATION FAIT, ET CE QU'ELLE NE FAIT PAS
--
-- Elle fournit le CHEMIN D'ÉCRITURE sûr. Elle ne décide de rien du métier de
-- Raphael : ni comment on appelle Payplug, ni comment on fabrique le PDF, ni
-- comment on signe le jeton QR. Elle prend les résultats de son travail et les
-- écrit en base sous contrôle, en refusant toute transition illégale.
--
-- Raphael appelle ces fonctions depuis ses route handlers. Il garde la main sur
-- le quand et le pourquoi ; la base garde la main sur le « est-ce légal ».
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Payer avec un avoir — CAHIER §7, `provider: "credit"`
--
--    « si solde avoir ≥ amount_cents, débiter l'avoir, payment_status=waived_credit,
--      passer directement awaiting_signature (toujours signer) »
--
--    Consommation FIFO : le plus ancien avoir d'abord, et un avoir partiellement
--    consommé garde son reste (décision D-C03 — `amount_cents` est un reste).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.coach_apply_credit_payment(
  p_reservation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_appelant  uuid := auth.uid();
  v_res       public.coach_reservations;
  v_statut    public.coach_profile_status;
  v_solde     int;
  v_reste     int;
  v_avoir     record;
  v_pris      int;
begin
  if v_appelant is null then
    return public.coach_err('UNAUTHENTICATED', 'Session requise.');
  end if;

  -- Anti-énumération : hors périmètre et inexistant sont indiscernables (CAHIER §1.3).
  select * into v_res
  from public.coach_reservations
  where id = p_reservation_id and coach_id = v_appelant
  for update;

  if not found then
    return public.coach_err('NOT_FOUND', 'Introuvable.');
  end if;

  select status into v_statut from public.coach_profiles where id = v_appelant;
  if v_statut <> 'active' then
    return public.coach_err('SUSPENDED', 'Votre compte est suspendu. Contactez Boxing Center.');
  end if;

  -- Rejouer un paiement déjà passé n'est pas une erreur : c'est une idempotence.
  if v_res.payment_status = 'waived_credit' and v_res.status = 'awaiting_signature' then
    return jsonb_build_object('ok', true, 'reservation', to_jsonb(v_res), 'rejeu', true);
  end if;

  if v_res.status <> 'held' then
    return public.coach_err('CONFLICT',
      'Cette réservation n''est plus en attente de paiement.',
      jsonb_build_object('status', v_res.status));
  end if;

  if v_res.hold_expires_at is not null and v_res.hold_expires_at <= now() then
    return public.coach_err('HOLD_EXPIRED',
      'Le délai de 10 minutes est écoulé, le créneau a été libéré.');
  end if;

  v_solde := public.coach_credit_balance(v_appelant);
  if v_solde < v_res.amount_cents then
    return public.coach_err('PAYMENT_REQUIRED',
      'Votre solde d''avoirs est insuffisant pour ce créneau.',
      jsonb_build_object('solde_cents', v_solde, 'requis_cents', v_res.amount_cents));
  end if;

  -- Débit FIFO. `for update` sur chaque avoir : deux checkouts simultanés du même
  -- coach ne peuvent pas dépenser deux fois le même euro.
  v_reste := v_res.amount_cents;
  for v_avoir in
    select id, amount_cents
    from public.coach_credits
    where coach_id = v_appelant
      and status = 'available'
      and (expires_at is null or expires_at > now())
    order by created_at, id
    for update
  loop
    exit when v_reste <= 0;
    v_pris := least(v_avoir.amount_cents, v_reste);
    update public.coach_credits
       set amount_cents = amount_cents - v_pris,
           status = case when amount_cents - v_pris = 0 then 'consumed'::public.coach_credit_status
                         else status end
     where id = v_avoir.id;
    v_reste := v_reste - v_pris;
  end loop;

  if v_reste > 0 then
    -- Le solde a bougé entre la lecture et le débit. On annule tout.
    raise exception 'solde d''avoirs insuffisant au moment du débit (reste %)', v_reste
      using errcode = '40001';
  end if;

  update public.coach_reservations
     set payment_status   = 'waived_credit',
         payment_provider = 'credit',
         status           = 'awaiting_signature',
         hold_expires_at  = null
   where id = p_reservation_id
   returning * into v_res;

  insert into public.coach_events (topic, payload)
  values ('reservation.paid', jsonb_build_object(
    'reservation_id', v_res.id, 'coach_id', v_res.coach_id,
    'club_id', v_res.club_id, 'provider', 'credit'));

  insert into public.coach_audit_logs (actor_id, role, action, club_id, target_type, target_id, meta)
  values (v_appelant, 'coach', 'reservation.paid_by_credit', v_res.club_id,
          'reservation', v_res.id::text,
          jsonb_build_object('amount_cents', v_res.amount_cents));

  return jsonb_build_object('ok', true, 'reservation', to_jsonb(v_res));
end
$$;

comment on function public.coach_apply_credit_payment(uuid) is
  'LOT A — appelée par POST /reservations/{id}/checkout avec provider=credit. '
  'Débite les avoirs en FIFO et passe la réservation en awaiting_signature. '
  'Rejouable sans effet de bord.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Enregistrer la signature — CAHIER §8
--
--    C'est le SEUL endroit d'où une réservation peut devenir `confirmed`.
--    La barrière du §2 est vérifiée ici ET par la contrainte CHECK de 0004 :
--    `confirmed` est impossible tant que payé ET signé ne sont pas vrais.
--
--    Raphael fabrique le PDF, calcule son empreinte et forge le `qr_jti`.
--    Cette fonction ne fait que les enregistrer, et refuse si l'état l'interdit.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.coach_mark_signed(
  p_reservation_id uuid,
  p_pdf_path       text,
  p_qr_jti         text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_appelant uuid := auth.uid();
  v_res      public.coach_reservations;
  v_statut   public.coach_profile_status;
  v_avance   int;
begin
  if v_appelant is null then
    return public.coach_err('UNAUTHENTICATED', 'Session requise.');
  end if;

  -- « Pas de signature pour un autre coach_id » (CAHIER §8).
  select * into v_res
  from public.coach_reservations
  where id = p_reservation_id and coach_id = v_appelant
  for update;

  if not found then
    return public.coach_err('NOT_FOUND', 'Introuvable.');
  end if;

  select status into v_statut from public.coach_profiles where id = v_appelant;
  if v_statut <> 'active' then
    return public.coach_err('SUSPENDED', 'Votre compte est suspendu. Contactez Boxing Center.');
  end if;

  if v_res.signature_status = 'signed' and v_res.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'reservation', to_jsonb(v_res), 'rejeu', true);
  end if;

  if v_res.payment_status not in ('paid', 'waived_credit') then
    return public.coach_err('PAYMENT_REQUIRED',
      'Le paiement doit être réglé avant la signature.',
      jsonb_build_object('payment_status', v_res.payment_status));
  end if;

  if v_res.status <> 'awaiting_signature' then
    return public.coach_err('CONFLICT',
      'Cette réservation n''attend pas de signature.',
      jsonb_build_object('status', v_res.status));
  end if;

  select (value #>> '{}')::int into v_avance
  from public.coach_settings where key = 'qr_early_minutes';
  v_avance := coalesce(v_avance, 5);

  update public.coach_reservations
     set signature_status    = 'signed',
         signed_at           = now(),
         signature_pdf_path  = p_pdf_path,
         qr_jti              = p_qr_jti,
         qr_valid_from       = v_res.starts_at - make_interval(mins => v_avance),
         qr_valid_to         = v_res.ends_at,
         status              = 'confirmed',
         deciplus_job_status = 'queued'
   where id = p_reservation_id
   returning * into v_res;

  insert into public.coach_events (topic, payload)
  values ('reservation.confirmed', jsonb_build_object(
    'reservation_id', v_res.id, 'coach_id', v_res.coach_id,
    'club_id', v_res.club_id, 'space_id', v_res.space_id,
    'starts_at', v_res.starts_at, 'ends_at', v_res.ends_at));

  -- L'audit ne porte NI le chemin du PDF, NI le qr_jti : CAHIER §3.8 l'interdit.
  insert into public.coach_audit_logs (actor_id, role, action, club_id, target_type, target_id, meta)
  values (v_appelant, 'coach', 'reservation.signed', v_res.club_id,
          'reservation', v_res.id::text, '{}'::jsonb);

  return jsonb_build_object('ok', true, 'reservation', to_jsonb(v_res));
end
$$;

comment on function public.coach_mark_signed(uuid, text, text) is
  'LOT A — appelée par POST /reservations/{id}/signature après fabrication du PDF. '
  'Seul chemin vers le statut confirmed. Rejouable sans effet de bord.';

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Droits
--    Ces fonctions sont SECURITY DEFINER et vérifient elles-mêmes l'appelant :
--    les exposer à `authenticated` est exactement l'intention. `public` ne les a pas.
-- ───────────────────────────────────────────────────────────────────────────
revoke execute on function public.coach_apply_credit_payment(uuid) from public;
revoke execute on function public.coach_mark_signed(uuid, text, text) from public;

grant execute on function public.coach_apply_credit_payment(uuid) to authenticated, service_role;
grant execute on function public.coach_mark_signed(uuid, text, text) to authenticated, service_role;
grant execute on function public.coach_credit_balance(uuid) to authenticated, service_role;


-- =============================================================================
-- 20260918120300_coach_storage.sql
-- =============================================================================

-- Storage privé photos + PDF signés. Pas d’URL publique permanente.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'coach-private',
  'coach-private',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
where not exists (select 1 from storage.buckets b where b.id = 'coach-private');

update storage.buckets
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
where id = 'coach-private';

drop policy if exists coach_private_select_own on storage.objects;
create policy coach_private_select_own on storage.objects
  for select
  using (
    bucket_id = 'coach-private'
    and (
      auth.role() = 'service_role'
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.coach_role() = 'direction'
    )
  );

drop policy if exists coach_private_insert_own on storage.objects;
create policy coach_private_insert_own on storage.objects
  for insert
  with check (
    bucket_id = 'coach-private'
    and (
      auth.role() = 'service_role'
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy if exists coach_private_update_own on storage.objects;
create policy coach_private_update_own on storage.objects
  for update
  using (
    bucket_id = 'coach-private'
    and (
      auth.role() = 'service_role'
      or (storage.foldername(name))[1] = auth.uid()::text
      or public.coach_role() = 'direction'
    )
  );

-- 0022 — authenticated n'écrit pas coach_reservations en direct.
revoke insert, update, delete on public.coach_reservations from authenticated;
drop policy if exists coach_reservations_insert_self on public.coach_reservations;
drop policy if exists coach_reservations_update on public.coach_reservations;

