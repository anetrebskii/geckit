# Manager Team renderer fixture

Run from `client/`: `npx vite --config test/browser/manager-sources/vite.config.ts`.
Open `http://127.0.0.1:5198/test/browser/manager-sources/`. The existing shortcut fixture server also serves the same route on port 5202.

Renders actual Team → Manager, ManagerSettings, Manager shortcut rows, ShortcutList and the phone equivalents with the product stylesheet. Only native APIs are replaced. No provider, host, recording, user settings or Telegram network is accessed.

Use `theme=light|dark`, `preview=phone` for a 390px iframe, or `phone=1` for the phone renderer directly. Existing `state=configured|blocked|pending|multiple` parameters supply legacy Voice Memos settings to confirm they stay absent from Manager UI. The default has no legacy configuration.

Manager has one manual shortcut and one paused CRON shortcut. New shortcut and row editing use the real editor handlers. Save updates synthetic settings; Run records the request and returns a synthetic Manager session ID. `window.sourceFixture.shortcutSaves`, `runs` and `navigations` expose receipts; `failSave=true` tests persistence failure. `saves` records Manager configuration writes; `checks` and `privacyCalls` should remain zero because the retired source UI is absent.

These receipts verify rendering and handler behavior, not disk persistence, actual scheduling, provider compliance, Voice Memos/iCloud access or device integration.

```sh
npx tsc --noEmit -p test/browser/manager-sources/tsconfig.json
```
