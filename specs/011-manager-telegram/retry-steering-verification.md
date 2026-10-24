# Manager retry and immediate steering verification

Task: 2026-10-24. Runtime evidence for the implementing session: own Codex turn metadata reports `gpt-6.1-sol`, session `01a1630e-c96a-71f3-8836-211a2e43316e`. Base: `origin/main` at `f2f25a4d557f17486eae14a6073b153e7b120771`.

## Incident evidence, read-only

The local `geckit-local/manager.json` record retained both named operations. Their completed host results were `delivered:true,busyBefore:false`. The persisted inbox gives this sequence in UTC:

| Operation | Host operation timestamp | Failed VPN worker event | CLI result inbox timestamp |
| --- | --- | --- | --- |
| `twinsai_detection_transcription_resume_20261024_11` | 07:26:11.768 | 07:26:16.579 | 07:26:16.618 |
| `twinsai_detection_transcription_retry_20261024_12` | 07:27:15.705 | 07:27:20.490 | 07:27:20.526 |

The external Claude tmux provider log records the worker stopping at 07:08:46.606 and closing at 07:08:46.749. Its next recorded turn begins at 07:31:32.566 and reports `resumed:true` at 07:31:32.645. No provider turn start is recorded during the two CLI attempts. Main diagnostics record unavailable public-IP lookup with DNS failures at the original pause, followed by fallback recovery; they do not retain the exact lookup explanation for the two later command windows. Current session notes no longer contain the earlier guard hold after subsequent recovery.

These records corroborate guard refusal plus a false success receipt. They do not prove that CLI never tried, that notification arrival order caused failure, or that the later app click bypassed a policy. No live worker action was performed during diagnosis. No task text, credentials, provider transcript or approved IP list is copied into this document.

## Implementation cause and correction

`ManagerOperations` awaited `Sessions.send` and returned `delivered:true` unconditionally. That API returns a session ID after a VPN refusal or ordinary queueing too. Ordinary Send also differs from Try again: it can queue a fresh message behind a held operation instead of replaying the held operation through the existing guarded recovery path.

The correction separates `sessions send`, `sessions retry`, and `sessions steer`. Receipts identify the exact attempt and distinguish host dispatch acceptance, ordinary queueing, runtime injection acceptance and refusal/failure. Current worker state/attempt is inspected separately from immutable historical operation receipts. Existing native permission checks and VPN validation remain authoritative.

[UX rules and acceptance conditions](../../docs/ux/manager-retry-steering.md).

## Verification boundaries

Focused runtime tests use the real Sessions and Manager implementation with controlled provider/IP boundaries. CLI socket tests call the actual CLI manage entrypoint over a local Unix socket into authenticated Manager.command and real Sessions with a fake Driver; they do not spawn the packaged CLI binary. Native adapter protocol fixtures run actual Codex/Claude adapters over in-memory fake process/RPC streams and verify the emitted steering request and acknowledgment handling; they do not prove that a live model consumed or applied a correction. Browser previews mount the real conversation components with substituted native effects and provider responses.

No live TwinsAI worker mutation, real Telegram message/upload, real provider inference, Windows native verification, deployment, merge or live app restart is part of this verification.

## Checks performed

- Before implementation, `rtk proxy npm --prefix client test -- test/manager.test.ts -t 'worker delivery receipts'` failed all three new assertions: VPN refusal falsely returned delivered, Retry was unavailable, and Steer was unavailable. The stale native-turn test also failed before the one-line Codex turn-ID filter, with the old failure ending the new turn.
- Final `client/` checks: `npm run typecheck`, actual package `npm run lint` (`eslint src test`), `npm run build`, and `npm test -- --maxWorkers=1 --reporter=json --outputFile=/private/tmp/geckit-retry-steering-evidence/tests.json` passed. All 1,236 tests in 85 files passed, zero failed/skipped. The test run had permission for local socket fixtures; no live provider was contacted.
- Focused coverage in manager/sessions/codex/claude-inject tests: blocked and queued receipts, exact held-message Retry, active Retry refusal, native acceptance/failure, unsupported provider, permission/command refusal, concurrent corrections, queue preservation, late acknowledgment keeping accepted transcript input without replacing a newer receipt, saved pending-to-uncertain recovery, duplicate CLI operation/reload without reinjection, suppression of historical failure during pending Retry, and stale native completion filtering. Attachment delivery into a busy worker also returns queued rather than delivered.
- Browser interaction/review: actual existing Composer/Transcript/Sidebar in `vpn-chat-preview.html` and `queue-preview.html`, substituted native boundary. Desktop 1352x677 and phone 391x844; light/dark full-context inspection. Enter on Try again showed pending disabled control then fixture success, preserving unrelated draft, picture and follow-up. Enter on Send now locked queue actions then moved only selected input to transcript, restored focus to the next action and retained remaining rows; failure retained all three rows and showed the error. Unsupported/approval states hid Send now. Scrolling reached the last of 15 queued rows on phone; the composer remained available. Long transcript/keyboard focus was inspected. No renderer layout or CSS changed. These preview responses are simulated and do not verify the backend.
- Browser error log was empty. Initial Vite serving rules blocked the symlinked font directory; an external temporary harness config explicitly allowed the existing dependency path, and rendered review was repeated with the actual Inter assets (no app-source change). Screenshots retained outside the worktree in `/private/tmp/geckit-retry-steering-evidence/`; Mermaid UX diagram rendered successfully with Mermaid CLI.
- Performance review: no performance problems found in the type-only optional receipt fields; no renderer row, callback, formatting, animation or list behavior changed. No live performance measurement is claimed.

No broad checks were repeated after passing. Only documentation was completed afterward. CI status and delivered head are recorded in the PR/day-plan.

## Manager address-mismatch follow-up

Alex's later screenshot showed Manager Unavailable with an unapproved public-IP refusal while other chats worked. Read-only local `geckit-local/manager.json` and the backing session note confirmed `paused:false`, `manualRecovery:true`, the exact mismatch guard error, and a held `message`. This is a saved refusal; it does not establish the machine's current IP or that its current VPN policy would pass. No live retry was invoked.

Both `Manager.#vpnLookupHeld` and `Sessions.retryManager` allowed only exact unavailable-lookup errors. A mismatch therefore stopped scheduling guarded revalidation forever. A shared exact-error classifier now allows canonical public-IP mismatches and the local paused wrapper too. It does not broaden the approved IP list or permit dispatch before normal verification succeeds. Pending native questions, approval answers, configuration errors and hook lookalikes remain excluded.

- Before source correction, the changed recovery scenarios produced seven failures and four passes: mismatch never rechecked, saved manual recovery did not resume, unavailable-to-mismatch stopped rechecking, three cancellation scenarios could not begin a mismatch recheck, and an interrupted mismatch-held continuation did not reconcile.
- After correction, 45 focused cases passed (34 automatic Manager recovery cases and 11 exact-error classifier cases). Coverage includes continued refusal without provider creation, bounded backoff, approved-address recovery exactly once before queued input, restart restoration, native-question/answer preservation and cancellation during validation.
- Final required checks passed: all four typecheck targets, actual package lint, production build, `git diff --check`, and all 1,253 tests in 85 files (zero failed/skipped). Full test JSON: `/private/tmp/geckit-manager-vpn-tests.json`.
- Rendered review used the actual Manager inspection and Settings components in `manager-preview.html?state=blocked&vpnMismatch`, with fixture native APIs only. Desktop 1352x677, light/dark: exact mismatch explanation, keyboard Try again clearing the error and Unavailable state, Tab reaching the adjacent action, Escape restoring focus to the Manager opener, and scrolling the long transcript. Screenshots are under `/private/tmp/geckit-manager-vpn-evidence/`. No renderer errors were logged. The phone fixture at 391x844 was inspected: it has no Manager recovery entry, so no phone recovery interaction is claimed. No product renderer layout/CSS was changed.
- Browser Retry success is a substituted response and does not prove automatic recovery. Automatic recovery evidence comes from real Manager/Sessions orchestration with fake provider/IP boundaries. No live VPN/provider/Telegram/Windows verification, worker mutation, deployment, merge or live GeckIt restart was performed.
