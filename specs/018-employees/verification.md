# Employees verification

Date: 2026-11-01. Branch: `feat/employees`. Codex session: `01a195ca-96a0-7a73-a659-e932a9ac27f3`.

Implemented in the working tree. No commit, push, PR, installation or app restart. Preexisting `gecko/frames/wA.webp` and `wB.webp` edits are preserved.

## Automated checks

| Check | Result |
| --- | --- |
| `client`: `rtk proxy npm run typecheck` | Passed all configured targets |
| `client`: `rtk proxy npm run lint` | Passed package source/test lint |
| `client`: `npm test` | 1,438 tests in 101 files passed |
| `client`: `npm run build` | Passed main, CLI, preload and renderer production build |
| `mobile`: `npm run build` | Passed; Vite reports large output chunks |
| Renderer fixture TypeScript and scoped lint | Passed |

Tests use real temporary files, atomic catalog replacement/reload, notes reload and a real native Unix socket/subprocess CLI. Provider drivers, Manager model selection and network integrations are substituted. The full suite required sandbox escalation for local socket creation. These are native integration checks, not live provider/account verification.

Catalog checks cover stable IDs, empty names, avatar validation, revisions, write failure, guide failure separate from saved data, archive/restore and reload. Assignment checks cover persistence before dispatch, reassignment/clear without a turn, held first-message replacement, prepared/copied tasks and unchanged user text. Worker CLI commands are read-only.

Memory checks cover current-assignment isolation, hidden/finished/archived sources, disabled providers and disconnected sources, read failures, unchanged hidden/read/lifecycle state, more than ten sources, huge messages and empty-message continuation. Image bodies are omitted with an explicit flag. Manager JSON stays below 20,000 characters even with oversized escaped metadata; source IDs/cursors remain exact, shortened display metadata is flagged and all text can be reconstructed through continuation.

Guide tests use isolated packaged Claude/Codex configuration roots and preserve personal instruction text across create/edit/archive/restore. Source Claude and Codex use separate app-data guides and leave installed global instructions alone. Source Codex lifecycle reads effective project developer instructions and retains them alongside a generic guide pointer; disabling restores the baseline or explicitly clears a stale pointer. Correction threads stay excluded. Native isolated config/read returned the expected configured baseline and thread/start accepted the pointer without sending a provider turn. Native resume/fork had no rollout to open because no turn was sent, so those paths are verified with substituted RPC, not a live persisted thread. Authenticated Manager tests cover employee reads, start/assign, explicit choice, unknown/archived rejection, ownership/project access, forged credentials, policy/provider preservation and receipts. These establish host behavior, not model role-selection quality.

## Rendered interface review

Actual Chat renderer and preload were served by `client/test/browser/employees/` through Vite on port 5195. Electron IPC and data are synthetic; reload persistence is fixture localStorage. Native Safari was used because Chrome/in-app browser bridges were unavailable. Every size was visually inspected in full surrounding window context in both themes:

| CSS viewport | Reviewed states and interactions |
| --- | --- |
| 1440×900 | Board, employee selector, archived/long names, employee/folder/search intersection, New task; dark 800-task board and scrolling |
| 1024×768 | Catalog list/form, source-guide error, session header and source viewer; dark validation/save failure/retry/create/archive/restore; light partial history and cross-folder creation |
| 390×844 phone | Board badges, filter/clear, read-only catalog, header assignment, employee sheet, paged memory, New task and navigation/composer context |

Observed outcomes:

- Desktop and phone assignment changes header/card metadata. Fixture evidence records assignment with `sends: []`; no message or turn is generated.
- New task preserves employee through Start. A Marketing-only board creating in GeckIt export now expands to two folders and opens the complete session with employee/folder visible. Before the fix its header metadata was missing.
- Validation focuses Name. Failed save retains fields and permits retry. Successful retry creates one backend-assigned identity; archive/restore retain it. The fixture now rejects unknown client IDs, matching the native contract.
- Dirty navigation asks Discard changes with Keep editing focused. Keep editing retains the portrait. Scrolling reaches the sticky Save footer; Escape closes the foreground dialog. Settings over New task preserves the background task form.
- Portrait edits propagate to catalog/board. Twelve local portraits include source/license. Long names ellipsize while accessible labels retain identity. Phone employee assignment uses a separate header row, preserving folder/title space.
- Memory shows source title/folder/date/status and hidden markers. Load more retains earlier results and adds the hidden source without returning it to the board. Success says Refresh conversations. Partial results explicitly say some conversations are unavailable.
- Guide failures are shown separately from saved catalog with retry. The source Codex unsupported-update error observed in the earlier fixture review was subsequently fixed by adding isolated source guide support. The source fixture now represents successful sync; real file-write failure and retry remain covered by native tests.
- In the running GeckIt Local app, the current conversation header exposes Employee: None beside its project name; the board has Employees: All employees and New task. This follow-up inspected actual app controls without changing assignments or sending a message.

The interactive prototype and rendered state diagram were inspected too. Safari screenshots are in this session's tool transcript; no screenshot files are claimed here. Fixture controls were hidden for phone navigation review so their overlay did not cover product UI.

## Performance review

Read the full `docs/performance.md` checklist. One shared subscription canonicalizes employees by ID/revision. Memoized card/row props receive their own employee only. Filter maps and visible sessions are memoized; lifecycle/notifications retain unfiltered sessions. Existing latest-value action refs and card content visibility remain. No new recurring animation/formatter allocation; memory reads are lazy and bounded.

Safari development fixture, 800 tasks: initial seven Profiler commits totalled 130 ms. A later interaction reached eight commits/153 ms. Repeating an unchanged serialized snapshot reached twelve commits while cumulative time remained 153 ms and last duration was 0 ms at fixture timer resolution. This supports the unchanged-data bailout in this fixture. It is not a production benchmark; no baseline comparison, active Electron CPU profile or paired-device timing is claimed.

## Acceptance and remaining boundaries

FR-001–018 have implementation and proportional contract/UI evidence above. SC-001/004/005 have native persistence/config/dispatch checks; SC-002 has renderer filter interactions. Source access and isolation underlying SC-003 have native tests. SC-006 has shared transport contracts and separate desktop/phone renderer checks. Full live SC-003 and paired-device SC-006 remain unverified.

No new provider turn was sent to Alex's account and no running app/conversation was restarted. Unverified: a live model independently reading the guide and recalling an earlier decision; live Manager role selection; real phone pairing/reconnect/state propagation; SSH access to the CLI; third-party libraries' own instructions; installed-app loading. The running app's main process was not reloaded for the source sync fix, so disappearance of its previously displayed error is not claimed. These limits must not be described as completed live integration. Feature-list availability remains working-tree only.

## Card portrait follow-up - 2026-11-01

Alex clarified that cards must show only the selected employee icon at bottom right, with no assignment control. Desktop and phone cards now use a memoized noninteractive portrait with name/role/archive identity in its tooltip and accessible label. Unassigned tasks have no placeholder. Employee selection remains in New task and the session header.

Actual renderer with synthetic IPC was visually reviewed in Safari: desktop 1440×900 light/dark and 1024×768 dark, phone 390×844 light/dark. Assigned, unassigned and long archived identities were inspected in full screen context; portraits occupy their own footer space and do not overlap provider icons or text. Clicking a portrait on desktop and phone follows normal card navigation and opens no assignment menu; no message was sent. Phone scrolling retained placement and footer navigation. The display adds no focusable control. The earlier editable-card experiment was removed after the clarification.

All configured TypeScript targets and scoped renderer ESLint passed after this correction; the phone production bundle was rebuilt successfully (existing large-chunk warning). The prior 1,438-test suite preceded this display-only correction and was not rerun. Performance review preserved per-employee memo comparisons, stable actions and card content visibility; there is no new per-card catalog scan, menu, animation or subscription. The small renderer fixture reached 24 commits/48 ms cumulative during HMR and interactions; no controlled production timing or new live account/paired-phone claim is made.
