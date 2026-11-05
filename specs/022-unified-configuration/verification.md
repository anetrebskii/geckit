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
