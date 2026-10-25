# Manager task sources renderer fixture

Run from `client`: `npx vite --config test/browser/manager-sources/vite.config.ts`.
Open `http://127.0.0.1:5198/test/browser/manager-sources/`.

The actual SettingsDialog, ManagerSettings, ManagerSources and product stylesheet render in the browser. Only the native API boundary is replaced. No host, recording, credentials, provider or Telegram network is accessed.

Query parameters: `state=empty|configured|blocked|pending|access|missing|unsupported|transcription|multiple`, `theme=light|dark`, and `zone=<saved time zone>` for any state but `empty`.
The fixture exposes `window.sourceFixture.saves` for observable configure receipts; `checks`/`privacyCalls` record read-only native calls, `connection` configures their result, and `checkDelay` allows lifecycle checks; `failSave=true` simulates a persistence failure and `failCheck=true` a connection failure. Done closes Settings and Open Settings reopens it, so a delayed probe can be checked across unmount. Initial rendering and editing do not write settings. Save records only the intake configuration. This is browser fixture evidence, not native Voice Memos/iCloud, classifier or Telegram verification.
