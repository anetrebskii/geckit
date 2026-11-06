# Simple full remote control - 2026-11-06

Branch: `feat/simple-remote-control`. Local uncommitted source, no PR, push or release. Codex session `01a1b0dd-e59c-7c03-a0d3-ba7b47aba10d`.

## Delivered behavior

`geckit pair` starts a missing service, enables remote access and prints one copyable code. `pair create --qr` remains a code-only alias. No registered project or second confirmation is required. New encrypted, signed full grants include current and future projects. Existing observation grants retain their server authorization and ask to pair again in the current UI.

The ordinary Chat renderer runs against typed `CoreMethods` and `CoreEvent` through the authenticated WebRTC connection. Renderer API is extracted from preload, not duplicated. A compact computer selector in the existing toolbar switches the whole workspace. No second desktop header or reduced history viewer. Mobile keeps ordinary phone Chat with one computer row. Server storage, conversation selection and drafts use isolated server identities. Native desktop-only actions report unavailability; server paths never fall through to local file operations. This is full core workflow control, not remote operating-system screen control.

## Observed integration

- Actual isolated Node service, CLI, device identities, crypto, WebRTC, persistent state and actual Chat UI. Local mailbox signaling substitutes for managed Firebase in this fixture; recorded plugin substitutes for a signed-in model account.
- New code connects immediately; all projects visible. New task `Remote control verification` persisted on the service and returned its recorded-provider response. Reply `wait` produced a real fixture permission request; Allow once returned `approved:once`. Settings and Manager UI open through the existing renderer.
- Fixture service restart reconnects with fresh state, persisted task count unchanged. Unit test disconnects a pending mutation, rejects it, authenticates again and confirms no replay; a new explicit call succeeds. Backend tests cover full calls, old-scope denial, invalid native/admin methods, failure recovery, reuse and revocation. Binary and undefined argument codec tests pass.
- Actual `alex@192.168.1.97` source installation: headless service ready, zero registered projects, `geckit pair` emits one 43-character line. Browser connected over actual managed signaling and cross-machine WebRTC to `alexs-MacBook-Pro-2.local`; normal empty board/Manager/settings toolbar rendered. No paid model task or credential configuration performed.
- Real remote isolated first-start check: with an empty project list and temporary fixture vault key, pair starts a detached service which survives CLI exit; second pair and old alias emit codes. Isolated HOME without a keychain needs that test-only vault key. Production service uses its existing protected storage.
- Selected fixture conversation and draft restored after switching to the real Mac and back. Local normal Chat entry -> computer menu -> Connect computer -> code -> actual remote Chat -> This computer also restored the local draft. Source selector hit-testing remains reachable over an open conversation backdrop.

## UI review

Actual renderer reviewed at 1440x900 and 390x844, light and dark. Ordinary board, full conversation, preserved draft, source menu, mobile bottom sheet and scrolling remain in context. Long computer names truncate with full name in tooltip. Desktop menu uses existing focus/arrow/Escape behavior; synthetic keyboard dispatch verified Escape closes only the menu and returns focus. Browser CLI real-key automation did not reliably focus a background tab, so physical-keyboard verification is not claimed. Mobile source menu fits and scrolls; no horizontal page overflow observed. Evidence: [desktop light](simple-remote-control-evidence/desktop-light.png), [desktop dark](simple-remote-control-evidence/desktop-dark.png), [restored chat](simple-remote-control-evidence/restored-chat-light.png), [source menu](simple-remote-control-evidence/computer-menu-dark.png), [phone light](simple-remote-control-evidence/phone-light.png), [phone dark](simple-remote-control-evidence/phone-dark.png), [phone menu](simple-remote-control-evidence/phone-menu-dark.png).

## Checks

- Full suite: 129 passed files, 2 skipped; 1747 passed tests, 2 skipped. Run with `node node_modules/vitest/vitest.mjs run --no-file-parallelism`. Default parallel runs race because existing integration tests rebuild the same `out/service` directory; sequential run passes. No unrelated test-harness refactor added.
- `npm run typecheck`: all four targets pass. `node node_modules/eslint/bin/eslint.js src test`: pass.
- Desktop/service/main/preload/renderer production build and mobile Vite production build pass; both include remote-workspace.html. Standalone mobile tsc has pre-existing React import resolution errors; mobile Vite build is the verified build boundary.
- Performance checklist reviewed: existing board/list rows and normal Chat update paths reused. Computer control is one toolbar component. Full connections ignore observation invalidations after initial authentication and use normal core events, avoiding duplicate board snapshot reads. No new per-row formatting, observers or unbounded mutation replay. This is a structural review and small-fixture interaction check, not a 10,000-card performance benchmark.

## Delivery boundaries

Remote source update installed in `/Users/alex/Projects/mine/geckit`; existing headless service and login LaunchAgent remain. MiniMax Code 0.7.6 installed globally and executable; account sign-in/model execution is user setup. Real user's Alex2 device preserved; only our GeckIt client test device is removed after verification. After Alex requested a restart and the toolbar correction, the source desktop was rebuilt and restarted (PID 91192 -> 51327), preserving the existing service PID 85261. Both processes remained alive after 48 seconds and the restart log contained no connection errors. Native app inspection was denied by Computer Use; the rendered correction was reviewed through the browser harness.

Forced TURN, external NAT, physical iPhone, Windows/Linux packaging and Electron file:// execution of this new iframe remain unverified. No system-wide GUI installed on the remote Mac. Optional canonical feature-list entry was proposed to Alex and remains unchanged pending his answer.

Final remote delivery: all 53 intended source/evidence files matched SHA-256 after transfer. Remote typecheck, lint and full production build passed; service remained ready at PID 32979 with no working tasks/provider failures. Test grant 351aa6ae-7915-4262-b485-0327d8563ed2 revoked; Alex2 grant preserved. Owned test tabs and both Vite harnesses closed; fixture service stopped. Existing legacy peer API unknown signatures remain unchanged by the renderer extraction; no new public unknown types added.

## Toolbar correction after switching computers

Alex's screenshot exposed two issues in the actual Electron window: the remote iframe always applied `framed`, removing the macOS window-button inset, and its `title` produced a whole-frame tooltip over the toolbar. Remote workspaces now inherit the client window's frame mode independently of the server OS; phone keeps its existing framed layout. Chat initialization preserves that inherited mode. The iframe uses an accessible `aria-label` without a hover title.

Checked the actual renderer through the GeckIt browser CLI with an isolated real Node service and real encrypted WebRTC; provider history and native Electron boundaries are fixtures. Measured macOS-style head padding at 82 px before/after switching, framed-client padding at 12 px. Ordinary Chat -> Connect computer -> fixture server -> This computer restored the local toolbar and removed the iframe. Computer menu opened normally; browser Escape closed it and restored visible focus. No whole-frame tooltip remained after pointer entry. Reviewed full rendered desktop screens at 1565x940 in light/dark and at 1200x800 in light, plus phone 390x844 in light/dark, including the long server name and open computer menu; no horizontal overflow. Native window-button hit-testing was unavailable because Computer Use access to GeckIt Local was denied.

Focused web typecheck and ESLint passed. Desktop production build and mobile production build passed. No new row work, animation, formatter, observer or service polling; performance checklist has no newly touched hot path. The full 1747-test suite result above predates this cosmetic correction and was not repeated. Evidence: [desktop light](simple-remote-control-evidence/switch-titlebar-light.png), [desktop dark/menu](simple-remote-control-evidence/switch-titlebar-dark-menu.png), [1200 px/focus](simple-remote-control-evidence/switch-titlebar-1200-light.png), [phone light](simple-remote-control-evidence/switch-titlebar-phone-light.png), [phone dark](simple-remote-control-evidence/switch-titlebar-phone-dark.png).

Toolbar verification cleanup: both owned browser tabs closed, both Vite harnesses stopped and isolated fixture service stopped. Current correction is local source only; the remote headless service does not render this toolbar.

## Computers setup header correction

The setup screen also overrode the ordinary `.board-head` start padding with 12 px. Removed that override, retaining the normal macOS inset and an explicit 12 px phone inset. This is a CSS-only correction to the existing setup screen. Actual rendered header/button/title positions now start at 82/82/116 px on the macOS-style client; framed and phone clients retain 12 px.

Reviewed full Computers screens at 1565x900 and phone 390x844 in light/dark using the actual Servers component and styles. Checked Cancel, reopen, empty-code disabled state, invalid-code message and Back callback (fixture reload). At 390x500 the body scrolled 249 px, keeping the input and header reachable without horizontal overflow. Browser Tab did not establish a reliable keyboard-focus result in the background test tab; no new keyboard behavior was added or claimed. This fixture substitutes only unavailable native boundaries and uses isolated service data; no real account/model or saved production connection was changed. Native window-button hit-testing remains unavailable after Computer Use access was denied.

Desktop and mobile production builds passed; `git diff --check` passed. Performance review: only one header's padding changed, with no hot-path or animation changes; mobile rebuilt. Full tests were not repeated for this CSS change. Evidence: [light](simple-remote-control-evidence/computers-header-light.png), [dark](simple-remote-control-evidence/computers-header-dark.png), [phone light](simple-remote-control-evidence/computers-header-phone-light.png), [phone dark](simple-remote-control-evidence/computers-header-phone-dark.png).

Applied the setup-header build by restarting local desktop PID 51327 -> 69477, retaining service PID 85261. Restart log remained empty and both processes stayed alive. Owned browser tab, Vite server and isolated fixture service stopped. Native UI inspection remains unavailable; browser renderer review passed.
