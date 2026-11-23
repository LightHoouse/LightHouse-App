# Lighthouse Desktop 🔦

A desktop companion that helps students follow computer lab tasks at their own pace.

[Download for Windows](https://github.com/LightHoouse/LightHouse-App/releases) · [Backend](https://github.com/LightHoouse/LightHosue-Backend) · [Organization](https://github.com/LightHoouse)

![CI](https://github.com/LightHoouse/LightHouse-App/actions/workflows/ci.yml/badge.svg)

## What it includes

- A visible desktop control panel with a guide demo and dismiss button.
- A click-through overlay that leaves the student's mouse and keyboard under their control.
- MQTT text commands (`say`), TLS verification, and delivery acknowledgments.
- Validation of command scope and expiry, plus deduplication within one running process.

**Prototype status:** live UIA/CDP locator resolution, action recording, step verification, and the classroom dashboard are not implemented. Pointer commands fail explicitly instead of guessing coordinates. Deduplication does not survive restarts.

## Download

Open [Releases](https://github.com/LightHoouse/LightHouse-App/releases), choose a version, and download its `.exe`. `SHA256SUMS.txt` contains the installer checksum. Windows installers are currently unsigned. The control panel and demo work without MQTT configuration.

## Stack

Electron · TypeScript · MQTT.js · electron-builder (NSIS) · Playwright

## Local setup

Requires Node.js 22+ and Windows for the desktop tests and installer build.

```powershell
npm ci
npm run dev
```

## Configuration

Set these on the Electron process when connecting to a lab broker. Credentials are not included in the installer.

| Variable | Purpose |
| --- | --- |
| `MQTT_URL` | TLS broker URL beginning with `mqtts://` |
| `MQTT_USERNAME`, `MQTT_PASSWORD` | Broker credentials for the client |
| `MQTT_CA_CERT` | Optional trusted PEM certificate for a private or self-signed broker |
| `LIGHTHOUSE_SESSION_ID` | Lab session identifier |
| `LIGHTHOUSE_STUDENT_ID` | Student/client identifier |

The client receives `lab/{sessionId}/student/{studentId}/cmd` and publishes to the corresponding `/ack` topic. TLS verification stays enabled. Session and student IDs must not contain MQTT topic separators or wildcards.

## Verification

```powershell
npm run check
npm test
npm run package
$env:LIGHTHOUSE_TEST_EXE = "$pwd/release/win-unpacked/Lighthouse.exe"
npx playwright test
```

The smoke test opens the actual Electron panel, checks its sandboxed preload, displays the guide, checks the overlay text, and dismisses it. This verifies desktop behavior, not the full classroom workflow.

## Releases

Pull requests, pushes to `master`, and manual runs build and test Windows artifacts. Push a `vX.Y.Z` tag matching `package.json` to publish a release after source and packaged-executable tests pass. Add notes at `docs/releases/X.Y.Z.md` before tagging. The release uses the exact tested artifact and includes the installer, `release-manifest.json`, and `SHA256SUMS.txt`.

Published versions use `vX.Y.Z`; branch artifacts use `<package-version>-ci.<run-number>.<attempt>`. There is no automatic updater yet. Local installers are written to `release/`.

## Project layout

```text
src/main.ts       Desktop windows and MQTT delivery
src/preload.cts   Sandboxed CommonJS bridge
src/ui/           Control panel and guide presentation
scripts/build.mjs Clean TypeScript build and UI assets
smoke.spec.mjs    Source and packaged-app smoke test
```
