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

## Reconciliation with delivered employee foundation, 2026-11-02

Fetched remote `main` is `4939bd0fdf7d42fd5d8932195563e90a4a323903`. The shared checkout is clean at `feat/employees=fedd10e8914b063ce1c7a92ece976eeecb379dfa`. The employee foundation is now committed; the old dependency blocker is resolved.

The 12-file task patch from `fdaa02d7978832a629413245fffb9e6240031829` was absent from that main and applies unchanged on top of it as `05ea3d80b156ad7fda0f6d6259264b3500f8f926`. Both stable patch IDs are `6b9d8f3e5e62d3fb17a538de8acfd2c2b6a4cef8`. No snapshot parent, employee foundation commit, phone fix or unrelated parallel work was copied into the task branch.

Revalidation on the new main: all four typecheck configurations, scoped eslint, isolated production build and 483 tests across seven Manager/employee/Codex/Sessions suites passed. The earlier 1461-test full integration run was on the old local snapshot plus main, not the new delivered foundation; it is historical evidence only. Test logs and the comparison manifest are preserved outside task worktrees under `/private/tmp/geckit-manager-cli-delivery/`.

The parallel delivery worker subsequently pushed `15b57de1f72c46c9623286d3e242e62940aa2003` to remote main during this task's PR cleanup. A fresh fetch and remote read confirmed it. All 12 task files are byte-identical to `fdaa02d`, and the delivered commit's stable patch ID is also `6b9d8f3e5e62d3fb17a538de8acfd2c2b6a4cef8`: the CLI is completely delivered. The initially created PR #49 was reconciled with this main and contained only this updated verification record, without duplicate code. Alex then authorized final delivery directly to main; this remaining record is delivered that way and the redundant PR is closed after remote verification. Its `geckit-manager-deliver` worktree belongs to the parallel session and is left intact; this task's temporary worktrees are cleaned after remote verification, with local branches and useful artifacts retained.

## Running host and remaining verification

On 2026-11-02 the official live `geckit-local employees current` returned this same engineer assignment and the unchanged name `Senior Software Engineer`; `employees manager --json` returned empty instructions and portrait `employee-05`. These are real read-only host responses. The current source-copy `client/out/main/index.js` and `cli.js` do not contain the new expected-value flags or the advertised model option. This is bundle inspection, not an authenticated live Manager capabilities response. This worker has no current Manager credentials; no credentials were borrowed and no Manager action was sent. Availability of the new capabilities in the running Manager is not verified and must not be inferred from source commits, a Publish run or these fixture tests.

The CLI patch is already in main. Load a build containing it into the source copy used by `/Users/alex/.geckit/bin/geckit-local`. There is no supported in-place replacement of the already-running main process. The minimum runtime step is a separately authorized safe rebuild/restart of GeckIt Local when active work is protected; rebuilding a different worktree or reloading only the renderer is insufficient. Do not restart active workers or install an iPhone build as part of this task. After loading, Manager itself must run `capabilities`, confirm the three guarded command forms and `sessions start --model`, then perform fresh reads, approved writes and readbacks from [the command recipe](manager-cli-preferences.md).

No application/session restart, iPhone install, live Manager policy write or employee rename was performed. User values are not saved. Live model recall and actual post-restart behavior remain unverified. The original local-only snapshot `8bda76f` is not part of delivery.
