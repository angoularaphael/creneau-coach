# Bascule vers Next.js 16 — ce qui change pour Raphael et Brad

**Date :** 18 septembre 2026 · **Branche :** `lot-c-eddy` · **Auteur du changement :** lot C (Junior)

Ce document existe pour une raison : la bascule touche un dépôt où trois personnes travaillent.
Personne ne doit la découvrir dans un `git pull`.

---

## 1. Ce qui a changé, en une phrase

L'application est maintenant une application **Next.js 16.3.5** (App Router, React 19.3,
TypeScript 5.9.3). Le serveur Express du lot A n'a **pas** été modifié : il tourne toujours,
à l'identique, sur commande séparée.

Ce n'est pas une décision unilatérale : `.env.example`, écrit par Raphael, dit déjà
« Copier vers `.env.local` (Next) / Vercel », déclare des `NEXT_PUBLIC_*` et annonce
« CSP / HSTS gérés dans `next.config` ». La cible Next était actée dans le contrat d'équipe.
Seule la version change : `docs/REPARTITION-TACHES.md` §0 disait « Next.js 14 », la réalité
livrable aujourd'hui est la 16.3. La ligne a été corrigée — c'est important, parce qu'entre
la 14 et la 16 les `params` sont devenus asynchrones et `middleware.ts` a été renommé.

---

## 2. Ce qui n'a pas bougé d'un octet

| Fichier | État |
|---|---|
| `server.js` | **intact** |
| `lib/payplug.js`, `lib/paypal.js`, `lib/qr.js`, `lib/signature-pdf.js`, `lib/mail.js`, `lib/bot-forward.js`, `lib/store.js` | **intacts** |
| `bot/`, `deploy/prem-eu4/` | **intacts** |
| `test/qr.test.js` | **intact**, et `npm test` le lance toujours |
| `public/sign.html` | **intact** |

Le `package.json` reste **CommonJS**. `"type": "module"` n'a pas été ajouté et ne le sera pas :
les sept fichiers ci-dessus planteraient au premier `require`.

---

## 3. Les commandes

| Avant | Maintenant | Effet |
|---|---|---|
| `npm run dev` | `npm run dev:legacy` | le serveur Express, inchangé |
| — | `npm run dev` | Next.js sur `http://localhost:3041` |
| `npm start` | `npm start` | **inchangé** — `node server.js` |
| `npm test` | `npm test` | **inchangé** — `node --test test/*.test.js` |

⚠️ **Collision de port.** Les deux veulent 3041. Pour lancer les deux en même temps :

```bash
PORT=3042 npm run dev:legacy
```

---

## 4. Où vit quoi maintenant

```
server.js, lib/, bot/, deploy/, test/   ← lot A (Raphael) — frontière, on n'y touche pas
public/                                 ← assets partagés (Next l'exige à la racine)
src/
  app/                                  ← routes Next
    api/v1/…                            ← l'API du contrat
    (public)/…                          ← lot B (Brad)
    admin/…                             ← lot C (Junior)
  domain/                               ← moteur métier pur (lot C)
  lib/                                  ← sécurité, accès données, SEO (lot C)
  proxy.ts                              ← session + redirections
supabase/migrations/                    ← schéma + RLS (lot C)
mcp/                                    ← serveur MCP du contrat
```

`src/` n'est pas un goût : c'est une frontière physique. `lib/` à la racine appartient au lot A.
Y déposer des modules TypeScript garantissait les collisions de noms et les PR qui se marchent dessus.

---

## 5. Les trois pièges de Next 16 — à lire avant d'écrire une route

**1. `middleware.ts` n'existe plus, c'est `proxy.ts`.**
La documentation : « The `middleware` filename is deprecated, and has been renamed to `proxy` ».
Le fichier est `src/proxy.ts`. Il ne supporte pas le runtime `edge`.

**2. `params` est une `Promise`.** La compatibilité synchrone a été supprimée.

```ts
export async function GET(request: NextRequest, ctx: RouteContext<'/api/v1/clubs/[clubId]'>) {
  const { clubId } = await ctx.params   // await obligatoire
}
```

`cookies()` et `headers()` sont asynchrones aussi.

**3. Le proxy n'est PAS une frontière de sécurité.** C'est écrit dans la doc Next : un changement
de `matcher` retire silencieusement la couverture. L'autorisation est refaite **dans chaque route
handler** et **dans Postgres par la RLS**. Ne jamais se reposer sur le proxy seul.

---

## 6. Ce que le lot A gagne à porter ses routes

Les seize routes de `server.js` deviennent des Route Handlers sous `src/app/api/v1/`.
Les adaptateurs `lib/*.js` — Payplug, PayPal, QR, PDF, mail, bot — sont des fonctions pures :
ils sont appelés tels quels, sans réécriture.

Ce que la bascule apporte concrètement au lot A :

- **`lib/store.js` disparaît.** Le store JSON n'a ni transaction, ni verrou, ni concurrence :
  deux paiements simultanés s'écrasent. Le lot C fournit Postgres à la place.
- **Un seul déploiement.** Aujourd'hui Vercel ne sert que Next ; un Express séparé demanderait
  un second hébergement, une seconde configuration de secrets, une seconde surface à sécuriser.
- **Les sessions deviennent communes.** Le lot A lit la même session Supabase que les lots B et C,
  au lieu de faire confiance à un identifiant passé dans l'URL.
- **CSP, HSTS et anti-clickjacking gratuits** sur le tunnel de paiement et le pad de signature —
  c'est la case « Headers CSP / clickjacking » de `REPARTITION-TACHES.md` §2.4, déjà cochée.

---

## 7. Ce qui reste à décider ensemble

1. **Réglage du projet Vercel.** Si le framework y est réglé sur « Other » au lieu de « Next.js »,
   c'est `npm start` qui tourne, donc Express, donc le site sert le lot A au lieu de l'application.
   Quelqu'un doit vérifier ce réglage avant la première mise en ligne.
2. **Plan Vercel.** Le plan Hobby plafonne les crons à un par jour. Le lot C a besoin d'une
   expiration des holds à la minute. Solution retenue en attendant : l'expiration est **aussi**
   calculée en SQL à la lecture, donc un cron absent dégrade la fraîcheur d'affichage mais
   **ne casse pas** la règle métier. Un cron `pg_cron` côté Supabase peut prendre le relais.
3. **Brad met ses pages dans `src/app/`**, pas dans un second dossier `app/` à la racine :
   Next refuse les deux à la fois.
