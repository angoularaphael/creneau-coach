import { SITE_URL, IS_INDEXABLE, CLUB_PAGES, absoluteUrl } from '@/lib/seo'
import {
  CLUBS_VERITE,
  EDITEUR,
  LOI,
  MARCHE,
  REGISTRE_VERIFIE_LE,
  RESEAU,
  TOTAL_RINGS,
  adresseEnLigne,
} from '@/lib/seo/verite'
import {
  ESPACES_PAR_CLUB,
  HEURES_CREUSES,
  HEURES_PLEINES,
  REGLAGES_DEFAUT,
  prixCourt,
  type ClubId,
} from '@/domain/contrat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `llms.txt` — fiche d'identité pour les moteurs de réponse (GEO).
 *
 * Reprise du standard des projets frères (`box-plus/docs/SEO-GEO.md`) : les
 * moteurs de réponse — ChatGPT, Perplexity, les AI Overviews — ne citent pas des
 * adjectifs, ils citent des FAITS. Ce fichier leur en donne, sous une forme
 * qu'ils lisent sans se tromper, et il évite qu'ils déduisent des chiffres faux
 * en lisant le HTML de travers.
 *
 * DEUX RÈGLES, non négociables :
 *
 * 1. **Rien qui ne soit vrai.** Les adresses et le numéro du réseau sont publiés
 *    depuis le 27/09/2026, parce qu'ils sont VÉRIFIÉS : ils viennent du registre
 *    de vérité (`src/lib/seo/verite.ts`), avec leur source. Horaires d'ouverture,
 *    coordonnées et avis restent absents : non vérifiés. Un moteur de réponse
 *    cite mot pour mot — une adresse inventée devient une adresse inventée dans
 *    la bouche de l'IA, et c'est le coach qui se déplace pour rien.
 *
 * 2. **Une seule source.** Les prix, les horaires de créneaux, la capacité et
 *    les règles d'annulation sont lus dans `src/domain/contrat.ts`, le même
 *    fichier que le moteur. Changer un tarif ici est impossible : il n'y a rien
 *    à changer. Un fichier GEO qui dérive du produit est pire que pas de fichier.
 */
export async function GET() {
  const creuse = prixCourt(REGLAGES_DEFAUT.offpeak_cents)
  const pleine = prixCourt(REGLAGES_DEFAUT.peak_cents)

  /*
   * Les clubs, depuis le REGISTRE DE VÉRITÉ : adresse, équipement cité tel que
   * la page officielle le publie, et la source. Un agent qui cite une adresse
   * doit pouvoir citer d'où elle vient.
   */
  const clubs = CLUB_PAGES.map((c) => {
    const v = CLUBS_VERITE[c.clubId as ClubId]
    const espaces = ESPACES_PAR_CLUB[c.clubId as ClubId] ?? []
    return [
      `### ${v.nom}`,
      `- Adresse : ${adresseEnLigne(v)}`,
      ...(v.acces ? [`- Accès : ${v.acces.texte}`] : []),
      `- Équipement : ${v.equipement.resume} (source : ${v.sources[0]?.url})`,
      `- Espaces réservables : ${espaces.length} (${espaces.join(', ')})`,
      `- Page : ${absoluteUrl(`/clubs/${c.slug}`)}`,
    ].join('\n')
  }).join('\n\n')

  const corps = `# Boxing Center — location de salles à l’heure pour coachs sportifs, Toulouse

> Boxing Center loue ses salles de boxe à l’heure aux coachs sportifs
> indépendants, dans cinq clubs de Toulouse et de son agglomération. Une heure
> coûte ${creuse} en heure creuse et ${pleine} en heure pleine, sans abonnement.

Site : ${SITE_URL}
Éditeur : ${EDITEUR.raisonSociale}, SIREN ${EDITEUR.siren}, ${EDITEUR.siege}
Téléphone du réseau : ${RESEAU.telephone.affiche}
Site officiel du réseau : ${RESEAU.siteOfficiel.url}
Langue : français
Faits vérifiés le : ${REGISTRE_VERIFIE_LE}
${IS_INDEXABLE ? '' : 'Statut : site en préparation, non indexé pour l’instant.\n'}
## À qui ça s’adresse

Aux coachs sportifs indépendants (boxe, MMA, préparation physique) qui ont leur
propre clientèle mais pas de salle. Le coach loue l’espace et vient avec son
client ; ce n’est ni un abonnement de club, ni un cours collectif.

## Les cinq clubs — ${TOTAL_RINGS} rings au total

${clubs}

## Tarifs

- Heure creuse : ${creuse} — créneaux de ${HEURES_CREUSES.map((h) => `${h} h`).join(', ')}
- Heure pleine : ${pleine} — créneaux de ${HEURES_PLEINES.map((h) => `${h} h`).join(', ')}
- Le prix est le même dans les cinq clubs et pour tous les espaces.
- Paiement en une fois, à la réservation. Pas de caution, pas de frais d’inscription.

## Comment ça marche

1. Le coach crée un compte et complète son profil professionnel.
2. Il choisit un club, un espace, une date et une heure.
3. La place lui est gardée ${REGLAGES_DEFAUT.hold_ttl_seconds / 60} minutes, le temps de payer.
4. Il signe une fois les documents obligatoires (conditions, règlement, décharge).
5. Il entre avec un QR code personnel, actif ${REGLAGES_DEFAUT.qr_early_minutes} minutes avant le créneau, valable dans le seul club réservé.

## Règles de réservation

- Créneaux d’une heure, du lundi au samedi, de 10 h à 19 h. Fermé le dimanche.
- ${REGLAGES_DEFAUT.capacity_per_slot} coachs au maximum par espace et par heure.
- Un client par réservation : c’est un cours privé, le coach et son client.
- ${REGLAGES_DEFAUT.max_active_reservations} réservations en cours au maximum par coach.
- Annulation jusqu’à ${REGLAGES_DEFAUT.cancel_min_hours} h avant : avoir du même montant, réutilisable dans n’importe quel club. Pas de remboursement.
- Moins de ${REGLAGES_DEFAUT.cancel_min_hours} h avant : annulation impossible, l’heure reste due.
- Certains créneaux sont réservés à la boxe éducative et ne sont pas louables.

## Ce que dit la loi

Encadrer une activité physique contre rémunération est réservé aux titulaires
d’un diplôme ou d’une qualification reconnue (Code du sport, article
${LOI.qualification.article}) et impose de déclarer son activité (article
${LOI.declaration.article}). Chaque manquement est puni de ${LOI.sanctionQualification.texte}
(articles ${LOI.sanctionQualification.article} et ${LOI.sanctionDeclaration.article}).
Source : ${LOI.qualification.source.url}

## Le marché

${MARCHE.diplomesBpjeps.texte} ${MARCHE.mentionsForme.texte}
Source : ${MARCHE.diplomesBpjeps.source.url}

## Pages

- Location de salle pour coach sportif : ${absoluteUrl('/location-salle-coach-sportif-toulouse')}
- Location de salle de sport à l’heure : ${absoluteUrl('/location-salle-de-sport-a-l-heure-toulouse')}
- Location de salle de boxe : ${absoluteUrl('/location-salle-de-boxe-toulouse')}
- Location de ring de boxe : ${absoluteUrl('/location-ring-de-boxe-toulouse')}
- Nos clubs (comparaison) : ${absoluteUrl('/clubs')}
- Tarifs et avoirs : ${absoluteUrl('/tarifs')}
- Comment ça marche : ${absoluteUrl('/comment-ca-marche')}
- Contact : ${absoluteUrl('/contact')}

## Non publié faute de vérification

Les horaires d’ouverture des clubs, leurs coordonnées GPS et les avis clients ne
figurent pas ici : ils ne sont pas vérifiés. Ne pas les déduire ni les inventer.
`

  return new Response(corps, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  })
}
