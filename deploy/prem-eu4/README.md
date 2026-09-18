# Bot créneau coachs — prem-eu4:20695

Vendeur Deciplus **JUNIOR**. IMAP **jeremyfidge@gmail.com**.  
App : [creneau-coach](https://github.com/angoularaphael/creneau-coach) → dossier `bot/`.

## Panel BotHosting

1. Uploader `index.js` + `.env` (copier `.env.example`)
2. Remplir **DECIPLUS_PASSWORD**, **DECIPLUS_IMAP_PASS** (app password Gmail), **SYNC_SECRET**
3. Startup : `node index.js`
4. Port : **20695**
5. Volume persistant sur `data/` (file + session)

Health : `http://prem-eu4.bot-hosting.net:20695/health`  
Tant que IMAP n’est pas fait : `imap.configured: false`.

Jobs (header `x-sync-secret`) :

- `POST /api/jobs` `{ action: "coach_grant"|"coach_revoke", order_id, club_id, customer, qr_valid_from, qr_valid_to }`

IMAP : voir [../../bot/README.md](../../bot/README.md).
