# Audit « production ready » — le cahier ligne par ligne

Fait le 19 septembre 2026. Vérifié dans le code, pas estimé.

« Production ready » n'est pas une impression, c'est une mesure. Ce document
compare **ce que le cahier des charges exige** à **ce qui existe réellement**.
Chaque ligne a été retrouvée dans le code ou constatée absente.

Légende : ✅ fait · 🟡 partiel · ❌ absent

---

## 0. ~~Le trou bloquant~~ — RÉPARÉ le 19 septembre

Le cloisonnement par club est en place et **prouvé sur le serveur** :

| Test | Résultat |
|---|---|
| `minimes` se connecte | « Périmètre : le club minimes uniquement » |
| `minimes` demande `?club=portet` | **Refusé.** Le seul club cité sur toute la page est `minimes` |
| `direction` se connecte | « Périmètre : les cinq clubs », les 5 sélectionnables |

C'est le test contractuel du cahier §13.2, passé.

Le périmètre est appliqué **à la source** : la liste des clubs est réduite avant
toute lecture. Filtrer requête par requête marche jusqu'au jour où quelqu'un
ajoute une requête et oublie le filtre ; réduire la source ne s'oublie pas.

Les comptes vivent dans `coach_staff_accounts` : un par salle, plus la
direction, plus un super-admin de secours pris dans l'environnement — pour
qu'une porte reste ouverte même si la table devient inaccessible.

**Les six comptes existent mais sont INACTIFS.** Pour les ouvrir :

```
node scripts/comptes-salle.mjs --activer-tous
```

À lancer dans ton terminal : les mots de passe s'affichent une seule fois et
seule leur empreinte est conservée. Ils n'apparaissent volontairement nulle part
dans cette conversation ni dans git.

---

## 0 bis. L'ancien constat, pour mémoire

> Cahier §20 : « Le responsable de salle **ne devra pas pouvoir consulter les
> données des autres clubs**. »

**Aujourd'hui, si.** Le back-office lit par `src/lib/dal/back-office.ts`, qui
passe en `service_role` : qui entre voit les cinq clubs. Le périmètre club
n'existe nulle part dans la session — il n'y a que `role: admin | super_admin`.

Et le plus frustrant : **le code correct existe déjà.** `src/lib/dal/staff.ts`
fait le cloisonnement proprement (`clubEffectif`, `perimetreClub()`, lecture
sous RLS). Il est exporté par `src/lib/dal/index.ts` et **importé par personne**.

C'est le même motif que trois fois déjà sur ce projet : l'infrastructure est
écrite, rien ne l'appelle. C'est ce qu'il faut regarder en premier à chaque
fois qu'une fonctionnalité « manque ».

**Conséquence tant que ce n'est pas branché : on ne peut ouvrir le back-office
qu'à la direction.** Donner l'accès à un responsable de salle serait lui donner
les données des quatre autres clubs.

---

## 0 ter. Le responsive, mesuré — 19 septembre

Eddy : « Le responsive n'est pas bon. Je vois la page /admin. C'est de la
merde. » Mesuré avant correction, à 375 px :

| Mesure | Avant | Après |
|---|---|---|
| Largeur de la grille du planning | 736 px | **544 px** |
| Colonne des heures en défilant | perdue | **figée à gauche** |
| Cibles sous 44 px | 8 | **0** |
| Texte sous 12 px | 3 | **0** |
| Débordement horizontal | 0 | 0 |

Vérifié aussi à **320 px** (le plus petit téléphone encore en service) :
aucun débordement de page, aucune cible trop petite, et les trois bandes de
filtres comme la grille défilent au lieu de casser.

### Les trois décisions

1. **La colonne des heures se fige.** En défilant vers la droite on perdait de
   vue la ligne qu'on lisait, donc on faisait l'aller-retour. C'est le seul
   correctif qui change la nature de l'outil, pas juste son confort.
2. **Les filtres passent en bandes défilantes.** Cinq clubs empilés
   verticalement mangeaient un écran entier avant d'arriver au planning.
3. **Les cibles montent à 44 px** — y compris les liens de pied de page, qui
   faisaient 19 px sur tout le site, et le logo, qui en faisait 30.

### Ce qui n'a PAS été « corrigé », et pourquoi

Trois liens restent sous 44 px : ils sont au fil d'une phrase, et la norme
WCAG 2.5.8 les exempte explicitement. Les gonfler casserait l'interligne sans
rien gagner.

En revanche l'un d'eux n'était pas un lien dans une phrase mais **le seul
chemin vers la réservation** pour un visiteur sans compte, traité comme une
note de bas de page. Il est devenu un vrai bloc avec deux boutons. Ce n'était
pas un problème d'accessibilité, c'était un problème de conversion.

---

## 1. Back-office responsable de salle — cahier §20

| # | Exigence | État | Où |
|---|---|---|---|
| 1 | Consulter les réservations du club | 🟡 | `listerReservations` — mais non cloisonné (§0) |
| 2 | Voir les créneaux disponibles | ✅ | `lireGrille` |
| 3 | Voir les créneaux bloqués | ✅ | état `blocked` dans la grille |
| 4 | **Ajouter un créneau** | ❌ | — |
| 5 | **Supprimer un créneau** | ❌ | — |
| 6 | Bloquer un créneau | ✅ | `bloquerCreneau` |
| 7 | Modifier les disponibilités | 🟡 | seulement bloquer / débloquer |
| 8 | **Consulter le nom des coachs réservés** | ❌ | `ReservationBO` porte `coach_id`, pas le nom |
| 9 | Visualiser l'espace réservé | ✅ | `space_id` |
| 10 | Consulter le statut de paiement | ✅ | `payment_status` |
| 11 | Consulter le statut de signature | ✅ | `signature_status` |
| 12 | Vérifier si le QR a été généré | 🟡 | `deciplus_job_status` existe, non affiché |
| 13 | **Exporter les réservations du club** | ❌ | — |
| 14 | **Cloisonnement inter-clubs** | ❌ | voir §0 — bloquant |

**5 exigences sur 14 entièrement satisfaites.**

---

## 2. Back-office direction — cahier §21

| # | Exigence | État |
|---|---|---|
| 1 | Visualiser toutes les réservations | 🟡 un club à la fois |
| 2 | Filtrer par club | ✅ |
| 3 | **Filtrer par coach** | ❌ |
| 4 | Filtrer par date | ✅ |
| 5 | **Filtrer par statut** | ❌ |
| 6 | **Consulter les paiements** | ❌ |
| 7 | **Consulter les avoirs** | ❌ |
| 8 | **Consulter les annulations** | ❌ |
| 9 | **Consulter les documents signés** | ❌ |
| 10 | **Gérer les comptes coachs** | ❌ |
| 11 | **Suspendre un coach** | ❌ |
| 12 | **Modifier les limites de réservation** | ❌ |
| 13 | **Modifier les prix** | ❌ |
| 14 | **Modifier les créneaux** | ❌ |
| 15 | **Gérer les espaces** | ❌ |
| 16 | **Exporter les données** | ❌ |
| 17 | **Consulter les statistiques** | ❌ |
| 18 | Logs d'accès Deciplus | ❌ (lot A) |

**2 exigences sur 18 entièrement satisfaites.**

Note : le cahier §8 et §12 exigent explicitement que **les tarifs et la limite
de réservations soient paramétrables depuis le back-office**. Les deux sont
aujourd'hui figés en base. La migration `0023` a déjà sorti l'amplitude horaire
du code vers une table — c'est le même travail à faire pour les prix et la
limite.

---

## 3. Espace coach — cahier §27

| # | Exigence | État |
|---|---|---|
| 1 | Modifier ses informations personnelles | ✅ |
| 2 | Ajouter une photo | 🟡 champ présent, chaîne de téléversement à vérifier |
| 3 | **Renseigner ses diplômes** | ❌ aucune trace |
| 4 | **Renseigner ses disciplines** | ❌ aucune trace |
| 5 | Consulter ses réservations | ✅ |
| 6 | Réserver un nouveau créneau | ✅ |
| 7 | Annuler si délai > 24 h | ✅ `ReservationActions` |
| 8 | **Consulter ses avoirs** | ❌ pas de page dédiée |
| 9 | Retrouver ses QR codes | 🟡 un par réservation, pas de vue d'ensemble |
| 10 | **Accéder aux documents signés** | ❌ |
| 11 | **Gérer son moyen de paiement** | ❌ |
| 12 | **Consulter l'historique des paiements** | ❌ |

**5 exigences sur 12 entièrement satisfaites.**

Le cahier §11 demande aussi à l'inscription : date de naissance, téléphone,
adresse postale, diplôme, disciplines, photo, justificatifs, moyen de paiement
préenregistré (carte ou PayPal). **À recouper avec le formulaire réel.**

---

## 4. Notifications — cahier §22

Aucune n'existe. Le cahier en liste **dix-sept** : huit pour le coach, cinq pour
la salle, quatre pour la direction. C'est un chantier entier, pas une finition.

---

## 5. Ce que ça donne

| Surface | Satisfait | Total |
|---|---|---|
| Back-office salle | 5 | 14 |
| Back-office direction | 2 | 18 |
| Espace coach | 5 | 12 |
| Notifications | 0 | 17 |
| **Total** | **12** | **61** |

Le moteur (créneaux, holds, capacité, tarifs, RLS) est solide et testé. **Ce qui
manque, ce sont les surfaces de pilotage** — exactement ce qu'Eddy demande
quand il dit que le back-office doit tout contrôler.

---

## 6. L'ordre dans lequel attaquer

1. **Brancher `staff.ts`** et poser le périmètre club dans la session. Bloquant :
   rien d'autre ne peut s'ouvrir aux responsables de salle avant.
2. **Le nom du coach** dans les listes du back-office — une jointure, et c'est
   la première chose qu'un responsable de salle regarde.
3. **Les leviers de la direction** : suspendre un coach, modifier prix et
   limites, gérer les espaces. Ce sont les « je dois pouvoir réparer » d'Eddy.
4. **L'export** (salle et direction). Format CSV, encodage et séparateur décidés
   pour Excel français.
5. **L'espace coach** : avoirs, documents signés, historique de paiement.
6. **Les notifications**, par ordre de dégât évité : échec de paiement, document
   non signé, rappel avant créneau.
