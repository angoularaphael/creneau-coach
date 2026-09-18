-- =============================================================================
-- 0015 — Seed du référentiel
-- =============================================================================
-- Ce seed est IDEMPOTENT (on conflict do nothing) : il peut être rejoué sans
-- écraser un réglage modifié au back-office. C'est ce qui permet de le faire
-- tourner en préproduction sans casser ce que la direction y a réglé.
--
-- Il ne crée AUCUN utilisateur, AUCUN coach, AUCUNE réservation. Les comptes
-- viennent de GoTrue, pas d'une migration.
-- =============================================================================

-- ── Clubs (cahier §3.2) ──────────────────────────────────────────────────────
insert into public.coach_clubs (id, name, city) values
  ('minimes',    'Boxing Center Minimes',      'Toulouse'),
  ('st-cyprien', 'Boxing Center Saint-Cyprien','Toulouse'),
  ('etats-unis', 'Boxing Center États-Unis',   'Toulouse'),
  ('ramonville', 'Boxing Center Ramonville',   'Ramonville-Saint-Agne'),
  ('portet',     'Boxing Center Portet',       'Portet-sur-Garonne')
on conflict (id) do nothing;

-- ── Espaces (cahier §3.2, miroir de ESPACES_PAR_CLUB dans src/domain/contrat.ts)
-- lock_key : entier stable pour pg_advisory_xact_lock. Ces valeurs sont FIGÉES —
-- les permuter reviendrait à déplacer les verrous d'un espace vers un autre.
-- Un nouvel espace prend le prochain entier libre, jamais un recyclé.
insert into public.coach_spaces (club_id, id, name, capacity, lock_key) values
  ('minimes',    'salle',        'Salle',          2, 1),
  ('st-cyprien', 'salle',        'Salle',          2, 2),
  ('ramonville', 'salle',        'Salle',          2, 3),
  ('etats-unis', 'boxe',         'Boxe',           2, 4),
  ('etats-unis', 'mma-sol',      'MMA / Sol',      2, 5),
  ('etats-unis', 'fitness',      'Fitness',        2, 6),
  ('portet',     'boxe-fitness', 'Boxe / Fitness', 2, 7),
  ('portet',     'mma-sol',      'MMA / Sol',      2, 8)
on conflict (club_id, id) do nothing;

-- ── Tarifs (cahier §3.4) ─────────────────────────────────────────────────────
insert into public.coach_tariffs (kind, amount_cents) values
  ('offpeak', 1000),          -- 10,00 €
  ('peak',    1500)           -- 15,00 €
on conflict (kind) do nothing;

-- Découpage heures creuses / heures pleines :
--   offpeak : 10-11, 11-12, 14-15, 15-16, 16-17   (5 créneaux)
--   peak    : 12-13, 13-14, 17-18, 18-19          (4 créneaux)
--   => 9 créneaux au total, de 10h à 19h. Le dernier COMMENCE à 18h.
insert into public.coach_tariff_hours (start_hour, kind) values
  (10,'offpeak'), (11,'offpeak'), (12,'peak'),    (13,'peak'),    (14,'offpeak'),
  (15,'offpeak'), (16,'offpeak'), (17,'peak'),    (18,'peak')
on conflict (start_hour) do nothing;

-- ── Créneaux types : lun(1)–sam(6), heures de début 10..18, pour chaque espace ─
-- 8 espaces × 6 jours × 9 heures = 432 lignes.
insert into public.coach_slot_templates (club_id, space_id, isodow, start_hour)
select s.club_id, s.id, d.isodow, h.start_hour
from public.coach_spaces s
cross join generate_series(1, 6)   as d(isodow)
cross join generate_series(10, 18) as h(start_hour)
on conflict do nothing;

-- ── Blocages boxe éducative (cahier §3.3) ────────────────────────────────────
-- Mercredi (3) et samedi (6), les créneaux qui COMMENCENT à 15h et à 16h.
-- Portet : les lignes sont créées mais INACTIVES — le club est paramétrable par
-- le back-office et ne suit pas ce défaut. Les créer inactives plutôt que de ne
-- pas les créer, c'est laisser à la direction un interrupteur au lieu d'un ticket.
insert into public.coach_slot_block_rules (club_id, space_id, isodow, start_hour, reason, is_active)
select s.club_id, s.id, d.isodow, h.start_hour, 'educative', (s.club_id <> 'portet')
from public.coach_spaces s
cross join (values (3), (6))   as d(isodow)
cross join (values (15), (16)) as h(start_hour)
on conflict (club_id, space_id, isodow, start_hour) do nothing;

-- ── Réglages direction (cahier §3.9) ─────────────────────────────────────────
-- is_public = true : lisible par un coach et par la grille publique.
-- offpeak_cents / peak_cents de .env.example ne sont PAS recopiés ici : la vérité
-- des montants est coach_tariffs, une seule fois. Deux sources pour un prix,
-- c'est la garantie qu'elles divergeront.
insert into public.coach_settings (key, value, is_public) values
  ('max_active_reservations', '3'::jsonb,    true),
  ('capacity_per_slot',       '2'::jsonb,    true),   -- défaut à la création d'un espace
  ('hold_ttl_seconds',        '600'::jsonb,  true),
  ('cancel_min_hours',        '24'::jsonb,   true),
  ('qr_early_minutes',        '5'::jsonb,    true),
  ('credit_validity_months',  'null'::jsonb, false)   -- null = jamais expiré (§19 q.6)
on conflict (key) do nothing;

-- ── Garde-fous du seed ───────────────────────────────────────────────────────
-- Un seed silencieusement incomplet est pire qu'un seed absent : on construit
-- dessus sans le savoir. On vérifie donc les comptes ici, dans la transaction de
-- la migration — si ça ne colle pas, la migration est annulée entièrement.
do $$
declare
  v_clubs   int;
  v_spaces  int;
  v_tariffs int;
  v_hours   int;
  v_tpl     int;
  v_rules   int;
begin
  select count(*) into v_clubs   from public.coach_clubs;
  select count(*) into v_spaces  from public.coach_spaces;
  select count(*) into v_tariffs from public.coach_tariffs;
  select count(*) into v_hours   from public.coach_tariff_hours;
  select count(*) into v_tpl     from public.coach_slot_templates;
  select count(*) into v_rules   from public.coach_slot_block_rules;

  if v_clubs <> 5 then
    raise exception 'seed : % clubs au lieu de 5', v_clubs;
  end if;
  if v_spaces <> 8 then
    raise exception 'seed : % espaces au lieu de 8', v_spaces;
  end if;
  if v_tariffs <> 2 then
    raise exception 'seed : % tarifs au lieu de 2 (offpeak, peak)', v_tariffs;
  end if;
  if v_hours <> 9 then
    raise exception 'seed : % heures tarifées au lieu de 9 (10h..18h de début)', v_hours;
  end if;
  if v_tpl <> 432 then
    raise exception 'seed : % créneaux types au lieu de 432 (8 espaces × 6 jours × 9 heures)', v_tpl;
  end if;
  if v_rules <> 32 then
    raise exception 'seed : % règles éducative au lieu de 32 (8 espaces × 2 jours × 2 heures)', v_rules;
  end if;

  raise notice 'seed : % clubs, % espaces, % créneaux types, % règles éducative (dont % actives).',
    v_clubs, v_spaces, v_tpl, v_rules,
    (select count(*) from public.coach_slot_block_rules where is_active);
end $$;
