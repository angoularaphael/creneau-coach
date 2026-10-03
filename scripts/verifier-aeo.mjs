/**
 * Contrôle AEO / GEO sur le HTML SERVI — `node scripts/verifier-aeo.mjs [base]`
 *
 * La skill `aeo-geo` (§6) liste les contrôles à poser sans qu'on les demande.
 * Les voici, exécutés sur ce que le serveur renvoie vraiment, pas sur le code :
 * un titre calculé, une FAQ générée, un JSON-LD assemblé ne se vérifient qu'une
 * fois rendus.
 *
 *   base   par défaut http://localhost:3041
 *
 * Ce qui est contrôlé, page par page (routes « live » de la carte) :
 *
 *   · un seul H1 ;
 *   · entre 6 et 15 H2 — la fourchette où les citations culminent (HubSpot,
 *     State of AEO 2026 : « 7 to 15 H2s ») ; 6 est toléré pour les pages courtes ;
 *   · FAQ visible ⇔ `FAQPage`, avec LE MÊME nombre de questions ;
 *   · titre ≤ 60 caractères, description entre 80 et 158, les deux uniques ;
 *   · sur les pages d'intention : un chapeau `.reponse` d'au plus deux phrases,
 *     un « Mis à jour le » avec `<time datetime>`, un bloc Sources avec au
 *     moins un lien sortant ;
 *   · aucun `@id` JSON-LD défini deux fois sur la même page ;
 *   · aucun mot de jargon technique dans le texte visible (consigne d'Eddy :
 *     « take out any technical terms and put commercial terms instead ») ;
 *   · aucun `<meta name="keywords">` (−9 % mesuré pour le bourrage, Princeton).
 *
 * Ajoutés le 02/10/2026 — les contrôles de la skill `aeo-geo` §6 qui
 * n'étaient écrits nulle part, et les fautes trouvées ce jour-là :
 *
 *   · PAGES-RÉPONSES = les routes qui portent une `question` dans la carte (et
 *     toutes les `/location-…`) : le contrat complet s'y applique ;
 *   · AUCUN H2 DUPLIQUÉ ENTRE PAGES — échec s'il touche une page-réponse,
 *     avertissement sinon (les fiches club en ont : voir le rapport du jour) ;
 *   · LA DATE EST CELLE DE GIT : `lastModified` ≥ dernier commit de la page,
 *     égale à aujourd'hui si la page est modifiée et pas encore commitée ;
 *     `datePublished` = premier commit ; le « Mis à jour le » visible et le
 *     `dateModified` du JSON-LD disent la même date que la carte ;
 *   · PAS DE VENTE NÉGATIVE : ni le H1 ni le chapeau ne s'ouvrent sur une
 *     absence (« il n'y a pas », « aucun », « sans »…) ;
 *   · FAITS FAUX connus, sur toutes les pages servies : la signature « une
 *     fois pour toutes », l'avoir qui « se déduit » ou couvre « les deux
 *     tiers », « rien à ranger », et les heures du soir (non annoncées) ;
 *   · PRIX : tout montant en euros d'un titre ou d'une description est l'un
 *     des deux tarifs lus dans `src/domain/contrat.ts`.
 *
 * Code de sortie non nul au moindre échec : branchable en CI.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (process.argv[2] ?? 'http://localhost:3041').replace(/\/$/, '')
const carte = JSON.parse(readFileSync(join(RACINE, 'src/lib/seo/routes.data.json'), 'utf8'))

const ROUTES_LIVE = carte.routes.filter((r) => r.status === 'live').map((r) => r.path)
const ROUTE = new Map(carte.routes.map((r) => [r.path, r]))
/** Les pages-réponses : une question déclarée dans la carte, ou une page d'intention. */
const INTENTIONS = ROUTES_LIVE.filter((p) => p.startsWith('/location-') || ROUTE.get(p)?.question)

/** Les deux tarifs, lus dans le contrat — pas recopiés ici. */
const CONTRAT = readFileSync(join(RACINE, 'src/domain/contrat.ts'), 'utf8')
const PRIX_AUTORISES = new Set(
  ['offpeak_cents', 'peak_cents'].map((cle) => {
    // `\b` : sans lui, « peak_cents » trouve d'abord « offpeak_cents ».
    const c = Number(CONTRAT.match(new RegExp(`\\b${cle}:\\s*(\\d+)`))?.[1])
    return String(c / 100)
  }),
)

/**
 * Les faits faux déjà publiés une fois, et démentis par le contrat. Une faute
 * trouvée devient un contrôle, pas un souvenir (skill `baffled-bar`, barre de
 * la vérité). Chaque motif dit pourquoi il est faux.
 */
const FAITS_FAUX = [
  { re: /sign\w*[^.]{0,40}une fois pour toutes|une fois pour toutes[^.]{0,40}sign|\bsigne[rz]? une fois\b|\bsignez une fois\b/i, pourquoi: 'la signature suit chaque paiement (CG art. 9)' },
  { re: /avoir[^.]{0,60}se d[ée]duit/i, pourquoi: 'un avoir paie une réservation entière, sans paiement mixte (CG art. 10.5)' },
  { re: /deux tiers d.une heure/i, pourquoi: 'un avoir ne paie pas une fraction d’heure (CG art. 10.5)' },
  { re: /rien à ranger/i, pourquoi: 'l’équipement se remet en place (RI art. 4.4)' },
  { re: /\b(19|20)\s?h\s?(à|-|–)\s?2[01]\s?h|jusqu.à 2[01]\s?h/i, pourquoi: 'les heures du soir ne sont pas annoncées (consigne du 27/09/2026)' },
]

/** Une vente négative : la page s'ouvre sur ce qui manque (barre commerciale). */
const VENTE_NEGATIVE = /^(il n['’]y a (pas|ni|aucun)|nous ne|on ne|pas de|aucune?\b|sans\b|ce service ne|ce n['’]est pas)/i

/** La date du jour, à l'heure locale : celle qu'aurait un commit fait maintenant. */
const AUJOURDHUI = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

const git = (...args) => {
  try {
    return execFileSync('git', args, { cwd: RACINE, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

/** Le fichier de la page d'une route statique, s'il existe. */
const fichierDe = (chemin) => {
  const f = join('src', 'app', ...chemin.split('/').filter(Boolean), 'page.tsx')
  return existsSync(join(RACINE, f)) ? f.replaceAll('\\', '/') : null
}

/**
 * Le jargon interdit à l'écran. Des mots de développeur, pas de coach : ils
 * étaient apparus sur les pages publiques (« Hold 10 minutes », « cookies
 * httpOnly », « Europe/Paris ») et Eddy les a fait retirer.
 */
const JARGON = [
  /\bhold\b/i, /\bslots?\b/i, /\bhttpOnly\b/i, /\btoken\b/i, /\bRLS\b/,
  /\bendpoint\b/i, /\bwebhook\b/i, /\bpayload\b/i, /Europe\/Paris/, /\bsupabase\b/i,
  /\bJSON\b/, /\bstatus\b/i, /\bmock\b/i, /\bnull\b/, /\bundefined\b/,
  // Ajoutés le 27/09/2026 : la page contact affichait « Formulaire POST /contact
  // (rate limit 5 / h). Mail transactionnel = Lot Raphael. » et ce contrôle ne
  // l'a pas vu. Une liste de jargon se complète à chaque fuite trouvée.
  /\b(POST|GET|PUT|PATCH|DELETE)\s+\//, /rate[\s-]?limit/i, /\bLot\s+[ABC]\b/, /\bRaphael\b/i,
  /\bmail transactionnel\b/i, /\bDeciplus\b/i, /\bservice_role\b/i, /\bmiddleware\b/i,
  /\bproxy\b/i, /\bcron\b/i, /\bSQL\b/, /\bAPI\b/, /\bidempoten/i,
]

/**
 * Les pages où un nom de prestataire n'est PAS du jargon mais une obligation.
 *
 * Nommer l'hébergeur des données sur la politique de confidentialité et les
 * mentions légales est une exigence de transparence (RGPD, LCEN). Le contrôle
 * ne doit pas pousser à retirer une mention légale pour se taire : il l'exempte,
 * page par page, terme par terme — et nulle part ailleurs.
 */
const EXEMPTIONS = {
  '/confidentialite': [/\bsupabase\b/i],
  '/mentions-legales': [/\bsupabase\b/i],
}
const exempte = (chemin, re) => (EXEMPTIONS[chemin] ?? []).some((x) => x.source === re.source)

const echecs = []
const avertissements = []
const vus = { titres: new Map(), descriptions: new Map() }
/** Les H2 de chaque page servie, pour le contrôle croisé. */
const h2Par = new Map()

const texteVisible = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')

const compter = (html, re) => (html.match(re) ?? []).length

for (const chemin of ROUTES_LIVE) {
  let html
  try {
    const r = await fetch(BASE + chemin, { redirect: 'manual' })
    if (r.status !== 200) {
      echecs.push(`${chemin} : HTTP ${r.status}`)
      continue
    }
    html = await r.text()
  } catch (e) {
    echecs.push(`${chemin} : injoignable (${e.message})`)
    continue
  }

  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html
  const f = (m) => echecs.push(`${chemin} : ${m}`)

  // ── Titres ──────────────────────────────────────────────────────────────
  const h1 = compter(main, /<h1[\s>]/gi)
  if (h1 !== 1) f(`${h1} H1 (attendu : 1)`)

  const h2 = compter(main, /<h2[\s>]/gi)
  if (h2 < 6 || h2 > 15) {
    ;(INTENTIONS.includes(chemin) ? echecs : avertissements).push(
      `${chemin} : ${h2} H2 (fourchette 6-15)`,
    )
  }

  // ── Métadonnées ─────────────────────────────────────────────────────────
  const titre = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'") ?? ''
  const desc =
    html.match(/<meta name="description" content="([^"]*)"/i)?.[1]?.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'") ?? ''
  if (!titre) f('titre absent')
  else if ([...titre].length > 60) f(`titre de ${[...titre].length} caractères (> 60) : « ${titre} »`)
  if (!desc) f('description absente')
  else if ([...desc].length < 80 || [...desc].length > 158)
    f(`description de ${[...desc].length} caractères (80-158)`)
  for (const [cle, val] of [['titres', titre], ['descriptions', desc]]) {
    if (!val) continue
    if (vus[cle].has(val)) f(`${cle.slice(0, -1)} identique à ${vus[cle].get(val)}`)
    else vus[cle].set(val, chemin)
  }
  if (/<meta name="keywords"/i.test(html)) f('<meta name="keywords"> présent (bourrage : −9 % mesuré)')

  // ── Prix : un titre ou une description ne publie que la grille réelle ────
  for (const [quoi, val] of [['titre', titre], ['description', desc]]) {
    for (const m of val.matchAll(/(\d+(?:,\d+)?)\s?€/g)) {
      if (!PRIX_AUTORISES.has(m[1].replace(',', '.'))) {
        f(`${quoi} : « ${m[0]} » n’est pas un tarif du contrat (${[...PRIX_AUTORISES].join(' € ou ')} €)`)
      }
    }
  }

  // ── H2, gardés pour le contrôle croisé entre pages ─────────────────────
  h2Par.set(
    chemin,
    [...main.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi)].map((m) => texteVisible(m[1]).trim().toLowerCase()),
  )

  // ── JSON-LD ─────────────────────────────────────────────────────────────
  const blocs = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
  const noeuds = []
  for (const b of blocs) {
    try {
      const v = JSON.parse(b)
      for (const n of Array.isArray(v) ? v : [v]) {
        // Le layout pose un `@graph` : ses nœuds comptent comme les autres.
        if (Array.isArray(n['@graph'])) noeuds.push(...n['@graph'])
        else noeuds.push(n)
      }
    } catch {
      f('JSON-LD illisible')
    }
  }
  const ids = noeuds.filter((n) => n['@id'] && n.name).map((n) => n['@id'])
  const doublons = ids.filter((id, i) => ids.indexOf(id) !== i)
  if (doublons.length) f(`@id défini deux fois : ${[...new Set(doublons)].join(', ')}`)

  // ── FAQ visible ⇔ FAQPage ───────────────────────────────────────────────
  const faqVisible = compter(main, /class="faq-aeo__item"/g)
  const faqBalisee = noeuds.filter((n) => n['@type'] === 'FAQPage').reduce((s, n) => s + (n.mainEntity?.length ?? 0), 0)
  if (faqVisible !== faqBalisee) f(`FAQ : ${faqVisible} visibles, ${faqBalisee} balisées`)

  // ── Pages d'intention : réponse, date, sources ─────────────────────────
  if (INTENTIONS.includes(chemin)) {
    const reponse = main.match(/<p class="reponse"[^>]*>([\s\S]*?)<\/p>/)?.[1]
    if (!reponse) f('chapeau .reponse absent')
    else {
      const lu = texteVisible(reponse).trim()
      const phrases = lu.split(/(?<=[.!?])\s+/).filter((p) => p.trim().length > 3)
      if (phrases.length > 2) f(`chapeau de ${phrases.length} phrases (≤ 2 : il doit tenir seul)`)
      if (VENTE_NEGATIVE.test(lu)) f(`vente négative : le chapeau s’ouvre sur une absence — « ${lu.slice(0, 50)}… »`)
    }
    const h1Texte = texteVisible(main.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '').trim()
    if (VENTE_NEGATIVE.test(h1Texte)) f(`vente négative : le H1 s’ouvre sur une absence — « ${h1Texte} »`)
    const maj = main.match(/Mis à jour le\s*<time dateTime="(\d{4}-\d{2}-\d{2})"/i)?.[1]
    if (!maj) f('« Mis à jour le » sans <time datetime>')

    // ── La date est celle de git ─────────────────────────────────────────
    const route = ROUTE.get(chemin)
    if (!route?.lastModified) f('« lastModified » absent de la carte : la date affichée ne vient de nulle part')
    else {
      if (maj && maj !== route.lastModified) f(`« Mis à jour le » ${maj} ≠ carte ${route.lastModified}`)
      const page = noeuds.find((n) => n['@type'] === 'WebPage')
      if (page && page.dateModified !== route.lastModified) {
        f(`JSON-LD dateModified ${page.dateModified ?? 'absent'} ≠ carte ${route.lastModified}`)
      }
      const fichier = fichierDe(chemin)
      if (fichier) {
        const sale = git('status', '--porcelain', '--', fichier)
        const dernier = git('log', '-1', '--format=%cs', '--', fichier)
        const premier = git('log', '--diff-filter=A', '--format=%cs', '--', fichier)?.split('\n').pop() || null
        if (sale) {
          if (route.lastModified !== AUJOURDHUI) {
            f(`${fichier} est modifié et pas encore commité : « lastModified » doit valoir ${AUJOURDHUI}, la carte dit ${route.lastModified}`)
          }
        } else if (dernier && route.lastModified < dernier) {
          f(`${fichier} a changé le ${dernier} (git) mais la carte dit « mis à jour le ${route.lastModified} »`)
        }
        const publie = premier ?? AUJOURDHUI
        if (route.datePublished && route.datePublished !== publie) {
          f(`« datePublished » ${route.datePublished} ≠ premier commit de la page (${publie})`)
        }
      }
    }
    const sources = main.match(/<aside class="sources"[\s\S]*?<\/aside>/)?.[0] ?? ''
    if (compter(sources, /href="https?:\/\//g) < 1) f('bloc Sources sans lien sortant')
  }

  // ── Jargon à l'écran ────────────────────────────────────────────────────
  const visible = texteVisible(main)
  for (const { re, pourquoi } of FAITS_FAUX) {
    const m = visible.match(re)
    if (m) f(`fait faux : « ${m[0]} » — ${pourquoi}`)
  }
  for (const re of JARGON) {
    if (exempte(chemin, re)) continue
    const m = visible.match(re)
    if (m) f(`jargon visible : « ${m[0]} » — …${visible.slice(Math.max(0, m.index - 40), m.index + 40)}…`)
  }
}

// ── Aucun H2 dupliqué entre pages (skill `aeo-geo` §6) ─────────────────
// Deux pages qui portent le même H2 se disputent la même réponse, ou trahissent
// un gabarit recopié — le motif des pages-villes que Google replie en une seule.
{
  const premierePage = new Map()
  for (const [chemin, h2s] of h2Par) {
    for (const h of new Set(h2s)) {
      const deja = premierePage.get(h)
      if (!deja) {
        premierePage.set(h, chemin)
        continue
      }
      const message = `H2 « ${h} » à la fois sur ${deja} et sur ${chemin}`
      if (INTENTIONS.includes(chemin) || INTENTIONS.includes(deja)) echecs.push(message)
      else avertissements.push(message)
    }
  }
}

// ── Le jargon, sur TOUTES les pages publiques ────────────────────────────
// Les contrôles de structure ne valent que pour les pages indexables. Le
// jargon, lui, se voit partout où un coach passe : connexion, inscription,
// mentions légales — des pages « draft » ou hors carte, servies quand même.
const TOUTES = [
  ...carte.routes.map((r) => r.path).filter((p) => !ROUTES_LIVE.includes(p)),
  ...(carte.cheminsAuth ?? []),
  '/auth/connexion',
  '/auth/inscription',
]
for (const chemin of [...new Set(TOUTES)]) {
  let r
  try {
    r = await fetch(BASE + chemin, { redirect: 'manual' })
  } catch {
    continue
  }
  if (r.status !== 200) continue
  const html = await r.text()
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html
  const visible = texteVisible(main)
  for (const { re, pourquoi } of FAITS_FAUX) {
    const m = visible.match(re)
    if (m) echecs.push(`${chemin} : fait faux : « ${m[0]} » — ${pourquoi}`)
  }
  for (const re of JARGON) {
    if (exempte(chemin, re)) continue
    const m = visible.match(re)
    if (m) echecs.push(`${chemin} : jargon visible : « ${m[0]} » — …${visible.slice(Math.max(0, m.index - 40), m.index + 40)}…`)
  }
}

console.log(`\nContrôle AEO — ${ROUTES_LIVE.length} pages « live », base ${BASE}\n`)
for (const a of avertissements) console.log('  avert.  ' + a)
for (const e of echecs) console.log('  ÉCHEC   ' + e)
if (echecs.length === 0) console.log(`  Tout passe (${avertissements.length} avertissement(s)).`)
console.log('')
process.exit(echecs.length ? 1 : 0)
