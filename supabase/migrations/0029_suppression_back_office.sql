-- Suppression définitive depuis le back-office (Eddy, 30/09/2026).
--
-- Les essais laissaient des coachs et des réservations impossibles à effacer :
-- chaque table fille (signatures, jobs Deciplus, avoirs) retient sa ligne mère
-- par une clé ON DELETE RESTRICT. C'est voulu en temps normal — rien ne doit
-- disparaître par accident — mais la direction doit pouvoir nettoyer.
--
-- Deux fonctions, service_role seulement, qui effacent dans l'ordre des clés et
-- dans UNE transaction : tout part, ou rien. Elles renvoient les chemins de
-- fichiers (attestations signées, photo) que l'appelant retire du stockage.
-- Le journal d'audit, lui, ne s'efface jamais : chaque suppression y ajoute une
-- ligne, sans aucun chemin de PDF (cahier §3.8).

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

  select coalesce(array_agg(distinct c), '{}') into chemins
  from (
    select pdf_path as c from public.coach_signatures where reservation_id = p_id
    union
    select r.signature_pdf_path
  ) s
  where c is not null and c <> '';

  delete from public.coach_signatures    where reservation_id = p_id;
  delete from public.coach_deciplus_jobs where reservation_id = p_id;

  -- Un avoir né de cette réservation part avec elle ; une autre réservation qui
  -- l'utilisait le perd (sa trace reste dans le journal).
  update public.coach_reservations set credit_id = null
   where credit_id in (select id from public.coach_credits where origin_reservation_id = p_id);
  delete from public.coach_credits where origin_reservation_id = p_id;

  delete from public.coach_reservations where id = p_id;

  insert into public.coach_audit_logs (actor_id, role, action, club_id, target_type, target_id, meta)
  values (null, 'back_office', 'reservation.supprimee', r.club_id, 'reservation', p_id::text,
          jsonb_build_object(
            'par', p_acteur,
            'coach_id', r.coach_id,
            'debut', r.starts_at,
            'statut', r.status,
            'paiement', r.payment_status,
            'montant_cents', r.amount_cents
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

  for resa in select id from public.coach_reservations where coach_id = p_id loop
    chemins := chemins || public.coach_bo_supprimer_reservation(resa, p_acteur);
    nb := nb + 1;
  end loop;

  -- Restes qui ne pendaient à aucune réservation.
  select chemins || coalesce(array_agg(pdf_path) filter (where pdf_path is not null), '{}')
    into chemins from public.coach_signatures where coach_id = p_id;
  delete from public.coach_signatures    where coach_id = p_id;
  delete from public.coach_deciplus_jobs where coach_id = p_id;
  delete from public.coach_credits       where coach_id = p_id;

  if coalesce(p.photo_path, '') <> '' then
    chemins := chemins || p.photo_path;
  end if;
  delete from public.coach_profiles where id = p_id;

  -- Le compte de connexion : sans lui, l'adresse peut se réinscrire.
  delete from auth.users where id = p_id;

  insert into public.coach_audit_logs (actor_id, role, action, target_type, target_id, meta)
  values (null, 'back_office', 'coach.supprime', 'coach', p_id::text,
          jsonb_build_object('par', p_acteur, 'reservations', nb));

  return chemins;
end;
$$;

revoke all on function public.coach_bo_supprimer_reservation(uuid, text) from public, anon, authenticated;
revoke all on function public.coach_bo_supprimer_coach(uuid, text) from public, anon, authenticated;
grant execute on function public.coach_bo_supprimer_reservation(uuid, text) to service_role;
grant execute on function public.coach_bo_supprimer_coach(uuid, text) to service_role;
