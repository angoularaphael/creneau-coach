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
