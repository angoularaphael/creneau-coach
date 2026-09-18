-- 0022 — Filet : authenticated n'écrit jamais coach_reservations en direct.
--
-- La piste moteur (0013) n'accorde que du SELECT colonne par colonne.
-- Une piste datée (20260918120100) accordait INSERT/UPDATE au coach : un
-- client pourrait alors poser payment_status = paid sans webhook.
-- Ce fichier est idempotent : DROP POLICY IF EXISTS + REVOKE.

revoke insert, update, delete on public.coach_reservations from authenticated;

drop policy if exists coach_reservations_insert_self on public.coach_reservations;
drop policy if exists coach_reservations_update on public.coach_reservations;
