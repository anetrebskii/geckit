# Browser profile Settings renderer fixture

Run `npx vite --config test/browser/browser-profiles/vite.config.ts` from `client`, then open `http://127.0.0.1:5231/test/browser/browser-profiles/index.html?theme=light` or `?theme=dark`. Add `&empty=1` for an initially empty list.

Open Settings > Web Browser. This mounts the production SettingsDialog and BrowserProfiles component with the production stylesheet. Only Electron's unavailable browser API boundary is replaced. Fixture controls cover empty/long lists, held operations, create/open/delete/live-view/refresh errors, retry and request receipts. Polling uses Settings' normal two-second refresh.

No disk persistence, actual Camoufox launch, website login, account authentication or paired-computer connection is verified by this fixture.

Camoufox installation notices: `&install=absent`, `&install=downloading`, `&install=installing`, `&install=failed`; `&migrated=1` shows the preserved-Chrome-profile notice. These are renderer states only. The opt-in `test/camoufox-browser.integration.test.ts` exercises the compiled real Camoufox driver with isolated persistent profiles and a local synthetic sign-in server. Set `GECKIT_CAMOUFOX_INTEGRATION=1`, `GECKIT_CAMOUFOX_TEST_BINARY` to the browser executable and `GECKIT_BROWSER_TEST_CLI` to the built CLI, then run `npm test -- camoufox-browser.integration`. It verifies cookies/storage across close, rename and archive restore, plus live view, cursor events and conversation ownership; no real website account is contacted.
