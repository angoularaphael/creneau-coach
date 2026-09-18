# Plateforme réservation coachs — Boxing Center

Contrat d’équipe (semaine 0) :

- [Cahier d’API](docs/CAHIER-API.md)
- [Répartition des tâches](docs/REPARTITION-TACHES.md)
- [OpenAPI 3.1](docs/openapi.yaml)
- [`.env.example`](.env.example) — `COACH_BOT_URL=http://prem-eu4.bot-hosting.net:20695`
- BotHosting créneau : [bot/](bot/) — vendeur **JUNIOR**, IMAP **jeremyfidge@gmail.com**, `http://prem-eu4.bot-hosting.net:20695`
- Appel panel : [`bootstrap.js`](bootstrap.js) → `/home/container/index.js` (`node bootstrap.js`)
- Panel : [deploy/prem-eu4](deploy/prem-eu4)
- Repo : https://github.com/angoularaphael/creneau-coach

```bash
cd coach-reservation
cp .env.example .env.local
npm install
npm start   # :3041
```
