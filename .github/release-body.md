## Windows portable build

PSN Trophy Overlay Suite is a local Windows desktop control room plus OBS browser-source overlay app for PlayStation trophy streaming. It reads live PSN trophy data from Sony through `psn-api`, stores your overlay settings locally, and serves local browser-source URLs for OBS.

## Included asset

- `PSN Trophy Overlay Suite-<version>-portable.exe`: portable Windows build with no installer required

## Getting started

1. Download and run the portable `.exe`.
2. In the app, open `PSN access`.
3. Sign in to PlayStation, open `https://ca.account.sony.com/api/v1/ssocookie`, and copy your NPSSO token.
4. Paste the token into the app and click `Save token`.
5. Keep the app running while OBS uses the local overlay URLs on `http://127.0.0.1:4318/`.
