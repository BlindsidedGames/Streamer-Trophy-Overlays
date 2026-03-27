# Streamer Tools Agent Instructions

## Versioning

- Do not increment the app version on every build.
- Only increment the version when the user explicitly asks for it.
- The version source of truth is `package.json`; keep `package-lock.json` in sync when the version changes.
- If the user asks to "increment the build number" without naming an exact version, bump the semver patch before building, for example `0.1.0` -> `0.1.1`.
- If the user gives an explicit target version, use that exact version instead.

## Portable Windows Build

- Build from the repo root: `C:\Users\mattr\Documents\Repositories\Streamer Tools`
- Run: `npm run dist:win:portable`
- Expected artifact path: `C:\Users\mattr\Documents\Repositories\Streamer Tools\release\PSN Trophy Overlay Suite-<version>-portable.exe`
- The packaging script stages the app in `%LOCALAPPDATA%\Temp\streamer-tools-win-build\app` to avoid failures caused by spaces in the repo path.
- If the build fails with `EPERM` or a locked `build` or `build/electron` directory, check for a running Electron app from this repo, stop that process, and rerun the build.
- If the build succeeds through packaging but fails while replacing files in `release`, a previously launched portable app is usually still locking `release\PSN Trophy Overlay Suite-<version>-portable.exe`.
- In that case, close the portable app or run `taskkill /IM "PSN Trophy Overlay Suite.exe" /F`, then remove the stale `release` folder with `rmdir /s /q release`, and rerun `npm run dist:win:portable`.
- `tasklist | findstr /I "PSN Trophy Overlay Suite.exe"` is a quick way to confirm whether a packaged instance is still running before retrying the build.
- The packaging script already retries unsigned local packaging with `-c.win.signAndEditExecutable=false` if Windows code-sign resource editing fails.

## Required Success Reply

After a successful portable build, verify the artifact and reply with this exact shape:

`Built successfully to C:\Users\mattr\Documents\Repositories\Streamer Tools\release\PSN Trophy Overlay Suite-<version>-portable.exe`

`Artifact: <absolute artifact path>`

`Last written: <timestamp>`

`Size: <bytes>`

`SHA-256: <hash>`

## Build When Also Incrementing Version

- If the user asks for both a version bump and a portable build, update the version first, then run the portable build, then report the artifact metadata above.
- Do not infer a version bump from the fact that a build is happening. Only do it when the user asks.
