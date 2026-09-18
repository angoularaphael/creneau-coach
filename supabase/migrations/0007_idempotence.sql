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
