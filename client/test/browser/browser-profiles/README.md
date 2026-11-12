# Browser profile Settings renderer fixture

Run `npx vite --config test/browser/browser-profiles/vite.config.ts` from `client`, then open `http://127.0.0.1:5231/test/browser/browser-profiles/index.html?theme=light` or `?theme=dark`. Add `&empty=1` for an initially empty list.

Open Settings > Web Browser. This mounts the production SettingsDialog and BrowserProfiles component with the production stylesheet. Only Electron's unavailable browser API boundary is replaced. Fixture controls cover empty/long lists, held operations, create/open/delete/live-view/refresh errors, retry and request receipts. Polling uses Settings' normal two-second refresh.

No disk persistence, actual Chrome launch, website login, account authentication or paired-computer connection is verified by this fixture.
