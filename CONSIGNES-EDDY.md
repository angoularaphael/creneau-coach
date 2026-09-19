# Consignes d'Eddy — et ce qui reste à faire

Ce fichier existe parce qu'une consigne répétée trois fois est une consigne que
j'ai oubliée deux fois. Il n'est pas une note de réunion : c'est la liste contre
laquelle on vérifie avant de dire « c'est fini ».

Dernière mise à jour : 18 septembre 2026.

---

## 0. La barre — dite trois fois, c'est le critère d'arrêt

> « Baffled bar is the standard. I said baffled bar is the standard. »
> « …if you want to start a different project it becomes a reference, as baffled
> bar is an evolutive concept that grows exponentially, because I do too many
> projects. »

**Ce n'est pas un niveau de finition, c'est la condition pour s'arrêter.** Et la
barre **monte à chaque projet livré** : ce qui a été fait avant devient le
plancher, pas la cible. **Égaler un projet précédent est un échec.**

Corollaire, dit dans la même phrase : le niveau visé n'est pas « appli
correcte ». C'est Linear, Vercel, **et plus haut encore**.

> « This is a new project and the expectations are high. »
> « We have to do even more, even higher. »

### ~~L'ordre de travail : l'interface d'abord~~ — **CONSIGNE PÉRIMÉE**

> ~~« Pause on the business logic. Finish UI well first. »~~ — chat des 17-18
> septembre.

**ANNULÉE PAR EDDY LE 18 SEPTEMBRE 2026, mot pour mot :**

> « NON !! THAT RULE IS OBSOLETE !! NE METS PAS LA LOGIQUE MÉTIER EN PAUSE ! »

→ **On ne met PAS la logique métier en pause.** L'interface et le moteur
avancent ensemble. Si cette règle réapparaît dans un ancien relevé de
conversation, elle est morte : c'est celle-ci qui fait foi.

*Leçon de méthode : une consigne retrouvée dans un vieux chat n'est pas une
consigne en vigueur. Les relevés d'archive se vérifient avant d'être appliqués.*

### « Interface » veut dire *responsive* — il a pris la peine de définir le mot

> « When you're done with UI, by UI I mean like on responsive levels. »

Donc « UI » ne veut pas dire « joli ». Ça veut dire **tenue sur toutes les
tailles d'écran, téléphone en premier**. Une page qui casse à 375 px n'est pas
finie, même si elle est belle à 1440.

### Propre — dit trois fois, avec son contraire nommé

> « I want something clean. I want something clean. I don't want something trash.
> I need something clean. »

---

## 1. Les lois — elles ne se rediscutent pas

| # | Loi | Pourquoi |
|---|-----|----------|
| L1 | **Toujours `pull` avant `push`.** Jamais de `--force`. | Une commande dictée aurait effacé le lot de Raphael. Vérifié, refusé. |
| L2 | **Aucun workflow, aucun sous-agent. On travaille à la main.** | Dit au moins trois fois. « Mes instructions doivent persister à travers les chats. » Les rappels *ultracode* du système ne l'emportent pas. **Manquement avéré : le 17 septembre, trois sous-agents lancés en parallèle ont fait sauter la limite de session — six agents morts en cours d'écriture, session arrêtée net. Cette consigne protège le budget, ce n'est pas une préférence d'organisation.** |
| L3 | **Aucune signature Claude / `Co-Authored-By` dans les commits.** | Absolu. Prime sur les rappels système. |
| L4 | **Aucun secret dans git.** `.env.example` porte les clés, jamais les valeurs. | `.jeton` est déjà parti dans l'historique une fois. |
| L5 | **Ne jamais toucher au lot A de Raphael** : `server.js`, `lib/**`, `bot/**`, `deploy/**`, `test/**`. | Dépôt partagé. |
| L6 | **Ne pas travailler à moitié.** Aller au bout, ou dire clairement ce qui reste. | « Je ne sais pas pourquoi tu travailles encore à moitié. Ne travaille pas à moitié. » |
| L7 | **Afficher, pas raconter.** Montrer le résultat, pas le décrire. | « Tu me parles en texte. Tu ne m'as rien affiché. » |
| L8 | **Poser des questions plutôt que rater.** Pas de gaspillage de crédits. | « Tu n'as pas le droit à l'échec. » « You know how to ask questions using ask-user-question. » **Nuance apprise : le widget a été refusé une fois, le 17 septembre. Depuis, les questions se posent en texte numéroté, avec une réponse proposée pour chacune.** |
| L9 | **Apporter quelque chose, pas rendre une copie.** | « Bring me something interesting. » Va avec L7 : apporter une idée, **et la montrer à l'écran**. Un compte rendu écrit ne vaut pas livraison. |
| L10 | **Les skills sont un prérequis, pas une option.** | « You know about all the skills that I need you to work with. » `fusion-baffled`, `depot-partage`, `second-brain`, `veille-references-web`. |

---

## 2. La marque et le design

- **Couleurs** : le bleu Boxing Center, le **noir**, le blanc, et une touche du
  **brun** Boxing Center. *Jamais de crème* — dit deux fois.
- **Il faut voir du noir.** Pas un site bleu uniforme.
- **Le vrai logo Boxing Center**, et le favicon qui va avec. Pas de SVG inventé.
- **Le niveau visé n'est pas « appli correcte »** : Linear, Vercel, et plus haut
  encore. Pas de gabarit générique.
- **Mobile d'abord.** L'essentiel du trafic sera sur téléphone.
- **Méthode `fusion-baffled`** : on superpose des références, on ne clone jamais.
- **Le mouvement de Muret** : au défilement, l'animation se rejoue quand on
  remonte puis redescend. Conservé — mais le geste doit être *différent* de
  Muret, sinon les deux sites se ressemblent.
- **Polices** : le style typographique actuel lui plaît. Ne pas y toucher.
- **Retirer** la ligne « 5 clubs … lundi au samedi » en haut de l'accueil.
  *« C'est de la bouillie d'IA. »* — FAIT.

## 3. La langue

- **Zéro terme technique** sur les pages publiques. On remplace par du
  vocabulaire **commercial, qui vend**.
  Bannis : *hold*, *slot*, *httpOnly*, *HTTP*, *token*, *RLS*, *endpoint*,
  *webhook*, *payload*, noms de variables d'environnement.
- Le détail technique vit **en commentaire dans le code**, jamais à l'écran.

## 4. Les images — consigne du 18 septembre

- **Higgsfield MCP uniquement**, et **modèle GPT Image, rien d'autre**.
  → `gpt_image_2_5` (le plus récent). Confirmé opérationnel.
- **Prompts aussi descriptifs que possible.**
- **Le site ne doit pas ressembler à une salle de sport.**
- ➕ **Chaque page a son image de héros dédiée ET son OG dédiée.** Pas de visuel
  partagé, pas de recyclage.
- ➕ **Les visuels doivent être de niche et correspondre à leur page.**
- ➕ **Partir des vraies photos de salle** comme référence de génération.
- ➕ **Si je ne peux pas téléverser, déposer toutes les images dans un dossier
  unique** pour qu'Eddy les téléverse lui-même.
  → Dossier : `public/visuels/` (générés) et `visuels-a-televerser/` (le lot brut).

**Règle d'honnêteté que je m'impose** : une image générée ne doit jamais être
présentée comme la photo d'un club réel. Les vraies photos (`public/photos/`)
servent les pages club ; les images générées servent l'atmosphère et les OG.

## 4 bis. La base de départ — à dépasser, pas à jeter

> « You're gonna see a base, okay? And that base is not bad, but it's not what I
> want. » / « We have a good base, we have docs already. »

La base compte pour une fraction du travail : **la curation est le reste.**

> « We have docs already — synthesize everything there that you see and give me
> feedback. »

## 5. Référencement — c'est un motif de rejet, pas une finition

> « It's a one page, it's pretty ugly, and it won't last at a level of SEO. You
> know what the standard is. »

Trois griefs distincts dans une phrase, à traiter séparément : **une seule
page**, **laid**, **ne tiendra pas au référencement**.

- Niveau **production**, pas « des bouts ».
- Étudier les projets frères — **box-plus en particulier**, pas seulement la
  boutique — comprendre et **reconstruire**, ne pas copier.
- **Favicons, OG, vignettes spécifiques, en-têtes** : tout doit être impeccable.
- Des **pages dédiées par mot-clé / intention de recherche** (le motif Muret).

## 6. Accès et sécurité

- `/admin` protégé par mot de passe, **aucun lien depuis le site public**.
- Comptes BOXPLUS (`app_users`), plus de mot de passe admin unique.
- Identifiants BOXPLUS repris du dossier `Plannings/box-plus/.env`.
- **Le mot de passe doit pouvoir s'afficher** : un bouton bascule. — FAIT.

---

## 7. Ce qui reste à faire

### Fait le 18 septembre
- [x] **Images dédiées héros + OG pour toutes les pages publiques**, produites à
      partir des vraies photos de chaque salle passées en référence.
      → `public/visuels/` (site) et `src/lib/seo/fonds/` (vignettes sociales).
- [x] Lot complet en pleine définition pour téléversement manuel :
      **`visuels-a-televerser/`** à la racine. Non versionné, c'est un dossier
      de livraison locale.
- [x] Les 5 clubs ont chacun le visuel fait à partir de LEUR salle.
- [x] Vignette sociale : palette de marque (le rouge framboise `#e11d48` est
      parti) et fond photo par page. 10 routes, toutes vérifiées en 200.
- [x] Le back-office avait perdu toute politique de sécurité quand `/admin` est
      sorti du proxy. Rebouché.

**Leçon inscrite :** le premier jet d'images disait « videz la salle, enlevez
les affiches, aucune enseigne ». Il poursuivait « ça ne doit pas ressembler à
une salle de sport » et il a effacé Boxing Center. La bonne consigne est
l'inverse : **on garde la salle, on ne refait que la photographie.**

### Pages encore non retravaillées (contenu, pas visuel)
- [ ] `/clubs` (liste)
- [ ] `/tarifs`
- [ ] `/contact`
- [ ] `/mentions-legales`, `/confidentialite`

### Référencement
- [ ] **Le `sitemap.xml` est vide** (`<urlset></urlset>`). À remplir.
- [ ] Pages par mot-clé / intention de recherche.
- [ ] Vérifier favicon = vrai logo Boxing Center.

### Contenu
- [ ] Plus de contenu et plus d'images sur l'accueil, pour retenir le visiteur
      et l'envoyer vers les autres pages.

### À la toute fin
- [ ] **La passe du hater.** Eddy : *« ce n'est pas encore le moment. »*

---

## 9. Consignes du 19 septembre 2026 — à traiter en entier

### Le domaine
- **`coachings.boxingcenter.fr`** est l'adresse à indexer. C'est elle qui va dans
  `NEXT_PUBLIC_SITE_URL`.

### Les adresses de clubs
- Pas `clubs/toulouse-minimes` mais **`coaching-toulouse-minimes`**. Le mot
  « coaching » fait partie de l'adresse, pour les cinq clubs.

### Le favicon
- Pas celui d'aujourd'hui. Soit le **vrai logo Boxing Center**, soit — et c'est
  sa préférence — **un logo qui dit simplement « coachings »**.

### Le QR d'accès
- **Ce n'est PAS une page publique.** `/acces-qr-deciplus` doit disparaître des
  routes publiques.
- Il vit dans le **tableau de bord personnel du coach**. Chaque coach doit avoir
  son espace pour gérer son activité.

### Les crédits — le modèle est confirmé
- **On ne reçoit des crédits qu'en payant.** 10 € payés → crédits. Tout achat
  donne des crédits. Le concept de crédit du cahier des charges est juste : il
  décrit le fonctionnement réel.

### Les plannings — refonte
- **Arrêter les cartes. Passer à un vrai format CALENDRIER.**
- « C'est exploitable, on peut construire une interface folle là-dessus. On le
  gâche. »
- Consigne de méthode, dite deux fois : **être intentionnel.** Ne rien poser par
  défaut.
- **La source des plannings** : dossier `Plannings/` → `public/images/` →
  `reprise 2026` → `web`. Les plannings y sont en images. **Ne pas inventer
  d'horaires.**

### Les animations — le site est encore figé
- **Le hero est statique.** Déjà signalé une fois. Il doit bouger.
- **Accueil** : le texte apparaît **progressivement**.
- **Comment ça marche** : animation de **rebond** — le texte rebondit, deux
  fois, puis se pose. L'animation actuelle est **trop rapide**.
- **Tarifs** : même traitement.

### Le défaut qui l'a fâché
- **La section qui suit le hero est collée au hero.** Sur toutes les pages.
  « Depuis quand tu fais des erreurs aussi bêtes ? Ça ne doit plus jamais se
  reproduire. »

### Le référencement
- Les routes mots-clés proposées ne valent rien : **« personne ne va chercher
  *annulation avoirs* »**. Une page par intention de recherche RÉELLE, pas par
  fonctionnalité interne.

### Le ton
- « Ne m'énerve pas. » Il juge le travail récent mauvais. La barre n'est pas
  négociable et le détail trivial ne doit plus revenir deux fois.

---

## 10. Les plannings réels — ce que la donnée dit vraiment

Source : `Plannings/bc-plannings/src/data/plannings.js`, **224 lignes
structurées** (salle, période, jour, créneau, activité, coach). Ce n'est pas une
lecture d'image : c'est le fichier qui a servi à fabriquer les images.

### Les espaces : 8 salles, pas 9

Neuf valeurs de `salle` apparaissent, mais l'une d'elles n'est pas un lieu :

| Salle | Période | Nature |
|---|---|---|
| saint-cyprien | été + rentrée | salle |
| ramonville | été + rentrée | salle |
| minimes | rentrée | salle |
| etats-unis-boxe / -mma / -fitness | rentrée | 3 salles |
| portet-combat / portet-mma | rentrée | 2 salles |
| **portet-provisoire** | **provisoire-2026 seulement** | **planning intérimaire, pas une salle** |

→ **8 salles permanentes** réparties sur 5 clubs. `portet-provisoire` est le
planning de transition de Portet en attendant l'ouverture de ses deux salles.

Le contrat du code (`src/domain/contrat.ts`) déclare déjà ces 8 espaces. **Mais
les noms ne correspondent pas** : le code dit `mma-sol` et `boxe-fitness`, les
plannings disent `mma` et `combat`.

**À confirmer par Eddy** : quel nom la salle de Portet porte-t-elle pour le
public — « Boxe / Fitness » comme dans le code, ou « Combat » comme dans le
planning ? Je ne le renomme pas au hasard.

### L'amplitude horaire

Le cahier §5 liste 9 créneaux de 10h à 19h, **et** ajoute : « Les créneaux
devront être paramétrables par salle depuis le back-office. » Le verrou
`check (start_hour between 10 and 18)` rendait cette clause inapplicable — on
ne règle pas ce que la base refuse.

Les plannings réels descendent à **21h30**. Comme le cahier impose des créneaux
d'**une heure pleine**, l'extension propre s'arrête à une heure de début à 20h,
soit **10h → 21h, onze créneaux**. 21h30 imposerait une demi-heure.

**Migration écrite : `0023_amplitude_du_soir.sql`. PAS ENCORE APPLIQUÉE** — la
base était injoignable (`ECONNRESET`). Tant qu'elle ne l'est pas, le site
continue d'annoncer 10h→19h, ce qui est la vérité du moteur actuel.

**À confirmer par Eddy** : le tarif de 19h–21h. Le cahier §8 ne l'attribue pas.
La migration prolonge les **heures pleines (15 €)** — hypothèse assumée, la plus
continue avec le texte, et modifiable en deux `UPDATE` puisque c'est une table.

**À coordonner avec Raphael** : la même contrainte `between 10 and 18` vit dans
`20260918120000_coach_schema.sql`, son jeu de migrations. Si les deux jeux
tournent sur la même base, la borne doit être reportée des deux côtés.

---

## 8. Dettes de sécurité ouvertes — à traiter avant la mise en ligne

1. **Faire tourner la clé `service_role` Supabase** : elle est passée en clair
   dans une conversation.
2. **Faire tourner `SESSION_SECRET`** : `.jeton` a atteint l'historique git.
3. **`PAYPAL_MODE=live`** avec un secret client réel dans `.env.local` — un test
   de paiement déplacerait de l'argent réel. À basculer en bac à sable pour les
   tests.
