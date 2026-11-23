# Lighthouse Desktop 🔦

A small lab companion that turns an assistant's demonstration into guidance on a student's own screen.

[Download for Windows](https://github.com/LightHoouse/LightHouse-App/releases/latest) · [Backend](https://github.com/LightHoouse/LightHosue-Backend) · [AI service](https://github.com/LightHoouse/LightHouse-AI)

## Use it

1. **Assistant:** enter your name, create a group, and share its code.
2. Click **Record** on the floating toolbar, then demonstrate across your applications.
3. Use **Pause / Resume** as needed, then **Stop** to save the session. No manual step notes are needed.
4. **Student:** join with your name and the group code. Lighthouse stays beside your cursor.
5. Press **Alt+L** while working to open chat beside your mouse. Ask a question; Lighthouse uses the active application and the latest group recording to highlight a matching control. You perform the action yourself.

No MQTT, database, or AI credentials are needed in the installer. HTTPS connects to `lighthouse-be.yanzz.dev`; the backend owns group membership and AI access. Student questions and visible control names are sent to the service. Typed contents and password fields are not recorded. Membership is encrypted locally using Electron safeStorage and Windows protection. Groups expire after seven days.

## What works

- Create/join groups with assistant and student roles; assistants can disable questions for assessments.
- Native Windows UI Automation recording of accessible targets, mouse clicks, typing events without text, and scroll events.
- Sequential guidance and AI selection from the group's recorded steps.
- Live target resolution by AutomationId or control type/name, including relocated windows.
- Explicit failure for ambiguous or missing targets; a click-through highlight never takes control of input.
- Source and packaged two-client E2E tests against a real MongoDB test instance and a separate native Windows target.

This is a Windows prototype. Custom-drawn controls, elevated apps, complex menus, and browser DOM locators are not covered. The app does not execute actions or verify task completion. Recording buffers do not survive a process crash. The installer is unsigned.

## Development

Requires Windows x64, Node.js 22+, and the .NET Framework 4.x compiler/UI Automation assemblies included with supported Windows installations.

```powershell
npm ci
npm run dev
```

The build compiles `native/Bridge.cs` into a helper shipped alongside Electron. The UI runs in a sandboxed renderer; API credentials and native process control stay in the main process.

Optional process configuration: `LIGHTHOUSE_BACKEND_URL` selects an HTTPS backend (localhost HTTP is allowed for development). `LIGHTHOUSE_PROFILE_DIR` gives a separate encrypted membership profile, useful for testing two clients on one machine.

## Verification

Clone the backend beside this repo, install its dependencies, and build it first. Tests start an isolated MongoDB instance and backend; they never need production credentials.

```powershell
npm --prefix ../backend ci
npm --prefix ../backend run build
npm test
npm run package
$env:LIGHTHOUSE_TEST_EXE = "$pwd/release/win-unpacked/Lighthouse.exe"
npx playwright test
```

Set `LIGHTHOUSE_E2E_BACKEND_DIR` if the backend checkout is elsewhere. `LIGHTHOUSE_E2E_URL` explicitly selects a deployed backend for a live AI E2E trial. The test creates and closes its own group. Native input tests temporarily use the desktop, so avoid interacting during the test.

## Releases

Push a `vX.Y.Z` tag matching `package.json` after adding `docs/releases/X.Y.Z.md`. CI checks the source, records and resolves real native controls with two clients, packages the app, and repeats the test against the packaged executable. Only that tested installer is published, with `release-manifest.json` and `SHA256SUMS.txt`. Branch builds create artifacts without publishing releases. There is no automatic updater yet.
