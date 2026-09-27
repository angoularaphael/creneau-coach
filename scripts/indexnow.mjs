/**
 * Prévenir les moteurs après un déploiement — `node scripts/indexnow.mjs [base]`
 *
 *   base   par défaut https://coachings.boxingcenter.fr
 *
 * ── POURQUOI ──────────────────────────────────────────────────────────────
 *
 * IndexNow est lu par Bing, Yandex, Seznam et Naver. Bing compte double ici :
 * c'est l'index que lisent ChatGPT (recherche) et Copilot. Un site que Bing ne
 * connaît pas n'existe pas pour ces deux moteurs de réponse, quelle que soit la
 * qualité de ses pages (skill `aeo-geo`, couche 1 : « être trouvé »).
 *
 * Google, lui, n'utilise pas IndexNow : il se prévient par la Search Console et
 * le sitemap.
 *
 * ── LA CLÉ ────────────────────────────────────────────────────────────────
 *
 * Le protocole exige un fichier `/<clé>.txt` à la racine, contenant la clé :
 * c'est ce qui prouve que la demande vient bien du propriétaire du domaine. La
 * clé n'est pas un secret — elle est publique par construction.
 *
 * ── CE QUE LE SCRIPT REFUSE ───────────────────────────────────────────────
 *
 * Il lit le sitemap RÉEL du site et n'envoie que ses URL. Un sitemap vide veut
 * dire que l'interrupteur d'indexation est fermé : le script s'arrête au lieu
 * de soumettre des pages marquées « noindex », ce qui enverrait aux moteurs
 * deux signaux contradictoires.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = (process.argv[2] ?? 'https://coachings.boxingcenter.fr').replace(/\/$/, '')
const HOTE = new URL(BASE).host

const fichierCle = readdirSync(join(RACINE, 'public')).find((f) => /^[0-9a-f]{32}\.txt$/.test(f))
if (!fichierCle) {
  console.error('REFUS : aucun fichier-clé IndexNow (32 caractères hexadécimaux) dans public/.')
  process.exit(1)
}
const CLE = readFileSync(join(RACINE, 'public', fichierCle), 'utf8').trim()

// 1. La clé est-elle servie ? Sans elle, les moteurs rejettent la demande.
const verif = await fetch(`${BASE}/${CLE}.txt`)
if (!verif.ok || (await verif.text()).trim() !== CLE) {
  console.error(`REFUS : ${BASE}/${CLE}.txt ne sert pas la clé (HTTP ${verif.status}).`)
  process.exit(1)
}

// 2. Les URL, prises dans le sitemap servi — jamais dans une liste à part.
const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text()
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
if (urls.length === 0) {
  console.error(
    'REFUS : sitemap vide. L’interrupteur NEXT_PUBLIC_SEO_INDEXABLE est fermé — soumettre\n' +
      'des pages en « noindex » enverrait aux moteurs deux signaux contraires.',
  )
  process.exit(1)
}

// 3. Une seule requête : api.indexnow.org relaie à tous les moteurs participants.
const reponse = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: HOTE, key: CLE, keyLocation: `${BASE}/${CLE}.txt`, urlList: urls }),
})

// 200 = reçu et traité, 202 = reçu, clé en cours de vérification. Les deux vont.
const ok = reponse.status === 200 || reponse.status === 202
console.log(`IndexNow : ${urls.length} URL soumises pour ${HOTE} → HTTP ${reponse.status} ${ok ? '(accepté)' : '(REFUSÉ)'}`)
if (!ok) console.error(await reponse.text())

// À consigner dans .research/positions/<date>.md, avec le relevé de la semaine.
process.exit(ok ? 0 : 1)
