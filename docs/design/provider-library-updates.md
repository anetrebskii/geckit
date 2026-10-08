# Provider library update design

Settings > Libraries keeps the existing compact library rows. A row with a staged version adds `Update ready` and `Apply update`. While applying, the action reads `Applying…` and row actions are disabled. Success removes the ready state, announces `<name> updated.`, and moves keyboard focus to the row's Remove button. Failure leaves the update ready and shows a retryable error below the list.

The interactive prototype mounts the production `SettingsDialog` and stylesheet. Run the client dev server and open:

- `client/src/renderer/settings-preview.html?libraries=1&theme=light`
- `client/src/renderer/settings-preview.html?libraries=1&theme=dark`
- Add `&applyDelay=1` to review progress or `&applyFail=1` to review failure.

Reviewed at the full 1920 × 1080 browser viewport: light and dark hierarchy, row spacing, progress, success announcement, failure copy, and focus after success. Narrow viewport and native GeckIt window review remain pending.
