-- =============================================================================
-- 0000 — Compatibilité Supabase sur un Postgres nu
-- =============================================================================
-- Un Postgres local n'a ni le schéma `auth`, ni les rôles d'API de Supabase.
-- Toutes les policies de ce lot s'appuient sur `auth.uid()` / `auth.jwt()` et sur
-- les rôles `anon` / `authenticated` / `service_role` : sans eux, rien ne se crée.
--
-- Tout ici est CONDITIONNEL. Sur un vrai projet Supabase ces objets existent déjà
-- et cette migration ne fait donc strictement rien. C'est la seule façon d'avoir
-- le même jeu de migrations en local, en CI et en production.
--
-- Les définitions reproduisent celles de Supabase : lecture des claims JWT posés
-- par PostgREST dans les GUC `request.jwt.claims` (objet JSON complet) et
-- `request.jwt.claim.<nom>` (forme dépréciée, encore émise par certaines versions).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Schéma auth
-- ─────────────────────────────────────────────────────────────────────────────
create schema if not exists auth;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rôles d'API
--    NOLOGIN : on ne s'y connecte pas directement, PostgREST fait un SET ROLE.
--    NOINHERIT : un rôle ne récupère pas passivement les droits d'un autre.
--    BYPASSRLS sur service_role : le cron, les webhooks et le bot en ont besoin.
--    C'est exactement pourquoi SUPABASE_SERVICE_ROLE_KEY ne doit jamais atteindre
--    le navigateur.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;

  -- Rattrapage : un service_role créé sans BYPASSRLS ne pourrait pas faire tourner
  -- le cron. Sur Supabase l'attribut est déjà posé, cette branche ne s'exécute pas.
  if exists (select 1 from pg_roles where rolname = 'service_role' and not rolbypassrls) then
    execute 'alter role service_role with bypassrls';
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth   to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. auth.users — cible de la clé étrangère de coach_profiles
--    Sur Supabase, c'est GoTrue qui possède cette table et elle est déjà là.
--    En local on en crée le strict minimum : l'identifiant et l'e-mail.
--    Aucune logique d'authentification n'est reproduite ici, ce n'est pas le sujet.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users'
  ) then
    execute $ddl$
      create table auth.users (
        id                uuid primary key default gen_random_uuid(),
        email             text,
        raw_app_meta_data jsonb not null default '{}'::jsonb,
        created_at        timestamptz not null default now()
      )
    $ddl$;
    execute $ddl$ comment on table auth.users is
      'Doublure locale de la table GoTrue. Sur Supabase, la vraie table existe déjà et celle-ci n''est jamais créée.' $ddl$;
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. auth.jwt() / auth.uid() / auth.role()
--    Créées seulement si absentes : sur Supabase on ne réécrit jamais par-dessus
--    les fonctions de la plateforme.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'jwt'
  ) then
    execute $fn$
      create function auth.jwt() returns jsonb
      language sql stable
      as $body$
        select coalesce(
          nullif(current_setting('request.jwt.claim',  true), ''),
          nullif(current_setting('request.jwt.claims', true), '')
        )::jsonb
      $body$
    $fn$;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'uid'
  ) then
    execute $fn$
      create function auth.uid() returns uuid
      language sql stable
      as $body$
        select nullif(
          coalesce(
            nullif(current_setting('request.jwt.claim.sub', true), ''),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
          ), ''
        )::uuid
      $body$
    $fn$;
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'auth' and p.proname = 'role'
  ) then
    execute $fn$
      create function auth.role() returns text
      language sql stable
      as $body$
        select nullif(
          coalesce(
            nullif(current_setting('request.jwt.claim.role', true), ''),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
          ), ''
        )
      $body$
    $fn$;
  end if;
end
$$;

-- Les policies appellent ces fonctions en tant qu'utilisateur courant : sans
-- EXECUTE, toute requête d'un coach échouerait en 42501.
grant execute on function auth.jwt()  to anon, authenticated, service_role;
grant execute on function auth.uid()  to anon, authenticated, service_role;
grant execute on function auth.role() to anon, authenticated, service_role;
