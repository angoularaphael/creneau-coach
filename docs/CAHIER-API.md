# Cahier d’API — Réservation coachs Boxing Center

**Version :** 1.0.0  
**Date :** 2026-09-17  
**Base URL prod :** `https://coach.boxingcenter.fr/api/v1`  
**Base URL local :** `http://localhost:3041/api/v1`  
**Fuseau :** `Europe/Paris` (toutes les heures métier)  
**Format :** JSON UTF-8  
**Contrat machine :** [openapi.yaml](./openapi.yaml)

Ce document est le **contrat bloquant** entre les 3 lots. Personne n’invente un champ, un statut ou un prix côté client.

| Lot | Responsable | Périmètre API |
|-----|-------------|----------------|
| A | Raphael | Paiement, signatures, QR, Deciplus, webhooks, e-mails transactionnels |
| B | Brad | Pages publiques, auth UI, espace coach, consommation des GET |
| C | Eddy | Clubs, créneaux, holds, capacités, avoirs, back-office, RLS |

---

## 1. Règles générales

### 1.1 Auth

- Session **Supabase Auth** : cookie `httpOnly`, `Secure`, `SameSite=Lax`. Pas de JWT d’accès dans `localStorage`.
- Header optionnel interne : `Authorization: Bearer <service_role>` interdit au navigateur.
- Rôles (`app_metadata.role`) :

| Rôle | Qui |
|------|-----|
| `coach` | Coach indépendant |
| `manager_salle` | Responsable d’**un** club (`app_metadata.club_id`) |
| `direction` | Boxing Center, 5 clubs |
| `service` | Bot Deciplus / cron (header `x-sync-secret`) |

Compte `suspended_at != null` → `403 SUSPENDED` sur tout write (hold, checkout, signature, annulation).

### 1.2 En-têtes

| Header | Quand |
|--------|--------|
| `Idempotency-Key` | Obligatoire sur `POST /reservations`, `POST .../checkout`, `POST .../cancel` (UUID v4, conservé 24 h) |
| `x-sync-secret` | Uniquement `/internal/*` (bot / cron) |
| `PayPlug-Signature` | Webhook Payplug (vérif serveur Raphael) |

### 1.3 Erreur

```json
{
  "error": {
    "code": "SLOT_FULL",
    "message": "Ce créneau est complet (2 coachs).",
    "details": { "slot_id": "..." }
  }
}
```

| HTTP | `error.code` | Sens |
|------|--------------|------|
| 400 | `VALIDATION_ERROR` | Body / query invalide |
| 401 | `UNAUTHENTICATED` | Pas de session |
| 403 | `FORBIDDEN` | Mauvais rôle / mauvais club |
| 403 | `SUSPENDED` | Compte coach suspendu |
| 404 | `NOT_FOUND` | Ressource absente **ou** hors périmètre (anti-énumération) |
| 409 | `SLOT_FULL` | Capacité 2 atteinte |
| 409 | `SLOT_BLOCKED` | Boxe éducative / blocage BO |
| 409 | `ACTIVE_LIMIT` | Déjà 3 réservations actives |
| 409 | `HOLD_EXPIRED` | Hold > 10 min, créneau libéré |
| 409 | `PAYMENT_REQUIRED` | Signature / QR avant paiement |
| 409 | `SIGNATURE_REQUIRED` | QR / Deciplus avant signature |
| 409 | `CANCEL_TOO_LATE` | Moins de 24 h avant le créneau |
| 409 | `PRICE_MISMATCH` | Tentative de payer un autre montant |
| 409 | `CONFLICT` | Transition d’état illégale |
| 410 | `QR_WINDOW_CLOSED` | Hors T−5 → fin de créneau |
| 422 | `QR_WRONG_CLUB` | Token d’un autre club |
| 429 | `RATE_LIMITED` | Voir §1.5 |
| 401 | `WEBHOOK_INVALID` | Signature Payplug / PayPal fausse |

Un coach **B** qui demande la résa de **A** reçoit `404 NOT_FOUND`, jamais `403` (pas d’énumération).

### 1.4 Identifiants et argent

- UUID v4 pour toutes les PK exposées.
- Montants en **centimes** (`amount_cents`: `1000` = 10,00 €).
- Prix **uniquement** calculé serveur (Eddy). Le front affiche `amount_cents` renvoyé, il ne le calcule pas.
- IDs clubs = slugs boutique : `minimes` | `st-cyprien` | `etats-unis` | `ramonville` | `portet`.

### 1.5 Rate limits (par IP + par `coach_id` si session)

| Route | Limite |
|-------|--------|
| Auth login (Supabase) | 5 / min |
| `POST /reservations` | 10 / min |
| `POST .../checkout` | 5 / min |
| `POST .../signature` | 10 / min |
| Webhooks | signature obligatoire + anti-replay (id paiement unique) |

### 1.6 Horloge

Toute règle métier (`hold` 10 min, annulation 24 h, QR T−5) utilise **l’heure serveur `Europe/Paris`**. Jamais `Date` du navigateur.

---

## 2. Machine à états — réservation

```
held → awaiting_payment → awaiting_signature → confirmed → consumed
                ↘ expired
                ↘ payment_failed (hold relâché)
                                      ↘ cancelled_credit   (annul. > 24 h, avoir)
                                      ↘ no_show            (option direction)
```

| Statut | Qui le pose | Signification |
|--------|-------------|---------------|
| `held` | Eddy | Place bloquée 10 min, pas payée |
| `awaiting_payment` | Eddy après hold OK | Alias possible de `held` (même sémantique) ; le contrat utilise `held` |
| `awaiting_signature` | Raphael (webhook payé) | Payé, docs non signés |
| `confirmed` | Raphael (signature OK) | QR générable + job Deciplus |
| `consumed` | Cron Eddy (fin de créneau passé) | Créneau écoulé |
| `expired` | Cron Eddy | Hold sans paiement |
| `payment_failed` | Raphael | Payplug/PayPal refusé → place libérée |
| `cancelled_credit` | Eddy | Annulation > 24 h, avoir créé |
| `no_show` | Direction | Marquage manuel |

**Actives** (comptent dans la limite 3) : `held`, `awaiting_signature`, `confirmed`.

**Barrière :** `confirmed` **interdit** tant que `payment_status != paid` **ou** `signature_status != signed`.

---

## 3. Ressources (schéma logique)

Tables Postgres préfixe `coach_`. RLS obligatoire (matrice §9).

### 3.1 `coach_profiles`

Profil 1-1 avec `auth.users`.

| Champ | Type | Notes |
|-------|------|--------|
| `id` | uuid PK | = `auth.uid()` |
| `first_name`, `last_name` | text | |
| `birth_date` | date | |
| `phone` | text E.164 | |
| `email` | text | copie auth |
| `address_line`, `postal_code`, `city` | text | |
| `diploma`, `disciplines` | text / text[] | |
| `photo_path` | text | storage privé |
| `status` | `active` \| `suspended` \| `deleted` | |
| `suspended_at`, `suspended_reason` | timestamptz / text | |
| `consent_privacy_at`, `consent_cgu_at` | timestamptz | cases **non** pré-cochées |
| `payplug_customer_id`, `paypal_vault_id` | text nullable | tokens prestataire, jamais de PAN |
| `deciplus_member_id` | text nullable | Raphael only, **jamais** dans le QR public |
| `created_at`, `updated_at` | timestamptz | |

### 3.2 `coach_clubs` / `coach_spaces`

| Club `id` | Espaces `id` |
|-----------|----------------|
| `minimes` | `salle` |
| `st-cyprien` | `salle` |
| `ramonville` | `salle` |
| `etats-unis` | `boxe`, `mma-sol`, `fitness` |
| `portet` | `boxe-fitness`, `mma-sol` |

Capacité par défaut : **2** réservations confirmées+held / (`space_id`, `starts_at`).

### 3.3 `coach_slot_templates` + `coach_slot_blocks`

Créneaux types lun–sam 10:00→19:00 (heures pile).  
Blocages éducative par défaut (sauf Portet, paramétrable BO) :

- mercredi 15:00–16:00 et 16:00–17:00
- samedi 15:00–16:00 et 16:00–17:00

### 3.4 `coach_tariffs`

| `kind` | Créneaux | `amount_cents` défaut |
|--------|----------|------------------------|
| `offpeak` | 10–11, 11–12, 14–15, 15–16, 16–17 | 1000 |
| `peak` | 12–13, 13–14, 17–18, 18–19 | 1500 |

Paramétrable direction.

### 3.5 `coach_reservations`

| Champ | Type | Notes |
|-------|------|--------|
| `id` | uuid | |
| `coach_id` | uuid | |
| `club_id` | slug | |
| `space_id` | slug | |
| `starts_at` | timestamptz Paris | début créneau |
| `ends_at` | timestamptz | = start + 1 h |
| `amount_cents` | int | **figé au hold** |
| `currency` | `eur` | |
| `status` | enum §2 | |
| `payment_status` | `unpaid` \| `paid` \| `failed` \| `waived_credit` | |
| `payment_provider` | `payplug` \| `paypal` \| `credit` \| null | |
| `payment_id` | text | id prestataire, unique |
| `signature_status` | `none` \| `signed` | |
| `signed_at` | timestamptz | |
| `signature_pdf_path` | text | bucket privé |
| `qr_jti` | text | id token HMAC, pas le token |
| `qr_valid_from` | timestamptz | `starts_at − 5 min` |
| `qr_valid_to` | timestamptz | `ends_at` |
| `deciplus_job_status` | `none` \| `queued` \| `granted` \| `revoked` \| `error` | |
| `hold_expires_at` | timestamptz | hold + 10 min |
| `cancelled_at` | timestamptz | |
| `credit_id` | uuid nullable | avoir généré |
| `created_at` | timestamptz | |

Contrainte unique partielle : au plus **2** lignes `status IN ('held','awaiting_signature','confirmed')` par (`space_id`, `starts_at`).  
Contrainte : un coach **une** résa active sur le même (`space_id`, `starts_at`).

### 3.6 `coach_credits` (avoirs)

| Champ | Type |
|-------|------|
| `id` | uuid |
| `coach_id` | uuid |
| `amount_cents` | int (reste) |
| `origin_reservation_id` | uuid |
| `status` | `available` \| `consumed` \| `expired` |
| `created_at` | timestamptz |

Un avoir = le **montant de la résa annulée** (10 ou 15 €). Consommé en checkout `provider=credit` si `amount_cents` du nouveau hold ≤ solde.

### 3.7 `coach_documents` / `coach_signatures`

Versions CGV, RI, décharge. Une signature archive un PDF + hash SHA-256 + IP + user-agent.

### 3.8 `coach_audit_logs` (append-only)

`actor_id`, `role`, `action`, `club_id`, `target_type`, `target_id`, `meta` (sans PAN, sans token QR), `created_at`.

### 3.9 `coach_settings`

Clé/valeur direction : `max_active_reservations` (3), `capacity_per_slot` (2), `hold_ttl_seconds` (600), `cancel_min_hours` (24), `qr_early_minutes` (5).

---

## 4. Endpoints publics (Brad, sans session)

### `GET /clubs`

Liste des 5 clubs (id, nom, adresse courte, photo hero, `spaces[]`).

### `GET /clubs/{club_id}`

Fiche club : présentation, photos, infrastructures, affluence, espaces. **Pas** le planning détaillé (ça c’est `/slots` authentifié ou public limité).

### `GET /clubs/{club_id}/slots`

Query : `from` `to` (ISO date `YYYY-MM-DD`), `space_id` optionnel.

**Public :** ne renvoie **pas** les noms des coachs. Uniquement :

```json
{
  "club_id": "etats-unis",
  "space_id": "boxe",
  "slots": [
    {
      "starts_at": "2026-09-21T10:00:00+02:00",
      "ends_at": "2026-09-21T11:00:00+02:00",
      "amount_cents": 1000,
      "tariff": "offpeak",
      "capacity": 2,
      "taken": 1,
      "state": "open"
    }
  ]
}
```

`state` : `open` | `full` | `blocked` | `past`.

Auth coach : même payload + `mine: true` si le coach a déjà une résa sur ce slot.

### `POST /contact`

Body : `name`, `email`, `message`. Rate limit 5 / h / IP. Pas de PII dans les logs.

---

## 5. Compte coach (Brad UI + API commune)

Auth signup/login/logout = **Supabase Auth** (hors ce cahier HTTP), puis profil métier.

### `GET /me`

Session coach. 401 si anonyme. 403 `SUSPENDED` si suspendu (le front affiche le blocage).

```json
{
  "id": "...",
  "role": "coach",
  "status": "active",
  "profile": { "first_name": "Léa", "last_name": "Martin", "...": "..." },
  "active_reservations_count": 1,
  "max_active_reservations": 3,
  "credits_cents": 1500
}
```

Staff : `GET /me` renvoie `role`, `club_id` (manager) ou `null` (direction).

### `PATCH /me`

Champs profil autorisés (pas `status`, pas `deciplus_member_id`, pas tokens paiement).

### `POST /me/photo`

Body multipart image jpeg/webp/png, max 5 Mo. Réponse : pas d’URL publique permanente — `photo_path` interne. Lecture via `GET /me/photo` (stream auth).

### `GET /me/export`

RGPD : JSON du compte + résas (sans token QR brut, sans ids Deciplus si possible — direction tranche). `202` si asynchrone.

### `DELETE /me`

Demande d’effacement. Soft-delete profil ; **conservation légale** PDF signés + paiements (durée direction). Résas futures `confirmed` → politique : annulation sans avoir si < 24 h, sinon avoir puis anonymisation.

---

## 6. Réservations — Eddy (Brad consomme, Raphael enchaîne)

### `POST /reservations`

**Lot C.** Session `coach`. Idempotency-Key obligatoire.

```json
{
  "club_id": "portet",
  "space_id": "mma-sol",
  "starts_at": "2026-09-22T11:00:00+02:00"
}
```

Serveur :

1. Refuse si `suspended`.
2. Refuse si `starts_at` dans le passé ou dimanche ou hors 10–19.
3. Refuse si blocage éducative / BO → `SLOT_BLOCKED`.
4. Calcule `amount_cents` (tarif).
5. Compte actives du coach ≥ `max_active_reservations` → `ACTIVE_LIMIT`.
6. `SELECT … FOR UPDATE` sur le slot : `taken >= capacity` → `SLOT_FULL`.
7. Insert `status=held`, `hold_expires_at = now()+10min`, `amount_cents` figé.

```json
{
  "id": "a0e1…",
  "status": "held",
  "club_id": "portet",
  "space_id": "mma-sol",
  "starts_at": "2026-09-22T11:00:00+02:00",
  "ends_at": "2026-09-22T12:00:00+02:00",
  "amount_cents": 1000,
  "hold_expires_at": "2026-09-22T09:41:00+02:00",
  "payment_status": "unpaid",
  "signature_status": "none"
}
```

Cron Eddy : `held` + `hold_expires_at < now()` → `expired`, libère la place.

### `GET /reservations`

Coach : **ses** résas (`from`, `to`, `status`).  
Manager : son club uniquement.  
Direction : filtres `club_id`, `coach_id`, `status`, `from`, `to`. Pagination `limit` (max 100) + `cursor`.

Manager **n’a pas** : PDF signature, token QR, `deciplus_member_id`. Champs exposés manager : identité coach, créneau, `payment_status`, `signature_status` (booléen), `deciplus_job_status`, `qr_ready` booléen.

### `GET /reservations/{id}`

Même règle d’accès. 404 si hors périmètre.

Champs QR (`qr_png_data_url` ou URL signée courte TTL) **uniquement** si `status=confirmed` et appelant = owner ou direction. Jamais le HMAC secret.

### `POST /reservations/{id}/cancel`

Owner ou direction. Idempotency-Key.

- Si `held` : libération, pas d’avoir.
- Si `awaiting_signature` ou `confirmed` **et** `now < starts_at − 24h` : `cancelled_credit` + ligne `coach_credits`. **Pas de remboursement Payplug.**
- Si `now >= starts_at − 24h` : `409 CANCEL_TOO_LATE`.
- Si `confirmed` : Eddy notifie Raphael (`reservation.cancelled`) → révocation Deciplus + invalidation QR.

---

## 7. Paiement — Raphael

Le front **ne passe jamais** `paid`. Seul le webhook (ou interrogation serveur du paiement) change l’état.

### `POST /reservations/{id}/checkout`

Session owner. Body :

```json
{
  "provider": "payplug"
}
```

`provider` : `payplug` | `paypal` | `credit`.

Règles :

- Résa `held` et `hold_expires_at > now()`, sinon `HOLD_EXPIRED`.
- Montant envoyé au prestataire = `reservations.amount_cents` **en base**.
- `credit` : si solde avoir ≥ `amount_cents`, débiter l’avoir, `payment_status=waived_credit`, passer **directement** `awaiting_signature` (toujours signer).
- Réponse Payplug/PayPal :

```json
{
  "checkout_url": "https://secure.payplug.com/...",
  "provider": "payplug",
  "reservation_id": "a0e1…"
}
```

Pas de 4×, pas d’Oney, pas de Scalapay.

### `POST /webhooks/payplug`

Auth : signature Payplug. Anti-replay sur `payment_id`.

- Montant ≠ `amount_cents` → log + alerte, **ne pas** confirmer (`PRICE_MISMATCH`).
- Payé → `payment_status=paid`, `status=awaiting_signature`, e-mail « à signer ».
- Refusé → `payment_failed`, libère le slot.

### `POST /webhooks/paypal`

Idem, vérif signature / webhook-id PayPal.

### `POST /reservations/{id}/payment/sync`

Owner : au retour navigateur (`payplug_return=1`), le serveur **re-query** le prestataire. Ne fait pas confiance au querystring.

### `GET /me/payment-methods`

Liste tokens prestataire (marque, 4 derniers chiffres **fournis par Payplug**, jamais de PAN stocké).

### `POST /me/payment-methods` / `DELETE /me/payment-methods/{id}`

Délégation au prestataire (hosted field / vault). Boxing Center ne voit pas la carte.

---

## 8. Signatures — Raphael

Documents obligatoires (versions courantes direction) : `cgv`, `reglement`, `decharge` (+ futurs).

### `GET /reservations/{id}/documents`

Owner, statut `awaiting_signature` ou `confirmed`. Liste `{ id, kind, title, version, html_or_pdf_url }` URLs **signées TTL 10 min**.

### `POST /reservations/{id}/signature`

```json
{
  "document_ids": ["…", "…", "…"],
  "signature_image": "data:image/png;base64,…",
  "consent": true
}
```

Règles :

- `payment_status` ∈ `paid` | `waived_credit` sinon `PAYMENT_REQUIRED`.
- `consent === true` obligatoire.
- `signature_image` data-URL png, taille max 300 Ko.
- Tous les `document_ids` = versions **courantes**.
- Serveur : PDF (PDFKit) + hash + IP + UA → storage **privé**.
- Puis `signature_status=signed`, `status=confirmed`.
- Puis : générer `qr_jti`, e-mail confirmation, job Deciplus `grant`.

Pas de signature pour un autre `coach_id`.

### `GET /reservations/{id}/signature.pdf`

Owner ou **direction** seulement (pas manager). Stream auth.

---

## 9. QR et Deciplus — Raphael

### Payload QR (opaque)

Le PNG encode **uniquement** un token compact, pas l’UUID de résa en clair.

```
v1.<payload_b64url>.<hmac_sha256_b64url>
```

`payload` : `{ jti, club_id, exp, nbf }` — **pas** de nom, **pas** de `deciplus_member_id`.  
HMAC : secret `QR_HMAC_SECRET` (Vercel, jamais le front).  
`nbf` = `starts_at − 5 min`, `exp` = `ends_at`.

### `GET /reservations/{id}/qr`

Owner / direction. `409 SIGNATURE_REQUIRED` ou `PAYMENT_REQUIRED` si pas `confirmed`.

```json
{
  "png_data_url": "data:image/png;base64,…",
  "valid_from": "2026-09-22T10:55:00+02:00",
  "valid_to": "2026-09-22T12:00:00+02:00",
  "club_id": "portet",
  "state": "waiting"
}
```

`state` : `waiting` (avant nbf) | `active` | `expired` | `revoked`.

### `POST /internal/access/verify`

`x-sync-secret`. Body `{ token, club_id }` (lecteur / debug).

- HMAC faux → 401  
- `club_id` ≠ payload → `QR_WRONG_CLUB` + audit + alerte  
- hors `[nbf, exp]` → `QR_WINDOW_CLOSED` + alerte  
- compte suspendu / résa annulée → 403  
- OK → `{ ok: true, reservation_id, coach_id }` **côté service uniquement**

### `POST /internal/deciplus/jobs`

App interne après `confirmed` ou `cancelled` / `consumed` / `suspended`.

```json
{
  "action": "grant",
  "reservation_id": "…"
}
```

`action` : `grant` | `revoke` | `revoke_coach` (suspension).  
Bot Playwright uniquement sur BotHosting. Credentials Deciplus **absents** de Vercel.

### `POST /internal/deciplus/callback`

Bot → app : `{ reservation_id, deciplus_member_id, job_status, error? }`. Secret obligatoire. `deciplus_member_id` ne remonte pas aux managers.

Cron Raphael : si `confirmed` et `now ∈ [nbf, exp]` et job pas `granted` → retry. Si `now > exp` et pas `revoked` → `revoke`.

---

## 10. Back-office — Eddy

Préfixe `/admin`. Rôles `manager_salle` | `direction`.

Isolation : manager → `club_id` de son JWT **uniquement**. Tentative `?club_id=portet` alors que Minimes → `404`.

### `GET /admin/reservations`

Filtres : `club_id` (direction), `coach_q`, `from`, `to`, `status`, `space_id`. Export `Accept: text/csv` = même filtre, **sans** PDF ni token.

### `GET /admin/slots?club_id&space_id&from&to`

Vue occupée / bloquée / libre. Manager : club forcé.

### `POST /admin/slot-blocks`

```json
{
  "club_id": "portet",
  "space_id": "boxe-fitness",
  "starts_at": "2026-09-23T15:00:00+02:00",
  "reason": "educative"
}
```

Direction + manager **de ce club**. Audit.

### `DELETE /admin/slot-blocks/{id}`

### `PATCH /admin/settings`

Direction only. `max_active_reservations`, tarifs, capacité, `cancel_min_hours`, blocs éducative Portet.

### `GET /admin/coaches` / `GET /admin/coaches/{id}`

Direction : tout. Manager : coachs ayant une résa **sur son club** (pas le listing global).

### `POST /admin/coaches/{id}/suspend`

Direction. Body `{ reason }`. Effet : `status=suspended` + event `coach.suspended` → Raphael révoque tous les QR / droits Deciplus `confirmed` futurs et en cours.

### `POST /admin/coaches/{id}/unsuspend`

Direction.

### `GET /admin/credits`

Direction (avoirs). Manager : non.

### `GET /admin/stats`

Direction : volume, CA, taux annulation, par club. Manager : son club, sans données des autres.

### `GET /admin/audit`

Direction. Manager : actions **de son club** seulement.

### `GET /admin/access-logs`

Direction. Jobs Deciplus + verify QR (sans secret).

---

## 11. Notifications (événements internes)

Bus interne (table `coach_events` ou file). Producteurs → consommateurs.

| Event | Producteur | Consommateurs |
|-------|------------|---------------|
| `reservation.held` | Eddy | — |
| `reservation.paid` | Raphael | mail coach « signez » ; notif salle |
| `reservation.confirmed` | Raphael | mail + QR ; notif salle ; job grant |
| `reservation.cancelled` | Eddy | mail avoir ; notif salle ; Raphael revoke |
| `reservation.payment_failed` | Raphael | mail coach ; notif salle |
| `signature.missing` (cron J-1 si unpaid docs) | Raphael | mail + notif salle |
| `deciplus.error` | Raphael | alerte direction |
| `access.denied` | Raphael | alerte direction |
| `coach.suspended` | Eddy | Raphael revoke all |

Les e-mails **ne contiennent pas** le secret HMAC. QR en pièce jointe image OK. Pas de `deciplus_member_id` dans le mail salle.

---

## 12. Matrice RLS (semaine 0 — les 3)

Politique Postgres, **en plus** des checks API.

| Table | `coach` | `manager_salle` | `direction` | `service` |
|-------|---------|-----------------|-------------|-----------|
| `coach_profiles` | SELECT/UPDATE **soi** | SELECT si résa sur son club (colonnes limitées via vue) | all | — |
| `coach_reservations` | soi | `club_id` du manager | all | UPDATE job fields |
| `coach_credits` | soi | — | all | — |
| `coach_signatures` / PDF | soi | **non** | all | — |
| `coach_slot_blocks` | SELECT (pour voir `blocked`) | CRUD son club | all | — |
| `coach_settings` | SELECT public keys | SELECT | all | — |
| `coach_audit_logs` | — | SELECT son club | all | INSERT |
| `coach_deciplus_jobs` | — | SELECT statut agrégé via résa | all | all |

Vues SQL recommandées : `coach_reservations_staff` **sans** `qr_jti`, `signature_pdf_path`, `deciplus_member_id`.

---

## 13. Sécurité — tests contractuels (CI)

À implémenter avant mise en ligne (cahier §23 / §28) :

1. Coach B `GET /reservations/{idA}` → 404.  
2. Manager Minimes `GET /admin/reservations?club_id=portet` → 404.  
3. `POST /signature` sur résa `held` → 409 `PAYMENT_REQUIRED`.  
4. Webhook Payplug avec mauvais HMAC → 401, statut inchangé.  
5. Webhook montant 1 € sur résa 15 € → pas `paid`.  
6. `GET /qr` avant `confirmed` → 409.  
7. Verify QR 10 min trop tôt → `QR_WINDOW_CLOSED`.  
8. Verify QR club `minimes` sur token `portet` → `QR_WRONG_CLUB`.  
9. Deux `POST /reservations` parallèles sur le 2e siège → un 201, un 409 `SLOT_FULL`.  
10. 4e hold alors que 3 actives → `ACTIVE_LIMIT`.  
11. Cancel 23 h avant → `CANCEL_TOO_LATE`.  
12. Coach suspendu `POST /reservations` → 403 `SUSPENDED`.  
13. `Idempotency-Key` rejouée → même `reservation_id`, pas de double hold.

---

## 14. Versioning

- Breaking change = `v2`.  
- Champ nouveau **optionnel** : OK en `v1` avec changelog.  
- Ce fichier et `openapi.yaml` évoluent **ensemble**. PR review du responsable de lot.

## 15. Hors contrat (volontaire)

- Stripe, Yousign, Calendly, Firebase.  
- Paiement 3×/4×.  
- API Deciplus officielle (n’existe pas ici : job bot interne).  
- Exposition du mot de passe / session Deciplus.  
- Prix calculé dans React.
