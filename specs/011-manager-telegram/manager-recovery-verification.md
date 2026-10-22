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

## CLI delivery recovery correction - 2026-10-21

The supplied screenshot showed a paused Manager. Read-only inspection of the local durable record confirmed its backing Codex session matched the screenshot, 16 queued requests and a single uncertain `telegram send-file`. Its recorded error was `Previous Telegram delivery is uncertain. Check the paired chat before requesting another file send.` The bridge's connection-wide uncertainty flag had refused a fresh file before upload, and Manager then paused all coordination because the refusal text contained "uncertain". No credential, private request or file content was copied into this evidence.

Implemented:

- CLI uncertainty schedules the existing 5-to-60-second automatic recovery instead of pausing Manager. Reconciliation receives unresolved operations, precedes queued requests and never replays mutations. Remaining actions from the interrupted output batch are discarded until fresh reconciliation.
- Old automatic delivery pauses migrate on load. Explicit user pauses have a durable reason and survive reload. Backing identity, selected assistant/model, workers, queues and actual approval/security holds remain intact.
- Read-only failures return usable failure context; interrupted reads are failed reads with no delivery-review decision. Fresh reads use new operation IDs.
- Authenticated host results are stored before replying to the CLI. Lost replies recover the receipt; late success or definite failure updates the operation and retires its obsolete uncertainty decision without executing again.
- Telegram uncertainty applies to the selected upload's fingerprint, saved before sending and retained after an unknown result or restart. The fingerprint includes bytes, sanitized filename, format and worker identity; captions and replacement Manager identities cannot bypass it. An uncertain text message or different file no longer disables all uploads. `/resume` can still clear reviewed holds deliberately.

Behavioral verification uses the real Manager, Sessions, command gateway, Telegram bridge, temporary disk persistence and file operations, with injected provider drivers, fake Bot API responses and controlled retry timers. The composed recovery scenario attempts one uncertain upload, recovers without manual resume, continues queued input and sends a different selected file. The original upload remains uncertain and is not repeated. Separate checks cover legacy paused records for reads and mutations, retained model/worker identity, lost CLI replies without duplicate workers, late receipts, explicit pause across reload, caption-change duplicate protection and in-flight upload recovery across restart. The existing local Unix-socket CLI transport test remains real.

Regression proof: in a separate snapshot of the pre-fix HEAD, the same two targeted checks fail for the reported reasons: Manager stays `paused` after uncertain upload; a fresh file after an uncertain text message is rejected by the global delivery hold. After the fix both pass. Initial snapshot setup lacked `tsconfig.base.json`; restoring all tracked TypeScript configs allowed the actual behavioral failures to run. Baseline output: `/private/tmp/geckit-cli-recovery-before-t0jzosnb/baseline-result.txt`.

No renderer component, layout or CSS changed. Recovery uses existing unavailable/working/ready states and updates their reason text; no new visual layout review is claimed. The UX state diagram was rendered successfully to `/private/tmp/geckit-cli-recovery.svg` using installed Chrome; sandboxed Chrome launch initially failed and the authorized run passed. A first sandboxed test attempt could not bind the existing Unix socket; the authorized run passed.

Live inference, actual Telegram delivery and loading in the running Electron app remain unverified. The active app and conversations were not restarted. Changes are local and uncommitted on `main`; unrelated mobile edits are preserved. No temporary Git worktree was created, and no release or installation was performed.

Final validation passed: all 1,206 tests in 85 files, all TypeScript targets, actual package lint (`eslint src test`), production build, Mermaid rendering and `git diff --check`. One full rerun timed out in the unchanged `store.test.ts` OS settings-file watcher; that file passed 17/17 in isolation and the following full run passed 1,206/1,206. No settings-store code was changed. Final full-suite log: `/private/tmp/geckit-cli-recovery-tests.log`.

## Stale attach and delivery review correction - 2026-10-22

Read-only inspection of `geckit-local/manager.json`, selected metadata in `sessions.json`, and the rotating Claude tmux provider logs preceded implementation. The current record is unpaused, with no saved error and `manualRecovery: false`, but retains two decisions and 36 queued inbox entries. The screenshot's older paused state is therefore historical, not proof of the current pause cause. No live state was changed, sealed Telegram storage opened, deliverable uploaded or bot restarted.

The pending attach `telnyx_preview_retest_attach_20261021_01` targets `plugin:claude-tmux:5d7da151-b572-4589-92ac-5bd035105b56`. The worker note already has `managerOwner: manager`, with original managed start `telnyx_live_preview_claude_worker_20261020_01`. Successful saved list operations `geckit_restart_managed_state_20261020_02`, `geckit_recovery_managed_state_20261021_05`, `twinsai_task_status_sessions_20261021_04`, and `geckit_recovery_managed_sessions_20261022_02` each report that worker as managed. The pending attach has no corresponding executed-operation receipt. This establishes a stale request, not a missing approval for a new attachment.

The operation `ai_harness_report_telegram_delivery_20261021_06` targets worker `plugin:claude-tmux:9bbdd968-2c27-4ea0-b624-45ab96956b4f`, relative path `general/ai-harness-stages-and-duplication.md`. It remains `uncertain`, with saved result `Previous Telegram delivery is uncertain. Check the paired chat before requesting another file send.` No receipt proves upload success. The provider logs contain worker lifecycle events, not authoritative Telegram acceptance; no delivery conclusion is inferred from them.

Implementation inspection found independent defects: attach confirmation was unconditional and observations never retired satisfied requests; pending operation IDs were not bound to arguments; a reviewed uncertain operation became failed; `/resume` discarded upload holds; uncertain duplicate-operation exceptions could escalate into global recovery; Telegram replaced specific decision errors with one generic message. The regressions target those boundaries and actual permission preservation. The user explicitly authorized these behavior repairs and the UX amendment before implementation.

The correction retires an attach request only after a fresh eligible-session snapshot confirms existing ownership. Unknown, removed-project, Manager and question targets are not satisfied from ownership alone. It preserves existing terminal receipt provenance and records observed satisfaction without approving or attaching. Pending identities cannot be reused with changed arguments. Native request fingerprints and normal safety checks remain authoritative.

Inspection acknowledgement now records a separate reviewed marker while the operation remains uncertain. Restart and `/resume` preserve the selected upload's fingerprint hold. Attempted repeats return uncertainty context instead of escalating into a coordination-wide error; fresh unrelated reads continue. Telegram acknowledges stale taps, retires their controls, and provides bounded pause, native-safety, changed-request or retired-request feedback. No arbitrary exception content is forwarded to Telegram.

Regression evidence against original HEAD `ed96244`: copy the changed `manager.test.ts` and `telegram.test.ts` into a clean archive of that commit, then run `npm test -- --run test/manager.test.ts test/telegram.test.ts -t 'reconciles a saved attach|binds a pending operation|keeps reviewed uploads|reports reviewed uncertainty|preserves uncertain upload holds'`. All five selected checks fail on the original implementation: stale attach remains, conflicting pending ID lacks refusal context, paused review is rejected, review outcome is hidden, and `/resume` allows the uncertain file to upload again. They pass in the correction. The baseline result is `/private/tmp/geckit-recovery-baseline-results.json`.

The full suite at the initial corrected snapshot passed 1,213 tests and failed two existing assertions in `telegram-links.test.ts`. Both fail identically on unchanged `ed96244` (3 pass/2 fail in `/private/tmp/geckit-recovery-baseline-links.json`): the matcher accepts only `/#<key>`, while `shareLink` now emits `/#<key>.<expiry>`. This PR does not change sharing behavior or those assertions. Full-run result: `/private/tmp/geckit-recovery-full-results.json`.

Verification uses real Manager/Sessions, temporary persisted records, the actual local CLI socket, and the Telegram bridge with fake Bot API/provider boundaries. It covers restart, stale/duplicate callbacks, changed native identity, retained native refusals, genuine attach approval, authority revoked during refresh, terminal receipts, unknown outcomes, same-file replay rejection and continuing independent work. No renderer layout or style changes; the Telegram API payloads, acknowledgements and keyboard retirement are checked, but Telegram's native visual rendering and live delivery are not verified. The supplied screenshot, later copied into the main checkout attachment directory, was inspected at full resolution. It confirms two waiting decisions, one queued instruction, the old global uncertainty reason, actionable attach/review controls and repeated generic answer failures. The visible problem is stale action state and indistinguishable failure guidance; Telegram layout and theme styles are unchanged. No test messages were sent to Alex or others. No app, live bot or conversation was restarted, and no upload, deployment or merge was performed.

Final follow-up regressions also reproduce and prevent false failure feedback after a delivered native answer/recorded review when a subsequent provider listing fails. Successful effects return their known outcome without a fallible post-effect refresh. Legacy uncertain uploads with no Telegram fingerprint remain held by validated worker, normalized relative path and effective format; changing the caption, flag order, explicit default format, `./` or `folder/../` cannot trigger a send. Modern upload byte-fingerprint checks remain in place. Both reviewed and unreviewed legacy records are covered after restart, followed by a successful unrelated CLI read.

Final validation on the completed patch:

- `npm test -- --reporter=json --outputFile=/private/tmp/geckit-recovery-final-full-results.json`: 1,220 passed, the same two baseline `telegram-links.test.ts` assertions failed; no new failures. All 109 Manager tests and 41 Telegram tests pass, including the real local CLI socket. The earlier focused six-file run passed 190/190 before the four final edge-case checks were added.
- `npm run typecheck`: all four targets pass.
- `rtk proxy npm run lint`: package `eslint src test` passes.
- `npm run build`: main, preload and renderer builds pass.
- `git diff --check`: passes.

The first sandboxed focused run could not bind the existing Unix socket (`EPERM`); the final complete suite ran with socket binding available and that check passed. No security or native permission control was bypassed to make a behavioral assertion pass.

### Main integration checks

After Alex requested integration into main, required CI run `39762021464` reproduced the two old sharing-link assertions and exposed a timing-dependent assertion in the existing lost-receipt test. That test waited a fixed number of event-loop turns while the mocked CLI still had file I/O pending. It now waits for the recovered-receipt context, completed operation and single worker, then for the cached duplicate result before checking that no second command ran. The sharing-link matcher now requires the current expiry suffix and checks its decoded expiry against the saved share records. These are test corrections; production behavior is unchanged.

`npm test -- --reporter=json --outputFile=/private/tmp/geckit-recovery-main-integration-full-results.json` passes all 1,222 tests. All four TypeScript targets and package lint pass. The original implementation regressions and safe-fixture/live-verification limits above still apply.
