-- =============================================================================
-- 0012 — Tâches périodiques : expiration des holds, passage en consumed, purges
-- =============================================================================
-- Les FONCTIONS sont créées inconditionnellement : elles sont appelables par
-- service_role depuis un cron Vercel, un job GitHub Actions ou psql.
-- La PLANIFICATION pg_cron, elle, est conditionnelle : l'extension n'existe ni
-- sur un Postgres local nu, ni sur toutes les offres. Une migration qui échoue
-- parce qu'une extension manque est une migration qui bloque toute l'équipe.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- Hold expiré -> expired. Le siège se libère TOUT SEUL : la ligne sort du
-- prédicat de l'index unique partiel. Aucun DELETE, aucune ligne fantôme.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_expire_holds()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  with expirees as (
    update public.coach_reservations
    set status        = 'expired',
        cancel_reason = 'hold_expired'
    where status = 'held'
      and hold_expires_at < now()
    returning id, club_id
  )
  insert into public.coach_audit_logs (actor_id, role, action, club_id, target_type, target_id)
  select null, 'service', 'reservation.expired', e.club_id, 'reservation', e.id::text
  from expirees e;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function public.coach_expire_holds() is
  'Passe les holds périmés en expired et trace chacun. Retourne le nombre de lignes traitées.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Créneau écoulé -> consumed. Comparaison à now(), aucune règle calendaire :
-- le fuseau du planificateur est donc sans effet.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_mark_consumed()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  update public.coach_reservations
  set status = 'consumed'
  where status = 'confirmed'
    and ends_at < now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Avoirs arrivés à échéance. Aucune règle de durée n'est écrite au contrat :
-- tant qu'expires_at reste NULL au seed, cette fonction ne touche rien. Elle
-- existe pour que le jour où la direction tranche, il n'y ait rien à écrire.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_expire_credits()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  update public.coach_credits
  set status = 'expired'
  where status = 'available'
    and expires_at is not null
    and expires_at <= now();

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke execute on function public.coach_expire_holds()   from public, anon, authenticated;
revoke execute on function public.coach_mark_consumed()  from public, anon, authenticated;
revoke execute on function public.coach_expire_credits() from public, anon, authenticated;
grant  execute on function public.coach_expire_holds()   to service_role;
grant  execute on function public.coach_mark_consumed()  to service_role;
grant  execute on function public.coach_expire_credits() to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Planification pg_cron — conditionnelle.
--
-- Signature : cron.schedule(job_name, schedule_string, command), retrait par
-- cron.unschedule('nom'). Le planificateur tourne en GMT sur Supabase, mais
-- AUCUN de ces jobs n'a de règle calendaire (ils comparent tous à now()), donc
-- le fuseau du planificateur est sans effet. Le jour où un job devra tourner
-- « à 3 h heure de Paris », il faudra écrire l'heure GMT et la corriger deux fois
-- par an, ou tester l'heure locale dans le corps du job.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_jobs constant text[][] := array[
    ['coach-expire-holds',      '* * * * *', 'select public.coach_expire_holds();'],
    ['coach-mark-consumed',     '5 * * * *', 'select public.coach_mark_consumed();'],
    ['coach-expire-credits',    '10 3 * * *','select public.coach_expire_credits();'],
    ['coach-purge-idempotence', '0 3 * * *', 'select public.coach_idem_purge();'],
    ['coach-purge-rate-limit',  '*/30 * * * *', 'select public.coach_rate_limit_purge();']
  ];
  v_i int;
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron indisponible : planification ignorée. Les fonctions restent appelables par service_role (cron Vercel, CRON_SECRET).';
    return;
  end if;

  begin
    execute 'create extension if not exists pg_cron';
  exception when others then
    raise notice 'pg_cron non installable ici (%). Planification ignorée.', sqlerrm;
    return;
  end;

  for v_i in 1 .. array_length(v_jobs, 1) loop
    -- Idempotent : on retire avant de reposer, sinon une seconde application de
    -- la migration créerait un doublon de job.
    begin
      execute format('select cron.unschedule(%L)', v_jobs[v_i][1]);
    exception when others then
      null;   -- le job n'existait pas : c'est le cas nominal au premier passage
    end;
    execute format('select cron.schedule(%L, %L, %L)',
                   v_jobs[v_i][1], v_jobs[v_i][2], v_jobs[v_i][3]);
  end loop;

  raise notice 'pg_cron : % jobs planifiés.', array_length(v_jobs, 1);
end
$$;
