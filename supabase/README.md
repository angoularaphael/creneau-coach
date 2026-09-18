# Base de données — lot C (Junior)

Projet Supabase : `zpkdveyhcmxlkhuoudfr`. Tables `coach_*`. **Pas** BOXPLUS. Eddy n’a pas de lot ici.

Coller **`all.sql`** dans le SQL Editor reste valable pour un premier jet. Le moteur complet est la série `0000`–`0017` via `node scripts/db-migrate.mjs`.

# Base de données — lot C

Schéma Postgres du projet : tables `coach_*`, invariants de capacité, fonctions
métier, matrice RLS, vues staff, audit append-only, seed.

**Cible :** Postgres 17 / Supabase. **Développement :** Postgres 17 local.
**Contrats :** `docs/CAHIER-API.md`, `docs/openapi.yaml`, `src/domain/contrat.ts`.

---

## Démarrer

```bash
node scripts/db-migrate.mjs --reset            # base de développement, repart de zéro
node scripts/db-migrate.mjs --reset --test     # base de test
node scripts/db-migrate.mjs --dry              # liste sans appliquer
node scripts/db-migrate.mjs --url <dsn>        # Supabase, préproduction
```

Chaque migration tourne dans **sa** transaction : une migration qui échoue est
annulée entièrement et n'est pas enregistrée. Une migration déjà appliquée est
**immuable** — le runner compare son empreinte et refuse de continuer si le
fichier a changé. Pour corriger, on écrit une nouvelle migration.

### Les bases locales doivent être en UTF8

Sur une installation Windows française ou anglaise, `initdb` crée les bases en
**WIN1252**, alors que Supabase est en **UTF8**. Une base WIN1252 rejette tout
caractère hors Latin-1 et fait échouer les migrations. À créer ainsi :

```sql
create database creneau_coach_dev  with template template0 encoding 'UTF8'
  locale_provider = 'builtin' builtin_locale = 'C.UTF-8';
create database creneau_coach_test with template template0 encoding 'UTF8'
  locale_provider = 'builtin' builtin_locale = 'C.UTF-8';
```

Vérifier : `select datname, pg_encoding_to_char(encoding) from pg_database;`

---

## Les migrations

| Fichier | Contenu |
|---|---|
| `0000_compat_supabase.sql` | Schéma `auth`, `auth.users`, `auth.uid()/jwt()/role()`, rôles `anon`/`authenticated`/`service_role`. **Entièrement conditionnel** : sur un vrai Supabase, ne fait rien. |
| `0001_extensions_et_types.sql` | Enums, fonctions de fuseau, `coach_role()`, `coach_club()`, `coach_err()`. |
| `0002_referentiel.sql` | Clubs, espaces, créneaux types, tarifs, blocages, réglages. |
| `0003_profils.sql` | `coach_profiles`. |
| `0004_reservations.sql` | `coach_reservations` + les deux invariants durs. |
| `0005_credits.sql` | `coach_credits`, FK circulaire, `coach_credit_balance()`. |
| `0006_documents_signatures.sql` | Documents, signatures, jobs Deciplus, bus d'événements. |
| `0007_idempotence.sql` | `coach_idempotency_keys` + bail. |
| `0008_rate_limit.sql` | Fenêtre glissante en Postgres. |
| `0009_audit.sql` | `coach_audit_logs` append-only. |
| `0010_fonction_hold.sql` | `coach_create_hold()`. |
| `0011_fonction_cancel.sql` | `coach_cancel_reservation()`. |
| `0012_fonctions_crons.sql` | Expiration, consommation, purges. pg_cron conditionnel. |
| `0013_rls.sql` | Toute la matrice du cahier §12. |
| `0014_vues_staff.sql` | Vues staff et publique. |
| `0015_seed.sql` | Référentiel + garde-fous de comptage. |

---

## Les six choses à comprendre avant de toucher à ce schéma

### 1. Les créneaux sont virtuels

Il n'existe **aucune ligne** « 22/09 11h MMA-Sol Portet ». Les créneaux sont
engendrés depuis `coach_slot_templates`. Le `SELECT … FOR UPDATE` du cahier §6.6
n'a donc rien à verrouiller : **c'est une erreur du cahier**, remplacée ici par un
verrou consultatif.

### 2. La capacité tient sur deux pièces qui ne font pas le même travail

- **`seat` + index unique partiel** `(club_id, space_id, starts_at, seat)` — le
  dernier mur. Il rend l'état invalide **impossible à écrire**, y compris par un
  `INSERT` direct en `service_role`. Un index unique ne sait pas dire « au plus
  N » ; il sait dire « au plus 1 par siège ».
- **`pg_advisory_xact_lock(lock_key, heure)`** — le point de rendez-vous. Sans
  lui, deux requêtes sur le dernier siège finissent en `unique_violation` ; avec
  lui, la seconde attend, recompte, et renvoie un vrai `SLOT_FULL`.

> `club_id` fait partie de la clé. `space_id = 'salle'` existe à Minimes,
> St-Cyprien **et** Ramonville : sans `club_id`, la capacité de 2 serait partagée
> entre les trois salles. Le cahier §3.5 écrit `(space_id, starts_at)` — corrigé ici.

Un hold qui expire passe à `expired`, une annulation à `cancelled_credit` : la
ligne **sort du prédicat partiel**, donc le siège se libère seul. Aucun `DELETE`,
historique complet.

### 3. L'ordre de verrouillage, et pourquoi il n'est pas négociable

1. `coach_profiles` du coach (`FOR UPDATE`)
2. le verrou consultatif du créneau
3. la ligne `coach_reservations` s'il y a lieu

**`coach_idempotency_keys.coach_id` a une clé étrangère vers `coach_profiles`.**
Un `INSERT` y prend donc un `FOR KEY SHARE` (partagé) sur la ligne de profil. Si
cet `INSERT` précède le `FOR UPDATE`, N requêtes du même coach obtiennent toutes
le verrou partagé puis demandent toutes l'exclusif : **montée en verrou
circulaire, interblocage garanti**. C'était reproductible avec quatre holds
parallèles ; c'est pourquoi `coach_create_hold` prend le `FOR UPDATE` **avant**
de poser la clé. Ne jamais ajouter `for update` au `SELECT` sur `coach_profiles`
de `coach_cancel_reservation` pour la même raison.

### 4. Aucune écriture métier depuis le navigateur

Il n'existe **aucune policy** `INSERT`/`UPDATE`/`DELETE` pour `authenticated` sur
`coach_reservations`. RLS activée sans policy = refus par défaut. Tout passe par
les fonctions `SECURITY DEFINER`. Le client ne peut donc écrire ni `amount_cents`,
ni `payment_status`, ni `status` — c'est la garantie du test contractuel §13.13.

Et le piège documenté de `GRANT` : *« Granting the privilege at the table level
and then revoking it for one column will not do what one might wish. »* Donc on
révoque **la table entière**, puis on grante une liste de colonnes. `qr_jti`,
`signature_pdf_path`, `payment_id`, `seat`, `deciplus_member_id` et les jetons
prestataire ne sont grantés **à personne** — ni coach, ni manager, ni direction.

Conséquence voulue : `select * from coach_reservations` en `authenticated`
échoue en `42501`. Les clients lisent des **vues**.

### 5. `security_invoker` s'écrit dans le `CREATE VIEW`, jamais en `ALTER`

Une vue est évaluée avec les droits de son **propriétaire** (`postgres`, qui a
`BYPASSRLS`) : une vue ordinaire contourne donc toute la RLS. `security_invoker`
corrige ça — mais **`CREATE OR REPLACE VIEW` réinitialise les `reloptions`**, donc
une vue passée en invoker par `ALTER VIEW` perd l'option à la première
redéfinition. L'option est dans le `CREATE` lui-même.

| Vue | Régime | Pourquoi |
|---|---|---|
| `coach_reservations_staff` | **invoker** | La RLS de la table exprime déjà la règle. La vue projette, le `GRANT` cache. |
| `coach_coaches_staff` | **definer, assumée** | La matrice §12 veut des colonnes limitées **par rôle** — impossible par `GRANT`, qui s'applique à `authenticated` entier. Son `WHERE` **est** le contrôle d'accès. |
| `coach_slot_occupancy` | **definer, agrégée** | La grille publique doit afficher « complet » sans session. Ne rend qu'un compte, jamais une identité. |

Le lint Supabase `0010_security_definer_view` signalera les deux dernières : c'est
attendu et documenté, pas un oubli.

### 6. Fuseau : deux régimes, jamais mélangés

| Type de règle | Écriture | Pourquoi |
|---|---|---|
| Durée (hold 10 min, annulation 24 h) | `now() + interval`, `starts_at - make_interval(hours => …)` | `timestamptz` contre `timestamptz` : le fuseau n'intervient pas. Durée **absolue**, vraie même au changement d'heure. |
| Calendrier (dimanche, 10h–19h, tarif) | `AT TIME ZONE 'Europe/Paris'` **explicite** | Sans lui, la règle dépend du `TimeZone` de session, donc du client. Inacceptable. |

Les neuf créneaux vont de **10h à 18h en heure de début** : le dernier commence à
18h et finit à 19h.

---

## Ce que la base garantit, et ce qu'elle ne garantit pas

**Elle garantit**, même si l'applicatif est contourné : au plus `capacity`
réservations actives par créneau · une seule réservation active par coach et par
créneau · un seul avoir par réservation annulée · `confirmed` impossible sans
paiement **et** signature · une seule version courante par type de document ·
`coach_audit_logs` non modifiable, y compris par le propriétaire.

**Elle ne garantit pas** : qu'un superutilisateur ne fasse pas
`ALTER TABLE … DISABLE TRIGGER`. Aucun dispositif interne à Postgres n'y résiste.
Au-delà, ce qui fait foi ce sont les journaux Supabase et la rotation des accès
`service_role`. `SUPABASE_SERVICE_ROLE_KEY` porte `BYPASSRLS` : elle ne doit
**jamais** atteindre le navigateur.

---

## Écarts assumés par rapport au cahier

| # | Écart | Motif |
|---|---|---|
| 1 | `club_id` ajouté aux clés d'unicité de réservation | `'salle'` existe dans trois clubs (§3.5 du cahier est erroné) |
| 2 | `coach_slot_block_rules` ajoutée | L'éducative est hebdomadaire et permanente ; `coach_slot_blocks` est daté |
| 3 | `coach_slot_occupancy` ajoutée | Sans elle, `anon` ne peut pas afficher la grille |
| 4 | Annulation d'un `held` → `expired` + `cancel_reason` | L'enum du contrat n'a pas de valeur `cancelled` |
| 5 | Clé d'idempotence réutilisée → `CONFLICT` + `details.reason` | L'enum `ErrorCode` est fermée |
| 6 | Verrou consultatif au lieu de `SELECT … FOR UPDATE` | Les créneaux sont virtuels |

Les quatre derniers demandent un arbitrage produit (voir `.research/spec-02-schema-rls.md` §19).

---

## Vérifier une base

```sql
-- Aucune table métier sans RLS forcée
select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname like 'coach\_%'
  and not (c.relrowsecurity and c.relforcerowsecurity);

-- security_invoker bien posé
select relname, reloptions from pg_class
where relkind='v' and relname like 'coach\_%';

-- Le seed
select (select count(*) from coach_clubs)           as clubs,           -- 5
       (select count(*) from coach_spaces)          as espaces,         -- 8
       (select count(*) from coach_slot_templates)  as creneaux,        -- 432
       (select count(*) from coach_slot_block_rules) as educative;      -- 32
```

`0015_seed.sql` vérifie lui-même ces comptes et **annule la migration** s'ils ne
tombent pas juste : un seed silencieusement incomplet est pire qu'un seed absent.

---

## Avant de déployer sur Supabase

1. `pg_cron` — `0012` planifie si l'extension est disponible, sinon ne fait rien
   et laisse les fonctions appelables par `service_role` (cron Vercel).
2. Faire tourner le lint Supabase ; seules `coach_coaches_staff` et
   `coach_slot_occupancy` doivent apparaître en `0010_security_definer_view`.
3. Vérifier `select rolbypassrls from pg_roles where rolname='service_role';`
4. `0000` ne doit **rien** créer sur un vrai projet : le vérifier dans la sortie.
