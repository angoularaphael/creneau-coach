-- ═══════════════════════════════════════════════════════════════════════════
-- 0021 — Provision profil + QR propriétaire + documents courants
--
-- À coller dans le SQL Editor si `all.sql` a déjà été joué (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Profil à la création du compte GoTrue ────────────────────────────────────
create or replace function public.coach_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.coach_profiles (
    id, email, first_name, last_name, consent_cgu_at, consent_privacy_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    nullif(new.raw_user_meta_data ->> 'consent_cgu_at', '')::timestamptz,
    nullif(new.raw_user_meta_data ->> 'consent_privacy_at', '')::timestamptz
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists coach_on_auth_user_created on auth.users;
create trigger coach_on_auth_user_created
  after insert on auth.users
  for each row execute function public.coach_handle_new_user();

-- Comptes déjà existants sans ligne métier : le coach provisionne LE SIEN.
create or replace function public.coach_ensure_own_profile()
returns void
language plpgsql
security definer
set search_path to 'public', 'auth', 'pg_temp'
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_meta  jsonb;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '28000';
  end if;

  select u.email, u.raw_user_meta_data
    into v_email, v_meta
  from auth.users u
  where u.id = v_uid;

  if not found then
    return;
  end if;

  insert into public.coach_profiles (
    id, email, first_name, last_name, consent_cgu_at, consent_privacy_at
  )
  values (
    v_uid,
    v_email,
    coalesce(v_meta ->> 'first_name', ''),
    coalesce(v_meta ->> 'last_name', ''),
    nullif(v_meta ->> 'consent_cgu_at', '')::timestamptz,
    nullif(v_meta ->> 'consent_privacy_at', '')::timestamptz
  )
  on conflict (id) do nothing;
end;
$$;

revoke execute on function public.coach_ensure_own_profile() from public;
grant execute on function public.coach_ensure_own_profile() to authenticated;

-- ── QR : le jti n'est pas granté en SELECT. Le propriétaire le lit via RPC. ──
create or replace function public.coach_qr_for_me(p_reservation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_res public.coach_reservations;
begin
  if v_uid is null then
    return public.coach_err('UNAUTHENTICATED', 'Session requise.');
  end if;

  select * into v_res
  from public.coach_reservations
  where id = p_reservation_id and coach_id = v_uid;

  if not found then
    return public.coach_err('NOT_FOUND', 'Introuvable.');
  end if;

  if v_res.status <> 'confirmed' or v_res.qr_jti is null
     or v_res.qr_valid_from is null or v_res.qr_valid_to is null then
    return public.coach_err('CONFLICT', 'QR indisponible.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'club_id', v_res.club_id,
    'qr_jti', v_res.qr_jti,
    'qr_valid_from', v_res.qr_valid_from,
    'qr_valid_to', v_res.qr_valid_to
  );
end;
$$;

revoke execute on function public.coach_qr_for_me(uuid) from public;
grant execute on function public.coach_qr_for_me(uuid) to authenticated;

-- ── Documents courants (CGV / RI / décharge) s'ils manquent ──────────────────
insert into public.coach_documents (kind, title, version, body_path, is_current, published_at)
select v.kind, v.title, v.version, v.body_path, true, now()
from (values
  ('cgv'::public.coach_document_kind, 'Conditions générales de vente', '2026-09', 'documents/cgv-2026-09.pdf'),
  ('reglement'::public.coach_document_kind, 'Règlement intérieur', '2026-09', 'documents/ri-2026-09.pdf'),
  ('decharge'::public.coach_document_kind, 'Décharge de responsabilité', '2026-09', 'documents/decharge-2026-09.pdf')
) as v(kind, title, version, body_path)
where not exists (
  select 1 from public.coach_documents d
  where d.kind = v.kind and d.is_current
);
