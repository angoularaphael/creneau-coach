-- =============================================================================
-- 0009 — coach_audit_logs, append-only
-- =============================================================================
-- « Append-only » veut dire : personne ne réécrit l'histoire. Pas le coach, pas
-- le manager, pas la direction, pas le propriétaire de la table.
--
-- QUATRE MURS SUPERPOSÉS, du plus faible au plus fort :
--   1. REVOKE des privilèges de mutation pour les rôles d'API ;
--   2. RLS activée SANS aucune policy UPDATE/DELETE — « If enabled and no
--      policies exist for the table, then a default-deny policy is applied » ;
--   3. FORCE ROW LEVEL SECURITY — sans elle, « row-level security will not be
--      applied when the user is the table owner ». Le propriétaire sur Supabase
--      est `postgres` : sans FORCE, toute la RLS de ce lot est contournée dès
--      qu'on se connecte en postgres ;
--   4. des TRIGGERS — le seul mur qui vaut AUSSI pour le propriétaire.
--
-- LIMITE ÉNONCÉE HONNÊTEMENT : un superutilisateur peut faire
-- ALTER TABLE … DISABLE TRIGGER. Aucun dispositif interne à Postgres n'y résiste.
-- Au-delà de ce point, ce qui fait foi ce sont les journaux Supabase et la
-- rotation des accès service_role. On ne promet pas plus que ça.
-- =============================================================================

create table public.coach_audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid,
  role        text,
  action      text not null,
  club_id     text,
  target_type text,
  target_id   text,
  -- meta : JAMAIS de PAN, JAMAIS de token QR, JAMAIS de secret, JAMAIS de
  -- chemin de PDF signé (cahier §3.8 et spec-04 §10).
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.coach_audit_logs is
  'Journal d''audit append-only. Ni UPDATE, ni DELETE, ni TRUNCATE — y compris pour la direction et le propriétaire.';

comment on column public.coach_audit_logs.meta is
  'Aucune donnée de paiement, aucun token, aucun secret, aucun chemin de PDF. Seulement de quoi rejouer une décision.';

create index coach_audit_par_club  on public.coach_audit_logs (club_id, created_at desc);
create index coach_audit_par_cible on public.coach_audit_logs (target_type, target_id, created_at desc);
create index coach_audit_par_acteur on public.coach_audit_logs (actor_id, created_at desc);

-- ── Mur 1 : privilèges ───────────────────────────────────────────────────────
revoke update, delete, truncate on public.coach_audit_logs from anon, authenticated, service_role;
grant  insert, select           on public.coach_audit_logs to   service_role;

-- ── Mur 2 et 3 : RLS activée et FORCÉE ──────────────────────────────────────
alter table public.coach_audit_logs enable row level security;
alter table public.coach_audit_logs force  row level security;

-- ── Mur 4 : les triggers ────────────────────────────────────────────────────
create or replace function public.coach_audit_append_only()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'coach_audit_logs est append-only (tentative de %)', tg_op
    using errcode = '42501';
end;
$$;

create trigger coach_audit_no_update
  before update on public.coach_audit_logs
  for each row execute function public.coach_audit_append_only();

create trigger coach_audit_no_delete
  before delete on public.coach_audit_logs
  for each row execute function public.coach_audit_append_only();

-- TRUNCATE ne déclenche AUCUN trigger de ligne : c'est le trou classique, et
-- c'est exactement la commande qu'on utiliserait pour effacer des traces.
create trigger coach_audit_no_truncate
  before truncate on public.coach_audit_logs
  for each statement execute function public.coach_audit_append_only();
