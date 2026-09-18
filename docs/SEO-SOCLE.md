# Socle SEO — ce que Brad hérite, et ce qu'il doit respecter

**Lot C (Eddy) · 18 septembre 2026 · `next@16.3.5`**
Contrats : [SEO-INFORMATION-ARCHITECTURE.md](./SEO-INFORMATION-ARCHITECTURE.md) ·
[CAHIER-API.md](./CAHIER-API.md) · spec complète : `.research/spec-05-seo.md`

Le SEO n'apparaît dans aucun des trois lots de `REPARTITION-TACHES.md`. Il est
traité ici comme un **socle transverse posé par le lot C et consommé par le
lot B**. Concrètement : Brad n'a aucune balise à deviner, aucun canonical à
écrire, aucun `<meta robots>` à poser. Tout passe par `@/lib/seo` et par un
script qui casse la CI si quelqu'un sort du rail.

---

## 1. Ce qui est livré

| Fichier | Rôle |
|---|---|
| `src/lib/seo/site.ts` | Le seul endroit qui connaît le domaine. Interrupteur d'indexation, `absoluteUrl()`. |
| `src/lib/seo/routes.data.json` | **LA** carte de routes. Source unique, lue par l'app *et* par l'audit. |
| `src/lib/seo/routes.ts` | Typage et garde-fous de la carte. Échoue à l'import si elle est fausse. |
| `src/lib/seo/metadata.ts` | `metadataDeRoute()` et `buildMetadata()` — le seul fabricant de metadata. |
| `src/lib/seo/jsonld.ts` | `Organization`, `WebSite`, `Service`, `BreadcrumbList`. Rien d'inventé. |
| `src/lib/seo/json-ld.tsx` | Le composant `<JsonLd>` qui rend la balise, avec l'échappement XSS. |
| `src/lib/seo/index.ts` | Point d'entrée : `import { … } from '@/lib/seo'`. |
| `src/app/robots.ts` | `/robots.txt`. |
| `src/app/sitemap.ts` | `/sitemap.xml`. |
| `scripts/check-seo.mjs` | Les critères d'acceptation §14 rendus exécutables. |

---

## 2. Comment écrire une page publique

### Page statique — une ligne

```tsx
// src/app/(public)/tarifs/page.tsx
import { metadataDeRoute } from '@/lib/seo'

export const metadata = metadataDeRoute('/tarifs')

export default function TarifsPage() {
  return (
    <main>
      <h1>Tarifs</h1>   {/* un seul <h1> par page — critère §14 */}
    </main>
  )
}
```

`metadataDeRoute()` va chercher le titre, la description, le canonical absolu,
l'Open Graph, le Twitter Card et le `robots` de la route dans la carte. Une page
dont le contenu n'est pas validé (`status: 'draft'`) sort automatiquement en
`noindex` et reste hors du sitemap. Il n'y a rien à penser.

Si le chemin n'existe pas dans la carte, l'appel **lève une erreur** au rendu.
C'est voulu : une page publique absente de la carte ne serait ni dans le
sitemap, ni dans la navigation, ni auditée. Ajoute-la à `routes.data.json`.

### Page club — `params` est une `Promise` en Next 16

```tsx
// src/app/(public)/clubs/[slug]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CLUB_PAGES, JsonLd, breadcrumbJsonLd, cheminClub, getClubBySlug, metadataDeRoute } from '@/lib/seo'

export function generateStaticParams() {
  return CLUB_PAGES.map((club) => ({ slug: club.slug }))
}

/** Tout autre slug renvoie 404 au lieu de fabriquer une page à la volée. */
export const dynamicParams = false

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params                 // <- Promise, pas d'objet
  const club = getClubBySlug(slug)
  if (!club) notFound()                          // autorisé dans generateMetadata
  return metadataDeRoute(cheminClub(club.slug))
}

export default async function ClubPage({ params }: Props) {
  const { slug } = await params
  const club = getClubBySlug(slug)
  if (!club) notFound()

  return (
    <main>
      <JsonLd data={breadcrumbJsonLd([
        { name: 'Accueil', path: '/' },
        { name: 'Les clubs', path: '/clubs' },
        { name: `Salle de ${club.nom}`, path: cheminClub(club.slug) },
      ])} />
      <h1>Salle de {club.nom}</h1>
    </main>
  )
}
```

**Attention :** `club.slug` est le segment d'URL (`toulouse-minimes`),
`club.clubId` est l'identifiant de l'API (`minimes`, CAHIER-API.md §3.2). Les
deux sont **différents à dessein** : l'URL porte la ville pour le SEO local,
l'API porte le slug boutique. `getClubByApiId()` fait le chemin inverse.

### JSON-LD sur l'accueil

```tsx
import { JsonLd, organizationJsonLd, serviceJsonLd, webSiteJsonLd } from '@/lib/seo'

<JsonLd data={[organizationJsonLd(), webSiteJsonLd(), serviceJsonLd()]} />
```

`Organization` et `WebSite` une seule fois, sur l'accueil. `BreadcrumbList` sur
chaque page interne — et il doit refléter le fil d'Ariane **visible** de la
page. Un balisage sans équivalent visible est un balisage ignoré.

### Navigation

```tsx
import { NAV_ROUTES } from '@/lib/seo'

{NAV_ROUTES.map((r) => <Link key={r.path} href={r.path}>{r.title}</Link>)}
```

C'est ce qui tient le critère §14 « sitemap et navigation contiennent les mêmes
destinations canoniques » : les deux lisent la même carte.

---

## 3. Ce qui est interdit, et pourquoi

L'audit échoue sur chacun de ces points.

| Interdit | Pourquoi |
|---|---|
| `export const metadata = { … }` écrit à la main dans une page publique | passer par `metadataDeRoute()` |
| une clé `openGraph`, `twitter` ou `alternates` hors de `src/lib/seo/` | **la fusion des metadata de Next est superficielle** : une page qui déclare `openGraph: { title }` efface `siteName`, `locale` et l'image du layout, sans erreur et sans bruit |
| une clé `robots` dans une page sous `/admin` ou `/espace-coach` | même raison : elle **remplace** celle du layout de segment, et la page redevient indexable |
| une URL absolue en dur (`https://…`) dans `src/` | utiliser `absoluteUrl()` — sinon le jour où le domaine change, il reste des canonicals morts |
| `<link rel="canonical">` posé à la main dans le JSX | Next en émettrait un deuxième |
| plus d'un `<h1>` par page | critère §14 |
| `Disallow: /_next/` dans `robots.txt` | ça bloque le CSS et le JS : Google rend une page sans style et la juge médiocre |
| une adresse, un horaire, un téléphone ou une note dans le JSON-LD | voir §5 |

Deux de ces règles sont tenues par le **typage** et pas seulement par l'audit :
les types de `jsonld.ts` n'ont pas de champ `address` ni `aggregateRating`, donc
les écrire ne compile pas.

---

## 4. L'interrupteur d'indexation

Aujourd'hui, le site est **fermé** : `robots.txt` renvoie `Disallow: /`, le
sitemap est vide, toutes les pages sortent en `noindex`. C'est l'état correct :
le domaine de production n'est pas encore servi, et aucun contenu n'est validé.

Un seul interrupteur : **`NEXT_PUBLIC_SEO_INDEXABLE`**, lu dans
`src/lib/seo/site.ts`. Il est faux par défaut, y compris en production. Il reste
faux sur les prévisualisations Vercel même si quelqu'un le met à `true` par
erreur dans les variables de preview.

### Ouvrir l'indexation — dans cet ordre, pas un autre

1. `NEXT_PUBLIC_SITE_URL=https://<domaine réellement servi>`
   *(en production, sans cette variable, le build **échoue volontairement** :
   un canonical faux demande à Google de consolider tout le site vers une URL
   morte, et ça se répare en semaines de recrawl, pas en un redéploiement.)*
2. Passer en `"live"` les routes dont le contenu est validé, dans
   `src/lib/seo/routes.data.json`. Un mot par page.
3. `node scripts/check-seo.mjs https://<domaine> --strict` → **vert**.
4. `NEXT_PUBLIC_SEO_INDEXABLE=true`.
5. Search Console et Bing Webmaster.

L'étape 3 avant l'étape 4 : c'est tout l'intérêt d'avoir deux variables.

---

## 5. Ce qui n'est **pas** livré, et ce n'est pas un oubli

Ce projet n'a **aucune adresse de club confirmée, aucun horaire confirmé, aucun
avis**. `.research/decisions.md` D5 et `SEO-INFORMATION-ARCHITECTURE.md` §6 et
§9 l'écrivent. Le socle livre donc le balisage qui reste vrai sans ces données,
et marque l'endroit exact où brancher le reste.

| Manquant | Conséquence | Où le brancher |
|---|---|---|
| `LocalBusiness` / `SportsActivityLocation` | c'est le balisage le plus rentable pour cinq salles physiques, et le seul impossible à écrire sans mentir | bloc commenté en bas de `src/lib/seo/jsonld.ts`, avec la liste des faits requis champ par champ |
| `FAQPage` | autorisé « uniquement pour une FAQ visible » et approuvée | `/faq`, quand les questions existent. Le code est trivial, ce n'est pas lui qui manque |
| `Service.offers` | les tarifs viennent du serveur et dépendent du créneau ; figer un prix dans le balisage publierait une grille que le produit ne respecte pas | à rouvrir seulement si la direction fige une grille publique |
| image Open Graph 1200×630 | aucun fichier de ce ratio n'existe. `logo.png` fait 186×88, sous le minimum des réseaux ; `etats-unis.webp` est en portrait 1200×1600 | créer `src/app/opengraph-image.tsx` (code en `.research/spec-05-seo.md` §12.3), puis remplacer `OG_IMAGE_PAR_DEFAUT` dans `metadata.ts` — **une constante, rien d'autre** |
| les 4 textes juridiques | leurs routes existent et sont servies, en `draft`, hors sitemap | un site français destiné au public doit porter des mentions légales : **condition de mise en ligne, à confirmer par la direction**, pas un arbitrage de développeur |
| titres et descriptions définitifs | ceux de `routes.data.json` sont des placeholders **utilisables** (bonne longueur, bon ton), pas du lorem ipsum | à faire valider avant de passer une route en `live` |

`aggregateRating`, `review`, `ratingValue`, `reviewCount` : **jamais**, même sur
demande. Ce sont des chiffres fabriqués, pas mesurés.

---

## 6. L'audit

```bash
node scripts/check-seo.mjs                          # localhost:3041
node scripts/check-seo.mjs http://localhost:3041
node scripts/check-seo.mjs --statique               # sources seules, sans serveur
node scripts/check-seo.mjs https://<domaine> --strict
```

Trois niveaux, et la différence compte :

- **ECHEC** — c'est faux et ça sortirait faux en production. Code de sortie 1.
- **ALERTE** — suspect, à regarder, ne bloque pas.
- **ATTENTE** — une page en `draft` n'est pas encore écrite. C'est l'état normal
  avant le lot B. `--strict` les rend bloquantes : c'est la forme à passer avant
  d'ouvrir l'indexation.

Ce qu'il contrôle : la carte (doublons, collisions avec les surfaces privées,
titres et descriptions dupliqués, clubs orphelins), la cohérence entre
`layout.tsx`, `site.ts` et `next.config.ts` (gabarit de titre, slash final,
en-têtes `X-Robots-Tag`), `robots.txt`, le sitemap croisé avec la carte et avec
la navigation, le `noindex` des surfaces privées en en-tête **et** en meta, et
sur chaque page publique : `<h1>` unique, canonical absolu et exact, titre et
description uniques, Open Graph, absence de fuite (jeton QR, identifiant
Deciplus, secret), et JSON-LD sans fait inventé.

**Il n'y a pas de liste de routes recopiée dans le script.** Il lit le même
`routes.data.json` que l'application : une route ajoutée d'un côté est vue de
l'autre, sans build et sans oubli possible.

---

## 7. Décisions prises, et ce qu'il en coûte d'y revenir

**Pas de slash final** (`/tarifs`, pas `/tarifs/`). C'est le défaut de Next ;
`SEO-INFORMATION-ARCHITECTURE.md` §3 note les routes avec un slash, mais c'est
une notation de documentation, pas un contrat d'URL. Ce qui n'est pas négociable
c'est la **cohérence** : canonical, sitemap, liens et URL servie portent la même
forme. Basculer coûte deux lignes — `TRAILING_SLASH` dans `site.ts` **et**
`trailingSlash` dans `next.config.ts` — et l'audit échoue si une seule des deux
bouge. **Mais il faut le décider avant l'indexation** : après, c'est un jeu
complet de redirections sur tout le site.

**Stratégie `Disallow` pour les surfaces privées.** `Disallow` et `noindex` ne
s'additionnent pas, ils se gênent : une URL bloquée dans `robots.txt` n'est
jamais visitée, donc son `noindex` n'est jamais lu, et un lien externe peut la
faire apparaître en résultat « URL nue ». On assume, parce que le site n'a aucun
historique d'indexation à nettoyer. Le `noindex` reste posé partout malgré tout :
il ne coûte rien et c'est la seule protection le jour où `robots.txt` est
inaccessible. **Si une URL privée apparaît un jour dans Search Console**, il faut
retirer sa ligne `Disallow` — et seulement celle-là — pour que Google vienne lire
le `noindex` et la désindexe pour de bon.

**Surfaces privées : `/admin` et `/espace-coach`.** C'est ce que servent
`src/proxy.ts` et `next.config.ts` aujourd'hui.
`SEO-INFORMATION-ARCHITECTURE.md` §4 écrit `/app/*` : le socle suit le code, pas
le document. Si les URLs changent, elles se changent à **un seul endroit** —
`prefixesPrives` dans `routes.data.json` — et `robots.ts` comme l'audit suivent.
L'audit signale si `proxy.ts` et la carte divergent.

---

## 8. Sept pièges Next 16 qui cassent un socle SEO

1. `params` et `searchParams` sont des `Promise`. La compatibilité synchrone de
   Next 15 est **supprimée**. Idem `cookies()`, `headers()`, `draftMode()`.
2. `middleware.ts` est devenu `proxy.ts` — c'est déjà fait dans ce dépôt.
3. `priority` sur `next/image` est **déprécié** : utiliser `loading="eager"` et
   `fetchPriority="high"` pour le héros.
4. `images.qualities` vaut `[75]` par défaut : tout autre `quality` est
   silencieusement ramené à 75.
5. Le `params` de `opengraph-image` / `icon` est une `Promise` lui aussi.
6. Turbopack est le défaut ; **`next lint` est supprimé** et `next build` ne
   linte plus. ESLint s'appelle directement.
7. `serverRuntimeConfig` / `publicRuntimeConfig` sont supprimés — le domaine
   passe par variable d'environnement, ce que fait `site.ts`.

Et deux pièges permanents : la **fusion superficielle** des metadata (§3), et
`Disallow` qui empêche de voir `noindex` (§7).

---

## 9. Ce qui reste à décider — pas par un développeur

1. **`coach.boxingcenter.fr` est-il acté avec Boxing Center ?**
   `MASTER-PROJECT-SPEC.md` §18 liste encore « domaine et nom final du service »
   en dépendance non levée. Tant que la réponse manque, le site est invisible
   pour Google — ce qui est le comportement correct, mais pas un état dans
   lequel on lance.
2. **Slash final** : on garde `/tarifs` ou on suit la notation `/tarifs/` ? (§7)
3. **Les quatre pages juridiques** : livrées en `draft` comme ici, ou une seule
   page `/documents-contractuels/` comme le veut la décision D6 ? D6 et la carte
   de routes §3 se contredisent ; le socle suit la carte, parce que c'est le
   contrat partagé avec Brad.
4. **Les tarifs sont-ils une grille publique et stable ?** Si oui, `Service.offers`
   devient possible et rapporte sur les recherches de prix.
5. **Qui écrit les titres et descriptions définitifs ?** Ce sont des textes
   commerciaux, pas techniques.
6. **`NEXT_PUBLIC_SEO_INDEXABLE` doit entrer dans `.env.example`** — fichier
   partagé par les trois lots, donc une seule passe groupée, pas deux commits
   qui se croisent.
