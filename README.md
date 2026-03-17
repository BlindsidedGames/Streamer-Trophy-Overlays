# PSN Trophy Overlay Suite

Local dashboard + OBS browser-source overlays for PlayStation trophy streaming. The app uses `psn-api` as the live source of truth for overall account stats and recent titles, then layers local SQLite-backed settings and current-game overrides on top.

## Run it

### Development

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm run dev
```

3. Open [http://localhost:5173](http://localhost:5173).

The Vite client proxies `/api/*` to the local Express server on port `4318`.

### Production-style local run

Build the dashboard and the server, then run a single local process:

```bash
npm run build
npm start
```

Open [http://localhost:4318](http://localhost:4318) for the dashboard.

The same local server now hosts:

- Dashboard: `http://localhost:4318/`
- Loop overlay: `http://localhost:4318/overlay/loop`
- Overall overlay: `http://localhost:4318/overlay/overall`
- Current-game overlay: `http://localhost:4318/overlay/current-game`
- Target trophy overlay: `http://localhost:4318/overlay/target-trophy`

## Configuration

This folder includes a local `.env` for non-secret runtime settings like `PORT`.

If you ever need a fresh token, get it from:

- `https://ca.account.sony.com/api/v1/ssocookie`

When the app starts, paste the token into the PSN token field at the top of the Control Room and click `Save token`.
It is stored only on the local machine at `~/.streamer-tools/psn-credentials.json` and is not read from `.env`.

The server still reads:

- `PORT`: optional API port, defaults to `4318`
- `APP_DB_PATH`: optional SQLite file path, defaults to `./streamer-tools.sqlite`

## Routes

- Development dashboard: `http://localhost:5173/`
- Production dashboard: `http://localhost:4318/`
- Production loop overlay: `http://localhost:4318/overlay/loop`
- Production overall overlay: `http://localhost:4318/overlay/overall`
- Production current-game overlay: `http://localhost:4318/overlay/current-game`
- Production target trophy overlay: `http://localhost:4318/overlay/target-trophy`

## What it does

- fetches overall account trophy totals and recent PSN titles
- stores overlay settings and active-game overrides in SQLite
- lets you pick a recent PSN title or switch to a custom current game
- serves three OBS browser-source overlay routes
- shows a dashboard preview that uses the same card components as the overlays

## Notes

- This is the v1 local dashboard/overlay build.
- The existing `trophy-panel.html`, `trophy-border.html`, and `img/` assets are left untouched as design references.
