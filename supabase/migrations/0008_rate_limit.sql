-- =============================================================================
-- 0008 — Rate limit, fenêtre glissante en Postgres (spec-04 §3.4)
-- =============================================================================
-- POURQUOI PAS UN Map() EN MÉMOIRE (le modèle repris d'AMAZ) — deux défauts :
--   1. la mémoire ne survit pas. Un `const store = new Map()` vit dans UNE
--      instance de fonction Vercel. Cold start, scale-out : le compteur repart à
--      zéro. « 5/min » devient « 5/min par instance », c'est-à-dire aucune limite.
--   2. pire : `listeNoire.push(ip)` = bannissement DÉFINITIF, sans TTL. Le wifi
--      du club des Minimes, c'est UNE IP publique pour tous les coachs présents.
--      Un coach qui rafraîchit sa grille un peu vite bannit tout le club jusqu'au
--      prochain déploiement. Ce comportement est supprimé, pas porté.
--
-- POURQUOI POSTGRES ET PAS REDIS / @vercel/firewall :
--   — aucun service de plus à facturer ni à surveiller, Supabase est déjà là ;
--   — toutes les régions tapent la MÊME base, donc la limite est exacte
--     (le WAF Vercel compte par région, Upstash déconseille slidingWindow en
--     multi-région) ;
--   — les dépassements sont directement joignables à coach_audit_logs.
-- RATE_LIMIT_REDIS_URL reste dans .env.example comme échappatoire : le jour où la
-- charge le justifie, seule l'implémentation derrière checkRateLimit() change.
-- =============================================================================

create table if not exists public.coach_rate_limit_hits (
  id      bigserial   primary key,
  bucket  text        not null,
  hit_at  timestamptz not null default now()
);

comment on table public.coach_rate_limit_hits is
  'Compteur de fenêtre glissante. AUCUNE donnée personnelle : bucket = route + IP hachée, ou route + coach_id.';

-- L'index qui porte à la fois la fenêtre glissante et le DELETE de purge.
create index if not exists coach_rate_limit_hits_bucket_time_idx
  on public.coach_rate_limit_hits (bucket, hit_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Clé d'advisory lock dérivée d'un texte, avec des fonctions DOCUMENTÉES
-- (md5 + cast bit(64) -> bigint). On évite volontairement hashtext() /
-- hashtextextended(), absentes du manuel PostgreSQL.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_bucket_lock_key(p_bucket text)
returns bigint
language sql
immutable
parallel safe
as $$
  select ('x' || substr(md5(p_bucket), 1, 16))::bit(64)::bigint;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Vérifie ET consomme N buckets de façon atomique.
--
-- Sémantique TOUT OU RIEN : si un seul bucket dépasse, AUCUN jeton n'est
-- consommé. C'est ce qui permet de limiter par IP **et** par coach_id
-- (cahier §1.5) sans qu'un refus sur une dimension ne brûle un jeton sur l'autre.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_rate_limit_check(
  p_buckets  text[],
  p_limit    int,
  p_window_s int
)
returns table (allowed boolean, remaining int, retry_after_s int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start timestamptz := now() - make_interval(secs => p_window_s);
  v_bucket       text;
  v_count        int;
  v_oldest       timestamptz;
  v_worst_retry  int := 0;
  v_min_remain   int := p_limit;
  v_denied       boolean := false;
begin
  if p_buckets is null or array_length(p_buckets, 1) is null then
    raise exception 'coach_rate_limit_check: p_buckets vide';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'coach_rate_limit_check: p_limit invalide (%)', p_limit;
  end if;
  if p_window_s is null or p_window_s < 1 then
    raise exception 'coach_rate_limit_check: p_window_s invalide (%)', p_window_s;
  end if;

  -- Verrous pris dans un ORDRE STABLE (tri alphabétique) : deux requêtes qui
  -- partagent deux buckets ne peuvent pas former de cycle. pg_advisory_xact_lock
  -- se relâche à la fin de la transaction, sans action explicite.
  for v_bucket in select distinct b from unnest(p_buckets) as t(b) order by b loop
    perform pg_advisory_xact_lock(public.coach_bucket_lock_key(v_bucket));
  end loop;

  -- Purge ciblée : garde la table petite sans job séparé sur les buckets actifs.
  delete from public.coach_rate_limit_hits
   where bucket = any(p_buckets)
     and hit_at < v_window_start;

  -- Phase 1 : on REGARDE, on ne consomme rien.
  foreach v_bucket in array p_buckets loop
    select count(*), min(hit_at)
      into v_count, v_oldest
      from public.coach_rate_limit_hits
     where bucket = v_bucket
       and hit_at >= v_window_start;

    if v_count >= p_limit then
      v_denied := true;
      v_worst_retry := greatest(
        v_worst_retry,
        greatest(1, ceil(extract(epoch from
          (v_oldest + make_interval(secs => p_window_s)) - now()
        ))::int)
      );
    else
      v_min_remain := least(v_min_remain, p_limit - v_count - 1);
    end if;
  end loop;

  if v_denied then
    allowed := false; remaining := 0; retry_after_s := v_worst_retry;
    return next;
    return;
  end if;

  -- Phase 2 : tout est vert, on consomme sur TOUTES les dimensions.
  insert into public.coach_rate_limit_hits (bucket)
  select unnest(p_buckets);

  allowed := true; remaining := v_min_remain; retry_after_s := 0;
  return next;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Purge des buckets abandonnés : un visiteur qui ne revient pas laisse ses lignes.
-- 2 h couvrent la plus longue fenêtre du cahier §1.5 (POST /contact : 5/h).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_rate_limit_purge()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_n integer;
begin
  delete from public.coach_rate_limit_hits where hit_at < now() - interval '2 hours';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Personne d'autre que le serveur n'appelle ça.
revoke all on table public.coach_rate_limit_hits from public, anon, authenticated;
revoke all on function public.coach_rate_limit_check(text[], int, int) from public, anon, authenticated;
revoke all on function public.coach_rate_limit_purge()                 from public, anon, authenticated;
grant execute on function public.coach_rate_limit_check(text[], int, int) to service_role;
grant execute on function public.coach_rate_limit_purge()                 to service_role;

-- bigserial crée une séquence : sans ce revoke, anon pourrait la consommer.
revoke all on sequence public.coach_rate_limit_hits_id_seq from public, anon, authenticated;
