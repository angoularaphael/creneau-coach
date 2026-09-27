import 'server-only'

import PDFDocument from 'pdfkit'

import { EDITEUR } from '@/lib/seo/verite'

import { analyser, type Segment } from './blocs'

/**
 * Le PDF d'un document juridique — celui que le coach signe.
 *
 * Mise en page de contrat, pas de brochure : un titre, la version et sa date
 * d'entrée en vigueur, l'identification de l'éditeur, puis les articles. En
 * pied de chaque page : le titre, la version et « page n / N » — une page
 * isolée d'un contrat doit dire de quel contrat, de quelle version, et où elle
 * se place.
 *
 * Le rendu est DÉTERMINISTE : même texte, même version → mêmes octets. La date
 * de création est celle de la version, pas l'instant du rendu. Sans ça, chaque
 * clic sur « Publier » produirait une empreinte nouvelle, donc une « nouvelle
 * version » identique à l'ancienne.
 *
 * Polices standard (Helvetica, encodage WinAnsi) : elles couvrent le français
 * — accents, « », ’, —, €, œ. Les espaces fines insécables que produit
 * `Intl` (U+202F) n'y existent pas : elles deviennent des espaces insécables.
 */

const ENCRE = '#14162e'
const GRIS = '#565a73'

function winAnsi(texte: string): string {
  return texte.replace(/[  ]/g, ' ').replace(/[‑]/g, '-')
}

export async function pdfJuridique(entree: {
  readonly titre: string
  readonly version: string
  /**
   * La date de la VERSION (sa rédaction), « 27 septembre 2026 ». L'entrée en
   * vigueur est la date de publication sur la Plateforme, que la page publique
   * affiche : imprimée ici, elle deviendrait fausse dès qu'on publie plus tard.
   */
  readonly dateVersion: string
  /** Minuit du jour de la version : sert de date de création, pour un rendu stable. */
  readonly dateCreation: Date
  readonly texte: string
}): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 56,
    bufferPages: true,
    lang: 'fr-FR',
    displayTitle: true,
    info: {
      Title: entree.titre,
      Author: EDITEUR.raisonSociale,
      Subject: `${entree.titre} — version ${entree.version}`,
      Creator: 'Boxing Center',
      Producer: 'Boxing Center',
      CreationDate: entree.dateCreation,
      ModDate: entree.dateCreation,
    },
  })

  const morceaux: Buffer[] = []
  const fini = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (m) => morceaux.push(m))
    doc.on('end', () => resolve(Buffer.concat(morceaux)))
    doc.on('error', reject)
  })

  const gauche = doc.page.margins.left
  const largeur = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const bas = () => doc.page.height - doc.page.margins.bottom

  /** Une ligne faite de segments gras / maigres, justifiée, à la position donnée. */
  const ecrire = (bruts: readonly Segment[], x: number, l: number, taille: number) => {
    // En mode justifié, pdfkit avale l'espace qui OUVRE un segment enchaîné :
    // « **Avoir** : crédit » sortait « Avoir: crédit », « privatisé.Il est ».
    // Il garde en revanche celle qui FERME un segment : on l'y déplace.
    const segs = bruts.map((s) => ({ ...s }))
    for (let i = 1; i < segs.length; i += 1) {
      const tete = /^\s+/.exec(segs[i]!.texte)?.[0]
      if (tete) {
        segs[i]!.texte = segs[i]!.texte.slice(tete.length)
        segs[i - 1]!.texte += ' '
      }
    }
    doc.fontSize(taille).fillColor(ENCRE)
    segs.forEach((s, i) => {
      doc.font(s.gras ? 'Helvetica-Bold' : 'Helvetica')
      const options = { width: l, align: 'justify' as const, lineGap: 2, continued: i < segs.length - 1 }
      if (i === 0) doc.text(winAnsi(s.texte), x, doc.y, options)
      else doc.text(winAnsi(s.texte), options)
    })
  }

  // ── En-tête ────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(19).fillColor(ENCRE).text(winAnsi(entree.titre), gauche, doc.y, { width: largeur })
  doc.moveDown(0.35).font('Helvetica').fontSize(9.5).fillColor(GRIS)
  doc.text(
    winAnsi(`Version du ${entree.dateVersion}. Elle entre en vigueur à sa date de publication sur la Plateforme.`),
    { width: largeur },
  )
  doc.text(
    winAnsi(`${EDITEUR.raisonSociale}, SAS au capital de ${EDITEUR.capital} — ${EDITEUR.rcs} — ${EDITEUR.siege}`),
    { width: largeur },
  )
  doc.moveDown(0.6)
  doc.lineWidth(0.6).strokeColor('#c9ccd6').moveTo(gauche, doc.y).lineTo(gauche + largeur, doc.y).stroke()
  doc.moveDown(0.8)

  // ── Corps ──────────────────────────────────────────────────────────────
  for (const bloc of analyser(entree.texte)) {
    if (bloc.type === 'article') {
      // Une annexe commence sur sa propre page : elle s'imprime et se fait
      // signer à part (la note du Pratiquant). Un titre d'article, lui, ne
      // reste jamais seul en bas de page.
      if (/^annexe/i.test(bloc.texte) || doc.y > bas() - 70) doc.addPage()
      doc.moveDown(0.7)
      doc.font('Helvetica-Bold').fontSize(11.5).fillColor(ENCRE).text(winAnsi(bloc.texte), gauche, doc.y, { width: largeur })
      doc.moveDown(0.3)
    } else if (bloc.type === 'sous-titre') {
      if (doc.y > bas() - 50) doc.addPage()
      doc.moveDown(0.4)
      doc.font('Helvetica-Bold').fontSize(10).fillColor(ENCRE).text(winAnsi(bloc.texte), gauche, doc.y, { width: largeur })
      doc.moveDown(0.2)
    } else if (bloc.type === 'paragraphe') {
      ecrire(bloc.segments, gauche, largeur, 9.5)
      doc.moveDown(0.45)
    } else {
      for (const element of bloc.elements) {
        if (doc.y > bas() - 24) doc.addPage()
        const y = doc.y
        doc.font('Helvetica').fontSize(9.5).fillColor(ENCRE).text('•', gauche + 4, y, { width: 10, lineBreak: false })
        doc.y = y
        ecrire(element, gauche + 16, largeur - 16, 9.5)
        doc.moveDown(0.2)
      }
      doc.moveDown(0.3)
    }
  }

  // ── Pied de page : titre, version, page n / N ─────────────────────────
  const { start, count } = doc.bufferedPageRange()
  for (let i = start; i < start + count; i += 1) {
    doc.switchToPage(i)
    const marge = doc.page.margins.bottom
    // Écrire sous la marge basse ferait créer une page par pdfkit : on la lève
    // le temps du pied, puis on la rétablit.
    doc.page.margins.bottom = 0
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor(GRIS)
      .text(
        winAnsi(`Boxing Center — ${entree.titre} — version ${entree.version} — page ${i - start + 1} / ${count}`),
        gauche,
        doc.page.height - 36,
        { width: largeur, align: 'center', lineBreak: false },
      )
    doc.page.margins.bottom = marge
  }

  doc.end()
  return fini
}
