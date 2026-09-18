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
