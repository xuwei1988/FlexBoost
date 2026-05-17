# FlexBoost

Firmware dashboard and API host consumed by the FlexChar app.

## Layout

- `index.html`: dashboard UI (upload + active management + history).
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
- `GET /api/active`
  - app-facing active firmware payload (`active_bin`, `active_txt`, `releases`)

## Vercel setup

Set these environment variables in Vercel project settings:

- `BLOB_READ_WRITE_TOKEN`: required by `@vercel/blob`.

Then deploy normally. The dashboard writes metadata into Blob path:

- `metadata/firmware-state.json`
