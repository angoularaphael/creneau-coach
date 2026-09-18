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
