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
