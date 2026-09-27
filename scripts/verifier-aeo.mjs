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
 * Code de sortie non nul au moindre échec : branchable en CI.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (process.argv[2] ?? 'http://localhost:3041').replace(/\/$/, '')
const carte = JSON.parse(readFileSync(join(RACINE, 'src/lib/seo/routes.data.json'), 'utf8'))

const ROUTES_LIVE = carte.routes.filter((r) => r.status === 'live').map((r) => r.path)
const INTENTIONS = ROUTES_LIVE.filter((p) => p.startsWith('/location-'))

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

  // ── JSON-LD ─────────────────────────────────────────────────────────────
  const blocs = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1])
  const noeuds = []
  for (const b of blocs) {
    try {
      const v = JSON.parse(b)
      noeuds.push(...(Array.isArray(v) ? v : [v]))
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
      const phrases = texteVisible(reponse).split(/(?<=[.!?])\s+/).filter((p) => p.trim().length > 3)
      if (phrases.length > 2) f(`chapeau de ${phrases.length} phrases (≤ 2 : il doit tenir seul)`)
    }
    if (!/Mis à jour le\s*<time dateTime="\d{4}-\d{2}-\d{2}"/i.test(main)) f('« Mis à jour le » sans <time datetime>')
    const sources = main.match(/<aside class="sources"[\s\S]*?<\/aside>/)?.[0] ?? ''
    if (compter(sources, /href="https?:\/\//g) < 1) f('bloc Sources sans lien sortant')
  }

  // ── Jargon à l'écran ────────────────────────────────────────────────────
  const visible = texteVisible(main)
  for (const re of JARGON) {
    if (exempte(chemin, re)) continue
    const m = visible.match(re)
    if (m) f(`jargon visible : « ${m[0]} » — …${visible.slice(Math.max(0, m.index - 40), m.index + 40)}…`)
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
