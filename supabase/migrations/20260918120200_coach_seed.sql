-- Seed 5 clubs, espaces, tarifs, éducative, settings, documents. Junior.

insert into public.coach_clubs (id, name, city, address_short, presentation, sort_order)
values
  ('minimes', 'Boxing Center Toulouse Minimes', 'Toulouse', 'Minimes', 'Club Boxing Center — Minimes.', 1),
  ('st-cyprien', 'Boxing Center Toulouse St-Cyprien', 'Toulouse', 'Saint-Cyprien', 'Club Boxing Center — Saint-Cyprien.', 2),
  ('etats-unis', 'Boxing Center Toulouse États-Unis', 'Toulouse', 'États-Unis', 'Club Boxing Center — États-Unis.', 3),
  ('ramonville', 'Boxing Center Ramonville', 'Ramonville-Saint-Agne', 'Ramonville', 'Club Boxing Center — Ramonville.', 4),
  ('portet', 'Boxing Center Portet-sur-Garonne', 'Portet-sur-Garonne', 'Portet', 'Club Boxing Center — Portet-sur-Garonne.', 5)
on conflict (id) do update set
  name = excluded.name,
  city = excluded.city,
  address_short = excluded.address_short,
  presentation = excluded.presentation,
  sort_order = excluded.sort_order;

insert into public.coach_spaces (club_id, id, label, sort_order)
values
  ('minimes', 'salle', 'Salle', 1),
  ('st-cyprien', 'salle', 'Salle', 1),
  ('ramonville', 'salle', 'Salle', 1),
  ('etats-unis', 'boxe', 'Espace Boxe', 1),
  ('etats-unis', 'mma-sol', 'Espace MMA / Sol', 2),
  ('etats-unis', 'fitness', 'Espace Fitness', 3),
  ('portet', 'boxe-fitness', 'Boxe et Fitness', 1),
  ('portet', 'mma-sol', 'MMA / Sol', 2)
on conflict (club_id, id) do update set
  label = excluded.label,
  sort_order = excluded.sort_order;

insert into public.coach_settings (key, value, public_read)
values
  ('max_active_reservations', '3'::jsonb, true),
  ('capacity_per_slot', '2'::jsonb, true),
  ('hold_ttl_seconds', '600'::jsonb, true),
  ('cancel_min_hours', '24'::jsonb, true),
  ('qr_early_minutes', '5'::jsonb, true),
  ('timezone', '"Europe/Paris"'::jsonb, true)
on conflict (key) do update set value = excluded.value, public_read = excluded.public_read;

insert into public.coach_tariffs (kind, hour_start, amount_cents)
values
  ('offpeak', 10, 1000),
  ('offpeak', 11, 1000),
  ('offpeak', 14, 1000),
  ('offpeak', 15, 1000),
  ('offpeak', 16, 1000),
  ('peak', 12, 1500),
  ('peak', 13, 1500),
  ('peak', 17, 1500),
  ('peak', 18, 1500)
on conflict (kind, hour_start) do update set amount_cents = excluded.amount_cents;

-- Templates lun–sam 10h→18h (début) pour chaque espace
insert into public.coach_slot_templates (club_id, space_id, dow, hour_start, enabled)
select s.club_id, s.id, d.dow, h.hour_start, true
from public.coach_spaces s
cross join generate_series(1, 6) as d(dow)
cross join generate_series(10, 18) as h(hour_start)
on conflict (club_id, space_id, dow, hour_start) do nothing;

-- Éducative mercredi + samedi 15h et 16h — tous les clubs sauf Portet
insert into public.coach_slot_block_rules (club_id, space_id, dow, hour_start, reason, enabled)
select s.club_id, s.id, b.dow, b.hour_start, 'educative', true
from public.coach_spaces s
cross join (
  values (3, 15), (3, 16), (6, 15), (6, 16)
) as b(dow, hour_start)
where s.club_id <> 'portet'
on conflict (club_id, space_id, dow, hour_start) do nothing;

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
