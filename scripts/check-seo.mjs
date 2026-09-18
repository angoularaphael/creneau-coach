#!/usr/bin/env node
/**
 * check-seo.mjs — les critères d'acceptation SEO rendus exécutables.
 *
 * Reprend point par point docs/SEO-INFORMATION-ARCHITECTURE.md §14, plus les
 * garde-fous de .research/spec-05-seo.md §10.1, §13 et §15.3.
 *
 * Zéro dépendance, `fetch` natif (Node >= 20). Se lance contre le serveur de
 * développement, contre `next start`, ou contre un déploiement :
 *
 *   node scripts/check-seo.mjs
 *   node scripts/check-seo.mjs http://localhost:3041
 *   node scripts/check-seo.mjs https://coach.boxingcenter.fr --strict
 *   node scripts/check-seo.mjs --statique          (contrôles de source seuls)
 *
 * Trois niveaux, et la différence compte :
 *   ECHEC   quelque chose est faux et sortirait faux en production  -> code 1
 *   ALERTE  suspect, à regarder, ne bloque pas
 *   ATTENTE une page en « draft » n'est pas encore écrite (lot B).  C'est un
 *           état normal aujourd'hui. `--strict` le transforme en ECHEC : c'est
 *           la forme à passer avant d'ouvrir l'indexation.
 *
 * La carte de routes n'est PAS recopiée ici : le script lit le même
 * `src/lib/seo/routes.data.json` que l'application. Une route ajoutée d'un côté
 * est vue de l'autre, sans build et sans oubli possible.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, relative, resolve } from 'node:path'

const ICI = dirname(fileURLToPath(import.meta.url))
const RACINE = resolve(ICI, '..')

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const STRICT = args.includes('--strict')
const STATIQUE_SEULEMENT = args.includes('--statique')
const BASE = (
  args.find((a) => !a.startsWith('--')) ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  'http://localhost:3041'
).replace(/\/+$/, '')

// ---------------------------------------------------------------------------
// Journal
// ---------------------------------------------------------------------------

let echecs = 0
let alertes = 0
let attentes = 0

const fail = (m) => {
  echecs++
  console.error(`  ECHEC    ${m}`)
}
const warn = (m) => {
  alertes++
  console.warn(`  ALERTE   ${m}`)
}
const pending = (m) => {
  if (STRICT) return fail(`${m}  [--strict]`)
  attentes++
  console.log(`  ATTENTE  ${m}`)
}
const ok = (m) => console.log(`  ok       ${m}`)
const section = (t) => console.log(`\n=== ${t} ===`)

// ---------------------------------------------------------------------------
// Source de vérité
// ---------------------------------------------------------------------------

const CHEMIN_CARTE = join(RACINE, 'src', 'lib', 'seo', 'routes.data.json')
if (!existsSync(CHEMIN_CARTE)) {
  console.error(`ECHEC : carte de routes introuvable (${CHEMIN_CARTE}).`)
  process.exit(1)
}

let carte
try {
  carte = JSON.parse(readFileSync(CHEMIN_CARTE, 'utf8'))
} catch (e) {
  console.error(`ECHEC : ${CHEMIN_CARTE} n'est pas du JSON valide — ${e.message}`)
  process.exit(1)
}

const ROUTES = carte.routes ?? []
const CLUBS = carte.clubs ?? []
const PREFIXES_PRIVES = carte.prefixesPrives ?? []
const CHEMINS_AUTH = carte.cheminsAuth ?? []
const CHEMINS_PUBLICS = ROUTES.map((r) => r.path)

/** Clés JSON-LD interdites tant que la décision D5 tient (aucun fait confirmé). */
const CLES_JSONLD_INTERDITES = [
  'address',
  'openingHours',
  'openingHoursSpecification',
  'geo',
  'aggregateRating',
  'review',
  'ratingValue',
  'reviewCount',
  'priceRange',
  'telephone',
  'faxNumber',
]

/** Ce qui ne doit jamais apparaître dans le HTML public (§14). */
const FUITES_BLOQUANTES = [
  { nom: 'jeton QR', re: /qr[_-]?token/i },
  { nom: 'identifiant Deciplus', re: /deciplus[_-]?(member|id|login|password)/i },
  { nom: 'identifiant de réservation', re: /reservation[_-]?id["'\s:=]/i },
  { nom: 'secret', re: /(hmac|webhook|service[_-]role|sync)[_-]secret/i },
  { nom: 'clé Supabase de service', re: /SUPABASE_SERVICE_ROLE/i },
]
const FUITES_A_SURVEILLER = [
  { nom: 'adresse e-mail', re: /[\w.+-]+@[\w-]+\.[\w.]{2,}/ },
]

// ---------------------------------------------------------------------------
// Petits outils
// ---------------------------------------------------------------------------

/**
 * Retire commentaires de bloc et de ligne. Indispensable : ces fichiers
 * documentent abondamment les valeurs qu'ils n'utilisent PAS (« pour basculer,
 * écrire TRAILING_SLASH = true »). Chercher dans le texte brut ferait prendre
 * chaque explication pour du code.
 */
const sansCommentaires = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

const lire = (chemin, { code = false } = {}) => {
  const complet = join(RACINE, chemin)
  if (!existsSync(complet)) return null
  const contenu = readFileSync(complet, 'utf8')
  return code ? sansCommentaires(contenu) : contenu
}

/**
 * Un manque de socle sur une page « draft » n'est pas un défaut de production :
 * la page n'est pas encore validée, c'est exactement ce que « draft » veut dire.
 * Sur une page « live », c'en est un. `--strict` rend les deux bloquants, et
 * c'est la forme à passer avant d'ouvrir l'indexation.
 */
const manque = (estLive, message) => (estLive ? fail(message) : pending(message))

/**
 * Un « ok » imprimé juste sous une pile d'ECHEC est un mensonge de plus dans un
 * journal. `okSi` ne conclut un bloc que si ce bloc n'a rien cassé.
 */
const marque = () => echecs
const okSi = (avant, message) => {
  if (echecs === avant) ok(message)
}

const normaliser = (c) => {
  const sansQuery = (c.split(/[?#]/)[0] ?? c).replace(/\/+$/, '')
  return sansQuery === '' ? '/' : sansQuery
}

const compterBalises = (html, tag) =>
  (html.match(new RegExp(`<${tag}(\\s|>)`, 'gi')) ?? []).length

const attribut = (html, re) => html.match(re)?.[1] ?? null

const canonicalDe = (html) =>
  attribut(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i) ??
  attribut(html, /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i)

const titreDe = (html) =>
  attribut(html, /<title[^>]*>([\s\S]*?)<\/title>/i)?.trim() ?? null

const descriptionDe = (html) =>
  attribut(html, /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)

const metaRobotsDe = (html) =>
  attribut(html, /<meta[^>]+name=["']robots["'][^>]+content=["']([^"']*)["']/i)

function blocsJsonLd(html, chemin) {
  const sortie = []
  const re =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) {
    try {
      sortie.push(JSON.parse(m[1].replace(/\\u003c/g, '<')))
    } catch {
      fail(`${chemin} : bloc JSON-LD illisible (JSON invalide)`)
    }
  }
  return sortie.flat()
}

function liensInternes(html) {
  const sortie = new Set()
  const re = /<a[^>]+href=["'](\/[^"']*)["']/gi
  let m
  while ((m = re.exec(html))) sortie.add(normaliser(m[1]))
  return [...sortie]
}

function fichiersRecursifs(dossier, filtre) {
  const complet = join(RACINE, dossier)
  if (!existsSync(complet)) return []
  const sortie = []
  const parcourir = (d) => {
    for (const nom of readdirSync(d)) {
      if (nom === 'node_modules' || nom.startsWith('.')) continue
      const p = join(d, nom)
      if (statSync(p).isDirectory()) parcourir(p)
      else if (filtre(nom)) sortie.push(p)
    }
  }
  parcourir(complet)
  return sortie
}

async function get(chemin) {
  try {
    const res = await fetch(`${BASE}${chemin}`, { redirect: 'manual' })
    const type = res.headers.get('content-type') ?? ''
    const body =
      res.status < 400 || res.status === 404
        ? type.includes('html') || type.includes('text') || type.includes('xml')
          ? await res.text()
          : ''
        : ''
    return { res, body, status: res.status }
  } catch (e) {
    return { res: null, body: '', status: 0, erreur: e.message }
  }
}

// ===========================================================================
// 0. Cohérence des sources — aucun réseau, aucune excuse
// ===========================================================================

section('0. Cohérence des sources')

// -- 0.1 La carte de routes est-elle saine ? --------------------------------
{
  const vues = new Set()
  const titres = new Map()
  const descs = new Map()
  let saine = true

  for (const r of ROUTES) {
    if (typeof r.path !== 'string' || !r.path.startsWith('/')) {
      fail(`carte : route sans « path » valide — ${JSON.stringify(r)}`)
      saine = false
      continue
    }
    if (r.path !== '/' && r.path.endsWith('/')) {
      fail(`carte : ${r.path} porte un slash final (interdit, voir site.ts)`)
      saine = false
    }
    if (vues.has(r.path)) {
      fail(`carte : route dupliquée — ${r.path}`)
      saine = false
    }
    vues.add(r.path)

    for (const p of [...PREFIXES_PRIVES, ...CHEMINS_AUTH]) {
      if (r.path === p || r.path.startsWith(`${p}/`)) {
        fail(`carte : la route publique ${r.path} recouvre la surface privée ${p}`)
        saine = false
      }
    }
    if (!['live', 'draft'].includes(r.status)) {
      fail(`carte : ${r.path} — statut « ${r.status} » inconnu`)
      saine = false
    }
    if (!r.title || !r.description || !r.intent) {
      fail(`carte : ${r.path} — titre, description ou intention manquant`)
      saine = false
    }
    // « aucune page club n'est dupliquée ou générique » (§14)
    if (titres.has(r.title)) {
      fail(`carte : titre identique sur ${titres.get(r.title)} et ${r.path}`)
      saine = false
    }
    titres.set(r.title, r.path)
    if (descs.has(r.description)) {
      fail(`carte : description identique sur ${descs.get(r.description)} et ${r.path}`)
      saine = false
    }
    descs.set(r.description, r.path)
  }

  for (const c of CLUBS) {
    if (!vues.has(`/clubs/${c.slug}`)) {
      fail(`carte : le club « ${c.clubId} » n'a pas de route /clubs/${c.slug}`)
      saine = false
    }
  }
  for (const p of vues) {
    if (p.startsWith('/clubs/') && !CLUBS.some((c) => `/clubs/${c.slug}` === p)) {
      fail(`carte : ${p} ne correspond à aucun club déclaré`)
      saine = false
    }
  }

  if (saine) {
    const live = ROUTES.filter((r) => r.status === 'live').length
    ok(`carte : ${ROUTES.length} routes, ${live} « live », ${CLUBS.length} clubs`)
  }
}

// -- 0.2 Le suffixe de titre du socle == le gabarit du layout ---------------
{
  const layout = lire('src/app/layout.tsx', { code: true })
  const site = lire('src/lib/seo/site.ts', { code: true })

  if (!layout) {
    warn('src/app/layout.tsx introuvable : gabarit de titre non vérifié')
  } else if (!site) {
    fail('src/lib/seo/site.ts introuvable')
  } else {
    const gabarit = attribut(layout, /template:\s*['"`](.*?)['"`]/)
    const separateur = attribut(site, /SEPARATEUR_TITRE\s*=\s*['"`](.*?)['"`]/)
    const nom = attribut(site, /SITE_NAME\s*=\s*['"`](.*?)['"`]/)

    if (gabarit === null) {
      warn("layout.tsx : aucun « title.template » trouvé — og:title n'est pas vérifiable")
    } else if (separateur === null || nom === null) {
      fail('site.ts : SEPARATEUR_TITRE ou SITE_NAME introuvable')
    } else {
      const attendu = `%s${separateur}${nom}`
      if (gabarit !== attendu) {
        fail(
          `le gabarit de titre diverge : layout.tsx dit « ${gabarit} », le socle ` +
            `produirait « ${attendu} ». og:title et <title> afficheraient deux textes ` +
            'différents. Aligner SEPARATEUR_TITRE / SITE_NAME dans src/lib/seo/site.ts.',
        )
      } else {
        ok(`gabarit de titre cohérent : « ${gabarit} »`)
      }
    }

    // §9.1 A — un `alternates` dans le layout racine fait hériter le canonical
    // de l'accueil à toute page qui oublie le sien. Bug silencieux et coûteux.
    if (/alternates\s*:/.test(layout)) {
      fail(
        'layout.tsx contient « alternates » : toute page sans canonical propre se ' +
          "déclarerait comme la page d'accueil (spec-05-seo §9.1 A). À retirer.",
      )
    } else {
      ok("layout racine sans « alternates » (c'est voulu)")
    }

    // L'interrupteur doit gouverner la racine, sinon il n'est pas unique.
    if (/ROBOTS_RACINE/.test(layout)) {
      ok('layout racine branché sur ROBOTS_RACINE (interrupteur unique)')
    } else if (/robots\s*:/.test(layout)) {
      warn(
        "layout.tsx écrit « robots » en dur : l'interrupteur NEXT_PUBLIC_SEO_INDEXABLE " +
          "ne gouverne pas la racine. Remplacer par « robots: ROBOTS_RACINE » " +
          "(import depuis '@/lib/seo'). Une ligne.",
      )
    } else {
      warn('layout.tsx ne déclare aucun « robots »')
    }
  }
}

// -- 0.3 Aucune URL de production écrite en dur -----------------------------
{
  const fautifs = []
  for (const f of fichiersRecursifs('src', (n) => /\.(ts|tsx)$/.test(n))) {
    const contenu = readFileSync(f, 'utf8')
    // On ignore les commentaires : la doc a le droit de citer le domaine.
    const sansCommentaires = contenu
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    if (/https?:\/\/(?!localhost|schema\.org|www\.w3\.org|\$\{)/.test(sansCommentaires)) {
      const extrait = sansCommentaires.match(
        /https?:\/\/(?!localhost|schema\.org|www\.w3\.org|\$\{)[^\s'"`)]*/,
      )?.[0]
      fautifs.push(`${relative(RACINE, f).replace(/\\/g, '/')} — ${extrait}`)
    }
  }
  if (fautifs.length) {
    for (const f of fautifs) {
      fail(`URL absolue en dur (utiliser absoluteUrl()) : ${f}`)
    }
  } else {
    ok('aucune URL absolue en dur dans src/**')
  }
}

// -- 0.4 Personne n'écrit de metadata à la main hors du socle ---------------
{
  const interdits = /(^|\s)(openGraph|twitter|alternates)\s*:/m
  const fautifs = []
  for (const f of fichiersRecursifs('src/app', (n) =>
    /^(page|layout|template|default)\.tsx$/.test(n),
  )) {
    const contenu = sansCommentaires(readFileSync(f, 'utf8'))
    if (interdits.test(contenu)) {
      fautifs.push(relative(RACINE, f).replace(/\\/g, '/'))
    }
  }
  if (fautifs.length) {
    for (const f of fautifs) {
      fail(
        `${f} écrit openGraph / twitter / alternates à la main. La fusion des ` +
          'metadata est superficielle : ce bloc effacerait celui du layout. ' +
          'Passer par metadataDeRoute() / buildMetadata().',
      )
    }
  } else {
    ok('aucune metadata écrite à la main hors du socle')
  }
}

// -- 0.5 Aucune page privée ne redéfinit `robots` (§10.1) -------------------
{
  let controlees = 0
  let fautives = 0
  for (const prefixe of PREFIXES_PRIVES) {
    if (prefixe === '/api') continue // pas de HTML, couvert par l'en-tête
    const dossier = `src/app${prefixe}`
    const fichiers = fichiersRecursifs(dossier, (n) =>
      /^(page|layout|template)\.tsx$/.test(n),
    )
    if (fichiers.length === 0) continue
    const layoutRacineSegment = join(RACINE, dossier, 'layout.tsx')
    for (const f of fichiers) {
      controlees++
      if (f === layoutRacineSegment) continue
      if (/robots\s*:/.test(sansCommentaires(readFileSync(f, 'utf8')))) {
        fautives++
        fail(
          `${relative(RACINE, f).replace(/\\/g, '/')} exporte sa propre clé « robots » : ` +
            'elle remplace entièrement celle du layout de segment et redevient ' +
            'indexable (spec-05-seo §10.1).',
        )
      }
    }
  }
  if (controlees === 0) {
    pending('surfaces privées : aucune page écrite pour le moment (lots B et C)')
  } else if (fautives === 0) {
    ok(`${controlees} fichier(s) de surface privée sans « robots » parasite`)
  }
}

// -- 0.6 next.config.ts : en-têtes et slash final ---------------------------
{
  const config = lire('next.config.ts', { code: true })
  if (!config) {
    fail('next.config.ts introuvable')
  } else {
    for (const prefixe of PREFIXES_PRIVES) {
      const attendu = new RegExp(`source:\\s*['"\`]${prefixe}/:path\\*['"\`]`)
      if (!attendu.test(config)) {
        fail(
          `next.config.ts : aucun bloc « ${prefixe}/:path* ». La surface privée ` +
            "n'a pas d'en-tête X-Robots-Tag (bretelles du §10.2).",
        )
      }
    }
    if (!/X-Robots-Tag/.test(config)) {
      fail('next.config.ts : aucun en-tête X-Robots-Tag')
    }

    // TRAILING_SLASH et trailingSlash doivent bouger ensemble, jamais seuls.
    const site = lire('src/lib/seo/site.ts', { code: true }) ?? ''
    const socleSlash = /TRAILING_SLASH\s*=\s*true/.test(site)
    const configSlash = /trailingSlash\s*:\s*true/.test(config)
    if (socleSlash !== configSlash) {
      fail(
        `désaccord sur le slash final : site.ts TRAILING_SLASH=${socleSlash}, ` +
          `next.config.ts trailingSlash=${configSlash}. Les canonicals ne ` +
          "correspondraient pas aux URLs servies. Les deux se changent ensemble.",
      )
    } else {
      ok(`slash final cohérent (TRAILING_SLASH = ${socleSlash})`)
    }
  }
}

// -- 0.7 proxy.ts couvre les mêmes surfaces privées -------------------------
{
  const proxy = lire('src/proxy.ts', { code: true })
  if (!proxy) {
    warn('src/proxy.ts introuvable : couverture des surfaces privées non vérifiée')
  } else {
    const manquants = PREFIXES_PRIVES.filter(
      (p) => p !== '/api' && !new RegExp(`['"\`]${p}['"\`]`).test(proxy),
    )
    if (manquants.length) {
      warn(
        `proxy.ts ne cite pas ${manquants.join(', ')} : la carte SEO et la ` +
          'redirection de connexion ne parlent pas des mêmes surfaces.',
      )
    } else {
      ok('proxy.ts et la carte SEO couvrent les mêmes surfaces privées')
    }
  }
}

if (STATIQUE_SEULEMENT) {
  verdict()
}

// ===========================================================================
// 1. robots.txt
// ===========================================================================

section(`1. robots.txt — ${BASE}`)

let siteOuvertALIndexation = false

{
  const avant = marque()
  const { body, status, erreur } = await get('/robots.txt')
  if (erreur) {
    fail(`serveur injoignable sur ${BASE} — ${erreur}`)
    verdict()
  }
  if (status !== 200) {
    fail(`/robots.txt renvoie ${status}`)
  } else {
    const toutInterdit = /User-Agent:\s*\*[\s\S]*?Disallow:\s*\/\s*$/im.test(
      body.trim(),
    )
    siteOuvertALIndexation = !toutInterdit

    if (toutInterdit) {
      ok("site fermé à l'indexation : « Disallow: / » (NEXT_PUBLIC_SEO_INDEXABLE absent ou faux)")
      if (/^Sitemap:/im.test(body)) {
        fail('robots.txt interdit tout le site mais déclare quand même un Sitemap')
      }
    } else {
      for (const p of PREFIXES_PRIVES) {
        if (!body.includes(`Disallow: ${p}/`)) {
          fail(`robots.txt : « Disallow: ${p}/ » manquant`)
        }
      }
      for (const p of CHEMINS_AUTH) {
        if (!body.includes(`Disallow: ${p}`)) {
          warn(`robots.txt : « Disallow: ${p} » manquant (page d'authentification)`)
        }
      }
      if (!/^Sitemap:\s*https?:\/\//im.test(body)) {
        fail('robots.txt : aucune ligne « Sitemap: » absolue')
      }
      okSi(avant, 'site ouvert : surfaces privées interdites, sitemap déclaré')
    }

    // L'erreur classique, et elle casse le rendu de Google (§8.4).
    if (/Disallow:\s*\/_next/i.test(body)) {
      fail(
        'robots.txt : « Disallow: /_next » bloque le CSS et le JS — Google rend ' +
          'alors une page sans style et la juge médiocre.',
      )
    }
  }
}

// ===========================================================================
// 2. Surfaces privées : jamais indexables
// ===========================================================================

section('2. Surfaces privées')

{
  const avant = marque()
  const aTester = []
  for (const p of PREFIXES_PRIVES) {
    if (p === '/api') continue
    aTester.push(p, `${p}/${p === '/admin' ? 'club' : 'reserver'}`)
  }

  for (const chemin of aTester) {
    const { res, body, status } = await get(chemin)
    if (!res) continue

    const entete = res.headers.get('x-robots-tag') ?? ''
    if (!/noindex/i.test(entete)) {
      fail(
        `${chemin} : X-Robots-Tag sans « noindex » (reçu : « ${entete || 'absent'} »)`,
      )
    }

    // Une réponse HTML de 200 doit AUSSI porter la meta robots : c'est la
    // ceinture, et c'est elle qui tient si l'en-tête saute.
    if (status === 200 && body && /<html/i.test(body)) {
      const meta = metaRobotsDe(body) ?? ''
      if (!/noindex/i.test(meta)) {
        fail(
          `${chemin} : <meta name="robots"> sans « noindex » (reçu : « ${meta || 'absent'} ») ` +
            '— un layout ou une page a écrasé la clé robots (§10.1)',
        )
      }
    }
  }
  okSi(avant, `${aTester.length} surface(s) privée(s) contrôlée(s) (en-tête + meta)`)

  // /api : en-tête seule, aucun HTML attendu.
  {
    const { res } = await get('/api/v1/sante')
    if (res) {
      const entete = res.headers.get('x-robots-tag') ?? ''
      if (!/noindex/i.test(entete)) fail('/api/* : X-Robots-Tag sans « noindex »')
      else ok('/api/* : X-Robots-Tag noindex')
      void 0
    }
  }
}

// ===========================================================================
// 3. sitemap.xml
// ===========================================================================

section('3. sitemap.xml')

let cheminsDuSitemap = new Set()

{
  const avant = marque()
  const { body, status } = await get('/sitemap.xml')
  if (status !== 200) {
    fail(`/sitemap.xml renvoie ${status}`)
  } else {
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    const live = ROUTES.filter((r) => r.status === 'live').map((r) => r.path)

    for (const loc of locs) {
      if (BASE.startsWith('https://') && !loc.startsWith('https://')) {
        fail(`sitemap : URL non HTTPS — ${loc}`)
      }
      if (!loc.startsWith(BASE)) {
        fail(`sitemap : URL hors du domaine audité — ${loc}`)
        continue
      }
      const p = normaliser(loc.slice(BASE.length) || '/')
      cheminsDuSitemap.add(p)

      for (const prefixe of [...PREFIXES_PRIVES, ...CHEMINS_AUTH]) {
        if (p === prefixe || p.startsWith(`${prefixe}/`)) {
          fail(`sitemap : surface privée exposée — ${loc}`)
        }
      }
      if (!CHEMINS_PUBLICS.includes(p)) {
        fail(`sitemap : URL inconnue de la carte de routes — ${loc}`)
      }
      if (!live.includes(p)) {
        fail(`sitemap : ${p} n'est pas en statut « live » dans la carte`)
      }
    }

    for (const p of live) {
      if (!cheminsDuSitemap.has(p)) {
        fail(`sitemap : la route « live » ${p} est absente du sitemap`)
      }
    }

    if (locs.length === 0) {
      if (live.length === 0) {
        ok(
          'sitemap vide, et c\'est correct : aucune route n\'est en « live ». ' +
            'Un sitemap qui liste des pages non validées est une promesse non tenue.',
        )
      } else {
        fail(`sitemap vide alors que ${live.length} route(s) sont en « live »`)
      }
    } else {
      okSi(avant, `sitemap : ${locs.length} URL(s), toutes connues de la carte`)
    }
  }
}

// ===========================================================================
// 4. Pages publiques
// ===========================================================================

section('4. Pages publiques')

{
  const avantPages = marque()
  const titres = new Map()
  const descriptions = new Map()
  let servies = 0
  const manquantes = []
  let htmlAccueil = ''

  for (const route of ROUTES) {
    const chemin = route.path
    const estLive = route.status === 'live'
    const { body, status } = await get(chemin)

    if (status === 404) {
      if (estLive) {
        fail(`${chemin} : 404 alors que la route est « live » et dans le sitemap`)
      } else {
        manquantes.push(chemin)
      }
      continue
    }
    if (status !== 200) {
      fail(`${chemin} renvoie ${status} (200 attendu)`)
      continue
    }
    servies++
    if (chemin === '/') htmlAccueil = body

    // « chaque URL publique répond directement en HTML utile sans JavaScript »
    const texte = body
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (texte.length < 200) {
      warn(`${chemin} : ${texte.length} caractères de texte hors JavaScript (page creuse ?)`)
    }

    // « un seul H1 »
    const h1 = compterBalises(body, 'h1')
    if (h1 > 1) {
      // Plusieurs <h1> est un défaut réel, pas une page en attente d'écriture.
      fail(`${chemin} : ${h1} balises <h1>, exactement 1 attendue`)
    } else if (h1 === 0) {
      manque(estLive, `${chemin} : aucune balise <h1>`)
    }

    // meta robots : le statut de la carte doit se retrouver dans le HTML servi.
    const metaRobots = metaRobotsDe(body) ?? ''
    if (!estLive && !/noindex/i.test(metaRobots)) {
      fail(
        `${chemin} : statut « draft » dans la carte mais la page ne sort pas en ` +
          `noindex (meta robots : « ${metaRobots || 'absente'} »). Utiliser ` +
          'metadataDeRoute() plutôt qu\'un objet metadata écrit à la main.',
      )
    }
    if (estLive && siteOuvertALIndexation && /noindex/i.test(metaRobots)) {
      fail(`${chemin} : route « live » sur un site ouvert, mais la page sort en noindex`)
    }

    // Canonical
    const canonical = canonicalDe(body)
    if (!canonical) {
      manque(
        estLive,
        `${chemin} : aucun <link rel="canonical"> — la page est servie sans passer ` +
          'par metadataDeRoute() (voir docs/SEO-SOCLE.md §2)',
      )
    } else {
      if (!/^https?:\/\//.test(canonical)) {
        fail(`${chemin} : canonical relatif (${canonical})`)
      } else {
        const attendu = `${BASE}${chemin === '/' ? '/' : chemin}`
        if (normaliser(canonical) !== normaliser(attendu)) {
          fail(`${chemin} : canonical = ${canonical}, attendu ${attendu}`)
        }
        if (BASE.startsWith('https://') && !canonical.startsWith('https://')) {
          fail(`${chemin} : canonical non HTTPS`)
        }
      }
    }

    // Titre et description : présents, propres, non dupliqués
    const titre = titreDe(body)
    if (!titre) {
      manque(estLive, `${chemin} : <title> absent`)
    } else {
      if (titres.has(titre)) fail(`${chemin} : <title> identique à ${titres.get(titre)}`)
      else titres.set(titre, chemin)
      if (titre.length > 65) {
        warn(`${chemin} : <title> de ${titre.length} caractères (>65, tronqué par Google)`)
      }
    }

    const desc = descriptionDe(body)
    if (!desc) {
      manque(estLive, `${chemin} : meta description absente`)
    } else {
      if (descriptions.has(desc)) {
        fail(`${chemin} : description identique à ${descriptions.get(desc)}`)
      } else descriptions.set(desc, chemin)
      if (desc.length > 165) {
        warn(`${chemin} : description de ${desc.length} caractères (>165)`)
      }
    }

    // Open Graph
    if (!/property=["']og:title["']/i.test(body)) {
      manque(estLive, `${chemin} : og:title absent`)
    }
    if (!/property=["']og:image["']/i.test(body)) {
      manque(
        estLive,
        `${chemin} : og:image absent — aucune image 1200x630 n'existe encore ` +
          '(voir OG_IMAGE_PAR_DEFAUT dans src/lib/seo/metadata.ts)',
      )
    }

    // Aucune donnée privée dans le HTML public (§14)
    for (const { nom, re } of FUITES_BLOQUANTES) {
      if (re.test(body)) fail(`${chemin} : fuite — ${nom}`)
    }
    for (const { nom, re } of FUITES_A_SURVEILLER) {
      const trouve = body.match(re)?.[0]
      if (trouve) warn(`${chemin} : ${nom} dans le HTML public — « ${trouve} »`)
    }

    // JSON-LD : parsable, et aucun fait inventé tant que D5 tient
    for (const noeud of blocsJsonLd(body, chemin)) {
      const brut = JSON.stringify(noeud)
      for (const cle of CLES_JSONLD_INTERDITES) {
        if (new RegExp(`"${cle}"\\s*:`).test(brut)) {
          fail(
            `${chemin} : le JSON-LD contient « ${cle} » — aucun fait de ce type n'est ` +
              'confirmé (décision D5). Voir .research/decisions.md et spec-05-seo §15.3.',
          )
        }
      }
    }
  }

  if (manquantes.length > 0) {
    pending(
      `${manquantes.length} page(s) « draft » pas encore écrites (lot B) : ` +
        manquantes.slice(0, 6).join(', ') +
        (manquantes.length > 6 ? `, … (+${manquantes.length - 6})` : ''),
    )
  }
  if (servies > 0) okSi(avantPages, `${servies} page(s) publique(s) servie(s) et contrôlée(s)`)

  // « sitemap et navigation contiennent les mêmes destinations canoniques »
  if (htmlAccueil) {
    for (const lien of liensInternes(htmlAccueil)) {
      if (lien.startsWith('/_next') || lien.startsWith('/images')) continue
      let prive = false
      for (const p of [...PREFIXES_PRIVES, ...CHEMINS_AUTH]) {
        if (lien === p || lien.startsWith(`${p}/`)) prive = true
      }
      if (prive) continue
      if (!CHEMINS_PUBLICS.includes(lien)) {
        fail(`navigation : le lien « ${lien} » de l'accueil est absent de la carte de routes`)
      } else if (cheminsDuSitemap.size > 0 && !cheminsDuSitemap.has(lien)) {
        warn(`navigation : « ${lien} » est dans le menu mais pas dans le sitemap (statut « draft » ?)`)
      }
    }
  }
}

verdict()

// ---------------------------------------------------------------------------

function verdict() {
  section('Verdict')
  console.log(`  ${echecs} échec(s) · ${alertes} alerte(s) · ${attentes} attente(s)`)
  if (echecs > 0) {
    console.error(
      '\nAudit SEO en échec. Référence : docs/SEO-SOCLE.md · .research/spec-05-seo.md §13.',
    )
    process.exit(1)
  }
  if (attentes > 0) {
    console.log(
      "\nAudit SEO passé. Les « attentes » sont des pages non encore écrites : c'est\n" +
        "l'état normal avant le lot B. Avant d'ouvrir l'indexation, relancer avec\n" +
        '--strict : elles deviennent alors bloquantes.',
    )
  } else {
    console.log('\nAudit SEO réussi.')
  }
  process.exit(0)
}
