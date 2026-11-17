# Tasks: Channel contract v2

**Input**: [spec.md](spec.md), [plan.md](plan.md)

## Phase 1: Contract and host

- [x] T001 Abilities and grants in `shared/channels.ts`; manifest v2 parsing in `main/channels/libraries.ts` (v1 default, unknown version and unknown ability refused)
- [x] T002 Contract v2 types in `main/channels/channel-api.ts`
- [x] T003 `Channels`: grants (defaults per FR-016, FR-017), context parts by ability, refusal naming the ability, built-in modules from deps, migration hook, `channels:request` and `channels:view`
- [x] T004 Tests: v1 example unchanged, every ungranted ability refused, grant change restarts (`test/channels.test.ts`)

## Phase 2: Manager generic

- [x] T005 Shared threads flag replaces `teamThread`; `SHARED_QUEUE_LIMIT`
- [x] T006 Renames: channel replies, pending requests, working, request source; stored-record fallbacks
- [x] T007 Source `'telegram'` merged into `'channel'`; `[Via …]` parsing in `manager-said.ts`
- [x] T008 `renameChannel` with record copy; CLI `telegram send-file` removed; `plainText`
- [x] T009 Update `test/manager.test.ts` for the new names; add a renameChannel test

## Phase 3: Telegram on the contract (US1)

- [x] T010 `main/channels/telegram.ts`: module, adapter, wiring moved from `core/runtime.ts`
- [x] T011 Migration: setting, thread rename, notes key
- [x] T012 Runtime and application: remove `ManagerTelegram`; `channels:request`; generic phone calls without aliases; desktop renderer API over channels
- [x] T013 Saved-record migration and public-context adapter tests: private threads, sends, answers, pause/resume, decision notices, reviews, verified team readiness and durable delivery; reply behavior also covered by existing Telegram and Channels suites

## Phase 4: Slack and Discord (US5)

- [x] T014 Slack and Discord on v2 info
- [x] T015 Discord native reply routing with stored references; test

## Phase 5: Settings and docs (US3)

- [x] T016 `docs/ux/channels.md`: ability rows; `ui/Channels.tsx`: list and toggles
- [x] T017 `docs/channel-libraries.md` v2, `CLAUDE.md`, `docs/channel-contract.md` corrected
- [x] T018 Run lint, typecheck, tests, build and browser renderer checks; results and limits in [verification report](../../docs/reports/channel-contract-v2-verification.md). Full suite retains one unrelated pre-existing recurrence failure; live integrations and native app not exercised.
- [x] T019 Remove channel-specific Settings/Manager UI and phone endpoints; implement declarative library settings and safe published views.
- [x] T020 Run migration hooks for installed modules; move legacy Manager field conversion into module restore hook; prove all three modules bundle without host implementations.
