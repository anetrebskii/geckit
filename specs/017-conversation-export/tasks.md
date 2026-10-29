# Tasks: Conversation export and continuation

Input: [spec](spec.md), [plan](plan.md), [design](design.md), linked UX/prototype, research, data model and contracts.

## Phase 1: Setup

- [x] T001 Read source contracts, UX patterns and ignore configuration in `client/src/shared/api.ts`, `docs/performance.md`, `.gitignore`.
- [x] T002 Create approved-scope UX and design handoff in `docs/ux/conversation-export.md`, `docs/design/conversation-export.html`, `specs/017-conversation-export/design.md`.

## Phase 2: Foundation

- [x] T003 Define derived snapshot/export/continuation contracts in `client/src/shared/api.ts` and `client/src/shared/conversation-export.ts`.

## Phase 3: US1 - Portable export (P1, MVP)

Goal: inspect complete available transcript independently of starting a chat.
Independent check: inspect actual saved UTF-8 Markdown with all normalized item kinds and images/references.

- [x] T004 [US1] Implement safe untruncated Markdown formatter with metadata and bounded labelled overview in `client/src/shared/conversation-export.ts`.
- [x] T005 [US1] Read full source snapshot and write persistent file in `client/src/main/sessions/index.ts` and `client/src/main/conversation-export.ts`.
- [x] T006 [US1] Wire independent export through `client/src/main/index.ts`, `client/src/preload/index.ts`, `client/src/renderer/src/phone.ts` and `client/src/renderer/src/chat/ConversationTransfer.tsx`.

## Phase 4: US2 - Continue with another model (P1)

Goal: select target and continue using context overview plus readable file reference.
Independent check: inspect destination request for chosen same/cross provider/model and unchanged source work.

- [x] T007 [US2] Build no-replay continuation prompt, enforce enabled/host-compatible target and SSH-readable upload before existing send in `client/src/main/conversation-export.ts` and `client/src/main/index.ts`.
- [x] T008 [US2] Add dialog with provider/model/instruction controls, pending/failure/retry and desktop/phone entry points in `client/src/renderer/src/chat/ConversationTransfer.tsx`, `Chat.tsx`, `PhoneNav.tsx`, `client/src/renderer/src/styles.css`.
- [x] T009 [P] [US2] Mount actual Chat/preload with explicit synthetic native boundaries in `client/test/browser/conversation-export/`.

## Phase 5: Verification and completion

- [x] T010 Verify formatter, real disk persistence, provider request and source-preservation regressions in `client/test/conversation-export.test.ts` and relevant Sessions tests.
- [ ] T011 Review prototype and actual UI interactions in light/dark desktop/phone, focus/keyboard/scroll, failure/retry and pending lock; record actual evidence in `specs/017-conversation-export/verification.md`.
- [x] T012 Run client typecheck/lint/tests/build and phone build; complete `docs/performance.md` review in `specs/017-conversation-export/verification.md`.
- [x] T013 Update approved feature entry/evidence in `docs/features.md`, `docs/feature-audit.md` and day-plan status.

## Dependencies and parallel examples

T001 -> T002 -> T003 -> US1 (T004-T006) -> US2 (T007-T008). T009 browser fixture can proceed separately after T003 interface is agreed; it owns only fixture files. For US1 formatter and file-writer edits stay sequential in one worker. US2 fixture and app wiring can run in parallel with separate file ownership. T010-T013 follow integration; review failures return to their owning task.

## Implementation strategy

Deliver inspectable export first, then continuation and UI, then verify both independently. Complete both requested stories; no deployment, release or live model inference required. Tests follow recorded-output constitution and focus on observable export/request behavior. Existing ignore rules apply; no new tooling/package is published.

T011 partial: actual renderer reviewed in Safari on desktop/phone in light/dark, including focus, text scrolling, copy/persistence/explicit Send, export error/retry and pending lock. Standalone prototype desktop reviewed. Remaining prototype phone, unavailable catalog, explicit creation/send error/retry and backdrop checks blocked after Safari window disappeared (`cgWindowNotFound`); see verification.md.

## Follow-up: US3 - Copy without sending

Independent check: copy without a source message; persistent new destination and prepared context with zero send/start/queue; close/reopen/restart, then explicitly send edited first message once.

- [x] T014 [US3] Update approved follow-up behavior and labels in `docs/ux/conversation-export.md` and `specs/017-conversation-export/{spec,design,plan}.md`.
- [x] T015 [US3] Add durable prepared-copy contract and state using existing dormant sessions in `client/src/shared/api.ts`, `client/src/main/sessions/index.ts` and note persistence modules as needed.
- [x] T016 [US3] Share file/context preparation and add no-send copy wiring in `client/src/main/conversation-export.ts`, `client/src/main/index.ts`, `client/src/preload/index.ts`, `client/src/renderer/src/phone.ts`.
- [x] T017 [US3] Open prepared copy with editable persistent context draft and chosen provider/model; update actions in `client/src/renderer/src/chat/ConversationTransfer.tsx`, `useChat.ts` and existing draft contract modules as needed.
- [x] T018 [US3] Verify no send/start/queue, persistence/reopen/restart, edited first send exactly once and source preservation in `client/test/conversation-export.test.ts`, `sessions.test.ts`, phone/renderer tests as needed.
- [x] T019 Update browser fixture/prototype for no-send copy, run proportional checks and record remaining browser-access limitation in `specs/017-conversation-export/verification.md`.
- [x] T020 Expand approved feature entry/audit and update day-plan follow-up record in `docs/features.md`, `docs/feature-audit.md` and current day plan.

Dependencies: T014 -> T015 -> T016 -> T017 -> T018-T020. Existing native queue fork remains unchanged. Browser fixture may follow final shared contract in separate owned files. No new Spec Kit feature is needed: this extends US2 with separately testable US3.

Requested integration follow-up: real local builtin Codex passed, including zero native work before explicit Send, file-read canary proof and a second unsent copy of actual native history without another inference. Browser review has actual Safari evidence with specific remaining checks blocked after its window disappeared (T011); SSH verification awaits a host/test folder because neither settings file contains configured hosts. See verification.md for boundaries and artifacts.
