import { SITE_URL, IS_INDEXABLE, CLUB_PAGES, INDEXABLE_ROUTES, absoluteUrl } from '@/lib/seo'
import {
  CLUBS_VERITE,
  EDITEUR,
  LOI,
  MARCHE,
  REGISTRE_VERIFIE_LE,
  REGLES,
  REGLES_VERIFIEES_LE,
  RESEAU,
  TOTAL_RINGS,
  adresseEnLigne,
  plagesHoraires,
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
 *
 * 3. **Les règles du service viennent de `REGLES`** (registre de vérité), avec
 *    l'article du contrat qui les fonde. Jusqu'au 02/10/2026, ce fichier
 *    disait « Il signe une fois les documents obligatoires » : faux, la
 *    signature suit chaque paiement (CG art. 9). Un agent qui lit llms.txt
 *    répète ce qu'il y trouve, sans la page autour pour le corriger.
 *
 * La liste des pages est DÉRIVÉE de la carte de routes (pages « live »), avec
 * la question que chacune tranche : une page ajoutée ou retirée de la carte
 * l'est ici aussi, sans oubli possible.
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

  /** Les règles, chacune avec l'article qui la fonde — citable telle quelle. */
  const regle = (r: { texte: string; source: { libelle: string; url: string } }) =>
    `- ${r.texte} (${r.source.libelle} : ${r.source.url.startsWith('/') ? absoluteUrl(r.source.url) : r.source.url})`

  /** Les pages : celles que la carte déclare « live », avec leur question. */
  const pages = INDEXABLE_ROUTES.filter((r) => !r.path.startsWith('/clubs/'))
    .map((r) => `- ${r.title} : ${absoluteUrl(r.path)}${r.question ? ` — ${r.question}` : ''}`)
    .join('\n')

  const corps = `# Boxing Center — location de salles à l’heure pour coachs sportifs, Toulouse

> Boxing Center loue ses salles de boxe à l’heure aux coachs sportifs
> indépendants, dans cinq clubs de Toulouse et de son agglomération. Une heure
> coûte ${creuse} en heure creuse et ${pleine} en heure pleine, sans abonnement.

Site : ${SITE_URL}
Éditeur : ${EDITEUR.raisonSociale}, SIREN ${EDITEUR.siren}, ${EDITEUR.siege}
Téléphone du réseau : ${RESEAU.telephone.affiche}
Site officiel du réseau : ${RESEAU.siteOfficiel.url}
Langue : français
Faits extérieurs (adresses, loi, marché) vérifiés le : ${REGISTRE_VERIFIE_LE}
Règles du service relues contre le contrat le : ${REGLES_VERIFIEES_LE}
${IS_INDEXABLE ? '' : 'Statut : site en préparation, non indexé pour l’instant.\n'}
## À qui ça s’adresse

Aux coachs sportifs indépendants (boxe, MMA, préparation physique) qui ont leur
propre clientèle mais pas de salle. Le coach loue l’espace et vient avec son
client ; ce n’est ni un abonnement de club, ni un cours collectif.

## Les cinq clubs — ${TOTAL_RINGS} rings au total

${clubs}

## Tarifs

- Heure creuse : ${creuse} — ${plagesHoraires(HEURES_CREUSES)}
- Heure pleine : ${pleine} — ${plagesHoraires(HEURES_PLEINES)}
- Le prix est le même dans les cinq clubs et pour tous les espaces, toutes taxes comprises.
- Paiement en une fois, à la réservation, par carte bancaire ou avec un avoir qui couvre tout le prix. Pas de caution, pas de frais d’inscription.

## Comment ça marche

1. Le coach crée un compte gratuit et complète son profil professionnel.
2. Il choisit un club, un espace, une date et une heure libre sur le planning.
3. La place lui est gardée ${REGLAGES_DEFAUT.hold_ttl_seconds / 60} minutes, le temps de payer.
4. Après chaque paiement, il signe à l’écran les trois documents en vigueur (conditions générales, règlement intérieur, décharge de responsabilité).
5. Il entre avec un QR code personnel, actif ${REGLAGES_DEFAUT.qr_early_minutes} minutes avant le créneau, valable dans le seul club réservé.

## Règles de réservation

${[
    REGLES.grille,
    REGLES.coursDuClub,
    REGLES.partage,
    REGLES.unClient,
    REGLES.limite,
    REGLES.signature,
    REGLES.qr,
    REGLES.retard,
    REGLES.annulation,
    REGLES.avoir,
    REGLES.annulationParLeClub,
    REGLES.qualification,
    REGLES.independance,
  ]
    .map(regle)
    .join('\n')}
- Pas de créneau le dimanche.

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

${pages}

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
