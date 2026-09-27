import Link from 'next/link'

import { exigeSessionBackOffice } from '@/lib/admin/garde'
import {
  REFUS_PUBLICATION,
  TITRES,
  TYPES_OBLIGATOIRES,
  cheminPublic,
  documentsEnVigueur,
  estPublie,
  estTypeDocument,
  type RefusPublication,
} from '@/lib/documents/obligatoires'
import { enumererDocuments } from '@/lib/documents/noms'
import { actionPublierDocument } from './actions'

export const dynamic = 'force-dynamic'

const REFUS_PAGE: Record<string, string> = {
  ...REFUS_PUBLICATION,
  role: 'La publication des documents est réservée à la direction.',
  type: 'Type de document inconnu.',
}

const dateParis = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function taille(octets: number | null): string {
  if (!octets) return ''
  return octets < 1024 * 1024 ? `${Math.round(octets / 1024)} Ko` : `${(octets / 1024 / 1024).toFixed(1)} Mo`
}

/**
 * LES DOCUMENTS À SIGNER — cahier §16 (« ces documents seront fournis par la
 * direction ») et §21 (la direction gère les paramètres de la plateforme).
 *
 * C'est ici, et nulle part ailleurs, qu'un texte devient signable. Tant que les
 * trois ne sont pas publiés, la plateforme refuse de prendre une option ou un
 * paiement : on ne vend pas une heure qu'on ne peut pas confirmer.
 */
export default async function PageDocuments({
  searchParams,
}: {
  searchParams: Promise<{ publie?: string; rejeu?: string; refus?: string; type?: string }>
}) {
  const staff = await exigeSessionBackOffice('/admin/documents')
  const params = await searchParams
  const peutPublier = staff.role !== 'salle'
  const documents = await documentsEnVigueur()
  const parType = new Map(documents.map((d) => [d.kind, d]))
  const manquants = TYPES_OBLIGATOIRES.filter((t) => {
    const d = parType.get(t)
    return !d || !estPublie(d)
  })

  const refus = params.refus && params.refus in REFUS_PAGE ? REFUS_PAGE[params.refus as RefusPublication] : null
  const publie = estTypeDocument(params.publie) ? params.publie : null

  return (
    <>
      <div className="bo__bandeau">
        <strong>Documents à signer</strong>
        <span>
          Connecté en tant que <strong>{staff.libelle}</strong>.{' '}
          {peutPublier ? 'Vous pouvez publier une nouvelle version.' : 'Lecture seule : la direction publie les documents.'}
        </span>
        <span className="bo__actions">
          <Link className="bo__bouton bo__bouton--discret" href="/admin">
            Retour au planning
          </Link>
        </span>
      </div>

      <h1>Documents à signer</h1>
      <p className="bo__sous">
        Chaque coach signe la version en vigueur de ces trois documents après avoir payé, avant de
        recevoir son accès. Une nouvelle version s’applique aux signatures suivantes ; celles déjà
        faites restent liées au texte signé.
      </p>

      {manquants.length > 0 ? (
        <p className="bo__verdict" role="status">
          Réservations fermées : {enumererDocuments(manquants.map((t) => ({ kind: t, title: TITRES[t] })))}{' '}
          {manquants.length > 1 ? 'ne sont pas publiés' : 'n’est pas publié'}. Aucun coach ne peut réserver ni
          payer tant que les trois ne le sont pas.
        </p>
      ) : (
        <p className="bo__verdict" data-ok="true" role="status">
          Les trois documents sont publiés : les réservations sont ouvertes.
        </p>
      )}

      {publie ? (
        <p className="bo__verdict" data-ok="true" role="status">
          {params.rejeu
            ? `${TITRES[publie]} : ce fichier est déjà la version en vigueur, rien n’a changé.`
            : `${TITRES[publie]} : nouvelle version publiée. Elle s’applique aux prochaines signatures.`}
        </p>
      ) : null}
      {refus ? (
        <p className="bo__verdict" role="alert">
          {refus}
        </p>
      ) : null}

      <div className="bo__panneaux">
        {TYPES_OBLIGATOIRES.map((type) => {
          const d = parType.get(type)
          const enLigne = d ? estPublie(d) : false
          return (
            <section key={type} className="bo__panneau bo-doc" aria-labelledby={`doc-${type}`}>
              <h2 id={`doc-${type}`}>{TITRES[type]}</h2>
              <p className="bo-doc__etat">
                <span className="bo__etat" data-ton={enLigne ? 'ok' : 'alerte'}>
                  {enLigne ? 'Publié' : 'À publier'}
                </span>
                {d && enLigne ? (
                  <>
                    {' '}
                    Version <strong>{d.version}</strong>
                    {d.published_at ? `, publiée le ${dateParis.format(new Date(d.published_at))}` : ''}
                    {d.file_bytes ? ` · ${taille(d.file_bytes)}` : ''}
                  </>
                ) : (
                  ' Aucun fichier déposé.'
                )}
              </p>
              {d && enLigne ? (
                <p className="bo-doc__lien">
                  <a href={cheminPublic(type)} target="_blank" rel="noopener">
                    Lire la version en vigueur
                  </a>
                  <span className="bo-doc__empreinte" title={d.file_sha256 ?? ''}>
                    Empreinte {d.file_sha256?.slice(0, 12)}…
                  </span>
                </p>
              ) : null}

              {peutPublier ? (
                <form action={actionPublierDocument} className="bo-doc__form">
                  <input type="hidden" name="type" value={type} />
                  <label className="bo-doc__champ">
                    <span>Version</span>
                    <input
                      className="bo__champ"
                      name="version"
                      required
                      maxLength={40}
                      placeholder="ex. 2026-10"
                      pattern="[\p{L}\p{N} ._\-]{1,40}"
                    />
                  </label>
                  <label className="bo-doc__champ">
                    <span>Fichier PDF (4 Mo au plus)</span>
                    <input className="bo__champ" name="fichier" type="file" accept="application/pdf,.pdf" required />
                  </label>
                  <button className="bo__bouton" type="submit">
                    {enLigne ? 'Publier une nouvelle version' : 'Publier'}
                  </button>
                </form>
              ) : null}
            </section>
          )
        })}
      </div>
    </>
  )
}
