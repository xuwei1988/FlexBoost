# FlexBoost

Static host for firmware files consumed by the FlexChar app.

## Layout

- `releases.json`: release metadata consumed by app Firmware Update page.
- `firmware/`: uploaded firmware assets (`.txt` / `.bin`).
- `index.html`: optional human-readable landing page.

## Release contract

The app fetches `releases.json` and supports:

- `latest_version`: integer
- `releases[]`: records with
  - `version` (int)
  - `version_name` (string)
  - `file_name` (string)
  - `file_ext` (string, e.g. `.txt` / `.bin`)
  - `file_url` (string; relative URLs are allowed)
  - `size` (int bytes)
  - `sha256` (optional string)
  - `target` (`dcdc_txt` or `esp32_bin`)
  - `notes` (optional string)
