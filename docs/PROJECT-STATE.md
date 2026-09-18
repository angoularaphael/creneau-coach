# État du projet — Boxing Center Coachs

Dernière mise à jour : 16 septembre 2026.

## Statut réel

**Prototype fonctionnel d'interface. Projet de production non terminé.**

Le prototype permet de parcourir un exemple de réservation et de visualiser les trois rôles. Il ne possède aucune intégration réelle et ne doit pas recevoir de vraies données personnelles ou de vrais paiements.

## Documentation canonique

Lire dans cet ordre :

1. [`CAHIER-API.md`](./CAHIER-API.md) + [`openapi.yaml`](./openapi.yaml) — **le contrat qui fait foi** entre les trois lots ;
1. ~~[`MASTER-PROJECT-SPEC.md`](./MASTER-PROJECT-SPEC.md)~~ — **déclassé le 18/09/2026**, intention produit uniquement, plus un contrat ;
2. [`DECIPLUS-ACCESS-CONTRACT.md`](./DECIPLUS-ACCESS-CONTRACT.md) — modèle badge/QR, Decipass versus ticket d'accès, cycle de vie et questions à Xplor ;
3. [`SEO-INFORMATION-ARCHITECTURE.md`](./SEO-INFORMATION-ARCHITECTURE.md) — remplacement de la page unique par une architecture publique multi-page ;
4. le cahier des charges PDF à la racine — source métier initiale.

## Ce qui existe dans le code

- page publique responsive actuellement mono-page ;
- cinq clubs et espaces particuliers d'États-Unis/Portet ;
- sélection date, espace et créneau ;
- règles 10 €/15 € ;
- blocages enfants, capacité 2 et limite coach 3 ;
- tunnel compte/paiement/documents/confirmation simulé ;
- faux QR clairement présenté comme démonstration ;
- vues coach, responsable St-Cyprien et direction ;
- annulation locale et avoir local ;
- export CSV local ;
- tests unitaires de certaines règles.

## Ce qui n'existe pas

- routes publiques multi-pages ;
- SEO de production ;
- domaine/canonical/sitemap validés ;
- backend, base de données et comptes réels ;
- gestion concurrente des créneaux ;
- paiements et webhooks ;
- signature probante ;
- emails ;
- intégration Deciplus ;
- création de fiche membre Deciplus ;
- badge/Decipass/ticket d'accès réel ;
- activation et révocation temporelles ;
- logs d'accès ;
- sécurité, RGPD et exploitation de production.

## Recherche Deciplus effectuée

Les sources officielles publiques ont été consultées le 16 septembre 2026.

Faits confirmés :

- le Decipass est un QR dynamique, personnel et lié à un téléphone via Xplor Active ;
- il nécessite espaces membres, Decibox et lecteur QR compatible ;
- Deciplus propose aussi un ticket d'accès QR pour les séances unitaires et cartes prépayées ;
- le ticket peut être envoyé par email, imprimé ou téléchargé ;
- ce ticket nécessite Decibox + lecteur QR, et Agence Com' pour l'email ;
- les règles publiques ne documentent pas l'API nécessaire pour automatiser notre fenêtre H-5 / fin exacte.

Conclusion : une réunion et une preuve de concept avec Xplor sont obligatoires avant d'implémenter ou de promettre le QR réel.

## Modification visuelle demandée

Le bandeau de confiance qui avait un fond vert/jaune acide utilise maintenant un fond gris clair neutre. Les marqueurs fonctionnels verts des statuts positifs n'ont pas été modifiés ; ils pourront être revus séparément si la demande porte sur toute la palette.

## Validation du prototype

Avant cette mise à jour documentaire :

- `npm test` : 6 tests réussis ;
- `npm run check` : réussi ;
- parcours navigateur accueil/réservation/confirmation/espace coach : réussi ;
- 1440 x 1000 et 390 x 844 inspectés ;
- aucune erreur console relevée ;
- aucun débordement horizontal relevé.

Après toute modification de code :

```powershell
npm test
npm run check
```

Le script navigateur `scripts/browser-qa.mjs` exige les chemins locaux vers Playwright et un navigateur Chromium.

## Prochaine action correcte

Ne pas poursuivre directement par de nouveaux écrans.

1. Valider ce dossier de compréhension avec Boxing Center.
2. Organiser l'atelier Deciplus et le test matériel d'un club.
3. Obtenir les réponses listées dans `DECIPLUS-ACCESS-CONTRACT.md`.
4. Choisir Decipass ou ticket d'accès avec Xplor.
5. Valider la carte de routes publique.
6. Repartir sur l'architecture production décrite dans le dossier maître.

## Commande locale

```powershell
npm run dev
```

URL par défaut : `http://127.0.0.1:4173/`.
