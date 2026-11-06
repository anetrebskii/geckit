# Verification and integration handoff

> Scope correction, 2026-11-06: Alex meant deleting/clearing Manager conversations themselves. This document records the separate worker-delete feature; it is retained, not treated as fulfillment of that request. Manager history/context actions are specified in [Manager history actions](../../docs/ux/manager-history-actions.md). Earlier statements that cleanup scope was unanswered describe the original worker-delete implementation only.


Date: 2026-11-06. Source base: `236bcef9`. Branch: `feat/manager-session-delete`. Worktree: `/private/tmp/geckit-manager-session-delete`. Codex session: `01a1af1d-da13-7291-ae5c-c3191397e442`.

## Command and result

Authenticated Manager uses `geckit sessions delete --id <full-managed-worker-id>`. One full ID, no title/prefix/bulk selection. The existing bound Allow/Refuse decision is required even under automatic delegation. Execution revalidates worker, ownership, Manager identity, provider and project scope. Native permissions remain user-controlled.

Allow cancels queued messages and pending guarded work, ends current and retiring runtimes, then invokes the existing provider deletion contract. Created native empty workers use their provider cleanup; purely prepared drafts need no provider conversation. Success clears active rows, ownership/followers and favorites and persists a hidden tombstone. Archive only changes status and retains conversation history. Project files are kept; existing Claude removal includes the transcript's provider side directory. This is not provider-wide erasure of backups, exports, indexes or project inputs.

Inspect receipt `deleted`, not operation transport status. `deleted:true` confirms provider/host-only removal; `deleted:false` means unconfirmed deletion, work stopped and queue canceled. False/throw retains a visible host record including failed unsent drafts after restart; partial provider-side effects cannot be rolled back. Shutdown failure prevents provider deletion. Provider-confirmed deletion followed by local persistence failure is an explicit error saying not to repeat deletion. Favorite-save failure preserves `deleted:true` and reports the settings problem. Reconcile uncertain transport with the existing operation ID; do not blindly issue a new destructive attempt.

## Runtime evidence

The integration test runs the compiled real CLI subprocess through an authenticated private host socket and actual temporary transcript/store files. It confirms bound refusal leaves transcript, queue and favorite untouched; allowance removes only the selected temporary transcript, stops the fake runtime, cancels queue, persists ownership/follower cleanup and favorite removal. A sentinel conversation and project file survive. It also checks rejected authentication and durable operation replay after host-store reload. This exercises the real CLI/host route with disposable provider fixtures, not a real user provider account.

Session and Manager tests cover exact target/scope/ownership validation, active/retiring runtimes, queued/prepared/unborn workers, asynchronous send/start/goal guards, failed provider deletion, no resurrection, durable failed-draft visibility, local persistence failure and favorite-save failure. Codex RPC fixture checks an allocated unsent native worker unsubscribes without submitting queued work or deleting the sentinel. SSH failure fixture verifies mirror/listing retention; no real SSH account was modified.

## Rendered decision evidence

The existing production Manager renderer was inspected through the own `?deleteDecision` fixture using GeckIt Browser CLI. Full context at desktop 1440x900 and phone 390x844 in light/dark themes: wording wraps, full exact ID and both decision controls remain visible, composer and adjacent content retain hierarchy. No production layout change was introduced.

- [Desktop light](evidence/desktop-light.png), [desktop dark](evidence/desktop-dark.png), [phone light](evidence/phone-light.png), [phone dark](evidence/phone-dark.png).
- Pointer Allow and Refuse each dispatched the exact synthetic operation ID `delete-worker-fixture`; card disappeared on decision.
- Keyboard Tab reached Refuse; Enter produced exactly `[{"id":"delete-worker-fixture","choice":"refuse"}]`. Escape closed Manager and restored focus to `Chat with Manager`.
- Transcript overflow and decision visibility were inspected in all screenshots; element targeting brings the decision into view. CLI does not support Shift+Tab, so reverse keyboard navigation was not exercised.
- These are synthetic renderer decisions only. No pending user/native permission card was answered. Live Telegram, physical phone, production provider deletion and real SSH loss were not exercised.

Performance review: no production renderer layout, list subscriptions or animations changed. Existing desktop/mobile decision rendering is reused; the preview adds only an opt-in fixture. Runtime lifecycle bookkeeping is per selected ID, not a new polling loop.

## Checks

Frozen-source results, sequential tests/builds:

| Command | Result |
| --- | --- |
| Focused Vitest run: `manager`, `manager-store`, `sessions`, `hosts-mirror`, `codex` | 5 files, 517 tests passed |
| `cd client && npm test -- --maxWorkers=1` | 123 files passed, 2 skipped; 1708 tests passed, 2 skipped (1710 total), 83.04s |
| `cd client && npm run typecheck` | Passed |
| `cd client && rtk proxy npm run lint` | Passed |
| `cd client && npm run build` | Passed service, desktop main/preload and renderers |
| `cd mobile && npm run build` | Passed, existing large-chunk warning only |
| `git diff --check` | Passed |

Build logs remain in `/private/tmp/geckit-manager-delete-client-build.log` and `/private/tmp/geckit-manager-delete-mobile-build.log`. Earlier overlapping whole-suite runs exposed timing-sensitive service-start and filesystem-watcher assertions; the final complete run passed serially without concurrent service builds. No dependency change was made. No native mobile package/sync was run. Task-owned preview and browser tab were closed; shared test browser remains available.

## Scope and delivery

Single-session deletion is independent and ready for integration when checks below pass. Cleanup inventory is in [research.md](research.md). Bulk deletion, message-history purge and temporary-file cleanup remain unimplemented pending Alex's scope answer. `docs/features.md` is unchanged while its optional entry awaits approval; this does not block implementation.

Integrator: `Максим: все задачи GeckIt в main и перезапуск`, operation `geckit-all-main-integrator-start-20261106`. This task prepares one local commit only. Integrator owns merging, combined checks, push, restart and eventual worktree cleanup. No production conversations were deleted, and the user app was not restarted by this task.
