# Architecture multi-page et référencement

## 1. Diagnostic actuel

Le prototype est une page unique :

- les sections publiques sont des ancres dans `index.html` ;
- les vues coach, responsable et direction sont rendues en JavaScript ;
- il n'existe pas de page HTML dédiée par club ;
- il n'existe pas de canonical, sitemap ou contenu serveur par route ;
- `noindex,nofollow` protège actuellement le prototype.

Cette structure n'est pas la version SEO attendue.

## 2. Séparation publique / privée

### Site public

Contenu rendu côté serveur ou statiquement, navigation avec vrais liens, URLs stables, indexation décidée par le propriétaire.

### Application privée

Sous `/app/`, authentifiée, `noindex,nofollow`, absente du sitemap et protégée au serveur.

### Administration

Sous `/admin/`, authentifiée avec MFA, `noindex,nofollow`, non découvrable dans les surfaces publiques.

## 3. Carte de routes publique cible

| Route | Intention principale | Contenu unique attendu |
|---|---|---|
| `/` | location salle coach indépendant Toulouse | proposition de valeur, réseau, fonctionnement, accès aux clubs |
| `/clubs/` | comparer les clubs disponibles | carte réseau et critères de choix |
| `/clubs/toulouse-minimes/` | louer un espace de coaching à Minimes | photos, espaces, équipements, accès, affluence, disponibilités |
| `/clubs/toulouse-st-cyprien/` | louer un espace de coaching à St-Cyprien | faits propres au club |
| `/clubs/toulouse-etats-unis/` | réserver Boxe/MMA/Fitness à États-Unis | trois espaces, trois plannings, capacités |
| `/clubs/ramonville/` | louer un espace de coaching à Ramonville | faits propres au club |
| `/clubs/portet-sur-garonne/` | réserver Boxe/Fitness ou MMA à Portet | deux espaces et règles enfants spécifiques |
| `/comment-ca-marche/` | comprendre le parcours | compte, réservation, paiement, signature, QR |
| `/tarifs/` | connaître les prix | creuses/pleines, avoirs, exemples transparents |
| `/devenir-coach-partenaire/` | conditions d'accès au service | profil, diplômes, validation, responsabilités |
| `/acces-qr-deciplus/` | comprendre l'accès au club | fonctionnement honnête, limites et assistance |
| `/annulation-avoirs/` | comprendre la règle de 24 h | cas concrets et exclusions |
| `/faq/` | questions fréquentes | réponses validées, sans duplications artificielles |
| `/contact/` | obtenir de l'aide | contacts et périmètres |
| `/conditions-generales/` | contrat | version juridique validée |
| `/reglement-interieur/` | règles club | version juridique validée |
| `/confidentialite/` | RGPD | responsable, droits, durées et sous-traitants |
| `/mentions-legales/` | éditeur/hébergeur | faits légaux vérifiés |

Ne pas créer de pages synonymes minces uniquement pour capter des mots-clés.

## 4. Routes privées cibles

```text
/app/connexion/
/app/inscription/
/app/verification/
/app/tableau-de-bord/
/app/reserver/
/app/reservations/
/app/reservations/[id]/
/app/avoirs/
/app/documents/
/app/acces/
/app/profil/

/admin/club/
/admin/club/planning/
/admin/club/reservations/
/admin/reseau/
/admin/reseau/coachs/
/admin/reseau/parametres/
/admin/reseau/acces/
/admin/reseau/audit/
```

Ces routes ne doivent jamais être considérées comme une stratégie SEO.

## 5. Destination canonique de chaque intention

- un club = une page club canonique ;
- la grille interactive peut apparaître sur une page club, mais ses filtres ne créent pas d'URLs crawlables infinies ;
- les paramètres de date, espace et heure restent privés ou `noindex` ;
- le contenu général des tarifs vit sur `/tarifs/`, les pages club ne répètent qu'un résumé ;
- la règle d'annulation possède une page centrale, référencée depuis les parcours ;
- FAQ structurée seulement si les questions et réponses sont visibles et approuvées.

## 6. Données structurées

Selon les faits disponibles et validés :

- `Organization` pour l'entité éditrice ;
- `WebSite` pour le site ;
- `Service` pour la location d'espace de coaching ;
- `BreadcrumbList` sur les pages internes ;
- `FAQPage` uniquement pour une FAQ visible ;
- `LocalBusiness` ou sous-type pertinent uniquement avec l'adresse, le téléphone, les horaires et l'entité exacts vérifiés.

Ne pas inventer : notes, avis, nombre d'avis, disponibilité, stock, offres ou données locales.

## 7. Métadonnées par page

Chaque route publique doit avoir :

- un `title` propre ;
- une description propre ;
- un seul H1 ;
- un canonical HTTPS absolu ;
- Open Graph et image pertinente ;
- alternates linguistiques seulement si de vraies versions existent ;
- fil d'Ariane visible ;
- liens HTML crawlables vers les routes importantes.

## 8. Sitemap et robots

- sitemap XML avec uniquement les routes publiques canoniques ;
- exclusion des paramètres et routes privées ;
- `robots.txt` ne remplace pas l'authentification ;
- `/app/`, `/admin/`, callbacks et APIs restent `noindex` via réponse/entête adapté ;
- le passage du prototype à l'indexation doit être une décision explicite et vérifiée après déploiement.

## 9. Contenu des pages club

Chaque page club doit être alimentée par des faits approuvés :

- nom officiel ;
- adresse ;
- photos autorisées ;
- description réellement propre au club ;
- espaces ;
- matériel ;
- vestiaires/douches ;
- accessibilité PMR vérifiée ;
- transports ;
- stationnement ;
- affluence ;
- horaires ;
- règles particulières ;
- planificateur du club ;
- procédure d'accès.

Les informations non confirmées restent absentes ou marquées à compléter dans le CMS, jamais publiées comme faits.

## 10. Performance et images

- formats WebP/AVIF adaptés ;
- `srcset` et tailles explicites ;
- hero préchargé uniquement si nécessaire ;
- images sous la ligne de flottaison en lazy-loading ;
- polices locales et subsets ;
- JavaScript minimal sur les pages de contenu ;
- interaction de planning chargée sans bloquer le rendu principal ;
- seuils de performance testés sur mobile réel.

## 11. Accessibilité

- navigation clavier complète ;
- focus visible ;
- contraste conforme ;
- libellés et erreurs de formulaire explicites ;
- statut de réservation annoncé aux technologies d'assistance ;
- créneaux non disponibles compréhensibles autrement que par la couleur ;
- modal avec focus piégé et retour au déclencheur ;
- réduction de mouvement respectée ;
- QR accompagné d'un texte d'état et d'une procédure d'assistance.

## 12. Mesure et consentement

Décisions nécessaires :

- outil analytics ;
- événements utiles : vue club, ouverture planning, début inscription, paiement commencé, réservation confirmée ;
- exclusion de toute donnée personnelle dans les URLs et événements ;
- consentement selon les traceurs réellement utilisés ;
- Search Console et Bing Webmaster après décision d'indexation ;
- tableau de bord séparant acquisition, conversion, réservations et incidents d'accès.

## 13. Migration depuis le prototype

1. garder le prototype comme référence UX, pas comme architecture ;
2. extraire le contenu dans des modèles structurés ;
3. créer les routes publiques réelles ;
4. déplacer le planning et les espaces privés sous `/app/` ;
5. ajouter les métadonnées et données structurées par page ;
6. ajouter sitemap, robots et audit automatique ;
7. valider mobile, accessibilité, liens, canonicals et absence de fuite privée ;
8. décider explicitement de l'indexation au lancement.

## 14. Critères d'acceptation SEO

- chaque URL publique répond directement en HTML utile sans JavaScript ;
- aucune route privée n'est indexable ;
- aucune page club n'est dupliquée ou générique ;
- tous les canonicals pointent vers le domaine de production validé ;
- sitemap et navigation contiennent les mêmes destinations canoniques ;
- données structurées valides et factuelles ;
- aucun statut de réservation, email, coach, QR ou paiement n'apparaît dans le HTML public ;
- audit technique, recherche de contenu dupliqué et inspection mobile réussis avant lancement.
