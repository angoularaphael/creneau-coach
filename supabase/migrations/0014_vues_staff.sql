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
