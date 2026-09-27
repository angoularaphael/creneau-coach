# Ouvrir le site aux moteurs — la procédure, dans l'ordre

État relevé le **27 septembre 2026** :

| Contrôle | Résultat | Conséquence |
|---|---|---|
| `coachings.boxingcenter.fr` | **n'existe pas** dans le DNS (NXDOMAIN chez Google 8.8.8.8) | aucun moteur ne peut visiter l'adresse qu'on veut classer |
| `creneau-coach.vercel.app/robots.txt` | `Disallow: /` | tous les robots sont refoulés |
| `<meta name="robots">` des pages | `noindex, nofollow` | même visitée, aucune page n'entre dans l'index |
| `sitemap.xml` | vide | rien n'est proposé |
| pages dans Google, dans Bing | 0 | le site n'existe pour aucun moteur de réponse |

Ce n'est pas un défaut : c'est l'interrupteur, fermé exprès tant que le domaine
n'existe pas. **Le texte est prêt ; ce qui manque, ce sont six gestes chez OVH,
Vercel, Google et Bing.** Aucune réécriture de page ne remplace ces gestes : une
page que Google n'a pas indexée ne peut être ni classée, ni citée par ChatGPT,
Perplexity, Copilot, Claude ou Google AI Mode.

Répétition faite en local le 27/09 avec l'interrupteur ouvert : `robots.txt`
ouvre tout sauf `/admin/`, `/espace-coach/`, `/api/`, `/auth` ; le sitemap liste
16 adresses ; `check-seo` et `verif:aeo` passent.

---

## 1. OVH — créer l'adresse (5 minutes)

Zone DNS de `boxingcenter.fr` (serveurs `dns17.ovh.net` / `ns17.ovh.net`) →
**Ajouter une entrée** :

| Type | Sous-domaine | Cible |
|---|---|---|
| `CNAME` | `coachings` | la valeur que Vercel affiche à l'étape 2 (souvent `cname.vercel-dns.com.`, avec le point final) |

Ne pas toucher aux autres entrées : elles servent boxingcenter.fr.

## 2. Vercel — brancher le domaine (projet `creneau-coach`)

Le projet est sur le compte de Raphael : c'est lui, ou quelqu'un qu'il invite,
qui fait cette étape.

1. **Settings → Domains → Add** : `coachings.boxingcenter.fr`. Vercel donne la
   cible du CNAME (étape 1) et passe au vert quand le DNS a propagé.
2. Toujours dans **Domains**, sur `creneau-coach.vercel.app` : **Redirect to**
   `coachings.boxingcenter.fr` (308). Une seule adresse doit répondre ; sinon
   Google voit deux sites identiques.
3. **Settings → Environment Variables**, environnement **Production seulement** :

   | Variable | Valeur |
   |---|---|
   | `NEXT_PUBLIC_SITE_URL` | `https://coachings.boxingcenter.fr` |
   | `SITE_URL` | `https://coachings.boxingcenter.fr` |
   | `NEXT_PUBLIC_SEO_INDEXABLE` | `true` — **seulement après l'étape 4** |

   **`SITE_URL` n'est pas un détail.** C'est l'adresse où le prestataire de
   paiement renvoie le coach après avoir payé
   (`src/lib/payments/payplug.ts`, `lib/paypal.js`). Le cookie de connexion est
   attaché à l'adresse où le coach s'est connecté. Si `SITE_URL` reste sur
   `vercel.app`, un coach qui paie sur `coachings.boxingcenter.fr` revient sur
   une autre adresse, **déconnecté**, au moment exact où il vient de payer.

4. **Redéployer** (les variables `NEXT_PUBLIC_*` sont figées au build).

## 3. Vérifier avant d'ouvrir — sur le vrai domaine

```bash
node scripts/check-seo.mjs https://coachings.boxingcenter.fr --strict
```

```bash
npm run verif:aeo -- https://coachings.boxingcenter.fr
```

Les deux doivent finir sans échec. Alors seulement : `NEXT_PUBLIC_SEO_INDEXABLE=true`
en Production, et redéployer. L'interrupteur refuse de s'ouvrir sur une
prévisualisation Vercel, même mis à `true` par erreur (`src/lib/seo/site.ts`).

## 4. Google — Search Console

1. <https://search.google.com/search-console> → **Ajouter une propriété** →
   **Domaine** : `boxingcenter.fr` (couvre tous les sous-domaines, et le site
   du réseau avec).
2. Google donne un enregistrement `TXT` → le coller chez OVH (sous-domaine vide),
   attendre la propagation, **Valider**.
3. **Sitemaps** → soumettre `https://coachings.boxingcenter.fr/sitemap.xml`.
4. **Inspection de l'URL** → **Demander l'indexation**, dans cet ordre (quota
   d'une dizaine par jour) :
   - `/location-salle-coach-sportif-toulouse`
   - `/location-salle-de-boxe-toulouse`
   - `/location-salle-de-sport-a-l-heure-toulouse`
   - `/location-ring-de-boxe-toulouse`
   - `/` puis `/clubs`, `/tarifs`
   - les cinq pages `/clubs/coaching-…`

## 5. Bing — c'est l'index de ChatGPT et de Copilot

1. <https://www.bing.com/webmasters> → **Importer depuis Google Search Console**
   (reprend la propriété et le sitemap en un clic).
2. Puis, depuis le dépôt, après chaque mise en production :

   ```bash
   npm run indexnow
   ```

   Le script vérifie que la clé `public/9d2ec6b73e73d8bd1c9215f6751cbe4a.txt` est
   servie, lit le sitemap **réel**, et **refuse d'envoyer** tant que
   l'interrupteur est fermé : soumettre des pages marquées `noindex` enverrait
   aux moteurs deux signaux contraires. Réponse attendue : `HTTP 200` ou `202`.

## 6. Brave — c'est l'index que lit Claude

<https://search.brave.com/submit-url> → soumettre la page d'accueil et les
quatre pages `/location-…`.

## 7. Le lien qui fait entrer le site dans l'index

Un site neuf, sans aucun lien entrant, attend des semaines. Le plus rapide est
un lien depuis une page **déjà indexée** :

- **boxingcenter.fr** — sur la page coachs ou sur chaque page de salle, une
  phrase avec un lien à ancre descriptive, par exemple
  « [louer une salle de boxe à l'heure pour vos clients](https://coachings.boxingcenter.fr/location-salle-coach-sportif-toulouse) ».
  Pas « cliquez ici », pas un logo seul : l'ancre dit aux moteurs de quoi parle
  la page d'arrivée.
- **Les cinq fiches Google Business Profile** des clubs — le champ « site web »
  reste boxingcenter.fr ; ajouter un **post** ou un **produit** « Location de
  salle pour coachs » qui pointe vers la page du club
  (`/clubs/coaching-toulouse-minimes`, etc.).
- **LinkedIn** — un coach qui loue une salle est un client professionnel. Les
  moteurs de réponse citent LinkedIn plus que tout autre réseau sur les
  questions entre professionnels (HubSpot, *State of AEO* 2026). Une page
  entreprise Boxing Center et une publication qui lie la page d'intention.

## 8. Mesurer — sans relevé, « premier » est une opinion

Chaque semaine, dans le navigateur (jamais par script : Google renvoie un
captcha, on ne le contourne pas) :

1. `site:coachings.boxingcenter.fr` sur Google et sur Bing — nombre de pages.
2. Search Console → **Performances** : requêtes, position moyenne, pages.
3. La même liste de questions, posée à ChatGPT, Perplexity, Copilot, Claude et
   Google AI Mode. Pour chacune : sommes-nous cités ? en quelle position ? avec
   quel fait ?
   - « louer une salle de sport à l'heure à Toulouse pour mes clients »
   - « location salle de boxe Toulouse »
   - « où louer un ring de boxe à Toulouse »
   - « je suis coach sportif indépendant, où faire mes séances à Toulouse sans salle ? »
   - « prix location salle de sport à l'heure Toulouse »
   - « salle de boxe coach indépendant Minimes / Saint-Cyprien / Ramonville / Portet »
   - « un coach sportif peut-il travailler dans une Basic-Fit avec son client ? »
4. Consigner dans `.research/positions/<date>.md` — le relevé zéro est
   `.research/positions/2026-09-27.md`.
