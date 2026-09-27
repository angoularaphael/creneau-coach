import 'server-only'

import { createHash } from 'node:crypto'

import { createServiceClient } from '@/lib/supabase/service'

/**
 * Les documents que le coach signe — cahier §16 : CGV, règlement intérieur,
 * décharge de responsabilité, « et tout autre document transmis ultérieurement
 * par Boxing Center ».
 *
 * ── CE QUE CE MODULE NE FAIT PAS ─────────────────────────────────────────────
 *
 * Il n'écrit aucun texte. Le cahier dit que les documents « seront fournis par
 * la direction Boxing Center à l'équipe dev » : une CGV rédigée par un
 * développeur engagerait l'entreprise sur des clauses que personne n'a
 * validées. Le code garantit seulement que ce que le coach signe EXISTE, qu'il
 * peut le LIRE avant, et que la preuve désigne la version exacte.
 *
 * ── POURQUOI LE CLIENT service_role ─────────────────────────────────────────
 *
 * Les PDF vivent dans le seau privé, sous `documents/`. La RLS du stockage ne
 * laisse un coach lire que son propre dossier (`<uid>/…`). Ces textes ne sont
 * pas une donnée d'un coach : ce sont les conditions publiques de l'entreprise,
 * qu'on doit pouvoir lire AVANT d'avoir un compte. On les sert donc par le
 * serveur, fichier par fichier, et jamais par une URL de stockage.
 */

export const SEAU_PRIVE = process.env.SUPABASE_STORAGE_BUCKET_PRIVATE?.trim() || 'coach-private'

export const TYPES_OBLIGATOIRES = ['cgv', 'reglement', 'decharge'] as const
export type TypeDocument = (typeof TYPES_OBLIGATOIRES)[number]

export const TITRES: Record<TypeDocument, string> = {
  cgv: 'Conditions générales de vente',
  reglement: 'Règlement intérieur',
  decharge: 'Décharge de responsabilité',
}

/** Où un coach — ou n'importe qui — lit la version en vigueur. */
export function cheminPublic(type: TypeDocument): string {
  return `/documents/${type}`
}

export function estTypeDocument(valeur: unknown): valeur is TypeDocument {
  return typeof valeur === 'string' && (TYPES_OBLIGATOIRES as readonly string[]).includes(valeur)
}

/**
 * 4 Mo : sous la limite du seau (5 Mo) ET sous celle d'un corps de requête sur
 * Vercel (4,5 Mo). Une CGV fait quelques centaines de Ko.
 */
export const OCTETS_MAX_DOCUMENT = 4 * 1024 * 1024

export type DocumentCourant = {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly version: string
  readonly published_at: string | null
  readonly file_sha256: string | null
  readonly file_bytes: number | null
  readonly body_path: string
}

/** Un document est publié quand il est en vigueur ET que son fichier existe. */
export const estPublie = (d: Pick<DocumentCourant, 'file_sha256'>): boolean => d.file_sha256 !== null

export async function documentsEnVigueur(): Promise<DocumentCourant[]> {
  const { data, error } = await createServiceClient()
    .from('coach_documents')
    .select('id, kind, title, version, published_at, file_sha256, file_bytes, body_path')
    .eq('is_current', true)
    .order('kind')
  if (error) throw new Error(`documents : ${error.message}`)
  return (data ?? []) as DocumentCourant[]
}

/**
 * Les trois documents obligatoires sont-ils publiés ?
 *
 * Consultée AVANT de poser une option et AVANT de prendre de l'argent : un
 * coach ne doit jamais payer une heure qu'il ne pourra pas confirmer faute de
 * texte à signer. En cas d'erreur de lecture, la réponse est « non » — on
 * préfère une réservation refusée à un paiement bloqué.
 */
export async function documentsPublies(): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc('coach_documents_publies')
  if (error) {
    console.error('[documents] coach_documents_publies', { code: error.code })
    return false
  }
  return data === true
}

/** Message montré au coach quand les réservations sont fermées pour cette raison. */
export const MESSAGE_DOCUMENTS_EN_ATTENTE =
  'Les réservations ouvrent dès que Boxing Center a publié ses conditions (CGV, règlement intérieur, décharge). Aucun paiement n’a été pris.'

/**
 * Le PDF en vigueur d'un type, vérifié contre son empreinte.
 *
 * L'empreinte n'est pas décorative : si le fichier du seau a été remplacé à la
 * main, ce n'est plus le texte que les coachs ont signé. On refuse de le servir
 * plutôt que de montrer un texte différent de celui qui engage.
 */
export async function lireDocument(
  type: TypeDocument,
): Promise<{ readonly doc: DocumentCourant; readonly octets: Buffer } | null> {
  const doc = (await documentsEnVigueur()).find((d) => d.kind === type)
  if (!doc || !estPublie(doc)) return null

  const { data, error } = await createServiceClient().storage.from(SEAU_PRIVE).download(doc.body_path)
  if (error || !data) {
    console.error('[documents] fichier introuvable', { type, version: doc.version })
    return null
  }
  const octets = Buffer.from(await data.arrayBuffer())
  if (sha256(octets) !== doc.file_sha256) {
    console.error('[documents] empreinte divergente — fichier modifié hors back-office', { type })
    return null
  }
  return { doc, octets }
}

export function sha256(octets: Buffer): string {
  return createHash('sha256').update(octets).digest('hex')
}

/** Les refus possibles, en codes stables : ils voyagent dans une URL de retour. */
export const REFUS_PUBLICATION = {
  version: 'Version invalide : lettres, chiffres, espaces, points et tirets, 40 caractères au plus.',
  vide: 'Le fichier est vide.',
  taille: 'Le fichier dépasse 4 Mo.',
  pdf: 'Ce fichier n’est pas un PDF.',
  depot: 'Le dépôt du fichier a échoué. Réessayez.',
  publication: 'La publication a échoué. Réessayez.',
} as const
export type RefusPublication = keyof typeof REFUS_PUBLICATION

export type ResultatPublication =
  | { readonly ok: true; readonly version: string; readonly rejeu: boolean }
  | { readonly ok: false; readonly code: RefusPublication }

/**
 * Dépose un PDF et le rend courant. Réservé au back-office (le rôle est vérifié
 * par l'appelant, avant). Le fichier est contrôlé ici, pas seulement son type
 * déclaré : un navigateur envoie le type qu'on lui dit d'envoyer.
 */
export async function publierDocument(entree: {
  readonly type: TypeDocument
  readonly version: string
  readonly octets: Buffer
  readonly auteur: string
}): Promise<ResultatPublication> {
  const version = entree.version.trim()
  if (!/^[\p{L}\p{N} ._-]{1,40}$/u.test(version)) return { ok: false, code: 'version' }
  if (entree.octets.length === 0) return { ok: false, code: 'vide' }
  if (entree.octets.length > OCTETS_MAX_DOCUMENT) return { ok: false, code: 'taille' }
  // Signature d'un PDF : « %PDF- » dans les premiers octets.
  if (!entree.octets.subarray(0, 1024).toString('latin1').includes('%PDF-')) {
    return { ok: false, code: 'pdf' }
  }

  const empreinte = sha256(entree.octets)
  const nomVersion = version.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'v'
  const chemin = `documents/${entree.type}-${nomVersion}-${empreinte.slice(0, 12)}.pdf`

  const sb = createServiceClient()
  const depot = await sb.storage.from(SEAU_PRIVE).upload(chemin, entree.octets, {
    contentType: 'application/pdf',
    // Même chemin = même empreinte = mêmes octets : réécrire est sans danger.
    upsert: true,
  })
  if (depot.error) {
    console.error('[documents] dépôt', { message: depot.error.message })
    return { ok: false, code: 'depot' }
  }

  const { data, error } = await sb.rpc('coach_publier_document', {
    p_kind: entree.type,
    p_title: TITRES[entree.type],
    p_version: version,
    p_body_path: chemin,
    p_file_sha256: empreinte,
    p_file_bytes: entree.octets.length,
    p_auteur: entree.auteur,
  })
  const r = data as { ok: boolean; rejeu?: boolean; error?: { message: string } } | null
  if (error || !r?.ok) {
    console.error('[documents] publication', { code: error?.code, refus: r?.error?.message })
    return { ok: false, code: 'publication' }
  }
  return { ok: true, version, rejeu: r.rejeu === true }
}
