# Restore the Chrome extension connection on Windows

- Request: Implement the fix for the GeckIt Browser extension staying disconnected on Windows.
- Checkout: `main`, permanent checkout.
- Started: 2026-11-19

## Acceptance conditions

- Start or enable Chrome through GeckIt on Windows. An existing Web Store or unpacked extension can connect through the registered host. Settings shows the existing connection state and `geckit browser status` can reach the extension.
- Turn Chrome through GeckIt off. The registration and launcher are removed and the running host stops on its next heartbeat. Turning it on again restores the connection without reinstalling the extension.
- Existing macOS and Linux installs keep their platform-specific registration and launch behavior.
- Assumption: The report concerns desktop Google Chrome with the normal Windows user account.

## Progress

### 1. Prepare the UX document

- [x] Done. [Chrome connection behavior](../ux/chrome-setting.md#windows-connection) extends the existing flow to Windows.

### 2. Prepare the UI and test it

- [x] Reused the existing connection, setup and disabled states in Settings > Browsers.

### 3. Write the feature code

- [x] [The bridge](../../client/src/cli/browser.ts) registers and removes the Chrome host under the current Windows user and reuses the native host protocol. The build, typecheck and lint for the changed files passed. Project-wide lint still reports 43 errors in five existing packaging scripts.

### 4. Update the related distributed skills

- The existing extension setup and connected-profile commands apply. The test-browser fallback's platform statement covers a separate workflow.

### 5. Update the feature list

- [ ] Proposed an update to the platform wording of the existing Chrome entry. Approval pending.

### 6. Write unit tests

- [x] [Bridge tests](../../client/test/browser-bridge.test.ts) cover Windows registration, the two extension IDs, launcher generation and disable/re-enable with a mocked registry. Full suite passed with 2246 tests and 7 skipped using `npm test -- --maxWorkers=4`.

### 7. Test the feature through UI tools

- The compiled CLI reported extension 1.3.2 connected through real Chrome on macOS. The Settings fixture showed the initial connection, disabled state, reconnection and setup link with its native API stubbed. The Windows VM's guest agent was unavailable, so the Windows handshake could not be exercised. The VM was shut down afterward.

### 8. Test the final UI

- [x] Inspected the existing Browsers pane in light at 1352 × 713 and dark at 1024 × 768. Space toggled the focused switch and the connection card followed the setting. No renderer source or styling changed.

## Result

- Delivery target: `main`.
- Remaining verification: Chrome launching the host and completing the handshake on Windows.
