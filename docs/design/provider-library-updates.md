# Provider library update design

Settings > Libraries keeps the existing compact library rows. A row with a staged version adds `Update ready` and `Apply update`. While applying, the action reads `Applying…` and row actions are disabled. Success removes the ready state, announces `<name> updated.`, and moves keyboard focus to the row's Remove button. Failure leaves the update ready and shows a retryable error below the list.

A failed library with a known ID and GitHub source adds `Reinstall` beside `Remove`. While cloning and validating, it reads `Reinstalling…` and Remove is disabled. Success replaces the failed row with the loaded library, announces `<name> reinstalled.`, and focuses its Remove button. Failure keeps the failed row and shows the reason. Reinstall is hidden when the source or ID is unknown.

The interactive prototype mounts the production `SettingsDialog` and stylesheet. Run the client dev server and open:

- `client/src/renderer/settings-preview.html?libraries=1&theme=light`
- `client/src/renderer/settings-preview.html?libraries=1&theme=dark`
- Add `&applyDelay=1` to review progress or `&applyFail=1` to review failure.
- Add `&failed=1` to show a failed Claude tmux library; add `&reinstallDelay=1` or `&reinstallFail=1` to review reinstall progress or failure.

Reviewed at the full 1920 × 1080 browser viewport: light and dark hierarchy, row spacing, progress, success announcement, failure copy, and focus after success. Narrow viewport and native GeckIt window review remain pending.
