-- ═══════════════════════════════════════════════════════════════════════════
-- 0020 — Créer un coach d'essai depuis le banc
--
-- `coach_profiles.id` référence `auth.users(id)`. Cette clé étrangère est
-- volontaire : elle reproduit Supabase fidèlement et interdit un profil orphelin
-- sans compte. Mais PostgREST n'expose pas le schéma `auth`, donc supabase-js ne
-- peut pas y insérer. Sans cette fonction, le back-office ne peut pas fabriquer
-- le coach dont il a besoin pour éprouver le moteur.
--
-- Sur Supabase, `auth.users` appartient à GoTrue et compte 35 colonnes, la
-- plupart NOT NULL. On n'écrit que le strict nécessaire, et **uniquement** si la
-- colonne existe — c'est ce qui permet au même fichier de tourner sur le Postgres
-- local (doublure à 4 colonnes) et sur Supabase.
--
-- Garde-fou : l'adresse doit se terminer par `.invalid`, un domaine réservé par
-- la RFC 2606 qui ne peut recevoir aucun courrier. Un coach d'essai ne peut donc
-- jamais recevoir par accident un mail de confirmation destiné à un vrai client.
-- Réservée à `service_role`.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.coach_creer_utilisateur_essai(
  p_id    uuid,
  p_email text
) returns void
language plpgsql
security definer
set search_path to 'auth', 'public', 'pg_temp'
as $$
declare
  v_colonnes text[];
  v_sql      text;
begin
  if p_email is null or p_email not like '%.invalid' then
    raise exception 'un coach d''essai doit avoir une adresse en .invalid (reçu : %)', p_email
      using errcode = '22023';
  end if;

  select array_agg(column_name::text) into v_colonnes
  from information_schema.columns
  where table_schema = 'auth' and table_name = 'users';

  v_sql := 'insert into auth.users (id, email';
  if 'raw_app_meta_data'  = any(v_colonnes) then v_sql := v_sql || ', raw_app_meta_data'; end if;
  if 'raw_user_meta_data' = any(v_colonnes) then v_sql := v_sql || ', raw_user_meta_data'; end if;
  if 'instance_id'        = any(v_colonnes) then v_sql := v_sql || ', instance_id'; end if;
  if 'aud'                = any(v_colonnes) then v_sql := v_sql || ', aud'; end if;
  if 'role'               = any(v_colonnes) then v_sql := v_sql || ', role'; end if;
  if 'created_at'         = any(v_colonnes) then v_sql := v_sql || ', created_at'; end if;
  if 'updated_at'         = any(v_colonnes) then v_sql := v_sql || ', updated_at'; end if;

  v_sql := v_sql || ') values ($1, $2';
  if 'raw_app_meta_data'  = any(v_colonnes) then v_sql := v_sql || ', ''{"role":"coach","essai":true}''::jsonb'; end if;
  if 'raw_user_meta_data' = any(v_colonnes) then v_sql := v_sql || ', ''{}''::jsonb'; end if;
  if 'instance_id'        = any(v_colonnes) then v_sql := v_sql || ', ''00000000-0000-0000-0000-000000000000''::uuid'; end if;
  if 'aud'                = any(v_colonnes) then v_sql := v_sql || ', ''authenticated'''; end if;
  if 'role'               = any(v_colonnes) then v_sql := v_sql || ', ''authenticated'''; end if;
  if 'created_at'         = any(v_colonnes) then v_sql := v_sql || ', now()'; end if;
  if 'updated_at'         = any(v_colonnes) then v_sql := v_sql || ', now()'; end if;
  v_sql := v_sql || ') on conflict (id) do nothing';

  execute v_sql using p_id, p_email;
end
$$;

comment on function public.coach_creer_utilisateur_essai(uuid, text) is
  'BANC D''ESSAI UNIQUEMENT — crée un compte auth minimal pour un coach de test. '
  'Refuse toute adresse hors .invalid (RFC 2606) : un coach d''essai ne doit jamais '
  'pouvoir recevoir un courriel. Réservée à service_role.';

revoke execute on function public.coach_creer_utilisateur_essai(uuid, text) from public;
revoke execute on function public.coach_creer_utilisateur_essai(uuid, text) from anon, authenticated;
grant  execute on function public.coach_creer_utilisateur_essai(uuid, text) to service_role;
