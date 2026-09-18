-- ═══════════════════════════════════════════════════════════════════════════
-- 0016 — Les vues sont des surfaces de LECTURE. Rien ne s'écrit à travers.
--
-- POURQUOI CETTE MIGRATION EXISTE
--
-- Elle corrige un défaut qui n'existait QUE sur Supabase, et pas en local — donc
-- invisible pour qui ne teste que sur sa machine.
--
-- Supabase applique, par défaut, sur le schéma `public` :
--     grant all on all tables in schema public to anon, authenticated;
-- « all tables » inclut les VUES. Les trois vues créées en 0014 ont donc hérité
-- de DELETE, INSERT, UPDATE, TRUNCATE, REFERENCES et TRIGGER pour `authenticated`,
-- et pour `anon` sur coach_slot_occupancy. Personne ne les a accordés : ils étaient
-- déjà là quand la vue est née.
--
-- CE QUE ÇA OUVRAIT
--
-- `coach_reservations_staff` est en `security_invoker = true` : une écriture
-- retombe sur la RLS de la table de base, qui n'a aucune policy d'écriture pour
-- `authenticated`. Vérifié : « permission denied for table coach_reservations ».
-- Cette vue-là était protégée.
--
-- `coach_coaches_staff` est en `security_definer` — à dessein, parce qu'elle
-- projette des colonnes différentes selon le rôle, ce qu'aucun GRANT ne sait
-- exprimer. Mais « definer » veut dire qu'elle s'exécute avec les droits du
-- propriétaire, donc **en contournant la RLS**. Un manager de salle y voit les
-- coachs de son club ; avec un droit d'UPDATE, il pouvait écrire dessus, alors que
-- le cahier §10 réserve `suspend` / `unsuspend` à la direction.
--
-- Deux hasards l'ont empêché le jour où ça a été testé :
--   1. la contrainte `coach_profiles_suspension_coherente` refuse `status='active'`
--      tant que `suspended_at` est renseigné ;
--   2. la vue n'expose pas `suspended_at`, donc on ne peut pas l'effacer.
-- Le jour où un écran de back-office aura besoin d'afficher le motif de suspension
-- et qu'on ajoutera la colonne à la vue, le trou s'ouvre. On ne laisse pas une
-- frontière de sécurité reposer sur une colonne qu'on a oublié d'exposer.
--
-- CE QU'ON NE TOUCHE PAS
--
-- Les droits d'écriture sur les TABLES de base (coach_slot_blocks,
-- coach_slot_block_rules, coach_settings) sont volontaires : ils sont gouvernés
-- par les policies RLS de 0013, qui vérifient le rôle et le club. Y toucher
-- casserait le back-office.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_vue text;
begin
  foreach v_vue in array array[
    'coach_reservations_staff',
    'coach_coaches_staff',
    'coach_slot_occupancy'
  ]
  loop
    if to_regclass('public.' || v_vue) is null then
      raise notice 'vue % absente, ignorée', v_vue;
      continue;
    end if;

    execute format(
      'revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated, public',
      v_vue
    );
  end loop;
end
$$;

-- On réaffirme la lecture, pour que l'intention soit lisible dans le fichier et
-- pas seulement déduite de ce qui n'a pas été révoqué.
grant select on public.coach_slot_occupancy      to anon, authenticated;
grant select on public.coach_reservations_staff  to authenticated;
grant select on public.coach_coaches_staff       to authenticated;

comment on view public.coach_coaches_staff is
  'LECTURE SEULE. security_definer assumé : la projection de colonnes par rôle ne '
  's''exprime pas en GRANT. Son WHERE est donc une frontière de sécurité — toute '
  'modification de cette vue doit être relue comme du code de sécurité, et aucune '
  'colonne de suspension ne doit y entrer sans repasser sur les droits.';

-- ───────────────────────────────────────────────────────────────────────────
-- Garde-fou permanent : cette migration échoue si un droit d'écriture subsiste
-- sur une vue. Elle protège aussi les futures vues, parce que le contrôle porte
-- sur `relkind = 'v'` et pas sur une liste de noms.
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  v_restants text;
begin
  select string_agg(format('%s→%s(%s)', table_name, grantee, privilege_type), ', ')
    into v_restants
  from information_schema.role_table_grants g
  where g.table_schema = 'public'
    and g.grantee in ('anon', 'authenticated', 'public')
    and g.privilege_type <> 'SELECT'
    and exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = g.table_name and c.relkind = 'v'
    );

  if v_restants is not null then
    raise exception 'Droit d''écriture encore accordé sur une vue : %', v_restants;
  end if;
end
$$;
