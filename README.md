# PSN Trophy Overlay Suite

Local dashboard + OBS browser-source overlays for PlayStation trophy streaming. The app uses `psn-api` as the live source of truth for overall account stats and recent titles, then layers local SQLite-backed settings and current-game overrides on top.

## Download and run on Windows

Install the packaged desktop build from GitHub Releases when you want the normal end-user experience:

1. Open the latest release and download either:
   - the Windows installer
   - the portable `.exe`
2. Launch **PSN Trophy Overlay Suite** from the installer or the portable executable.
3. The desktop app starts its local backend automatically and opens its own window.
4. Keep the app running in the tray while OBS uses these local browser-source routes:
   - `http://127.0.0.1:4318/`
   - `http://127.0.0.1:4318/overlay/loop`
   - `http://127.0.0.1:4318/overlay/overall`
   - `http://127.0.0.1:4318/overlay/current-game`
   - `http://127.0.0.1:4318/overlay/target-trophy`

Closing the main window asks whether to minimize the app to the tray or quit it. Choosing tray mode keeps the overlay URLs live. Use the tray icon to reopen the window or quit the app fully.

The packaged build stores its SQLite database and PSN token in the Electron user-data directory, typically:

- `%APPDATA%\\PSN Trophy Overlay Suite\\streamer-tools.sqlite`
- `%APPDATA%\\PSN Trophy Overlay Suite\\psn-credentials.json`

Uninstall removes the app binaries but leaves this user data in place by default.

## Run from source

### Development

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm run dev
```

3. Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

The Vite client proxies `/api/*` to the local Express server on port `4318`.

### Desktop development

To open the app in its own Electron window while still using the Vite renderer:

```bash
npm run dev:desktop
```

That script builds the server and Electron entrypoints once, starts the Vite dev server, launches Electron, and lets the Electron main process manage the local backend.

### Production-style local run

Build the dashboard and the server, then run the local hosted app without Electron:

```bash
npm run build
npm start
```

Open [http://127.0.0.1:4318](http://127.0.0.1:4318) for the dashboard.

The same local server now hosts:

- Dashboard: `http://127.0.0.1:4318/`
- Loop overlay: `http://127.0.0.1:4318/overlay/loop`
- Overall overlay: `http://127.0.0.1:4318/overlay/overall`
- Current-game overlay: `http://127.0.0.1:4318/overlay/current-game`
- Target trophy overlay: `http://127.0.0.1:4318/overlay/target-trophy`

### Build the Windows release locally

To create the Windows installer and portable executable:

```bash
npm run dist:win
```

Electron Builder writes the packaged artifacts to `release/`.

## Configuration

This folder includes a local `.env` for non-secret runtime settings like `PORT`.

If you ever need a fresh token, get it from:

- `https://ca.account.sony.com/api/v1/ssocookie`

When the app starts, paste the token into the PSN token field at the top of the Control Room and click `Save token`.
For source runs it is stored only on the local machine at `~/.streamer-tools/psn-credentials.json` and is not read from `.env`.

The server still reads:

- `PORT`: optional API port, defaults to `4318`
- `APP_DB_PATH`: optional SQLite file path, defaults to `./streamer-tools.sqlite` for source runs
- `APP_DATA_DIR`: optional base directory for packaged app runtime data
- `PSN_CREDENTIALS_PATH`: optional override for the local PSN token file path

## Routes

- Development dashboard: `http://127.0.0.1:5173/`
- Production dashboard: `http://127.0.0.1:4318/`
- Production loop overlay: `http://127.0.0.1:4318/overlay/loop`
- Production overall overlay: `http://127.0.0.1:4318/overlay/overall`
- Production current-game overlay: `http://127.0.0.1:4318/overlay/current-game`
- Production target trophy overlay: `http://127.0.0.1:4318/overlay/target-trophy`

## What it does

- fetches overall account trophy totals and recent PSN titles
- stores overlay settings and active-game overrides in SQLite
- lets you pick a recent PSN title or switch to a custom current game
- serves three OBS browser-source overlay routes
- shows a dashboard preview that uses the same card components as the overlays

## Notes

- This is the v1 local dashboard/overlay build with a Windows Electron desktop shell.
- The existing `trophy-panel.html`, `trophy-border.html`, and `img/` assets are left untouched as design references.
