# Décisions du lot C — journal

Chaque entrée dit **qui a tranché**, **sur quelle source**, et **ce que ça coûte de revenir dessus**.
Une décision sans source est une opinion ; elle n'a pas sa place ici.

---

## D-C01 — Le contrat qui fait foi est `CAHIER-API.md` + `openapi.yaml`

**Tranché par :** Junior, 18 septembre 2026 — « go with the API contract, API book ».

`MASTER-PROJECT-SPEC.md` est déclassé et porte une bannière. Il décrivait une machine à états
en neuf états (`DRAFT`, `PAYMENT_PENDING`, `ACCESS_PROVISIONING`…) incompatible avec les huit
statuts de `openapi.yaml`. Deux vérités pour trois lots = panne d'intégration garantie.

Le passage par la signature est confirmé : `held → awaiting_signature → confirmed → consumed`.
Aucune réservation ne devient `confirmed` sans `payment_status ∈ {paid, waived_credit}`
**et** `signature_status = signed`. Le cahier des charges §16 le dit aussi : « Après paiement,
et avant confirmation définitive de l'accès, le coach devra obligatoirement signer ».

---

## D-C02 — Un coach suspendu est bloqué sur *toutes* les écritures, annulation comprise

**Tranché par :** Junior, 18 septembre 2026 — « if a coach is suspended, then he's suspended,
he can't do shit ». Conforme à `CAHIER-API.md` §1.1.

`403 SUSPENDED` sur hold, checkout, signature **et** annulation.

**Conséquence assumée, à outiller :** un coach suspendu qui détient des créneaux payés ne peut
ni les utiliser ni les rendre. La direction doit pouvoir annuler **à sa place** depuis le
back-office. Ce n'est pas une exception à la règle, c'est la contrepartie obligatoire :
sans elle, l'argent du coach est gelé sans recours. L'action est auditée.

---

## D-C03 — Avoirs : solde qui décrémente, pas jeton à usage unique

**Tranché sur pièces**, arbitrage D-C01.

Les deux sources divergent :
- Cahier des charges §15 : « attribution d'un crédit / avoir utilisable pour réserver **un
  nouveau créneau** » → se lit « un avoir = une réservation », donc consommation entière.
- `CAHIER-API.md` §3.6 : `amount_cents` int **« (reste) »** → se lit « solde qui décrémente ».

Le contrat d'API l'emporte (D-C01) : **un avoir de 15 € utilisé sur un créneau à 10 € laisse 5 €.**
C'est aussi la lecture qui ne fait perdre d'argent à personne.

**Revenir dessus coûte :** une migration et une reprise des lignes existantes. À trancher
définitivement **avant** le premier avoir réel.

---

## D-C04 — Les avoirs n'expirent pas (en v1)

**Source : aucune.** Ni le cahier des charges, ni `CAHIER-API.md` ne fixent de durée. Junior,
18 septembre 2026 : « I believe that they might expire or not » — l'information n'existe pas.

`coach_credits.status` contient `expired`, mais aucune colonne ne le rend atteignable.
On pose `expires_at timestamptz null` = jamais. Le statut `expired` devient une action manuelle
et auditée de la direction.

**C'est une position commerciale, pas technique.** Elle appartient à la direction Boxing Center.
La colonne existe : poser une durée de 12 ou 24 mois plus tard coûte un `UPDATE`, pas une migration.

---

## D-C05 — `club_id` fait partie de toute clé de créneau

**Tranché sur défaut trouvé**, 18 septembre 2026. Corrige une erreur de `CAHIER-API.md` §3.5.

Le cahier écrit la clé de capacité `(space_id, starts_at)`. Or `space_id = 'salle'` existe à
**Minimes, St-Cyprien et Ramonville**. Appliquée littéralement, cette clé aurait fait partager
une capacité de 2 **entre trois clubs** : au plus deux coachs sur l'ensemble du réseau à 11h.

Toute clé, tout index unique, tout prédicat de comptage porte donc `(club_id, space_id, starts_at)`.
Six occurrences corrigées : deux index uniques, deux index de service, la contrainte d'unicité
des blocages datés, et trois prédicats dans `coach_create_hold`.

**Aucun impact sur le contrat HTTP** : les payloads ne changent pas. Seule la ligne §3.5 du
cahier doit être corrigée.

---

## D-C06 — Le `SELECT … FOR UPDATE` du cahier §6 est inapplicable

**Tranché sur pièces.** Les créneaux sont **virtuels** : engendrés depuis `coach_slot_templates`,
aucune ligne « 22/09 11h MMA-Sol Portet » n'existe. Il n'y a rien à verrouiller.

Remplacé par une combinaison qui fait deux travaux différents :
- une colonne `seat` + un **index unique partiel** `(club_id, space_id, starts_at, seat)` filtré
  sur les statuts actifs — transforme « au plus 2 » en « au plus 1 par siège », ce qu'un index
  sait exprimer. C'est le dernier mur : il tient même contre un `INSERT` direct en `service_role` ;
- un **`pg_advisory_xact_lock`** par (espace, heure) — crée le point de rendez-vous qui manque,
  pour que le second demandeur obtienne un `SLOT_FULL` propre plutôt qu'une violation d'unicité.

Un trigger qui compte aurait été **faux** : en `READ COMMITTED`, deux transactions concurrentes
comptent toutes les deux `1 < 2` et insèrent toutes les deux.

---

## D-C07 — Vercel Pro : cron à la minute disponible, mais l'expiration ne dépend pas de lui

**Tranché par :** Junior, 18 septembre 2026 — le compte distant est en **Pro**.

Le plan Hobby plafonne les crons à un par jour ; Pro lève la contrainte. Le cron d'expiration
des holds tourne donc à la minute.

**Mais la règle métier ne repose pas dessus.** Un hold dont `hold_expires_at < now()` est traité
comme expiré **à la lecture**, en SQL, que le cron soit passé ou non. Le cron ne fait que
matérialiser l'état pour l'affichage et les statistiques.

Conséquence : un cron mort dégrade la fraîcheur du back-office, il ne libère jamais un créneau
à tort et ne vend jamais deux fois le même siège. Un système dont la correction dépend d'un
cron est un système qui casse le jour où le cron casse.

---

## D-C08 — La décision D1 de `.research/decisions.md` est annulée

Le générateur statique maison (`src/site/build.mjs`) est remplacé par Next.js 16.3.
Demande de Junior du 18 septembre 2026. D1 avait prévu sa propre sortie : « les porter vers
Astro ou Next plus tard coûte une journée, pas une réécriture ».

Le prototype n'est pas perdu : branche `archive/v0-prototype-statique`, tag du même nom,
copie intégrale du dossier et paquet git vérifié hors du dépôt.

D2 (direction artistique), D3 (composant de réservation), D4 (mono pour la donnée),
D5 (rien qui ne soit vrai) et D6 (juridique non inventé) **restent valides**.
