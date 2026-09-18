-- ═══════════════════════════════════════════════════════════════════════════
-- 0018 — La grille de créneaux, calculée en SQL
--
-- C'est la lecture centrale du lot C : elle sert `GET /clubs/:id/slots` (le
-- livrable qui débloque Brad) ET le planning du back-office. Une seule
-- implémentation, donc une seule vérité : impossible que la salle et le coach
-- voient deux grilles différentes.
--
-- POURQUOI EN SQL ET PAS EN TYPESCRIPT
--
-- Le cahier §1.6 impose l'heure serveur `Europe/Paris` pour toute règle métier.
-- Faire l'arithmétique de fuseau en JavaScript créerait une seconde horloge,
-- donc une seconde vérité. Ici, `(date || heure)::timestamp AT TIME ZONE
-- 'Europe/Paris'` convertit une heure murale locale en instant absolu, et
-- Postgres gère les changements d'heure avec sa base de fuseaux.
--
-- LE DÉFAUT QUE CETTE FONCTION CORRIGE
--
-- La vue `coach_slot_occupancy` compte `status in (held, awaiting_signature,
-- confirmed)` sans regarder `hold_expires_at`. Un hold abandonné il y a deux
-- heures y compte donc encore. Conséquences réelles : un créneau libre s'affiche
-- `full`, et un coach qui a laissé filer trois holds est verrouillé hors de la
-- plateforme jusqu'au passage du cron.
--
-- Le prédicat juste, utilisé ici, est :
--     awaiting_signature | confirmed
--     OU (held ET hold_expires_at > now())
--
-- C'est ce qui rend le cron FACULTATIF pour la correction : il ne fait que
-- matérialiser un état déjà vrai à la lecture. Un cron mort dégrade l'affichage,
-- il ne vend jamais deux fois le même siège et ne verrouille jamais un coach.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.coach_slot_grid(
  p_club_id  text,
  p_space_id text default null,
  p_from     date default current_date,
  p_to       date default current_date + 6
) returns table (
  club_id      text,
  space_id     text,
  starts_at    timestamptz,
  ends_at      timestamptz,
  amount_cents int,
  tariff       text,
  capacity     int,
  taken        int,
  state        text
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with bornes as (
    -- Garde-fou : on ne génère jamais plus de 62 jours d'un coup. Sans cette
    -- borne, un `?from=2020-01-01&to=2099-12-31` fabrique des millions de lignes.
    select p_from as d1, least(p_to, p_from + 61) as d2
  ),
  jours as (
    select g::date as jour
    from bornes, generate_series(bornes.d1, bornes.d2, interval '1 day') g
  ),
  creneaux as (
    select
      t.club_id,
      t.space_id,
      t.start_hour,
      -- Heure murale Paris → instant absolu. Correct aux changements d'heure.
      ((j.jour::text || ' ' || lpad(t.start_hour::text, 2, '0') || ':00:00')::timestamp
        at time zone 'Europe/Paris') as debut,
      extract(isodow from j.jour)::smallint as isodow
    from jours j
    join public.coach_slot_templates t
      on t.isodow = extract(isodow from j.jour)::smallint
     and t.is_active
     and t.club_id = p_club_id
     and (p_space_id is null or t.space_id = p_space_id)
  )
  select
    c.club_id,
    c.space_id,
    c.debut as starts_at,
    c.debut + interval '1 hour' as ends_at,
    tf.amount_cents,
    th.kind::text as tariff,
    sp.capacity::int,
    coalesce(occ.pris, 0)::int as taken,
    case
      -- Ordre volontaire : un créneau passé reste `past` même s'il était bloqué,
      -- parce que c'est l'information utile pour qui regarde le planning.
      when c.debut <= now() then 'past'
      when bl.id is not null or br.id is not null then 'blocked'
      when coalesce(occ.pris, 0) >= sp.capacity then 'full'
      else 'open'
    end as state
  from creneaux c
  join public.coach_spaces sp
    on sp.club_id = c.club_id and sp.id = c.space_id
  join public.coach_tariff_hours th
    on th.start_hour = c.start_hour
  join public.coach_tariffs tf
    on tf.kind = th.kind
  -- Blocage ponctuel daté (POST /admin/slot-blocks).
  left join public.coach_slot_blocks bl
    on bl.club_id = c.club_id and bl.space_id = c.space_id and bl.starts_at = c.debut
  -- Blocage récurrent (boxe éducative). Portet est seedé `is_active = false`.
  left join public.coach_slot_block_rules br
    on br.club_id = c.club_id and br.space_id = c.space_id
   and br.isodow = c.isodow and br.start_hour = c.start_hour and br.is_active
  left join lateral (
    select count(*)::int as pris
    from public.coach_reservations r
    where r.club_id  = c.club_id
      and r.space_id = c.space_id
      and r.starts_at = c.debut
      and (
        r.status in ('awaiting_signature', 'confirmed')
        or (r.status = 'held' and r.hold_expires_at > now())
      )
  ) occ on true
  order by c.debut, c.space_id
$$;

comment on function public.coach_slot_grid(text, text, date, date) is
  'Grille de créneaux : sert GET /clubs/:id/slots et le planning du back-office. '
  'Ne renvoie AUCUN nom de coach — le payload public du cahier §4 l''interdit. '
  'Un hold expiré ne compte pas dans `taken`, même si le cron n''est pas passé.';

-- Lecture publique : la grille ne contient aucune donnée personnelle, seulement
-- des compteurs. C'est exactement ce que le cahier §4 autorise à un visiteur.
revoke execute on function public.coach_slot_grid(text, text, date, date) from public;
grant execute on function public.coach_slot_grid(text, text, date, date)
  to anon, authenticated, service_role;
