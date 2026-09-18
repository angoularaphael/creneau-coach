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
