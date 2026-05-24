# FlexBoost

Firmware dashboard and API host consumed by the FlexChar app.

## Layout

- `login.html`: dashboard sign-in page (password required).
- `index.html`: dashboard UI (upload + active management + history).
- `privacy.html`: Flexchar App privacy policy (EN + ZH). App Store URL: `https://flex-boost.vercel.app/privacy.html`.
- `api/`: Vercel serverless API routes.
- `releases.json`: legacy bootstrap source (optional fallback).
- `firmware/`: locally tracked firmware sample files.

## Runtime API contract

- `GET /api/firmware`
  - grouped lists (`bin_files`, `txt_files`)
  - active pointers
  - full `firmware_history`
- `POST /api/upload`
  - JSON payload: `fileName`, `contentBase64`, optional `versionName`, `notes`, `version`
- `POST /api/set-active`
  - JSON payload: `id`, `group` (`bin` / `txt`)
- `POST /api/delete`
  - JSON payload: `id` — removes the record, deletes the Blob object when `file_url` is an `https://` URL, reconciles active in that group (promotes newest remaining or clears)
- `GET /api/active`
  - app-facing active firmware payload (`active_bin`, `active_txt`, `releases`)
- `POST /api/login`
  - JSON payload: `password` — sets an HttpOnly session cookie on success
- `POST /api/logout`
  - clears the dashboard session cookie
- `GET /api/session`
  - returns `{ authenticated, passwordConfigured }` for the dashboard UI

Dashboard routes (`/api/firmware`, `/api/upload`, `/api/set-active`, `/api/delete`) require a valid session cookie. `GET /api/active` stays public for the FlexChar app.

`middleware.js` redirects unauthenticated requests for `/` and `/index.html` to `login.html` before the static dashboard page is served.

## Vercel setup

Set these environment variables in Vercel project settings:

- `BLOB_READ_WRITE_TOKEN`: required by `@vercel/blob`.
- `DASHBOARD_PASSWORD`: required for dashboard sign-in.
- `DASHBOARD_SESSION_SECRET` (optional): HMAC secret for session cookies. Defaults to `DASHBOARD_PASSWORD` when omitted.

Then deploy normally. The dashboard writes metadata into Blob path:

- `metadata/firmware-state.json`
