# PSN Trophy Overlay Suite

PSN Trophy Overlay Suite is a Windows desktop streamer overlay app for PlayStation trophy streams. It connects to Sony's trophy data through `psn-api`, gives you a local control room for configuring your stream presentation, and serves OBS-friendly local browser-source URLs from your machine.

## What the app does

- loads live PlayStation trophy totals and recent-title data
- serves four local OBS browser-source overlays for loop, overall, current-game, and target-trophy views
- stores overlay settings and active-game overrides in a local SQLite database
- lets you switch between PSN title data and custom current-game overrides without leaving the desktop app

## PSN access setup

To load PlayStation data, the app needs a saved NPSSO token for your account.

1. Sign in to your PlayStation account.
2. Open `https://ca.account.sony.com/api/v1/ssocookie`.
3. Copy the NPSSO token shown by Sony.
4. Launch **PSN Trophy Overlay Suite** and open `PSN access`.
5. Paste the token into the `PSN token` field and click `Save token`.

The saved token stays on your local machine and is not read from `.env`. The app keeps the token in local storage files and does not return the saved value to the UI after it is stored.

The packaged desktop build stores its SQLite database and PSN token in the Electron user-data directory, typically:

- `%APPDATA%\\PSN Trophy Overlay Suite\\streamer-tools.sqlite`
- `%APPDATA%\\PSN Trophy Overlay Suite\\psn-credentials.json`

For source runs, the token is stored locally at `~/.streamer-tools/psn-credentials.json`.

## Download the portable build

GitHub Releases publish the portable Windows build here:

- [Latest release](https://github.com/BlindsidedGames/Streamer-Tools/releases/latest)

To run it:

1. Download the latest `PSN Trophy Overlay Suite-<version>-portable.exe`.
2. Launch the portable `.exe`; no separate installer is required.
3. Save your NPSSO token through `PSN access`.
4. Keep the app running while OBS uses the local browser-source routes below.

After the app is running, OBS can use:

- `http://127.0.0.1:4318/`
- `http://127.0.0.1:4318/overlay/loop`
- `http://127.0.0.1:4318/overlay/overall`
- `http://127.0.0.1:4318/overlay/current-game`
- `http://127.0.0.1:4318/overlay/target-trophy`

Closing the main window asks whether to minimize the app to the tray or quit it. Choosing tray mode keeps the local overlay URLs live while the window is hidden.

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

### Build Windows artifacts locally

To create the local Windows release artifacts:

```bash
npm run dist:win
```

This local packaging flow writes the installer and portable executable to `release/`. GitHub Releases publish only the portable `.exe`.

## Configuration

This folder includes a local `.env` for non-secret runtime settings like `PORT`.

The server reads:

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

## Notes

- This is the v1 local dashboard and overlay build with a Windows Electron desktop shell.
- The existing `trophy-panel.html`, `trophy-border.html`, and `img/` assets are left untouched as design references.
