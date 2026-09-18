> # ⛔ DOCUMENT DÉCLASSÉ — 18 septembre 2026
>
> **Ce fichier n'est plus un contrat. Ne codez pas contre lui.**
>
> Décision lot C (Junior), 18 septembre 2026 : le contrat qui fait foi est
> [`CAHIER-API.md`](./CAHIER-API.md), doublé par [`openapi.yaml`](./openapi.yaml).
>
> Le conflit concret qui a motivé la décision : le §5 ci-dessous décrit une machine à états
> `DRAFT → HELD → PAYMENT_PENDING → PAID → DOCUMENTS_PENDING → ACCESS_PROVISIONING →
> CONFIRMED → ACCESS_ACTIVE → CONSUMED`, alors que le cahier d'API décrit
> `held → awaiting_signature → confirmed → consumed`. **Ce ne sont pas les mêmes états.**
> Trois lots lisant deux vérités, c'est une panne d'intégration programmée.
>
> Ce document reste consultable comme **intention produit** et comme trace de la
> compréhension initiale. Aucune ligne de code, aucun champ, aucun statut ne doit en être tiré.

# Dossier maître du projet — Boxing Center Coachs

Statut du document : compréhension fonctionnelle et technique de référence.

Date : 16 septembre 2026.

## 1. La vérité sur l'état actuel

Le code présent dans ce dossier est un **prototype d'interface**, pas la plateforme terminée.

Il démontre visuellement :

- le choix d'un club, d'un espace, d'une date et d'un créneau ;
- les tarifs heures creuses / heures pleines ;
- la capacité et les blocages décrits dans le cahier des charges ;
- un parcours de paiement, de signature et de QR simulé ;
- un aperçu d'espace coach, de vue responsable et de vue direction.

Il ne possède aujourd'hui :

- ni backend de production ;
- ni base de données partagée ;
- ni authentification réelle ;
- ni paiement réel ;
- ni signature électronique probante ;
- ni email transactionnel ;
- ni connexion Deciplus ;
- ni badge, Decipass ou ticket d'accès réel ;
- ni système de réservation concurrente ;
- ni véritable architecture multi-page indexable.

Les données vivent dans `localStorage`. Les statuts `paid-demo`, `signed-demo` et `scheduled-demo` sont des démonstrations locales. Ils n'ont aucune valeur opérationnelle.

La plateforme ne doit donc pas être décrite comme « finie » ou « prête pour la production ».

### Référence « Box Plus »

Aucun dossier local nommé Box Plus/BoxPlus n'a été trouvé dans l'espace Boxing Center inspecté. La recherche publique n'a pas permis d'identifier avec certitude le produit de réservation auquel « Box Plus » fait référence ; les principaux résultats portant ce nom concernent d'autres secteurs. Il ne serait donc pas honnête de prétendre avoir reproduit ses interactions.

À la prochaine phase, il faut fournir l'URL exacte, une capture ou le chemin du projet Box Plus. Cette référence devra alors être auditée écran par écran : inscription, réservation, paiement, états de chargement, erreurs, confirmation, espace membre, notifications et administration. Les comportements retenus devront être documentés comme mécanismes, pas copiés aveuglément.

## 2. Compréhension du produit

Boxing Center Coachs doit être une plateforme distincte permettant à un coach indépendant de louer pendant une heure une zone précise d'un club Boxing Center pour encadrer son propre client.

La plateforme est composée de quatre produits reliés :

1. **Un site public multi-page** : présenter le service et chaque club, répondre aux questions et acquérir des coachs depuis les moteurs de recherche.
2. **Une application coach privée** : profil professionnel, réservation, paiement, documents, avoirs et accès.
3. **Un back-office club** : planning et réservations du club uniquement, sans fuite des données des autres salles.
4. **Un back-office direction** : pilotage réseau, prix, capacités, comptes, accès, paiements, documents, exports et audit.

Le projet n'est pas une simple landing page et ne doit pas rester une SPA à ancres. Les pages publiques doivent posséder de vraies URL rendues côté serveur ou statiquement, tandis que les écrans privés doivent être authentifiés et `noindex`.

## 3. Contrat métier fondamental

Une réservation n'est réellement confirmée que lorsque les conditions suivantes sont toutes vraies :

1. le coach est authentifié ;
2. son compte est autorisé et non suspendu ;
3. les justificatifs professionnels obligatoires ont le statut requis ;
4. le créneau existe et reste disponible ;
5. la capacité de l'espace n'est pas dépassée ;
6. la limite de réservations actives du coach n'est pas dépassée ;
7. le montant a été calculé par le serveur ;
8. le prestataire de paiement a confirmé le paiement via un webhook authentifié ;
9. les versions requises des documents ont été signées ;
10. le droit d'accès Deciplus a été provisionné et vérifié.

Un succès affiché par le navigateur ne suffit jamais. Le serveur doit être la source de vérité.

## 4. Règles de réservation comprises

- créneaux d'une heure, du lundi au samedi ;
- première heure : 10 h ; dernière heure : 18 h–19 h ;
- 10 € à 10 h, 11 h, 14 h, 15 h et 16 h ;
- 15 € à 12 h, 13 h, 17 h et 18 h ;
- capacité générale : deux réservations simultanées par club et par espace ;
- limite générale : trois réservations futures actives par coach ;
- mercredi et samedi, 15 h et 16 h bloqués par défaut pour la boxe éducative ;
- Portet doit posséder ses propres règles enfants paramétrables ;
- États-Unis possède trois espaces distincts : Boxe, MMA/Sol, Fitness ;
- Portet possède deux espaces distincts : Boxe/Fitness, MMA/Sol ;
- annulation à plus de 24 heures : pas de remboursement automatique, création d'un avoir ;
- annulation à moins de 24 heures : refus, sauf action administrative exceptionnelle et auditée ;
- prix, capacités, limite coach et blocages doivent être paramétrables par les rôles autorisés.

## 5. Cycle de vie cible d'une réservation

États recommandés :

```text
DRAFT
  -> HELD
  -> PAYMENT_PENDING
  -> PAID
  -> DOCUMENTS_PENDING
  -> ACCESS_PROVISIONING
  -> CONFIRMED
  -> ACCESS_ACTIVE
  -> CONSUMED
```

Branches d'échec ou de sortie :

```text
HELD -> EXPIRED
PAYMENT_PENDING -> PAYMENT_FAILED
PAID -> DOCUMENTS_EXPIRED
ACCESS_PROVISIONING -> ACCESS_FAILED
CONFIRMED -> CANCELLED_CREDITED
CONFIRMED -> CANCELLED_LATE
CONFIRMED -> REVOKED
```

Règles importantes :

- `HELD` doit expirer rapidement afin de ne pas bloquer un créneau abandonné ;
- les événements de paiement, signature et Deciplus doivent être idempotents ;
- `PAID` ne veut pas dire `CONFIRMED` si la signature ou l'accès manque ;
- `ACCESS_FAILED` doit déclencher une intervention, pas un faux message de réussite ;
- chaque transition doit être enregistrée dans un journal d'audit.

## 6. Identité du coach

Le compte coach doit contenir au minimum :

- prénom et nom ;
- date de naissance ;
- téléphone et email vérifiés ;
- adresse ;
- photo ;
- diplôme et justificatifs ;
- disciplines ;
- statut du compte ;
- consentements et versions acceptées ;
- identifiant membre Deciplus ;
- statut du moyen d'accès Deciplus ;
- références externes de paiement et de signature, jamais les secrets eux-mêmes.

États de compte proposés :

```text
PENDING_EMAIL
PENDING_REVIEW
ACTIVE
SUSPENDED
REJECTED
DELETED
```

Il faut décider si la vérification des diplômes est automatique, manuelle ou mixte. Par défaut, une validation manuelle par Boxing Center est plus sûre avant la première réservation.

## 7. Accès physique et QR

Le contrôle d'accès est une partie centrale du produit, pas une image générée sur le site.

Le modèle exigé est :

1. créer ou retrouver la fiche membre Deciplus du coach ;
2. y associer un moyen d'accès numérique, sans badge physique si ce n'est pas nécessaire ;
3. créer pour chaque réservation un droit limité au club réservé ;
4. ouvrir ce droit cinq minutes avant le créneau ;
5. le fermer exactement à la fin du créneau ;
6. refuser le même QR dans les autres clubs ;
7. révoquer le droit en cas d'annulation, suspension ou incident ;
8. synchroniser et conserver les journaux d'accès et de refus.

La spécification détaillée se trouve dans [`DECIPLUS-ACCESS-CONTRACT.md`](./DECIPLUS-ACCESS-CONTRACT.md).

## 8. Architecture multi-page et référencement

Le prototype actuel ne satisfait pas le besoin SEO parce que son contenu public est concentré dans `index.html` et piloté par JavaScript.

La version cible doit séparer :

- les pages publiques indexables ;
- l'application coach privée ;
- les back-offices privés ;
- les callbacks et webhooks techniques.

La carte des routes, les responsabilités SEO et les règles d'indexation sont détaillées dans [`SEO-INFORMATION-ARCHITECTURE.md`](./SEO-INFORMATION-ARCHITECTURE.md).

Le choix final de rendre le site indexable appartient au propriétaire du projet. L'application privée, les comptes, les réservations, les paiements, les QR et les back-offices restent toujours `noindex`.

## 9. Architecture technique recommandée

### Frontend

- framework TypeScript avec rendu serveur ou génération statique pour les pages publiques ;
- application authentifiée pour les espaces privés ;
- composants accessibles et responsive ;
- formulaires utilisables au clavier et avec lecteur d'écran ;
- aucune règle métier de sécurité exclusivement côté navigateur.

### Backend

- API TypeScript séparant clairement domaine et prestataires ;
- PostgreSQL ;
- transactions et verrouillage lors de la réservation ;
- file de tâches persistante pour les traitements externes ;
- stockage objet privé pour justificatifs et documents signés ;
- observabilité, alertes et audit immuable ;
- tâches planifiées pour activation, vérification et révocation des accès.

### Adaptateurs externes

```text
PaymentProvider
SignatureProvider
EmailProvider
DeciplusProvider
StorageProvider
```

Le domaine métier ne doit pas dépendre directement des formats d'un prestataire. Cela permet de tester les règles sans appeler PayPlug ou Deciplus et de remplacer un fournisseur sans reconstruire toute l'application.

## 10. Modèle de données minimum

Tables ou agrégats :

- `users` ;
- `coach_profiles` ;
- `coach_documents` ;
- `clubs` ;
- `spaces` ;
- `slot_templates` ;
- `slot_blocks` ;
- `reservations` ;
- `reservation_holds` ;
- `payments` ;
- `credits` ;
- `credit_ledger` ;
- `legal_documents` ;
- `signatures` ;
- `deciplus_members` ;
- `access_credentials` ;
- `access_grants` ;
- `access_events` ;
- `notifications` ;
- `audit_events` ;
- `idempotency_keys`.

Contraintes importantes :

- argent stocké en centimes entiers ;
- toutes les dates métier stockées en UTC avec timezone d'affichage `Europe/Paris` ;
- identifiants publics opaques ;
- pas de numéro de carte bancaire dans la base ;
- pas de QR brut ni de secret sensible dans les logs ;
- les références Deciplus doivent être uniques et traçables ;
- la capacité doit être contrôlée transactionnellement, pas avec un simple compteur client.

## 11. Paiement

Le prestataire reste à décider : PayPlug, PayPal ou autre solution approuvée.

Flux recommandé :

1. le serveur recalcule le prix ;
2. il crée un `HELD` avec expiration ;
3. il crée une intention de paiement avec une clé d'idempotence ;
4. le coach paie sur la surface sécurisée du prestataire ;
5. le webhook signé fait foi ;
6. le serveur passe la réservation à `PAID` ;
7. un timeout réseau reste `UNKNOWN` jusqu'à réconciliation ;
8. aucun double débit ni double avoir n'est possible.

Un avoir est un registre comptable, pas seulement un nombre modifiable dans le profil.

## 12. Signature électronique

Il faut obtenir et versionner :

- CGV ;
- règlement intérieur ;
- décharge de responsabilité ;
- politique de confidentialité et consentements nécessaires ;
- tout document futur attaché à une version.

Le système doit conserver : identité du signataire, version du document, empreinte du fichier, date, preuve du consentement, référence prestataire et preuve exportable.

Un clic sur une case dans le prototype n'est pas une signature juridiquement probante.

## 13. Notifications

Les événements ne doivent pas être envoyés directement dans la transaction de réservation. Une file de tâches doit gérer :

- vérification email ;
- paiement reçu ou échoué ;
- documents à signer ;
- réservation confirmée ;
- accès prêt ;
- rappel avant séance ;
- annulation et avoir ;
- échec Deciplus ;
- tentative d'accès hors créneau ;
- rapports direction.

Chaque notification doit posséder un statut `queued`, `sent`, `delivered`, `failed` ou `unknown` quand le fournisseur ne confirme pas la livraison.

## 14. Permissions

### Coach

Voit uniquement son profil, ses paiements, ses documents, ses réservations, ses avoirs et ses accès.

### Responsable de salle

Voit et gère uniquement son club et les espaces autorisés. Il ne peut pas lire les données des autres clubs ni modifier les paramètres réseau.

### Direction

Vue réseau, configuration, suspension, exports, statistiques et audit.

### Support technique

Rôle séparé recommandé, sans accès financier inutile, pour diagnostiquer les intégrations et rejouer une tâche idempotente.

## 15. Sécurité

- cookies de session `HttpOnly`, `Secure`, `SameSite` ;
- MFA obligatoire pour direction et responsables ;
- contrôle d'autorisation côté serveur sur chaque requête ;
- limitation de débit et protection contre l'énumération ;
- chiffrement des données sensibles et des fichiers ;
- analyse antivirus des documents uploadés ;
- validation des webhooks par signature ;
- clés externes dans un gestionnaire de secrets ;
- journaux sans secrets, mots de passe, QR ou pièces personnelles ;
- politique de révocation d'urgence ;
- sauvegardes et tests de restauration ;
- procédure de réponse aux incidents.

## 16. RGPD

À faire valider par un conseil compétent :

- responsable de traitement ;
- finalités et bases légales ;
- sous-traitants ;
- durées par catégorie ;
- traitement des justificatifs professionnels ;
- accès, rectification, suppression, limitation et export ;
- sort des comptes Deciplus après suppression ;
- contrats de sous-traitance ;
- transferts hors UE ;
- registre et analyse d'impact si nécessaire.

## 17. Tests d'acceptation indispensables

### Réservation

- deux coachs peuvent réserver le même espace, le troisième est refusé ;
- deux espaces du même club conservent des capacités indépendantes ;
- deux tentatives simultanées ne dépassent jamais la capacité ;
- le quatrième créneau actif d'un coach est refusé ;
- les blocages enfants fonctionnent et Portet peut déroger ;
- le prix serveur ne peut pas être modifié depuis le navigateur.

### Paiement et signature

- webhook dupliqué sans double effet ;
- paiement réussi avec réponse navigateur perdue ;
- paiement refusé ;
- document remplacé par une nouvelle version ;
- signature manquante bloque la confirmation.

### Accès

- QR accepté dans le bon club entre H-5 et l'heure de fin ;
- QR refusé avant, après et dans les quatre autres clubs ;
- annulation révoque l'accès ;
- suspension révoque tous les accès futurs ;
- screenshot ou QR expiré refusé ;
- accès déjà utilisé suit la règle définie avec Deciplus ;
- panne Deciplus produit une alerte et un statut honnête ;
- les logs Deciplus se réconcilient avec la réservation.

### Permissions et sécurité

- un responsable ne peut jamais lire un autre club, même en modifiant l'URL ;
- un coach ne peut pas charger la réservation d'un autre ;
- les routes privées sont absentes du sitemap et portent `noindex` ;
- les documents privés ne sont pas accessibles avec une URL permanente publique.

## 18. Dépendances et décisions encore requises

### Boxing Center

- domaine et nom final du service ;
- adresses, transports et données officielles de chaque club ;
- capacités réelles par espace ;
- règles enfants de Portet ;
- horaires d'ouverture et exceptions ;
- politique de validation des coachs ;
- CGV, règlement, décharge et RGPD ;
- prestataires paiement, signature et email ;
- politique d'avoir et d'exception ;
- droits sur toutes les photos ;
- personnes responsables et escalades.

### Xplor Deciplus

- contrat et modules actifs par club ;
- présence d'une Decibox et d'un lecteur QR compatible dans les cinq clubs ;
- API/SDK/webhooks disponibles pour créer une fiche membre ;
- API pour offrir/activer un Decipass ou créer un ticket d'accès ;
- moyen de limiter le droit par club et par heure ;
- comportement multisite ;
- délai de synchronisation ;
- révocation et retour d'état ;
- récupération des logs ;
- environnement de test ;
- quotas, coûts, SLA et support.

## 19. Plan de réalisation

### Phase 0 — Décisions et preuve Deciplus

- atelier avec Xplor Deciplus ;
- inventaire matériel des cinq clubs ;
- preuve de concept sur un club et un compte de test ;
- validation du choix Decipass ou ticket d'accès ;
- test de la fenêtre H-5 / heure de fin ;
- test de révocation.

### Phase 1 — Fondations

- nouveau projet production TypeScript ;
- base de données, authentification, rôles, audit ;
- CMS ou contenu structuré pour les pages publiques ;
- vraie architecture multi-page.

### Phase 2 — Réservation

- planning, capacité transactionnelle, blocages et limites ;
- back-offices club/direction ;
- tests de concurrence.

### Phase 3 — Paiement et documents

- paiement bac à sable et webhooks ;
- ledger d'avoirs ;
- signature et archivage ;
- emails transactionnels.

### Phase 4 — Accès

- fiche membre Deciplus ;
- moyen d'accès ;
- droits temporaires ;
- QR réel ;
- activation/révocation ;
- logs et alertes.

### Phase 5 — Qualité et lancement

- tests end-to-end dans les cinq clubs ;
- sécurité, RGPD, accessibilité et charge ;
- SEO, contenu, redirections, sitemap et données structurées ;
- reprise sur panne et exploitation ;
- décision explicite d'indexation et déploiement.

## 20. Critère de fin réel

Le projet est terminé seulement quand :

- toutes les pages publiques prévues sont de vraies routes validées ;
- les données et faits locaux sont approuvés ;
- la réservation résiste à la concurrence ;
- paiement et signature sont réellement intégrés ;
- Deciplus crée, limite, active et révoque réellement les accès ;
- le QR est testé physiquement dans chaque club ;
- les rôles et le RGPD sont validés ;
- les alertes et procédures d'incident existent ;
- les tests de production passent ;
- le propriétaire décide que le site peut être indexé et lancé.

Le prototype actuel n'atteint pas encore ces critères.
