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

## VPN lookup correction - 2026-10-21

Follow-up screenshot showed `VPN_IP_UNAVAILABLE_ERROR`. Read-only local-state inspection confirmed Manager enabled and unpaused with a retained backing session, queued work, `error: "Not sent"`, `manualRecovery: true` and a held message carrying the exact lookup-unavailable reason. No private prompt text or credentials were copied into evidence.

The first implementation deliberately excluded every VPN guard failure. This correction narrows that hold: temporary lookup unavailability schedules automatic fresh checks, while mismatch/configuration errors remain manual. The authorized Sessions retry preserves Manager identity and bypasses only ordinary-chat routing; every send still passes the normal IP guard. A known-unsent message retains its exact content; a monitor-interrupted active turn gets reconciliation instead of the original request. Old saved manual-only lookup holds recover without editing the stored data. Manual Try again now retries the held message instead of queuing behind it.

Behavioral checks exercise Manager and Sessions together with fake IP outcomes/provider drivers and real temporary persistence. They cover unavailable checks with no provider creation; increasing retry delay; approved recovery exactly once before queued Telegram input; reload of the old manual-only record; manual retry without a dead queue; transition to an unapproved-IP hold; native approval answers staying held; cancellation during pending checks on pause/disable/restart; and monitor-triggered continuation without original-prompt replay. The initial native-answer regression expected success, but the existing API correctly rejected the blocked answer; the assertion now verifies that rejection and absence of automatic delivery.

This is backend-only verification. No real VPN outage/reconnection, live provider inference, Telegram delivery or newly loaded installed app is claimed. The active app/conversations were not restarted. No temporary task worktree was created; unrelated mobile changes remain outside this correction.

Correction validation passed: full client suite 1,177 tests; `npm run typecheck`; `rtk proxy npm run lint` (`eslint src test`); `npm run build`; and `git diff --check`. The earlier focused Manager/Sessions/VPN run passed 345 tests before the final native-answer regression was added; the full suite includes that regression.
