# Répartition des tâches — Réservation coachs Boxing Center

**Version :** 1.0  
**Date :** 2026-09-17  
**Contrat API :** [CAHIER-API.md](./CAHIER-API.md) · [openapi.yaml](./openapi.yaml)  
**Env :** [../.env.example](../.env.example) · [../bot/.env.example](../bot/.env.example)

Personne n’invente un champ, un statut ou un prix. PR review du **responsable du lot** touché. La sécurité est un livrable de chaque lot, pas un add-on.

| Lot | Qui | Périmètre |
|-----|-----|-----------|
| A | **Raphael** | Paiement 1×, signatures, QR, Deciplus, webhooks, mails transactionnels |
| B | **Brad** | Site public, 5 clubs, auth UI, espace coach, grille (consomme l’API) |
| C | **Junior** | Schéma + RLS, créneaux, holds, capacités, avoirs, back-office |

Eddy n’a **aucun** lot sur ce produit.

Légende : `[ ]` à faire · `[~]` en cours · `[x]` livré · **bloque** = l’autre lot attend ça.

---

## 0. Semaine 0 — les trois (bloquant)

Sans ça, personne ne code en parallèle.

- [x] Repo app `coach-reservation` (**Next.js 16.3**, App Router), **pas** dans la boutique BOXPLUS
- [x] Projet / schéma Supabase `coach_*` (`supabase/migrations`, Junior)
- [ ] Rôles Auth : `coach` | `manager_salle` (+ `club_id`) | `direction` | `service`
- [ ] Matrice RLS du cahier §12 appliquée + vue staff **sans** PDF / token QR / id Deciplus
- [ ] Table `coach_audit_logs` append-only
- [ ] Copie `.env.example` → `.env.local` (chacun remplit **sa** section, aucun secret dans git)
- [ ] Accord : horloge `Europe/Paris`, montants en centimes, slugs clubs boutique
- [ ] Format d’erreur `{ error: { code, message, details } }` + `Idempotency-Key`

**DoD semaine 0 :** Brad peut appeler un `GET /clubs/:id/slots` (même fake) sans casser le contrat. Raphael peut poser un hold de démo et brancher un checkout test.

---

## 1. Raphael — Lot A

Argent, juridique, porte. Secrets Payplug / PayPal / HMAC / Deciplus = toi. **Pas** le MDP Deciplus sur Vercel.

### 1.1 Paiement

- [ ] Checkout Payplug **1×** (`POST /reservations/:id/checkout` `provider=payplug`)
- [ ] Checkout PayPal **1×**
- [ ] Checkout `provider=credit` si solde avoir ≥ montant serveur (Junior fournit le solde)
- [ ] Webhook Payplug signé + anti-replay `payment_id`
- [ ] Webhook PayPal signé + `PAYPAL_WEBHOOK_ID`
- [ ] `POST .../payment/sync` au retour navigateur (re-query prestataire, **pas** le querystring)
- [ ] Rejet si montant prestataire ≠ `amount_cents` (`PRICE_MISMATCH` + alerte)
- [ ] Vault carte / PayPal chez le prestataire — **zéro PAN / CVV / IBAN** en base
- [ ] Pas de 4×, Oney, Scalapay, Stripe
- [ ] Env : `PAYPLUG_*`, `PAYPAL_*` (voir `.env.example`)

**Bloque Brad :** `checkout_url` + états `held` → `awaiting_signature` visibles sur `GET /reservations/:id`.

### 1.2 Signatures

- [ ] Versions courantes CGV / RI / décharge (textes direction)
- [ ] `GET /reservations/:id/documents` — URLs signées TTL 10 min
- [ ] `POST /reservations/:id/signature` — pad + `consent: true` + PDF privé (PDFKit)
- [ ] Hash SHA-256 + IP + UA + horodatage Paris
- [ ] Interdit de signer si pas `paid` / `waived_credit` (`PAYMENT_REQUIRED`)
- [ ] Interdit de signer pour un autre coach
- [ ] `GET .../signature.pdf` : owner + **direction** seulement (pas manager)
- [ ] Passage `awaiting_signature` → `confirmed` uniquement ici

**Bloque Brad :** écran pad + « documents signés » dans l’espace coach.

### 1.3 QR + Deciplus

- [ ] Token opaque HMAC (`QR_HMAC_SECRET`) — pas d’UUID résa / nom / id Deciplus dans le PNG
- [ ] `GET /reservations/:id/qr` seulement si `confirmed`
- [ ] Fenêtre `starts_at − 5 min` → `ends_at`, club unique
- [ ] `POST /internal/access/verify` (secret) : hors fenêtre, mauvais club, suspendu
- [ ] Job bot `grant` / `revoke` / `revoke_coach` (`x-sync-secret`)
- [ ] Callback bot → `deciplus_job_status` (id membre **jamais** aux managers)
- [ ] Credentials Deciplus **uniquement** `bot/.env.example` / BotHosting
- [ ] Cron retry grant + revoke rattrapage
- [ ] Compte suspendu (event Junior) → coupe QR + droits tout de suite
- [ ] Alertes `deciplus.error` / `access.denied` → `ALERT_EMAIL`

**Bloque la mise en ligne salles :** un créneau test Minimes, QR T−5, expiration, refus autre club.

### 1.4 E-mails

- [ ] Resend : compte créé, à signer, confirmation + QR, rappel créneau, annulation/avoir, paiement refusé
- [ ] Mails salle via `MANAGER_EMAIL_*` (sans token QR, sans id Deciplus)
- [ ] Relance signature manquante (cron)

### 1.5 Sécu / tests Raphael

- [ ] Webhook HMAC faux → 401, statut inchangé
- [ ] Webhook 1 € sur résa 15 € → pas `paid`
- [ ] QR avant `confirmed` → 409
- [ ] Verify 10 min trop tôt → `QR_WINDOW_CLOSED`
- [ ] Verify club `minimes` sur token `portet` → `QR_WRONG_CLUB`
- [ ] PDF / HMAC / MDP Deciplus absents du front et du git

---

## 2. Brad — Lot B

Tout ce que le coach **voit**. Tu **consommes** l’API ; tu ne calcules pas le prix ni le statut payé.

### 2.1 Site public

- [x] Viewport + mobile-first (375 / 900), CSS Boxing Center (`boutique.css` / `components.css`)
- [x] Accueil, Nos clubs, Comment ça marche, Tarifs, Contact, pages légales
- [x] 5 fiches club : Minimes, St-Cyprien, États-Unis, Ramonville, Portet
- [x] États-Unis : 3 espaces (Boxe / MMA-Sol / Fitness) — Portet : 2 (Boxe-Fitness / MMA-Sol)
- [x] `GET /clubs`, `GET /clubs/:id`, `POST /contact`
- [~] Mentions RGPD + politique de confidentialité (textes direction)

### 2.2 Auth + compte

- [x] Inscription / login / logout Supabase — cookies **httpOnly**, pas de JWT dans `localStorage`
- [x] Email vérifié, mot de passe robuste
- [x] Consentements CGU + confidentialité **non** pré-cochés
- [x] `GET/PATCH /me`, photo privée (`POST /me/photo` MIME + 5 Mo)
- [x] Compte suspendu → écran bloqué, pas de tunnel
- [x] `GET /me/export` + demande `DELETE /me` (UI)

### 2.3 Tunnel + espace coach

- [x] Grille lun–sam 10h–19h via `GET /clubs/:id/slots` (`open` / `full` / `blocked` / `past` / `mine`)
- [x] Afficher `amount_cents` **serveur** (10 € / 15 €) — jamais recalculé en React
- [x] `POST /reservations` + `Idempotency-Key` → bouton Payer (URL Raphael)
- [x] Écran signature (embed Raphael) après `awaiting_signature`
- [x] Mes réservations, mes avoirs (`credits_cents`), historique paiements (lecture)
- [x] QR + PDF seulement si `confirmed` — pas d’URL devinable
- [x] Annulation UI → `POST .../cancel` (Junior décide 24 h)
- [x] CTA 44×44, 1 colonne mobile, boutons `width: 100%` petit écran

### 2.4 Sécu / tests Brad

- [x] L’UI ne « cache » pas un leak : si l’API 404, pas de données d’un autre coach
- [x] Prix / `paid` jamais écrits depuis le client
- [~] Headers CSP / clickjacking tunnel paiement + signature (avec Raphael)
- [~] Vérif visuelle 375 px et ~900 px sur chaque page livrée

**Attend Junior :** `GET /slots` + hold **réels** (mock Brad en place). **Attend Raphael :** checkout / pad / QR **prod** (simulateurs Brad en place).

---

## 3. Junior — Lot C

Moteur salles et BO. **Pas** Payplug, **pas** Deciplus, **pas** le pad.

### 3.1 Données + moteur

- [x] Migrations `coach_profiles`, `coach_clubs/spaces`, templates, blocks, tarifs, `coach_reservations`, `coach_credits`, `coach_settings`, audit
- [x] Seed 5 clubs + espaces (slugs boutique)
- [x] Blocages éducative défaut (mer+sam 15–17 h) ; **Portet paramétrable**
- [ ] `GET /clubs/:id/slots` (public : **sans** noms de coachs)
- [ ] `POST /reservations` hold 10 min, `amount_cents` **figé**, `SELECT … FOR UPDATE`
- [ ] Capacité 2 → `SLOT_FULL` (2 POST parallèles = 1× 201 + 1× 409)
- [ ] Max 3 actives (`held` + `awaiting_signature` + `confirmed`) → `ACTIVE_LIMIT`
- [ ] Cron : `held` expiré → `expired` ; créneau passé `confirmed` → `consumed`
- [ ] `POST .../cancel` : > 24 h serveur → `cancelled_credit` + ligne avoir ; < 24 h → `CANCEL_TOO_LATE`
- [ ] Annulation `held` : libère, pas d’avoir
- [ ] Event `reservation.cancelled` / `coach.suspended` pour Raphael
- [ ] Idempotency 24 h sur hold / cancel
- [ ] Anti-IDOR : coach B → résa A = **404** (pas 403)

### 3.2 Back-office

- [ ] Manager : **son club seulement** (JWT `club_id`). `?club_id=portet` si Minimes → 404
- [ ] Direction : 5 clubs, filtres, stats, tarifs, limites, espaces, éducative Portet
- [ ] Liste résas : paiement / signé (bool) / `qr_ready` — **pas** PDF, pas token, pas id Deciplus
- [ ] Blocage / déblocage créneau + audit
- [ ] Suspendre / réactiver un coach (direction) → event Raphael
- [ ] Export CSV = même filtre, même périmètre
- [ ] Avoirs : lecture direction
- [ ] `GET /admin/audit` (manager = son club)

### 3.3 Sécu / tests Junior

- [ ] RLS + tests : manager Minimes vs Portet
- [ ] 4e hold → `ACTIVE_LIMIT`
- [ ] 2e siège concurrent → un seul 409 `SLOT_FULL`
- [ ] Cancel 23 h avant → `CANCEL_TOO_LATE`
- [ ] Coach suspendu → 403 `SUSPENDED` sur hold
- [ ] Idempotency rejouée → même `reservation_id`
- [ ] Créneaux enfants bloqués **en base**, pas en CSS
- [ ] Prix hold : le client ne peut pas forcer 10 € sur un créneau 15 €

**Bloque Brad :** slots + hold. **Bloque Raphael :** `amount_cents` figé + events cancel/suspend + solde avoir.

---

## 4. Intégration (les trois)

Ordre obligatoire :

1. [ ] Junior : `GET /slots` + `POST /reservations` (hold)
2. [ ] Brad : grille + bouton payer sur hold réel
3. [ ] Raphael : Payplug test + pad + PDF privé
4. [ ] Raphael : job Deciplus **seulement** sur `confirmed`
5. [ ] Chaîne complète : hold → payé → signé → mail → QR → grant → T−5 → expire → revoke
6. [ ] Tests cahier instruction §28 **et** sécu API §13
7. [ ] Recette 5 clubs + Portet éducative + 2 espaces / 3 espaces États-Unis

---

## 5. Dépendances

```
Semaine 0 (schéma + OpenAPI + RLS)
        ├── Junior : slots + hold + BO
        │         └── Brad : pages + tunnel UI
        └── Raphael : checkout / signature / QR / bot
                      └── (attend hold + amount_cents + events Junior)
Intégration ── tous ── recette salles
```

Hors lot (ne pas faire) : Stripe, Yousign, Calendly, Firebase, paiement fractionné, 2e système de portes, mélanger ça à la boutique BOXPLUS.

---

## 6. Env — qui remplit

| Variables | Qui |
|-----------|-----|
| `SUPABASE_*`, métier `HOLD_TTL_*` / `CAPACITY_*` | Junior |
| `NEXT_PUBLIC_SITE_URL`, `CLOUDINARY_*` | Brad |
| `PAYPLUG_*`, `PAYPAL_*`, `QR_HMAC_SECRET`, `SYNC_SECRET`, `COACH_BOT_URL`, Resend, `ALERT_*` | Raphael |
| `DECIPLUS_USER` / `PASSWORD` / IMAP | Raphael **sur BotHosting seulement** |
| `MANAGER_EMAIL_*` | Junior (adresses) + Raphael (envoi) |
