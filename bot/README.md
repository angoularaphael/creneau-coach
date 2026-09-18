# Bot créneaux coachs — Deciplus JUNIOR

Dossier autonome, **sans BOXPLUS**. Déployé sur BotHosting  
`http://prem-eu4.bot-hosting.net:20695`

- Vendeur Deciplus : **JUNIOR** / mot de passe dans `bot/.env` (jamais Git)
- 2FA e-mail : **jeremyfidge@gmail.com** (IMAP)
- App : `https://coach.boxingcenter.fr` → `POST /api/jobs` header `x-sync-secret`

## IMAP pas encore fait — à faire sur jeremyfidge@gmail.com

Le bot sait déjà lire le code Deciplus (imapflow). Il manque le **mot de passe d’application Gmail**.

1. Se connecter à [Gmail](https://mail.google.com) avec **jeremyfidge@gmail.com**
2. Roue → **Voir tous les paramètres** → onglet **Transfert et POP/IMAP** → **Activer IMAP** → Enregistrer
3. [Validation en 2 étapes](https://myaccount.google.com/signinoptions/two-step-verification) **obligatoire** (sinon Google refuse les app passwords)
4. [Mots de passe des applications](https://myaccount.google.com/apppasswords)  
   Application : **Mail** · Appareil : **Autre** → nom `creneau-coach-bot` → Générer
5. Copier les **16 caractères** dans `bot/.env` :

```env
DECIPLUS_IMAP_USER=jeremyfidge@gmail.com
DECIPLUS_IMAP_PASS=xxxx xxxx xxxx xxxx
```

(Les espaces 4×4 sont acceptés, le bot les enlève.)

6. Dans Deciplus, vérifier que le compte **JUNIOR** a bien **jeremyfidge@gmail.com** comme e-mail (sinon le code 2FA n’arrive pas dans cette boîte).
7. Test local :

```bash
cd bot
npm install
npm run test:imap
```

Succès = `IMAP OK` + nombre de mails Inbox 24 h.  
Échec `AUTHENTICATIONFAILED` = mauvais app password, 2FA off, ou IMAP off.

## Lancer le bot

```bash
cd bot
cp .env.example .env   # déjà prérempli en local
npm install
npm start
```

- Health (public) : `http://localhost:20695/health` → `imap.configured: false` tant que `DECIPLUS_IMAP_PASS` est vide
- Jobs : `POST /api/jobs` + header `x-sync-secret`  
  `{ "action": "coach_grant"|"coach_revoke", "order_id", "club_id", "customer", "qr_valid_from", "qr_valid_to" }`

Les jobs restent **en file** tant que l’IMAP n’est pas branché (pas d’échec silencieux).

## BotHosting (prem-eu4)

Voir [../deploy/prem-eu4](../deploy/prem-eu4) : clone `creneau-coach`, lance `bot/start.js`, port **20695**.

Le `.env` du panel = copie de `.env.example` avec `DECIPLUS_PASSWORD`, `DECIPLUS_IMAP_PASS` et `SYNC_SECRET` remplis.
