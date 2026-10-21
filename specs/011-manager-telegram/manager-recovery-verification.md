# Automatic Manager recovery verification - 2026-10-21

Request: Manager should recover automatically from the footer's unavailable state.

Observed local record: Manager enabled on builtin Codex, paused false, error "Did not finish", retained backing session and queued inputs, no uncertain operations. The old runtime stored this error and refused dispatch until manual recovery.

Implemented in `client/src/main/manager.ts`: retry after 5 seconds with exponential backoff capped at 60 seconds; reset on completed output. Recover retained errors and interrupted sends after app restart. Keep backing identity, assistant/model, workers and decisions. Reconcile before queued input; do not replay begun messages or CLI commands. Cancel recovery on pause, disable, configuration changes, manual recovery and disposal. Recheck lifecycle generation after asynchronous creation. Accept a late successful result without starting another turn. Persist manual-only native refusals across reload.

Manual holds remain for pending native approvals, plan/sign-in refusals, VPN/hook guards, disabled assistants, missing role instructions, provider mismatch and running/uncertain CLI operations. In-flight CLI delivery recovered from disk becomes uncertain and stays paused for review.

Checks passed:

- Full client suite: 1,166 tests, including automatic-recovery cases in `test/manager.test.ts` and the real local CLI socket integration.
- `npm run typecheck`.
- `rtk proxy npm run lint` (actual package command `eslint src test`).
- `npm run build`.
- `git diff --check`.
- Recovery UX Mermaid rendered successfully with installed Chrome to `/private/tmp/geckit-manager-recovery.svg`.

Runtime checks use the real Manager and Sessions, injected provider drivers, controlled timers and actual temporary filesystem reloads. They verify request ordering, no replay, retained backing/model/workers, backoff/reset, reload, interrupted send, lifecycle cancellation, native/guard holds and a delayed creation finishing after pause. They do not verify live inference, Telegram delivery or installed Electron loading. No renderer component, layout or style changed; no new visual review is claimed.

The first sandboxed test run could not bind its Unix socket; the authorized rerun outside the sandbox passed. An RTK-rewritten lint invocation incorrectly included `scripts/dev-bundle.js`; the explicit proxy invocation ran the package's `eslint src test` successfully. Mermaid's default headless browser was absent; the installed Chrome render passed.

At initial verification, changes were local and uncommitted on `main`. Alex subsequently authorized pushing this fix to `main`; delivery is recorded in the day-plan task. No app restart or installation was performed. Unrelated mobile edits retained. No temporary task worktree was created.
