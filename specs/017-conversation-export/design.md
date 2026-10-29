# Design: Conversation export and continuation

**Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)
**Status**: Approved scope from "Супер. Сделай это"; routine layout follows existing GeckIt dialogs.

## Scope

US1 exports an inspectable portable snapshot. US2 continues from the desktop composer action group/phone menu into another assistant/model. Source work stays intact.

## Artifacts

- UX: [conversation-export.md](../../docs/ux/conversation-export.md)
- Interactive layout: [conversation-export.html](../../docs/design/conversation-export.html)

## Decisions

Single dialog, assistant then model, optional next instruction. Create is primary; export is independent secondary. Reuse existing dialog, form, menu, phone and token patterns. Deterministic overview explicitly labelled. Full normalized transcript retained; remote upload must produce host-readable reference.

Follow-up, 2026-10-29: "Copy without sending" is now primary and prepares a persistent destination/context draft with no source/destination send or queued work. Previous immediate behavior remains explicitly labelled "Create and send". Draft and target/model survive close/reopen/restart, and only explicit Send starts work. Preserve the revised UX wording and narrow-screen action wrapping. This change is authorized by "Следом, сделай возможность копирования без отправки сообщения в чат".

Placement correction, 2026-10-29: Alex's marked screenshot moves the desktop entry from the header into the right edge of the composer, beside microphone and Send. Reuse an icon button with the branch icon, tooltip and accessible name "Continue with another model". Keep the phone menu entry and dialog behavior.

Dialog correction, 2026-10-29: shorten the introductory copy, reduce the optional instruction's initial height and split the footer by purpose. Export and immediate sending are quiet utility actions; Cancel and the primary Copy without sending stay together in the final row. Reuse GeckIt's dialog, fields, button tokens and focus language. Verify full-screen light/dark desktop/phone layout, narrow action rows, error/path wrapping, keyboard/focus and actual action outcomes before accepting the UI.

## Requirement Coverage

| Requirements | Decision | Validation |
| --- | --- | --- |
| FR-001/004/009 | Shared dialog, desktop/phone entry | Light/dark desktop/phone interaction review |
| FR-002/003/008 | Complete available Markdown snapshot | Inspect real output including tools/images/fences |
| FR-005/006 | Historical-data prompt, no inherited goal | Inspect destination request and unchanged source |
| FR-007 | Pending lock, retained choices, no false success | Cancel/failure/retry/duplicate tests |
| FR-010/011/012 | Prepared unsent destination and distinct send action | Zero sends/queue/driver startup, restart/reopen and explicit first send |

## Review Evidence

Prototype and implemented screen review unavailable: Computer Use denied access to the current Chrome URL and subsequent browser inventory reported an unavailable browser host; see verification.md. UX Mermaid rendered successfully. Targets: 1440x900 desktop and 390x844 phone, both themes, focus, keyboard and scrolling. No per-row export work or streaming-time formatting.

## Open Decisions

None. Report upstream history/attachment availability limits explicitly.

## Planning Handoff

Read linked UX and prototype; preserve user-approved format and source. Main owns files and remote upload; preload/phone expose typed contract. Use actual components in browser harness and native integration tests. Do not restart active app sessions. No release/deployment requested.
