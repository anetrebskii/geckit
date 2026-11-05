# Manager chat verification - 2026-11-05

Implementation was reviewed in the existing main checkout, Codex session `01a1a9ee-5726-79f2-9c18-1bc11872029e`. Alex authorized the approved UX with "Реализуй", then direct integration with "push directly to main". No installation or active GeckIt restart was performed.

## Pre-push isolation check

Only this feature's files and Manager service API hunk were staged; concurrent browser-lifecycle and unified-configuration changes were excluded. The staged source tree was exported to a temporary directory and checked independently. Typecheck, lint, desktop build and mobile build passed. The complete serial test suite passed: 1,540 tests passed, one skipped, across 112 passing files and one skipped file. The first sandboxed attempt was interrupted because local socket binding returned `EPERM`; the successful run had loopback access. Earlier mixed-checkout test failures below do not describe this isolated commit. Pushing `main` triggers the repository's Development publish workflow; this check does not claim a finished release or live integration verification.

## Automated checks

| Check | Observed result |
| --- | --- |
| `client: npm run typecheck` | Passed node, web, viewer and service-worker TypeScript projects. Rechecked after the phone reconnect fix. |
| `client: npm run lint` | Passed with raw `rtk proxy npm run lint`, which runs `eslint src test`. The initial condensed command incorrectly reported unrelated script diagnostics; the actual required command passed. |
| `client: npm test`, before concurrent browser-lifecycle additions | 1,539 passed, one skipped, 112 test files passed and one skipped. |
| Final full suite, including another session's new browser-lifecycle work | 1,544 passed, one failed, one skipped. The failure is `test/browser-lifecycle.test.ts:63`, expecting only `second` to be released but receiving `first`, `second`, `popup`. That independent feature is actively changing in session `01a1aa03-0fb1-7a02-b7ec-0477773c0c0d`; its files were preserved. |
| Final affected suites: Manager, Codex, Telegram, phone, Manager UI, Transcript | 348/348 passed across six files, after the reconnect and Telegram fallback fixes. |
| `client: npm run build` | Passed service, Electron main, preload and all desktop renderers after final feature changes. |
| `mobile: npm run build` | Passed after final shared renderer and bridge changes. Existing large-chunk warnings remain. |
| `git diff --check` | Passed. |

The Manager tests run the actual Manager and Sessions with temporary file persistence and injected drivers. They establish concurrent request dedupe, conflicting ID rejection, shared app/Telegram queue order, durable receipts after inbox pruning and host restart, disabled/paused/stale/invalid rejection, typed native answer identity, VPN refusal and single execution of a shared delegation decision. These are not live model or Telegram-account tests. The phone test runs the actual `installGeckit` link boundary and verifies fresh paused/disabled Manager snapshots after reconnect, including an initial view failure.

## Actual renderer review

The existing `manager-preview.html` mounts the changed Chat, Team, ManagerChat, Composer, Transcript and phone components. Only native/service/provider boundaries are synthetic; accepted sends and answer calls are observable through `geckitManagerFixture.snapshot()`. No provider was contacted by this preview. Browser work used the task-owned `test:geckit-manager-chat` profile through GeckIt CLI, parent tab `942500002` and the entrypoint review tab `942500003`. The latter was closed by its owner.

CLI read/click operations sometimes discarded the open overlay or invalidated references during hot reload. Tab-scoped CLI eval invoked real DOM control handlers and inspected their rendered outcomes. Enter and Escape were also exercised through CLI key commands by the entrypoint reviewer; the parent used keyboard events for desktop send/phone Return handling. This does not establish physical phone keyboard behavior.

| Journey | Observable result |
| --- | --- |
| Fresh desktop setup, Telegram disconnected | Assistant -> delegation -> Enable succeeded with exactly three required steps; Telegram remained Not connected and Open chat became available. |
| Desktop status and Team entry | Shared Manager dialog opened; its history and composer were available. Closing returned to the prior screen. Enter enabled the selected setup action, Escape closed the dialog. |
| Text and double submit | One accepted request/receipt for two immediate Send clicks; draft cleared only after receipt. The same session ID was used. A synthetic Manager reply appeared in the transcript. |
| Draft close/reopen and full reload | Exact unsent text restored. After reload, desktop Enter handling sent the restored draft once. |
| Known send rejection | Zero accepted sends, editable text and the actual rejection reason remained; explicit retry accepted one request. |
| Lost send response plus failed receipt lookup | Text remained disabled with Checking/Check status, one accepted host request. Restoring only the fixture receipt boundary and pressing Check status cleared the draft without a second send; accepted text remained Queued. |
| History error and retry | Failed history showed its reason and Try again; Send stayed disabled until a successful read. |
| Paused/blocked | Send disabled, draft retained, Resume/Try again and the VPN refusal reason visible. |
| Shared origin and decisions | Telegram-origin history retained its source. Native Allow once called scoped answerCard; a delegation Start called scoped answer and disappeared from current decisions. Host tests separately establish stale and duplicate rejection. |
| Phone Tasks and Team | Both opened the shared page at 390x844 in light/dark. Back restored Tasks or the same Team profile and its navigation bar. Android's actual JS back handler returned true and restored the prior page. |
| Phone offline/reconnect | Draft retained while disconnected, Send disabled with the connection reason. Reconnect did not send automatically. Return handling caused zero sends; explicit Send accepted the full multiline text once. |
| Short phone viewport | At 390x500, composer bottom was 500px, Send bottom 480px, with no horizontal overflow. This simulates reduced space; it is not a physical keyboard test. |

Full-screen visual review covered desktop 1440x900 and 900x700 plus phone 390x844, light/dark, setup hierarchy, adjacent board/Team context, input/Send reachability and wrapping. Review found and fixed touching Telegram/setup sections, duplicated focus outlines, missing native elicitation details and missing phone Back registration. Reopening writable chat initially focused Close; focus setup was moved to layout effect so the composer passive focus can win. The final repeated focus check is included in the tooling limitation below.

Evidence: [desktop dark](evidence/desktop-dark.png), [narrow setup dark](evidence/setup-narrow-dark.png), [phone light](evidence/phone-light.png), [phone dark](evidence/phone-dark.png), [short phone](evidence/phone-short-dark.png). These images show fixture data, not a real account conversation.

## Performance and remaining verification

Code review against `docs/performance.md`: composer draft state is isolated from the memoized History/Transcript; unchanged SessionItems retain existing merge behavior and Transcript paging; existing per-row memoization remains; no per-message polling or new long-running animation was added. The phone bundle was rebuilt. Runtime typing/long-history measurements were not completed.

The final Transcript adjustment marks new items while scrolled up even when a full page keeps the same height, so it does not depend only on ResizeObserver. Its 38 focused tests, web typecheck and ESLint passed; desktop and mobile production builds passed afterward. The browser interaction recheck remains unavailable below.

During review another active session changed and rebuilt the GeckIt Browser CLI to require project/conversation registration. The running host has no registration for this already-active conversation, so every further test-browser command returns `This conversation is not registered with GeckIt. Open its project in GeckIt before starting a test browser.` Its lifecycle implementation is outside this feature. No ownership registry was fabricated, guard bypassed, personal tab used or active app restarted.

Consequently T015/SC-005 are only partially verified: long transcript paging/scroll preservation and New messages interaction, runtime typing measurements, final focus recheck and final fixture native-card removal recheck remain unavailable. The fixture removal was corrected to emit `gone`, matching the actual delta contract; the final affected test suites and typecheck passed. Parent tab `942500002` remains open because the same registration guard prevents closing it through the required CLI.

The task-owned preview server on port 5211 was stopped after review. The browser registration failure was confirmed again before stopping.

Real provider execution, real bot/account delivery, native credentials, WebRTC peers, SSH integration and physical iPhone/Android behavior were not tested. Builds, synthetic replies and screenshots do not establish those flows. Implementation remains reviewable source support, not a deployed or fully live-verified release.
