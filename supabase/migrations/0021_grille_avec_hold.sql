-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 — La grille dit aussi COMBIEN DE TEMPS il reste à un hold
--
-- La question d'un responsable de salle devant son planning n'est pas « combien
-- de places restent ». C'est « est-ce que ça va se confirmer ».
--
-- Aujourd'hui, une place tenue depuis neuf minutes et une place tenue depuis
-- trente secondes s'affichent exactement pareil : `1/2`. L'information existe
-- pourtant déjà — `hold_expires_at` est en base depuis la première migration —
-- elle n'était simplement jamais remontée.
--
-- On ajoute donc `hold_expire_le` : la plus PROCHE expiration parmi les holds
-- vivants du créneau. La plus proche, parce que c'est elle qui libérera une place
-- en premier, et donc la seule qui change quelque chose pour la salle.
--
-- `null` quand aucun hold n'est en cours : les places prises le sont par des
-- réservations payées ou signées, plus rien n'expire.
--
-- Note : on REMPLACE la fonction sans changer les colonnes existantes ni leur
-- ordre. Un `select *` ailleurs continue de fonctionner ; une colonne apparaît
-- à la fin. C'est un ajout non cassant, au sens du cahier §14.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.coach_slot_grid(text, text, date, date);

create function public.coach_slot_grid(
  p_club_id  text,
  p_space_id text default null,
  p_from     date default current_date,
  p_to       date default current_date + 6
) returns table (
  club_id        text,
  space_id       text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  amount_cents   int,
  tariff         text,
  capacity       int,
  taken          int,
  state          text,
  hold_expire_le timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  with bornes as (
    -- Garde-fou : jamais plus de 62 jours d'un coup. Sans lui, un
    -- `?from=2020-01-01&to=2099-12-31` fabrique des millions de lignes.
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
    end as state,
    occ.expire_le as hold_expire_le
  from creneaux c
  join public.coach_spaces sp
    on sp.club_id = c.club_id and sp.id = c.space_id
  join public.coach_tariff_hours th
    on th.start_hour = c.start_hour
  join public.coach_tariffs tf
    on tf.kind = th.kind
  left join public.coach_slot_blocks bl
    on bl.club_id = c.club_id and bl.space_id = c.space_id and bl.starts_at = c.debut
  left join public.coach_slot_block_rules br
    on br.club_id = c.club_id and br.space_id = c.space_id
   and br.isodow = c.isodow and br.start_hour = c.start_hour and br.is_active
  left join lateral (
    select
      count(*)::int as pris,
      -- La plus proche expiration parmi les holds vivants : c'est elle qui
      -- libérera une place en premier.
      min(r.hold_expires_at) filter (
        where r.status = 'held' and r.hold_expires_at > now()
      ) as expire_le
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
  'Un hold expiré ne compte pas dans `taken`, même si le cron n''est pas passé. '
  '`hold_expire_le` donne la plus proche libération à venir, ou null.';

revoke execute on function public.coach_slot_grid(text, text, date, date) from public;
grant execute on function public.coach_slot_grid(text, text, date, date)
  to anon, authenticated, service_role;
