# Tasks: Plugin logs

**Input**: [spec.md](spec.md), [design.md](design.md), [plan.md](plan.md), [contracts/logging.md](contracts/logging.md).

## Foundation

- [x] T001 Specify, design and plan plugin logs in `specs/008-plugin-logs/` and `docs/ux/plugin-logs.md`; preserve concurrent feature selector (FR-001 through FR-007).
- [x] T002 Define public optional context/logger types and writer in `client/src/main/sessions/plugin-logs.ts` and `plugin-api.ts` (FR-001/005/006/007).
- [x] T003 Integrate context and host load/limits events in `client/src/main/sessions/plugins.ts` (FR-002/005).
- [x] T004 Test writer rotation/concurrency/redaction/failure and old/new factories in `client/test/plugin-logs.test.ts`, `plugins.test.ts` (FR-001/002/005/006/007).

## US1: Audit checks

- [x] T005 Instrument actual `/usage`, skips, message counters and outcomes in external `geckit-claude-tmux/src/provider.mjs`; build `index.mjs`, extend `test/tmux.test.mjs` (FR-003/004/006).

## US2: All current plugins

- [x] T006 Instrument `examples/codex-provider/src/provider.mjs`, build entry and extend fake Codex tests (FR-004/005/006).
- [x] T007 Instrument `examples/opencode-provider/src/{provider,transport,driver}.mjs`, build entry and extend fake OpenCode tests (FR-004/005/006).
- [x] T008 Apply verified plugin changes to external source repositories, preserving local edits and rebuilt entries (FR-004).

## Completion

- [x] T009 Document access paths, event semantics and factory context in `docs/provider-plugins.md`, plugin READMEs and embedded provider guide; update approved feature list/audit (FR-001/002/004).
- [x] T010 Run host typecheck/lint/tests, standalone plugin suites and desktop/mobile builds; record exact results and release limits in `specs/008-plugin-logs/verification.md` (FR-001 through FR-007).

## Dependencies

T001 precedes code changes. T002/T003 precede host tests. T005/T006/T007 share agreed contract and can proceed independently of host implementation. T008 follows each plugin's passing tests. T009/T010 finish after integration. Alex subsequently authorized committing and pushing to main. Installation and app restart remain separate from source publication.
