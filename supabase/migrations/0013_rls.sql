-- =============================================================================
-- 0013 — Row Level Security : toute la matrice du cahier §12
-- =============================================================================
-- LA CONFUSION À NE PAS FAIRE
-- Supabase n'a que TROIS rôles Postgres côté API : anon, authenticated,
-- service_role. `coach`, `manager_salle`, `direction`, `service` du cahier §1.1
-- sont des CLAIMS JWT, pas des rôles Postgres. Conséquences directes :
--   — un GRANT/REVOKE s'applique à `authenticated`, donc AU COACH ET AU MANAGER
--     ET À LA DIRECTION en même temps. On ne peut pas cacher une colonne au
--     manager seul par un GRANT ;
--   — la séparation manager / direction se fait UNIQUEMENT par RLS (lignes) et
--     par vues (colonnes, voir 0014).
--
-- LE PIÈGE DOCUMENTÉ, ET C'EST LE PLUS IMPORTANT DE CE FICHIER
-- « A user may perform SELECT, INSERT, etc. on a column if they hold that
--   privilege for either the specific column OR ITS WHOLE TABLE. Granting the
--   privilege at the table level and then revoking it for one column will not do
--   what one might wish. » (postgresql.org/docs/current/sql-grant.html)
-- Donc GRANT SELECT ON coach_reservations puis REVOKE SELECT (qr_jti) NE CACHE
-- RIEN. Il faut révoquer LA TABLE ENTIÈRE, puis granter la liste de colonnes.
-- C'est exactement ce que fait ce fichier, dans cet ordre.
--
-- Conséquence opérationnelle à connaître : avec des privilèges au niveau colonne,
-- un `select=*` sur une table de base échoue en 42501. C'est VOULU. Le navigateur
-- interroge des vues, dont la liste de colonnes est fermée.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Activation — ENABLE **et** FORCE
--
-- Sans FORCE, « row-level security will not be applied when the user is the
-- table owner ». Le propriétaire sur Supabase est `postgres` : sans FORCE, toute
-- la RLS ci-dessous est contournée dès qu'on se connecte en postgres.
-- (Les superutilisateurs et les rôles BYPASSRLS passent outre de toute façon —
-- c'est voulu pour service_role, et c'est précisément pourquoi
-- SUPABASE_SERVICE_ROLE_KEY ne doit JAMAIS atteindre le navigateur.)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'coach_profiles','coach_clubs','coach_spaces','coach_slot_templates',
    'coach_tariff_hours','coach_tariffs','coach_slot_block_rules','coach_slot_blocks',
    'coach_settings','coach_reservations','coach_credits','coach_documents',
    'coach_signatures','coach_deciplus_jobs','coach_events','coach_audit_logs',
    'coach_idempotency_keys','coach_rate_limit_hits'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Table rase côté navigateur, puis re-grant colonne par colonne
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- service_role a besoin d'un accès plein (cron, webhooks, bot du lot A).
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- … sauf sur l'audit, qui reste append-only même pour lui (0009, mur 1).
-- Ce REVOKE vient APRÈS le GRANT ALL ci-dessus : l'ordre n'est pas décoratif.
revoke update, delete, truncate on public.coach_audit_logs from service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. coach_profiles — cahier §12 : « SELECT/UPDATE soi »
--
-- Colonnes ABSENTES des grants, donc invisibles et inécrivables pour TOUT LE
-- MONDE côté API (coach, manager ET direction) : payplug_customer_id,
-- paypal_vault_id, deciplus_member_id, deleted_at.
-- Colonnes lisibles mais NON modifiables par le coach : status, suspended_at,
-- suspended_reason, email, photo_path, consentements. Un PATCH dessus est refusé
-- par POSTGRES, pas par une validation applicative qu'on peut oublier.
-- ─────────────────────────────────────────────────────────────────────────────
grant select (id, first_name, last_name, birth_date, phone, email, address_line,
              postal_code, city, diploma, disciplines, photo_path, status,
              suspended_at, suspended_reason, consent_privacy_at, consent_cgu_at,
              created_at, updated_at)
  on public.coach_profiles to authenticated;

grant update (first_name, last_name, birth_date, phone, address_line,
              postal_code, city, diploma, disciplines)
  on public.coach_profiles to authenticated;

create policy coach_profiles_lecture_soi on public.coach_profiles
  for select to authenticated
  using ( (select auth.uid()) = id );

create policy coach_profiles_maj_soi on public.coach_profiles
  for update to authenticated
  using      ( (select auth.uid()) = id )
  with check ( (select auth.uid()) = id );

create policy coach_profiles_lecture_direction on public.coach_profiles
  for select to authenticated
  using ( (select public.coach_role()) = 'direction' );

-- PAS de policy manager ici : la matrice §12 exige des COLONNES limitées, ce
-- qu'une policy ne sait pas faire. Le manager passe par coach_coaches_staff (0014).

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. coach_reservations
-- Non grantées, donc invisibles à tous : qr_jti, signature_pdf_path, payment_id,
-- seat, idempotency_key, cancel_reason.
-- ─────────────────────────────────────────────────────────────────────────────
grant select (id, coach_id, club_id, space_id, starts_at, ends_at, amount_cents,
              currency, status, payment_status, payment_provider,
              signature_status, signed_at, deciplus_job_status, hold_expires_at,
              qr_valid_from, qr_valid_to, cancelled_at, credit_id, created_at)
  on public.coach_reservations to authenticated;

create policy coach_res_lecture_soi on public.coach_reservations
  for select to authenticated
  using ( (select auth.uid()) = coach_id );

create policy coach_res_lecture_manager on public.coach_reservations
  for select to authenticated
  using ( (select public.coach_role()) = 'manager_salle'
          and club_id = (select public.coach_club()) );

create policy coach_res_lecture_direction on public.coach_reservations
  for select to authenticated
  using ( (select public.coach_role()) = 'direction' );

-- AUCUNE policy INSERT / UPDATE / DELETE pour authenticated. « If enabled and no
-- policies exist for the table, then a default-deny policy is applied. »
-- Toutes les écritures passent par coach_create_hold / coach_cancel_reservation
-- (SECURITY DEFINER) ou par service_role. Le client ne peut donc écrire ni
-- amount_cents, ni payment_status, ni status : c'est la garantie du test §13.13.

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. coach_credits — coach : soi · manager : RIEN · direction : tout
-- ─────────────────────────────────────────────────────────────────────────────
grant select (id, coach_id, amount_cents, initial_amount_cents,
              origin_reservation_id, status, expires_at, created_at)
  on public.coach_credits to authenticated;

create policy coach_credits_lecture_soi on public.coach_credits
  for select to authenticated
  using ( (select auth.uid()) = coach_id );

create policy coach_credits_lecture_direction on public.coach_credits
  for select to authenticated
  using ( (select public.coach_role()) = 'direction' );
-- Manager : aucune policy = refus (matrice §12, colonne « — »).

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. coach_signatures et coach_documents
-- pdf_path n'est granté à PERSONNE : le PDF se lit par flux authentifié (lot A),
-- jamais par une URL qu'on pourrait faire fuiter dans un Referer ou un log.
-- ─────────────────────────────────────────────────────────────────────────────
grant select (id, reservation_id, coach_id, document_id, pdf_sha256, signed_at)
  on public.coach_signatures to authenticated;

create policy coach_sign_lecture_soi on public.coach_signatures
  for select to authenticated
  using ( (select auth.uid()) = coach_id );

create policy coach_sign_lecture_direction on public.coach_signatures
  for select to authenticated
  using ( (select public.coach_role()) = 'direction' );
-- Manager : AUCUNE policy. Matrice §12 : « coach_signatures / PDF — manager : non ».

grant select (id, kind, title, version, is_current, published_at)
  on public.coach_documents to authenticated;

create policy coach_docs_lecture_versions_courantes on public.coach_documents
  for select to authenticated
  using ( is_current or (select public.coach_role()) = 'direction' );

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Référentiel public — lisible sans session (grille SEO, pages clubs)
-- ─────────────────────────────────────────────────────────────────────────────
grant select on public.coach_clubs,
                public.coach_spaces,
                public.coach_slot_templates,
                public.coach_tariff_hours,
                public.coach_tariffs
  to anon, authenticated;

create policy coach_clubs_lecture_publique on public.coach_clubs
  for select to anon, authenticated using ( is_active );

create policy coach_spaces_lecture_publique on public.coach_spaces
  for select to anon, authenticated using ( is_active );

create policy coach_tpl_lecture_publique on public.coach_slot_templates
  for select to anon, authenticated using ( is_active );

create policy coach_th_lecture_publique on public.coach_tariff_hours
  for select to anon, authenticated using ( true );

create policy coach_tf_lecture_publique on public.coach_tariffs
  for select to anon, authenticated using ( true );

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Blocages — lecture publique (afficher l'état `blocked` de la grille),
--    écriture manager sur SON club, direction partout.
--
-- Le WITH CHECK n'est pas décoratif : sans lui, un manager de Minimes pourrait
-- CRÉER un blocage sur Portet, parce que le USING ne filtre que les lignes
-- EXISTANTES. C'est l'oubli classique qui fait passer le test §13.2 du cahier en
-- lecture et échouer en écriture.
-- ─────────────────────────────────────────────────────────────────────────────
grant select on public.coach_slot_blocks, public.coach_slot_block_rules
  to anon, authenticated;

create policy coach_blocks_lecture on public.coach_slot_blocks
  for select to anon, authenticated using ( true );

create policy coach_rules_lecture on public.coach_slot_block_rules
  for select to anon, authenticated using ( is_active );

grant insert, update, delete on public.coach_slot_blocks to authenticated;

create policy coach_blocks_ecriture_manager on public.coach_slot_blocks
  for all to authenticated
  using      ( (select public.coach_role()) = 'manager_salle'
               and club_id = (select public.coach_club()) )
  with check ( (select public.coach_role()) = 'manager_salle'
               and club_id = (select public.coach_club()) );

create policy coach_blocks_ecriture_direction on public.coach_slot_blocks
  for all to authenticated
  using      ( (select public.coach_role()) = 'direction' )
  with check ( (select public.coach_role()) = 'direction' );

-- Règles récurrentes : la direction les pilote depuis le back-office.
grant insert, update, delete on public.coach_slot_block_rules to authenticated;

create policy coach_rules_ecriture_direction on public.coach_slot_block_rules
  for all to authenticated
  using      ( (select public.coach_role()) = 'direction' )
  with check ( (select public.coach_role()) = 'direction' );

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. coach_settings — coach : clés publiques · staff : tout · direction : UPDATE
-- ─────────────────────────────────────────────────────────────────────────────
grant select on public.coach_settings to anon, authenticated;
grant update on public.coach_settings to authenticated;

create policy coach_settings_cles_publiques on public.coach_settings
  for select to anon, authenticated
  using ( is_public );

create policy coach_settings_staff on public.coach_settings
  for select to authenticated
  using ( (select public.coach_role()) in ('manager_salle','direction') );

create policy coach_settings_maj_direction on public.coach_settings
  for update to authenticated
  using      ( (select public.coach_role()) = 'direction' )
  with check ( (select public.coach_role()) = 'direction' );

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. coach_audit_logs — SELECT seul (les murs anti-mutation sont en 0009)
-- ─────────────────────────────────────────────────────────────────────────────
grant select on public.coach_audit_logs to authenticated;

create policy coach_audit_lecture_manager on public.coach_audit_logs
  for select to authenticated
  using ( (select public.coach_role()) = 'manager_salle'
          and club_id = (select public.coach_club()) );

create policy coach_audit_lecture_direction on public.coach_audit_logs
  for select to authenticated
  using ( (select public.coach_role()) = 'direction' );
-- Coach : aucune policy (matrice §12 : « — »). L'INSERT vient des fonctions
-- SECURITY DEFINER et de service_role, jamais d'authenticated.

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. coach_deciplus_jobs, coach_events, coach_idempotency_keys,
--     coach_rate_limit_hits — AUCUN grant, AUCUNE policy pour anon/authenticated.
--
-- La matrice §12 dit que le manager voit « le statut agrégé via résa » : c'est
-- exactement coach_reservations.deciplus_job_status, déjà granté au §4 ci-dessus.
-- La table de jobs, elle, reste fermée. Le blanket REVOKE du §2 a déjà fait le
-- travail ; on le réaffirme ici pour que ce soit lisible sans dérouler le fichier.
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on public.coach_deciplus_jobs      from anon, authenticated;
revoke all on public.coach_events             from anon, authenticated;
revoke all on public.coach_idempotency_keys   from anon, authenticated;
revoke all on public.coach_rate_limit_hits    from anon, authenticated;
