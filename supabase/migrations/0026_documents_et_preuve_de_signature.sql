-- =============================================================================
-- 0026 — Les documents à signer existent, et la signature laisse une preuve
-- =============================================================================
--
-- Cahier §16 : après paiement, le coach signe les CGV, le règlement intérieur et
-- la décharge. « Le système devra permettre : l'envoi des documents ; la
-- signature électronique ; l'archivage de la signature ; l'association des
-- documents signés au compte coach ; le blocage de l'accès si les documents ne
-- sont pas signés. »
--
-- Constat du 27/09/2026, sur la base partagée :
--
--   · les trois lignes de `coach_documents` pointent vers des PDF
--     (`documents/cgv-2026-09.pdf`…) qui n'existent PAS dans le stockage. Un
--     coach signait des conditions écrites nulle part ;
--   · `coach_mark_signed` passait la réservation en `confirmed` sans écrire une
--     seule ligne dans `coach_signatures` : 0 preuve archivée, le tracé de la
--     signature était reçu puis jeté, et `signature_pdf_path` désignait un
--     fichier jamais fabriqué.
--
-- Ce fichier :
--
--   1. donne à chaque document l'empreinte de SON fichier (`file_sha256`). Un
--      document est « publié » quand il est courant ET que son fichier existe.
--      L'empreinte est aussi ce qui lie une signature à une version exacte du
--      texte : changer une virgule des CGV change l'empreinte ;
--   2. `coach_documents_publies()` — vrai quand les trois documents obligatoires
--      sont publiés. Les routes de réservation et de paiement la consultent AVANT
--      de prendre de l'argent : un coach ne doit pas payer un créneau qu'il ne
--      pourra pas confirmer ;
--   3. `coach_publier_document()` — la direction publie une nouvelle version,
--      l'ancienne cesse d'être courante dans la même transaction ;
--   4. `coach_mark_signed` écrit la preuve : une ligne par document signé, avec
--      le chemin et l'empreinte de l'attestation PDF, et le navigateur. Dans la
--      MÊME transaction que le passage en `confirmed` — pas de réservation
--      confirmée sans preuve, pas de preuve pour une réservation non confirmée.
--
-- Les TEXTES ne sont pas écrits ici, ni nulle part dans le code : le cahier
-- §16 dit qu'ils « seront fournis par la direction Boxing Center ». Tant qu'ils
-- ne sont pas publiés depuis /admin/documents, les réservations sont fermées —
-- et c'est le comportement correct.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. L'empreinte du fichier
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.coach_documents
  add column if not exists file_sha256 text,
  add column if not exists file_bytes  integer;

alter table public.coach_documents
  drop constraint if exists coach_documents_empreinte_format;
alter table public.coach_documents
  add constraint coach_documents_empreinte_format
  check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$');

comment on column public.coach_documents.file_sha256 is
  'SHA-256 du PDF déposé dans coach-private/body_path. NULL = aucun fichier : '
  'le document n''est pas publié et ne peut pas être signé.';

-- L'empreinte n'a rien de secret : c'est ce qui permet au coach de vérifier que
-- le texte qu'il relit est celui qu'il a signé. `body_path` reste non granté.
grant select (file_sha256, file_bytes) on public.coach_documents to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Les trois documents obligatoires sont-ils publiés ?
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.coach_documents_publies()
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select
    -- les trois types obligatoires ont une version courante AVEC fichier…
    (select count(distinct kind)
       from public.coach_documents
      where is_current
        and file_sha256 is not null
        and kind in ('cgv', 'reglement', 'decharge')) = 3
    -- …et aucun document courant (y compris « tout autre document transmis
    -- ultérieurement », cahier §16) n'attend encore son fichier.
    and not exists (
      select 1 from public.coach_documents
       where is_current and file_sha256 is null
    );
$$;

comment on function public.coach_documents_publies() is
  'Vrai quand CGV, règlement intérieur et décharge courants ont leur fichier. '
  'Consultée avant toute prise de place et tout paiement.';

revoke execute on function public.coach_documents_publies() from public;
grant execute on function public.coach_documents_publies() to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Publier une version
-- ─────────────────────────────────────────────────────────────────────────────
-- Appelée par le back-office (client service_role, après vérification de la
-- session et du rôle direction / super_admin côté serveur). Le fichier est déjà
-- déposé dans le stockage : cette fonction ne fait que le rendre courant.
create or replace function public.coach_publier_document(
  p_kind        public.coach_document_kind,
  p_title       text,
  p_version     text,
  p_body_path   text,
  p_file_sha256 text,
  p_file_bytes  integer,
  p_auteur      text
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_doc public.coach_documents;
begin
  if p_file_sha256 !~ '^[0-9a-f]{64}$' then
    return public.coach_err('VALIDATION_ERROR', 'Empreinte de fichier invalide.');
  end if;
  if coalesce(trim(p_version), '') = '' or coalesce(trim(p_title), '') = '' then
    return public.coach_err('VALIDATION_ERROR', 'Titre et version obligatoires.');
  end if;

  -- Republier le même fichier sous le même type est un rejeu, pas une version.
  select * into v_doc
    from public.coach_documents
   where kind = p_kind and is_current and file_sha256 = p_file_sha256;
  if found then
    return jsonb_build_object('ok', true, 'document', to_jsonb(v_doc), 'rejeu', true);
  end if;

  update public.coach_documents set is_current = false
   where kind = p_kind and is_current;

  insert into public.coach_documents
    (kind, title, version, body_path, is_current, published_at, file_sha256, file_bytes)
  values
    (p_kind, trim(p_title), trim(p_version), p_body_path, true, now(), p_file_sha256, p_file_bytes)
  returning * into v_doc;

  insert into public.coach_audit_logs (actor_id, role, action, target_type, target_id, meta)
  values (null, 'back-office', 'document.published', 'document', v_doc.id::text,
          jsonb_build_object('kind', p_kind, 'version', v_doc.version,
                             'sha256', p_file_sha256, 'auteur', p_auteur));

  return jsonb_build_object('ok', true, 'document', to_jsonb(v_doc));
end
$$;

revoke execute on function public.coach_publier_document(
  public.coach_document_kind, text, text, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.coach_publier_document(
  public.coach_document_kind, text, text, text, text, integer, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. La signature écrit sa preuve
-- ─────────────────────────────────────────────────────────────────────────────
-- Les nouveaux paramètres ont une valeur par défaut pour que l'ancien appel à
-- trois arguments nommés se résolve encore pendant la fenêtre de déploiement —
-- et échoue proprement (« preuve manquante ») au lieu de « fonction inconnue ».
drop function if exists public.coach_mark_signed(uuid, text, text);

create or replace function public.coach_mark_signed(
  p_reservation_id uuid,
  p_pdf_path       text,
  p_qr_jti         text,
  p_pdf_sha256     text   default null,
  p_document_ids   uuid[] default null,
  p_user_agent     text   default null,
  p_ip             text   default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_appelant uuid := auth.uid();
  v_res      public.coach_reservations;
  v_statut   public.coach_profile_status;
  v_avance   int;
  v_attendus uuid[];
  v_ip       inet;
begin
  if v_appelant is null then
    return public.coach_err('UNAUTHENTICATED', 'Session requise.');
  end if;

  select * into v_res
  from public.coach_reservations
  where id = p_reservation_id and coach_id = v_appelant
  for update;

  if not found then
    return public.coach_err('NOT_FOUND', 'Introuvable.');
  end if;

  select status into v_statut from public.coach_profiles where id = v_appelant;
  if v_statut <> 'active' then
    return public.coach_err('SUSPENDED', 'Votre compte est suspendu. Contactez Boxing Center.');
  end if;

  if v_res.signature_status = 'signed' and v_res.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'reservation', to_jsonb(v_res), 'rejeu', true);
  end if;

  if v_res.payment_status not in ('paid', 'waived_credit') then
    return public.coach_err('PAYMENT_REQUIRED',
      'Le paiement doit être réglé avant la signature.',
      jsonb_build_object('payment_status', v_res.payment_status));
  end if;

  if v_res.status <> 'awaiting_signature' then
    return public.coach_err('CONFLICT',
      'Cette réservation n''attend pas de signature.',
      jsonb_build_object('status', v_res.status));
  end if;

  -- La preuve est obligatoire : pas d'attestation, pas de confirmation.
  if coalesce(p_pdf_sha256, '') !~ '^[0-9a-f]{64}$' or coalesce(p_pdf_path, '') = '' then
    return public.coach_err('CONFLICT', 'Attestation de signature manquante.');
  end if;

  -- Les documents signés doivent être EXACTEMENT les documents courants publiés.
  select array_agg(id order by id) into v_attendus
    from public.coach_documents
   where is_current and file_sha256 is not null;

  if not public.coach_documents_publies() then
    return public.coach_err('CONFLICT',
      'Les documents à signer ne sont pas encore publiés par Boxing Center.',
      jsonb_build_object('raison', 'documents_non_publies'));
  end if;

  if p_document_ids is null
     or (select array_agg(distinct x order by x) from unnest(p_document_ids) x) is distinct from v_attendus then
    return public.coach_err('VALIDATION_ERROR',
      'Les documents signés ne correspondent pas aux versions en vigueur.',
      jsonb_build_object('raison', 'versions'));
  end if;

  select (value #>> '{}')::int into v_avance
  from public.coach_settings where key = 'qr_early_minutes';
  v_avance := coalesce(v_avance, 5);

  -- L'adresse IP va dans la preuve et NULLE PART ailleurs (spec-04 §3.7 : jamais
  -- dans l'audit). Une valeur illisible devient NULL plutôt que d'annuler une
  -- signature valide.
  begin
    v_ip := nullif(trim(p_ip), '')::inet;
  exception when others then
    v_ip := null;
  end;

  -- La preuve, une ligne par document : QUI a signé QUELLE version, QUAND, avec
  -- QUELLE attestation. `on conflict` rend l'appel rejouable.
  insert into public.coach_signatures
    (reservation_id, coach_id, document_id, pdf_path, pdf_sha256, signed_ip, user_agent)
  select v_res.id, v_appelant, d, p_pdf_path, p_pdf_sha256, v_ip, left(p_user_agent, 400)
    from unnest(v_attendus) d
  on conflict (reservation_id, document_id) do nothing;

  update public.coach_reservations
     set signature_status    = 'signed',
         signed_at           = now(),
         signature_pdf_path  = p_pdf_path,
         qr_jti              = p_qr_jti,
         qr_valid_from       = v_res.starts_at - make_interval(mins => v_avance),
         qr_valid_to         = v_res.ends_at,
         status              = 'confirmed',
         deciplus_job_status = 'queued'
   where id = p_reservation_id
   returning * into v_res;

  insert into public.coach_events (topic, payload)
  values ('reservation.confirmed', jsonb_build_object(
    'reservation_id', v_res.id, 'coach_id', v_res.coach_id,
    'club_id', v_res.club_id, 'space_id', v_res.space_id,
    'starts_at', v_res.starts_at, 'ends_at', v_res.ends_at));

  -- L'audit ne porte NI le chemin du PDF, NI le qr_jti : CAHIER §3.8 l'interdit.
  insert into public.coach_audit_logs (actor_id, role, action, club_id, target_type, target_id, meta)
  values (v_appelant, 'coach', 'reservation.signed', v_res.club_id,
          'reservation', v_res.id::text,
          jsonb_build_object('documents', coalesce(array_length(v_attendus, 1), 0)));

  return jsonb_build_object('ok', true, 'reservation', to_jsonb(v_res));
end
$$;

comment on function public.coach_mark_signed(uuid, text, text, text, uuid[], text, text) is
  'Seul chemin vers confirmed. Exige l''attestation (chemin + SHA-256) et les '
  'documents courants publiés ; écrit une ligne coach_signatures par document '
  'dans la même transaction. Rejouable sans effet de bord.';

revoke execute on function public.coach_mark_signed(uuid, text, text, text, uuid[], text, text) from public;
grant execute on function public.coach_mark_signed(uuid, text, text, text, uuid[], text, text)
  to authenticated, service_role;
