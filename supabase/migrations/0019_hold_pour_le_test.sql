-- ═══════════════════════════════════════════════════════════════════════════
-- 0019 — Poser un hold au nom d'un coach, pour le banc d'essai
--
-- POURQUOI
--
-- `coach_create_hold` lit l'appelant dans `auth.uid()`. C'est correct : un coach
-- ne peut réserver que pour lui-même, et cette lecture est ce qui l'en empêche.
--
-- Mais le back-office de développement et les tests de concurrence parlent à la
-- base avec `service_role`, qui n'a pas de jeton, donc pas de `auth.uid()`.
-- Sans cette fonction, on ne peut ni éprouver la capacité, ni rejouer le test
-- contractuel §13.9 (deux holds simultanés sur le dernier siège).
--
-- CE QU'ELLE NE FAIT PAS
--
-- Elle ne réimplémente RIEN. Elle pose la revendication d'identité le temps de
-- la transaction, puis appelle la vraie fonction. Verrou consultatif, attribution
-- de siège, prix serveur, limite de 3 actives, blocages : tout reste inchangé.
-- Dupliquer la logique aurait créé un second moteur qui diverge en silence.
--
-- POURQUOI ELLE N'EST PAS UNE PORTE DÉROBÉE
--
-- Elle permet d'agir « au nom de » n'importe quel coach. Donnée à `authenticated`,
-- ce serait une usurpation d'identité en une ligne. Elle n'est donc accordée
-- qu'à `service_role`, une clé qui ne quitte jamais le serveur et que le cahier
-- §1.1 interdit explicitement au navigateur.
--
-- `set_config(..., true)` : le `true` signifie « local à la transaction ». La
-- revendication disparaît au COMMIT comme au ROLLBACK, elle ne peut pas fuir
-- vers la requête suivante d'une connexion mutualisée par le pooler.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.coach_create_hold_as(
  p_coach_id        uuid,
  p_club_id         text,
  p_space_id        text,
  p_starts_at       timestamptz,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_resultat jsonb;
begin
  if p_coach_id is null then
    return public.coach_err('VALIDATION_ERROR', 'Identifiant de coach manquant.');
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_coach_id::text,
      'role', 'authenticated',
      'app_metadata', json_build_object('role', 'coach')
    )::text,
    true
  );

  v_resultat := public.coach_create_hold(p_club_id, p_space_id, p_starts_at, p_idempotency_key);
  return v_resultat;
end
$$;

comment on function public.coach_create_hold_as(uuid, text, text, timestamptz, uuid) is
  'BANC D''ESSAI UNIQUEMENT — pose un hold au nom d''un coach. Réservée à service_role : '
  'accordée à authenticated, elle serait une usurpation d''identité. Ne duplique pas le '
  'moteur, elle appelle coach_create_hold.';

revoke execute on function public.coach_create_hold_as(uuid, text, text, timestamptz, uuid) from public;
revoke execute on function public.coach_create_hold_as(uuid, text, text, timestamptz, uuid) from anon, authenticated;
grant  execute on function public.coach_create_hold_as(uuid, text, text, timestamptz, uuid) to service_role;
