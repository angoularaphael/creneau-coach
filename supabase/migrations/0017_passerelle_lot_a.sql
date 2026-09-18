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
