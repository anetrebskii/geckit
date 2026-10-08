# Tasks: Assistant status

## Setup
- [X] T001 Write specification, UX and design handoff in specs/004-assistant-status/ and docs/ux/assistant-status.md.

## Foundation
- [X] T002 Reuse typed provider/account/usage data with independent snapshots in client/src/renderer/src/chat/AssistantStatus.tsx.

## US1 - Desktop
- [X] T003 [US1] Implement compact overview and full details in client/src/renderer/src/chat/AssistantStatus.tsx and integrate client/src/renderer/src/chat/Status.tsx.
- [X] T004 [US1] Add scoped themed/responsive footer and details rules in client/src/renderer/src/styles.css.

## US2 - Phone
- [X] T005 [US2] Replace footer prose with shared disclosure/sheet in client/src/renderer/src/chat/PhoneBoard.tsx.

## Validation
- [X] T006 Mount actual components in client/src/renderer/assistant-status-preview.html and client/src/renderer/src/assistant-status-preview.tsx with desktop/phone board fixtures.
- [X] T007 Run typecheck/lint/tests and desktop/mobile builds; record results in specs/004-assistant-status/quickstart.md.
- [X] T008 Inspect full context, themes, keyboard/focus/scrolling and perform performance review; record evidence in specs/004-assistant-status/design.md.

## Dependencies
T001 -> T002 -> T003/T004 -> T005 -> T006 -> T007/T008. Desktop summary/details independently validates US1; phone entry/sheet independently validates US2. Implementation precedes fixture review, then fixes return to UX/design if behavior changes. Validation artifacts can be prepared independently; one agent owns TypeScript implementation to avoid shared CSS conflicts.
