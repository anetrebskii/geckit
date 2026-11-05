# Task status updates and technical history

Local delivery, 2026-11-06. Base: `a2318afd`. Session: `01a1ad78-818e-7720-94d1-cc610bf381b9`. Delivery commit is the commit containing this report (`git log -1 -- docs/reports/task-status-history.md`). No push, publication or restart of the installed application.

## Result

All supported Manager marks (`todo`, `progress`, `blocked`, `done`, `archived`) execute without an extra product decision under both delegation policies. Desktop controls retain their immediate operation. The existing moves history now retains previous/new status, host time and structured technical provenance. CLI, Manager show and conversation history use the same deterministic formatter.

UX was written before implementation: [task status history](../ux/task-status-history.md). Existing Telegram/thread UX was aligned. UI uses GeckIt disclosure, typography, focus and colour tokens; no new design system or configuration.

## Attribution and persistence

- `StatusMove` extends the existing persisted move, rather than creating a second audit database. Old events are not backfilled. Missing old provenance displays `Legacy / unknown`; missing previous status displays `unknown`.
- Actual executor is `user`, `manager` or `system`. Manager always remains Manager, including when its particular dispatched input came from Telegram. No person is called Alex from a name, prompt, earlier thread message or model output.
- Manager captures the concrete dispatched input in host code; its operation retains session/thread/operation plus known origin and exact input reference. Registered channel identity is used for channel input, not mutable title/place/from. References describe technical association, not inferred intent or obedience.
- Desktop/paired-phone host routes stamp their fixed surface and discard extra caller attribution. Incoming operator CLI requests have a separate request source; they are not internal CLI results and have unknown personal origin. Worker events, internal continuations and automatic output after restart remain unknown where provenance is unavailable.
- Authenticated Manager execution binds the saved operation, exact arguments, token, thread and backing session. Command/prompt strings cannot select attribution. No LLM is used to classify or format history.
- Status and its move are saved together through the existing atomic synchronous Notes write before acknowledging the mark. Repeated no-op marks create no duplicate move. Tests reopen the actual JSON store and reconstruct Manager/service instances.

## Verified scenarios

| Scenario | Evidence and observed result |
|---|---|
| Manager Done and other statuses | `manager.test.ts`: all five statuses under automatic/approve; no decisions |
| Real Manager CLI path | `manager-store.test.ts`: actual CLI subprocess -> authenticated Unix socket -> Manager -> actual Notes store; exact Telegram technical fields persisted |
| Fresh read/restart | New Notes store and Manager preserve exact fields; automatic output after restart records Manager/unknown without inherited message. Headless service suite performs clean shutdown/start with durable history |
| Direct desktop and phone | `core-application.test.ts`: real isolated service clients; desktop Done and phone blocked stamped by their fixed routes; forged extra attribution ignored; actual JSON equality |
| Manager desktop/phone/channel | Parameterized Manager tests: Manager executor retained; exact source/input; registered Slack channel survives changed display title/from claiming Telegram/Alex |
| Automatic system action | `store.test.ts`: ordinary status write records system/unknown, no fabricated human identity |
| Spoof resistance | Fake source/actor in prompt ignored; unsupported attribution command flags rejected; bad operation token rejected; no mark |
| Legacy | Raw old moves preserved through fresh read and migration; formatter JSON round-trip gives identical text without guesses |
| Old pending Done | Fixture loaded, then exact old command replayed through restored Manager; decision unchanged, task unchanged, zero CLI calls, disk decision unchanged |
| Other confirmations | Project removal and start-under-approve still require their existing decisions; revoked authority rejected; provider permission tests retained |
| Rendered UI | Actual Chat renderer with synthetic bridge: Done menu applies without confirmation; desktop history shows new User/desktop event; repeated Done keeps four rows; collapse/reopen retains text |
| Keyboard/themes/layout | Disclosure Enter toggle and visible summary focus; desktop 1280x900 light, 960x720 dark; phone 390x844 and 320x720 dark; empty light state. Full-screen images inspected; long references wrap without page horizontal overflow; 320px history scrolls inside 160px limit |

The browser preview is a fixture backend, not a live Telegram/Slack account. Its reload recreates fixture data. Durable reread/restart claims above come from the actual store/service tests; renderer tests consume the shared persisted format and verify deterministic formatting after JSON round-trip.

## Checks

- [Saved full-suite output](task-status-history-evidence/full-suite.txt); [build/typecheck output](task-status-history-evidence/build-checks.txt).
- Full client suite: `npm test -- --maxWorkers=1`: **1685 passed, 2 skipped**, 123 files passed, 2 skipped, 86.06 s. After that run, only CSS list containment/marker positioning and additional source/replay tests changed; focused replay test **1/1** and Manager surface cases **3/3** pass.
- `npm run typecheck`: passed. ESLint `src test`: passed. `git diff --check`: passed.
- Desktop `npm run build`: passed; mobile `npm run build`: passed. Existing mobile large-chunk warning remains.
- Initial broad run exposed CLI input being labelled as internal result and two stale history test fixtures. Fixed request classification and expected persisted format; all original failing scenarios pass in the final full run. The earlier isolated socket/watch limits were avoided with authorized local execution and serial workers; the final full run includes store tests.
- [State diagram](task-status-history-evidence/states.svg) parsed/rendered with Mermaid CLI.

## Performance review

No static performance problems found in the changed renderer. Production measurement remains unavailable: the installed process was deliberately not restarted with new code, and no production latency claim is made.

| Touched checklist item | Verdict | Evidence |
|---|---|---|
| Component per conversation memoized; typing only redraws dependencies | Holds | `StatusHistory` uses `memo` with only `moves`; existing `sameAsBefore` preserves unchanged session identity |
| Unchanged objects preserve identity | Holds | Existing `useChat` list reconciliation unchanged; history itself does not poll or subscribe |
| Long list avoids offscreen layout/paint | Holds | Native collapsed details; bounded scroll area; rows use `content-visibility:auto` with intrinsic estimate; list markers placed inside containment |
| Formatter per call | Holds | Pure ISO timestamp and fixed field mapping; no Intl formatter creation |
| Mobile rebuilt | Holds | Shared renderer bundled successfully for mobile |
| Production measurement | Unavailable | No installed application restart or live-user instrumentation |

Seven remaining checklist items do not apply: history has no handlers in memoized rows, cross-row scans, filter/sort hooks, pointer-following selection or animations.

## Pending compatibility and limits

No pending request was accepted, refused, cancelled or automatically migrated. New marks no longer create Done cards. An old saved decision remains in the existing explicit person-answer flow; replaying its old command cannot supply consent. An explicit later answer uses known operation identity and unknown unavailable historical provenance, without borrowing a newer message.

Read-only inspection found zero status-mark pending decisions in the current local Manager record at inspection time. This does not establish how the originally reported card was resolved. No real task status was mutated during acceptance checks.

Native provider permissions and unrelated action gates were not disabled. Live Telegram/Slack and physical-phone interactions remain unverified; transport registration and dispatch were exercised locally through host APIs. Installed runtime still uses its previously loaded code until an independently requested restart/release. No release claim is made.

Prior Slack context/status/tracking commits (`a2318afd`, `7d2757a2`, `9c3f2995`) remain ancestors. Unrelated untracked files and other sessions' work are excluded from the task commit. The canonical feature-list wording was proposed to Alex; without a reply the list stays unchanged.

## Screenshots

- [Desktop light, Done and separate provenance](task-status-history-evidence/desktop-light-done.png)
- [Desktop dark, keyboard focus](task-status-history-evidence/desktop-dark-960.png)
- [Empty history](task-status-history-evidence/empty-light.png)
- [Phone dark](task-status-history-evidence/phone-dark-390.png)
- [Narrow scrolling history](task-status-history-evidence/phone-dark-320.png)
