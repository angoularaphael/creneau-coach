# Contrat d'intégration Deciplus et accès QR

Date de recherche : 16 septembre 2026.

## 1. Exigence exprimée

Pour chaque coach autorisé :

- créer une fiche personnelle dans Deciplus ;
- lui associer un moyen d'accès numérique, sans badge physique si le QR suffit ;
- fournir un QR réel accepté par le lecteur du club ;
- limiter l'accès au club réservé ;
- activer l'accès cinq minutes avant le créneau ;
- désactiver l'accès à la fin exacte du créneau ;
- refuser l'accès par toute autre voie non autorisée ;
- révoquer l'accès en cas d'annulation ou de suspension ;
- conserver les événements d'acceptation et de refus.

## 2. Ce que les sources publiques Deciplus confirment

Les sources officielles publiques distinguent deux produits.

### Decipass

Le Decipass est un QR dynamique, personnel et lié à un téléphone. Il est disponible via Xplor Active. Il nécessite les espaces membres, une Decibox configurée, l'application Xplor Active et un lecteur compatible QR. Il peut être activé seulement sur certains sites. Après attribution, le membre associe son téléphone. Toute activation peut être facturée par Lodecom.

Source : [Présentation et configuration du Decipass](https://xplordeciplus.zendesk.com/hc/fr/articles/6318024704540-Pr%C3%A9sentation-et-configuration-du-Decipass-QRcode).

### Ticket d'accès

Le ticket d'accès génère un QR pour des séances unitaires ou cartes prépayées. Il vise les clients de passage pour lesquels l'application et un compte Decipass seraient trop lourds. Il nécessite le contrôle d'accès avec Decibox, un lecteur QR configuré et, pour l'envoi par email, le module Agence Com'. Le QR peut être envoyé, imprimé ou téléchargé. La génération n'est pas rétroactive et l'accès doit être créé après encaissement.

Source : [Configurer une prestation avec ticket d'accès](https://xplordeciplus.zendesk.com/hc/fr/articles/7828310365724-Configurer-et-vendre-une-prestation-avec-ticket-d-acc%C3%A8s-QRcode).

### Matériel

La documentation Decibox confirme l'existence d'un lecteur QR/badge Decipass relié au réseau, au dispositif d'ouverture et à une alimentation 12 V. Le fonctionnement dépend de la Decibox, du réseau local et de la synchronisation.

Source : [Guide technique Decibox](https://doc.deciplus.pro/decibox.pdf).

## 3. Décision produit à prendre avec Xplor

| Critère | Decipass | Ticket d'accès |
|---|---|---|
| Coach récurrent | Adapté | Possible mais potentiellement répétitif |
| Application Xplor Active | Requise | Non requise |
| QR dynamique lié au téléphone | Oui | À confirmer ; la documentation parle d'un ticket envoyé/imprimé |
| Usage séance unitaire | Possible selon prestation/droits | Cas d'usage officiel |
| Partage par capture d'écran | Mieux limité | Risque plus élevé si QR statique |
| Création d'une fiche membre | Oui | Semble utilisé depuis une fiche/vente, à confirmer |
| Limite par site | Sites activés disponibles | Multisite documenté mais règle exacte à confirmer |
| Limite à H-5 / fin | Non confirmée publiquement | Non confirmée publiquement |
| Automatisation API | Non documentée publiquement | Non documentée publiquement |

Position recommandée : **ne pas choisir avant une preuve de concept Xplor**. Le Decipass répond mieux à l'exigence « QR personnel, dynamique, non utilisable nativement », mais le ticket d'accès correspond mieux au modèle d'une séance unitaire. Il faut demander à Xplor quelle option permet réellement une autorisation par club et par fenêtre temporelle automatisable.

## 4. Point de sécurité essentiel : un QR n'est pas une sécurité en soi

Un QR est seulement une représentation visuelle de données. Une personne peut généralement saisir ou partager la valeur encodée.

Pour respecter « le lien natif ne fonctionne pas » :

- le QR doit contenir un jeton opaque ou dynamique, pas une URL prévisible ;
- le lecteur et Deciplus doivent valider le jeton en temps réel ou selon le mécanisme officiel ;
- le jeton doit être lié au coach, au club, à la réservation et à une courte fenêtre ;
- une URL copiée ne doit jamais ouvrir une porte ;
- la page web ne doit pas être la source d'autorisation physique ;
- si un QR statique est retenu, il faut accepter qu'une capture puisse être partagée ou ajouter une deuxième preuve ;
- le modèle phone-bound du Decipass est donc préférable si la contrainte anti-partage est ferme.

Le site Boxing Center ne doit pas fabriquer lui-même un QR décoratif et le présenter comme un badge Deciplus. Le QR réel doit provenir du mécanisme homologué par Xplor ou encoder un jeton que le système Deciplus/Decibox sait vérifier.

## 5. Contrat cible du connecteur

Le code métier doit appeler une interface, pas l'API Xplor directement :

```ts
interface DeciplusProvider {
  ensureMember(input: EnsureMemberInput): Promise<MemberResult>;
  ensureCredential(input: EnsureCredentialInput): Promise<CredentialResult>;
  grantAccess(input: GrantAccessInput): Promise<GrantResult>;
  getGrant(externalGrantId: string): Promise<GrantStatus>;
  revokeAccess(externalGrantId: string, reason: string): Promise<RevokeResult>;
  listAccessEvents(input: AccessEventQuery): Promise<AccessEvent[]>;
}
```

Toutes les opérations de création doivent recevoir une clé d'idempotence dérivée d'un identifiant interne stable.

## 6. Séquence cible

### Première réservation du coach

1. vérifier le compte coach ;
2. créer ou retrouver la fiche membre Deciplus ;
3. stocker le couple `coach_id` / `deciplus_member_id` ;
4. créer ou proposer le moyen d'accès choisi ;
5. attendre sa confirmation réelle ;
6. ne jamais créer plusieurs fiches lors d'une reprise réseau.

### Après paiement et signature

1. réserver définitivement le créneau ;
2. demander le droit d'accès pour le club et la fenêtre ;
3. enregistrer la réponse externe ;
4. relire le statut chez Deciplus ;
5. passer à `CONFIRMED` seulement si l'accès est prêt ;
6. notifier le coach avec les instructions exactes.

### À H-5

1. vérifier que la réservation est toujours confirmée ;
2. vérifier que le compte n'est pas suspendu ;
3. confirmer le droit actif chez Deciplus ;
4. alerter si la synchronisation n'est pas conforme.

### À la fin du créneau

1. le droit doit expirer côté Deciplus ;
2. une tâche de contrôle vérifie l'expiration ;
3. si le droit reste actif, révocation explicite et alerte critique ;
4. enregistrer l'heure réelle de révocation.

### Annulation

1. changer la réservation ;
2. révoquer immédiatement le droit ;
3. vérifier la révocation ;
4. ensuite seulement confirmer l'annulation au coach ;
5. attribuer l'avoir selon la règle des 24 heures.

## 7. Fenêtre temporelle

Pour une réservation 11 h–12 h à Toulouse :

```text
Timezone métier : Europe/Paris
Accès à partir de : 10:55:00 locale
Accès jusqu'à : 12:00:00 locale
Refus avant : 10:54:59 et antérieur
Refus après : 12:00:00 et ultérieur
```

Il faut faire confirmer par Xplor l'inclusivité exacte des bornes et le comportement hors ligne de la Decibox. Les changements heure d'été/heure d'hiver doivent être testés.

## 8. États d'accès

```text
NOT_REQUESTED
MEMBER_CREATING
MEMBER_READY
CREDENTIAL_PENDING
CREDENTIAL_READY
GRANT_PENDING
GRANT_READY
ACTIVE
EXPIRED
REVOKING
REVOKED
FAILED
UNKNOWN
```

`UNKNOWN` est obligatoire quand le résultat d'un appel externe est incertain. Ne jamais transformer automatiquement un timeout en échec définitif ni réessayer aveuglément une création.

## 9. Données à conserver

- identifiant membre Deciplus ;
- type de credential : Decipass ou ticket ;
- identifiant externe du credential ;
- identifiant du site/club ;
- identifiant de la prestation ou du droit ;
- début et fin demandés ;
- début et fin confirmés par le fournisseur ;
- état ;
- tentatives et clés d'idempotence ;
- date de dernière synchronisation ;
- motif de révocation ;
- événements d'accès normalisés.

Ne pas stocker le contenu brut du QR si ce n'est pas strictement requis et approuvé. Ne jamais l'écrire dans les logs.

## 10. Comportement de l'interface

Le coach voit :

- `Accès en préparation` tant que Deciplus n'a pas confirmé ;
- `Accès prêt` quand le moyen officiel est disponible ;
- un bouton vers Xplor Active si Decipass est retenu ;
- le ticket officiel si Xplor autorise son affichage sur notre surface ;
- les heures exactes et le club ;
- un motif honnête en cas de refus ou d'incident.

Le site ne doit pas montrer un damier ou un faux QR dans une version de production.

## 11. Questions obligatoires à Xplor Deciplus

1. Existe-t-il une API documentée pour créer/rechercher un membre ?
2. Peut-on offrir/activer un Decipass par API ?
3. Peut-on générer un ticket d'accès par API après un paiement externe ?
4. Quel mécanisme correspond au modèle coach récurrent + réservations unitaires ?
5. Comment limiter l'accès à un seul site ?
6. Comment imposer H-5 jusqu'à l'heure de fin exacte ?
7. La limite est-elle portée par une prestation, une réservation ou une règle de lecteur ?
8. Le QR est-il dynamique, rotatif, one-time ou statique ?
9. Un screenshot fonctionne-t-il ?
10. Peut-on empêcher tout autre moyen d'accès sur cette fiche membre ?
11. Quels webhooks signalent création, consommation, refus, expiration et révocation ?
12. Comment récupérer les logs d'ouverture ?
13. Comment révoquer immédiatement ?
14. Que se passe-t-il quand la Decibox est hors ligne ?
15. Quel est le délai de synchronisation maximal ?
16. Les cinq clubs ont-ils chacun leur propre identifiant et lecteur ?
17. Existe-t-il un bac à sable et du matériel de test ?
18. Quels modules, coûts, quotas et SLA s'appliquent ?
19. Qui assure la responsabilité du câblage et de la solution d'ouverture de secours ?
20. Quelle procédure support doit être utilisée pendant un créneau réel ?

## 12. Preuve de concept requise

Avant de développer l'intégration complète :

1. choisir un club pilote ;
2. confirmer Decibox + lecteur QR ;
3. créer une fiche coach de test ;
4. créer le moyen d'accès sans badge physique ;
5. limiter le droit à ce club ;
6. limiter à une fenêtre de 65 minutes ;
7. scanner avant, pendant et après ;
8. tester dans un autre club ;
9. annuler et vérifier la révocation ;
10. couper le réseau et documenter le comportement ;
11. récupérer les logs ;
12. obtenir la validation écrite de Xplor et de Boxing Center.

Sans cette preuve, aucune promesse de « QR réel » ne doit être faite.
