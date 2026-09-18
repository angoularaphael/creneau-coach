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
