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

### En cours
- [ ] **Images dédiées héros + OG pour toutes les pages publiques**, à partir des
      vraies photos en référence.
- [ ] Déposer le lot complet dans le dossier de téléversement.

### Pages encore non retravaillées
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

## 8. Dettes de sécurité ouvertes — à traiter avant la mise en ligne

1. **Faire tourner la clé `service_role` Supabase** : elle est passée en clair
   dans une conversation.
2. **Faire tourner `SESSION_SECRET`** : `.jeton` a atteint l'historique git.
3. **`PAYPAL_MODE=live`** avec un secret client réel dans `.env.local` — un test
   de paiement déplacerait de l'argent réel. À basculer en bac à sable pour les
   tests.
