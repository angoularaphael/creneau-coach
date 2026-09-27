import 'server-only'

import PDFDocument from 'pdfkit'

import { FUSEAU_METIER, formaterCentimes } from '@/domain/contrat'
import { nomClub } from '@/lib/clubs'
import { libelleEspace } from '@/lib/libelles-coach'
import { EDITEUR } from '@/lib/seo/verite'
import { sha256 } from '@/lib/documents/obligatoires'

/**
 * L'ATTESTATION DE SIGNATURE — la preuve que le cahier §16 demande d'archiver.
 *
 * Un tracé seul ne prouve rien : il faut dire QUI a signé, QUOI, QUAND, et
 * pouvoir montrer plus tard que la pièce n'a pas bougé. L'attestation porte :
 *
 *   · le signataire (nom, e-mail du compte) ;
 *   · la réservation (club, espace, date, heure, montant) ;
 *   · chaque document avec sa VERSION et l'EMPREINTE SHA-256 de son fichier —
 *     c'est ce qui lie la signature à un texte exact, pas à « les CGV » en
 *     général, qui changeront ;
 *   · l'horodatage, le navigateur, l'adresse IP ;
 *   · le tracé, ou le nom saisi quand le coach a choisi de ne pas dessiner.
 *
 * Son empreinte à elle est écrite en base, dans la même transaction que la
 * confirmation (`coach_mark_signed`). Si le fichier du seau est modifié après
 * coup, les deux empreintes ne coïncident plus : la falsification se voit.
 *
 * Polices : Helvetica standard (encodage WinAnsi), qui couvre le français —
 * accents, « », ’, €, œ. Pas de flèche, pas d'emoji : ils sortiraient en blanc.
 */

export type EntreeAttestation = {
  readonly reservation: {
    readonly id: string
    readonly club_id: string
    readonly space_id: string
    readonly starts_at: string
    readonly ends_at: string
    readonly amount_cents: number
  }
  readonly coach: { readonly nom: string; readonly email: string }
  readonly documents: readonly { readonly title: string; readonly version: string; readonly file_sha256: string }[]
  readonly signaturePng: Buffer
  readonly mode: 'trace' | 'saisie'
  readonly signeLe: Date
  readonly navigateur: string
  readonly ip: string
}

const ENCRE = '#0c0d0f'
const GRIS = '#5b6068'

function date(iso: string | Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU_METIER, ...options }).format(new Date(iso))
}

export async function fabriquerAttestation(
  e: EntreeAttestation,
): Promise<{ readonly octets: Buffer; readonly sha256: string }> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 56,
    lang: 'fr-FR',
    displayTitle: true,
    info: {
      Title: 'Attestation de signature électronique',
      Author: EDITEUR.raisonSociale,
      Subject: `Réservation ${e.reservation.id}`,
      CreationDate: e.signeLe,
    },
  })

  const morceaux: Buffer[] = []
  const fin = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (m) => morceaux.push(m))
    doc.on('end', () => resolve(Buffer.concat(morceaux)))
    doc.on('error', reject)
  })

  const largeur = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const titre = (t: string) => {
    doc.moveDown(0.9).font('Helvetica-Bold').fontSize(11).fillColor(ENCRE).text(t)
    doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor(ENCRE)
  }
  const ligne = (etiquette: string, valeur: string) => {
    doc.font('Helvetica').fillColor(GRIS).text(`${etiquette} : `, { continued: true })
    doc.fillColor(ENCRE).text(valeur)
  }

  // En-tête
  doc.font('Helvetica-Bold').fontSize(18).fillColor(ENCRE).text('Attestation de signature électronique')
  doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor(GRIS)
  doc.text(`${EDITEUR.raisonSociale} — SIREN ${EDITEUR.siren} — ${EDITEUR.siege}`)

  titre('Signataire')
  ligne('Nom', e.coach.nom)
  ligne('Adresse e-mail du compte', e.coach.email)

  titre('Réservation')
  ligne('Référence', e.reservation.id)
  ligne('Club', nomClub(e.reservation.club_id))
  ligne('Espace', libelleEspace(e.reservation.space_id))
  ligne(
    'Créneau',
    `${date(e.reservation.starts_at, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, de ${date(e.reservation.starts_at, { hour: '2-digit', minute: '2-digit' })} à ${date(e.reservation.ends_at, { hour: '2-digit', minute: '2-digit' })}`,
  )
  ligne('Montant', formaterCentimes(e.reservation.amount_cents))

  titre('Documents lus et acceptés')
  for (const d of e.documents) {
    doc.font('Helvetica-Bold').fillColor(ENCRE).text(`${d.title} — version ${d.version}`)
    doc.font('Helvetica').fontSize(8).fillColor(GRIS).text(`Empreinte SHA-256 du fichier : ${d.file_sha256}`)
    doc.fontSize(10).moveDown(0.3)
  }

  titre('Consentement')
  doc.text(
    'Le signataire a coché la case « J’ai lu et j’accepte » (jamais pré-cochée), puis a ' +
      (e.mode === 'trace'
        ? 'tracé sa signature ci-dessous.'
        : 'saisi son nom en toutes lettres, qui vaut signature, reproduit ci-dessous.'),
    { width: largeur },
  )

  doc.moveDown(0.6)
  const haut = doc.y
  doc.lineWidth(0.6).strokeColor('#c9ccd1').rect(doc.page.margins.left, haut, 300, 110).stroke()
  try {
    doc.image(e.signaturePng, doc.page.margins.left + 10, haut + 10, { fit: [280, 90] })
  } catch {
    doc.fillColor(GRIS).text('(tracé illisible)', doc.page.margins.left + 10, haut + 45)
  }
  doc.y = haut + 122
  doc.x = doc.page.margins.left

  titre('Horodatage et contexte')
  ligne('Signé le', `${date(e.signeLe, { dateStyle: 'full', timeStyle: 'long' })} (${e.signeLe.toISOString()})`)
  ligne('Adresse IP', e.ip || 'non transmise')
  ligne('Navigateur', e.navigateur.slice(0, 220) || 'non transmis')

  doc.moveDown(1.2).fontSize(8).fillColor(GRIS)
  doc.text(
    'L’empreinte SHA-256 de ce fichier est enregistrée par Boxing Center au moment de la signature, ' +
      'avec la réservation. Toute modification ultérieure du fichier la rend différente.',
    { width: largeur },
  )

  doc.end()
  const octets = await fin
  return { octets, sha256: sha256(octets) }
}
