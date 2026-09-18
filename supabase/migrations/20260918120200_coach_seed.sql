-- Seed 5 clubs, espaces, tarifs, éducative, settings, documents. Junior.
-- Idempotent : pas de ON CONFLICT (évite 42P10 si une unique manque).

insert into public.coach_clubs (id, name, city, address_short, presentation, sort_order)
select v.id, v.name, v.city, v.address_short, v.presentation, v.sort_order
from (
  values
    ('minimes', 'Boxing Center Toulouse Minimes', 'Toulouse', 'Minimes', 'Club Boxing Center — Minimes.', 1),
    ('st-cyprien', 'Boxing Center Toulouse St-Cyprien', 'Toulouse', 'Saint-Cyprien', 'Club Boxing Center — Saint-Cyprien.', 2),
    ('etats-unis', 'Boxing Center Toulouse États-Unis', 'Toulouse', 'États-Unis', 'Club Boxing Center — États-Unis.', 3),
    ('ramonville', 'Boxing Center Ramonville', 'Ramonville-Saint-Agne', 'Ramonville', 'Club Boxing Center — Ramonville.', 4),
    ('portet', 'Boxing Center Portet-sur-Garonne', 'Portet-sur-Garonne', 'Portet', 'Club Boxing Center — Portet-sur-Garonne.', 5)
) as v(id, name, city, address_short, presentation, sort_order)
where not exists (select 1 from public.coach_clubs c where c.id = v.id);

update public.coach_clubs c set
  name = v.name,
  city = v.city,
  address_short = v.address_short,
  presentation = v.presentation,
  sort_order = v.sort_order
from (
  values
    ('minimes', 'Boxing Center Toulouse Minimes', 'Toulouse', 'Minimes', 'Club Boxing Center — Minimes.', 1),
    ('st-cyprien', 'Boxing Center Toulouse St-Cyprien', 'Toulouse', 'Saint-Cyprien', 'Club Boxing Center — Saint-Cyprien.', 2),
    ('etats-unis', 'Boxing Center Toulouse États-Unis', 'Toulouse', 'États-Unis', 'Club Boxing Center — États-Unis.', 3),
    ('ramonville', 'Boxing Center Ramonville', 'Ramonville-Saint-Agne', 'Ramonville', 'Club Boxing Center — Ramonville.', 4),
    ('portet', 'Boxing Center Portet-sur-Garonne', 'Portet-sur-Garonne', 'Portet', 'Club Boxing Center — Portet-sur-Garonne.', 5)
) as v(id, name, city, address_short, presentation, sort_order)
where c.id = v.id;

insert into public.coach_spaces (club_id, id, label, sort_order)
select v.club_id, v.id, v.label, v.sort_order
from (
  values
    ('minimes', 'salle', 'Salle', 1),
    ('st-cyprien', 'salle', 'Salle', 1),
    ('ramonville', 'salle', 'Salle', 1),
    ('etats-unis', 'boxe', 'Espace Boxe', 1),
    ('etats-unis', 'mma-sol', 'Espace MMA / Sol', 2),
    ('etats-unis', 'fitness', 'Espace Fitness', 3),
    ('portet', 'boxe-fitness', 'Boxe et Fitness', 1),
    ('portet', 'mma-sol', 'MMA / Sol', 2)
) as v(club_id, id, label, sort_order)
where not exists (
  select 1 from public.coach_spaces s where s.club_id = v.club_id and s.id = v.id
);

update public.coach_spaces s set
  label = v.label,
  sort_order = v.sort_order
from (
  values
    ('minimes', 'salle', 'Salle', 1),
    ('st-cyprien', 'salle', 'Salle', 1),
    ('ramonville', 'salle', 'Salle', 1),
    ('etats-unis', 'boxe', 'Espace Boxe', 1),
    ('etats-unis', 'mma-sol', 'Espace MMA / Sol', 2),
    ('etats-unis', 'fitness', 'Espace Fitness', 3),
    ('portet', 'boxe-fitness', 'Boxe et Fitness', 1),
    ('portet', 'mma-sol', 'MMA / Sol', 2)
) as v(club_id, id, label, sort_order)
where s.club_id = v.club_id and s.id = v.id;

insert into public.coach_settings (key, value, public_read)
select v.key, v.value, v.public_read
from (
  values
    ('max_active_reservations', '3'::jsonb, true),
    ('capacity_per_slot', '2'::jsonb, true),
    ('hold_ttl_seconds', '600'::jsonb, true),
    ('cancel_min_hours', '24'::jsonb, true),
    ('qr_early_minutes', '5'::jsonb, true),
    ('timezone', '"Europe/Paris"'::jsonb, true)
) as v(key, value, public_read)
where not exists (select 1 from public.coach_settings s where s.key = v.key);

update public.coach_settings s set
  value = v.value,
  public_read = v.public_read
from (
  values
    ('max_active_reservations', '3'::jsonb, true),
    ('capacity_per_slot', '2'::jsonb, true),
    ('hold_ttl_seconds', '600'::jsonb, true),
    ('cancel_min_hours', '24'::jsonb, true),
    ('qr_early_minutes', '5'::jsonb, true),
    ('timezone', '"Europe/Paris"'::jsonb, true)
) as v(key, value, public_read)
where s.key = v.key;

insert into public.coach_tariffs (kind, hour_start, amount_cents)
select v.kind, v.hour_start, v.amount_cents
from (
  values
    ('offpeak'::public.coach_tariff_kind, 10, 1000),
    ('offpeak', 11, 1000),
    ('offpeak', 14, 1000),
    ('offpeak', 15, 1000),
    ('offpeak', 16, 1000),
    ('peak', 12, 1500),
    ('peak', 13, 1500),
    ('peak', 17, 1500),
    ('peak', 18, 1500)
) as v(kind, hour_start, amount_cents)
where not exists (
  select 1 from public.coach_tariffs t
  where t.kind = v.kind and t.hour_start = v.hour_start
);

update public.coach_tariffs t set amount_cents = v.amount_cents
from (
  values
    ('offpeak'::public.coach_tariff_kind, 10, 1000),
    ('offpeak', 11, 1000),
    ('offpeak', 14, 1000),
    ('offpeak', 15, 1000),
    ('offpeak', 16, 1000),
    ('peak', 12, 1500),
    ('peak', 13, 1500),
    ('peak', 17, 1500),
    ('peak', 18, 1500)
) as v(kind, hour_start, amount_cents)
where t.kind = v.kind and t.hour_start = v.hour_start;

insert into public.coach_slot_templates (club_id, space_id, dow, hour_start, enabled)
select s.club_id, s.id, d.dow, h.hour_start, true
from public.coach_spaces s
cross join generate_series(1, 6) as d(dow)
cross join generate_series(10, 18) as h(hour_start)
where not exists (
  select 1
  from public.coach_slot_templates t
  where t.club_id = s.club_id
    and t.space_id = s.id
    and t.dow = d.dow
    and t.hour_start = h.hour_start
);

insert into public.coach_slot_block_rules (club_id, space_id, dow, hour_start, reason, enabled)
select s.club_id, s.id, b.dow, b.hour_start, 'educative', true
from public.coach_spaces s
cross join (
  values (3, 15), (3, 16), (6, 15), (6, 16)
) as b(dow, hour_start)
where s.club_id <> 'portet'
  and not exists (
    select 1
    from public.coach_slot_block_rules r
    where r.club_id = s.club_id
      and r.space_id = s.id
      and r.dow = b.dow
      and r.hour_start = b.hour_start
  );

insert into public.coach_documents (kind, title, version, body_html, current)
select x.kind, x.title, '1.0', x.body, true
from (
  values
    ('cgv'::public.coach_document_kind, 'Conditions générales de vente', '<p>CGV Boxing Center — location de créneaux coachs. Version 1.0.</p>'),
    ('reglement'::public.coach_document_kind, 'Règlement intérieur', '<p>Règlement intérieur des clubs Boxing Center. Version 1.0.</p>'),
    ('decharge'::public.coach_document_kind, 'Décharge de responsabilité', '<p>Décharge coach indépendant — Boxing Center. Version 1.0.</p>')
) as x(kind, title, body)
where not exists (
  select 1 from public.coach_documents d where d.kind = x.kind and d.current
);
