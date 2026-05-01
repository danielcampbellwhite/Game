# Mafia Life

Single-player persistent browser-based crime/mafia life simulator.

## Stack

- **Client**: React 18 + Vite + Tailwind CSS + React Router
- **Server**: Node 22+ (`node:sqlite`) + Express + JWT
- **DB**: SQLite (file-based, zero-config)

## Quickstart (local dev)

```bash
# Install everything
npm run install:all

# Run client and server together (server :4000, client :5173)
npm run dev
```

Then open http://localhost:5173 — register an account, create a character, start hustling.

## Layout

```
mafia/
├── server/   Express + SQLite API
├── client/   React + Vite SPA
└── data/    SQLite file (gitignored)
```

## Persistence model

The world is "lazily persistent": no cron, no websockets. Every time the
player loads (`GET /api/character`), the server computes how much energy /
nerve / health / business income / market drift has accrued since
`last_tick` and applies it. State stays accurate even after weeks offline.

Real-time events (PvP, OC invites, DMs) are pushed via Server-Sent Events.

## Core systems

Crimes, jail, hospital, jobs, travel, drug arbitrage, businesses, money
laundering, combat, banking, stocks, property, training, daily rewards,
inventory, action log, casino, bookmaker, gangs, turf wars, organised
crimes — all in `server/src/routes/*.js`.

## Deployment

The server serves the built React SPA same-origin (so client and API
share one host). Build pipeline:

```bash
npm install   # cross-installs server + client deps via postinstall
npm run build # builds client to client/dist
npm start     # runs the server, which serves the SPA + /api
```

### Required env vars

| Var          | Purpose                                                     |
|--------------|-------------------------------------------------------------|
| `JWT_SECRET` | Required in production (`NODE_ENV=production`); long random |
| `PORT`       | Optional; defaults to 4000                                  |
| `DATA_DIR`   | Optional; defaults to `<repo>/data`. Point at a volume in production |
| `NODE_ENV`   | Set to `production` on hosting platforms                    |

### Railway

1. Connect this repo, let Railway auto-detect Node + run the build.
2. Add a **Volume** mounted at e.g. `/data` and set `DATA_DIR=/data`.
3. Set `NODE_ENV=production` and `JWT_SECRET=<long random>`.
4. (Optional) `PORT` is provided automatically by Railway.

### Fly.io

Roughly: `fly launch` → accept defaults → `fly volumes create mafia_data
--size 1` → mount it in `fly.toml` → `fly secrets set JWT_SECRET=…
NODE_ENV=production DATA_DIR=/data` → `fly deploy`.

## Seeding test players

```bash
node --experimental-sqlite server/scripts/seed-players.mjs
```

Wipes everything and inserts 100 random characters (login password
`password` for each). **Destructive — do not run against production.**
