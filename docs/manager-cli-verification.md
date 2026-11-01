# Manager CLI verification, 2026-11-01

Task session: `codex:01a19882-a044-7561-97ce-4c5d712d1065`. Actual reported model: `gpt-6.1-sol`, reasoning High, confirmed in the GeckIt Local conversation header and the dedicated "Model reported by Codex for this conversation" status. No model switch was performed.

## Implementation boundaries

- [UX](ux/manager-cli-preferences.md), [commands and agreed values](manager-cli-preferences.md).
- Instructions use existing `manager.json` config.instructions, not a separate unused document. The regression captures the complete input to `Sessions`' provider driver on the CLI continuation and after Manager reload, checking both unchanged MANAGER_INSTRUCTIONS and new user preferences.
- Serialized employee rename preserves ID and latest other fields; assignment/memory are referenced by stable ID. No user catalog/settings/sessions file was directly edited.
- Existing session models are untouched. Explicit model selection affects new workers only and has no silent fallback.
- New mutations retain Manager token/session/active-operation checks and require the existing host-bound confirmation. A queued rename rechecks authority inside the serialized write; model selection rechecks after asynchronous lookup.

## Checks

- `npm run typecheck`: passed, all four configurations.
- Scoped eslint for all changed TypeScript files: passed.
- `npm run build`: passed in isolated worktree, no app launched or restarted.
- Focused Manager/employee/guide tests: passed. Subsequent targeted recheck including all 134 Manager tests, store and attachment tests: 163 passed.
- Initial unrestricted full run: 1458 passed, two timing failures (store watcher and many tiny Telegram attachments). Both passed unchanged on targeted recheck. Final `npm test -- --maxWorkers=2`: 1460 passed, 103 files; no timeout or test changes.
- Compiled `out/main/cli.js` executed as a subprocess for all four command forms against a temporary test socket. Literal multiline/Cyrillic values and Manager credentials reached the request unchanged. This proves compiled routing; it does not prove a live user save.
- Authenticated integration uses the real Manager host dispatcher and temporary files with a fake provider. It covers conflict/readback/reload and next-turn context, not live assistant obedience.
- UX state diagram rendered successfully with installed mermaid-cli and a separate headless Chrome process.
- Live official read-only `geckit-local employees current`: assigned engineer ID `967c2fa1-73eb-4e05-be90-8a8173ddccaf`. All employee-memory cursors read. `employees manager --json` returned `{ "name": "Manager", "instructions": "", "avatar": "employee-05" }` before application. No write was sent.

## Delivery and remaining verification

The task uses `/private/tmp/geckit-manager-cli`, branch `fix/manager-cli-preferences`. Parent `8bda76f` is an explicitly local snapshot of the existing uncommitted `feat/employees` work, for compilation and testing only. It includes other sessions' work and must not be published as this task. The separate task diff/commit contains only this CLI change and documentation; it must be applied after the employee foundation is committed/integrated. No standalone PR can compile against current committed main without that foundation. PR #48 addresses a separate tmux-origin change; it is not a substitute for the uncommitted employees foundation.

Do not deploy this local snapshot. No GeckIt restart, active-session restart, iPhone install, live Manager policy change or employee rename was performed. After integrating the foundation and task commit, safely load the backend only with separate authorization that protects active work. Manager then runs fresh capabilities/reads, obtains existing write confirmations and verifies every agreed value through CLI readback. Live model recall, actual post-restart Manager behavior and applying the four names remain unverified. User values are not saved merely because fixtures pass.
