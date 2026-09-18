# Plateforme réservation coachs — Boxing Center

Contrat d’équipe (semaine 0) :

- [Cahier d’API](docs/CAHIER-API.md)
- [Répartition des tâches](docs/REPARTITION-TACHES.md)
- [OpenAPI 3.1](docs/openapi.yaml)
- [Schéma Supabase](supabase/) — Junior, tables `coach_*`
- [`.env.example`](.env.example) — `COACH_BOT_URL=http://prem-eu4.bot-hosting.net:20695`
- BotHosting créneau : [bot/](bot/) — vendeur **JUNIOR**, IMAP **jeremyfidge@gmail.com**, `http://prem-eu4.bot-hosting.net:20695`
- Appel panel : [`bootstrap.js`](bootstrap.js) → `/home/container/index.js` (`node bootstrap.js`)
- Panel : [deploy/prem-eu4](deploy/prem-eu4)
- Repo : https://github.com/angoularaphael/creneau-coach

## Lots

| Lot | Qui | Stack |
|-----|-----|--------|
| A | Raphael | `server.js` Express (paiement, signature, QR, bot) — `npm run api:raphael` |
| B | Brad | Next.js 14 (site public, auth UI, espace coach) — `npm run dev` |
| C | Junior | Schéma Supabase + moteur créneaux / BO |

## Brad — démarrage UI

```bash
cp .env.example .env.local   # remplir NEXT_PUBLIC_SITE_URL + CLOUDINARY_*
npm install
npm run dev                  # http://localhost:3000
```

DoD semaine 0 — slots mock contrat-compatible :

```bash
# PowerShell :
Invoke-RestMethod "http://localhost:3000/api/v1/clubs/minimes/slots?from=2026-09-21&to=2026-09-27"
npm run test:slots           # avec le dev server allumé
```

### Auth (Lot B)

- Pages : `/auth/inscription`, `/auth/connexion`, `/espace-coach`, `/espace-coach/profil`
- Session **httpOnly** (Supabase SSR ou mock `COACH_AUTH_MOCK=1`) — pas de JWT dans `localStorage`
- Consentements CGU / confidentialité **non** pré-cochés
- Compte suspendu → `/espace-coach/suspendu` (pas de tunnel)
- API : `GET/PATCH/DELETE /api/v1/me`, `GET /api/v1/me/export`

### Tunnel réservation (Lot B UI + mock API)

Chaîne : grille → hold → checkout → sync paiement → signature → QR

```bash
npm run test:lot-b
```

Quand Junior / Raphael livrent le vrai backend, retirer les mocks et pointer `COACH_API_HTTP=1` vers l’API réelle.

## Raphael — API Lot A

```bash
npm run api:raphael          # :3041
```

## Bot Deciplus

```bash
npm run bot                  # ou npm run bootstrap sur BotHosting
```
