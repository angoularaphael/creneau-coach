-- =============================================================================
-- 0027 — Le texte d'un document publié, à côté de son PDF
-- =============================================================================
--
-- Les documents à signer sont rédigés dans le dépôt (src/lib/documents/textes)
-- et publiés depuis /admin/documents : le serveur résout les valeurs réglables
-- (prix, délais), fabrique le PDF, et enregistre ICI le texte exact qui a servi
-- à le fabriquer.
--
-- Pourquoi : le coach lit avant de signer, et sur un téléphone un PDF se lit
-- mal. La page HTML (/conditions-generales, /reglement-interieur,
-- /decharge-de-responsabilite) affiche CE texte — celui de la version en
-- vigueur, figé à la publication — et jamais une version recalculée qui
-- pourrait différer du PDF signé.
--
-- Un PDF déposé à la main par la direction n'a pas de texte : la page renvoie
-- alors au PDF, seule version qui fait foi.
-- =============================================================================

alter table public.coach_documents
  add column if not exists texte text;

comment on column public.coach_documents.texte is
  'Texte (markdown restreint) qui a servi à fabriquer le PDF de cette version. '
  'NULL pour un PDF déposé à la main : la page publique renvoie alors au PDF.';

drop function if exists public.coach_publier_document(
  public.coach_document_kind, text, text, text, text, integer, text);

create or replace function public.coach_publier_document(
  p_kind        public.coach_document_kind,
  p_title       text,
  p_version     text,
  p_body_path   text,
  p_file_sha256 text,
  p_file_bytes  integer,
  p_auteur      text,
  p_texte       text default null
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
    (kind, title, version, body_path, is_current, published_at, file_sha256, file_bytes, texte)
  values
    (p_kind, trim(p_title), trim(p_version), p_body_path, true, now(), p_file_sha256, p_file_bytes, p_texte)
  returning * into v_doc;

  insert into public.coach_audit_logs (actor_id, role, action, target_type, target_id, meta)
  values (null, 'back-office', 'document.published', 'document', v_doc.id::text,
          jsonb_build_object('kind', p_kind, 'version', v_doc.version,
                             'sha256', p_file_sha256, 'auteur', p_auteur,
                             'texte_du_depot', p_texte is not null));

  return jsonb_build_object('ok', true, 'document', to_jsonb(v_doc) - 'texte');
end
$$;

revoke execute on function public.coach_publier_document(
  public.coach_document_kind, text, text, text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.coach_publier_document(
  public.coach_document_kind, text, text, text, text, integer, text, text) to service_role;
