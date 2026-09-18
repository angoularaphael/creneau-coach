# Bot créneau coachs — prem-eu4:20695

Vendeur Deciplus **JUNIOR**. App : [creneau-coach](https://github.com/angoularaphael/creneau-coach).  
RPA cloné : [boxi-deci-bot](https://github.com/angoularaphael/boxi-deci-bot).

## Panel BotHosting

1. Uploader `index.js` + `.env` (copier `.env.example`, remplir `DECIPLUS_PASSWORD` et `SYNC_SECRET`)
2. Startup : `node index.js`
3. Port : **20695**
4. Volume persistant sur `data/` (session + file)

Health : `http://prem-eu4.bot-hosting.net:20695/health`

Jobs (header `x-sync-secret`) :

- `POST /api/jobs` `{ action: "coach_grant"|"coach_revoke", order_id, club_id, customer, qr_valid_from, qr_valid_to }`
