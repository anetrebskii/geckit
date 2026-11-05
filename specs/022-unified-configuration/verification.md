# Verification: Unified configuration

2026-11-05. Codex session `01a1aa02-eee0-7cd3-927b-d97760d13cee`, shared main checkout.

## Result

Reusable preferences, hosts, saved shortcuts, phrases, employees and Manager configuration now use one versioned, sectioned `settings.json`. Existing flat settings and separate employee/Manager configuration migrate on first load with original-file backups. Device identity, pairing secrets, execution history and Manager queues remain local. Desktop APIs retain their existing settings shape.

## Behavioral evidence

Tests use real temporary files, atomic renames, permissions and filesystem watchers. They exercise the production persistence adapters and their existing Settings, Employees and Manager owners. Full-suite CLI/service checks also use real subprocesses and temporary data with fixture providers.

- Migration preserves original settings, employees, Manager instructions, IDs and assignments; originals are backed up verbatim; repeat loads are idempotent.
- Separate owners preserve sibling sections and unknown fields when saving. Local execution updates avoid rewriting reusable configuration.
- Copying only configuration into a separate directory carries preferences, employees and assignments while preserving destination identity, pairing and execution history. Fresh shortcut baselines persist across reloads.
- Malformed JSON, invalid containers/catalogs and unsupported format versions leave source bytes intact. Backup and staged-write failures retain recoverable originals. An invalid preference edit preserves the last usable in-memory settings.
- CLI reads and dry runs do not migrate source data. Metadata migration uses the same adapter. Development initialization accepts both legacy and sectioned configuration without mutating the installed source or copying pairing/history.
- A compile-time coverage assertion accounts for every existing Settings field, including derived migration metadata kept out of reusable configuration.

## Checks

| Check | Outcome |
| --- | --- |
| Initial affected persistence tests | 204 passed |
| Final full suite, `npm test -- --maxWorkers=2` | 116 files passed, one skipped; 1,569 tests passed, one skipped |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed |
| `git diff --check` | Passed |

The initial unrestricted full run exposed older flat-file assertions, which were updated to check the persistence adapter. It also hit watcher timing and an unrelated Telegram attachment timeout under high worker concurrency. The complete suite passed after capping concurrency at two workers. Tests needing local service sockets ran outside the restricted sandbox. Final test and build logs are under `/private/tmp/geckit-configuration-*.log`.

## Requirements and scope

FR-001 through FR-007 are covered by T002 through T009 and the behavior above. Specification, design, plan and tasks agree on filesystem transfer, normal JSON and no additional UI. No unresolved cross-artifact gaps remain.

No visible UI changed, so renderer/theme/viewport review is not applicable. No real provider account, Telegram connection, SSH credential vault or active installation was migrated or restarted. Test fixtures verify local persistence, not live account integrations. No export/import buttons or JSON-with-comments support were added. These checks were completed before delivery to main; they do not verify a published release or installed app update. Transfer instructions and restart requirements are in [docs/configuration.md](../../docs/configuration.md).

## UI follow-up

2026-11-05, worktree `/private/tmp/geckit-configuration-ui`, branch `feat/configuration-transfer-ui`, same Codex session. The shared checkout was switched by another session to an unrelated provider branch, so follow-up work was isolated from commit 233293c. Alex approved [the UX](../../docs/ux/configuration-transfer.md) before prototype/UI implementation. No active installation was restarted.

Implemented desktop Settings > General > Configuration with Open configuration, Export and Import. Native file pickers and a Cancel-default confirmation feed a serialized coordinator. Export writes a private file atomically outside the data folder. Import captures and validates the selected bytes, revalidates at the service, refuses active/queued work, stages the replacement, waits for service ownership release, and relaunches desktop. Fresh owned service startup backs up and applies the replacement before creating configuration owners. Phone hides these controls and offers no host file API.

### Behavioral evidence

- Portable configuration, migration and native coordinator tests: 40 passed. These use real temporary files and injected native picker, reveal and restart boundaries. They cover cancelled pickers/confirmation, captured bytes, malformed input, private backups, destination identity/history, backup/write failures, export overwrite protection including symlinked parents, duplicate operations and retry after failure. These are not OS dialog or desktop relaunch verification.
- Desktop service-client and headless integration tests: 15 passed. A real temporary service with fixture provider rejected import during an active turn, exited cleanly on accepted import, then loaded replacement preferences, employees and Manager instructions on fresh startup. Destination local state survived. Client tests prove ownership release is awaited and competing update/import requests are rejected.
- The unread-notification count initially used for queued-work detection was replaced with an explicit pending-work query covering turns/approvals, queued sends, IP checks, held operations, shell commands and background tasks; the failed integration check then passed.
- Full follow-up suite: 118 files passed, one skipped; 1,593 tests passed, one skipped. Typecheck, lint, desktop build and mobile production build passed. The mobile build reports its existing chunk-size warning. Logs: `/private/tmp/geckit-ui-*.log`.
- After rebasing onto current main (`e2b14c8`), the final full suite passed: 119 files, 1,596 tests; one file/test skipped. Typecheck, lint, desktop and mobile builds passed again. Logs: `/private/tmp/geckit-ui-main-*.log`.
- Mermaid state diagram rendered successfully as `/private/tmp/geckit-transfer-states.svg`. The [prototype](../../docs/design/configuration-transfer.html) mounts the real SettingsDialog/CSS with fixture native boundaries. Its HTML and production component are served by Vite; HTTP serving is not renderer verification.

### Performance review

No performance problems found in static review against the full `docs/performance.md` checklist. The change adds one Settings group, event-driven local state and wrapping token-based CSS. It adds no conversation rows, list scans, formatters, pointer handlers, polling or animations; those 11 checklist items are untouched. Phone rebuild passed. Running-renderer review is blocked as described below; no timing or CPU improvement is claimed.

### Remaining verification and delivery

FR-008/009 are implemented and have filesystem/service evidence. FR-010 remains unverified in the running renderer. Required light/dark, focus/keyboard, scrolling, viewport and feedback review could not start: the installed GeckIt CLI rejected `browser start test:geckit-configuration` with **"This conversation is not registered with GeckIt. Open its project in GeckIt before starting a test browser."** The same result occurred from the registered project's main checkout; employee lookup still identifies this Codex conversation. Alex was asked to open the conversation's project and reply ready. No browser ownership/registration restrictions were bypassed.

Actual native OS picker/reveal/relaunch interaction is also unverified; adapters are tested independently and the true service restart/data flow is covered. No real provider account, Telegram connection or SSH credentials were transferred. Cross-artifact review finds one unresolved acceptance gap: FR-010 and the prototype-review portion of T013/T014 require the running renderer. Alex subsequently instructed a direct push to main with this verification gap known. This authorizes delivery without claiming those checks passed. Original storage commit 233293c remains delivered to main; this follow-up does not verify a published release or installed-app update.
