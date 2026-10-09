# Design: Send queued messages now

**Date**: 2026-10-09 | **Spec**: [spec.md](spec.md)
**Status**: Authorized by explicit implementation request for the previously proposed Send now action.

## Scope
US1/US2, FR-001 through FR-007. Existing queued rows on desktop and phone.

## Artifacts
- UX: [send-queued-now](../../docs/ux/send-queued-now.md)
- Existing layout: [conversation queue](../../docs/design/conversation-queue.html)
- Actual-component prototype: [queue-preview.html](../../client/src/renderer/queue-preview.html), [fixture](../../client/src/renderer/src/queue-preview.tsx). Run the renderer Vite server and open `/queue-preview.html?theme=light`; append `&phone` for phone layout.

## Decisions
Use existing queue controls and quiet button tokens. Driver method availability determines capability. Keep original queue entry until accepted. Block concurrent queue changes and preserve focus after row removal. Keep unsupported, idle and approval states unchanged.

## Requirement Coverage
| Requirements | Validation |
| --- | --- |
| FR-001/006 | Desktop/phone supported, unsupported, idle and approval states |
| FR-002/003 | Selected text/images delivered; rejection retains original queue |
| FR-004 | Duplicate click, edit/remove/reorder and completion races |
| FR-005/007 | Built-in/library transport tests and legacy loader compatibility |

## Review Evidence
Reviewed actual Transcript and Composer in full context at desktop 1440x900 and phone 390x844, light/dark, on 2026-10-09. Checked hierarchy, alignment, density, adjacent controls, queue scrolling, keyboard activation, visible focus, pending action locks, retained failure and accepted-message removal. Unsupported, idle, approval and command states omit Send now. A 15-message phone queue scrolls to its final rows without moving the composer. Enlarged the phone Send now target from 33.5px to 44px and rechecked both themes. Failure retains focus on its action; acceptance focuses the neighboring row action. Mermaid state diagram rendered successfully.

Review used actual components with deterministic provider fixtures. Live Codex/Claude services and an installed phone build were not exercised; transport behavior is covered by offline protocol tests.

## Open Decisions
None.

## Planning Handoff
Extend public Driver with optional acknowledged injection; update IPC and phone bridge. Do not infer support solely from provider family. Keep tests offline and preserve native permissions and active settings.
